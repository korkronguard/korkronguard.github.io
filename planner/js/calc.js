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
  // ---- Estimates until real characters can be checked (from Classic; players can type their own) ----
  // Race starting stats [Str, Agi, Sta, Int, Spi]. The two Skyborne races are new in Forever: elf-like guesses.
  const RACE_BASE = {
    Human: [20, 20, 20, 20, 20], Orc: [23, 17, 22, 17, 23], Dwarf: [22, 16, 23, 19, 19],
    "Night Elf": [17, 25, 19, 20, 20], Undead: [19, 18, 21, 18, 25], Tauren: [25, 15, 22, 15, 22],
    Gnome: [15, 23, 19, 24, 20], Troll: [21, 22, 21, 16, 21],
    "High Order Skyborne": [17, 22, 18, 24, 19], "Windshaper Skyborne": [18, 22, 19, 21, 20],
  };
  // What each class gains from level 1 to 60 [Str, Agi, Sta, Int, Spi] (spread evenly over the levels)
  const CLASS_GAIN = {
    WARRIOR: [100, 60, 90, 10, 27], PALADIN: [85, 50, 80, 45, 50], HUNTER: [37, 105, 67, 40, 45],
    ROGUE: [60, 110, 55, 15, 30], PRIEST: [15, 20, 30, 100, 105], SHAMAN: [75, 40, 85, 65, 75],
    MAGE: [10, 15, 25, 105, 100], WARLOCK: [25, 30, 55, 90, 95], DRUID: [50, 35, 50, 75, 85],
  };
  // Agility per 1% crit and Intellect per 1% spell crit at level 60, and the class's own base crit
  const AGI_PER_CRIT = { WARRIOR: 20, PALADIN: 20, HUNTER: 53, ROGUE: 29, SHAMAN: 20, DRUID: 20, PRIEST: 20, MAGE: 20, WARLOCK: 20 };
  const BASE_CRIT = { WARRIOR: 0, PALADIN: 0.7, HUNTER: 0, ROGUE: 0, SHAMAN: 1.7, DRUID: 0.9, PRIEST: 3, MAGE: 3.2, WARLOCK: 2 };
  const INT_PER_SPELL_CRIT = { MAGE: 59.5, PRIEST: 59.2, WARLOCK: 60.6, DRUID: 60, SHAMAN: 59.2, PALADIN: 54 };
  const BASE_SPELL_CRIT = { MAGE: 0.2, PRIEST: 0.8, WARLOCK: 1.7, DRUID: 1.8, SHAMAN: 2.3, PALADIN: 0 };
  // lower levels need less Agility/Intellect per 1% (Classic); scaled by level, from level 10 up
  const perLevel = (at60, level) => at60 * Math.max(10, level) / 60;

  function estimateBase(cls, race, level) {
    const r = RACE_BASE[race] || RACE_BASE.Human;
    const g = CLASS_GAIN[cls] || [0, 0, 0, 0, 0];
    const out = {};
    STATS.forEach((k, i) => { out[k] = Math.round(r[i] + (g[i] * (level - 1)) / 59); });
    return out;
  }

  // Abilities whose damage includes a share of attack power kept in a "dummy" effect: [effect index]
  const AP_DUMMY = { Bloodthirst: 1, "Victory Rush": 2 };
  // Finishing moves are shown at 5 combo points. Rupture also lasts 2 sec longer per point (Classic).
  const COMBO_POINTS = 5;
  // effect target types that hit just your target (others hit an area, or you)
  const SINGLE_TARGET = [6, 25, 77];
  const LONGER_PER_POINT = { Rupture: 2000 };

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const overlap = (a, b) => a.some((v, k) => (v & b[k]) !== 0);

  // ------------------------------------------------------------ talents

  // What the learned talents do that the math can use.
  // Item "Equip:" effects and set bonuses that are plain bonuses (not procs).
  function gearAuras(ctx) {
    const list = [];
    const sets = {};
    for (const w of ctx.worn) {
      for (const e of w.item.effects || []) for (const a of e.auras || []) list.push({ ...a, name: w.item.name });
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

  // Warrior Weaponmaster / Rogue Hack and Slash: effect 0 = crit, 1 = armor ignored, 2 = extra attack chance.
  // Weapon subclasses: 0/1 axe, 4/5 mace, 6 polearm, 7/8 sword, 10 staff, 13 fist, 15 dagger.
  const WEAPON_TALENTS = {
    "Weaponmaster": [{ kind: "crit", effect: 0, subclasses: [0, 1, 6] }, { kind: "armor", effect: 1, subclasses: [4, 5, 10] },
      { kind: "extra", effect: 2, subclasses: [7, 8] }],
    "Hack and Slash": [{ kind: "crit", effect: 0, subclasses: [13, 15] }, { kind: "armor", effect: 1, subclasses: [4] },
      { kind: "extra", effect: 2, subclasses: [0, 7] }],
  };

  function talentEffects(ctx) {
    const out = {
      crit: 0, hit: 0, spellHit: 0, spellCrit: 0, dodge: 0, parry: 0, block: 0, defense: 0, armorPct: 0,
      statPct: { strength: 0, agility: 0, stamina: 0, intellect: 0, spirit: 0 },
      mods: [],       // ability modifiers: { op, pct, value, mask, name }
      dmgPct: [],     // damage done %: { school, value, name }
      offhandPct: 0, armorIgnore: 0, extraAttack: 0,
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
        // e.g. Dual Wield Specialization: the weapon has to be in the off hand (inventory type 22)
        const offHandOk = !(t.needs.invTypes & (1 << 22)) || ctx.worn.some((w) => w.slot === "offHand" && w.item.class === 2);
        if (!(have & t.needs.subclassMask) || !offHandOk) {
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
      // one talent, a different bonus per main-hand weapon type (the numbers are its 1st/2nd/3rd effect)
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
    // gear bonuses that work like talents (stat %, crit, hit, ability modifiers from set bonuses)
    for (const a of gearAuras(ctx)) {
      const v = a.value;
      switch (a.aura) {
        case 52: out.crit += v; break;
        case 290: out.crit += v; out.spellCrit += v; break;
        case 57: out.spellCrit += v; break;
        case 54: out.hit += v; break;
        case 55: out.spellHit += v; break;
        case 47: out.parry += v; break;
        case 49: out.dodge += v; break;
        case 51: out.block += v; break;
        case 142: if (a.misc & 1) out.armorPct += v; break;
        case 137:
          for (const [stat, bit] of STAT_BITS) if (a.misc === -1 || a.misc2 & bit) out.statPct[stat] += v;
          break;
        case 107: case 108:
          if (a.mask && a.mask.some((m) => m)) out.mods.push({ op: a.misc, pct: a.aura === 108, value: v, mask: a.mask, name: a.name });
          break;
      }
    }
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
    const SCHOOL_KEYS = { 2: "holyDamage", 4: "fireDamage", 8: "natureDamage", 16: "frostDamage", 32: "shadowDamage", 64: "arcaneDamage" };
    for (const a of gearAuras(ctx)) {
      const add = (k, v) => { gear[k] = (gear[k] || 0) + v; };
      if (a.aura === 29) { if (a.misc === -1) STATS.forEach((k) => add(k, a.value)); else if (STATS[a.misc]) add(STATS[a.misc], a.value); }
      else if (a.aura === 99) add("attackPower", a.value);
      else if (a.aura === 124) add("rangedAttackPower", a.value);
      else if (a.aura === 135) add("healing", a.value);
      else if (a.aura === 85 && a.misc === 0) add("manaRegen", a.value);
      else if (a.aura === 13) {
        if ((a.misc & 126) === 126) add("spellDamage", a.value);
        else for (const [bit, key] of Object.entries(SCHOOL_KEYS)) if (a.misc & bit) add(key, a.value);
      }
    }
    const tal = talentEffects(ctx);
    const g = (k) => gear[k] || 0;
    // base stats: what the player typed in, otherwise Classic estimates
    const est = estimateBase(cls.token, ctx.race, lvl);
    const base = {};
    const estimated = [];
    for (const k of STATS) {
      if (ctx.base && ctx.base[k]) base[k] = ctx.base[k];
      else { base[k] = est[k]; estimated.push(k); }
    }
    const attr = {}, attrBase = {};
    for (const k of STATS) {
      attr[k] = Math.round((base[k] + g(k)) * (1 + tal.statPct[k] / 100));
      attrBase[k] = Math.round(base[k] * (1 + tal.statPct[k] / 100));
    }
    // crit from Agility (and spell crit from Intellect). A typed-in crit % already includes the base part,
    // so only gear's share is added on top; otherwise it's the class's base crit + all Agility.
    const agiRatio = perLevel(AGI_PER_CRIT[cls.token] || 20, lvl);
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
    const baseAp = Math.max(0, lvl * apL + apC);
    const sp = g("spellPower") + g("spellDamage");
    const school = { holy: g("holyDamage"), fire: g("fireDamage"), nature: g("natureDamage"),
      frost: g("frostDamage"), shadow: g("shadowDamage"), arcane: g("arcaneDamage") };
    const worn = (slot) => ctx.worn.find((w) => w.slot === slot);
    const S = {
      gear, tal, attr, baseAp,
      ap: Math.max(0, baseAp + g("attackPower") + attr.strength * cls.apPerStr + attr.agility * cls.apPerAgi) +
        buffValue(ctx, "Battle Shout"),
      rap: Math.max(0, lvl * rapL + rapC + g("attackPower") + g("rangedAttackPower") + attr.agility * cls.rapPerAgi) +
        sum(hunterSelfBuffs(ctx).map((b) => b.value)),
      hit: g("hit") / per("meleeHit") + tal.hit,
      crit: critFromStats + g("crit") / per("meleeCrit") + tal.crit,
      spellHit: g("hit") / per("spellHit") + tal.spellHit,
      spellCrit: spellFromStats + g("crit") / per("spellCrit") + tal.spellCrit,
      estimated, estimate: { ...est, crit: (BASE_CRIT[cls.token] || 0) + attrBase.agility / agiRatio,
        spellCrit: intRatio ? (BASE_SPELL_CRIT[cls.token] || 0) + attrBase.intellect / intRatio : 0 },
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

  // a group buff or target debuff the player switched on: the highest rank a same-level Warrior would have
  function buffValue(ctx, name) {
    return (ctx.buffs || {})[name] ? rankValue(name, ctx.level) : 0;
  }
  function rankValue(name, level) {
    let v = 0;
    for (const r of (KP.abilities.BUFFS || {})[name] || []) if (r.level <= level) v = r.value;
    return v;
  }
  // a ranged Hunter always has Aspect of the Hawk up and Hunter's Mark on the target (rank for the level)
  function hunterSelfBuffs(ctx) {
    if (ctx.cls.token !== "HUNTER" || hunterStyle(ctx) !== "ranged") return [];
    return ["Aspect of the Hawk", "Hunter's Mark"].map((name) => ({ name, value: rankValue(name, ctx.level) })).filter((b) => b.value);
  }
  // ranged or melee Hunter: the player's choice, else melee for Survival with at least two melee talents
  const HUNTER_MELEE_TALENTS = ["Lacerating Strikes", "Strider Kick", "Predator's Edge", "Savage Strikes", "Expose Prey"];
  function hunterStyle(ctx) {
    if (ctx.style === "ranged" || ctx.style === "melee") return ctx.style;
    const pts = [0, 0, 0], learned = new Set();
    ctx.flat.forEach((t, i) => { if (ctx.ranks[i]) { pts[t.tree] += ctx.ranks[i]; learned.add(t.name); } });
    const melee = HUNTER_MELEE_TALENTS.filter((n) => learned.has(n)).length;
    return pts[2] > Math.max(pts[0], pts[1]) && melee >= 2 ? "melee" : "ranged";
  }
  const SUNDER_STACKS = 5;

  function mitigation(ctx, S) {
    const sundered = Math.max(0, (ctx.target.armor || 0) - buffValue(ctx, "Sunder Armor") * SUNDER_STACKS);
    const armor = sundered * (1 - S.tal.armorIgnore / 100);
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


  // ------------------------------------------------------------ procs (numbers from the talents' own ranks)

  const rankOf = (ctx, name, pred) => {
    const i = ctx.flat.findIndex((t) => t.name === name && (!pred || pred(t)));
    return i >= 0 ? ctx.ranks[i] || 0 : 0;
  };
  // a talent's first number at the learned rank (Flurry 5-25% attack speed, Deep Wounds 20/40/60%...)
  const talentValue = (ctx, name) => {
    const i = ctx.flat.findIndex((t) => t.name === name);
    const r = i >= 0 ? ctx.ranks[i] || 0 : 0;
    const e = r && (ctx.flat[i].effects[r - 1] || [])[0];
    return e ? e.value : 0;
  };

  function procs(ctx, S) {
    const out = { haste: 0, extraAttack: 0, deepWounds: 0, lines: [] };
    const flurry = talentValue(ctx, "Flurry"); // attack speed for 3 swings after a crit
    if (flurry) {
      const c = Math.max(0, S.crit - critSuppression(ctx)) / 100;
      const uptime = 1 - Math.pow(1 - c, 4); // ~4 hits (white + abilities) per 3 Flurry swings
      out.haste = flurry * uptime;
      out.lines.push(`Flurry: +${flurry}% attack speed, up ${Math.round(uptime * 100)}% of the time`);
    }
    if (S.tal.extraAttack && S.mh) out.extraAttack = S.tal.extraAttack; // Weaponmaster / Hack and Slash
    const dw = talentValue(ctx, "Deep Wounds"); // % of average weapon damage over 12 sec after a crit
    if (dw && S.mh) out.deepWounds = dw / 100;
    return out;
  }

  // ------------------------------------------------------------ rough rotation DPS

  // Classic rage: rage = 7.5 x damage / c, where c depends on level
  const rageConversion = (L) => 0.0091107836 * L * L + 3.225598133 * L + 4.2652911;

  const EXECUTE_PHASE = 0.2; // share of a boss fight spent below 20% health
  const buffNote = (ctx) => {
    const on = Object.keys(ctx.buffs || {}).filter((k) => ctx.buffs[k]);
    return on.length ? ` With ${on.join(" and ")}.` : " No group buffs or debuffs (switch them on above).";
  };

  function rotation(ctx, S, white, abilities) {
    const byName = Object.fromEntries(abilities.filter((a) => !a.locked).map((a) => [a.name, a]));
    const whiteDps = white.reduce((x, w) => x + w.dps, 0);
    const parts = white.map((w) => ({ name: `${w.label} (white)`, dps: w.dps }));
    const extra = white.filter((w) => w.deepWounds).reduce((x, w) => x + w.deepWounds, 0);
    if (extra) parts.push({ name: "Deep Wounds", dps: extra });
    const token = ctx.cls.token;
    const result = (dps, note) => ({ dps, parts: parts.filter((p) => p.dps > 0.05), note });

    if (token === "WARRIOR" && white.length) {
      const c = rageConversion(ctx.level);
      const unbridled = talentValue(ctx, "Unbridled Wrath") / 100; // chance per hit of 1 extra rage
      let rage = 0;
      for (const w of white.filter((x) => x.label !== "Ranged" && x.label !== "Wand")) {
        rage += (w.perSwing * 7.5 / c + unbridled) / w.effSpeed;
      }
      if (rankOf(ctx, "Anger Management")) rage += 1 / 3;
      let dps = whiteDps + extra;
      const rageIncome = rage, firstAbilityPart = parts.length;
      const spend = (a) => {
        if (!a || !a.cdMs || rage <= 0) return;
        const perSec = a.cost / (a.cdMs / 1000);
        const f = perSec ? Math.min(1, rage / perSec) : 1;
        rage -= perSec * f;
        const d = (f * a.expected) / (a.cdMs / 1000);
        dps += d;
        parts.push({ name: a.name + (f < 1 ? " (not every cooldown)" : ""), dps: d });
      };
      spend(byName["Mortal Strike"] || byName["Bloodthirst"]);
      spend(byName["Whirlwind"]);
      // leftover rage: Heroic Strike replaces a main-hand swing
      const hs = byName["Heroic Strike"], mh = white.find((w) => w.label === "Main hand");
      if (hs && mh && rage > 0) {
        const swingRage = mh.perSwing * 7.5 / c;
        const perSec = Math.min(rage / (hs.cost + swingRage), 1 / mh.effSpeed);
        const d = perSec * Math.max(0, hs.expected - mh.perSwing);
        dps += d;
        parts.push({ name: `Heroic Strike (${Math.round(perSec * mh.effSpeed * 100)}% of swings)`, dps: d });
      }
      // Execute phase: the last 20% of the boss's health, all rage goes into Execute (one per 1.5 sec at most)
      const ex = byName["Execute"];
      if (ex && ex.cost >= 0 && ex.expected) {
        const rate = ex.cost ? Math.min(1 / 1.5, rageIncome / ex.cost) : 1 / 1.5;
        const leftover = Math.max(0, rageIncome - rate * ex.cost);
        const exDps = rate * ex.expected + leftover * ex.perRage;
        let normal = 0;
        for (const p of parts.slice(firstAbilityPart)) {
          normal += p.dps;
          p.dps *= 1 - EXECUTE_PHASE;
          p.name += " (first 80%)";
        }
        dps += -normal * EXECUTE_PHASE + exDps * EXECUTE_PHASE;
        parts.push({ name: "Execute (last 20%)", dps: exDps * EXECUTE_PHASE });
      }
      return result(dps, "Rage from white hits (Classic formula), then Mortal Strike/Bloodthirst, Whirlwind, Heroic Strike with what's left; " +
        "below 20% health, every rage point goes into Execute." + buffNote(ctx));
    }

    if (token === "ROGUE" && white.length) {
      const regen = 10; // energy per second
      const dagger = S.mh && S.mh.subclass === 15;
      const builders = ["Sinister Strike", "Hemorrhage", ...(dagger ? ["Backstab"] : []),
        ...(dagger && S.oh && S.oh.subclass === 15 ? ["Mutilate"] : [])]
        .map((n) => byName[n]).filter((a) => a && a.cost && a.expected);
      const evis = byName["Eviscerate"];
      if (builders.length && evis) {
        const sealFate = talentValue(ctx, "Seal Fate") / 100;
        const best = builders.map((b) => {
          const cp = (b.name === "Mutilate" ? 2 : 1) + (b.critChance / 100) * sealFate;
          const n = 5 / cp;
          const energy = n * b.cost + evis.cost;
          return { b, n, energy, dps: (n * b.expected + evis.expected) / (energy / regen) };
        }).sort((x, y) => y.dps - x.dps)[0];
        parts.push({ name: `${best.b.name} (builder)`, dps: (best.n * best.b.expected) / (best.energy / regen) });
        parts.push({ name: "Eviscerate (5 points)", dps: evis.expected / (best.energy / regen) });
        return result(whiteDps + extra + best.dps, `${best.b.name} to 5 combo points, then Eviscerate, 10 energy per second. ` +
          (dagger ? "Backstab/Mutilate assume you're behind the target. " : "") + "No Slice and Dice yet." + buffNote(ctx));
      }
    }

    if (token === "HUNTER") {
      const h = hunterRotation(ctx, S, white, byName);
      if (h) return h;
    }

    if (ctx.cls.power === 0) {
      const usable = abilities.filter((a) => !a.locked && !a.aoe && !a.cc && !a.heal && a.expected > 0 && a.kind === "magic");
      const castTime = (a) => Math.max(1.5, (a.channelMs || a.castMs) / 1000);
      // filler: spells you can cast back to back (no cooldown); a channeled spell's damage over time counts
      const fillers = usable.filter((a) => !a.cdMs && (a.directExpected > 0 || a.channeled))
        .map((a) => ({ a, dps: (a.channeled ? a.expected : a.directExpected) / castTime(a) }))
        .sort((x, y) => y.dps - x.dps);
      const filler = fillers[0];
      if (filler) {
        let dps = 0, busy = 0;
        const rot = [];
        // damage over time spells worth keeping up: refreshed when they run out
        const dots = usable.filter((a) => !a.channeled && a.dotExpected > 0 && a.durMs > 0 && !a.cdMs)
          .map((a) => {
            const every = Math.max(a.durMs / 1000, castTime(a));
            return { a, every, dps: a.expected / every, time: castTime(a) / every };
          })
          .filter((d) => d.dps / d.time > filler.dps) // better than casting the filler in that time
          .sort((x, y) => y.dps / y.time - x.dps / x.time);
        for (const d of dots) {
          if (busy + d.time > 0.9) continue;
          busy += d.time;
          dps += d.dps;
          rot.push({ name: `${d.a.name} (kept up)`, dps: d.dps });
        }
        const fd = filler.dps * (1 - busy);
        dps += fd;
        rot.push({ name: `${filler.a.name} (filler)`, dps: fd });
        if (!white.length || dps > whiteDps) {
          return { dps, parts: rot, note: "Keeps damage-over-time spells up and casts the best single-target spell in between. " +
            "Mana, cooldowns and procs aren't counted." };
        }
      }
    }
    return result(whiteDps + extra, white.length ? "White hits only; this class's rotation isn't worked out yet." : "Equip a weapon to see damage.");
  }

  // ------------------------------------------------------------ Hunter

  const FIGHT_SEC = 180; // the fight length the mana budget assumes

  // Fit attacks into the global cooldown / cast time, then into the mana you have over the fight.
  // shots: { name, perUse, rate (uses per sec if always pressed), mana, busy (sec of button time per use) }
  function fitShots(shots, manaPerSec) {
    let time = 0.95; // leave a little room for moving and reacting
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
    // Rapid Fire: attack speed for 15 sec every few minutes (Rapid Killing shortens the cooldown)
    const rf = ((KP.spellbook || {}).HUNTER || []).find((b) => b.name === "Rapid Fire");
    const rfRank = rf && [...rf.ranks].reverse().find((r) => (r.level || 1) <= level);
    let haste = 0;
    if (rfRank) {
      const pct = parseFloat((/speed by (\d+)/.exec(rf.desc) || [])[1] || 0);
      const cut = talentEffect("Rapid Killing", (e) => e.aura === 107 && e.misc === 11);
      const cd = Math.max(1, rfRank.cdMs + (cut ? cut.value : 0));
      haste = (pct * (rfRank.durMs || 15000)) / cd;
    }
    // mana: Classic regen (15 + Spirit/5 every 2 sec) only partly continues while you keep shooting;
    // talents that "allow N% of your Mana Regeneration to continue while casting" (Rapid Recuperation needs Serpent Sting)
    const keepPct = (withSting) => Math.max(0, ...ctx.flat.map((t, i) => {
      const r = ctx.ranks[i];
      if (!r || (t.name === "Rapid Recuperation" && !withSting)) return 0;
      const m = /allows? (\d+)% of your Mana Regeneration to continue while casting/i.exec(t.desc[r - 1] || "");
      return m ? parseFloat(m[1]) : 0;
    }));
    const spiritRegen = (15 + S.attr.spirit / 5) / 2;
    const manaPerSec = (withSting) => (S.mana + (S.mp5 / 5 + spiritRegen * keepPct(withSting) / 100) * FIGHT_SEC) / FIGHT_SEC;
    const shot = (a, opts = {}) => a && !a.locked && a.expected > 0 && {
      name: opts.name || a.name, perUse: opts.perUse != null ? opts.perUse : a.expected,
      rate: opts.rate || 1 / Math.max(1.5, (opts.every || a.cdMs || 1500) / 1000), mana: manaOf(a),
      busy: opts.busy != null ? opts.busy : Math.max(1.5, a.castMs / 1000), cast: a.castMs / 1000,
    };
    const parts = [];
    let dps = 0;
    const notes = [];
    const starved = [];

    if (style === "ranged") {
      const auto = white.find((w) => w.label === "Ranged");
      if (!auto) return null;
      const aimed = byName["Aimed Shot"], multi = byName["Multi-Shot"];
      const big = aimed && (!multi || aimed.expected >= multi.expected) ? aimed : multi; // they share a cooldown
      const shots = [shot(big), shot(byName["Arcane Shot"]), shot(byName["Sniper Shot"]),
        shot(byName["Serpent Sting"], { every: byName["Serpent Sting"] && byName["Serpent Sting"].durMs })].filter(Boolean);
      const fitted = fitShots(shots, manaPerSec(shots.some((s) => s.name === "Serpent Sting")));
      starved.push(...fitted.filter((s) => s.manaCut).map((s) => s.name));
      const castFrac = Math.min(0.9, sum(fitted.map((s) => s.rate * s.f * s.cast))); // Auto Shot pauses while you cast
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
      // Raptor Strike goes on your next swing: it adds its damage over a normal swing
      if (raptor && !raptor.locked) shots.push(shot(raptor, { perUse: Math.max(0, raptor.expected - mh.perSwing),
        rate: 1 / Math.max(raptor.cdMs / 1000, mh.effSpeed), busy: 0 }));
      shots.push(shot(byName["Strider Kick"]));
      const mb = byName["Mongoose Bite"];
      const expose = talentEffect("Expose Prey", (e) => e.aura === 42);
      if (mb && expose) { // with Hunter's Mark up, every melee hit can allow Mongoose Bite
        const swingsPerSec = sum(white.filter((x) => x.label !== "Ranged" && x.label !== "Wand").map((w) => 1 / w.effSpeed));
        const bleed = learned("Lacerating Strikes") ? 1.4 : 1; // Lacerating Strikes: +40% as a bleed
        shots.push(shot(mb, { perUse: mb.expected * bleed, rate: Math.min(1 / (mb.cdMs / 1000), swingsPerSec * expose.value / 100) }));
      }
      const lac = byName["Lacerate"];
      shots.push(shot(lac, { every: lac && lac.durMs }));
      const trap = byName["Immolation Trap"];
      shots.push(shot(trap)); // Forever lets you lay traps in combat; in melee the boss stands on it
      const fitted = fitShots(shots.filter(Boolean), manaPerSec(false));
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
    notes.push(`mana over a ${FIGHT_SEC / 60}-minute fight (Classic regen formula); pet and hawks not counted; Aspect of the Viper not used`);
    const note = notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") + "." + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, starved };
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
      // melee procs: Flurry's attack speed, extra swings; Deep Wounds bleeds on crits (ignores armor)
      const effSpeed = ranged ? w.speed : w.speed / (1 + pr.haste / 100);
      const swings = ranged || label !== "Main hand" ? 1 : 1 + pr.extraAttack;
      let deepWounds = 0;
      if (pr.deepWounds && label === "Main hand") {
        const critsPerSec = (crit / 100) / effSpeed + 0.25 * Math.max(0, S.crit - critSuppression(ctx)) / 100;
        const uptime = Math.min(1, critsPerSec * 12);
        deepWounds = uptime * pr.deepWounds * ((w.min + w.max) / 2 + (S.ap / 14) * w.speed) / 12;
      }
      out.push({
        label, item: item.name, min, max, avg, critAvg: avg * critMult, speed: w.speed, effSpeed, perSwing,
        dps: (perSwing * swings) / effSpeed, miss, dodge: t.dodge, glance, crit, hit, deepWounds, procs: pr.lines,
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
    // a trap's damage spell has its own mask (Clever Traps points at it)
    const list = S.tal.mods.filter((m) => overlap(m.mask, rank.mask) || (rank.mask2 && overlap(m.mask, rank.mask2)));
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
    let combo = false, single = false, area = false;
    for (const e of effects) {
      const hitsTarget = e.target !== 1;
      const isDamage = [2, 17, 31, 58, 121].includes(e.effect) || (e.effect === 6 && (e.aura === 3 || e.aura === 53));
      if (isDamage && !hitsTarget) continue; // damage to yourself
      if (isDamage) { if (SINGLE_TARGET.includes(e.target)) single = true; else area = true; }
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
    return { kind, physical, dmin, dmax, dot, heal, ticks, needsWeapon, hasDirect, combo, single, area };
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
    // only spells the ability itself sets off (not "when you're struck" procs like Lightning Shield)
    const fired = new Set(rank.effects.filter((e) => e.trigger && (e.effect === 64 || (e.effect === 6 && e.aura === 23)))
      .map((e) => String(e.trigger)));
    const tlist = Object.entries(rank.triggers || {}).filter(([id]) => fired.has(id));
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
        combo: r.combo || sub.combo, single: r.single || sub.single, area: r.area || sub.area };
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
    const directExpected = land * avg * (1 + Math.min(100, critChance) / 100 * (critMult - 1));
    const dotExpected = land * dot;
    const expected = directExpected + dotExpected;
    const channelMs = rank.channeled ? rank.durMs : 0;
    const castMs = Math.max(0, (rank.castMs + mods.flat(10)) * (1 + mods.pct(10) / 100));
    const cdMs = Math.max(0, (rank.cdMs + mods.flat(11)) * (1 + mods.pct(11) / 100));
    const costRaw = Math.max(0, (rank.cost + mods.flat(14)) * (1 + mods.pct(14) / 100));
    const cost = rank.powerType === 1 ? costRaw / 10 : costRaw; // rage is stored x10
    const heal = r.heal * dmgMult;
    // Execute: each leftover rage point adds amp x 10 damage, with the same talents, armor, hit and crit
    const amp = (rank.effects.find((e) => e.amp) || {}).amp;
    const perRage = amp && avg ? amp * 10 * dmgMult * mit * (expected / avg) : 0;
    return {
      perRage,
      ...base, rank, kind: r.kind, school: rank.school, dmin, dmax, avg, critAvg: avg * critMult, dot, ticks: r.ticks,
      heal, healCrit: heal * 1.5, critChance: Math.min(100, critChance), miss, dodge: t.dodge, expected,
      castMs, channelMs, cdMs, cost, costPct: rank.cost ? 0 : rank.costPct, powerType: rank.powerType,
      combo: r.combo, aoe: r.area && !r.single,
      // crowd control (root, stun, fear, sleep): not part of a damage rotation
      cc: rank.effects.some((e) => e.effect === 6 && [5, 7, 12, 26].includes(e.aura)), directExpected, dotExpected, channeled: !!rank.channeled,
      durMs: rank.durMs, mods: [...new Set(mods.list.map((m) => m.name))],
      perSecond: isSpell && ctx.cls.power === 0 && (expected || heal)
        ? (expected || heal * (1 + critChance / 100 * 0.5)) / Math.max(1.5, (channelMs || castMs) / 1000) : null,
    };
  }

  function compute(ctx) {
    const S = stats(ctx);
    const white = whiteHits(ctx, S);
    const list = (KP.abilities[ctx.cls.token] || []).map((ab) => abilityResult(ab, S, ctx)).filter(Boolean);
    return { S, white, abilities: list, rotation: rotation(ctx, S, white, list) };
  }

  KP.calc = { compute, stats, talentEffects, estimateBase, hunterStyle };
})();
