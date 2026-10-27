// Kor'kron Planner: the math. Stats from gear + talents (+ base stats if entered), white hits, and every ability.
// Pure functions: give it a character (ctx) and it returns numbers, so the page can compare "before/after".
//
// ctx = { cls, level, flat (class talents), ranks (learned rank per talent), worn ([{slot, item}]),
//         base ({strength, agility, stamina, intellect, spirit}), target ({diff: levels above you, armor}) }
//
// Rules that come from Classic, not Forever's files (marked as estimates on the page): base attack power by level,
// the attack table (miss, dodge, glancing, crit suppression), armor mitigation, normalized weapon speeds.
(function () {
  "use strict";

  const KP = window.KP;
  const rules = KP.classes.rules;

  const STATS = ["strength", "agility", "stamina", "intellect", "spirit"];
  const STAT_BITS = [["strength", 1], ["agility", 2], ["stamina", 4], ["intellect", 8], ["spirit", 16]];
  // Classic: melee attack power from level (per level, constant); ranged attack power likewise
  const BASE_AP = { WARRIOR: [3, -20], PALADIN: [3, -20], HUNTER: [2, -20], ROGUE: [2, -20], SHAMAN: [2, -20],
    DRUID: [0, -20], PRIEST: [0, -10], MAGE: [0, -10], WARLOCK: [0, -10] };
  const BASE_RAP = { HUNTER: [2, -10], WARRIOR: [1, -10], ROGUE: [1, -10] };
  // "Normalized" abilities use a fixed speed instead of the weapon's own
  const NORMAL_SPEED = { dagger: 1.7, oneHand: 2.4, twoHand: 3.3, ranged: 2.8 };
  // Attack table by how many levels the target is above you (Classic)
  const MELEE_MISS = [5, 5.5, 6, 8];
  const SPELL_MISS = [4, 5, 6, 17];
  const GLANCE_CHANCE = [10, 20, 30, 40];
  const GLANCE_DAMAGE = [0.95, 0.85, 0.75, 0.7];
  // Abilities whose damage includes a share of attack power kept in a "dummy" effect: [effect index]
  const AP_DUMMY = { Bloodthirst: 1, "Victory Rush": 2 };
  // Finishing moves are shown at 5 combo points. Rupture also lasts 2 sec longer per point (Classic).
  const COMBO_POINTS = 5;
  const LONGER_PER_POINT = { Rupture: 2000 };

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const overlap = (a, b) => a.some((v, k) => (v & b[k]) !== 0);

  // ------------------------------------------------------------ talents

  // What the learned talents do that the math can use.
  function talentEffects(ctx) {
    const out = {
      crit: 0, hit: 0, spellHit: 0, spellCrit: 0, dodge: 0, parry: 0, block: 0, defense: 0, armorPct: 0,
      statPct: { strength: 0, agility: 0, stamina: 0, intellect: 0, spirit: 0 },
      mods: [],       // ability modifiers: { op, pct, value, mask, name }
      dmgPct: [],     // damage done %: { school, value, name }
      offhandPct: 0, armorIgnore: 0,
      lines: [],      // for the sheet: what each talent added
    };
    const weapons = ctx.worn.filter((w) => w.item.class === 2);
    const weaponMask = weapons.reduce((m, w) => m | (1 << w.item.subclass), 0);
    const armorMask = ctx.worn.filter((w) => w.item.class === 4).reduce((m, w) => m | (1 << w.item.subclass), 0);
    ctx.flat.forEach((t, i) => {
      const r = ctx.ranks[i];
      if (!r) return;
      if (!t.passive && t.ranks.length === 1) return; // an ability you cast, not an always-on bonus
      if (t.needs) {
        const have = t.needs.class === 2 ? weaponMask : armorMask;
        if (!(have & t.needs.subclassMask)) {
          out.lines.push({ name: t.name, text: "needs a matching weapon or shield", off: true });
          return;
        }
      }
      const parts = [];
      for (const e of t.effects[r - 1] || []) {
        if (e.effect !== 6) continue;
        const v = e.value;
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
    });
    return out;
  }

  // ------------------------------------------------------------ stats

  function stats(ctx) {
    const cls = ctx.cls, lvl = ctx.level;
    const gear = {};
    let itemArmor = 0;
    for (const w of ctx.worn) {
      for (const [k, v] of Object.entries(w.item.stats || {})) gear[k] = (gear[k] || 0) + v;
      itemArmor += w.item.armor || 0;
    }
    const tal = talentEffects(ctx);
    const g = (k) => gear[k] || 0;
    const base = ctx.base || {};
    const attr = {};
    for (const k of STATS) attr[k] = Math.round(((base[k] || 0) + g(k)) * (1 + tal.statPct[k] / 100));
    const per = (key) => rules.ratings[key][Math.max(0, lvl - 1)] || 1;
    const [apL, apC] = BASE_AP[cls.token] || [0, 0];
    const [rapL, rapC] = BASE_RAP[cls.token] || [0, 0];
    const baseAp = Math.max(0, lvl * apL + apC);
    const sp = g("spellPower") + g("spellDamage");
    const school = { holy: g("holyDamage"), fire: g("fireDamage"), nature: g("natureDamage"),
      frost: g("frostDamage"), shadow: g("shadowDamage"), arcane: g("arcaneDamage") };
    const worn = (slot) => ctx.worn.find((w) => w.slot === slot);
    const S = {
      gear, tal, attr, baseAp,
      ap: Math.max(0, baseAp + g("attackPower") + attr.strength * cls.apPerStr + attr.agility * cls.apPerAgi),
      rap: Math.max(0, lvl * rapL + rapC + g("attackPower") + g("rangedAttackPower") + attr.agility * cls.rapPerAgi),
      hit: g("hit") / per("meleeHit") + tal.hit,
      crit: (base.crit || 0) + g("crit") / per("meleeCrit") + tal.crit,
      spellHit: g("hit") / per("spellHit") + tal.spellHit,
      spellCrit: (base.spellCrit || 0) + g("crit") / per("spellCrit") + tal.spellCrit,
      sp, school, healing: g("healing") + g("spellPower"),
      armor: Math.round(itemArmor * (1 + tal.armorPct / 100)) + g("bonusArmor") + attr.agility * 2,
      defense: g("defense") / per("defense") + tal.defense,
      dodge: g("dodge") / per("dodge") + tal.dodge,
      parry: g("parry") / per("parry") + tal.parry,
      block: g("block") / per("block") + tal.block,
      blockValue: g("blockValue"),
      health: rules.baseHealth[cls.token][lvl - 1] + attr.stamina * rules.healthPerStamina[lvl - 1] + g("health"),
      mana: cls.power === 0 ? rules.baseMana[cls.token][lvl - 1] + attr.intellect * 15 + g("mana") : 0,
      mp5: g("manaRegen"),
      mh: worn("mainHand") && worn("mainHand").item.weapon ? worn("mainHand").item : null,
      oh: worn("offHand") && worn("offHand").item.weapon ? worn("offHand").item : null,
      rg: worn("ranged") && worn("ranged").item.weapon ? worn("ranged").item : null,
      shield: !!ctx.worn.find((w) => w.slot === "offHand" && w.item.class === 4 && w.item.subclass === 6),
    };
    return S;
  }

  // ------------------------------------------------------------ attack table and damage helpers

  const SCHOOL_NAMES = { 1: "physical", 2: "holy", 4: "fire", 8: "nature", 16: "frost", 32: "shadow", 64: "arcane" };

  function spellPowerFor(S, schoolMask) {
    // a mixed school (e.g. Frostfire) uses the best of its schools
    let best = 0;
    for (const [bit, name] of Object.entries(SCHOOL_NAMES)) {
      if (schoolMask & bit && name !== "physical") best = Math.max(best, S.school[name] || 0);
    }
    return S.sp + best;
  }

  function damagePct(S, schoolMask) {
    return sum(S.tal.dmgPct.filter((d) => d.school & schoolMask).map((d) => d.value));
  }

  function mitigation(ctx, S) {
    const armor = Math.max(0, (ctx.target.armor || 0) * (1 - S.tal.armorIgnore / 100));
    const dr = armor / (armor + 400 + 85 * ctx.level);
    return Math.min(0.75, dr);
  }

  function table(ctx, S, kind) {
    const d = Math.max(0, Math.min(3, ctx.target.diff));
    if (kind === "magic") {
      return { miss: Math.max(1, SPELL_MISS[d] - S.spellHit), dodge: 0 };
    }
    // Classic: against a target 3+ levels higher the first 1% of hit doesn't count
    const hit = d >= 3 ? Math.max(0, S.hit - 1) : S.hit;
    return { miss: Math.max(0, MELEE_MISS[d] - hit), dodge: kind === "melee" ? 5 + d * 0.5 : 0 };
  }

  function critSuppression(ctx) {
    return Math.max(0, Math.min(3, ctx.target.diff)); // ~1% less crit per level the target is above you
  }

  function normalSpeed(item, kind) {
    if (kind === "ranged") return NORMAL_SPEED.ranged;
    if (item.inv === 17) return NORMAL_SPEED.twoHand;
    if (item.subclass === 15) return NORMAL_SPEED.dagger;
    return NORMAL_SPEED.oneHand;
  }

  // ------------------------------------------------------------ white hits

  function whiteHits(ctx, S) {
    const out = [];
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
      const scale = mult * (1 + (physical ? physPct : damagePct(S, 1 << w.school)) / 100) * (physical ? 1 - mit : 1);
      const min = (w.min + apBonus) * scale, max = (w.max + apBonus) * scale;
      const avg = (min + max) / 2;
      const t = isWand ? table(ctx, S, "magic") : table(ctx, S, ranged ? "ranged" : "melee");
      let miss = t.miss + (dual && !ranged ? 19 : 0);
      const glance = !ranged ? GLANCE_CHANCE[d] : 0;
      const critBase = isWand ? S.spellCrit : S.crit - critSuppression(ctx);
      const crit = Math.max(0, Math.min(critBase, 100 - miss - t.dodge - glance));
      const hit = Math.max(0, 100 - miss - t.dodge - glance - crit);
      const critMult = isWand ? 1.5 : 2;
      const perSwing = avg * (hit + crit * critMult + glance * GLANCE_DAMAGE[d]) / 100;
      out.push({
        label, item: item.name, min, max, avg, critAvg: avg * critMult, speed: w.speed,
        dps: perSwing / w.speed, miss, dodge: t.dodge, glance, crit, hit,
      });
    };
    if (S.mh) swing(S.mh, "Main hand", 1, false);
    if (S.oh) swing(S.oh, "Off hand", 0.5 * (1 + S.tal.offhandPct / 100), false);
    if (S.rg) swing(S.rg, S.rg.subclass === 19 ? "Wand" : "Ranged", 1, true);
    return out;
  }

  // ------------------------------------------------------------ abilities

  function pickRank(ab, level) {
    let best = null;
    for (const r of ab.ranks) if (r.level <= level && (!best || r.level >= best.level)) best = r;
    return best;
  }

  function modsFor(S, rank) {
    const list = S.tal.mods.filter((m) => overlap(m.mask, rank.mask));
    const flat = (op) => sum(list.filter((m) => m.op === op && !m.pct).map((m) => m.value));
    const pct = (op) => sum(list.filter((m) => m.op === op && m.pct).map((m) => m.value));
    return { list, flat, pct };
  }

  const value = (e, rank, level) => {
    const L = rank.maxLevel ? Math.min(level, rank.maxLevel) : level;
    return e.base + e.perLevel * Math.max(0, L - rank.spellLevel);
  };

  // Damage of one set of effects (an ability rank or a spell it triggers). Returns min/max of the direct part,
  // the total of any damage over time, healing, and what it needed.
  function effectDamage(effects, src, S, ctx, weaponSlot, mods) {
    const kind = src.defense === 3 ? "ranged" : src.defense === 2 ? "melee" : "magic";
    const physical = (src.school || 1) === 1;
    const weaponItem = kind === "ranged" ? S.rg : weaponSlot === "offHand" ? S.oh : S.mh;
    const ap = kind === "ranged" ? S.rap : S.ap;
    let weapon = null, flat = 0, wpct = 1, dmin = 0, dmax = 0, dot = 0, heal = 0, ticks = 0, needsWeapon = false;
    let hasDirect = false;
    const coefMult = 1 + mods.pct(24) / 100;
    const spellPower = physical ? 0 : spellPowerFor(S, src.school);
    let combo = false;
    for (const e of effects) {
      const v = value(e, src, ctx.level);
      const spread = (e.variance || 0) / 2;
      const perCombo = (e.perResource || 0) * COMBO_POINTS; // spread applies to the base part only
      if (perCombo) combo = true;
      switch (e.effect) {
        case 17: case 58: case 121: {
          if (!weaponItem) { needsWeapon = true; break; }
          const speed = e.effect === 121 ? normalSpeed(weaponItem, kind) : weaponItem.weapon.speed;
          weapon = { min: weaponItem.weapon.min + (ap / 14) * speed, max: weaponItem.weapon.max + (ap / 14) * speed };
          flat += v;
          hasDirect = true;
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
          break;
        case 2: {
          const bonus = (physical ? 0 : e.coef * spellPower * coefMult) + (e.apCoef || 0) * ap;
          dmin += v * (1 - spread) + perCombo + bonus;
          dmax += v * (1 + spread) + perCombo + bonus;
          hasDirect = true;
          break;
        }
        case 3:
          if (AP_DUMMY[src.familyName] === e.i) { dmin += (ap * v) / 100; dmax += (ap * v) / 100; hasDirect = true; }
          else if (src.familyName === "Execute" && e.i === 0) { dmin += v; dmax += v; hasDirect = true; }
          break;
        case 10:
          heal += v + e.coef * S.healing * coefMult;
          break;
        case 6:
          if (e.aura === 3 || e.aura === 53) { // damage over time
            const dur = (src.durMs || 0) + (perCombo ? (LONGER_PER_POINT[src.familyName] || 0) * COMBO_POINTS : 0);
            const n = e.period ? Math.floor(dur / e.period) : 0;
            ticks = Math.max(ticks, n);
            dot += n * (v + perCombo + (physical ? 0 : e.coef * spellPower * coefMult));
          } else if (e.aura === 8) {
            const n = e.period ? Math.floor((src.durMs || 0) / e.period) : 0;
            heal += n * (v + e.coef * S.healing * coefMult);
          }
          break;
      }
    }
    if (weapon) {
      dmin += (weapon.min + flat) * wpct;
      dmax += (weapon.max + flat) * wpct;
    }
    return { kind, physical, dmin, dmax, dot, heal, ticks, needsWeapon, hasDirect, combo };
  }

  function abilityResult(ab, S, ctx) {
    const rank = pickRank(ab, ctx.level);
    const base = { name: ab.name, icon: ab.icon, ability: ab };
    if (ab.talent) {
      const i = ctx.flat.findIndex((t) => t.id === ab.talent);
      if (i >= 0 && !ctx.ranks[i]) return { ...base, locked: "Needs the talent", rank: rank || ab.ranks[0] };
    }
    if (!rank) return { ...base, locked: `Learned at level ${ab.ranks[0].level}`, rank: ab.ranks[0] };
    if (ctx.cls.token === "DRUID" && (rank.powerType === 1 || rank.powerType === 3)) {
      return { ...base, rank, locked: "Cat/Bear form damage isn't worked out yet" };
    }
    const mods = modsFor(S, rank);
    const src = { ...rank, familyName: ab.name };
    let r = effectDamage(rank.effects, src, S, ctx, "mainHand", mods);
    // spells it sets off: add their damage (a periodic trigger fires once per tick)
    const periodicTrigger = rank.effects.find((e) => e.effect === 6 && e.aura === 23 && e.trigger);
    const tlist = Object.entries(rank.triggers || {});
    tlist.forEach(([id, t], n) => {
      const sub = effectDamage(t.effects, { ...rank, ...t, familyName: ab.name, school: t.school || rank.school,
        defense: t.defense || rank.defense, durMs: t.durMs }, S, ctx, n === 1 && S.oh ? "offHand" : "mainHand", mods);
      let times = 1;
      if (periodicTrigger && String(periodicTrigger.trigger) === id) {
        times = periodicTrigger.period ? Math.floor((rank.durMs || 0) / periodicTrigger.period) : 1;
      }
      r = { ...r, dmin: r.dmin + sub.dmin * times, dmax: r.dmax + sub.dmax * times, dot: r.dot + sub.dot,
        heal: r.heal + sub.heal, needsWeapon: r.needsWeapon || sub.needsWeapon,
        hasDirect: r.hasDirect || sub.hasDirect, physical: r.physical && sub.physical, kind: sub.kind || r.kind,
        combo: r.combo || sub.combo };
    });
    if (r.needsWeapon && !r.hasDirect) return { ...base, rank, locked: "Needs a weapon" };
    if (!r.hasDirect && !r.dot && !r.heal) return null; // nothing we can put a number on

    // talents: damage %, damage over time %, crit chance, crit damage, cast time, cost, cooldown
    const dmgMult = (1 + mods.pct(0) / 100) * (1 + mods.pct(8) / 100) * (1 + damagePct(S, rank.school || 1) / 100);
    const flatDmg = mods.flat(0);
    const dotMult = (1 + mods.pct(22) / 100) * (1 + damagePct(S, rank.school || 1) / 100);
    const physicalHit = r.physical && r.kind !== "magic";
    const mit = physicalHit ? 1 - mitigation(ctx, S) : 1;
    const dmin = r.hasDirect ? (r.dmin + flatDmg) * dmgMult * mit : 0;
    const dmax = r.hasDirect ? (r.dmax + flatDmg) * dmgMult * mit : 0;
    const dot = r.dot * dotMult;
    const isSpell = r.kind === "magic";
    const critChance = Math.max(0, (isSpell ? S.spellCrit : S.crit - critSuppression(ctx)) + mods.flat(7));
    const critMult = 1 + (isSpell ? 0.5 : 1) * (1 + mods.pct(15) / 100);
    const t = table(ctx, S, r.kind);
    const miss = Math.max(0, t.miss - mods.flat(16));
    const land = Math.max(0, 100 - miss - t.dodge) / 100;
    const avg = (dmin + dmax) / 2;
    const expected = land * (avg * (1 + Math.min(100, critChance) / 100 * (critMult - 1)) + dot);
    const channelMs = rank.channeled ? rank.durMs : 0;
    const castMs = Math.max(0, (rank.castMs + mods.flat(10)) * (1 + mods.pct(10) / 100));
    const cdMs = Math.max(0, rank.cdMs + mods.flat(11));
    const costRaw = Math.max(0, (rank.cost + mods.flat(14)) * (1 + mods.pct(14) / 100));
    const cost = rank.powerType === 1 ? costRaw / 10 : costRaw; // rage is stored x10
    const heal = r.heal * dmgMult;
    return {
      ...base, rank, kind: r.kind, school: rank.school, dmin, dmax, avg, critAvg: avg * critMult, dot, ticks: r.ticks,
      heal, healCrit: heal * 1.5, critChance: Math.min(100, critChance), miss, dodge: t.dodge, expected,
      castMs, channelMs, cdMs, cost, costPct: rank.cost ? 0 : rank.costPct, powerType: rank.powerType,
      combo: r.combo, mods: [...new Set(mods.list.map((m) => m.name))],
      perSecond: isSpell && ctx.cls.power === 0 && (expected || heal)
        ? (expected || heal * (1 + critChance / 100 * 0.5)) / Math.max(1.5, (channelMs || castMs) / 1000) : null,
    };
  }

  function compute(ctx) {
    const S = stats(ctx);
    const white = whiteHits(ctx, S);
    const list = (KP.abilities[ctx.cls.token] || []).map((ab) => abilityResult(ab, S, ctx)).filter(Boolean);
    return { S, white, abilities: list };
  }

  KP.calc = { compute, stats, talentEffects };
})();
