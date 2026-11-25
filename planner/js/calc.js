(function () {
  "use strict";

  const KP = window.KP;
  const rules = KP.classes.rules;

  const STATS = ["strength", "agility", "stamina", "intellect", "spirit"];
  const STAT_BITS = [["strength", 1], ["agility", 2], ["stamina", 4], ["intellect", 8], ["spirit", 16]];
  const BASE_AP = { WARRIOR: [3, -20], PALADIN: [3, -20], HUNTER: [2, -20], ROGUE: [2, -20], SHAMAN: [2, -20],
    DRUID: [0, -20], PRIEST: [0, -10], MAGE: [0, -10], WARLOCK: [0, -10] };
  const BASE_RAP = { HUNTER: [2, -10], WARRIOR: [1, -20], ROGUE: [1, -10] };
  const FORMS = {
    cat: { name: "Cat Form", apPerLevel: 2, apPerAgi: 1, speed: 1.0, armorPct: 0, health: 0 },
    bear: { name: "Bear Form", apPerLevel: 3, apPerAgi: 0, speed: 2.5, armorPct: 180, health: 20 },
    dire: { name: "Dire Bear Form", apPerLevel: 3, apPerAgi: 0, speed: 2.5, armorPct: 360, health: 600 },
  };
  const NORMAL_SPEED = { dagger: 1.7, oneHand: 2.4, twoHand: 3.3, ranged: 2.8 };
  const MELEE_MISS = [5, 5.5, 6, 8];
  const MELEE_PARRY = [5, 5.5, 6, 14];
  const DUAL_WIELD_MISS = 19;
  const SPELL_MISS = [4, 5, 6, 17];
  const GLANCE_CHANCE = [10, 20, 30, 40];
  const GLANCE_DAMAGE = [0.95, 0.95, 0.85, 0.65];
  const RACE_BASE = {
    Human: [20, 20, 20, 20, 20], Orc: [23, 17, 22, 17, 23], Dwarf: [22, 16, 23, 19, 19],
    "Night Elf": [17, 25, 19, 20, 20], Undead: [19, 18, 21, 18, 25], Tauren: [25, 15, 22, 15, 22],
    Gnome: [15, 23, 19, 24, 20], Troll: [21, 22, 21, 16, 21],
    "High Order Skyborne": [17, 22, 18, 24, 19], "Windshaper Skyborne": [18, 22, 19, 21, 20],
  };
  const CLASS_GAIN = {
    WARRIOR: [100, 60, 90, 10, 27], PALADIN: [85, 50, 80, 45, 50], HUNTER: [37, 105, 67, 40, 45],
    ROGUE: [60, 110, 55, 15, 30], PRIEST: [15, 20, 30, 100, 105], SHAMAN: [75, 40, 85, 65, 75],
    MAGE: [10, 15, 25, 105, 100], WARLOCK: [25, 30, 55, 90, 95], DRUID: [50, 35, 50, 75, 85],
  };
  const AGI_PER_CRIT = { WARRIOR: 20, PALADIN: 20, HUNTER: 53, ROGUE: 29, SHAMAN: 20, DRUID: 20, PRIEST: 20, MAGE: 20, WARLOCK: 20 };
  const BASE_CRIT = { WARRIOR: 0, PALADIN: 0.7, HUNTER: 0, ROGUE: 0, SHAMAN: 1.7, DRUID: 0.9, PRIEST: 3, MAGE: 3.2, WARLOCK: 2 };
  const INT_PER_SPELL_CRIT = { MAGE: 59.5, PRIEST: 59.2, WARLOCK: 60.6, DRUID: 60, SHAMAN: 59.2, PALADIN: 54 };
  const BASE_SPELL_CRIT = { MAGE: 0.2, PRIEST: 0.8, WARLOCK: 1.7, DRUID: 1.8, SHAMAN: 2.3, PALADIN: 0 };
  const BASE_AVOID = { WARRIOR: { parry: 5, parryFrom: 6, block: 5 } };
  const perLevel = (at60, level) => at60 * Math.max(10, level) / 60;

  function estimateBase(cls, race, level) {
    const r = RACE_BASE[race] || RACE_BASE.Human;
    const own = classShare(cls, level);
    const out = {};
    STATS.forEach((k, i) => { out[k] = Math.round(r[i] + own[i]); });
    return out;
  }

  function byLevel(points, level, at60, below) {
    const levels = Object.keys(points).map(Number).sort((a, b) => a - b);
    const first = levels[0], last = levels[levels.length - 1];
    const between = (a, va, b, vb) => va + ((vb - va) * (level - a)) / (b - a);
    if (level < first) return below(first);
    if (level >= last) return level === last ? points[last] : between(last, points[last], 60, at60);
    const b = levels.find((L) => L >= level);
    const a = levels[levels.indexOf(b) - 1];
    return b === level ? points[b] : between(a, points[a], b, points[b]);
  }
  function classShare(cls, level) {
    const gain = CLASS_GAIN[cls] || [0, 0, 0, 0, 0];
    const m = KP.measured.classBase[cls];
    if (!m) return gain.map((g) => (g * (level - 1)) / 59);
    const race = RACE_BASE[m.race];
    return gain.map((g, i) => {
      const points = Object.fromEntries(Object.entries(m.levels).map(([L, v]) => [L, v[i] - race[i]]));
      return byLevel(points, level, g, (first) => (points[first] * (level - 1)) / (first - 1));
    });
  }
  function agiPerCrit(cls, level) {
    const at60 = AGI_PER_CRIT[cls] || 20;
    const m = KP.measured.agiPerCrit[cls];
    return m ? byLevel(m, level, at60, (first) => m[first]) : perLevel(at60, level);
  }

  const AP_DUMMY = { Bloodthirst: 1, "Victory Rush": 2 };
  const WEAPON_DPS_DUMMY = { "Hammer of the Righteous": 2 };
  const COMBO_POINTS = 5;
  const SINGLE_TARGET = [6, 25, 77];
  const LONGER_PER_POINT = { Rupture: 2000 };
  const FINISHER_AP_PER_POINT = { Eviscerate: 0.03, "Ferocious Bite": 0.0375 };
  const POISON_CHANCE = 20;
  const RANGED_SUBCLASSES = (1 << 2) | (1 << 3) | (1 << 16) | (1 << 18) | (1 << 19);

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const overlap = (a, b) => a.some((v, k) => (v & b[k]) !== 0);

  const wearableFrom = (it) => (it.req > 1 ? it.req : Math.min(60, Math.max(1, it.ilvl - 5)));
  const wearableTogether = (a, b) => !(a && b && a.id === b.id && a.unique);

  function gearAuras(ctx) {
    const list = [];
    const sets = {};
    for (const w of ctx.worn) {
      for (const e of w.item.effects || []) for (const a of e.auras || []) list.push({ ...a, name: w.item.name });
      for (const e of w.item.effects || []) {
        if (!e.useAuras || !(e.durMs > 0) || !(e.cdMs > 0) || e.charges) continue;
        const share = cooldownShare(ctx, e.durMs, e.cdMs);
        for (const a of e.useAuras) list.push({ ...a, value: a.value * share, name: `${w.item.name} (Use, averaged)` });
      }
      if (w.item.set) sets[w.item.set] = (sets[w.item.set] || 0) + 1;
    }
    const allSets = (KP.items && KP.items.sets) || {};
    for (const [id, count] of Object.entries(sets)) {
      const set = allSets[id];
      if (!set) continue;
      for (const b of set.bonuses) {
        if (count >= b.pieces) for (const a of b.auras || []) list.push({ ...a, name: `${set.name} (${b.pieces})` });
      }
    }
    return list;
  }

  const WEAPON_TALENTS = {
    "Weaponmaster": [{ kind: "crit", effect: 0, subclasses: [0, 1, 6] }, { kind: "armor", effect: 1, subclasses: [4, 5, 10] },
      { kind: "extra", effect: 2, subclasses: [7, 8] }],
    "Hack and Slash": [{ kind: "crit", effect: 0, subclasses: [13, 15] }, { kind: "armor", effect: 1, subclasses: [4] },
      { kind: "extra", effect: 2, subclasses: [0, 7] }],
  };

  const STANCE_FORM = { battle: 17, defensive: 18, berserker: 19 };
  const DRUID_FORM = { cat: 1, bear: 5, dire: 8 };
  const FORM_NAMES = { 1: "Cat Form", 5: "Bear Form", 8: "Dire Bear Form", 31: "Moonkin Form", 17: "Battle Stance",
    18: "Defensive Stance", 19: "Berserker Stance", 28: "Shadowform", 30: "Stealth", 2: "Tree of Life", 32: "Spirit of Redemption" };
  const inMask = (mask, form) => !!form && ((mask >>> (form - 1)) & 1) === 1;
  const maskNames = (mask) => Object.keys(FORM_NAMES).map(Number).filter((f) => inMask(mask, f)).map((f) => FORM_NAMES[f]);
  function warriorStance(ctx) {
    if (ctx.stance) return ctx.stance;
    const pts = [0, 0, 0], learned = new Set();
    ctx.flat.forEach((t, i) => { if (ctx.ranks[i]) { pts[t.tree] += ctx.ranks[i]; learned.add(t.name); } });
    const [arms, fury, prot] = pts;
    const spec = learned.has("Shield Slam") || (prot > arms && prot > fury) ? "prot"
      : learned.has("Mortal Strike") || (arms >= fury && arms > 0) ? "arms" : learned.has("Bloodthirst") || fury > 0 ? "fury" : "arms";
    const tank = ctx.tank != null ? ctx.tank : spec === "prot";
    if (tank && bookRank("WARRIOR", "Defensive Stance", ctx.level)) return "defensive";
    if (spec === "fury" && bookRank("WARRIOR", "Berserker Stance", ctx.level)) return "berserker";
    return "battle";
  }

  function shapeOf(ctx) {
    const tok = ctx.cls.token;
    if (tok === "WARRIOR") return STANCE_FORM[warriorStance(ctx)];
    if (tok === "DRUID") {
      if (ctx.form === "moonkin") return 31;
      const f = druidForm(ctx);
      if (f) return DRUID_FORM[f];
      return ctx.form === undefined && learnedTalent(ctx, "Moonkin Form") ? 31 : null;
    }
    if (tok === "PRIEST") return (ctx.shadowform != null ? ctx.shadowform : learnedTalent(ctx, "Shadowform")) ? 28 : null;
    return undefined;
  }
  function stanceLock(ctx, ab, rank) {
    const book = (((KP.spellbook || {})[ctx.cls.token] || []).find((b) => b.name === ab.name)) || {};
    const tok = ctx.cls.token;
    if (tok === "WARRIOR" && ctx.stance && book.stances && !inMask(book.stances, STANCE_FORM[ctx.stance])) {
      return "Needs " + maskNames(book.stances).filter((n) => /Stance/.test(n)).join(" or ");
    }
    if (tok === "ROGUE" && ctx.stealth === false && book.stealthOnly) return "Needs Stealth";
    if (tok === "DRUID") {
      if (ctx.prowl === false && book.stealthOnly) return "Needs Prowl";
      const f = ctx.form === "moonkin" ? 31 : (ctx.form === "cat" || ctx.form === "bear") ? DRUID_FORM[druidForm(ctx)] : null;
      if (f && rank.powerType === 0 && !inMask(book.stances || 0, f)) return `Not in ${FORM_NAMES[f]}`;
    }
    if (tok === "PRIEST" && ctx.shadowform === true && book.notIn && inMask(book.notIn, 28)) return "Not in Shadowform";
    return null;
  }
  function stanceEffects(ctx, out) {
    if (ctx.cls.token !== "WARRIOR") return;
    const st = (((KP.abilities.STANCES || {}).WARRIOR) || []).find((s) => s.form === STANCE_FORM[warriorStance(ctx)]);
    if (!st) return;
    const parts = [];
    for (const a of st.auras || []) {
      if (a.aura === 290 || a.aura === 52) { out.crit += a.value; if (a.aura === 290) out.spellCrit += a.value; parts.push(`+${a.value}% crit`); }
      if (a.aura === 79 && a.value) { out.dmgPct.push({ school: a.misc, value: a.value, name: st.name }); parts.push(`${a.value > 0 ? "+" : ""}${a.value}% damage`); }
      if (a.aura === 87 && a.misc & 1 && a.value) { out.damageTaken += a.value; parts.push(`${a.value > 0 ? "+" : ""}${a.value}% damage taken`); }
      if (a.aura === 166 && a.value) { out.apPct += a.value; parts.push(`+${a.value}% attack power`); }
      if (a.aura === 10 && a.value) parts.push(`${a.value > 0 ? "+" : ""}${a.value}% threat`);
    }
    out.lines.push({ name: st.name, text: (parts.join(", ") || "no change to your numbers") +
      (ctx.stance ? "" : ". Your main stance; the Abilities tab can switch it") });
  }

  function talentEffects(ctx) {
    const shape = shapeOf(ctx);
    const out = {
      crit: 0, hit: 0, spellHit: 0, spellCrit: 0, dodge: 0, parry: 0, block: 0, defense: 0, armorPct: 0,
      statPct: { strength: 0, agility: 0, stamina: 0, intellect: 0, spirit: 0 },
      mods: [],
      dmgPct: [],
      threatPct: [],
      rangedPct: [],
      offhandHit: 0,
      upkeep: [],
      healCrit: [],
      costSchool: [],
      damageTaken: 0,
      offhandPct: 0, armorIgnore: 0, extraAttack: 0,
      healthPct: 0, powerPct: 0, apPct: 0, rapPct: 0, spPct: 0, meleeHaste: 0, rangedHaste: 0, castHaste: 0,
      lines: [],
      racials: [],
    };
    const weapons = ctx.worn.filter((w) => w.item.class === 2);
    const weaponMask = weapons.reduce((m, w) => m | (1 << w.item.subclass), 0);
    const armorMask = ctx.worn.filter((w) => w.item.class === 4).reduce((m, w) => m | (1 << w.item.subclass), 0);
    ctx.flat.forEach((t, i) => {
      const r = ctx.ranks[i];
      if (!r) return;
      if (t.needs) {
        const have = t.needs.class === 2 ? weaponMask : armorMask;
        const offHandOk = !(t.needs.invTypes & (1 << 22)) || ctx.worn.some((w) => w.slot === "offHand" && w.item.class === 2);
        if (!(have & t.needs.subclassMask) || !offHandOk) {
          out.lines.push({ name: t.name, text: "needs a matching weapon or shield", off: true });
          return;
        }
      }
      let share = 1, how = "";
      if (!t.passive && t.ranks.length === 1) {
        const self = (t.effects[0] || []).filter((e) => e.effect === 6 && e.target === 1);
        const book = bookRank(ctx.cls.token, t.name, ctx.level);
        const formAura = self.find((e) => e.aura === 36);
        if (formAura && shape !== undefined && formAura.misc && shape !== formAura.misc) {
          out.lines.push({ name: t.name, text: "not counted: you're not in it", off: true });
          return;
        }
        if (formAura) how = " (a form you stay in)";
        else if (book && book.durMs > 0 && book.cdMs > 0 && book.durMs >= book.cdMs) how = " (kept up)";
        else if (book && book.durMs > 0 && book.cdMs >= 60000) {
          share = cooldownShare(ctx, book.durMs, book.cdMs);
          how = averagedText(ctx, book.durMs, book.cdMs, share);
        } else return;
        const parts = [];
        for (const e of self) {
          const v = e.value * share;
          if (e.aura === 79) { out.dmgPct.push({ school: e.misc, value: v, name: t.name }); parts.push(`+${Math.round(v * 10) / 10}% damage`); }
          if (e.aura === 72) { out.costSchool.push({ school: e.misc, value: v }); parts.push(`${Math.round(v)}% mana cost`); }
          if (e.aura === 51 && share === 1) { out.block += v; parts.push(`+${v}% block`); }
          if (e.aura === 87 && e.misc & 1) { out.damageTaken += v; parts.push(`${Math.round(v * 10) / 10}% physical damage taken`); }
          if ((e.aura === 107 || e.aura === 108) && e.mask && e.mask.some((m) => m)) {
            out.mods.push({ op: e.misc, pct: e.aura === 108, value: v, mask: e.mask, name: t.name });
            if (e.misc === 0) parts.push(`+${Math.round(v * 10) / 10}% damage to its spells`);
            if (e.misc === 15) parts.push(`+${Math.round(v)}% crit damage`);
          }
        }
        const extra = t.name === "Ice Barrier" && /increasing your Frost damage by (\d+)% for/.exec(t.desc[0] || "");
        if (extra) { out.dmgPct.push({ school: 16, value: +extra[1], name: t.name }); parts.push(`+${extra[1]}% Frost damage`); }
        if (parts.length) out.lines.push({ name: t.name, text: [...new Set(parts)].join(", ") + how });
        return;
      }
      if (shape !== undefined && ((t.forms && !inMask(t.forms, shape)) || (t.notIn && inMask(t.notIn, shape)))) {
        out.lines.push({ name: t.name, text: t.forms ? `only in ${maskNames(t.forms).join(", ")}` : `not in ${maskNames(t.notIn).join(", ")}`, off: true });
        return;
      }
      const parts = [];
      const rangedOnly = t.needs && t.needs.class === 2 && !(t.needs.subclassMask & ~RANGED_SUBCLASSES);
      const offHandOnly = t.needs && t.needs.invTypes & (1 << 22);
      for (const e of t.effects[r - 1] || []) {
        if (e.effect !== 6) continue;
        const v = e.value;
        if (rangedOnly && e.aura === 79) {
          out.rangedPct.push({ mask: t.needs.subclassMask, value: v, name: t.name });
          parts.push(`+${v}% damage with ${t.needs.subclassMask === 1 << 19 ? "your wand" : "your ranged weapon"}`);
          continue;
        }
        if (offHandOnly && e.aura === 54) { out.offhandHit += v; parts.push(`+${v}% off-hand hit`); continue; }
        switch (e.aura) {
          case 52: out.crit += v; parts.push(`+${v}% crit`); break;
          case 290: out.crit += v; out.spellCrit += v; parts.push(`+${v}% crit`); break;
          case 57: out.spellCrit += v; parts.push(`+${v}% spell crit`); break;
          case 54: out.hit += v; parts.push(`+${v}% hit`); break;
          case 55: out.spellHit += v; parts.push(`+${v}% spell hit`); break;
          case 47: out.parry += v; parts.push(`+${v}% parry`); break;
          case 49: out.dodge += v; parts.push(`+${v}% dodge`); break;
          case 51: out.block += v; parts.push(`+${v}% block`); break;
          case 30: if (e.misc === 95) { out.defense += v; parts.push(`+${v} defense`); } break;
          case 142: if (e.misc & 1) { out.armorPct += v; parts.push(`+${v}% armor from items`); } break;
          case 137:
            for (const [stat, bit] of STAT_BITS) {
              if (e.misc === -1 || e.misc2 & bit) { out.statPct[stat] += v; parts.push(`+${v}% ${stat}`); }
            }
            break;
          case 79: out.dmgPct.push({ school: e.misc, value: v, name: t.name }); parts.push(`+${v}% damage`); break;
          case 10: out.threatPct.push({ school: e.misc, value: v, name: t.name }); parts.push(`${v > 0 ? "+" : ""}${v}% threat`); break;
          case 87: if (e.misc & 1) { out.damageTaken += v; parts.push(`${v}% physical damage taken`); } break;
          case 50: out.healCrit.push({ school: e.misc, value: v }); parts.push(`+${v}% critical healing bonus`); break;
          case 122: out.offhandPct += v; parts.push(`+${v}% off-hand damage`); break;
          case 280: out.armorIgnore += v; parts.push(`ignores ${v}% armor`); break;
          case 107: case 108:
            if (e.mask && e.mask.some((m) => m)) {
              out.mods.push({ op: e.misc, pct: e.aura === 108, value: v, mask: e.mask, name: t.name });
            }
            break;
        }
      }
      if (parts.length) out.lines.push({ name: t.name, text: [...new Set(parts)].join(", ") });
      const wt = WEAPON_TALENTS[t.name];
      if (wt) {
        const mh = ctx.worn.find((w) => w.slot === "mainHand" && w.item.class === 2);
        const vals = (t.effects[r - 1] || []).map((e) => e.value);
        const pick = mh && wt.find((x) => x.subclasses.includes(mh.item.subclass));
        if (!pick) {
          out.lines.push({ name: t.name, text: "no bonus with this main-hand weapon", off: true });
        } else {
          const v = vals[pick.effect] || 0;
          if (pick.kind === "crit") { out.crit += v; out.lines.push({ name: t.name, text: `+${v}% crit` }); }
          if (pick.kind === "armor") { out.armorIgnore += v; out.lines.push({ name: t.name, text: `ignores ${v}% armor` }); }
          if (pick.kind === "extra") { out.extraAttack += v / 100; out.lines.push({ name: t.name, text: `${v}% chance of an extra swing` }); }
        }
      }
    });
    handRules(ctx, out);
    for (const a of gearAuras(ctx)) {
      const v = a.value;
      switch (a.aura) {
        case 319: case 138: out.meleeHaste += v; break;
        case 140: out.rangedHaste += v; break;
        case 342: out.meleeHaste += v; out.rangedHaste += v; break;
        case 65: out.castHaste += v; break;
        case 52: out.crit += v; break;
        case 290: out.crit += v; out.spellCrit += v; break;
        case 57: out.spellCrit += v; break;
        case 54: out.hit += v; break;
        case 55: out.spellHit += v; break;
        case 47: out.parry += v; break;
        case 49: out.dodge += v; break;
        case 51: out.block += v; break;
        case 30: if (a.misc === 95) out.defense += v; break;
        case 142: if (a.misc & 1) out.armorPct += v; break;
        case 137:
          for (const [stat, bit] of STAT_BITS) if (a.misc === -1 || a.misc2 & bit) out.statPct[stat] += v;
          break;
        case 107: case 108:
          if (a.mask && a.mask.some((m) => m)) out.mods.push({ op: a.misc, pct: a.aura === 108, value: v, mask: a.mask, name: a.name });
          break;
      }
    }
    racialEffects(ctx, out);
    stanceEffects(ctx, out);
    return out;
  }

  const ENRAGE_HIT_SEC = 2.5;
  const SACRIFICE = {
    imp: { re: /Imp: Increases your Shadow damage by (\d+)%/, school: 32, what: "Shadow", demon: "the Imp" },
    succubus: { re: /Succubus\/Incubus: Increases your Fire damage by (\d+)%/, school: 4, what: "Fire", demon: "the Succubus" },
  };
  function handRules(ctx, out) {
    const text = (name) => { const i = ctx.flat.findIndex((t) => t.name === name); const r = i >= 0 ? ctx.ranks[i] : 0; return r ? ctx.flat[i].desc[r - 1] || "" : ""; };
    const learned = (name) => !!text(name) || ctx.flat.some((t, i) => t.name === name && ctx.ranks[i]);
    let m;
    if ((m = /by (\d+)% for \d+ sec, stacking up to (\d+) times/.exec(text("Shadow Weaving")))) {
      out.dmgPct.push({ school: 32, value: m[1] * m[2], name: "Shadow Weaving" });
      out.lines.push({ name: "Shadow Weaving", text: `+${m[1] * m[2]}% Shadow damage (${m[2]} stacks kept up)` });
    }
    const snf = ctx.shadowAndFlame !== false && text("Shadow and Flame");
    if (snf) {
      const sh = /Conflagrate increases all Shadow damage you deal by (\d+)%/.exec(snf), fi = /Shadowburn increases all Fire damage you deal by (\d+)%/.exec(snf);
      const parts = [];
      if (sh && learned("Conflagrate")) { out.dmgPct.push({ school: 32, value: +sh[1], name: "Shadow and Flame" }); out.upkeep.push("Conflagrate"); parts.push(`+${sh[1]}% Shadow (Conflagrate)`); }
      if (fi && learned("Shadowburn")) { out.dmgPct.push({ school: 4, value: +fi[1], name: "Shadow and Flame" }); out.upkeep.push("Shadowburn"); parts.push(`+${fi[1]}% Fire (Shadowburn)`); }
      if (parts.length) out.lines.push({ name: "Shadow and Flame", text: parts.join(", ") + ", with them cast on cooldown" });
    }
    if (beingHit(ctx) && (m = /(\d+)% chance to deal (\d+)% increased Physical damage for (\d+) sec/.exec(text("Enrage")))) {
      const uptime = 1 - (1 - m[1] / 100) ** (m[3] / ENRAGE_HIT_SEC);
      out.dmgPct.push({ school: 1, value: m[2] * uptime, name: "Enrage" });
      out.lines.push({ name: "Enrage", text: `+${Math.round(m[2] * uptime * 10) / 10}% Physical damage (up ${Math.round(uptime * 100)}% of the time while you're being hit)` });
    }
    const sacrifice = text("Demonic Sacrifice") && SACRIFICE[ctx.sacrifice];
    if (sacrifice && (m = sacrifice.re.exec(text("Demonic Sacrifice")))) {
      out.dmgPct.push({ school: sacrifice.school, value: +m[1], name: "Demonic Sacrifice" });
      out.lines.push({ name: "Demonic Sacrifice", text: `+${m[1]}% ${sacrifice.what} damage (${sacrifice.demon} sacrificed: the better of the two for this build)` });
    }
    if (ctx.tank && (m = /all damage taken is reduced by (\d+)%/.exec(text("Improved Righteous Fury")))) {
      out.damageTaken -= +m[1];
      out.lines.push({ name: "Improved Righteous Fury", text: `-${m[1]}% damage taken while tanking (Righteous Fury on)` });
    }
  }

  const DRAIN = /drain Health from the target, up to (\d+)% of your maximum Health/;
  function racialEffects(ctx, out) {
    const race = ((KP.classes && KP.classes.races) || []).find((r) => r.name === ctx.race);
    const r1 = (v) => Math.round(v * 100) / 100;
    for (const rc of (race && race.racials) || []) {
      if (rc.classMask && !(rc.classMask & (1 << (ctx.cls.id - 1)))) continue;
      const drain = rc.proc && DRAIN.exec(rc.desc || "");
      if (drain) {
        out.drain = { name: rc.name, chance: rc.proc.chance / 100, cdMs: rc.proc.cdMs, pct: +drain[1] / 100 };
        out.racials.push({ name: rc.name, desc: rc.desc, text: `${rc.proc.chance}% of your hits drain ${drain[1]}% of your maximum health ` +
          `from the target, at most once every ${rc.proc.cdMs / 1000} sec: counted in your damage` });
        continue;
      }
      const share = rc.passive ? 1 : rc.cdMs > 0 && rc.durMs > 0 ? cooldownShare(ctx, rc.durMs, rc.cdMs) : 0;
      const parts = [];
      for (const a of rc.auras || []) {
        const v = a.value * share;
        if (!share) break;
        switch (a.aura) {
          case 290: out.crit += v; out.spellCrit += v; parts.push(`+${r1(v)}% crit`); break;
          case 52: out.crit += v; parts.push(`+${r1(v)}% crit`); break;
          case 54: out.hit += v; parts.push(`+${r1(v)}% hit`); break;
          case 55: out.spellHit += v; parts.push(`+${r1(v)}% spell hit`); break;
          case 49: out.dodge += v; parts.push(`+${r1(v)}% dodge`); break;
          case 137:
            for (const [stat, bit] of STAT_BITS) if (a.misc === -1 || a.misc2 & bit) { out.statPct[stat] += v; parts.push(`+${r1(v)}% ${stat}`); }
            break;
          case 133: out.healthPct += v; parts.push(`+${r1(v)}% health`); break;
          case 87: if (a.misc & 1) { out.damageTaken += v; parts.push(`${r1(v)}% physical damage taken`); } break;
          case 178: if (a.misc === ctx.cls.power) { out.powerPct += v; parts.push(`+${r1(v)}% maximum ${["mana", "rage", "", "energy"][a.misc]}`); } break;
          case 319: out.meleeHaste += v; parts.push(`+${r1(v)}% attack speed`); break;
          case 140: out.rangedHaste += v; parts.push(`+${r1(v)}% ranged attack speed`); break;
          case 342: out.meleeHaste += v; out.rangedHaste += v; parts.push(`+${r1(v)}% attack speed`); break;
          case 65: out.castHaste += v; parts.push(`+${r1(v)}% casting speed`); break;
          case 166: out.apPct += v; parts.push(`+${r1(v)}% attack power`); break;
          case 167: out.rapPct += v; break;
          case 317: out.spPct += v; parts.push(`+${r1(v)}% spell power`); break;
          case 107: case 108:
            if (a.mask && a.mask.some((m) => m)) out.mods.push({ op: a.misc, pct: a.aura === 108, value: v, mask: a.mask, name: rc.name });
            if (a.misc === 0) parts.push(`+${r1(v)}% damage`);
            break;
        }
      }
      const how = rc.passive ? "" : averagedText(ctx, rc.durMs, rc.cdMs, share);
      out.racials.push({ name: rc.name, desc: rc.desc, text: parts.length ? [...new Set(parts)].join(", ") + how : "not part of the damage or healing math", off: !parts.length });
    }
  }

  const SCHOOL_KEYS = { 2: "holyDamage", 4: "fireDamage", 8: "natureDamage", 16: "frostDamage", 32: "shadowDamage", 64: "arcaneDamage" };
  const RATING_BITS = { defense: [1], dodge: [2], parry: [3], block: [4], hit: [5, 6, 7], crit: [8, 9, 10], expertise: [23] };
  const ratingKeys = (misc) => Object.keys(RATING_BITS).filter((k) => RATING_BITS[k].some((bit) => (misc >> bit) & 1));
  function stats(ctx) {
    const cls = ctx.cls, lvl = ctx.level;
    const gear = {};
    let itemArmor = 0;
    for (const w of ctx.worn) {
      for (const [k, v] of Object.entries(w.item.stats || {})) gear[k] = (gear[k] || 0) + v;
      itemArmor += w.item.armor || 0;
    }
    for (const a of gearAuras(ctx)) {
      const add = (k, v) => { gear[k] = (gear[k] || 0) + v; };
      if (a.aura === 29) { if (a.misc === -1) STATS.forEach((k) => { add(k, a.value); }); else if (STATS[a.misc]) add(STATS[a.misc], a.value); }
      else if (a.aura === 99) add("meleeAttackPower", a.value);
      else if (a.aura === 124) add("rangedAttackPower", a.value);
      else if (a.aura === 135) add("healing", a.value);
      else if (a.aura === 85 && a.misc === 0) add("manaRegen", a.value);
      else if ((a.aura === 674 || a.aura === 22) && a.misc & 1) add("bonusArmor", a.value);
      else if (a.aura === 274) add("blockValue", a.value);
      else if (a.aura === 189) ratingKeys(a.misc).forEach((k) => { add(k, a.value); });
      else if (a.aura === 13) {
        if ((a.misc & 126) === 126) add("spellDamage", a.value);
        else for (const [bit, key] of Object.entries(SCHOOL_KEYS)) if (a.misc & bit) add(key, a.value);
      }
    }
    const tal = talentEffects(ctx);
    const g = (k) => gear[k] || 0;
    const est = estimateBase(cls.token, ctx.race, lvl);
    const base = {};
    const estimated = [];
    for (const k of STATS) {
      if (ctx.base && ctx.base[k]) base[k] = ctx.base[k];
      else { base[k] = est[k]; estimated.push(k); }
    }
    const statBuffs = { strength: buffValue(ctx, "Strength of Earth"), agility: buffValue(ctx, "Grace of Air"),
      intellect: buffValue(ctx, "Arcane Intellect") };
    const motw = buffValue(ctx, "Mark of the Wild");
    for (const k of STATS) gear[k] = (gear[k] || 0) + (statBuffs[k] || 0) + motw;
    const kings = buffValue(ctx, "Blessing of Kings");
    const formKey = druidForm(ctx);
    const form = formKey && FORMS[formKey];
    const formPct = { strength: 0, stamina: 0 };
    if (form) {
      const i = ctx.flat.findIndex((t) => t.name === "Heart of the Wild");
      const vals = i >= 0 && ctx.ranks[i] ? (ctx.flat[i].effects[ctx.ranks[i] - 1] || []).map((e) => e.value) : [];
      if (formKey === "cat") formPct.strength = vals[2] || 0; else formPct.stamina = vals[1] || 0;
    }
    const whole = ctx.exact ? (v) => v : Math.round;
    const attr = {}, attrBase = {};
    for (const k of STATS) {
      attr[k] = whole((base[k] + g(k)) * (1 + (tal.statPct[k] + kings + (formPct[k] || 0)) / 100));
      attrBase[k] = whole(base[k] * (1 + tal.statPct[k] / 100));
    }
    const agiRatio = agiPerCrit(cls.token, lvl);
    const intRatio = INT_PER_SPELL_CRIT[cls.token] ? perLevel(INT_PER_SPELL_CRIT[cls.token], lvl) : 0;
    const userCrit = ctx.base && ctx.base.crit, userSpell = ctx.base && ctx.base.spellCrit;
    const critFromStats = userCrit ? userCrit + (attr.agility - attrBase.agility) / agiRatio
      : (BASE_CRIT[cls.token] || 0) + attr.agility / agiRatio;
    const spellFromStats = !intRatio ? (userSpell || 0)
      : userSpell ? userSpell + (attr.intellect - attrBase.intellect) / intRatio
        : (BASE_SPELL_CRIT[cls.token] || 0) + attr.intellect / intRatio;
    if (!userCrit) estimated.push("crit");
    if (!userSpell && intRatio) estimated.push("spellCrit");
    const per = (key) => rules.ratings[key][Math.max(0, lvl - 1)] || 1;
    const [apL, apC] = BASE_AP[cls.token] || [0, 0];
    const [rapL, rapC] = BASE_RAP[cls.token] || [0, 0];
    const baseAp = lvl * apL + apC;
    const healthFromStamina = Math.min(attr.stamina, 20) + Math.max(0, attr.stamina - 20) * rules.healthPerStamina[lvl - 1];
    const manaFromIntellect = Math.min(attr.intellect, 20) + Math.max(0, attr.intellect - 20) * 15;
    const sp = g("spellPower") + g("spellDamage");
    const school = { holy: g("holyDamage"), fire: g("fireDamage"), nature: g("natureDamage"),
      frost: g("frostDamage"), shadow: g("shadowDamage"), arcane: g("arcaneDamage") };
    const worn = (slot) => ctx.worn.find((w) => w.slot === slot);
    const fromStats = statTalents(ctx, attr);
    const blast = ctx.blastCycle ? stackingSpell(ctx) : null;
    const blastSp = blast ? (blast.pct / 100) * attr.intellect * Math.min(ctx.blastCycle, blast.max) : 0;
    const formAp = form ? form.apPerLevel * lvl + attr.agility * form.apPerAgi +
      (talentNumber(ctx, "Predatory Strikes", /by (\d+)% of your level/) * lvl) / 100 : 0;
    const packCrit = form && learnedTalent(ctx, "Leader of the Pack") ? rankValue("Leader of the Pack", lvl) : 0;
    const shieldItem = (ctx.worn.find((w) => w.slot === "offHand" && w.item.class === 4 && w.item.subclass === 6) || {}).item;
    const shield = !!shieldItem;
    const baseAvoid = BASE_AVOID[cls.token] || {};
    const hasWeapon = !!(worn("mainHand") && worn("mainHand").item.weapon);
    const imbue = hasWeapon ? imbueOf(ctx) : null;
    const S = {
      gear, tal, attr, baseAp, form: formKey, imbue,
      ap: (Math.max(0, baseAp + g("attackPower") + g("meleeAttackPower") + attr.strength * cls.apPerStr + attr.agility * cls.apPerAgi) +
        (imbue === "rockbiter" ? rockbiterAp(ctx) : 0) +
        buffValue(ctx, "Battle Shout") + buffValue(ctx, "Blessing of Might") + formAp + fromStats.ap) * (1 + tal.apPct / 100),
      rap: (Math.max(0, lvl * rapL + rapC + g("attackPower") + g("rangedAttackPower") + attr.agility * cls.rapPerAgi) +
        sum(hunterSelfBuffs(ctx).map((b) => b.value)) + buffValue(ctx, "Trueshot Aura") + fromStats.ap) * (1 + tal.rapPct / 100),
      meleeHaste: tal.meleeHaste, rangedHaste: tal.rangedHaste, castHaste: tal.castHaste, damageTaken: tal.damageTaken,
      hit: g("hit") / per("meleeHit") + tal.hit,
      expertise: g("expertise") / per("expertise"),
      crit: critFromStats + g("crit") / per("meleeCrit") + tal.crit + Math.max(packCrit, buffValue(ctx, "Leader of the Pack")),
      spellHit: g("hit") / per("spellHit") + tal.spellHit,
      spellCrit: spellFromStats + g("crit") / per("spellCrit") + tal.spellCrit + buffValue(ctx, "Leader of the Pack"),
      estimated, estimate: { ...est, crit: (BASE_CRIT[cls.token] || 0) + attrBase.agility / agiRatio,
        spellCrit: intRatio ? (BASE_SPELL_CRIT[cls.token] || 0) + attrBase.intellect / intRatio : 0 },
      sp: (sp + fromStats.sp + blastSp) * (1 + tal.spPct / 100), school,
      blast: blast && { ...blast, k: ctx.blastCycle, perStack: (blast.pct / 100) * attr.intellect * (1 + tal.spPct / 100) },
      healing: (g("healing") + g("spellPower") + fromStats.sp + fromStats.healing) * (1 + tal.spPct / 100),
      armor: whole(itemArmor * (1 + tal.armorPct / 100 + (form ? form.armorPct : 0) / 100)) + g("bonusArmor") + attr.agility * 2 + fromStats.armor +
        (form ? talentNumber(ctx, "Thick Hide", /gain (\d+) additional base Armor per level/) * lvl : 0),
      defense: g("defense") / per("defense") + tal.defense,
      dodge: g("dodge") / per("dodge") + tal.dodge + (KP.measured.agiPerCrit[cls.token] ? attr.agility / agiRatio : 0),
      parry: g("parry") / per("parry") + tal.parry + (lvl >= (baseAvoid.parryFrom || 1) ? baseAvoid.parry || 0 : 0),
      block: g("block") / per("block") + tal.block + (shield ? baseAvoid.block || 0 : 0),
      blockValue: shieldItem ? Math.max(0, Math.floor(g("blockValue") + (shieldItem.block || 0) + attr.strength / 20 - 1)) : g("blockValue"),
      health: whole((rules.baseHealth[cls.token][lvl - 1] + healthFromStamina + g("health") +
        (form ? form.health : 0)) * (1 + tal.healthPct / 100)),
      mana: cls.power === 0 ? whole((rules.baseMana[cls.token][lvl - 1] + manaFromIntellect + g("mana")) * (1 + tal.powerPct / 100)) : 0,
      mp5: g("manaRegen") + (cls.power === 0 ? buffValue(ctx, "Blessing of Wisdom") : 0),
      mh: form ? formWeapon(form, lvl, ctx.formWeaponDps !== false && worn("mainHand") && worn("mainHand").item.weapon ? worn("mainHand").item : null)
        : worn("mainHand") && worn("mainHand").item.weapon ? worn("mainHand").item : null,
      oh: form ? null : worn("offHand") && worn("offHand").item.weapon ? worn("offHand").item : null,
      rg: worn("ranged") && worn("ranged").item.weapon ? worn("ranged").item : null,
      shield,
    };
    for (const b of ctx.useBuffs || []) {
      for (const a of b.auras || []) {
        if ([319, 138, 342].includes(a.aura)) S.meleeHaste = ((1 + S.meleeHaste / 100) * (1 + (a.value * b.share) / 100) - 1) * 100;
      }
    }
    const o = ctx.override;
    if (o) {
      if (o.ap != null) { S.ap = o.ap; S.rap = o.ap; }
      if (o.sp != null) { S.sp = o.sp; S.school = { holy: 0, fire: 0, nature: 0, frost: 0, shadow: 0, arcane: 0 }; }
      if (o.healing != null) S.healing = o.healing;
    }
    return S;
  }

  const SCHOOL_NAMES = { 1: "physical", 2: "holy", 4: "fire", 8: "nature", 16: "frost", 32: "shadow", 64: "arcane" };

  function spellPowerFor(S, schoolMask) {
    let best = 0;
    for (const [bit, name] of Object.entries(SCHOOL_NAMES)) {
      if (schoolMask & bit && name !== "physical") best = Math.max(best, S.school[name] || 0);
    }
    return S.sp + best;
  }

  function damagePct(S, schoolMask) {
    return (S.tal.dmgPct.filter((d) => d.school & schoolMask).reduce((m, d) => m * (1 + d.value / 100), 1) - 1) * 100;
  }
  function rangedPct(S, item) {
    return item ? sum(S.tal.rangedPct.filter((d) => d.mask & (1 << item.subclass)).map((d) => d.value)) : 0;
  }

  function buffValue(ctx, name) {
    return (ctx.buffs || {})[name] ? rankValue(name, ctx.level) : 0;
  }
  function rankValue(name, level) {
    let v = 0;
    for (const r of (KP.abilities.BUFFS || {})[name] || []) if (r.level <= level) v = Math.max(v, r.value);
    return v;
  }
  function hunterSelfBuffs(ctx) {
    if (ctx.cls.token !== "HUNTER") return [];
    const ranged = hunterStyle(ctx) === "ranged";
    const hawk = ctx.aspect ? ctx.aspect === "hawk" : ranged;
    return [hawk && "Aspect of the Hawk", ranged && "Hunter's Mark"].filter(Boolean)
      .map((name) => ({ name, value: rankValue(name, ctx.level) })).filter((b) => b.value);
  }
  const HUNTER_MELEE_TALENTS = ["Lacerating Strikes", "Strider Kick", "Predator's Edge", "Savage Strikes", "Expose Prey"];
  function hunterStyle(ctx) {
    if (ctx.style === "ranged" || ctx.style === "melee") return ctx.style;
    const pts = [0, 0, 0], learned = new Set();
    ctx.flat.forEach((t, i) => { if (ctx.ranks[i]) { pts[t.tree] += ctx.ranks[i]; learned.add(t.name); } });
    const melee = HUNTER_MELEE_TALENTS.filter((n) => learned.has(n)).length;
    return pts[2] > Math.max(pts[0], pts[1]) && melee >= 2 ? "melee" : "ranged";
  }
  const SUNDER_STACKS = 5;
  const sunderCost = (ctx, rank) => rank.cost / 10 - talentNumber(ctx, "Improved Sunder Armor", /by (\d+)/);

  function ownSunder(ctx) {
    const rank = ctx.target.ownSunder && ctx.cls.token === "WARRIOR" && !buffValue(ctx, "Sunder Armor") && bookRank("WARRIOR", "Sunder Armor", ctx.level);
    if (!rank) return null;
    const T = ctx.fightSec || FIGHT_SEC;
    const stacks = Math.min(SUNDER_STACKS, Math.ceil(T / 1.5));
    const uses = stacks + Math.max(0, T - (stacks - 1) * 1.5) / (rank.durMs / 1000);
    return { perStack: rankValue("Sunder Armor", ctx.level), stacks, share: 1.5 / T, ragePerSec: (uses * sunderCost(ctx, rank)) / T };
  }

  function mitigation(ctx, S) {
    const sunderLike = Math.max(buffValue(ctx, "Sunder Armor") * SUNDER_STACKS, buffValue(ctx, "Expose Armor") * COMBO_POINTS);
    const sundered = Math.max(0, (ctx.target.armor || 0) - sunderLike -
      buffValue(ctx, "Faerie Fire") - buffValue(ctx, "Curse of Recklessness"));
    const reduction = (stacks, perStack) => {
      const armor = Math.max(0, sundered - stacks * perStack) * (1 - S.tal.armorIgnore / 100);
      return Math.min(0.75, armor / (armor + 400 + 85 * ctx.level));
    };
    const own = ownSunder(ctx);
    if (!own) return reduction(0, 0);
    let total = 0, left = 1;
    for (let k = 1; k < own.stacks; k++) {
      total += own.share * reduction(k, own.perStack);
      left -= own.share;
    }
    return total + left * reduction(own.stacks, own.perStack);
  }

  function table(ctx, S, kind, moreMiss = 0) {
    const d = Math.max(0, Math.min(3, ctx.target.diff));
    if (kind === "magic") {
      return { miss: Math.max(1, SPELL_MISS[d] - S.spellHit), dodge: 0, parry: 0 };
    }
    const hit = d >= 3 ? Math.max(0, S.hit - 1) : S.hit;
    const melee = kind === "melee";
    return { miss: Math.max(0, MELEE_MISS[d] + moreMiss - hit), dodge: melee ? Math.max(0, 5 + d * 0.5 - S.expertise) : 0,
      parry: melee && beingHit(ctx) ? Math.max(0, MELEE_PARRY[d] - S.expertise) : 0 };
  }

  function hitCaps(ctx) {
    const d = Math.max(0, Math.min(3, ctx.target.diff));
    const melee = MELEE_MISS[d] + (d >= 3 ? 1 : 0);
    return { melee, dualWhite: melee + DUAL_WIELD_MISS, spell: SPELL_MISS[d] - 1 };
  }

  function critSuppression(ctx) {
    return Math.max(0, Math.min(3, ctx.target.diff));
  }

  function statTalents(ctx, attr) {
    const out = { ap: 0, sp: 0, healing: 0, armor: 0 };
    ctx.flat.forEach((t, i) => {
      const r = ctx.ranks[i];
      if (!r) return;
      const d = t.desc[r - 1] || "";
      let m;
      if ((m = /Attack Power by (?:an amount equal to )?(\d+)% of your Intellect/.exec(d))) out.ap += attr.intellect * m[1] / 100;
      if ((m = /spell damage and healing by up to (\d+)% of your Intellect/.exec(d))) out.sp += attr.intellect * m[1] / 100;
      else if ((m = /spell damage by up to (\d+)% of your Intellect/.exec(d))) out.sp += attr.intellect * m[1] / 100;
      if ((m = /spell healing by (?:up to )?(\d+)% of your (?:total )?Intellect/.exec(d))) out.healing += attr.intellect * m[1] / 100;
      if ((m = /spell healing by up to (\d+)% of your total Spirit and your spell damage by up to (\d+)% of your total Spirit/.exec(d))) {
        out.healing += attr.spirit * (m[1] - m[2]) / 100;
        out.sp += attr.spirit * m[2] / 100;
      }
      if ((m = /Armor by an amount equal to (\d+)% of your Intellect/.exec(d))) out.armor += attr.intellect * m[1] / 100;
    });
    return out;
  }

  function druidForm(ctx) {
    if (ctx.cls.token !== "DRUID") return null;
    if (ctx.form === "bear") return bookRank("DRUID", "Dire Bear Form", ctx.level) ? "dire" : bookRank("DRUID", "Bear Form", ctx.level) ? "bear" : null;
    if (ctx.form === "cat") return bookRank("DRUID", "Cat Form", ctx.level) ? "cat" : null;
    if (ctx.form === "none" || ctx.form === "moonkin") return null;
    const pts = [0, 0, 0];
    const learned = new Set();
    ctx.flat.forEach((t, i) => { if (ctx.ranks[i]) { pts[t.tree] += ctx.ranks[i]; learned.add(t.name); } });
    const feral = pts[1] > Math.max(pts[0], pts[2]);
    const bear = ctx.tank === true || (ctx.tank == null && feral && (learned.has("Natural Reaction") || learned.has("Thick Hide")));
    if (bear) return bookRank("DRUID", "Dire Bear Form", ctx.level) ? "dire" : bookRank("DRUID", "Bear Form", ctx.level) ? "bear" : null;
    if (feral) return bookRank("DRUID", "Cat Form", ctx.level) ? "cat" : null;
    return null;
  }
  function formWeapon(form, level, item) {
    if (item) {
      const k = form.speed / item.weapon.speed;
      return { name: `${form.name} (${item.name}'s damage)`, class: 2, subclass: 13, inv: 13, form: true,
        weapon: { min: item.weapon.min * k, max: item.weapon.max * k, speed: form.speed } };
    }
    return { name: `${form.name} (base attack)`, class: 2, subclass: 13, inv: 13, form: true, ownAttack: true,
      weapon: { min: level * 0.85 * form.speed, max: level * 1.25 * form.speed, speed: form.speed } };
  }

  function normalSpeed(item, kind) {
    if (item && item.form) return item.weapon.speed;
    if (kind === "ranged") return NORMAL_SPEED.ranged;
    if (item.inv === 17) return NORMAL_SPEED.twoHand;
    if (item.subclass === 15) return NORMAL_SPEED.dagger;
    return NORMAL_SPEED.oneHand;
  }


  const rankOf = (ctx, name, pred) => {
    const i = ctx.flat.findIndex((t) => t.name === name && (!pred || pred(t)));
    return i >= 0 ? ctx.ranks[i] || 0 : 0;
  };
  const talentValue = (ctx, name) => {
    const i = ctx.flat.findIndex((t) => t.name === name);
    const r = i >= 0 ? ctx.ranks[i] || 0 : 0;
    const e = r && (ctx.flat[i].effects[r - 1] || [])[0];
    return e ? e.value : 0;
  };

  const WF_TOTEM_CHANCE = 0.2;
  function procs(ctx, S) {
    const out = { haste: 0, extraAttack: 0, deepWounds: 0, lines: [] };
    const flurry = talentValue(ctx, "Flurry");
    if (flurry) {
      const c = Math.max(0, S.crit - critSuppression(ctx)) / 100;
      const uptime = 1 - Math.pow(1 - c, 4);
      out.haste = flurry * uptime;
      out.lines.push(`Flurry: +${flurry}% attack speed, up ${Math.round(uptime * 100)}% of the time`);
    }
    if (S.tal.extraAttack && S.mh) out.extraAttack = S.tal.extraAttack;
    const wft = buffValue(ctx, "Windfury Totem");
    const imbueDesc = S.imbue ? (((KP.spellbook || {}).SHAMAN || []).find((b) => b.name === IMBUE_SPELLS[S.imbue]) || {}).desc || "" : "";
    if (wft && S.mh && !/disables any benefit you personally receive from Windfury Totem/.test(imbueDesc)) {
      const boost = rawSwing(S, S.mh, wft) / rawSwing(S, S.mh);
      out.extraAttack += WF_TOTEM_CHANCE * boost;
      out.lines.push(`Windfury Totem: ${WF_TOTEM_CHANCE * 100}% chance of an extra attack with +${wft} attack power (chance: Classic's)`);
    }
    const dw = talentValue(ctx, "Deep Wounds");
    if (dw && S.mh) out.deepWounds = dw / 100;
    return out;
  }

  const RAGE_C = [0.0091107836, 3.225598133, 4.2652911];
  const rageConversion = (L) => RAGE_C[0] * L * L + RAGE_C[1] * L + RAGE_C[2];
  const RAGE_PER_C = 7.5;
  const rageFromDamage = (damage, level) => (RAGE_PER_C * damage) / rageConversion(level);

  const EXECUTE_PHASE = 0.2;
  const RECKLESS_SWINGS_CD = 15;
  const RECKLESS_SWINGS_HEALTH = 0.25;
  const buffNote = (ctx) => {
    const on = Object.keys(ctx.buffs || {}).filter((k) => ctx.buffs[k]);
    if (!on.length) return " No group buffs or debuffs (switch them on above).";
    return on.length > 3 ? ` With ${on.length} group buffs and debuffs on.` : ` With ${on.join(" and ")}.`;
  };

  const RAGE_PER_SWING_SEC = 3.45;
  const RAGE_PER_SWING_SEC_2H = 4.5;
  const OFFHAND_RAGE = 0.5;
  const RAGE_TAKEN_PER_C = 2.5;
  const RAGE_PER_HIT_TAKEN = 0.45;
  const REVENGE_WINDOW = 5;
  const inStance = (ctx, name) => {
    const b = ((KP.spellbook || {}).WARRIOR || []).find((x) => x.name === name);
    return !b || !b.stances || inMask(b.stances, STANCE_FORM[warriorStance(ctx)]);
  };

  function tankRage(ctx, S) {
    const o = swingOutcomes(S), swings = 1 / MOB_SWING;
    const perBlock = (talentNumber(ctx, "Shield Specialization", /(\d+)% chance to generate/) / 100) *
      talentNumber(ctx, "Shield Specialization", /generate (\d+) Rage when you Block/);
    const perDodge = S.shield ? (talentNumber(ctx, "Master of Defense", /(\d+)% chance to generate/) / 100) *
      talentNumber(ctx, "Master of Defense", /generate (\d+) Rage when you Dodge/) : 0;
    const landed = swings * Math.max(0, 1 - o.miss - o.dodge - o.parry);
    const mobLevel = ctx.level + Math.max(0, ctx.target.diff || 0);
    const hits = ctx.target && ctx.target.mode === "same"
      ? (RAGE_TAKEN_PER_C * meleeTaken(S, mobLevel, ctx.target.hitMult)) / rageConversion(ctx.level) + RAGE_PER_HIT_TAKEN * landed : 0;
    return { o, swings, perBlock, rage: hits + swings * (o.block * perBlock + (o.dodge + o.parry) * perDodge),
      from: [hits && "the hits you take", perBlock && "Shield Specialization's blocks", perDodge && "Master of Defense's dodges and parries"].filter(Boolean) };
  }

  function warriorRotation(ctx, S, white, byName, parts, dps) {
    const L = ctx.level, stance = warriorStance(ctx), tank = stance === "defensive";
    const use = (name) => (byName[name] && inStance(ctx, name) ? byName[name] : null);
    const unbridled = talentValue(ctx, "Unbridled Wrath") / 100;
    const offhandBonus = talentNumber(ctx, "Dual Wield Specialization", /Rage generated by your off-hand attacks by (\d+)%/);
    const swingRage = (w) => (w.twoHand ? RAGE_PER_SWING_SEC_2H : RAGE_PER_SWING_SEC) * w.speed * ((w.hit + w.glance + w.crit * 2) / 100) *
      (w.label === "Off hand" ? OFFHAND_RAGE * (1 + offhandBonus / 100) : 1);
    let rage = 0;
    for (const w of white.filter((x) => x.label !== "Ranged" && x.label !== "Wand")) {
      rage += (swingRage(w) + unbridled) / w.effSpeed;
    }
    if (rankOf(ctx, "Anger Management")) rage += 1 / 3;
    const from = [`white hits (${RAGE_PER_SWING_SEC} a second of weapon speed, twice that on a crit` + (offhandBonus ? ", more from the off hand)" : ")")];
    const reckless = talentNumber(ctx, "Reckless Swings", /next (\d+) melee attacks/) *
      talentNumber(ctx, "Reckless Swings", /generate (\d+) additional Rage/);
    rage += reckless * cooldownUses(ctx, RECKLESS_SWINGS_CD * 1000);
    if (reckless) from.push("Reckless Swings");
    const blood = ctx.bloodrage !== false && bookRank("WARRIOR", "Bloodrage", L);
    const bloodRage = blood ? (/(\d+) rage at the cost of health.* additional (\d+) rage/.exec(bookDesc("WARRIOR", "Bloodrage")) || [])
      .slice(1).reduce((a, n) => a + +n, 0) * (1 + talentNumber(ctx, "Improved Bloodrage", /by (\d+)%/) / 100) : 0;
    if (bloodRage) {
      rage += bloodRage * cooldownUses(ctx, blood.cdMs);
      from.push("Bloodrage");
    }
    const charge = bookRank("WARRIOR", "Charge", L);
    const pullRage = charge && (stance === "battle" || (tank && learnedTalent(ctx, "Vanguard")))
      ? (charge.rage || 0) + talentNumber(ctx, "Improved Charge", /Charge ability by (\d+)/) : 0;
    if (pullRage && ctx.fightSec) {
      rage += pullRage / ctx.fightSec;
      from.push(`Charge at the pull (${pullRage} rage a fight)`);
    }
    const t = beingHit(ctx) ? tankRage(ctx, S) : null;
    if (t) {
      rage += t.rage;
      from.push(...t.from);
    }
    const rageIncome = rage, firstAbilityPart = parts.length, spentOn = [];
    let gcdUsed = 0;
    const own = ownSunder(ctx);
    if (own) {
      rage = Math.max(0, rage - own.ragePerSec);
      spentOn.push("your own Sunder Armor first (5, then kept up)");
    }
    const spend = (a) => {
      if (!a || !a.cdMs || rage <= 0) return;
      const uses = cooldownUses(ctx, a.cdMs);
      const perSec = a.cost * uses;
      const f = perSec ? Math.min(1, rage / perSec) : 1;
      rage -= perSec * f;
      gcdUsed += f * 1.5 * uses;
      const d = f * a.expected * uses;
      dps += d;
      parts.push({ name: a.name + (f < 1 ? " (not every cooldown)" : ""), dps: d, spell: a.name });
      spentOn.push(a.name);
    };
    if (t) {
      const moreBlocks = shieldBlock(ctx, S, t, rage);
      rage -= moreBlocks.rage;
      if (moreBlocks.perSec) spentOn.push("Shield Block");
      const rv = use("Revenge");
      if (rv && rv.cdMs && rage > 0) {
        const r = revengeRate(t, moreBlocks.perSec, rv.cdMs / 1000);
        const f = rv.cost ? Math.min(1, rage / (rv.cost * r)) : 1;
        rage -= f * rv.cost * r;
        gcdUsed += f * r * 1.5;
        dps += f * r * rv.expected;
        parts.push({ name: `Revenge (every ${(1 / r).toFixed(1)} sec${f < 1 ? ", when rage allows" : ""})`, dps: f * r * rv.expected, spell: "Revenge" });
        spentOn.push("Revenge when it lights up");
      }
    }
    spend(use("Shield Slam"));
    const holding = t && (ctx.group || (ctx.target && ctx.target.mode === "boss"));
    const flatThreat = [];
    warriorAttacks(ctx, white, use, () => rage, (r) => { rage = r; }, gcdUsed, holding, (p) => {
      if (p.flatThreat) flatThreat.push({ spell: p.spell, perSec: p.perSec, threat: p.flatThreat });
      else { dps += p.dps; parts.push(p); }
      spentOn.push(p.spell);
    });
    const hs = use("Heroic Strike"), mh = white.find((w) => w.label === "Main hand");
    if (hs && mh && rage > 0) {
      const perSec = Math.min(rage / (hs.cost + swingRage(mh)), 1 / mh.effSpeed);
      const d = perSec * Math.max(0, hs.expected - mh.perSwing);
      dps += d;
      parts.push({ name: `Heroic Strike (${Math.round(perSec * mh.effSpeed * 100)}% of swings)`, dps: d, spell: "Heroic Strike" });
      spentOn.push("Heroic Strike with what's left");
    }
    const ex = use("Execute");
    if (ex && ex.cost >= 0 && ex.expected) {
      const rate = ex.cost ? Math.min(1 / 1.5, rageIncome / ex.cost) : 1 / 1.5;
      const leftover = Math.max(0, rageIncome - rate * ex.cost);
      const exDps = rate * ex.expected + leftover * ex.perRage;
      let normal = 0;
      for (const p of parts.slice(firstAbilityPart)) {
        normal += p.dps;
        p.dps *= 1 - EXECUTE_PHASE;
        if (p.perSec) p.perSec *= 1 - EXECUTE_PHASE;
        p.name += " (first 80%)";
      }
      for (const f of flatThreat) f.perSec *= 1 - EXECUTE_PHASE;
      dps += -normal * EXECUTE_PHASE + exDps * EXECUTE_PHASE;
      parts.push({ name: "Execute (last 20%)", dps: exDps * EXECUTE_PHASE, spell: "Execute" });
      spentOn.push("below 20% health, every rage point on Execute");
    }
    const note = `Rage from ${from.join(", ")}. Spent on ${spentOn.join(", ") || "nothing yet"}.` +
      (use("Shield Slam") ? " Shield Slam counts twice your Block Value: the shield's own where it has been read in game, what " +
        "gear adds and 1 for each 20 Strength, less 1." : "") + buffNote(ctx);
    const baseHealth = rules.baseHealth.WARRIOR[L - 1];
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, pullRage, flatThreat, rageIncome,
      healthSpent: (reckless ? baseHealth * RECKLESS_SWINGS_HEALTH * cooldownUses(ctx, RECKLESS_SWINGS_CD * 1000) : 0) +
        (bloodRage ? ((baseHealth * blood.costPct) / 100) * cooldownUses(ctx, blood.cdMs) : 0) };
  }

  function warriorAttacks(ctx, white, use, getRage, setRage, gcdUsed, holding, add) {
    const melee = white.filter((w) => w.label === "Main hand" || w.label === "Off hand");
    const mh = melee.find((w) => w.label === "Main hand");
    const busy = (a) => Math.max(1.5, (a.castMs || 0) / 1000);
    const perCd = (a) => (a && a.cdMs ? cooldownUses(ctx, a.cdMs) : 0);
    let gcd = Math.max(0, 1 - gcdUsed);
    const take = (a, perSec, dmg, flatThreat) => {
      const needRage = perSec * a.cost, needTime = perSec * busy(a);
      const f = Math.max(0, Math.min(1, needRage ? getRage() / needRage : 1, needTime ? gcd / needTime : 1));
      if (f < 0.01) return 0;
      setRage(getRage() - f * needRage);
      gcd -= f * needTime;
      add({ name: `${a.name} (every ${(1 / (f * perSec)).toFixed(1)} sec)`, dps: flatThreat ? 0 : f * perSec * dmg, spell: a.name,
        perSec: f * perSec, flatThreat });
      return f;
    };
    const rend = use("Rend"), op = use("Overpower"), slam = use("Slam");
    const rendCast = rend && rend.durMs ? dotRecast(ctx, rend.durMs, rend.ticks) : null;
    const rendEvery = rendCast ? 1000 / rendCast.everyMs : 0;
    const rendLost = rendCast ? rend.dotExpected * (1 - rendCast.landed) : 0;
    const bloodthrill = talentNumber(ctx, "Bloodthrill", /a (\d+)% chance to allow an activation of Overpower/) / 100;
    const rendUp = !!(rend && rend.expected && bloodthrill && op) && take(rend, rendEvery, rend.expected - rendLost) > 0.99;
    const list = [];
    const push = (a, perSec, loss = 0) => { if (a && a.expected > 0 && perSec > 0) list.push({ a, perSec, dmg: a.expected - loss }); };
    push(use("Mortal Strike") || use("Bloodthirst"), perCd(use("Mortal Strike") || use("Bloodthirst")));
    push(use("Whirlwind"), perCd(use("Whirlwind")));
    push(use("Thunder Clap"), perCd(use("Thunder Clap")));
    if (rend && !rendUp) push(rend, rendEvery, rendLost);
    const slamFree = talentNumber(ctx, "Improved Slam", /cooldown of your Slam ability by (\d+) sec[\s\S]*no longer interrupts or delays your melee swing/) > 0;
    if (slam) push(slam, perCd(slam), slamFree ? 0 : sum(melee.map((w) => w.perSwing / w.effSpeed)) * (slam.castMs / 1000));
    if (op && op.cdMs) {
      const dodges = sum(melee.map((w) => w.dodge / 100 / w.effSpeed));
      const fromRend = rendUp && mh ? bloodthrill * (Math.max(0, 100 - mh.miss - mh.dodge - mh.parry) / 100) / mh.effSpeed : 0;
      push(op, Math.min(1000 / op.cdMs, dodges + fromRend));
    }
    const sunder = holding && bookRank("WARRIOR", "Sunder Armor", ctx.level);
    if (sunder && sunder.threat) {
      list.push({ a: { name: "Sunder Armor", cost: sunderCost(ctx, sunder) }, perSec: 1 / 1.5, dmg: sunder.threat, flatThreat: sunder.threat });
    }
    list.sort((x, y) => y.dmg / (y.a.cost || 1e-9) - x.dmg / (x.a.cost || 1e-9));
    for (const c of list) take(c.a, c.perSec, c.dmg, c.flatThreat);
  }

  function shieldBlock(ctx, S, t, rage) {
    const sb = S.shield && inStance(ctx, "Shield Block") && bookRank("WARRIOR", "Shield Block", ctx.level);
    const max = +((/only block (\d+) attacks/.exec(bookDesc("WARRIOR", "Shield Block")) || [])[1] || 0);
    if (!sb || !max || !sb.cdMs) return { perSec: 0, rage: 0 };
    const cd = sb.cdMs / 1000;
    const swingsIn = Math.min(sb.durMs / 1000, cd) * t.swings;
    const blocked = Math.min(max, swingsIn * Math.max(0, 1 - t.o.miss - t.o.dodge - t.o.parry));
    const extra = Math.max(0, blocked - swingsIn * t.o.block);
    const net = (sb.cost / 10 - extra * t.perBlock) / cd;
    const f = net <= 0 ? 1 : Math.min(1, Math.max(0, rage) / net);
    return { perSec: (f * extra) / cd, rage: f * net };
  }

  function revengeRate(t, moreBlocks, cd) {
    const procs = t.swings * (t.o.dodge + t.o.parry + t.o.block) + moreBlocks;
    return procs > 0 ? 1 / (cd + Math.exp(-procs * Math.min(REVENGE_WINDOW, cd)) / procs) : 0;
  }

  function rotation(ctx, S, white, abilities) {
    const byName = Object.fromEntries(abilities.filter((a) => !a.locked).map((a) => [a.name, a]));
    const melee = white.filter((w) => w.label === "Main hand" || w.label === "Off hand");
    const whiteDps = melee.reduce((x, w) => x + w.dps, 0);
    const parts = melee.map((w) => ({ name: `${w.label} (white)`, dps: w.dps }));
    const extra = white.filter((w) => w.deepWounds).reduce((x, w) => x + w.deepWounds, 0);
    if (extra) parts.push({ name: "Deep Wounds", dps: extra });
    const token = ctx.cls.token;
    const result = (dps, note) => ({ dps, parts: parts.filter((p) => p.dps > 0.05), note });

    if (token === "WARRIOR" && white.length) return warriorRotation(ctx, S, white, byName, parts, whiteDps + extra);

    if (token === "ROGUE" && white.length) {
      const r = rogueRotation(ctx, S, white, byName);
      if (r) return r;
    }
    if (token === "HUNTER") {
      const h = hunterRotation(ctx, S, white, byName);
      if (h) return h;
    }
    if (token === "PALADIN" && white.length) {
      const r = retRotation(ctx, S, white, byName);
      if (r) return r;
    }
    const shamanPts = [0, 0, 0];
    if (token === "SHAMAN") ctx.flat.forEach((t, i) => { shamanPts[t.tree] += ctx.ranks[i] || 0; });
    const shamanStyle = ctx.style === "caster" || ctx.style === "melee" ? ctx.style
      : shamanPts[0] > shamanPts[1] ? "caster" : shamanPts[1] > shamanPts[0] ? "melee" : null;
    if (token === "SHAMAN" && white.length && S.mh && shamanStyle !== "caster") {
      const r = enhRotation(ctx, S, white, byName);
      if (r && r.dps > whiteDps) {
        if (shamanStyle === "melee") return r;
        const caster = casterRotation(ctx, S, abilities);
        if (!caster || r.dps >= caster.dps) return r;
      }
    }
    if (token === "DRUID" && S.form) {
      const d = S.form === "cat" ? catRotation(ctx, S, white, byName) : bearRotation(ctx, S, white, byName);
      if (d) return d;
    }

    if (ctx.cls.power === 0) {
      const wand = white.find((w) => w.label === "Wand");
      const c = casterRotation(ctx, S, abilities, wand ? wand.dps : 0);
      if (c) return c;
    }
    return result(whiteDps + extra, white.length ? "White hits only; this class's rotation isn't worked out yet." : "Equip a weapon to see damage.");
  }

  const SPIRIT_PER_MANA = 4;
  const SPIRIT_FULL = 50;
  const REGEN_SEEN = ["PRIEST", "DRUID", "PALADIN", "SHAMAN", "HUNTER", "MAGE"];
  const REGEN_RULE = `Spirit ÷ ${SPIRIT_PER_MANA} per second, half that above ${SPIRIT_FULL} Spirit, as on Forever`;
  const spiritRegenOf = (spirit) => (Math.min(spirit, SPIRIT_FULL) + Math.max(0, spirit - SPIRIT_FULL) / 2) / SPIRIT_PER_MANA;

  function bareStat(field) {
    const [, effective, plus, minus] = field.split(":").map(Number);
    return effective - plus + minus;
  }
  const DUNGEON_FIGHTING = 0.57, DUNGEON_FIGHT_SEC = 1650;
  const dungeonMana = (pool, whileFighting, betweenPulls) =>
    pool / DUNGEON_FIGHT_SEC + whileFighting + (betweenPulls * (1 - DUNGEON_FIGHTING)) / DUNGEON_FIGHTING;
  function manaBudget(ctx, S, talentKeep) {
    const spiritRegen = spiritRegenOf(S.attr.spirit);
    const keep = talentKeep(ctx);
    if (ctx.manaPerSec != null) return { perSec: ctx.manaPerSec, keep, busy: 0, extras: [] };
    if (ctx.dungeonPace) {
      const perSec = dungeonMana(S.mana, S.mp5 / 5 + (spiritRegen * keep) / 100 + blockMana(ctx, S), S.mp5 / 5 + spiritRegen);
      return { perSec, keep, busy: 0, extras: [] };
    }
    let extra = 0, busy = 0;
    const extras = [];
    if (ctx.cls.token === "MAGE") {
      const evo = bookRank("MAGE", "Evocation", ctx.level);
      if (evo) {
        const boost = parseFloat((/increased by (\d+)%/.exec(bookDesc("MAGE", "Evocation")) || [])[1] || 0);
        const sec = (evo.durMs || 8000) / 1000;
        extra += (S.mp5 / 5 + spiritRegen) * (1 + boost / 100) * sec;
        busy += sec / FIGHT_SEC;
        extras.push("Evocation");
      }
      const gem = ["Conjure Mana Ruby", "Conjure Mana Citrine", "Conjure Mana Jade", "Conjure Mana Agate"]
        .find((n) => bookRank("MAGE", n, ctx.level));
      if (gem) {
        const m = /restore (\d+)(?: to (\d+))? mana/.exec(bookDesc("MAGE", gem));
        extra += m ? (parseFloat(m[1]) + parseFloat(m[2] || m[1])) / 2 : 0;
        extras.push("a mana gem");
      }
    }
    return { perSec: (S.mana + extra + (S.mp5 / 5 + spiritRegen * keep / 100 + blockMana(ctx, S)) * FIGHT_SEC) / FIGHT_SEC, keep, busy, extras };
  }
  const beingHit = (ctx) => (ctx.beingHit != null ? ctx.beingHit :
    (ctx.target && ctx.target.mode === "same" && (!ctx.group || ctx.tank)) || ctx.tank === true ||
    (ctx.cls.token === "WARRIOR" && warriorStance(ctx) === "defensive"));
  function blockMana(ctx, S) {
    const pct = talentNumber(ctx, "Shield Specialization", /restore (\d+)% of your maximum Mana/);
    if (!pct || !S.shield || !beingHit(ctx)) return 0;
    const chance = talentNumber(ctx, "Shield Specialization", /(\d+)% chance to restore/) / 100;
    const wait = talentNumber(ctx, "Shield Specialization", /once every (\d+) sec/);
    const blocks = chance * swingOutcomes(S).block / MOB_SWING;
    return blocks > 0 ? (S.mana * pct / 100) / (wait + 1 / blocks) : 0;
  }
  const bookDesc = (token, name) => ((((KP.spellbook || {})[token] || []).find((b) => b.name === name)) || {}).desc || "";
  const keepWhileCasting = (ctx) => Math.max(0, ...ctx.flat.map((t, i) => {
    const r = ctx.ranks[i];
    const m = r && /allows? (\d+)% of your Mana [Rr]egeneration to continue while casting/.exec(t.desc[r - 1] || "");
    return m ? parseFloat(m[1]) : 0;
  }));

  function lifeTapMana(ctx, S) {
    if (ctx.cls.token !== "WARLOCK" || !bookRank("WARLOCK", "Life Tap", ctx.level)) return 0;
    const m = /into \(?(\d+)(?: \+ (\d+)% of Spirit\))? Mana/.exec(bookDesc("WARLOCK", "Life Tap"));
    if (!m) return 0;
    const book = KP.spellbook.WARLOCK.find((b) => b.name === "Life Tap");
    const known = bookRank("WARLOCK", "Life Tap", ctx.level);
    const scale = book.ranks.length > 1 ? (book.ranks.indexOf(known) + 1) / book.ranks.length : 1;
    const base = parseFloat(m[1]) * scale + (m[2] ? S.attr.spirit * parseFloat(m[2]) / 100 : 0);
    return { mana: base * (1 + talentNumber(ctx, "Improved Life Tap", /by (\d+)%/) / 100), health: base };
  }

  function casterRotation(ctx, S, abilities, wandDps = 0) {
    let best = null;
    for (const list of consumeVariants(ctx, abilities)) {
      const r = withAfflictedBonus(ctx, S, list, wandDps);
      if (r && (!best || r.dps > best.dps + 0.01)) best = r;
    }
    return best;
  }

  const CONSUMES = /afflicted by your ([\w ]+?) spell[\s\S]*?consuming your \1 effect/;
  function consumeVariants(ctx, abilities) {
    for (const a of abilities) {
      const m = CONSUMES.exec(a.rank.desc || "");
      const target = m && abilities.find((x) => x.name === m[1]);
      if (!target || a.locked || target.locked || !a.cdMs || !(target.durMs > a.cdMs)) continue;
      const spared = new RegExp(`${a.name} has a (\\d+)% chance not to consume ${target.name}`);
      if (ctx.flat.some((t, i) => ctx.ranks[i] && +((spared.exec(t.desc[ctx.ranks[i] - 1] || "") || [])[1] || 0) >= 100)) continue;
      const everyMs = 1000 / cooldownUses(ctx, a.cdMs);
      const share = everyMs / target.durMs;
      const cut = { ...target, durMs: everyMs, ticks: target.ticks * share, dotExpected: target.dotExpected * share,
        expected: target.directExpected + target.dotExpected * share };
      return [abilities.filter((x) => x !== a), abilities.map((x) => (x === target ? cut : x))];
    }
    return [abilities];
  }

  const AFFLICTED = /additional (\d+)% damage if the target is afflicted by ([\w ]+?)\./;
  function withAfflictedBonus(ctx, S, abilities, wandDps) {
    const needs = new Set();
    const boosted = abilities.map((a) => {
      const m = AFFLICTED.exec(a.rank.desc || "");
      if (!m || a.locked || !abilities.some((x) => x.name === m[2] && !x.locked)) return a;
      needs.add(m[2]);
      const f = 1 + m[1] / 100;
      return { ...a, expected: a.expected * f, directExpected: a.directExpected * f };
    });
    if (!needs.size) return tappedRotation(ctx, S, abilities, wandDps);
    const r = tappedRotation(ctx, S, boosted, wandDps);
    const kept = (n) => r && r.parts.some((p) => p.spell === n && p.kind === "keep");
    return [...needs].every(kept) ? r : tappedRotation(ctx, S, abilities, wandDps);
  }

  const ONE_OF_A_KIND = /Only one (\w+) per \w+ can be active on any one target/i;
  function oneOfAKind(ctx, list) {
    const kind = (a) => (ONE_OF_A_KIND.exec(a.rank.desc || "") || [])[1];
    const rate = (a) => {
      const { everyMs, landed } = dotRecast(ctx, a.durMs, a.ticks, a.cdMs || 0);
      return (a.expected - a.dotExpected * (1 - landed)) / Math.max(everyMs, a.cdMs || 0, 1);
    };
    const beats = (b, a) => rate(b) > rate(a) || (rate(b) === rate(a) && list.indexOf(b) < list.indexOf(a));
    return list.filter((a) => !kind(a) || !list.some((b) => b !== a && kind(b) === kind(a) && beats(b, a)));
  }

  function tappedRotation(ctx, S, abilities, wandDps) {
    const tap = lifeTapMana(ctx, S);
    let best = withSpiritBetweenCasts(ctx, S, abilities, 0, 0, wandDps);
    if (!best || !tap) return best;
    for (let share = 0.02; share <= 0.4; share += 0.02) {
      const r = withSpiritBetweenCasts(ctx, S, abilities, share, tap.mana, wandDps);
      if (r && r.dps > best.dps + 0.01) best = { ...r, tapHealth: (share * tap.health) / 1.5 };
    }
    return best;
  }

  const FIVE_SEC_RULE = 5;
  function withSpiritBetweenCasts(ctx, S, abilities, tapShare, tapMana, wandDps) {
    const full = spiritRegenOf(S.attr.spirit) * (1 - keepWhileCasting(ctx) / 100);
    const at = (x) => casterRotationWith(ctx, S, abilities, tapShare, tapMana, wandDps, x);
    const first = at(0);
    if (!first || !(full > 0) || first.inRule >= 1) return first;
    const gap = (r, x) => full * (1 - r.inRule) - x;
    let lo = { x: 0, r: first, g: gap(first, 0) };
    const top = at(full);
    let hi = { x: full, r: top, g: gap(top, full) };
    if (hi.g >= 0) return top;
    let side = 0;
    for (let i = 0; i < 40 && hi.x - lo.x > 1e-4; i++) {
      const x = (lo.x * hi.g - hi.x * lo.g) / (hi.g - lo.g);
      const r = at(x);
      const g = gap(r, x);
      if (Math.abs(g) < 1e-4) return r;
      if (g > 0) {
        lo = { x, r, g };
        if (side === 1) hi.g /= 2;
        side = 1;
      } else {
        hi = { x, r, g };
        if (side === -1) lo.g /= 2;
        side = -1;
      }
    }
    return lo.r;
  }

  const TICKS_FASTER = /your ([^.]+?) effects on the target deal their periodic damage (\d+)% faster/;
  function fasterTicks(a) {
    const m = a.channeled && TICKS_FASTER.exec(a.rank.desc || "");
    return m ? { spells: nameList(m[1]), share: m[2] / 100 } : null;
  }
  const nameList = (text) => text.split(/,\s*(?:and\s+)?|\s+and\s+/);
  function talentMatch(ctx, re) {
    for (const [i, t] of ctx.flat.entries()) {
      const m = ctx.ranks[i] && re.exec(t.desc[ctx.ranks[i] - 1] || "");
      if (m) return { m, name: t.name };
    }
    return null;
  }

  const PER_DOT = /by your ([^.]+?) spells by (\d+)% per each of your ([^.]+?) effects active on the target, up to a maximum increase of (\d+)%/;
  function perDotBonus(ctx) {
    const t = talentMatch(ctx, PER_DOT);
    return t && { name: t.name, spells: nameList(t.m[1]), per: t.m[2] / 100, dots: nameList(t.m[3]), max: t.m[4] / 100 };
  }

  const INSTANT_PROC = /Gives your ([^.]+?) spells an? (\d+)% chance to cause you to enter an? ([\w ]+?) after damaging the opponent\. The \3 reduces the casting time of your next ([\w ]+?) spell by 100%/;
  function instantProc(ctx) {
    const t = talentMatch(ctx, INSTANT_PROC);
    return t && { from: nameList(t.m[1]), chance: t.m[2] / 100, buff: t.m[3], spell: t.m[4] };
  }
  function procsPerSec(proc, kept, shares, free) {
    const named = (a) => proc.from.includes(a.name);
    let fixed = 0, withFiller = 0;
    for (const d of kept.filter((x) => named(x.a))) {
      fixed += d.ticks;
      for (const [f, share] of shares) if (f.faster && f.faster.spells.includes(d.a.name)) withFiller += d.ticks * f.faster.share * share;
    }
    for (const [f, share] of shares) if (named(f.a)) withFiller += ((f.a.ticks * (1 - f.a.miss / 100)) / f.time) * share;
    return (proc.chance * (fixed + withFiller)) / (1 + (1.5 * proc.chance * withFiller) / free);
  }
  const fillerShares = (pick, free) =>
    [[pick.A, free * pick.f], ...(pick.A !== pick.B && !pick.starved ? [[pick.B, free * (1 - pick.f)]] : [])];

  function casterRotationWith(ctx, S, abilities, tapShare, tapMana, wandDps = 0, spiritMana = 0) {
    const stack = ctx.blastCycle != null && stackingSpell(ctx);
    const usable = oneOfAKind(ctx, abilities.filter((a) => !a.locked && !a.aoe && !a.cc && !a.heal && a.expected > 0 && a.kind === "magic" &&
      !(stack && a.name === stack.name)));
    const castTime = (a) => Math.max(1.5, (a.channelMs || a.castMs) / 1000);
    const baseMana = (rules.baseMana[ctx.cls.token] || [])[ctx.level - 1] || 0;
    const clearcast = (talentNumber(ctx, "Arcane Concentration", /(\d+)% chance/) ||
      talentNumber(ctx, "Elemental Focus", /(\d+)% chance/)) / 100;
    const moe = talentNumber(ctx, "Master of Elements", /refund (\d+)%/) / 100;
    const manaOf = (a) => {
      const raw = a.cost || (a.costPct ? (a.costPct * baseMana) / 100 : 0);
      const refund = (a.school & (4 | 16)) ? moe * a.critChance / 100 : 0;
      return raw * (1 - clearcast) * (1 - refund);
    };
    const plainFillers = usable.filter((a) => !a.cdMs && (a.directExpected > 0 || a.channeled)).map((a) =>
      ({ a, time: castTime(a), dps: (a.channeled ? a.expected : a.directExpected) / castTime(a), mps: manaOf(a) / castTime(a), faster: fasterTicks(a) }));
    if (!plainFillers.length) return null;
    const drain = perDotBonus(ctx);
    const drained = (f) => drain && drain.spells.includes(f.a.name);
    const fillersWith = (kept) => plainFillers.map((f) => {
      const sped = f.faster ? f.faster.share * sum(kept.filter((d) => f.faster.spells.includes(d.a.name)).map((d) => d.dps)) : 0;
      const perDot = drained(f) ? f.dps * Math.min(drain.max, drain.per * kept.filter((d) => drain.dots.includes(d.a.name)).length) : 0;
      return { ...f, dps: f.dps + sped + perDot, sped, perDot };
    }).sort((x, y) => y.dps - x.dps);
    const fastest = (name) => Math.max(0, ...plainFillers.filter((f) => f.faster && f.faster.spells.includes(name)).map((f) => f.faster.share));
    const drainGain = (name) => (drain && drain.dots.includes(name) ? Math.max(0, ...plainFillers.filter(drained).map((f) => f.dps * drain.per)) : 0);
    const budget = manaBudget(ctx, S, keepWhileCasting);
    let mana = budget.perSec + spiritMana + (tapShare * tapMana) / 1.5, busy = budget.busy + tapShare, dps = 0, inRule = 0;
    const parts = [], kept = [];
    let fillers = fillersWith(kept), best = fillers[0];
    const blast = S.blast && S.blast.k > 0 && abilities.find((a) => a.name === S.blast.name && !a.locked);
    if (blast) {
      const { k, max, sec, costUp, perStack } = S.blast;
      const e = (blast.rank.effects || []).find((x) => x.coef) || { base: 0, coef: 0 };
      const sp = spellPowerFor(S, blast.school);
      let dmg = 0, cost = 0;
      for (let i = 1; i <= k; i++) {
        const stacks = Math.min(i - 1, max);
        dmg += blast.expected * (e.base + e.coef * (sp - perStack * (Math.min(k, max) - stacks))) / (e.base + e.coef * sp || 1);
        cost += manaOf(blast) * (1 + (stacks * costUp) / 100);
      }
      const d = dmg / sec, mps = cost / sec;
      busy += (k * castTime(blast)) / sec;
      inRule += (k * castTime(blast) + FIVE_SEC_RULE) / sec;
      mana -= mps;
      dps += d;
      parts.push({ name: `${blast.name} (${k} per ${sec} sec)`, dps: d, spell: blast.name, kind: "keep", blasts: k, mps });
    }
    const dots = usable.filter((a) => !a.channeled && a.dotExpected > 0 && a.durMs > 0 && !a.cdMs)
      .map((a) => {
        const { everyMs, landed } = dotRecast(ctx, a.durMs, a.ticks);
        const every = Math.max(everyMs / 1000, castTime(a));
        const per = a.expected - a.dotExpected * (1 - landed);
        return { a, every, dps: per / every, time: castTime(a) / every, mps: manaOf(a) / every, ticks: (a.ticks * landed * (1 - a.miss / 100)) / every };
      })
      .filter((d) => (d.dps * (1 + fastest(d.a.name)) + drainGain(d.a.name)) / d.time > best.dps)
      .sort((x, y) => y.dps / y.time - x.dps / x.time);
    for (const d of dots) {
      if (busy + d.time > 0.9 || d.mps > mana) continue;
      const next = fillersWith([...kept, d]);
      const without = fillerPick(fillers, best, mana, 1 - busy).d * (1 - busy);
      const withIt = d.dps + fillerPick(next, next[0], mana - d.mps, 1 - busy - d.time).d * (1 - busy - d.time);
      if (withIt <= without) continue;
      kept.push(d);
      fillers = next;
      best = next[0];
      busy += d.time;
      if (d.mps > 0) inRule += (castTime(d.a) + FIVE_SEC_RULE) / d.every;
      mana -= d.mps;
      dps += d.dps;
      parts.push({ name: `${d.a.name} (kept up)`, dps: d.dps, spell: d.a.name, kind: "keep" });
    }
    const forced = (a) => S.tal.upkeep.includes(a.name);
    const cds = usable.filter((a) => a.cdMs > 0 && (a.directExpected > 0 || a.dotExpected > 0) && !/Undead|Demon/.test(a.rank.desc || ""))
      .flatMap((a) => {
        const execute = /20% (?:health )?or less|20% or less health|less than 20% health/i.test(a.rank.desc || "");
        const share = execute ? 0.2 : 1;
        const variant = (rate, kept, landed) =>
          ({ a, rate, per: a.expected - a.dotExpected * (1 - landed), time: castTime(a), mps: manaOf(a) * rate, execute, kept });
        const onCooldown = Math.max(castTime(a), a.cdMs / 1000);
        const each = cooldownCasts(ctx, a.durMs, onCooldown * 1000, share);
        const cut = variant(each.rate, false, each.landed);
        if (!(a.dotExpected > 0 && a.durMs / 1000 > onCooldown)) return [cut];
        const kept = dotRecast(ctx, a.durMs, a.ticks, onCooldown * 1000);
        return [cut, variant((share * 1000) / kept.everyMs, true, kept.landed)];
      })
      .filter((x) => (forced(x.a) ? !x.kept : x.per / x.time > best.dps));
    const proc = instantProc(ctx);
    const instant = proc && usable.find((a) => a.name === proc.spell);
    if (instant && instant.expected / 1.5 > best.dps) {
      const free = 1 - busy;
      const rate = procsPerSec(proc, kept, fillerShares(fillerPick(fillers, best, mana, free), free), free);
      if (rate > 0) cds.push({ a: instant, rate, per: instant.expected, time: 1.5, mps: manaOf(instant) * rate, proc });
    }
    const placeCooldowns = (worth) => {
      let b = busy, m = mana, d = 0, rule = 0;
      const placed = [], used = new Set();
      for (const x of [...cds].sort((x, y) => forced(y.a) - forced(x.a) || worth(y) - worth(x))) {
        if (used.has(x.a) || b + x.rate * x.time > 0.95) continue;
        const f = x.mps > m ? Math.max(0, m / x.mps) : 1;
        if (f < 0.05) continue;
        const without = fillerPick(fillers, best, m, 1 - b).d * (1 - b);
        const withIt = x.per * x.rate * f + fillerPick(fillers, best, m - x.mps * f, 1 - b - x.rate * x.time * f).d * (1 - b - x.rate * x.time * f);
        if (!forced(x.a) && withIt <= without) continue;
        b += x.rate * x.time * f;
        if (x.mps > 0) rule += x.rate * f * (x.time + FIVE_SEC_RULE);
        m -= x.mps * f;
        d += x.per * x.rate * f;
        used.add(x.a);
        const how = x.proc ? `instant, ${x.proc.buff}` : x.kept ? "kept up" : "on cooldown";
        placed.push({ name: `${x.a.name} (${how}${x.execute ? ", last 20%" : ""}${f < 0.99 ? `, ${Math.round(f * 100)}%` : ""})`, dps: x.per * x.rate * f,
          spell: x.a.name, kind: x.proc ? "proc" : x.kept ? "keep" : "cooldown", execute: x.execute, ...(x.proc ? { perSec: x.rate * f } : {}) });
      }
      const rest = fillerPick(fillers, best, m, 1 - b);
      return { b, m, d, rule, placed, total: d + rest.d * (1 - b) + (rest.starved ? wandDps * (1 - b) * (1 - rest.f) : 0) };
    };
    const plan = [(x) => x.per / x.time, (x) => (x.per * x.rate) / (x.mps || 1e-9)].map(placeCooldowns)
      .reduce((p, q) => (q.total > p.total + 0.01 ? q : p));
    busy = plan.b;
    mana = plan.m;
    dps += plan.d;
    inRule += plan.rule;
    parts.push(...plan.placed);
    const free = 1 - busy;
    let note = "Keeps damage-over-time spells up, uses cooldown spells when they're worth it, and casts the best single-target spell in between";
    const pick = fillerPick(fillers, best, mana, free);
    const fillerMana = free * (pick.starved ? pick.A.mps * pick.f : pick.f * pick.A.mps + (1 - pick.f) * pick.B.mps);
    const manaSpent = Math.max(0, budget.perSec - mana + fillerMana);
    for (const [f, share] of pick.starved ? [[pick.A, pick.f]] : [[pick.A, pick.f], [pick.B, 1 - pick.f]]) {
      if (f.mps > 0) inRule += (free * share * (f.time + FIVE_SEC_RULE)) / f.time;
    }
    if (pick.starved) note += `; your mana only covers ${Math.round(pick.f * 100)}% of the casting time, so the spell with the most damage per mana wins`;
    if (spiritMana > 0.05) {
      note += `; ${wandDps ? "while you wand" : "between spells"}, 5 sec after a spell, your Spirit brings back ${Math.round(spiritMana * 10) / 10} mana a second`;
    }
    note += fillerNotes(pick, kept, drain);
    const instants = parts.find((p) => p.kind === "proc");
    if (instants) {
      note += `; about ${Math.round(instants.perSec * 600) / 10} instant ${instants.spell}s a minute from ${proc.buff} (${proc.chance * 100}% on each tick of ` +
        `${proc.from.join(", ")})`;
    }
    const fd = pick.d * free;
    dps += fd;
    const idle = pick.starved ? free * (1 - pick.f) : 0;
    if (wandDps && idle > 0.01) {
      parts.push({ name: `Wand (${Math.round(idle * 100)}% of the time, out of mana)`, dps: wandDps * idle, kind: "wand", share: idle });
      dps += wandDps * idle;
    }
    const instead = pick.A !== best ? best.a.name : undefined;
    const share = (f, d, key) => (f[key] ? (d * f[key]) / f.dps : undefined);
    const bonuses = (f, d) => ({ faster: share(f, d, "sped"), perDot: share(f, d, "perDot") });
    if (pick.f >= 0.999 || pick.A === pick.B) {
      parts.push({ name: `${pick.A.a.name} (filler)`, dps: fd, spell: pick.A.a.name, kind: "filler", instead, ...bonuses(pick.A, fd) });
      if (instead) note += `; ${best.a.name} would hit harder but runs you out of mana over a fight`;
    } else {
      const da = pick.f * pick.A.dps * free, db = (1 - pick.f) * pick.B.dps * free;
      parts.push({ name: `${pick.A.a.name} (${Math.round(pick.f * 100)}% of fillers)`, dps: da, spell: pick.A.a.name, kind: "filler", instead, ...bonuses(pick.A, da) },
        { name: `${pick.B.a.name} (the rest, cheaper)`, dps: db, spell: pick.B.a.name, kind: "cheap", ...bonuses(pick.B, db) });
      note += `; mixes ${pick.A.a.name} with the cheaper ${pick.B.a.name} so the mana lasts`;
    }
    if (tapShare) note += `; Life Tap ${Math.round(tapShare * 100)}% of the time (${Math.round(tapMana)} mana each, health assumed healed back)`;
    else if (tapMana) note += "; Life Tap isn't needed: the mana lasts";
    note += `. Mana over a ${FIGHT_SEC / 60}-minute fight (${REGEN_RULE}` + (budget.keep ? `, ${budget.keep}% kept while casting` : "") +
      (budget.extras.length ? `, plus ${budget.extras.join(" and ")}` : "") + "; no potions). " +
      [ctx.flat.some((t, i) => t.name === "Ignite" && ctx.ranks[i]) && "Ignite counted", clearcast && "Clearcasting averaged in",
        moe && "Master of Elements refunds averaged in"].filter(Boolean).map((x) => x + ". ").join("") +
      "Spells with a cooldown are cast when they beat the filler; damage cooldowns (Arcane Power, Death Wish...) are averaged over their cooldown, " +
      `${instants ? "other procs" : "procs"} aren't counted.` + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, manaSpent, inRule: Math.min(1, inRule), spiritMana };
  }

  function fillerNotes(pick, kept, drain) {
    const names = (list) => kept.filter((d) => list.includes(d.a.name)).map((d) => d.a.name).join(" and ");
    let note = "";
    for (const f of new Set([pick.A, pick.B])) {
      if (f.sped) note += `; ${f.a.name}'s number includes the extra ticks it gives ${names(f.faster.spells)} (${f.faster.share * 100}% faster while you channel it)`;
      if (f.perDot) note += `; ${f.a.name} does ${Math.round((100 * f.perDot) / (f.dps - f.sped - f.perDot))}% more with your ${names(drain.dots)} on the target (${drain.name})`;
    }
    return note;
  }

  function fillerPick(fillers, best, mana, free) {
    const perFillerSec = mana / Math.max(free, 0.01);
    let pick = null;
    for (const A of fillers) {
      for (const B of fillers) {
        let f;
        if (A.mps <= perFillerSec) f = 1;
        else if (B.mps >= A.mps || B.mps > perFillerSec) continue;
        else f = (perFillerSec - B.mps) / (A.mps - B.mps);
        const d = f * A.dps + (1 - f) * B.dps;
        if (!pick || d > pick.d) pick = { A, B, f, d };
      }
    }
    const starved = fillers.map((X) => {
      const f = X.mps ? Math.max(0, Math.min(1, perFillerSec / X.mps)) : 1;
      return { A: X, B: X, f, d: X.dps * f, starved: f < 0.999 };
    }).sort((x, y) => y.d - x.d)[0];
    return !pick || starved.d > pick.d ? starved : pick;
  }

  const WEAKENED_SOUL_MS = 15000;
  const BLOOM_USEFUL = 0.23;
  function healRotation(ctx, S, abilities) {
    const GROUP_HEALS = ["Holy Nova", "Prayer of Healing", "Chain Heal", "Wild Growth", "Tranquility", "Prayer of Mending"];
    const heals = abilities.filter((a) => !a.locked && a.heal > 10 && !a.aoe && !GROUP_HEALS.includes(a.name) && !(a.cdMs >= 60000) &&
      !(a.rank.effects || []).some((e) => e.chain > 1) &&
      !(a.rank.effects || []).filter((e) => e.effect === 10 || e.aura === 8 || e.aura === 69).every((e) => e.target === 1));
    if (!heals.length) return null;
    const castTime = (a) => Math.max(1.5, (a.channelMs || a.castMs) / 1000);
    const baseMana = (rules.baseMana[ctx.cls.token] || [])[ctx.level - 1] || 0;
    const crit = Math.min(100, S.spellCrit) / 100;
    const back = (talentNumber(ctx, "Illumination", /Mana equal to (\d+)% of the base cost/) / 100) * crit;
    const manaOf = (a) => (a.cost || (a.costPct ? (a.costPct * baseMana) / 100 : 0)) * (1 - back);
    const oathText = learnedTalent(ctx, "Oath of Light") &&
      /Holy Light on them by up to (\d+), your Flash of Light by up to (\d+), and your Holy Shock by up to (\d+)/
        .exec((ctx.flat.find((t) => t.name === "Oath of Light") || { desc: [""] }).desc[0]);
    const oath = oathText ? { "Holy Light": +oathText[1], "Flash of Light": +oathText[2], "Holy Shock": +oathText[3] } : {};
    const boundless = oathText ? 0 : talentNumber(ctx, "Boundless Light", /Holy Shock spell by (\d+)%/);
    const critOf = (a) => Math.min(100, (a.critChance != null ? a.critChance : S.spellCrit) + (a.name === "Holy Shock" ? boundless : 0)) / 100;
    const bloom = ctx.dungeonPace ? (talentNumber(ctx, "Bloom", /equal to (\d+)% of your Spirit/) / 100) * S.attr.spirit * BLOOM_USEFUL : 0;
    const per = (a) => (a.heal * (a.name === "Binding Heal" ? 0.5 : 1) + (oath[a.name] || 0) * ctx.level / 60) *
      (1 + critOf(a) * ((a.healCritMult || 1.5) - 1)) + (a.name === "Rejuvenation" || a.name === "Regrowth" ? bloom : 0);
    const isHot = (a) => (a.rank.effects || []).some((e) => e.effect === 6 && e.aura === 8) && !(a.rank.effects || []).some((e) => e.effect === 10);
    const isShield = (a) => (a.rank.effects || []).some((e) => e.aura === 69);
    const fillers = heals.filter((a) => !a.cdMs && !isHot(a) && !isShield(a))
      .map((a) => ({ a, dps: per(a) / castTime(a), mps: manaOf(a) / castTime(a) })).sort((x, y) => y.dps - x.dps);
    const budget = manaBudget(ctx, S, keepWhileCasting);
    let mana = budget.perSec, busy = budget.busy, hps = 0;
    const parts = [];
    const best = fillers[0] || { dps: 0, mps: 0 };
    const extras = heals.filter((a) => isHot(a) || a.cdMs || isShield(a)).map((a) => {
      const every = isShield(a) ? Math.max(WEAKENED_SOUL_MS, a.cdMs) / 1000 : isHot(a) ? Math.max(castTime(a), (a.durMs || 0) / 1000) : Math.max(castTime(a), a.cdMs / 1000);
      return { a, rate: 1 / every, per: per(a), time: castTime(a), mps: manaOf(a) / every };
    }).sort((x, y) => y.per / y.time - x.per / x.time);
    for (const x of extras) {
      if (busy + x.rate * x.time > 0.95) continue;
      const f = x.mps > mana ? Math.max(0, mana / x.mps) : 1;
      if (f < 0.05) continue;
      const without = fillers.length ? fillerPick(fillers, best, mana, 1 - busy).d * (1 - busy) : 0;
      const withIt = x.per * x.rate * f + (fillers.length ? fillerPick(fillers, best, mana - x.mps * f, 1 - busy - x.rate * x.time * f).d * (1 - busy - x.rate * x.time * f) : 0);
      if (withIt <= without) continue;
      busy += x.rate * x.time * f;
      mana -= x.mps * f;
      hps += x.per * x.rate * f;
      const kind = isShield(x.a) ? "absorb, once per Weakened Soul" : isHot(x.a) ? "kept up" : "on cooldown";
      parts.push({ name: `${x.a.name} (${kind}${f < 0.99 ? `, ${Math.round(f * 100)}%` : ""})`, dps: x.per * x.rate * f });
    }
    let note = "One target: heals over time kept up, cooldown heals when they're worth it, then the best heal your mana allows";
    if (fillers.length) {
      const pick = fillerPick(fillers, best, mana, 1 - busy);
      const free = 1 - busy;
      if (pick.f >= 0.999 || pick.A === pick.B) {
        parts.push({ name: `${pick.A.a.name} (main heal)`, dps: pick.d * free });
      } else {
        parts.push({ name: `${pick.A.a.name} (${Math.round(pick.f * 100)}% of casts)`, dps: pick.f * pick.A.dps * free },
          { name: `${pick.B.a.name} (the rest, cheaper)`, dps: (1 - pick.f) * pick.B.dps * free });
      }
      hps += pick.d * free;
      if (pick.starved) note += `; your mana only covers ${Math.round(pick.f * 100)}% of the casting time`;
    }
    if (oathText) note += "; the target has your Oath of Light";
    else if (boundless) note += `; Boundless Light +${boundless}% Holy Shock crit (no Oath of Light)`;
    const hc = heals.find((a) => a.healCritMult > 1.5);
    note += `. Crits heal ${hc ? `${Math.round(hc.healCritMult * 100)}% (Holy Power)` : "150%"}${back ? ", Illumination's mana back averaged in" : ""}; assumes every point of healing is needed (no overhealing). ` +
      `${ctx.dungeonPace ? "Mana at a dungeon run's pace, no drinking" : `Mana over a ${FIGHT_SEC / 60}-minute fight`} (${REGEN_RULE}${budget.keep ? `, ${budget.keep}% kept while casting` : ""}; no potions). ` +
      "Group heals (Chain Heal, Prayer of Healing, Wild Growth...) aren't counted.";
    return { hps, parts: parts.filter((p) => p.dps > 0.05), note };
  }

  function talentNumber(ctx, name, re) {
    const i = ctx.flat.findIndex((t) => t.name === name);
    const r = i >= 0 ? ctx.ranks[i] : 0;
    const m = r && re.exec(ctx.flat[i].desc[r - 1] || "");
    return m ? parseFloat(m[1]) : 0;
  }
  const bookRank = (token, name, level) => {
    const b = ((KP.spellbook || {})[token] || []).find((x) => x.name === name);
    return b ? [...b.ranks].reverse().find((r) => (r.level || 1) <= level) : null;
  };
  const learnedTalent = (ctx, name) => ctx.flat.some((t, i) => t.name === name && ctx.ranks[i]);

  function rogueRotation(ctx, S, white, byName) {
    const melee = white.filter((w) => w.label === "Main hand" || w.label === "Off hand");
    const whiteDps = sum(melee.map((w) => w.dps));
    const dagger = S.mh && S.mh.subclass === 15;
    const builders = ["Sinister Strike", "Hemorrhage", ...(dagger ? ["Backstab"] : []),
      ...(dagger && S.oh && S.oh.subclass === 15 ? ["Mutilate"] : [])]
      .map((n) => byName[n]).filter((a) => a && !a.locked && a.cost && a.expected);
    const evis = byName["Eviscerate"];
    if (!builders.length || !evis || evis.locked) return null;
    const level = ctx.level;
    const ar = learnedTalent(ctx, "Adrenaline Rush") && bookRank("ROGUE", "Adrenaline Rush", level);
    const regen = 10 * (1 + (ar ? cooldownShare(ctx, ar.durMs || 15000, ar.cdMs) : 0));
    const sealFate = talentNumber(ctx, "Seal Fate", /(\d+)% chance/) / 100;
    const ruthless = talentNumber(ctx, "Ruthlessness", /(\d+)% chance/) / 100;
    const rsChance = Math.min(1, talentNumber(ctx, "Relentless Strikes", /(\d+)% chance per Combo Point/) * COMBO_POINTS / 100);
    const refund = rsChance * (talentNumber(ctx, "Relentless Strikes", /restore (\d+) Energy/) || 0);
    const pick = builders.map((b) => {
      const cp = (b.name === "Mutilate" ? 2 : 1) + (b.critChance / 100) * sealFate;
      const n = Math.max(0, (COMBO_POINTS - ruthless) / cp);
      return { b, cp, n, energy: n * b.cost + evis.cost - refund, dmg: n * b.expected + evis.expected };
    }).sort((x, y) => y.dmg / y.energy - x.dmg / x.energy)[0];
    const shank = byName["Shank"];
    const shankEvery = shank && !shank.locked && shank.expected ? 1 / cooldownUses(ctx, shank.cdMs) : 0;
    let shankEnergy = 0, replaced = 0;
    if (shankEvery) {
      const gain = shank.rank.effects.find((e) => e.effect === 30 && e.misc === 3).base +
        talentNumber(ctx, "Flash of Steel", /generated by your Shank ability by (\d+)/);
      const points = (talentNumber(ctx, "Boot Knife", /(\d+)% chance to add \d+ Combo Points/) / 100) *
        talentNumber(ctx, "Boot Knife", /chance to add (\d+) Combo Points/);
      replaced = points / shankEvery / pick.cp;
      shankEnergy = (gain - shank.cost) / shankEvery + replaced * pick.b.cost;
    }
    const energy = regen + shankEnergy;
    const bfRank = learnedTalent(ctx, "Blade Flurry") && bookRank("ROGUE", "Blade Flurry", level);
    const bf = bfRank ? 20 * cooldownShare(ctx, bfRank.durMs || 15000, bfRank.cdMs) : 0;
    const parts = [{ name: "White hits", dps: whiteDps * (1 + bf / 100) }];
    const notes = [];
    let dps;
    const snd = bookRank("ROGUE", "Slice and Dice", level);
    const haste = rankValue("Slice and Dice", level);
    const shankDps = shankEvery ? shank.expected / shankEvery : 0;
    const poison = procRank("Instant Poison", level);
    const venomUp = shankEvery ? Math.min(1, talentNumber(ctx, "Venom", /for (\d+) sec/) / shankEvery) : 0;
    const chance = (POISON_CHANCE + talentNumber(ctx, "Improved Poisons", /apply Poisons to your target by (\d+)%/) +
      venomUp * talentNumber(ctx, "Venom", /chance to apply Poisons by (\d+)%/)) / 100;
    const vile = (1 + talentNumber(ctx, "Vile Poisons", /dealt by your poisons by (\d+)%/) / 100) *
      (1 + venomUp * talentNumber(ctx, "Venom", /Poison damage by (\d+)%/) / 100);
    const perHit = poison ? chance * procAt(poison, level) * vile * ((100 - table(ctx, S, "magic").miss) / 100) * (1 + damagePct(S, 8) / 100) : 0;
    const swings = sum(melee.map((w) => (Math.max(0, 100 - w.miss - w.dodge - w.parry) / 100) / w.effSpeed)) * (1 + bf / 100);
    const poisonDps = (casts, haste) => perHit * (swings * (1 + haste / 100) + Math.max(0, casts) * 0.9 + (shankEvery ? 1 / shankEvery : 0));
    const noSndCasts = (energy / pick.energy) * (pick.n + 1) - replaced;
    const noSnd = whiteDps * (1 + bf / 100) + (energy / pick.energy) * pick.dmg - replaced * pick.b.expected + shankDps + poisonDps(noSndCasts, 0);
    let poisonPart = poisonDps(noSndCasts, 0);
    let sndPoints = null;
    if (snd && haste) {
      const longer = talentNumber(ctx, "Improved Slice and Dice", /by (\d+)%/);
      const cp = pick.n ? (COMBO_POINTS - ruthless) / pick.n : 1;
      let best = null;
      for (let points = 1; points <= COMBO_POINTS; points++) {
        const D = ((snd.durMs + (snd.durPerPoint || 0) * points) / 1000) * (1 + longer / 100);
        const nSnd = Math.max(0, (points - ruthless) / cp);
        const sndEnergy = nSnd * pick.b.cost + snd.cost - Math.min(1, rsChance * points / COMBO_POINTS) * (refund / (rsChance || 1));
        const k = Math.max(0, (energy * D - sndEnergy) / pick.energy);
        const builderDps = ((nSnd + pick.n * k) * pick.b.expected) / D - replaced * pick.b.expected;
        const evisDps = (k * evis.expected) / D;
        const poisoned = poisonDps((nSnd + (pick.n + 1) * k) / D - replaced, haste);
        const total = whiteDps * (1 + bf / 100) * (1 + haste / 100) + builderDps + evisDps + shankDps + poisoned;
        if (!best || total > best.total) best = { points, D, builderDps, evisDps, poisoned, total };
      }
      sndPoints = best.total >= noSnd ? best.points : 0;
      if (best.total >= noSnd) {
        dps = best.total;
        poisonPart = best.poisoned;
        parts.push({ name: `Slice and Dice (+${haste}% attack speed)`, dps: whiteDps * (1 + bf / 100) * (haste / 100) });
        parts.push({ name: `${pick.b.name} (builder)`, dps: best.builderDps }, { name: "Eviscerate (5 points)", dps: best.evisDps });
        notes.push(`Slice and Dice kept up at ${best.points} combo point${best.points > 1 ? "s" : ""} (${best.D.toFixed(0)} sec; the best length for your numbers), ` +
          `the rest into ${pick.b.name} to 5 points and Eviscerate`);
      } else {
        notes.push("Slice and Dice doesn't pay for itself with your gear yet (white hits too small): Eviscerate does more");
      }
    }
    if (dps == null) {
      dps = noSnd;
      parts.push({ name: `${pick.b.name} (builder)`, dps: ((energy / pick.energy) * pick.n - replaced) * pick.b.expected },
        { name: "Eviscerate (5 points)", dps: (energy / pick.energy) * evis.expected });
      notes.push(`${pick.b.name} to 5 combo points, then Eviscerate` + (snd ? "" : " (Slice and Dice comes at level 10)"));
    }
    if (shankDps) parts.push({ name: `Shank (every ${+shankEvery.toFixed(1)} sec)`, dps: shankDps });
    if (poison) {
      parts.push({ name: "Instant Poison (both weapons)", dps: poisonPart });
      notes.push(`Instant Poison on both weapons, ${Math.round(chance * 100)}% chance per hit (the base 20% is Classic's; not in the files)`);
    }
    notes.push(`${regen.toFixed(1)} energy per second` + (ar ? " (Adrenaline Rush averaged in)" : "") +
      (shankEnergy ? `, worth ${shankEnergy.toFixed(1)} more with Shank's energy` + (replaced ? " and combo points" : "") : ""));
    const counted = [sealFate && "Seal Fate", ruthless && "Ruthlessness", refund && "Relentless Strikes", bf && "Blade Flurry (averaged)",
      shankEvery && talentNumber(ctx, "Flash of Steel", /by (\d+) and/) && "Flash of Steel",
      shankEvery && talentNumber(ctx, "Boot Knife", /(\d+)% chance/) && "Boot Knife", shankEvery && talentNumber(ctx, "Venom", /for (\d+) sec/) && "Venom"]
      .filter(Boolean);
    if (counted.length) notes.push("counts " + counted.join(", "));
    if (dagger) notes.push("Backstab/Mutilate assume you're behind the target");
    notes.push("Eviscerate's attack power part is an estimate (3% per point; the game files don't hold it)");
    const note = notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") + "." + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, sndPoints, builder: pick.b.name };
  }

  const procRank = (name, level) => {
    let r = null;
    for (const x of (KP.abilities.PROCS || {})[name] || []) if (x.level <= level) r = x;
    return r;
  };
  const procAt = (p, level, key = "value", per = "perLevel") =>
    p[key] + (p[per] || 0) * Math.max(0, Math.min(level, p.maxLevel || level) - (p.spellLevel || p.level));
  const rawSwing = (S, w, extraAp = 0) => (w.weapon.min + w.weapon.max) / 2 + ((S.ap + extraAp) / 14) * w.weapon.speed;
  const swingWithAp = (S, mh, extraAp) => mh.perSwing * rawSwing(S, S.mh, extraAp) / rawSwing(S, S.mh);

  const SOC_PPM = 7;
  const SOR_SPEEDS = [1.5, 3.8];
  function retRotation(ctx, S, white, byName) {
    const mh = white.find((w) => w.label === "Main hand");
    if (!mh || !S.mh) return null;
    const level = ctx.level;
    const sealsPct = talentNumber(ctx, "Improved Seals", /by (\d+)%/) / 100;
    const holyPct = 1 + damagePct(S, 2) / 100;
    const vengeance = talentNumber(ctx, "Vengeance", /by (\d+)% for/) * 3;
    const vMult = 1 + vengeance / 100;
    const land = Math.max(0, 100 - mh.miss - mh.dodge - mh.parry) / 100;
    const crit = Math.min(100, S.crit - critSuppression(ctx)) / 100;
    const socRank = learnedTalent(ctx, "Seal of Command") && bookRank("PALADIN", "Seal of Command", level);
    const sorRank = bookRank("PALADIN", "Seal of Righteousness", level);
    const runs = [socRank, sorRank].filter(Boolean).map((r) => retSeal(r === socRank));
    if (!runs.length) return null;
    const best = runs.reduce((a, b) => (b.dps > a.dps ? b : a));
    const other = runs.find((r) => r !== best);
    if (other) best.notes.unshift(`Seal of ${best.seal} beats Seal of ${other.seal} here (${best.dps.toFixed(1)} vs ${other.dps.toFixed(1)} damage per second)`);
    const note = best.notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") + "." + buffNote(ctx);
    return { dps: best.dps, parts: best.parts.filter((p) => p.dps > 0.05), note, manaSpent: best.manaSpent,
      seal: best.seal, sealDps: Object.fromEntries(runs.map((r) => [r.seal, r.dps])) };

    function retSeal(useSoc) {
      const parts = [{ name: "White hits", dps: mh.dps * vMult }];
      let dps = mh.dps * vMult;
      const notes = [];
      const soc = useSoc && socRank;
      const jr = procRank(soc ? "Judgement of Command" : "Judgement of Righteousness", level);
      if (soc) {
        const perProc = (0.7 * rawSwing(S, S.mh) * (1 + crit) + 0.29 * spellPowerFor(S, 2)) * (1 + sealsPct) * holyPct * vMult;
        const d = (SOC_PPM / 60) * land * perProc;
        parts.push({ name: "Seal of Command procs", dps: d, spell: "Seal of Command", school: 2 });
        dps += d;
        notes.push(`Seal of Command at ${SOC_PPM} procs a minute (Classic's rate; not in the game files)`);
      } else if (jr && jr.sealValue) {
        const v = procAt(jr, level, "sealValue", "sealPerLevel"), sp = spellPowerFor(S, 2);
        const t = Math.min(1, Math.max(0, (S.mh.weapon.speed - SOR_SPEEDS[0]) / (SOR_SPEEDS[1] - SOR_SPEEDS[0])));
        const lo = v / 87 + 0.0765 * sp, hi = v / 25 + 0.12 * sp;
        const perHit = (lo + t * (hi - lo)) * (1 + sealsPct) * holyPct * vMult * (1 + Math.min(100, S.spellCrit) / 100 * 0.5);
        const d = land / mh.effSpeed * perHit;
        parts.push({ name: "Seal of Righteousness hits", dps: d, spell: "Seal of Righteousness", school: 2 });
        dps += d;
        notes.push(`Seal of Righteousness at ${Math.round(perHit)} Holy damage per hit with a ${S.mh.weapon.speed.toFixed(1)} sec weapon ` +
          `(estimate: the tooltip gives ${Math.round(lo)} to ${Math.round(hi)} from fast one-handers to slow two-handers)`);
      }
      const baseMana = (rules.baseMana.PALADIN || [])[level - 1] || 0;
      const sealCost = soc ? soc.cost : ((sorRank || {}).cost || 0);
      const shots = [];
      const jRank = bookRank("PALADIN", "Judgement", level);
      if (jr && jRank) {
        const cd = Math.max(1, jRank.cdMs / 1000 - talentNumber(ctx, "Improved Judgement", /by (\d+) sec/));
        let value = procAt(jr, level);
        if (soc) {
          const hoj = bookRank("PALADIN", "Hammer of Justice", level);
          const stunnedShare = hoj && hoj.cdMs ? Math.min(1, cd / (hoj.cdMs / 1000)) : 0;
          value = value / 2 * (1 + stunnedShare);
          notes.push(stunnedShare ? `Judgement of Command at half damage, except one a minute after Hammer of Justice (full damage on a stunned target)`
            : `Judgement of Command at half damage (full only on a stunned target)`);
        }
        const per = (value + jr.coef * spellPowerFor(S, 2)) * (1 + sealsPct) * holyPct * vMult * (1 + Math.min(100, S.spellCrit) / 100 * 0.5);
        const refund = talentNumber(ctx, "Sanctified Judgement", /return (\d+)%/) / 100;
        shots.push({ name: `Judgement (${soc ? "Command" : "Righteousness"})`, perUse: per, rate: cooldownUses(ctx, cd * 1000),
          mana: Math.max(0, (jRank.costPct || 6) * baseMana / 100 * (1 - talentNumber(ctx, "Benediction", /by (\d+)%/) / 100) - refund * sealCost),
          busy: 1.5, cast: 0, spell: "Judgement" });
        const sj = learnedTalent(ctx, "Swift Judgement") && bookRank("PALADIN", "Swift Judgement", level);
        if (sj && sj.cdMs) {
          shots.push({ name: "Swift Judgement", perUse: per, rate: cooldownUses(ctx, sj.cdMs),
            mana: (sj.costPct || 0) * baseMana / 100 + (sj.cost || 0), busy: 1.5, cast: 0 });
        }
      }
      const hs = byName["Holy Strike"];
      if (hs && !hs.locked && hs.expected) shots.push({ name: "Holy Strike", perUse: hs.expected * vMult, rate: cooldownUses(ctx, Math.max(1500, hs.cdMs)), mana: hs.cost, busy: 1.5, cast: 0 });
      const hotr = bookRank("PALADIN", "Hammer of the Righteous", level);
      const oneHand = S.mh.inv !== 17;
      if (hotr && oneHand) {
        const per = 3 * (rawSwing(S, S.mh) / S.mh.weapon.speed) * holyPct * vMult * (1 + Math.min(100, S.spellCrit) / 100 * 0.5);
        shots.push({ name: "Hammer of the Righteous", perUse: per, rate: cooldownUses(ctx, Math.max(1500, hotr.cdMs)), mana: (hotr.costPct || 6) * baseMana / 100, busy: 1.5, cast: 0 });
      }
      const how = byName["Hammer of Wrath"];
      if (how && !how.locked && how.expected) {
        shots.push({ name: "Hammer of Wrath (last 20%)", perUse: how.expected * vMult, rate: cooldownUses(ctx, Math.max(1500, how.cdMs), 0.2), mana: how.cost, busy: 1.5, cast: how.castMs / 1000, spell: "Hammer of Wrath" });
      }
      const hsh = ctx.tank && learnedTalent(ctx, "Holy Shield") && bookRank("PALADIN", "Holy Shield", level);
      let shieldMana = 0, shieldBusy = 0;
      if (hsh && hsh.procDamage && hsh.cdMs) {
        const charges = +((/(\d+) charges/.exec(bookDesc("PALADIN", "Holy Shield")) || [])[1] || Infinity);
        const blocks = Math.min(charges, (hsh.durMs / 1000) * swingOutcomes(S).block / MOB_SWING);
        const uses = cooldownUses(ctx, hsh.cdMs);
        const d = uses * blocks * hsh.procDamage * holyPct * vMult;
        parts.push({ name: `Holy Shield (kept up, ${blocks.toFixed(1)} blocks each)`, dps: d, spell: "Holy Shield", school: 2 });
        dps += d;
        shieldMana = uses * ((hsh.costPct || 0) * baseMana / 100 + (hsh.cost || 0));
        shieldBusy = uses * 1.5;
      }
      const budget = manaBudget(ctx, S, keepWhileCasting);
      const fitted = fitShots(shots, Math.max(0, budget.perSec - sealCost / 30 - shieldMana), shieldBusy);
      for (const s of fitted) {
        dps += s.dps;
        parts.push({ name: s.name + (s.f < 0.99 ? ` (${Math.round(s.f * 100)}% of cooldowns)` : ""), dps: s.dps, spell: s.spell || s.name, school: 2 });
      }
      if (fitted.some((s) => s.manaCut)) notes.push("your mana doesn't cover every cooldown over a 3-minute fight");
      const manaSpent = sealCost / 30 + shieldMana + manaUsed(fitted);
      if (vengeance) notes.push(`Vengeance counted at full stacks (+${vengeance}%)`);
      if (learnedTalent(ctx, "Unsealed Wrath")) notes.push("Unsealed Wrath's stored Seals (switching Seals mid-fight) aren't counted");
      notes.push("Judgement doesn't use up your Seal in Forever (game data), so it's used on every cooldown; Exorcism (Undead and Demons only) and Consecration (packs) aren't counted");
      return { dps, parts, notes, manaSpent, seal: soc ? "Command" : "Righteousness" };
    }
  }

  const IMBUE_SPELLS = { windfury: "Windfury Weapon", rockbiter: "Rockbiter Weapon" };
  function imbueOf(ctx) {
    if (ctx.cls.token !== "SHAMAN") return null;
    if (ctx.imbue) return ctx.imbue === "none" ? null : ctx.imbue;
    return bookRank("SHAMAN", "Windfury Weapon", ctx.level) ? "windfury" : bookRank("SHAMAN", "Rockbiter Weapon", ctx.level) ? "rockbiter" : null;
  }
  function rockbiterAp(ctx) {
    let rank = null;
    for (const r of (KP.abilities.IMBUES || {})["Rockbiter Weapon"] || []) if (r.level <= ctx.level) rank = r;
    return rank ? procAt(rank, ctx.level) * (1 + talentNumber(ctx, "Elemental Weapons", /Rockbiter Weapon by (\d+)%/) / 100) : 0;
  }

  function enhRotation(ctx, S, white, byName) {
    const mh = white.find((w) => w.label === "Main hand");
    if (!mh) return null;
    const level = ctx.level;
    const parts = [], notes = [];
    const rof = learnedTalent(ctx, "Rage of the Farseer") && bookRank("SHAMAN", "Rage of the Farseer", level);
    const rofDesc = ((((KP.spellbook || {}).SHAMAN || []).find((b) => b.name === "Rage of the Farseer")) || {}).desc || "";
    const haste = rof ? parseFloat((/speed by (\d+)%/.exec(rofDesc) || [])[1] || 0) * cooldownShare(ctx, rof.durMs || 25000, rof.cdMs) : 0;
    const swingsPerSec = (1 + haste / 100) / mh.effSpeed;
    let dps = mh.perSwing * mh.swings * swingsPerSec;
    parts.push({ name: "White hits", dps });
    const wf = S.imbue === "windfury" && bookRank("SHAMAN", "Windfury Weapon", level);
    if (S.imbue === "rockbiter") notes.push(`Rockbiter Weapon on your weapon: +${Math.round(rockbiterAp(ctx))} attack power (game data)`);
    if (wf) {
      const wfDesc = ((((KP.spellbook || {}).SHAMAN || []).find((b) => b.name === "Windfury Weapon")) || {}).desc || "";
      const m = /(\d+)% chance of granting you (\d+) extra attacks? with (\d+) extra melee attack power/.exec(wfDesc);
      if (m) {
        const boost = 1 + talentNumber(ctx, "Elemental Weapons", /Windfury Weapon effect by (\d+)%/) / 100;
        const land = Math.max(0, 100 - mh.miss - mh.dodge - mh.parry) / 100;
        const extra = parseFloat(m[1]) / 100 * parseFloat(m[2]) * land;
        const d = swingsPerSec * extra * swingWithAp(S, mh, parseFloat(m[3]) * boost);
        parts.push({ name: "Windfury Weapon (extra attacks)", dps: d });
        dps += d;
        notes.push(`Windfury Weapon: ${m[1]}% chance per hit of ${m[2]} extra attacks with +${Math.round(parseFloat(m[3]) * boost)} attack power (game data; any internal cooldown isn't in the files)`);
      }
    }
    const shots = [];
    const ss = byName["Stormstrike"];
    const baseMana = (rules.baseMana.SHAMAN || [])[level - 1] || 0;
    const manaOf = (a) => a.cost || (a.costPct ? (a.costPct * baseMana) / 100 : 0);
    const ssRate = ss && !ss.locked && ss.expected ? cooldownUses(ctx, Math.max(1500, ss.cdMs)) : 0;
    if (ssRate) shots.push({ name: "Stormstrike", perUse: ss.expected, rate: ssRate, mana: manaOf(ss), busy: 1.5, cast: 0 });
    const usableShock = (n) => byName[n] && !byName[n].locked && byName[n].expected ? byName[n] : null;
    const fs = usableShock("Flame Shock");
    const direct = ["Earth Shock", "Frost Shock"].map(usableShock).filter(Boolean).sort((a, b) => b.expected - a.expected)[0];
    const shockCd = Math.max(1.5, (((direct || fs) || {}).cdMs || 6000) / 1000);
    const shocks = cooldownUses(ctx, shockCd * 1000);
    const fsCast = fs && dotRecast(ctx, fs.durMs, fs.ticks, shockCd * 1000);
    const fsRate = fs ? Math.min(shocks, 1000 / fsCast.everyMs) : 0;
    if (fs) shots.push({ name: "Flame Shock", perUse: fs.expected - fs.dotExpected * (1 - fsCast.landed), rate: fsRate, mana: manaOf(fs), busy: 1.5, cast: 0, keptUp: fs.durMs / 1000 > shockCd });
    if (direct && shocks - fsRate > 1e-9) {
      const rate = shocks - fsRate;
      const buffed = direct.name === "Earth Shock" ? Math.min(1, ssRate / rate) * 0.2 : 0;
      shots.push({ name: direct.name, perUse: direct.expected * (1 + buffed), rate, mana: manaOf(direct), busy: 1.5, cast: 0 });
    }
    const keep = (ctx) => Math.max(keepWhileCasting(ctx), ssRate && learnedTalent(ctx, "Improved Stormstrike") ? 50 : 0);
    const fitted = fitShots(shots, manaBudget(ctx, S, keep).perSec);
    for (const s of fitted) {
      dps += s.dps;
      const label = s.keptUp ? `${s.name} (burn kept up${s.f < 0.99 ? `, ${Math.round(s.f * 100)}% of the time` : ""})`
        : s.name + (s.f < 0.99 ? ` (${Math.round(s.f * 100)}% of cooldowns)` : "");
      parts.push({ name: label, dps: s.dps });
    }
    if (haste) notes.push(`Rage of the Farseer averages +${haste.toFixed(1)}% attack speed`);
    if (fs && fsRate < shocks) notes.push(`Flame Shock once per burn (a new one replaces the old burn), ${direct ? direct.name : "nothing"} on the other shock cooldowns`);
    if (fitted.some((s) => s.manaCut)) notes.push("your mana doesn't cover everything over a 3-minute fight (the least damage per mana is cut first: " +
      fitted.filter((s) => s.manaCut).map((s) => s.name).join(", ") + ")");
    const manaSpent = manaUsed(fitted);
    notes.push("Lightning Bolts with Maelstrom Weapon and Flametongue Weapon (its damage is the server's) aren't counted yet");
    const note = notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") + "." + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, manaSpent };
  }

  function catRotation(ctx, S, white, byName) {
    const whiteDps = sum(white.filter((w) => w.label === "Main hand").map((w) => w.dps));
    const ok = (n) => byName[n] && !byName[n].locked && byName[n].expected > 0 && byName[n].cost;
    const builders = ["Shred", "Claw"].filter(ok).map((n) => byName[n]);
    if (!builders.length) return null;
    const builder = builders.sort((a, b) => b.expected / b.cost - a.expected / a.cost)[0];
    const bite = ok("Ferocious Bite") ? byName["Ferocious Bite"] : null;
    const rake = ok("Rake") ? byName["Rake"] : null;
    const rip = ok("Rip") ? byName["Rip"] : null;
    const rnt = talentNumber(ctx, "Rend and Tear", /by (\d+)%/) / 100;
    const regen = 10;
    const rakeCast = rake && dotRecast(ctx, rake.durMs || 9000, rake.ticks), ripCast = rip && dotRecast(ctx, rip.durMs || 12000, rip.ticks);
    const landedOf = (a, cast) => a.expected - a.dotExpected * (1 - cast.landed);
    let best = null;
    for (const useRake of rake ? [false, true] : [false]) {
      for (const useRip of rip ? [false, true] : [false]) {
        let rakeRate = useRake ? 1 / Math.max(1, rakeCast.everyMs / 1000) : 0;
        let ripRate = useRip ? 1 / Math.max(1, ripCast.everyMs / 1000) : 0;
        const need = rakeRate * (useRake ? rake.cost : 0) + Math.max(0, COMBO_POINTS * ripRate - rakeRate) * builder.cost +
          ripRate * (useRip ? rip.cost : 0);
        if (need > regen) { rakeRate *= regen / need; ripRate *= regen / need; }
        const cpForRip = Math.max(0, COMBO_POINTS * ripRate - rakeRate);
        const fixed = rakeRate * (useRake ? rake.cost : 0) + cpForRip * builder.cost + ripRate * (useRip ? rip.cost : 0);
        const left = Math.max(0, regen - fixed);
        const biteRate = bite ? left / (COMBO_POINTS * builder.cost + bite.cost) : 0;
        const builderRate = cpForRip + biteRate * COMBO_POINTS + (bite ? 0 : left / builder.cost);
        const upFrac = (rate, dur) => Math.min(1, rate * dur / 1000);
        const bleedUp = Math.max(useRake ? upFrac(rakeRate, rake.durMs || 9000) : 0, useRip ? upFrac(ripRate, rip.durMs || 12000) : 0);
        const mult = 1 + rnt * bleedUp;
        const parts = [{ name: "White hits (Cat Form)", dps: whiteDps }];
        const up = (rate, dur) => Math.round(upFrac(rate, dur) * 100);
        if (useRake) parts.push({ name: `Rake (up ${up(rakeRate, rake.durMs || 9000)}%)`, dps: rakeRate * landedOf(rake, rakeCast) * mult });
        if (useRip) parts.push({ name: `Rip (5 points, up ${up(ripRate, rip.durMs || 12000)}%)`, dps: ripRate * landedOf(rip, ripCast) * mult });
        parts.push({ name: `${builder.name} (builder)`, dps: builderRate * builder.expected * mult });
        if (bite) parts.push({ name: "Ferocious Bite (5 points)", dps: biteRate * bite.expected * mult });
        const dps = sum(parts.map((p) => p.dps));
        if (!best || dps > best.dps) best = { dps, parts, useRake, useRip, bleedUp, bites: biteRate > 0.001 };
      }
    }
    const uses = [best.useRake && "Rake", best.useRip && "Rip at 5 points", best.bites && "Ferocious Bite at 5 points"].filter(Boolean);
    const notes = [`${builder.name} builds combo points for ${uses.join(", ").replace(/, ([^,]*)$/, " and $1") || "nothing yet"} ` +
      "(10 energy per second; whichever mix does the most damage for your numbers)"];
    if (rnt && best.bleedUp) notes.push(`Rend and Tear +${Math.round(rnt * 100)}% while a bleed is up (${Math.round(best.bleedUp * 100)}% of the time)`);
    if (builder.name === "Shred") notes.push("Shred assumes you're behind the target");
    notes.push(S.mh.ownAttack ? "Cat Form's own attack follows the original game's rule (the game files don't hold it)"
      : "your weapon's damage counts at Cat Form's speed (a guild Druid's character sheet shows it)");
    return { dps: best.dps, parts: best.parts.filter((p) => p.dps > 0.05),
      note: notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") + "." + buffNote(ctx) };
  }

  function bearRotation(ctx, S, white, byName) {
    const mh = white.find((w) => w.label === "Main hand");
    if (!mh) return null;
    let rage = rageFromDamage(mh.perSwing, ctx.level) / mh.effSpeed;
    const frenzy = talentNumber(ctx, "Blood Frenzy", /gain an additional (\d+) Rage/);
    if (frenzy) rage += (mh.crit / 100) / mh.effSpeed * frenzy;
    let dps = mh.dps;
    const parts = [{ name: "White hits (Bear Form)", dps: mh.dps }];
    const ok = (n) => byName[n] && !byName[n].locked && byName[n].expected > 0;
    const pb = ok("Primal Bite") ? byName["Primal Bite"] : null;
    if (pb && pb.cdMs) {
      const perSec = cooldownUses(ctx, pb.cdMs), f = Math.min(1, rage / (pb.cost * perSec || 1));
      rage -= pb.cost * perSec * f;
      parts.push({ name: "Primal Bite (on cooldown)", dps: pb.expected * perSec * f, spell: "Primal Bite" });
      dps += pb.expected * perSec * f;
    }
    const lac = ok("Lacerate") ? byName["Lacerate"] : null;
    if (lac && rage > 0) {
      const perSec = 1 / Math.max(1, (lac.durMs || 15000) / 1000), f = Math.min(1, rage / (lac.cost * perSec || 1));
      rage -= lac.cost * perSec * f;
      parts.push({ name: "Lacerate (5 stacks kept up)", dps: lac.expected * 5 * perSec * f, spell: "Lacerate" });
      dps += lac.expected * 5 * perSec * f;
    }
    const maul = ok("Maul") ? byName["Maul"] : null;
    if (maul && rage > 0) {
      const swingRage = rageFromDamage(mh.perSwing, ctx.level);
      const perSec = Math.min(rage / (maul.cost + swingRage), 1 / mh.effSpeed);
      const d = perSec * Math.max(0, maul.expected - mh.perSwing);
      parts.push({ name: `Maul (${Math.round(perSec * mh.effSpeed * 100)}% of swings)`, dps: d, spell: "Maul" });
      dps += d;
    }
    const note = "Rage from your own hits (Classic formula)" + (frenzy ? ", Blood Frenzy counted" : "") +
      "; being hit gives a tank much more, not counted. Primal Bite on cooldown, Lacerate at 5 stacks, Maul with the rest. " +
      (S.mh.ownAttack ? "Bear Form's own attack follows the original game's rule (the game files don't hold it)."
        : "Your weapon's damage counts at Bear Form's speed (a guild Druid's character sheet shows it).") + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note };
  }

  const FIGHT_SEC = 180;

  const manaUsed = (fitted) => sum(fitted.map((s) => s.rate * s.f * (s.mana || 0)));
  function fitShots(shots, manaPerSec, taken = 0) {
    let time = 0.95 - taken;
    for (const s of [...shots].sort((a, b) => b.perUse / (b.busy || 1e-9) - a.perUse / (a.busy || 1e-9))) {
      const need = s.rate * s.busy;
      s.f = need ? Math.max(0, Math.min(1, time / need)) : 1;
      time -= need * s.f;
    }
    let mana = manaPerSec;
    for (const s of [...shots].sort((a, b) => (b.mana ? b.perUse / b.mana : Infinity) - (a.mana ? a.perUse / a.mana : Infinity))) {
      const need = s.rate * s.f * s.mana;
      if (need > mana) { s.f *= need ? Math.max(0, mana / need) : 1; s.manaCut = true; }
      mana -= s.rate * s.f * s.mana;
    }
    return shots.map((s) => ({ ...s, dps: s.perUse * s.rate * s.f }));
  }

  const PET_DPS_PER_LEVEL = 0.82;
  const PET_RAP_SHARE = 0.1;
  const PET_SPEED = 2;
  function petRawDps(level, rap) {
    const m = KP.measured.petDps, last = Math.max(...Object.keys(m).map(Number));
    const own = byLevel(m, level, m[last] + PET_DPS_PER_LEVEL * (60 - last),
      (first) => m[first] - PET_DPS_PER_LEVEL * (first - level));
    return own + (PET_RAP_SHARE * rap) / 14;
  }
  function petFamilyText() {
    const all = Object.entries(rules.petFamilies), bonuses = all.map(([, f]) => f.damage);
    const at = (v) => `${all.filter(([, f]) => f.damage === v).map(([name]) => name).join(" and ")} ${v > 0 ? "+" : ""}${v}%`;
    return `${at(Math.max(...bonuses))}, ${at(Math.min(...bonuses))}`;
  }
  const PET_HAPPY = 1.25;
  function petBiteDps(ctx) {
    const rank = rules.petBite.ranks.findLast((r) => r.level <= ctx.level);
    return rank.damage * PET_HAPPY * cooldownUses(ctx, rules.petBite.cdMs);
  }
  function petDamage(ctx, S) {
    if (learnedTalent(ctx, "Lone Wolf") || !bookRank("HUNTER", "Revive Pet", ctx.level)) return null;
    const d = Math.max(0, Math.min(3, ctx.target.diff));
    const t = table(ctx, { hit: 0, expertise: 0 }, "melee");
    const glance = GLANCE_CHANCE[d];
    const crit = Math.max(0, talentNumber(ctx, "Ferocity", /by (\d+)%/) - critSuppression(ctx));
    const hit = 100 - t.miss - t.dodge - t.parry - glance - crit;
    const perSwing = (hit + crit * 2 + glance * GLANCE_DAMAGE[d]) / 100;
    const perBite = (100 - t.miss - t.dodge - t.parry + crit) / 100;
    const haste = talentNumber(ctx, "Frenzy", /(\d+)% attack speed/);
    const swingsInFrenzy = (talentNumber(ctx, "Frenzy", /for (\d+) sec/) * (1 + haste / 100)) / PET_SPEED;
    const frenzyChance = (crit / 100) * (talentNumber(ctx, "Frenzy", /(\d+)% chance/) / 100);
    const frenzy = (haste / 100) * (1 - (1 - frenzyChance) ** swingsInFrenzy);
    const wrath = bookRank("HUNTER", "Bestial Wrath", ctx.level);
    const wrathBonus = wrath ? (talentNumber(ctx, "Bestial Wrath", /causing (\d+)% additional/) / 100) * cooldownShare(ctx, wrath.durMs, wrath.cdMs) : 0;
    const scale = (1 - mitigation(ctx, { tal: { armorIgnore: 0 } })) * (1 + wrathBonus) *
      (1 + talentNumber(ctx, "Unleashed Fury", /by (\d+)%/) / 100) * (1 + talentNumber(ctx, "Focused Fire", /by (\d+)%/) / 100);
    return { melee: petRawDps(ctx.level, S.rap) * perSwing * (1 + frenzy) * scale, bite: petBiteDps(ctx) * perBite * scale };
  }

  function hunterRotation(ctx, S, white, byName) {
    const style = hunterStyle(ctx);
    const level = ctx.level;
    const baseMana = rules.baseMana.HUNTER[level - 1] || 0;
    const manaOf = (a) => a.cost || (a.costPct ? (a.costPct * baseMana) / 100 : 0);
    const learned = (name) => {
      const i = ctx.flat.findIndex((t) => t.name === name);
      return i >= 0 ? ctx.ranks[i] || 0 : 0;
    };
    const talentEffect = (name, test) => {
      const i = ctx.flat.findIndex((t) => t.name === name);
      const r = i >= 0 ? ctx.ranks[i] : 0;
      return r ? (ctx.flat[i].effects[r - 1] || []).find(test) : null;
    };
    const rf = ((KP.spellbook || {}).HUNTER || []).find((b) => b.name === "Rapid Fire");
    const rfRank = rf && [...rf.ranks].reverse().find((r) => (r.level || 1) <= level);
    let haste = 0;
    if (rfRank) {
      const pct = parseFloat((/speed by (\d+)/.exec(rf.desc) || [])[1] || 0);
      const cut = talentEffect("Rapid Killing", (e) => e.aura === 107 && e.misc === 11);
      const cd = Math.max(1, rfRank.cdMs + (cut ? cut.value : 0));
      haste = pct * cooldownShare(ctx, rfRank.durMs || 15000, cd);
    }
    const keepPct = (withSting) => Math.max(0, ...ctx.flat.map((t, i) => {
      const r = ctx.ranks[i];
      if (!r || (t.name === "Rapid Recuperation" && !withSting)) return 0;
      const m = /allows? (\d+)% of your Mana Regeneration to continue while casting/i.exec(t.desc[r - 1] || "");
      return m ? parseFloat(m[1]) : 0;
    }));
    const spiritRegen = spiritRegenOf(S.attr.spirit);
    const manaPerSec = (withSting) => ctx.manaPerSec != null ? ctx.manaPerSec
      : (S.mana + (S.mp5 / 5 + spiritRegen * keepPct(withSting) / 100) * FIGHT_SEC) / FIGHT_SEC;
    const shot = (a, opts = {}) => {
      if (!a || a.locked || !(a.expected > 0)) return null;
      const each = !opts.rate && !opts.every && a.cdMs ? cooldownCasts(ctx, a.durMs, Math.max(1500, a.cdMs)) : null;
      return { name: opts.name || a.name,
        perUse: opts.perUse != null ? opts.perUse : a.expected - (each ? a.dotExpected * (1 - each.landed) : 0),
        rate: opts.rate || (each ? each.rate : 1 / Math.max(1.5, (opts.every || 1500) / 1000)), mana: manaOf(a),
        busy: opts.busy != null ? opts.busy : Math.max(1.5, a.castMs / 1000), cast: a.castMs / 1000 };
    };
    const parts = [];
    let dps = 0;
    const notes = [];
    const starved = [];
    let manaSpent = 0;
    const arcane = byName["Arcane Shot"], hawk = byName["Summon Hawk"];
    const hawkUp = hawk && !hawk.locked && hawk.expected > 0 && (!arcane || hawk.expected > arcane.expected);
    if (hawk && !hawk.locked) notes.push(`Summon Hawk's dive ${hawkUp ? "beats" : "is smaller than"} Arcane Shot (shared cooldown); the hawk's attacks after the dive aren't counted`);

    if (style === "ranged") {
      const auto = white.find((w) => w.label === "Ranged");
      if (!auto) return null;
      const aimed = byName["Aimed Shot"], multi = byName["Multi-Shot"];
      const big = aimed && (!multi || aimed.expected >= multi.expected) ? aimed : multi;
      const sting = byName["Serpent Sting"];
      const stingCast = sting && sting.durMs ? dotRecast(ctx, sting.durMs, sting.ticks) : null;
      const shots = [shot(big), shot(hawkUp ? hawk : arcane), shot(byName["Sniper Shot"]),
        shot(sting, stingCast ? { every: stingCast.everyMs, perUse: sting.expected - sting.dotExpected * (1 - stingCast.landed) } : {})].filter(Boolean);
      const fitted = fitShots(shots, manaPerSec(shots.some((s) => s.name === "Serpent Sting")));
      manaSpent = manaUsed(fitted);
      starved.push(...fitted.filter((s) => s.manaCut).map((s) => s.name));
      const castFrac = Math.min(0.9, sum(fitted.map((s) => s.rate * s.f * s.cast)));
      const autoDps = auto.dps * (1 + haste / 100) * (1 - castFrac);
      parts.push({ name: "Auto Shot", dps: autoDps });
      dps += autoDps;
      for (const s of fitted) {
        dps += s.dps;
        parts.push({ name: s.name + (s.f < 0.99 ? ` (${Math.round(s.f * 100)}% of cooldowns)` : ""), dps: s.dps });
      }
      const self = hunterSelfBuffs(ctx);
      notes.push("Auto Shot plus " + (fitted.map((s) => s.name).join(", ") || "no shots yet") + " as often as cooldowns, casting and mana allow");
      if (self.length) notes.push(self.map((b) => `${b.name} +${b.value}`).join(" and ") + " ranged attack power included");
      if (castFrac > 0.01) notes.push(`Auto Shot pauses ${Math.round(castFrac * 100)}% of the time while you cast`);
    } else {
      const mh = white.find((w) => w.label === "Main hand");
      if (!mh) return null;
      for (const w of white.filter((x) => x.label !== "Ranged" && x.label !== "Wand")) {
        const d = w.dps * (1 + haste / 100);
        parts.push({ name: `${w.label} (white)`, dps: d });
        dps += d;
      }
      const raptor = byName["Raptor Strike"];
      const shots = [];
      if (raptor && !raptor.locked) shots.push(shot(raptor, { perUse: Math.max(0, raptor.expected - mh.perSwing),
        rate: cooldownUses(ctx, Math.max(raptor.cdMs, mh.effSpeed * 1000)), busy: 0 }));
      shots.push(shot(byName["Strider Kick"]));
      if (hawk && !hawk.locked) shots.push(shot(hawk));
      const mb = byName["Mongoose Bite"];
      const expose = talentEffect("Expose Prey", (e) => e.aura === 42);
      if (mb && expose) {
        const swingsPerSec = sum(white.filter((x) => x.label !== "Ranged" && x.label !== "Wand").map((w) => 1 / w.effSpeed));
        const bleed = learned("Lacerating Strikes") ? 1.4 : 1;
        shots.push(shot(mb, { perUse: mb.expected * bleed, rate: Math.min(1 / (mb.cdMs / 1000), swingsPerSec * expose.value / 100) }));
      }
      const lac = byName["Lacerate"];
      const lacCast = lac && lac.durMs ? dotRecast(ctx, lac.durMs, lac.ticks) : null;
      shots.push(shot(lac, lacCast ? { every: lacCast.everyMs, perUse: lac.expected - lac.dotExpected * (1 - lacCast.landed) } : {}));
      const trap = byName["Immolation Trap"];
      shots.push(shot(trap));
      const fitted = fitShots(shots.filter(Boolean), manaPerSec(false));
      manaSpent = manaUsed(fitted);
      starved.push(...fitted.filter((s) => s.manaCut).map((s) => s.name));
      for (const s of fitted) {
        dps += s.dps;
        parts.push({ name: s.name + (s.f < 0.99 ? ` (${Math.round(s.f * 100)}% of cooldowns)` : ""), dps: s.dps });
      }
      notes.push("Melee: white hits plus " + (fitted.map((s) => s.name).join(", ") || "no abilities yet") + " as cooldowns and mana allow");
      if (mb && !expose) notes.push("Mongoose Bite only after you dodge (not counted unless you take Expose Prey)");
    }
    if (haste) notes.push(`Rapid Fire averages +${haste.toFixed(1)}% attack speed`);
    if (starved.length) notes.push(`not enough mana for every ${starved.join(" / ")} (lowest damage per mana goes first)`);
    notes.push(`mana over a ${FIGHT_SEC / 60}-minute fight (${REGEN_RULE}); Aspect of the Viper not used`);
    const pet = petDamage(ctx, S);
    if (pet) {
      parts.push({ name: "Pet", dps: pet.melee }, { name: "Pet's Bite", dps: pet.bite });
      dps += pet.melee + pet.bite;
      const measuredTo = Math.max(...Object.keys(KP.measured.petDps).map(Number));
      notes.push(`the pet's melee counts for a well-fed pet of a family with no damage bonus (${petFamilyText()}), measured to level ${measuredTo} and an estimate above; ` +
        "Bite on autocast at the best rank for its level, from the game files and a combat log; Claw and the families' own abilities aren't counted");
    }
    const note = notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") + "." + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, starved, manaSpent };
  }

  function whiteHits(ctx, S) {
    const out = [];
    const pr = procs(ctx, S);
    const d = Math.max(0, Math.min(3, ctx.target.diff));
    const dual = !!(S.mh && S.oh);
    const physPct = damagePct(S, 1);
    const mit = mitigation(ctx, S);
    const swing = (item, label, mult, ranged) => {
      const w = item.weapon;
      const ap = ranged ? S.rap : S.ap;
      const isWand = item.subclass === 19;
      const physical = !w.school;
      const apBonus = isWand ? 0 : (ap / 14) * w.speed;
      const scale = mult * (1 + (physical ? physPct : damagePct(S, 1 << w.school)) / 100) * (physical ? 1 - mit : 1) *
        (ranged ? 1 + rangedPct(S, item) / 100 : 1);
      const min = (w.min + apBonus) * scale, max = (w.max + apBonus) * scale;
      const avg = (min + max) / 2;
      const moreMiss = (dual && !ranged ? DUAL_WIELD_MISS : 0) - (label === "Off hand" ? S.tal.offhandHit : 0);
      const t = isWand ? table(ctx, S, "magic") : table(ctx, S, ranged ? "ranged" : "melee", moreMiss);
      const miss = t.miss;
      const glance = !ranged ? GLANCE_CHANCE[d] : 0;
      const critBase = isWand ? S.spellCrit : S.crit - critSuppression(ctx);
      const crit = Math.max(0, Math.min(critBase, 100 - miss - t.dodge - t.parry - glance));
      const hit = Math.max(0, 100 - miss - t.dodge - t.parry - glance - crit);
      const critMult = isWand ? 1.5 : 2;
      const perSwing = avg * (hit + crit * critMult + glance * GLANCE_DAMAGE[d]) / 100;
      const effSpeed = ranged ? w.speed / (1 + (isWand ? S.castHaste : S.rangedHaste) / 100)
        : w.speed / ((1 + pr.haste / 100) * (1 + S.meleeHaste / 100));
      const swings = ranged || label !== "Main hand" ? 1 : 1 + pr.extraAttack;
      let deepWounds = 0;
      if (pr.deepWounds && label === "Main hand") {
        const critsPerSec = (crit / 100) / effSpeed + 0.25 * Math.max(0, S.crit - critSuppression(ctx)) / 100;
        const uptime = Math.min(1, critsPerSec * 12);
        deepWounds = uptime * pr.deepWounds * ((w.min + w.max) / 2 + (S.ap / 14) * w.speed) / 12;
      }
      out.push({
        label, item: item.name, twoHand: item.inv === 17, min, max, avg, critAvg: avg * critMult, speed: w.speed, effSpeed, perSwing, swings,
        dps: (perSwing * swings) / effSpeed, miss, dodge: t.dodge, parry: t.parry, glance, crit, hit, deepWounds, procs: pr.lines,
      });
    };
    if (S.mh) swing(S.mh, "Main hand", 1, false);
    if (S.oh) swing(S.oh, "Off hand", 0.5 * (1 + S.tal.offhandPct / 100), false);
    if (S.rg) swing(S.rg, S.rg.subclass === 19 ? "Wand" : "Ranged", 1, true);
    return out;
  }

  function pickRank(ab, level) {
    let best = null;
    for (const r of ab.ranks) if (r.level <= level && (!best || r.level >= best.level)) best = r;
    return best;
  }

  function modsFor(S, rank) {
    const list = S.tal.mods.filter((m) => overlap(m.mask, rank.mask) || (rank.mask2 && overlap(m.mask, rank.mask2)));
    const flat = (op) => sum(list.filter((m) => m.op === op && !m.pct).map((m) => m.value));
    const pct = (op) => sum(list.filter((m) => m.op === op && m.pct).map((m) => m.value));
    return { list, flat, pct };
  }

  const value = (e, rank, level) => {
    const L = rank.maxLevel ? Math.min(level, rank.maxLevel) : level;
    return e.base + e.perLevel * Math.max(0, L - rank.spellLevel);
  };

  const ONE_TARGET = [5, 6, 21, 25, 45, 57, 77];
  function targetsHit(e, src, n) {
    if (!n || n <= 1 || e.target === 1) return { hits: 1, mult: 1 };
    if (ONE_TARGET.includes(e.target)) {
      if (!(e.chain > 1)) return { hits: 1, mult: 1 };
      const hits = Math.min(n, e.chain), amp = e.chainAmp || 1;
      let mult = 0;
      for (let k = 0; k < hits; k++) mult += amp ** k;
      return { hits, mult };
    }
    const heal = e.effect === 10 || (e.effect === 6 && (e.aura === 8 || e.aura === 69));
    const hits = Math.min(n, e.maxTargets || src.maxTargets || (heal ? 5 : n));
    return { hits, mult: hits };
  }

  const UNSHOWN_AP = { "Thunder Clap": 0.07, Rake: 0.065 };
  const UNSHOWN_AP_PER_TICK = { Rend: 0.02, Rake: 0.065 };
  const BLOCK_VALUE_SHARE = { "Shield Slam": 2 };

  function effectDamage(effects, src, S, ctx, weaponSlot, mods) {
    const kind = src.defense === 3 ? "ranged" : src.defense === 2 ? "melee" : "magic";
    const physical = (src.school || 1) === 1;
    const weaponItem = kind === "ranged" ? S.rg : weaponSlot === "offHand" ? S.oh : S.mh;
    const ap = kind === "ranged" ? S.rap : S.ap;
    let weapon = null, flat = 0, wpct = 1, dmin = 0, dmax = 0, dot = 0, heal = 0, ticks = 0, needsWeapon = false;
    let hasDirect = false;
    const coefMult = 1 + mods.pct(24) / 100;
    const spellPower = physical ? 0 : spellPowerFor(S, src.school);
    let combo = false, single = false, area = false;
    let hits = 1, wMult = 1;
    let textBonus = src.textShares && !AP_DUMMY[src.familyName]
      ? (src.textShares.AP || 0) * S.ap + (src.textShares.RAP || 0) * S.rap : 0;
    for (const e of effects) {
      const hitsTarget = e.target !== 1;
      const isDamage = [2, 17, 31, 58, 121].includes(e.effect) || (e.effect === 6 && (e.aura === 3 || e.aura === 53));
      if (isDamage && !hitsTarget) continue;
      if (isDamage) { if (SINGLE_TARGET.includes(e.target)) single = true; else area = true; }
      const v = value(e, src, ctx.level);
      const spread = (e.variance || 0) / 2;
      const perCombo = (e.perResource || 0) * COMBO_POINTS;
      if (perCombo) combo = true;
      const th = targetsHit(e, src, ctx.targets);
      const m = th.mult;
      switch (e.effect) {
        case 17: case 58: case 121: {
          if (!weaponItem) { needsWeapon = true; break; }
          const speed = e.effect === 121 ? normalSpeed(weaponItem, kind) : weaponItem.weapon.speed;
          weapon = { min: weaponItem.weapon.min + (ap / 14) * speed, max: weaponItem.weapon.max + (ap / 14) * speed };
          flat += v;
          hasDirect = true;
          wMult = Math.max(wMult, m); hits = Math.max(hits, th.hits);
          break;
        }
        case 31:
          wpct *= v / 100;
          if (!weapon && weaponItem) {
            const speed = weaponItem.weapon.speed;
            weapon = { min: weaponItem.weapon.min + (ap / 14) * speed, max: weaponItem.weapon.max + (ap / 14) * speed };
          }
          if (!weaponItem) needsWeapon = true;
          hasDirect = true;
          wMult = Math.max(wMult, m); hits = Math.max(hits, th.hits);
          break;
        case 2: {
          const bonus = (physical ? 0 : e.coef * spellPower * coefMult) + (e.apCoef || 0) * ap + (UNSHOWN_AP[src.familyName] || 0) * ap +
            (BLOCK_VALUE_SHARE[src.familyName] || 0) * S.blockValue +
            (FINISHER_AP_PER_POINT[src.familyName] || 0) * ap * COMBO_POINTS + (e.apCoef ? 0 : textBonus);
          textBonus = 0;
          dmin += (v * (1 - spread) + perCombo + bonus) * m;
          dmax += (v * (1 + spread) + perCombo + bonus) * m;
          hasDirect = true;
          hits = Math.max(hits, th.hits);
          break;
        }
        case 3:
          if (AP_DUMMY[src.familyName] === e.i) { dmin += (ap * v) / 100 * m; dmax += (ap * v) / 100 * m; hasDirect = true; }
          else if (src.familyName === "Execute" && e.i === 0) { dmin += v; dmax += v; hasDirect = true; }
          else if (WEAPON_DPS_DUMMY[src.familyName] === e.i) {
            if (!weaponItem) { needsWeapon = true; break; }
            const w = weaponItem.weapon;
            const dps = ((w.min + w.max) / 2 + (ap / 14) * w.speed) / w.speed;
            dmin += v * dps * m; dmax += v * dps * m; hasDirect = true;
            hits = Math.max(hits, th.hits);
          }
          break;
        case 10:
          heal += (v + e.coef * S.healing * coefMult) * m;
          hits = Math.max(hits, th.hits);
          break;
        case 6:
          if (e.aura === 3 || e.aura === 53) {
            const dur = (src.durMs || 0) + (perCombo ? (LONGER_PER_POINT[src.familyName] || 0) * COMBO_POINTS : 0);
            const n = e.period ? Math.floor(dur / e.period) : 0;
            ticks = Math.max(ticks, n);
            dot += n * (v + perCombo + (physical ? 0 : e.coef * spellPower * coefMult) + (UNSHOWN_AP_PER_TICK[src.familyName] || 0) * ap) * m;
            if (hitsTarget) hits = Math.max(hits, th.hits);
          } else if (e.aura === 8) {
            const n = e.period ? Math.floor((src.durMs || 0) / e.period) : 0;
            heal += n * (v + e.coef * S.healing * coefMult) * m;
            hits = Math.max(hits, th.hits);
          } else if (e.aura === 69 && e.target !== 1) {
            heal += (v + e.coef * S.healing * coefMult) * m;
            hits = Math.max(hits, th.hits);
          }
          break;
      }
    }
    if (weapon) {
      dmin += (weapon.min + flat) * wpct * wMult;
      dmax += (weapon.max + flat) * wpct * wMult;
    }
    return { kind, physical, dmin, dmax, dot, heal, ticks, needsWeapon, hasDirect, combo, single, area, hits };
  }

  function revengeStanceBack(ab, rank, S, mods) {
    if (ab.name !== "Revenge" || !rank.textShares) return 0;
    const stance = sum(S.tal.dmgPct.filter((d) => d.name === "Defensive Stance").map((d) => d.value));
    const others = (1 + damagePct(S, rank.school || 1) / 100) / (1 + stance / 100);
    return (-stance / 100) * rank.textShares.AP * S.ap * (1 + mods.pct(0) / 100) * (1 + mods.pct(8) / 100) * others;
  }

  const talentOpensAt = (t) => 10 + 5 * t.row;

  function abilityResult(ab, S, ctx) {
    let rank = pickRank(ab, ctx.level);
    const base = { name: ab.name, icon: ab.icon, ability: ab };
    if (ab.talent) {
      const i = ctx.flat.findIndex((t) => t.id === ab.talent);
      if (i >= 0 && !ctx.ranks[i]) return { ...base, locked: "Needs the talent", rank: rank || ab.ranks[0] };
      if (i >= 0 && !rank && ctx.level >= talentOpensAt(ctx.flat[i])) rank = ab.ranks[0];
    }
    if (ab.races && !ab.races.includes(ctx.race)) return { ...base, locked: `${ab.races.join(" and ")} only`, rank: rank || ab.ranks[0] };
    if (!rank) return { ...base, locked: `Learned at level ${ab.ranks[0].level}`, rank: ab.ranks[0] };
    const needs = (((KP.spellbook || {})[ctx.cls.token] || []).find((b) => b.name === ab.name) || {}).needs;
    if (needs && ctx.worn.length) {
      if (needs.class === 4 && needs.subclassMask & (1 << 6) && !S.shield) return { ...base, rank, locked: "Needs a shield" };
      const rangedOnly = needs.class === 2 && (needs.subclassMask & RANGED_SUBCLASSES) && !(needs.subclassMask & ~RANGED_SUBCLASSES);
      const item = rangedOnly ? S.rg : S.mh;
      if (needs.class === 2 && item && !(needs.subclassMask & (1 << item.subclass))) {
        return { ...base, rank, locked: needs.subclassMask === 1 << 15 ? "Needs a dagger in the main hand" :
          rangedOnly ? "Needs a different ranged weapon" : "Needs a different main-hand weapon" };
      }
    }
    const stance = stanceLock(ctx, ab, rank);
    if (stance) return { ...base, rank, locked: stance };
    if (ctx.cls.token === "DRUID") {
      const f = S.form;
      if (rank.powerType === 3 && f !== "cat") return { ...base, rank, locked: "Needs Cat Form" };
      if (rank.powerType === 1 && f !== "bear" && f !== "dire") return { ...base, rank, locked: "Needs Bear Form" };
      if (rank.powerType === 0 && f && !rank.heal && rank.effects.every((e) => e.effect !== 10)) {
        return { ...base, rank, locked: `Not in ${FORMS[f].name}` };
      }
    }
    const mods = modsFor(S, rank);
    const durMs = Math.max(0, ((rank.durMs || 0) + mods.flat(1)) * (1 + mods.pct(1) / 100));
    const src = { ...rank, durMs, familyName: ab.name };
    const hand = /with your off-hand weapon/.test(rank.desc || "") ? "offHand" : "mainHand";
    let r = effectDamage(rank.effects, src, S, ctx, hand, mods);
    if (S.oh && hand === "mainHand" && /from both melee weapons/.test(rank.desc || "")) {
      const oh = effectDamage(rank.effects, src, S, ctx, "offHand", mods), share = 0.5 * (1 + S.tal.offhandPct / 100);
      r = { ...r, dmin: r.dmin + oh.dmin * share, dmax: r.dmax + oh.dmax * share };
    }
    const periodic = (e) => e.effect === 6 && (e.aura === 23 || e.aura === 226) && e.trigger;
    const periodicTrigger = rank.effects.find(periodic);
    const fired = new Set(rank.effects.filter((e) => e.trigger && (e.effect === 64 || periodic(e)))
      .map((e) => String(e.trigger)));
    const tlist = Object.entries(rank.triggers || {}).filter(([id]) => fired.has(id));
    tlist.forEach(([id, t], n) => {
      const sub = effectDamage(t.effects, { ...rank, ...t, textShares: null, familyName: ab.name, school: t.school || rank.school,
        defense: t.defense || rank.defense, durMs: t.durMs }, S, ctx, n === 1 && S.oh ? "offHand" : "mainHand", mods);
      let times = 1;
      if (periodicTrigger && String(periodicTrigger.trigger) === id) {
        times = periodicTrigger.period ? Math.floor((rank.durMs || 0) / periodicTrigger.period) : 1;
      }
      r = { ...r, dmin: r.dmin + sub.dmin * times, dmax: r.dmax + sub.dmax * times, dot: r.dot + sub.dot,
        heal: r.heal + sub.heal, needsWeapon: r.needsWeapon || sub.needsWeapon,
        hasDirect: r.hasDirect || sub.hasDirect, physical: r.physical && sub.physical, kind: sub.kind || r.kind,
        combo: r.combo || sub.combo, single: r.single || sub.single, area: r.area || sub.area, hits: Math.max(r.hits, sub.hits) };
    });
    if (r.needsWeapon && (!r.hasDirect || WEAPON_DPS_DUMMY[ab.name] != null)) return { ...base, rank, locked: "Needs a weapon" };
    if (!r.hasDirect && !r.dot && !r.heal) return null;

    const dmgMult = (1 + mods.pct(0) / 100) * (1 + mods.pct(8) / 100) * (1 + damagePct(S, rank.school || 1) / 100) *
      (r.kind === "ranged" && r.physical ? 1 + rangedPct(S, S.rg) / 100 : 1);
    const flatDmg = mods.flat(0);
    const dotMult = (1 + mods.pct(22) / 100) * (1 + damagePct(S, rank.school || 1) / 100);
    const mit = r.physical ? 1 - mitigation(ctx, S) : 1;
    const stanceBack = revengeStanceBack(ab, rank, S, mods);
    const dmin = r.hasDirect ? ((r.dmin + flatDmg) * dmgMult + stanceBack) * mit : 0;
    const dmax = r.hasDirect ? ((r.dmax + flatDmg) * dmgMult + stanceBack) * mit : 0;
    const growth = ab.name === "Mind Flay" ? talentNumber(ctx, "Improved Mind Flay", /deals (\d+)% more damage than its previous/) / 100 : 0;
    const tickGrowth = growth && r.ticks > 1 ? sum(Array.from({ length: r.ticks }, (_, k) => (1 + growth) ** k)) / r.ticks : 1;
    const dot = r.dot * dotMult * tickGrowth;
    const isSpell = r.kind === "magic";
    const critChance = Math.max(0, (isSpell ? S.spellCrit : S.crit - critSuppression(ctx)) + mods.flat(7));
    const critMult = 1 + (isSpell ? 0.5 : 1) * (1 + mods.pct(15) / 100);
    const t = table(ctx, S, r.kind);
    const miss = Math.max(0, t.miss - mods.flat(16));
    const land = Math.max(0, 100 - miss - t.dodge - t.parry) / 100;
    const avg = (dmin + dmax) / 2;
    const closest = ab.name === "Whirlwind"
      ? talentNumber(ctx, "Improved Whirlwind", /closest enemy by (\d+)%/) / 100 / Math.max(1, r.hits) : 0;
    const overload = ab.name === "Lightning Bolt" || ab.name === "Chain Lightning"
      ? (talentNumber(ctx, "Lightning Overload", /(\d+)% chance to cast a second/) / 100) * 0.5 : 0;
    let directExpected = land * avg * (1 + Math.min(100, critChance) / 100 * (critMult - 1)) * (1 + closest + overload);
    const ignite = (rank.school & 4) && isSpell ? talentNumber(ctx, "Ignite", /additional (\d+)% of your spell's damage/) : 0;
    if (ignite) directExpected += land * (Math.min(100, critChance) / 100) * avg * critMult * (ignite / 100);
    const dotExpected = land * dot * (rank.dotCrit ? 1 + Math.min(100, critChance) / 100 * (critMult - 1) : 1);
    const expected = directExpected + dotExpected;
    const channelMs = rank.channeled ? rank.durMs : 0;
    const castMs = Math.max(0, (rank.castMs + mods.flat(10)) * (1 + mods.pct(10) / 100)) / (1 + (S.castHaste || 0) / 100);
    const cdMs = Math.max(0, (rank.cdMs + mods.flat(11)) * (1 + mods.pct(11) / 100));
    const schoolCost = sum(S.tal.costSchool.filter((c) => c.school & (rank.school || 1)).map((c) => c.value));
    const ofBaseMana = !rank.cost && rank.costPct && rank.powerType === 0;
    const setCost = ofBaseMana ? (rank.costPct * ((rules.baseMana[ctx.cls.token] || [])[ctx.level - 1] || 0)) / 100 : rank.cost;
    const costRaw = Math.max(0, (setCost + mods.flat(14)) * (1 + mods.pct(14) / 100) * (1 + schoolCost / 100));
    const cost = rank.powerType === 1 ? costRaw / 10 : costRaw;
    const heal = r.heal * (1 + mods.pct(0) / 100) * (1 + mods.pct(8) / 100);
    const healCritMult = 1 + 0.5 * (1 + sum(S.tal.healCrit.filter((h) => h.school & (rank.school || 1)).map((h) => h.value)) / 100);
    const amp = (rank.effects.find((e) => e.amp) || {}).amp;
    const perRage = amp && avg ? amp * 10 * dmgMult * mit * (expected / avg) : 0;
    const stackMatch = /stacks up to (\d+) times/.exec(rank.desc || "");
    const perStack = /plus (\d+)% weapon damage per existing application/.exec(rank.desc || "");
    const stack = stackMatch && r.dot ? { max: +stackMatch[1],
      weaponHit: perStack && S.mh ? (+perStack[1] / 100) * rawSwing(S, S.mh) * dmgMult : 0, weaponPct: perStack ? +perStack[1] : 0 } : null;
    return {
      perRage, hits: r.hits, stack, critMult,
      ...base, rank, kind: r.kind, school: rank.school, dmin, dmax, avg, critAvg: avg * critMult, dot, ticks: r.ticks,
      heal, healCrit: heal * healCritMult, healCritMult, critChance: Math.min(100, critChance), miss, dodge: t.dodge, parry: t.parry, expected,
      castMs, channelMs, cdMs, cost, costPct: rank.cost || ofBaseMana ? 0 : rank.costPct, powerType: rank.powerType,
      combo: r.combo, aoe: r.area && !r.single,
      cc: rank.effects.some((e) => e.effect === 6 && [5, 7, 12, 26].includes(e.aura)), directExpected, dotExpected, channeled: !!rank.channeled,
      durMs, mods: [...new Set(mods.list.map((m) => m.name))],
      perSecond: isSpell && ctx.cls.power === 0 && (expected || heal)
        ? (expected || heal * (1 + critChance / 100 * 0.5)) / Math.max(1.5, (channelMs || castMs) / 1000) : null,
    };
  }

  const STACKING = /you gain (\d+)% of your Intellect as Spell Damage and the mana cost of ([\w ]+?) is increased by (\d+)%\. Effect stacks up to (\d+) times and lasts (\d+) sec/;
  function stackingSpell(ctx) {
    for (const b of (KP.spellbook || {})[ctx.cls.token] || []) {
      const m = STACKING.exec(b.desc || "");
      if (m && m[2] === b.name && bookRank(ctx.cls.token, b.name, ctx.level) && (!b.talent || learnedTalent(ctx, b.name))) {
        return { name: b.name, pct: +m[1], costUp: +m[3], max: +m[4], sec: +m[5] };
      }
    }
    return null;
  }

  function compute(ctx) {
    const dps = (R) => (R.rotation && R.rotation.dps) || 0;
    if (ctx.fightSec === undefined && ctx.target && ctx.target.mode === "same") {
      const hp = ctx.target.health || mobHealth(ctx.level);
      const long = compute({ ...ctx, fightSec: null });
      if (!(dps(long) > 0)) return long;
      const guess = (T) => { const R = compute({ ...ctx, fightSec: T }); return { T, R, miss: dps(R) > 0 ? hp / dps(R) - T : Infinity }; };
      const tried = [guess(hp / dps(long))];
      if (Number.isFinite(tried[0].miss)) tried.push(guess(tried[0].T + tried[0].miss));
      for (let i = 0; i < 2 && tried.length > 1; i++) {
        const last = tried[tried.length - 1];
        if (!Number.isFinite(last.miss) || Math.abs(last.miss) <= 0.01 * last.T) break;
        const other = tried.slice(0, -1).reverse().find((p) => Math.sign(p.miss) !== Math.sign(last.miss)) || tried[tried.length - 2];
        const T = last.T - (last.miss * (last.T - other.T)) / (last.miss - other.miss);
        if (!(T > 0 && Number.isFinite(T))) break;
        tried.push(guess(T));
      }
      const { R, T: fightSec } = tried.reduce((a, b) => (Math.abs(b.miss) < Math.abs(a.miss) ? b : a));
      if (R.rotation) R.rotation.note += ` A mob of your level lives about ${Math.round(fightSec)} sec against this: damage over time counts only the ticks before it dies.`;
      return { ...R, fightSec };
    }
    const stacking = ctx.blastCycle == null && stackingSpell(ctx);
    if (stacking) {
      let best = null;
      for (let k = 0; k <= stacking.max + 1; k++) {
        const R = compute({ ...ctx, blastCycle: k });
        if (!best || dps(R) > dps(best)) best = { ...R, played: { ...R.played, blastCycle: k } };
      }
      return best;
    }
    if (ctx.sacrifice == null && learnedTalent(ctx, "Demonic Sacrifice")) {
      const [imp, succubus] = Object.keys(SACRIFICE).map((s) => { const R = compute({ ...ctx, sacrifice: s }); return { ...R, played: { ...R.played, sacrifice: s } }; });
      return dps(imp) >= dps(succubus) ? imp : succubus;
    }
    if (ctx.shadowAndFlame == null && learnedTalent(ctx, "Shadow and Flame")) {
      const [on, off] = [true, false].map((v) => { const R = compute({ ...ctx, shadowAndFlame: v }); return { ...R, played: { ...R.played, shadowAndFlame: v } }; });
      return dps(on) >= dps(off) ? on : off;
    }
    if (ctx.imbue == null && ctx.cls.token === "SHAMAN" && bookRank("SHAMAN", "Windfury Weapon", ctx.level) &&
      bookRank("SHAMAN", "Rockbiter Weapon", ctx.level)) {
      const [rb, wf] = ["rockbiter", "windfury"].map((v) => { const R = compute({ ...ctx, imbue: v }); return { ...R, played: { ...R.played, imbue: v } }; });
      return dps(rb) > dps(wf) ? rb : wf;
    }
    const S = stats(ctx);
    const white = whiteHits(ctx, S);
    const list = (KP.abilities[ctx.cls.token] || []).map((ab) => abilityResult(ab, S, ctx)).filter(Boolean);
    const healing = ["PRIEST", "PALADIN", "DRUID", "SHAMAN"].includes(ctx.cls.token) && !S.form ? healRotation(ctx, S, list) : null;
    const rot = rotation(ctx, S, white, list);
    if (rot) {
      drainOnHits(S, rot);
      rot.threat = threatOf(ctx, S, rot);
    }
    return { S, white, abilities: list, rotation: rot, healing };
  }

  const DRAIN_HIT_SEC = 1.5;
  function drainOnHits(S, rot) {
    const d = S.tal.drain;
    if (!d || !(rot.dps > 0)) return;
    const every = d.cdMs / 1000 + DRAIN_HIT_SEC * (1 / d.chance - 0.5);
    const dps = (d.pct * S.health) / every;
    rot.parts.push({ name: `${d.name} (racial, about every ${Math.round(every)} sec)`, dps, spell: d.name, kind: "racial" });
    rot.dps += dps;
    rot.note += ` ${d.name}: ${Math.round(d.pct * S.health)} damage (${d.pct * 100}% of your maximum health) once its ` +
      `${d.cdMs / 1000} sec are up and a hit (about one every ${DRAIN_HIT_SEC} sec) lands its ${d.chance * 100}% chance.`;
  }

  function threatMods(ctx, S) {
    const tok = ctx.cls.token;
    const mods = [...S.tal.threatPct];
    const form = tok === "WARRIOR" ? STANCE_FORM[warriorStance(ctx)] : tok === "DRUID" ? DRUID_FORM[druidForm(ctx)] : null;
    const st = form && ((KP.abilities.STANCES || {})[tok] || []).find((s) => s.form === form);
    for (const a of (st && st.auras) || []) if (a.aura === 10 && a.value) mods.push({ school: a.misc, value: a.value, name: st.name });
    const rf = tok === "PALADIN" && ctx.tank && bookRank("PALADIN", "Righteous Fury", ctx.level);
    if (rf) {
      const d = bookDesc("PALADIN", "Righteous Fury");
      const all = /all threat generated by (\d+)%/.exec(d), holy = /Holy attacks by an additional (\d+)%/.exec(d);
      if (all) mods.push({ school: 127, value: +all[1], name: "Righteous Fury" });
      if (holy) mods.push({ school: 2, value: +holy[1], name: "Righteous Fury (Holy)" });
    }
    const tank = form === STANCE_FORM.defensive || form === DRUID_FORM.bear || form === DRUID_FORM.dire || !!rf;
    return { mods, tank };
  }

  function threatOf(ctx, S, rot) {
    const tok = ctx.cls.token;
    const { mods, tank } = threatMods(ctx, S);
    const own = (spell) => {
      const ab = spell && (KP.abilities[tok] || []).find((a) => a.name === spell);
      const rank = ab && pickRank(ab, ctx.level);
      const tip = spell && /causes (\d+)% additional threat/.exec(bookDesc(tok, spell));
      return 1 + ((rank ? modsFor(S, rank).pct(2) : 0) + (tip ? +tip[1] : 0)) / 100;
    };
    const mult = (school, spell) => mods.filter((m) => m.school & school).reduce((x, m) => x * (1 + m.value / 100), own(spell));
    const tps = sum(rot.parts.map((p) => p.dps * mult(p.school || 1, p.spell))) +
      sum((rot.flatThreat || []).map((f) => f.perSec * f.threat * mult(1, f.spell)));
    const unknown = [...new Set(rot.parts.map((p) => p.spell))].filter((n) => n && /amount of threat/.test(bookDesc(tok, n)));
    return { tps, mods, tank, unknown };
  }

  function abilityResults(ctx, only) {
    const S = stats(ctx);
    const results = (KP.abilities[ctx.cls.token] || []).map((ab, i) => (!only || only.includes(i) ? abilityResult(ab, S, ctx) : null));
    return { S, results };
  }

  const BASE_MISS = 0.05;
  function swingOutcomes(S) {
    const d = Math.max(0, S.defense) * 0.0004;
    return { miss: BASE_MISS + d, dodge: S.dodge / 100 + d, parry: S.parry / 100 + d, block: S.shield ? S.block / 100 + d : 0 };
  }
  const avoidance = (S) => { const o = swingOutcomes(S); return Math.min(0.6, o.miss + o.dodge + o.parry + o.block); };

  const mobDps = (L) => Math.max(Math.min(L - 4, 21), 0.014 * L * L + 0.35 * L);
  const MOB_SWING = 2;
  const HEALTH_FORMULA = (L) => (L < 20 ? 0.9 : 1) * L * L + 12 * L;
  const MOB_HEALTH = [[24, 863], [25, 954], [26, 1024], [27, 1092], [28, 1164], [29, 1236], [30, 1366], [31, 1439], [32, 1511],
    [33, 1587], [34, 1663], [36, 1909], [37, 1998], [38, 2086], [39, 2182], [40, 2278], [41, 2473], [42, 2575], [43, 2677],
    [44, 2780], [45, 2882], [46, 2994]];
  const ELITE_HEALTH = [[16, 1281], [17, 1419], [23, 2361], [24, 2538], [25, 2727], [26, 2925], [27, 3120], [28, 3326], [29, 3531],
    [30, 3726], [31, 3924], [32, 4122], [33, 4328], [34, 4536], [35, 4758], [36, 4980], [37, 5211], [38, 5441], [39, 5691],
    [40, 5943], [41, 6183], [42, 6438]];
  function healthFrom(points, L) {
    const first = points[0], last = points[points.length - 1];
    if (L <= first[0]) return (HEALTH_FORMULA(L) * first[1]) / HEALTH_FORMULA(first[0]);
    if (L >= last[0]) return (HEALTH_FORMULA(L) * last[1]) / HEALTH_FORMULA(last[0]);
    const i = points.findIndex(([level]) => level >= L);
    const [l0, h0] = points[i - 1], [l1, h1] = points[i];
    return h0 + ((h1 - h0) * (L - l0)) / (l1 - l0);
  }
  const mobHealth = (L) => healthFrom(MOB_HEALTH, L);
  const eliteHealth = (L) => healthFrom(ELITE_HEALTH, L);
  const MOB_ARMOR = [[3, 46], [7, 245], [8, 322], [9, 412], [10, 518], [11, 545], [24, 1002], [35, 1387], [36, 1494], [37, 1607], [38, 1724],
    [39, 1849], [40, 1980], [41, 2117], [42, 2262], [43, 2414], [44, 2574], [45, 2742], [46, 2798], [60, 3566], [63, 3731]];
  function mobArmor(L) {
    if (L <= MOB_ARMOR[0][0]) return (MOB_ARMOR[0][1] * L) / MOB_ARMOR[0][0];
    const i = MOB_ARMOR.findIndex(([level]) => level >= L);
    if (i < 0) return MOB_ARMOR[MOB_ARMOR.length - 1][1];
    const [l0, a0] = MOB_ARMOR[i - 1], [l1, a1] = MOB_ARMOR[i];
    return a0 + ((a1 - a0) * (L - l0)) / (l1 - l0);
  }
  const ELITE_HIT = 2.2;
  const mobTargets = (L) => ({
    same: { diff: 0, armor: Math.round(mobArmor(L)), mode: "same", health: mobHealth(L), hitMult: 1 },
    elite: { diff: 0, armor: Math.round(mobArmor(L)), mode: "same", health: eliteHealth(L), hitMult: ELITE_HIT, ownSunder: true },
    elite3: { diff: 3, armor: Math.round(mobArmor(L + 3)), mode: "same", health: eliteHealth(L + 3), hitMult: ELITE_HIT, ownSunder: true },
  });

  const fightMs = (ctx) => (ctx.fightSec ? ctx.fightSec * 1000 : Infinity);
  function dotRecast(ctx, durMs, ticks, cdMs = 0) {
    if (!(durMs > 0)) return { everyMs: cdMs, landed: 1 };
    const half = ticks > 0 ? durMs / ticks / 2 : 0, T = fightMs(ctx);
    return { everyMs: Math.max(cdMs, Math.min(durMs, T)), landed: T >= durMs ? 1 : Math.max(0, T - half) / (durMs - half) };
  }
  function cooldownUses(ctx, cdMs, share = 1) {
    if (!ctx.fightSec || ctx.restSec == null) return (share * 1000) / cdMs;
    const T = ctx.fightSec, C = cdMs / 1000;
    return Math.min(Math.max(1, 0.5 + (share * T) / C), (T + ctx.restSec) / C) / T;
  }
  function cooldownCasts(ctx, durMs, cdMs, share = 1) {
    const rate = cooldownUses(ctx, cdMs, share);
    const perFight = Math.max(rate, 1000 / fightMs(ctx));
    return { rate, landed: durMs > 0 ? Math.min(1, (share * 1000) / (perFight * durMs)) : 1 };
  }
  function cooldownShare(ctx, durMs, cdMs) {
    if (!ctx.fightSec || ctx.restSec == null) return Math.min(1, durMs / cdMs);
    const T = ctx.fightSec, D = durMs / 1000;
    const covered = Math.max(Math.min(D, T), (D * T) / (T + ctx.restSec));
    return Math.min(1, cooldownUses(ctx, cdMs) * covered);
  }
  const averagedText = (ctx, durMs, cdMs, share) => ` (averaged: ${Math.round(durMs / 1000)} sec every ${Math.round(cdMs / 6000) / 10} min` +
    (ctx.fightSec && ctx.restSec != null ? `; leveling: up ${Math.round(share * 100)}% of the fighting, counting the rest between fights)` : ")");
  const simRules = () => ({ meleeMiss: MELEE_MISS, meleeParry: MELEE_PARRY, dualWieldMiss: DUAL_WIELD_MISS, spellMiss: SPELL_MISS, glanceChance: GLANCE_CHANCE, glanceDamage: GLANCE_DAMAGE,
    baseMiss: BASE_MISS, mobSwing: MOB_SWING, revengeWindow: REVENGE_WINDOW, ragePerSwingSec: RAGE_PER_SWING_SEC,
    ragePerSwingSec2H: RAGE_PER_SWING_SEC_2H, offhandRage: OFFHAND_RAGE, blockValueShare: BLOCK_VALUE_SHARE,
    comboPoints: COMBO_POINTS, eviscerateApPerPoint: FINISHER_AP_PER_POINT.Eviscerate, longerPerPoint: LONGER_PER_POINT, poisonChance: POISON_CHANCE,
    rageTakenPerC: RAGE_TAKEN_PER_C, ragePerHitTaken: RAGE_PER_HIT_TAKEN, rageC: RAGE_C, executePhase: EXECUTE_PHASE, recklessCd: RECKLESS_SWINGS_CD,
    normalSpeed: NORMAL_SPEED, unshownAp: UNSHOWN_AP, unshownApPerTick: UNSHOWN_AP_PER_TICK, apDummy: AP_DUMMY, mobArmor: MOB_ARMOR,
    mobHealth: MOB_HEALTH, eliteHealth: ELITE_HEALTH, eliteHit: ELITE_HIT, longFight: FIGHT_SEC, sunderStacks: SUNDER_STACKS, weaponTalents: Object.keys(WEAPON_TALENTS),
    tankMix: TANK_MIX, weaponProbe: WEAPON_PROBE_DPS, drainHitSec: DRAIN_HIT_SEC });
  function meleeTaken(S, level, hitMult = 1) {
    const armorDR = Math.min(0.75, S.armor / (S.armor + 400 + 85 * level));
    return mobDps(level) * hitMult * (1 - avoidance(S)) * (1 - armorDR) * (1 + (S.damageTaken || 0) / 100);
  }

  function ehp(R, level) {
    const S = R.S;
    const armorDR = Math.min(0.75, S.armor / (S.armor + 400 + 85 * (level + 3)));
    return S.health / ((1 - armorDR) * (1 - avoidance(S))) / (1 + (S.damageTaken || 0) / 100);
  }
  const TANK_MIX = { survival: 0.7, damage: 0.3 };
  const tankScore = (survival, dealt) => TANK_MIX.survival * Math.log(survival) + TANK_MIX.damage * Math.log(1 + dealt);
  const AURA_KEYS = {
    critPct: [52], spellCritPct: [57], hitPct: [54], spellHitPct: [55], dodgePct: [49], parryPct: [47], blockPct: [51],
    hastePct: [342], meleeHastePct: [319], rangedHastePct: [140], castHastePct: [65], defenseSkill: [30, 95],
  };
  const auraOf = (key, value) => ({ aura: AURA_KEYS[key][0], misc: AURA_KEYS[key][1] || 0, misc2: 0, value });
  function auraParts(auras) {
    const parts = {}, left = [];
    const add = (k, v) => { if (v) parts[k] = (parts[k] || 0) + v; };
    let melee = 0, ranged = 0;
    for (const a of auras) {
      const v = a.value;
      const pseudo = Object.keys(AURA_KEYS).find((k) => AURA_KEYS[k][0] === a.aura && (AURA_KEYS[k][1] == null || AURA_KEYS[k][1] === a.misc));
      if (a.aura === 29 && (a.misc === -1 || STATS[a.misc])) (a.misc === -1 ? STATS : [STATS[a.misc]]).forEach((k) => { add(k, v); });
      else if (a.aura === 99) melee += v;
      else if (a.aura === 124) ranged += v;
      else if (a.aura === 135) add("healing", v);
      else if (a.aura === 85 && a.misc === 0) add("manaRegen", v);
      else if ((a.aura === 674 || a.aura === 22) && a.misc & 1) add("bonusArmor", v);
      else if (a.aura === 274) add("blockValue", v);
      else if (a.aura === 189 && ratingKeys(a.misc).length) ratingKeys(a.misc).forEach((k) => { add(k, v); });
      else if (a.aura === 13 && (a.misc & 126) === 126) add("spellDamage", v);
      else if (a.aura === 13 && a.misc & 126) for (const [bit, key] of Object.entries(SCHOOL_KEYS)) { if (a.misc & bit) add(key, v); }
      else if (a.aura === 290) { add("critPct", v); add("spellCritPct", v); }
      else if (a.aura === 138) add("meleeHastePct", v);
      else if (pseudo) add(pseudo, v);
      else left.push(a);
    }
    const both = Math.min(melee, ranged);
    add("attackPower", both);
    add("meleeAttackPower", melee - both);
    add("rangedAttackPower", ranged - both);
    return { parts, left };
  }
  const standIn = (key, amount) => (key === "armor" ? { name: "", armor: amount }
    : AURA_KEYS[key] ? { name: "", effects: [{ auras: [auraOf(key, amount)] }] } : { name: "", stats: { [key]: amount } });
  function statProbe(key) {
    const amount = key === "armor" || key === "bonusArmor" ? 300 : key === "health" || key === "mana" ? 200
      : AURA_KEYS[key] && key !== "defenseSkill" ? 1 : 25;
    return { amount, item: standIn(key, amount) };
  }
  const WEAPON_PROBE_DPS = 5;
  function weaponProbe(item) {
    const more = WEAPON_PROBE_DPS * item.weapon.speed;
    return { amount: WEAPON_PROBE_DPS, item: { ...item, weapon: { ...item.weapon, min: item.weapon.min + more, max: item.weapon.max + more } } };
  }

  function roleNumbers(ctx, role) {
    const R = compute(ctx);
    const d = (R.rotation && R.rotation.dps) || 0, e = ehp(R, ctx.level);
    return { d, e, v: role === "heal" ? (R.healing ? R.healing.hps : 0) : role === "tank" ? tankScore(e, d) : d, R };
  }

  function statWeights(ctx, role, keys) {
    const base = roleNumbers(ctx, role);
    const fight = { ...ctx, fightSec: base.R.fightSec, ...base.R.played };
    const per = (worn, amount) => {
      const m = roleNumbers({ ...fight, worn }, role);
      return { v: (m.v - base.v) / amount, e: (m.e - base.e) / amount, d: (m.d - base.d) / amount };
    };
    const token = ctx.cls.token, swings = base.R.rotation && base.R.rotation.parts.some((p) => /white/i.test(p.name));
    const spells = role === "heal" || ["MAGE", "PRIEST", "WARLOCK"].includes(token) || (["DRUID", "SHAMAN", "PALADIN"].includes(token) && !swings);
    const W = { role, base, spells, v: {}, e: {}, d: {}, hands: {}, ctx: fight };
    for (const key of keys) {
      const { amount, item } = statProbe(key);
      const p = per([...ctx.worn, { slot: "probe", item }], amount);
      W.v[key] = p.v;
      W.e[key] = p.e;
      W.d[key] = p.d;
    }
    for (const hand of ["mainHand", "offHand", "ranged"]) {
      const held = ctx.worn.find((w) => w.slot === hand);
      if (!held || !held.item.weapon) continue;
      const probe = weaponProbe(held.item);
      W.hands[hand] = per(ctx.worn.map((w) => (w === held ? { slot: hand, item: probe.item } : w)), probe.amount);
    }
    return W;
  }

  const SHARP = 0.15;
  const TURN = 0.25;
  function statScan(xs, fs) {
    const slopes = [], turns = [];
    for (let i = 1; i < xs.length; i++) slopes[i] = (fs[i] - fs[i - 1]) / (xs[i] - xs[i - 1]);
    const noise = 1e-9 * Math.max(1, Math.abs(fs[0]));
    const differ = (x, y, by = SHARP) => Math.abs(x - y) > Math.max(noise, by * Math.max(Math.abs(x), Math.abs(y)));
    let i = 2, clean = 1;
    while (i < xs.length - 1 && turns.length < 2) {
      const before = slopes[i - 1], here = slopes[i], after = slopes[i + 1];
      const back = i - 2 >= clean ? slopes[i - 2] : null;
      if (differ(here, before) || (back != null && differ(here, back))) {
        const from = back != null && Math.abs(here - after) <= 0.03 * Math.abs(here - back) ? i - 2 : i - 1;
        const a = slopes[from], b = from === i - 2 ? here : after;
        if (differ(a, b, TURN)) {
          const at = xs[from] + ((fs[i] - fs[from]) - b * (xs[i] - xs[from])) / (a - b);
          turns.push({ at: Math.max(Math.min(xs[from], xs[i]), Math.min(Math.max(xs[from], xs[i]), at)), worth: b });
        }
        clean = i + 1;
        i += 2;
      } else i += 1;
    }
    return turns;
  }

  const TURN_STATS = { hit: ["dealt", 10, 30], crit: ["dealt", 10, 30], agility: ["dealt", 10, 20], armor: ["e", 100, 30] };
  const BACK_STEPS = 10;

  function statTurns(W, key) {
    if (!TURN_STATS[key] || (W.spells && (key === "crit" || key === "agility"))) return null;
    const [measure, step, steps] = TURN_STATS[key];
    const read = (x) => {
      const ctx = { ...W.ctx, exact: true, worn: [...W.ctx.worn, { slot: "probe", item: standIn(key, x) }] };
      if (measure === "e") return ehp({ S: stats(ctx) }, ctx.level);
      const m = roleNumbers(ctx, W.role);
      return W.role === "heal" ? m.v : m.d;
    };
    const follow = (count, dir) => {
      const xs = [0];
      for (let k = 0; k <= count; k++) xs.push(dir * (1 + k * step));
      return [xs, xs.map(read)];
    };
    const [xs, fs] = follow(steps, 1);
    const found = { measure, now: fs[1] - fs[0], turns: statScan(xs, fs), spare: null };
    if (Math.abs(found.now) <= 1e-9 * Math.max(1, Math.abs(fs[0]))) {
      const lost = statScan(...follow(BACK_STEPS, -1))[0];
      found.spare = lost ? -lost.at : null;
    }
    return found;
  }

  const SPELL_SCHOOL = { holyDamage: "holy", fireDamage: "fire", natureDamage: "nature", frostDamage: "frost", shadowDamage: "shadow", arcaneDamage: "arcane" };
  function statHave(W, key) {
    const S = W.base.R.S;
    const held = W.ctx.worn.find((w) => w.slot === key && w.item.weapon);
    if (held) return { amount: (held.item.weapon.min + held.item.weapon.max) / 2 / held.item.weapon.speed, chance: null };
    if (key === "hit") return { amount: S.gear.hit || 0, chance: W.spells ? S.spellHit : S.hit };
    if (key === "crit") return { amount: S.gear.crit || 0, chance: W.spells ? S.spellCrit : S.crit };
    const spellDamage = S.sp + Math.max(...Object.values(S.school));
    const sheet = { ...S.attr, armor: S.armor, attackPower: S.ap, rangedAttackPower: S.rap, healing: S.healing, health: S.health, mana: S.mana,
      manaRegen: S.mp5, spellPower: spellDamage, spellDamage };
    const amount = SPELL_SCHOOL[key] ? S.sp + S.school[SPELL_SCHOOL[key]] : key in sheet ? sheet[key] : S.gear[key] || 0;
    return { amount, chance: null };
  }

  const STAT_SECTIONS = { dps: [["v", "damage"], ["e", "survival"]], heal: [["v", "healing"], ["d", "damage"], ["e", "survival"]], tank: [["e", "survival"], ["d", "damage"]] };
  const WORTH_SHOWN = 0.0005, WORTH_SHARE = 0.05;
  const ARMOR_CHUNK = { armor: 12, bonusArmor: 12 };
  const STAT_TWIN = { bonusArmor: "armor", spellDamage: "spellPower" };
  function statList(W) {
    const shown = (x) => Number(x.toPrecision(2));
    return STAT_SECTIONS[W.role].map(([measure, kind]) => {
      const worthOf = (key) => (W.hands[key] ? W.hands[key][measure] : W[measure][key] || 0);
      const rows = [...Object.keys(W[measure]), ...Object.keys(W.hands)].map((key) => ({ key, worth: worthOf(key) })).filter((r) => r.worth >= WORTH_SHOWN);
      const chunked = (r) => r.worth * (ARMOR_CHUNK[r.key] || 1);
      const top = Math.max(0, ...rows.filter((r) => !W.hands[r.key]).map(chunked));
      const main = rows.filter((r) => STATS.includes(r.key)).reduce((best, r) => (!best || r.worth > best.worth ? r : best), null);
      const kept = rows.filter((r) => !(STAT_TWIN[r.key] && shown(worthOf(STAT_TWIN[r.key])) === shown(r.worth)) && (W.hands[r.key] || chunked(r) >= WORTH_SHARE * top));
      kept.sort((a, b) => b.worth - a.worth || (a.key < b.key ? -1 : 1));
      for (const r of kept) {
        const turn = statTurns(W, r.key);
        Object.assign(r, statHave(W, r.key), { main: main && main.key, same: main && r !== main ? r.worth / main.worth : null,
          turn: turn && turn.measure === (measure === "e" ? "e" : "dealt") ? turn : null });
      }
      return { measure, kind, total: W.base[measure], rows: kept };
    }).filter((s) => s.rows.length);
  }

  function manaInfo(ctx) {
    const S = stats(ctx);
    return { pool: S.mana, regen: S.mp5 / 5 + spiritRegenOf(S.attr.spirit) * keepWhileCasting(ctx) / 100 + blockMana(ctx, S) };
  }

  const INPUT_NAMES = { level: "level", str: "Strength", agi: "Agility", sta: "Stamina", int: "Intellect", spi: "Spirit" };
  function linear(terms, constant) {
    const used = terms.filter(([n]) => n);
    const text = used.map(([n, k], i) => `${i ? " + " : ""}${n === 1 ? "" : `${n} × `}${INPUT_NAMES[k]}`).join("") +
      (constant ? ` ${constant < 0 ? "-" : "+"} ${Math.abs(constant)}` : "");
    const expr = used.map(([n, k]) => `${n} * ${k}`).concat(constant ? [String(constant)] : []).join(" + ");
    return { text, expr };
  }
  const MELEE = ["WARRIOR", "ROGUE", "PALADIN", "SHAMAN", "DRUID", "HUNTER"];
  const WANDS = ["PRIEST", "MAGE", "WARLOCK"];
  const FROM = {
    files: (where) => `Forever's game files (${where})`,
    rule: "the original game's rule",
    checked: (how) => `the original game's rule, checked on Forever: ${how}`,
    patch: (when) => `Forever's patch notes, ${when}`,
    estimate: "the planner's estimate, not yet checked on Forever",
    planner: "the planner's own choice",
  };
  const round = (v, places) => Number(v.toFixed(places));

  function formulas(cls) {
    const t = cls.token, out = [];
    const hp = [...new Set(rules.healthPerStamina)];
    const perSta = hp.length === 1 ? hp[0] : "the game table's amount";
    out.push({ name: "Health", game: "health", digits: 0, expr: "baseHealth + min(sta, 20) + max(0, sta - 20) * hpPerSta",
      text: `base health for your level + 1 per Stamina up to 20 + ${perSta} per Stamina above 20`,
      numbers: [
        ["base health", "your class's health at your level before any Stamina", FROM.files("the BaseHp table, by class and level")],
        ["1 per Stamina up to 20", "the first 20 points of Stamina add 1 health each",
          FROM.checked("the owner's Orc Warrior had exactly this health at levels 2 to 6")],
        [`${perSta} per Stamina above 20`, "each point of Stamina after the first 20", FROM.files("the HpPerSta table")],
      ] });
    if (cls.power === 0) {
      out.push({ name: "Mana", game: "mana", digits: 0, expr: "baseMana + min(int, 20) + max(0, int - 20) * 15",
        text: "base mana for your level + 1 per Intellect up to 20 + 15 per Intellect above 20",
        numbers: [
          ["base mana", "your class's mana at your level before any Intellect", FROM.files("the BaseMp table, by class and level")],
          ["1 per Intellect up to 20", "the first 20 points of Intellect add 1 mana each",
            FROM.checked("a guild Priest and Druid at levels 6 and 7")],
          ["15 per Intellect above 20", "each point of Intellect after the first 20", FROM.checked("the same Priest and Druid")],
        ] });
    }
    const [apL, apC] = BASE_AP[t] || [0, 0];
    const ap = linear([[apL, "level"], [cls.apPerStr, "str"], [cls.apPerAgi, "agi"]], apC);
    const apFrom = t === "WARRIOR" ? FROM.checked("the owner's Orc Warrior at levels 2 to 6 (40 attack power at level 2 with 27 Strength)") : FROM.rule;
    out.push({ name: "Attack power", game: "ap", digits: 0, expr: `max(0, ${ap.expr})`,
      text: `${ap.text} (never below 0), before attack power from gear and buffs`,
      numbers: [
        apL && [`${apL} × level`, "attack power every character of your class gets for each level", apFrom],
        cls.apPerStr && [`${cls.apPerStr} × Strength`, "attack power from each point of Strength",
          FROM.files("ChrClasses, your class's attack power per Strength")],
        cls.apPerAgi && [`${cls.apPerAgi} × Agility`, "attack power from each point of Agility",
          FROM.files("ChrClasses, your class's attack power per Agility")],
        apC && [`${apC < 0 ? "-" : "+"} ${Math.abs(apC)}`, "a fixed amount, so a new character starts near 0", apFrom],
        ["never below 0", "the total stops at 0 (the parts above can add up to less at the first levels)", apFrom],
      ].filter(Boolean) });
    if (BASE_RAP[t]) {
      const [rapL, rapC] = BASE_RAP[t];
      const rap = linear([[rapL, "level"], [cls.rapPerAgi, "agi"]], rapC);
      const rapFrom = t === "WARRIOR" ? FROM.checked("the owner's Orc Warrior, 18 at level 2 and 19 at level 3; the original game's " +
        "- 10 would give 28, so Forever's is - 20") : FROM.rule;
      out.push({ name: "Ranged attack power", game: "rap", digits: 0, expr: `max(0, ${rap.expr})`,
        text: `${rap.text} (never below 0), before attack power from gear and buffs`,
        numbers: [
          [`${rapL} × level`, "ranged attack power every character of your class gets for each level", rapFrom],
          cls.rapPerAgi && [`${cls.rapPerAgi} × Agility`, "ranged attack power from each point of Agility",
            FROM.files("ChrClasses, your class's ranged attack power per Agility")],
          [`${rapC < 0 ? "-" : "+"} ${Math.abs(rapC)}`, "a fixed amount, so a new character starts near 0", rapFrom],
          ["never below 0", "the total stops at 0", rapFrom],
        ].filter(Boolean) });
    }
    const at60 = AGI_PER_CRIT[t] || 20;
    const agiMeasured = KP.measured.agiPerCrit[t];
    const agiLevels = agiMeasured && Object.keys(agiMeasured).map(Number).sort((a, b) => a - b);
    const lastMeasured = agiLevels && agiLevels[agiLevels.length - 1];
    const perCritNumber = agiMeasured
      ? ["the Agility per 1% crit at your level", `measured: ${round(agiMeasured[agiLevels[0]], 1)} at level ${agiLevels[0]}, ` +
        `${round(agiMeasured[lastMeasured], 1)} at level ${lastMeasured}` + (lastMeasured < 60
          ? `; above that a straight line to the original game's ${at60} at level 60 (an estimate there)` : ""), FROM.checked(`the owner's Warrior at levels ${agiLevels[0]} to ${lastMeasured}, ` +
          "from its dodge, which weapon skill doesn't change (its crit gives the same; the game's own Agility tooltip at level " +
          "11 credits all of the crit to Agility)")]
      : ["the Agility per 1% crit at your level", `1% per ${at60} Agility at level 60; below 60, ${at60} × your level ÷ 60 ` +
        "(levels under 10 count as 10)", `${FROM.rule} at level 60; below it ${FROM.estimate}. Forever's own character sheet ` +
        "showed about 5.4 Agility per 1% crit on a level 11 Warrior where this rule gives 3.7, so it's too generous at low " +
        "levels; Forever has no function an addon can ask for the game's own rule"];
    const agiOnly = agiMeasured ? { estimateAbove: lastMeasured } : { estimate: true };
    out.push({ name: "Melee crit", game: "crit", digits: 2, unit: "%", ...agiOnly,
      expr: `${BASE_CRIT[t] || 0} + agi / agiPerCrit`,
      text: `${BASE_CRIT[t] ? `${BASE_CRIT[t]}% + ` : ""}Agility ÷ the Agility per 1% crit at your level`,
      note: "The game's number also counts crit from your gear, your weapon skill and buffs.",
      numbers: [
        BASE_CRIT[t] && [`${BASE_CRIT[t]}%`, "your class's crit chance before Agility", FROM.rule],
        perCritNumber,
      ].filter(Boolean) });
    if (agiMeasured) {
      out.push({ name: "Dodge from Agility", game: "dodge", digits: 2, unit: "%", ...agiOnly, expr: "agi / agiPerCrit",
        text: "Agility ÷ the same Agility per 1% as crit (before dodge from gear and talents)",
        note: "The game's number also counts dodge from your gear, talents and Defense.",
        numbers: [["the same Agility per 1% as crit", "your class's dodge, like its crit, comes from Agility alone and at the " +
          "same rate", FROM.checked(`the owner's Warrior: crit and dodge give the same Agility per 1% at levels ${agiLevels[0]} ` +
            `to ${lastMeasured}`)]] });
    }
    if (INT_PER_SPELL_CRIT[t]) {
      out.push({ name: "Spell crit", game: "spellCrit", digits: 2, unit: "%", estimate: true,
        expr: `${BASE_SPELL_CRIT[t] || 0} + int / (${INT_PER_SPELL_CRIT[t]} * max(10, level) / 60)`,
        text: `${BASE_SPELL_CRIT[t] ? `${BASE_SPELL_CRIT[t]}% + ` : ""}1% per ${INT_PER_SPELL_CRIT[t]} Intellect at level 60; below 60, 1% per ${INT_PER_SPELL_CRIT[t]} × your level ÷ 60 (levels under 10 count as 10)`,
        note: "The game's number also counts spell crit from your gear and buffs.",
        numbers: [
          BASE_SPELL_CRIT[t] && [`${BASE_SPELL_CRIT[t]}%`, "your class's spell crit chance before Intellect", FROM.rule],
          [`1% per ${INT_PER_SPELL_CRIT[t]} Intellect at level 60`, "how much Intellect buys 1% spell crit at the level cap", FROM.rule],
          ["× your level ÷ 60", "lower levels need less Intellect for 1%", `${FROM.estimate}. A guild Priest and Druid at levels ` +
            "6 and 7 showed 4.7 to 4.9% spell crit, where this gives 3.4 to 4.5%"],
          ["levels under 10 count as 10", "keeps the first levels from getting a huge spell crit chance", FROM.estimate],
        ].filter(Boolean) });
    }
    out.push({ name: "Armor", game: "armor", digits: 0, expr: "gearArmor + 2 * agi",
      text: "the armor on your gear + 2 per Agility (before talents and buffs)",
      numbers: [
        ["the armor on your gear", "every worn item's armor added up", FROM.files("each item's armor, from the item tables")],
        ["2 per Agility", "each point of Agility adds 2 armor", FROM.checked("the game's own armor number agrees (the tick)")],
      ] });
    out.push({ name: "Physical damage your armor stops", game: "armorStops", digits: 1, unit: "%",
      expr: "min(75, armor / (armor + 400 + 85 * level) * 100)",
      text: "your armor ÷ (your armor + 400 + 85 × the attacker's level), at most 75%. Here: an attacker of your level.",
      numbers: [
        ["400 + 85 × the attacker's level", "the armor that stops exactly half: with that much armor you take 50% less",
          FROM.checked("the game's own number for your armor (GetArmorEffectiveness) agrees (the tick)")],
        ["at most 75%", "armor never stops more than this", FROM.rule],
        ["an attacker of your level", "who hits you on this line; Effective health below uses a raid boss", FROM.planner],
      ] });
    out.push({ name: "Effective health", digits: 0,
      expr: `health / ((1 - min(0.75, armor / (armor + 400 + 85 * (level + 3)))) * (1 - min(0.6, ${BASE_MISS} + (dodge + parry + block) / 100)))`,
      text: "how much damage you can take before you die, what the planner calls survival: health ÷ (the share of a raid " +
        "boss's hits that gets through your armor × the share that doesn't miss and you don't dodge, parry or block). " +
        `The boss is 3 levels above you; its ${BASE_MISS * 100}% misses, your dodge, parry and block (with a shield) ` +
        "count up to 60% together.",
      numbers: [
        ["3 levels above you", "a raid boss: the planner measures every tank against one", FROM.planner],
        [`${BASE_MISS * 100}%`, "an attack's base chance to miss you",
          FROM.checked("a dungeon's combat log: 4.8% of 1,052 enemy swings at a level 30 tank missed")],
        ["up to 60%", "misses + dodge + parry + block are counted up to 60%, so stacking them can't make the number run away", FROM.planner],
      ] });
    if (cls.power === 0) {
      const seen = REGEN_SEEN.includes(t);
      out.push({ name: "Mana regen from Spirit", game: "regen", digits: 2, unit: " mana per second", estimate: !seen,
        expr: `(min(spi, ${SPIRIT_FULL}) + max(0, spi - ${SPIRIT_FULL}) / 2) / ${SPIRIT_PER_MANA}`,
        text: `Spirit ÷ ${SPIRIT_PER_MANA} every second, each point above ${SPIRIT_FULL} Spirit counting half, once you haven't spent mana for 5 seconds (gear's mana per 5 seconds keeps going)`,
        numbers: [
          [`Spirit ÷ ${SPIRIT_PER_MANA}, half above ${SPIRIT_FULL}`, "mana per second from Spirit, whatever your level or Intellect; the original " +
            "game had a different rule for each class", seen
            ? FROM.checked("the game's own mana regen on the guild's Priest, Druid, Paladin, Shaman, Hunter and Mage, levels 1 to 34, up to 136 Spirit, is exactly this")
            : `${FROM.estimate}: the guild's Priest, Druid, Paladin, Shaman, Hunter and Mage all showed exactly this, but no ${cls.name} yet`],
          ["5 seconds", "after you spend mana, Spirit stops refilling it for 5 seconds (\"the five-second rule\"); mana per 5 " +
            "seconds from gear keeps going, and wand shots don't count as spending",
          FROM.checked("a guild Priest's combat log: 24.4 mana a second while wanding once 5 sec had passed after a spell, 3.4 within")],
        ] });
    }
    if (t === "WARRIOR") {
      const fromLog = "a combat log on Forever: six Warriors with swings of 1.8 to 2.8 sec, up to level 30; level 60 not seen yet";
      const extra2H = round(RAGE_PER_SWING_SEC_2H - RAGE_PER_SWING_SEC, 2);
      out.push({ name: "Rage from your swing", digits: 1, expr: `(${RAGE_PER_SWING_SEC} + ${extra2H} * twoHand) * speed`,
        text: `${RAGE_PER_SWING_SEC} × your weapon's swing time for each hit (${RAGE_PER_SWING_SEC_2H} with a two-hander), whatever it ` +
          "hits for, so every weapon of a kind gives the same rage a second",
        note: "A crit gives twice this; an off-hand hit half, plus what Dual Wield Specialization adds.",
        numbers: [
          [`${RAGE_PER_SWING_SEC}`, "rage per second of swing time with a one-hand weapon", fromLog],
          [`${RAGE_PER_SWING_SEC_2H}`, "rage per second of swing time with a two-hander: 16.2 a hit from a 3.6 sec axe, 12.1 from a 2.7 sec one",
            "combat logs on Forever: the owner's Warrior at 35 to 40, two two-handed axes"],
          ["crits: twice", "a crit gives exactly twice a hit's rage (18.7 against 9.3 on a 2.7 sec sword)", fromLog],
          ["off hand: half", "an off-hand hit's rage: 3.45 from a 2.0 sec off hand, where its main hand gave 7.6 from 2.2 sec",
            "a combat log on Forever: the owner's Warrior dual wielding at 39 and 40"],
        ] });
      const cExpr = `${RAGE_C[0]} * level * level + ${RAGE_C[1]} * level + ${RAGE_C[2]}`;
      const cText = `${round(RAGE_C[0], 4)} × level² + ${round(RAGE_C[1], 2)} × level + ${round(RAGE_C[2], 2)}`;
      out.push({ name: "Rage conversion (c)", digits: 1, expr: cExpr,
        text: `what rage from the hits you take is measured against: ${cText}. Each hit that lands gives ${RAGE_TAKEN_PER_C} × damage ÷ c + ${RAGE_PER_HIT_TAKEN}`,
        numbers: [
          [cText, `a curve that rises with level, so the same hit gives less rage as you level up (at level 60 c is ` +
            `${round(rageConversion(60), 1)}); its exact numbers are ${RAGE_C.join(", ")}`, FROM.rule],
          [`${RAGE_TAKEN_PER_C} × damage ÷ c`, "rage from a hit you take: the planner counts it when something is hitting you " +
            "(a raid boss's damage isn't known)", FROM.rule],
          [`${RAGE_PER_HIT_TAKEN}`, "more rage per hit that lands: hits of 1 to 29 damage gave 0.6 to 0.95", "a combat log on Forever: one Warrior at level 29"],
        ] });
    }
    if (t === "ROGUE") {
      const rush = KP.spellbook.ROGUE.find((b) => b.name === "Adrenaline Rush").ranks[0].durMs / 1000;
      out.push({ name: "Energy", text: `10 energy per second; Adrenaline Rush doubles it for ${rush} seconds.`,
        numbers: [
          ["10 energy per second", "how fast a Rogue's energy refills", FROM.rule],
          [`${rush} seconds`, "how long Adrenaline Rush lasts", FROM.files("the spell's duration")],
        ] });
    }
    const hitsFrom = (power, from) => [[`${power} ÷ 14 × weapon speed`, "14 attack power add 1 damage per second, so a slow weapon " +
      "gets more per swing", from], ["double damage", "a crit", FROM.rule]];
    if (MELEE.includes(t)) {
      out.push({ name: "White hits", text: "weapon damage + attack power ÷ 14 × weapon speed. Crits do double damage.",
        numbers: hitsFrom("attack power", FROM.checked("a Warrior's white hits in a combat log: 100 a swing read, 100.4 by this rule")) });
      out.push({ name: "An enemy you fight from the front",
        text: `an enemy that's hitting you (you're alone against it, or you're its tank) parries ${MELEE_PARRY[0]}% of your melee attacks, ` +
          `a raid boss ${MELEE_PARRY[3]}%. From behind, as a damage dealer in a group, nothing is parried. ` +
          `Each ${rules.ratings.expertise[59]} expertise rating takes 1% off both the enemy's dodge and its parry.`,
        numbers: [
          [`${MELEE_PARRY[0]}%`, "parried by an enemy of your level", FROM.checked("a combat log: 4.7% of a Warrior's 1,376 white swings " +
            "at enemies near his level were parried")],
          [`${MELEE_PARRY[3]}%`, "parried by a raid boss, 3 levels above you", FROM.rule],
          [`${rules.ratings.expertise[59]} expertise rating = 1%`, "less dodged and less parried, at level 60",
            FROM.files("the combat rating table; a guild Shaman's character sheet read 15 rating as 1.5%")],
        ] });
    }
    if (t === "HUNTER") {
      out.push({ name: "Shots", text: "weapon damage + ranged attack power ÷ 14 × weapon speed. Crits do double damage.",
        numbers: hitsFrom("ranged attack power", FROM.rule) });
      const petTop = Math.max(...Object.keys(KP.measured.petDps).map(Number));
      out.push({ name: "Your pet", text: `its melee adds to your damage: about ${PET_DPS_PER_LEVEL} more damage per second each level, plus ` +
        `${PET_RAP_SHARE * 100}% of your ranged attack power ÷ 14, through the target's armor like your own hits. It doesn't crit without Ferocity. ` +
        `Bite on autocast adds its damage every ${rules.petBite.cdMs / 1000} sec, through armor too, if you keep it trained. Lone Wolf means no pet.`,
        numbers: [
          [`${PET_DPS_PER_LEVEL} each level`, "how a pet's damage rises", `the guild's Hunter's Spider and 10 pets in a combat log, levels 5 to ${petTop}; above level ${petTop} it's the planner's estimate`],
          [`${PET_RAP_SHARE * 100}%`, "your share of your ranged attack power", "the guild's Spider: 25 attack power of 258, 26 of 262, 27 of 278"],
          ["a fed pet", "the planner counts a happy pet; the same Spider also read about 20% less, which fits the original game's rule for a content pet (the game doesn't tell addons its mood)", "the guild's snapshots"],
          ["÷ 14", "14 attack power add 1 damage per second, as for your own hits", FROM.rule],
          ["doesn't crit", "0 crits in 217 pet swings; only Ferocity gives it crit, and Frenzy needs a crit", "a combat log on Forever"],
          ["its family", `the planner counts a family with no damage bonus; ${petFamilyText()}`, FROM.files("each family's Tamed Pet Passive")],
          [`Bite every ${rules.petBite.cdMs / 1000} sec, ${rules.petBite.ranks[0].damage} to ${rules.petBite.ranks.at(-1).damage} damage`, `the best rank for your pet's level (level ${rules.petBite.ranks.at(-1).level} has the last): a pet keeps the rank it was taught`, FROM.files("Bite's ranks and cooldown")],
          [`${(PET_HAPPY - 1) * 100}% more`, "a well-fed pet's Bite, like its melee: rank 1, 8 in the files, hit for 10; a pet with Bite alone used it every 10.5 sec", "a combat log on Forever"],
          ["Claw and family abilities", "not counted; a pet with Claw on autocast too bites less often", FROM.planner],
        ] });
    }
    if (WANDS.includes(t)) {
      out.push({ name: "Wands", text: "the wand's own damage (attack power doesn't add to it); crits do 1.5 times damage.",
        numbers: [["1.5 times", "a wand crit", FROM.rule]] });
    }
    if (cls.power === 0) {
      out.push({ name: "Spells", text: "spell power adds to each spell by its own share, from the game files (the planner's Abilities tab lists them). Spell crits do 1.5 times damage or healing.",
        numbers: [["its own share", "how much of your spell power each spell gets", FROM.files("each spell's effect data")],
          ["1.5 times", "a spell crit", FROM.rule]] });
    }
    const caps = hitCaps({ target: { diff: 3 } });
    const glance = `${GLANCE_CHANCE[3]}% of white hits glance for ${Math.round((1 - GLANCE_DAMAGE[3]) * 100)}% less damage`;
    const lowerCrit = `about ${critSuppression({ target: { diff: 3 } })}% lower`;
    out.push({ name: "Against a raid boss (3 levels above you)",
      text: `${caps.melee}% hit stops your misses (${caps.dualWhite}% for dual-wield white hits, ${caps.spell}% for spells); ` +
        `${glance}; your crit chance is ${lowerCrit}.`,
      numbers: [
        [`${caps.melee}%`, `a boss 3 levels up makes ${MELEE_MISS[3]}% of your attacks miss, and the first 1% of hit from gear ` +
          "doesn't count against it", FROM.rule],
        [`${caps.dualWhite}%`, `dual wielding makes white hits miss ${DUAL_WIELD_MISS}% more often, and hit takes that off too`,
          FROM.checked("combat logs: 21.5% of 586 white swings by four dual wielders missed, 4.0% of 6,701 by players with one " +
            "weapon; that hit takes it off wasn't seen, nobody had the hit")],
        [`${caps.spell}%`, `spells miss ${SPELL_MISS[3]}% of the time against it, and 1% always misses`, FROM.rule],
        [glance, "glancing blows: white hits that land for less (5% less at your level and one up, 15% two up); abilities never glance",
          FROM.checked("the owner's combat logs: glancing hits landed for 95% of a plain hit at his level and one up (63 hits), " +
            "89% two up (42) and 68% three up (21)")],
        [lowerCrit, "about 1% less crit per level the boss is above you", FROM.rule],
      ] });
    return out;
  }

  KP.calc = { compute, stats, talentEffects, estimateBase, hunterStyle, hitCaps, manaInfo, abilityResults, mitigation, FORMS, ehp,
    STANCE_FORM, inMask, warriorStance, formulas, spiritRegenOf, petRawDps, rageConversion, rageFromDamage, bareStat, agiPerCrit, wearableFrom, wearableTogether, rockbiterAp, talentOpensAt, dungeonMana, swingOutcomes, avoidance, mobDps, mobHealth, eliteHealth, mobArmor, mobTargets, ownSunder, meleeTaken, simRules, TANK_MIX, tankScore, statProbe, weaponProbe,
    AURA_KEYS, auraParts, statWeights, statScan, statTurns, statList };
})();
