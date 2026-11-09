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
  // Warrior from a real character (Orc, levels 2-6 with 18-21 Agility: level - 20 + the client's 2 per Agility); the
  // others are still Classic's
  const BASE_RAP = { HUNTER: [2, -10], WARRIOR: [1, -20], ROGUE: [1, -10] };
  // Druid forms, from the game data: Cat Form (Passive) 3025, Bear Form (Passive) 1178, Dire Bear Form (Passive) 9635
  // and SpellShapeshiftForm (attack speed). In a form your weapon's damage is replaced by a base hit that grows with
  // level; that part isn't in the files, so it uses Classic's rule (0.85-1.25 x level per second of attack speed).
  const FORMS = {
    cat: { name: "Cat Form", ap: 12, apPerAgi: 1, speed: 1.0, armorPct: 0, health: 0 },
    bear: { name: "Bear Form", ap: 30, apPerAgi: 0, speed: 2.5, armorPct: 180, health: 20 },
    dire: { name: "Dire Bear Form", ap: 120, apPerAgi: 0, speed: 2.5, armorPct: 360, health: 600 },
  };
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
  // Base parry (from the level it's learned) and block (with a shield), %: the guild's Orc Warrior's character sheet
  // shows 5% each, a little less while defense skill catches up with the level (addon snapshots, levels 2-16: parry 0
  // until level 6). Other classes aren't measured yet: theirs come from gear and talents only.
  const BASE_AVOID = { WARRIOR: { parry: 5, parryFrom: 6, block: 5 } };
  // lower levels need less Agility/Intellect per 1% (Classic); scaled by level, from level 10 up
  const perLevel = (at60, level) => at60 * Math.max(10, level) / 60;

  function estimateBase(cls, race, level) {
    const r = RACE_BASE[race] || RACE_BASE.Human;
    const own = classShare(cls, level);
    const out = {};
    STATS.forEach((k, i) => { out[k] = Math.round(r[i] + own[i]); });
    return out;
  }

  // ---- Measured on real characters: site/data/measured.js, written by tools/snapshots.py from the guild's addon
  // snapshots (2026-11-05: an Orc Warrior at levels 2-16, an Undead Priest at 6-11) ----
  // A value by level ({ level: value }): the measured one (a straight line between two measured levels), above the last
  // measured level a straight line to at60 (the original game's level 60 value), below the first below(first)
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
  // A class's own share of the base stats at a level (the race's share goes on top): measured where the guild has a
  // character of the class (its race's share taken off), else the original game's gains spread evenly over the levels.
  // Below the first measured level, a straight line from the race's own stats at level 1.
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
  // Agility per 1% crit at a level: measured where the guild has a character whose crit and dodge come from Agility
  // alone (a Warrior: from its dodge, which weapon skill doesn't change), then a straight line to the original game's
  // level 60 value; elsewhere the original game's value scaled by level (an estimate)
  function agiPerCrit(cls, level) {
    const at60 = AGI_PER_CRIT[cls] || 20;
    const m = KP.measured.agiPerCrit[cls];
    return m ? byLevel(m, level, at60, (first) => m[first]) : perLevel(at60, level);
  }

  // Abilities whose damage includes a share of attack power kept in a "dummy" effect: [effect index]
  const AP_DUMMY = { Bloodthirst: 1, "Victory Rush": 2 };
  // Abilities whose damage is "N times your main hand's damage per second", N kept in a "dummy" effect: [effect index]
  const WEAPON_DPS_DUMMY = { "Hammer of the Righteous": 2 };
  // Finishing moves are shown at 5 combo points. Rupture also lasts 2 sec longer per point (Classic).
  const COMBO_POINTS = 5;
  // effect target types that hit just your target (others hit an area, or you)
  const SINGLE_TARGET = [6, 25, 77];
  const LONGER_PER_POINT = { Rupture: 2000 };
  // Eviscerate says "increased by Attack Power" but the number is worked out by the server. Estimate: 3% of
  // attack power per combo point (the rule from the next expansion). Flagged in the notes.
  const EVISCERATE_AP_PER_POINT = 0.03;
  const POISON_CHANCE = 20; // % chance per hit to apply a poison: Classic's; not in the files
  // ranged weapon subclasses (item class 2): 2 bow, 3 gun, 16 thrown, 18 crossbow, 19 wand
  const RANGED_SUBCLASSES = (1 << 2) | (1 << 3) | (1 << 16) | (1 << 18) | (1 << 19);

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const overlap = (a, b) => a.some((v, k) => (v & b[k]) !== 0);

  // The level from which you can have an item. Dungeon and raid loot and many quest rewards have no level requirement (0
  // or 1: Onyxia Tooth Pendant, Darkmantle, Forever's Discarded Circlet at item level 43): the quest or the dungeon is
  // the gate, and that's on the server. Such an item counts from 5 levels below its item level (3,708 of the 4,521 items
  // with stats and a requirement have exactly that), at most 60.
  const wearableFrom = (it) => (it.req > 1 ? it.req : Math.min(60, Math.max(1, it.ilvl - 5)));

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

  // ------------------------------------------------------------ stances and forms
  // The game's form numbers (SpellShapeshiftForm): Warrior stances 17 Battle, 18 Defensive, 19 Berserker; Druid 1 Cat,
  // 5 Bear, 8 Dire Bear, 31 Moonkin; 28 Shadowform; 30 Stealth. Masks in the data use bit (form - 1).
  // The Abilities tab sets the stance (ctx.stance), Druid form (ctx.form, incl. "moonkin"), ctx.prowl / ctx.stealth,
  // ctx.shadowform and ctx.aspect. Elsewhere a Warrior's stance is unknown (no stance numbers, no stance locks); a Druid's
  // form is the one the planner works out, a Priest with Shadowform is in it.
  const STANCE_FORM = { battle: 17, defensive: 18, berserker: 19 };
  const DRUID_FORM = { cat: 1, bear: 5, dire: 8 };
  const FORM_NAMES = { 1: "Cat Form", 5: "Bear Form", 8: "Dire Bear Form", 31: "Moonkin Form", 17: "Battle Stance",
    18: "Defensive Stance", 19: "Berserker Stance", 28: "Shadowform", 30: "Stealth", 2: "Tree of Life", 32: "Spirit of Redemption" };
  const inMask = (mask, form) => !!form && ((mask >>> (form - 1)) & 1) === 1;
  const maskNames = (mask) => Object.keys(FORM_NAMES).map(Number).filter((f) => inMask(mask, f)).map((f) => FORM_NAMES[f]);
  // A Warrior's stance: the one set on the Abilities tab, else the main stance the build lives in (the Priority tab's
  // rule): tanking -> Defensive, Fury -> Berserker (from the level it's learned), anything else -> Battle. Estimates and
  // builds count that stance's numbers all fight; dancing to another stance for a few presses (Overpower) isn't counted.
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

  // the form the character is in: a number, null (none), or undefined (not known)
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
  // Why a stance or form stops this ability (only when the Abilities tab set it), or null
  function stanceLock(ctx, ab, rank) {
    const book = (((KP.spellbook || {})[ctx.cls.token] || []).find((b) => b.name === ab.name)) || {};
    const tok = ctx.cls.token;
    if (tok === "WARRIOR" && ctx.stance && book.stances && !inMask(book.stances, STANCE_FORM[ctx.stance])) {
      return "Needs " + maskNames(book.stances).filter((n) => /Stance/.test(n)).join(" or ");
    }
    if (tok === "ROGUE" && ctx.stealth === false && book.stealthOnly) return "Needs Stealth";
    if (tok === "DRUID") {
      if (ctx.prowl === false && book.stealthOnly) return "Needs Prowl";
      // a form chosen on the Abilities tab: a mana spell works in it only if its form list says so (Healing Touch:
      // caster form only; Faerie Fire: every form)
      const f = ctx.form === "moonkin" ? 31 : (ctx.form === "cat" || ctx.form === "bear") ? DRUID_FORM[druidForm(ctx)] : null;
      if (f && rank.powerType === 0 && !inMask(book.stances || 0, f)) return `Not in ${FORM_NAMES[f]}`;
    }
    if (tok === "PRIEST" && ctx.shadowform === true && book.notIn && inMask(book.notIn, 28)) return "Not in Shadowform";
    return null;
  }
  // a Warrior stance's own numbers (game data: "<stance> Passive"): crit, damage done and taken, attack power %
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
      mods: [],       // ability modifiers: { op, pct, value, mask, name }
      dmgPct: [],     // damage done %: { school, value, name }
      threatPct: [],  // threat %: { school, value, name } (Defiance; less threat from Burning Soul, Silent Resolve...)
      rangedPct: [],  // damage % with a ranged weapon only (a talent that needs one): { mask = weapon subclasses, value, name }
      offhandHit: 0,  // % hit for off-hand attacks only (a talent that needs an off-hand weapon)
      upkeep: [],     // spells the plan casts on cooldown because a counted bonus needs them (Shadow and Flame)
      healCrit: [],   // critical healing bonus %: { school, value } (Holy Power)
      costSchool: [], // mana cost % for a school's spells: { school, value } (Shadowform -50% Shadow)
      damageTaken: 0, // % physical damage taken (Molten Skin -10, Shadowform -15): survival and leveling rest
      offhandPct: 0, armorIgnore: 0, extraAttack: 0,
      healthPct: 0, powerPct: 0, apPct: 0, rapPct: 0, spPct: 0, meleeHaste: 0, rangedHaste: 0, castHaste: 0,
      lines: [],      // for the sheet: what each talent added
      racials: [],    // for the sheet: each racial and what it added (or why it isn't counted)
    };
    const weapons = ctx.worn.filter((w) => w.item.class === 2);
    const weaponMask = weapons.reduce((m, w) => m | (1 << w.item.subclass), 0);
    const armorMask = ctx.worn.filter((w) => w.item.class === 4).reduce((m, w) => m | (1 << w.item.subclass), 0);
    ctx.flat.forEach((t, i) => {
      const r = ctx.ranks[i];
      if (!r) return;
      if (t.needs) {
        const have = t.needs.class === 2 ? weaponMask : armorMask;
        // e.g. Dual Wield Specialization: the weapon has to be in the off hand (inventory type 22)
        const offHandOk = !(t.needs.invTypes & (1 << 22)) || ctx.worn.some((w) => w.slot === "offHand" && w.item.class === 2);
        if (!(have & t.needs.subclassMask) || !offHandOk) {
          out.lines.push({ name: t.name, text: "needs a matching weapon or shield", off: true });
          return;
        }
      }
      // An ability you cast, not an always-on bonus, with three exceptions that change your numbers all fight:
      // a form you stay in (Shadowform, Moonkin Form), a buff that lasts as long as its cooldown (Ice Barrier),
      // and a damage cooldown (Death Wish, Arcane Power), averaged over its cooldown like the racials.
      // Only effects on yourself count (Bestial Wrath buffs the pet, Power Infusion is cast on someone else).
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
          if (e.aura === 51 && share === 1) { out.block += v; parts.push(`+${v}% block`); } // Holy Shield, kept up
          if (e.aura === 87 && e.misc & 1) { out.damageTaken += v; parts.push(`${Math.round(v * 10) / 10}% physical damage taken`); }
          if ((e.aura === 107 || e.aura === 108) && e.mask && e.mask.some((m) => m)) {
            out.mods.push({ op: e.misc, pct: e.aura === 108, value: v, mask: e.mask, name: t.name });
            if (e.misc === 0) parts.push(`+${Math.round(v * 10) / 10}% damage to its spells`);
            if (e.misc === 15) parts.push(`+${Math.round(v)}% crit damage`);
          }
        }
        // Ice Barrier's "+15% Frost damage for 1 min" sits on another spell: read from its tooltip
        const extra = t.name === "Ice Barrier" && /increasing your Frost damage by (\d+)% for/.exec(t.desc[0] || "");
        if (extra) { out.dmgPct.push({ school: 16, value: +extra[1], name: t.name }); parts.push(`+${extra[1]}% Frost damage`); }
        if (parts.length) out.lines.push({ name: t.name, text: [...new Set(parts)].join(", ") + how });
        return;
      }
      // a talent that works only in some forms (Sharpened Claws: Cat and Bear Form) or not in some (the Holy talents in
      // Shadowform), by the game data, when the form is known
      if (shape !== undefined && ((t.forms && !inMask(t.forms, shape)) || (t.notIn && inMask(t.notIn, shape)))) {
        out.lines.push({ name: t.name, text: t.forms ? `only in ${maskNames(t.forms).join(", ")}` : `not in ${maskNames(t.notIn).join(", ")}`, off: true });
        return;
      }
      const parts = [];
      // a talent for one kind of weapon counts only for that weapon's attacks (its requirement says which): Ranged
      // Weapon and Wand Specialization's damage for the ranged slot, Furious Precision's hit for the off hand
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
    handRules(ctx, out);
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
    racialEffects(ctx, out);
    stanceEffects(ctx, out);
    return out;
  }

  // Talents whose effect the server works out (a "dummy" aura in the files): their number comes from the tooltip.
  // Shadow Weaving and Shadow and Flame are assumed at full effect (you cast Shadow spells / Conflagrate all fight).
  const ENRAGE_HIT_SEC = 2.5; // an attacker swinging every 2 sec, 1 swing in 5 dodged, parried or missed
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
    // Shadow and Flame: its bonuses count when the plan casts Conflagrate and Shadowburn on cooldown (out.upkeep);
    // compute() also tries it without (ctx.shadowAndFlame false) and keeps the better plan
    const snf = ctx.shadowAndFlame !== false && text("Shadow and Flame");
    if (snf) {
      const sh = /Conflagrate increases all Shadow damage you deal by (\d+)%/.exec(snf), fi = /Shadowburn increases all Fire damage you deal by (\d+)%/.exec(snf);
      const parts = [];
      if (sh && learned("Conflagrate")) { out.dmgPct.push({ school: 32, value: +sh[1], name: "Shadow and Flame" }); out.upkeep.push("Conflagrate"); parts.push(`+${sh[1]}% Shadow (Conflagrate)`); }
      if (fi && learned("Shadowburn")) { out.dmgPct.push({ school: 4, value: +fi[1], name: "Shadow and Flame" }); out.upkeep.push("Shadowburn"); parts.push(`+${fi[1]}% Fire (Shadowburn)`); }
      if (parts.length) out.lines.push({ name: "Shadow and Flame", text: parts.join(", ") + ", with them cast on cooldown" });
    }
    // Enrage: "chance to deal 10% increased Physical damage for 12 sec after being the victim of any damaging attack".
    // Counted while something is hitting you (beingHit), with a hit landing every ENRAGE_HIT_SEC.
    if (beingHit(ctx) && (m = /(\d+)% chance to deal (\d+)% increased Physical damage for (\d+) sec/.exec(text("Enrage")))) {
      const uptime = 1 - (1 - m[1] / 100) ** (m[3] / ENRAGE_HIT_SEC);
      out.dmgPct.push({ school: 1, value: m[2] * uptime, name: "Enrage" });
      out.lines.push({ name: "Enrage", text: `+${Math.round(m[2] * uptime * 10) / 10}% Physical damage (up ${Math.round(uptime * 100)}% of the time while you're being hit)` });
    }
    // Demonic Sacrifice gives what the sacrificed demon decides (ctx.sacrifice; compute() tries both): the Imp Shadow
    // damage, the Succubus Fire damage. Pets' own damage isn't counted, so giving one up costs nothing here.
    const sacrifice = text("Demonic Sacrifice") && SACRIFICE[ctx.sacrifice];
    if (sacrifice && (m = sacrifice.re.exec(text("Demonic Sacrifice")))) {
      out.dmgPct.push({ school: sacrifice.school, value: +m[1], name: "Demonic Sacrifice" });
      out.lines.push({ name: "Demonic Sacrifice", text: `+${m[1]}% ${sacrifice.what} damage (${sacrifice.demon} sacrificed: the better of the two for this build)` });
    }
    // Improved Righteous Fury changes Righteous Fury itself: counts while tanking (Righteous Fury on)
    if (ctx.tank && (m = /all damage taken is reduced by (\d+)%/.exec(text("Improved Righteous Fury")))) {
      out.damageTaken -= +m[1];
      out.lines.push({ name: "Improved Righteous Fury", text: `-${m[1]}% damage taken while tanking (Righteous Fury on)` });
    }
  }

  // Racials (game data). Always-on ones count fully; cooldowns (Blood Fury, Berserking, Elune's Light, Eureka!) are
  // averaged over their cooldown, as if used whenever ready. Damage against one creature type isn't counted.
  function racialEffects(ctx, out) {
    const race = ((KP.classes && KP.classes.races) || []).find((r) => r.name === ctx.race);
    const r1 = (v) => Math.round(v * 100) / 100;
    for (const rc of (race && race.racials) || []) {
      if (rc.classMask && !(rc.classMask & (1 << (ctx.cls.id - 1)))) continue; // the other classes' version
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
      if (a.aura === 29) { if (a.misc === -1) STATS.forEach((k) => { add(k, a.value); }); else if (STATS[a.misc]) add(STATS[a.misc], a.value); }
      // an effect's attack power is melee only (aura 99); a ranged one comes as its own effect (124), often beside it.
      // An item's "attack power" stat counts for both.
      else if (a.aura === 99) add("meleeAttackPower", a.value);
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
    // base stats: what the player typed in, otherwise estimateBase (measured classes, else Classic estimates)
    const est = estimateBase(cls.token, ctx.race, lvl);
    const base = {};
    const estimated = [];
    for (const k of STATS) {
      if (ctx.base && ctx.base[k]) base[k] = ctx.base[k];
      else { base[k] = est[k]; estimated.push(k); }
    }
    // group stat buffs count like gear (on top of typed-in base values); Blessing of Kings multiplies everything
    const statBuffs = { strength: buffValue(ctx, "Strength of Earth"), agility: buffValue(ctx, "Grace of Air"),
      intellect: buffValue(ctx, "Arcane Intellect") };
    const motw = buffValue(ctx, "Mark of the Wild");
    for (const k of STATS) gear[k] = (gear[k] || 0) + (statBuffs[k] || 0) + motw;
    const kings = buffValue(ctx, "Blessing of Kings");
    // Druid form: Heart of the Wild adds Strength in Cat Form and Stamina in Bear Form (its 3rd and 2nd numbers)
    const formKey = druidForm(ctx);
    const form = formKey && FORMS[formKey];
    const formPct = { strength: 0, stamina: 0 };
    if (form) {
      const i = ctx.flat.findIndex((t) => t.name === "Heart of the Wild");
      const vals = i >= 0 && ctx.ranks[i] ? (ctx.flat[i].effects[ctx.ranks[i] - 1] || []).map((e) => e.value) : [];
      if (formKey === "cat") formPct.strength = vals[2] || 0; else formPct.stamina = vals[1] || 0;
    }
    const attr = {}, attrBase = {};
    for (const k of STATS) {
      attr[k] = Math.round((base[k] + g(k)) * (1 + (tal.statPct[k] + kings + (formPct[k] || 0)) / 100));
      attrBase[k] = Math.round(base[k] * (1 + tal.statPct[k] / 100));
    }
    // crit from Agility (and spell crit from Intellect). A typed-in crit % already includes the base part,
    // so only gear's share is added on top; otherwise it's the class's base crit + all Agility.
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
    // can be below 0 at low levels; only the total is kept at 0 or more (a level 2 Orc Warrior with 27 Strength has
    // 40 attack power in game: 6 - 20 + 54)
    const baseAp = lvl * apL + apC;
    // Classic, confirmed in game (a level 2 Orc Warrior with 25 Stamina has 99 health: 29 base + 20 + 5 x 10): the
    // first 20 Stamina give 1 health each, the rest the game table's amount (10)
    const healthFromStamina = Math.min(attr.stamina, 20) + Math.max(0, attr.stamina - 20) * rules.healthPerStamina[lvl - 1];
    // the same for mana: the first 20 Intellect give 1 mana each, the rest 15 (Classic; confirmed in game by an Undead
    // Priest with 26 Intellect: 260 mana at level 6 = 150 base + 20 + 6 x 15)
    const manaFromIntellect = Math.min(attr.intellect, 20) + Math.max(0, attr.intellect - 20) * 15;
    const sp = g("spellPower") + g("spellDamage");
    const school = { holy: g("holyDamage"), fire: g("fireDamage"), nature: g("natureDamage"),
      frost: g("frostDamage"), shadow: g("shadowDamage"), arcane: g("arcaneDamage") };
    const worn = (slot) => ctx.worn.find((w) => w.slot === slot);
    // talents that turn Intellect or Spirit into power (Careful Aim, Mental Dexterity, Spiritual Guidance...)
    const fromStats = statTalents(ctx, attr);
    // Arcane Blast's stacks over its window (ctx.blastCycle Blasts, chosen by compute()): spell damage for everything else
    const blast = ctx.blastCycle ? stackingSpell(ctx) : null;
    const blastSp = blast ? (blast.pct / 100) * attr.intellect * Math.min(ctx.blastCycle, blast.max) : 0;
    const formAp = form ? form.ap + attr.agility * form.apPerAgi +
      (talentNumber(ctx, "Predatory Strikes", /by (\d+)% of your level/) * lvl) / 100 : 0;
    const shield = !!ctx.worn.find((w) => w.slot === "offHand" && w.item.class === 4 && w.item.subclass === 6);
    const baseAvoid = BASE_AVOID[cls.token] || {};
    const S = {
      gear, tal, attr, baseAp, form: formKey,
      ap: (Math.max(0, baseAp + g("attackPower") + g("meleeAttackPower") + attr.strength * cls.apPerStr + attr.agility * cls.apPerAgi) +
        buffValue(ctx, "Battle Shout") + buffValue(ctx, "Blessing of Might") + formAp + fromStats.ap) * (1 + tal.apPct / 100),
      rap: (Math.max(0, lvl * rapL + rapC + g("attackPower") + g("rangedAttackPower") + attr.agility * cls.rapPerAgi) +
        sum(hunterSelfBuffs(ctx).map((b) => b.value)) + buffValue(ctx, "Trueshot Aura") + fromStats.ap) * (1 + tal.rapPct / 100),
      // haste from racials (Wind Blessed, Berserking averaged): melee and ranged attack speed, casting speed
      meleeHaste: tal.meleeHaste, rangedHaste: tal.rangedHaste, castHaste: tal.castHaste, damageTaken: tal.damageTaken,
      hit: g("hit") / per("meleeHit") + tal.hit,
      crit: critFromStats + g("crit") / per("meleeCrit") + tal.crit + buffValue(ctx, "Leader of the Pack"),
      spellHit: g("hit") / per("spellHit") + tal.spellHit,
      // Leader of the Pack: all crit since the 30 Oct 2026 hotfix (it was melee and ranged only)
      spellCrit: spellFromStats + g("crit") / per("spellCrit") + tal.spellCrit + buffValue(ctx, "Leader of the Pack"),
      estimated, estimate: { ...est, crit: (BASE_CRIT[cls.token] || 0) + attrBase.agility / agiRatio,
        spellCrit: intRatio ? (BASE_SPELL_CRIT[cls.token] || 0) + attrBase.intellect / intRatio : 0 },
      sp: (sp + fromStats.sp + blastSp) * (1 + tal.spPct / 100), school,
      blast: blast && { ...blast, k: ctx.blastCycle, perStack: (blast.pct / 100) * attr.intellect * (1 + tal.spPct / 100) },
      healing: (g("healing") + g("spellPower") + fromStats.sp + fromStats.healing) * (1 + tal.spPct / 100),
      armor: Math.round(itemArmor * (1 + tal.armorPct / 100 + (form ? form.armorPct : 0) / 100)) + g("bonusArmor") + attr.agility * 2 + fromStats.armor +
        (form ? talentNumber(ctx, "Thick Hide", /gain (\d+) additional base Armor per level/) * lvl : 0),
      defense: g("defense") / per("defense") + tal.defense,
      // dodge from Agility only where it's measured (a Warrior's: the same Agility per 1% as crit); for the other
      // classes it isn't known yet, so it's left out
      dodge: g("dodge") / per("dodge") + tal.dodge + (KP.measured.agiPerCrit[cls.token] ? attr.agility / agiRatio : 0),
      parry: g("parry") / per("parry") + tal.parry + (lvl >= (baseAvoid.parryFrom || 1) ? baseAvoid.parry || 0 : 0),
      block: g("block") / per("block") + tal.block + (shield ? baseAvoid.block || 0 : 0),
      blockValue: g("blockValue"),
      health: Math.round((rules.baseHealth[cls.token][lvl - 1] + healthFromStamina + g("health") +
        (form ? form.health : 0)) * (1 + tal.healthPct / 100)),
      mana: cls.power === 0 ? Math.round((rules.baseMana[cls.token][lvl - 1] + manaFromIntellect + g("mana")) * (1 + tal.powerPct / 100)) : 0,
      mp5: g("manaRegen") + (cls.power === 0 ? buffValue(ctx, "Blessing of Wisdom") : 0), // + Blessing of Wisdom (mana every 5 sec)
      // in a Druid form the form's own attack replaces the weapon (ctx.formWeaponDps: the weapon's damage per second
      // at the form's speed instead, the guild's bear sheet's rule; only the MCP check asks for it)
      mh: form ? formWeapon(form, lvl, ctx.formWeaponDps && worn("mainHand") && worn("mainHand").item.weapon ? worn("mainHand").item : null)
        : worn("mainHand") && worn("mainHand").item.weapon ? worn("mainHand").item : null,
      oh: form ? null : worn("offHand") && worn("offHand").item.weapon ? worn("offHand").item : null,
      rg: worn("ranged") && worn("ranged").item.weapon ? worn("ranged").item : null,
      shield,
    };
    // "Use:" buffs a tool asks for, averaged over the fight (ctx.useBuffs: [{ auras, share }], share = the part of the
    // fight it's up). Only the MCP check passes them; elsewhere "Use:" effects aren't in the math. Haste multiplies.
    for (const b of ctx.useBuffs || []) {
      for (const a of b.auras || []) {
        if ([319, 138, 342].includes(a.aura)) S.meleeHaste = ((1 + S.meleeHaste / 100) * (1 + (a.value * b.share) / 100) - 1) * 100;
      }
    }
    // "what if" numbers typed on the Abilities tab replace the worked-out ones: attack power (melee and ranged),
    // spell damage (all schools), healing
    const o = ctx.override;
    if (o) {
      if (o.ap != null) { S.ap = o.ap; S.rap = o.ap; }
      if (o.sp != null) { S.sp = o.sp; S.school = { holy: 0, fire: 0, nature: 0, frost: 0, shadow: 0, arcane: 0 }; }
      if (o.healing != null) S.healing = o.healing;
    }
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
  // damage % from talents for one ranged weapon (Ranged Weapon Specialization, Wand Specialization)
  function rangedPct(S, item) {
    return item ? sum(S.tal.rangedPct.filter((d) => d.mask & (1 << item.subclass)).map((d) => d.value)) : 0;
  }

  // a group buff or target debuff the player switched on: the highest rank a same-level Warrior would have
  function buffValue(ctx, name) {
    return (ctx.buffs || {})[name] ? rankValue(name, ctx.level) : 0;
  }
  // the strongest rank known at this level (you'd cast your best one; a few ranks in the files are odd,
  // e.g. Trueshot Aura's level 60 rank is weaker than its level 50 one)
  function rankValue(name, level) {
    let v = 0;
    for (const r of (KP.abilities.BUFFS || {})[name] || []) if (r.level <= level) v = Math.max(v, r.value);
    return v;
  }
  // a ranged Hunter always has Aspect of the Hawk up and Hunter's Mark on the target (rank for the level); the
  // Abilities tab can switch the aspect (ctx.aspect: "hawk" or "none")
  function hunterSelfBuffs(ctx) {
    if (ctx.cls.token !== "HUNTER") return [];
    const ranged = hunterStyle(ctx) === "ranged";
    const hawk = ctx.aspect ? ctx.aspect === "hawk" : ranged;
    return [hawk && "Aspect of the Hawk", ranged && "Hunter's Mark"].filter(Boolean)
      .map((name) => ({ name, value: rankValue(name, ctx.level) })).filter((b) => b.value);
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
    // armor debuffs on the target: 5 Sunders, Faerie Fire, Curse of Recklessness
    // Sunder Armor and Expose Armor don't stack in Classic (the stronger one counts; check in Forever)
    const sunderLike = Math.max(buffValue(ctx, "Sunder Armor") * SUNDER_STACKS, buffValue(ctx, "Expose Armor") * COMBO_POINTS);
    const sundered = Math.max(0, (ctx.target.armor || 0) - sunderLike -
      buffValue(ctx, "Faerie Fire") - buffValue(ctx, "Curse of Recklessness"));
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

  // How much hit removes every miss against the target (Classic attack table): abilities and one-weapon white hits,
  // dual-wield white hits (+19%), spells (1% always misses)
  function hitCaps(ctx) {
    const d = Math.max(0, Math.min(3, ctx.target.diff));
    const melee = MELEE_MISS[d] + (d >= 3 ? 1 : 0);
    return { melee, dualWhite: melee + 19, spell: SPELL_MISS[d] - 1 };
  }

  function critSuppression(ctx) {
    return Math.max(0, Math.min(3, ctx.target.diff)); // ~1% less crit per level the target is above you
  }

  // Learned talents whose tooltip turns a share of Intellect or Spirit into attack power, spell damage, healing or
  // armor (read from the text, which uses the game's rank values)
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
        out.healing += attr.spirit * (m[1] - m[2]) / 100; // the damage share also counts for healing below
        out.sp += attr.spirit * m[2] / 100;
      }
      if ((m = /Armor by an amount equal to (\d+)% of your Intellect/.exec(d))) out.armor += attr.intellect * m[1] / 100;
    });
    return out;
  }

  // Cat or Bear Form for a Druid: Bear in tank mode, else Cat for a Feral build (most points in Feral Combat);
  // without a tank choice, Bear when the build has Natural Reaction or Thick Hide (like the Priority tab)
  function druidForm(ctx) {
    if (ctx.cls.token !== "DRUID") return null;
    // a set form (the Abilities tab works out each ability in the form it needs): "bear", "cat" or "none"
    if (ctx.form === "bear") return bookRank("DRUID", "Dire Bear Form", ctx.level) ? "dire" : bookRank("DRUID", "Bear Form", ctx.level) ? "bear" : null;
    if (ctx.form === "cat") return bookRank("DRUID", "Cat Form", ctx.level) ? "cat" : null;
    if (ctx.form === "none" || ctx.form === "moonkin") return null; // Moonkin keeps the caster's weapon and stats
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
    return { name: `${form.name} (base attack)`, class: 2, subclass: 13, inv: 13, form: true,
      weapon: { min: level * 0.85 * form.speed, max: level * 1.25 * form.speed, speed: form.speed } };
  }

  function normalSpeed(item, kind) {
    if (item && item.form) return item.weapon.speed;
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

  const WF_TOTEM_CHANCE = 0.2;
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
    // Windfury Totem: a chance per main-hand hit of an extra attack with more attack power, in a Druid's form too (a combat log:
    // 122 on two Druids in Cat Form; no Bear seen yet). A Shaman's own Windfury Weapon turns it off for them (game data; the log
    // agrees). The chance isn't in the files: Classic's 20%.
    const wft = buffValue(ctx, "Windfury Totem");
    if (wft && S.mh && !(ctx.cls.token === "SHAMAN" && bookRank("SHAMAN", "Windfury Weapon", ctx.level))) {
      const boost = rawSwing(S, S.mh, wft) / rawSwing(S, S.mh);
      out.extraAttack += WF_TOTEM_CHANCE * boost;
      out.lines.push(`Windfury Totem: ${WF_TOTEM_CHANCE * 100}% chance of an extra attack with +${wft} attack power (chance: Classic's)`);
    }
    const dw = talentValue(ctx, "Deep Wounds"); // % of average weapon damage over 12 sec after a crit
    if (dw && S.mh) out.deepWounds = dw / 100;
    return out;
  }

  // ------------------------------------------------------------ rough rotation DPS

  // Classic rage: rage = 7.5 x damage / c, where c = a x level² + b x level + c0. A Bear's hits still use it: no Bear has
  // been measured yet. A Warrior's don't (RAGE_PER_SWING_SEC).
  const RAGE_C = [0.0091107836, 3.225598133, 4.2652911];
  const rageConversion = (L) => RAGE_C[0] * L * L + RAGE_C[1] * L + RAGE_C[2];
  const RAGE_PER_C = 7.5; // rage for a hit of c damage
  const rageFromDamage = (damage, level) => (RAGE_PER_C * damage) / rageConversion(level);

  const EXECUTE_PHASE = 0.2; // share of a boss fight spent below 20% health
  const RECKLESS_SWINGS_CD = 15; // seconds (Forever's launch notes; its spell has no cooldown row in the files)
  const RECKLESS_SWINGS_HEALTH = 0.25; // of base health per use (its spell 1329555's health cost in SpellPower)
  const buffNote = (ctx) => {
    const on = Object.keys(ctx.buffs || {}).filter((k) => ctx.buffs[k]);
    if (!on.length) return " No group buffs or debuffs (switch them on above).";
    return on.length > 3 ? ` With ${on.length} group buffs and debuffs on.` : ` With ${on.join(" and ")}.`;
  };

  // A Warrior's rage on Forever, from the first combat log (2026-11-08; six Warriors with swings of 1.8 to 2.8 sec): a white
  // hit gives this per second of weapon speed whatever its damage, so every weapon gives the same rage a second, and a crit
  // exactly twice that. Not seen yet: level 60, or an off hand (half, as in the original game's rule).
  const RAGE_PER_SWING_SEC = 3.45;
  const OFFHAND_RAGE = 0.5;
  const RAGE_TAKEN_PER_C = 2.5; // rage for taking a hit of c damage (the original game's rule)
  const RAGE_PER_HIT_TAKEN = 0.45; // and on Forever this much more per hit that lands (the same log: 0.6 to 0.95 a hit of 1 to 29 damage)
  const REVENGE_WINDOW = 5; // seconds Revenge stays usable after a block, dodge or parry (the original game's)
  // whether a Warrior can use an ability in the stance it fights in (the game's stance list; none = any stance)
  const inStance = (ctx, name) => {
    const b = ((KP.spellbook || {}).WARRIOR || []).find((x) => x.name === name);
    return !b || !b.stances || inMask(b.stances, STANCE_FORM[warriorStance(ctx)]);
  };

  // A tank's rage from the enemy's swings (one every MOB_SWING seconds): the hits that land, only against an enemy of
  // your level (a raid boss's damage isn't known), Shield Specialization on blocks and Master of Defense on dodges and
  // parries (with a shield). Also how the swings end, for Shield Block and Revenge.
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

  // A Warrior: rage in, then attacks in order, each only if your stance allows it (the game's stance lists). Rage from
  // your white hits (RAGE_PER_SWING_SEC), Charge at each pull when the fight's length is known (leveling: ctx.fightSec) and,
  // whenever something is hitting you (beingHit), from the enemy's swings (tankRage). When you're being hit in Defensive
  // Stance it goes on Shield Block and Revenge first (a block pays Shield Block back and lights Revenge, the most damage per
  // rage), then on Shield Slam; everyone then on Mortal Strike or Bloodthirst, Whirlwind and Heroic Strike with what's left,
  // and below 20% health on Execute.
  function warriorRotation(ctx, S, white, byName, parts, dps) {
    const L = ctx.level, stance = warriorStance(ctx), tank = stance === "defensive";
    const use = (name) => (byName[name] && inStance(ctx, name) ? byName[name] : null);
    const unbridled = talentValue(ctx, "Unbridled Wrath") / 100; // chance per hit of 1 extra rage
    // Dual Wield Specialization makes the off hand give more (its tooltip's %)
    const offhandBonus = talentNumber(ctx, "Dual Wield Specialization", /Rage generated by your off-hand attacks by (\d+)%/);
    const swingRage = (w) => RAGE_PER_SWING_SEC * w.speed * ((w.hit + w.glance + w.crit * 2) / 100) *
      (w.label === "Off hand" ? OFFHAND_RAGE * (1 + offhandBonus / 100) : 1);
    let rage = 0;
    for (const w of white.filter((x) => x.label !== "Ranged" && x.label !== "Wand")) {
      rage += (swingRage(w) + unbridled) / w.effSpeed;
    }
    if (rankOf(ctx, "Anger Management")) rage += 1 / 3;
    const from = [`white hits (${RAGE_PER_SWING_SEC} a second of weapon speed, twice that on a crit` + (offhandBonus ? ", more from the off hand)" : ")")];
    // Reckless Swings: the next few swings give extra rage; its 15 sec cooldown is in the patch notes, not the files
    const reckless = talentNumber(ctx, "Reckless Swings", /next (\d+) melee attacks/) *
      talentNumber(ctx, "Reckless Swings", /generate (\d+) additional Rage/);
    rage += reckless * cooldownUses(ctx, RECKLESS_SWINGS_CD * 1000);
    if (reckless) from.push("Reckless Swings");
    // Bloodrage on cooldown: its tooltip's rage at once and over 10 sec, plus Improved Bloodrage's %, for a share of
    // your base health (the game's spell data). ctx.bloodrage false: not used (leveling tries both)
    const blood = ctx.bloodrage !== false && bookRank("WARRIOR", "Bloodrage", L);
    const bloodRage = blood ? (/(\d+) rage at the cost of health.* additional (\d+) rage/.exec(bookDesc("WARRIOR", "Bloodrage")) || [])
      .slice(1).reduce((a, n) => a + +n, 0) * (1 + talentNumber(ctx, "Improved Bloodrage", /by (\d+)%/) / 100) : 0;
    if (bloodRage) {
      rage += bloodRage * cooldownUses(ctx, blood.cdMs);
      from.push("Bloodrage");
    }
    // Charge: Battle Stance, or Defensive with Vanguard (its rage from the game's spell data, by rank)
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
    let gcdUsed = 0; // share of each second spent on global cooldowns and casts
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
    // a tank holding a group's enemies (a dungeon pull, a raid boss) also uses Sunder Armor; solo, rage goes into damage
    // so the mob dies sooner
    const holding = t && (ctx.group || (ctx.target && ctx.target.mode === "boss"));
    const flatThreat = [];
    warriorAttacks(ctx, white, use, () => rage, (r) => { rage = r; }, gcdUsed, holding, (p) => {
      if (p.flatThreat) flatThreat.push({ spell: p.spell, perSec: p.perSec, threat: p.flatThreat });
      else { dps += p.dps; parts.push(p); }
      spentOn.push(p.spell);
    });
    // leftover rage: Heroic Strike replaces a main-hand swing
    const hs = use("Heroic Strike"), mh = white.find((w) => w.label === "Main hand");
    if (hs && mh && rage > 0) {
      const perSec = Math.min(rage / (hs.cost + swingRage(mh)), 1 / mh.effSpeed);
      const d = perSec * Math.max(0, hs.expected - mh.perSwing);
      dps += d;
      parts.push({ name: `Heroic Strike (${Math.round(perSec * mh.effSpeed * 100)}% of swings)`, dps: d, spell: "Heroic Strike" });
      spentOn.push("Heroic Strike with what's left");
    }
    // Execute phase: the last 20% of the boss's health, all rage goes into Execute (one per 1.5 sec at most)
    const ex = use("Execute");
    if (ex && ex.cost >= 0 && ex.expected) {
      const rate = ex.cost ? Math.min(1 / 1.5, rageIncome / ex.cost) : 1 / 1.5;
      const leftover = Math.max(0, rageIncome - rate * ex.cost);
      const exDps = rate * ex.expected + leftover * ex.perRage;
      let normal = 0;
      for (const p of parts.slice(firstAbilityPart)) {
        normal += p.dps;
        p.dps *= 1 - EXECUTE_PHASE;
        if (p.perSec) p.perSec *= 1 - EXECUTE_PHASE; // uses per second over the whole fight, like its damage
        p.name += " (first 80%)";
      }
      for (const f of flatThreat) f.perSec *= 1 - EXECUTE_PHASE;
      dps += -normal * EXECUTE_PHASE + exDps * EXECUTE_PHASE;
      parts.push({ name: "Execute (last 20%)", dps: exDps * EXECUTE_PHASE, spell: "Execute" });
      spentOn.push("below 20% health, every rage point on Execute");
    }
    const note = `Rage from ${from.join(", ")}. Spent on ${spentOn.join(", ") || "nothing yet"}.` +
      (use("Shield Slam") ? " Not counted: Shield Slam's bonus from Block Value." : "") + buffNote(ctx);
    // healthSpent: health per second Reckless Swings and Bloodrage cost (leveling counts it as eaten back, like Life
    // Tap's); pullRage: Charge's rage at each pull (counted when the fight's length is known: compute() against a
    // same-level mob)
    const baseHealth = rules.baseHealth.WARRIOR[L - 1];
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, pullRage, flatThreat, rageIncome,
      healthSpent: (reckless ? baseHealth * RECKLESS_SWINGS_HEALTH * cooldownUses(ctx, RECKLESS_SWINGS_CD * 1000) : 0) +
        (bloodRage ? ((baseHealth * blood.costPct) / 100) * cooldownUses(ctx, blood.cdMs) : 0) };
  }

  // A Warrior's attacks besides Heroic Strike and Execute, most damage per rage first (the Priority tab's order), each as
  // often as its cooldown, trigger or upkeep allows while rage and the global cooldown leave room. Rend: its bleed
  // renewed as it runs out. Slam: its cast pauses your swings (that white damage lost) unless a talent says it no longer
  // does (Improved Slam). Overpower: after the target dodges one of your swings, and with Bloodthrill after main-hand hits
  // on a target with your Rend (Rend is then kept up first). Sunder Armor deals no damage (its armor is the target
  // debuff level 60 builds count); a tank holding a group's enemies (holding) uses it too, its flat threat (game data)
  // ranked with the others' damage per rage (a Warrior's threat bonuses apply to both alike). Each part: { dps, spell,
  // perSec = uses per second, flatThreat = Sunder's threat per use instead of damage }.
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
    const rendLost = rendCast ? rend.dotExpected * (1 - rendCast.landed) : 0; // its bleed after the mob dies
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
      const fromRend = rendUp && mh ? bloodthrill * (Math.max(0, 100 - mh.miss - mh.dodge) / 100) / mh.effSpeed : 0;
      push(op, Math.min(1000 / op.cdMs, dodges + fromRend));
    }
    const sunder = holding && bookRank("WARRIOR", "Sunder Armor", ctx.level);
    if (sunder && sunder.threat) {
      const cost = sunder.cost / 10 - talentNumber(ctx, "Improved Sunder Armor", /by (\d+)/);
      list.push({ a: { name: "Sunder Armor", cost }, perSec: 1 / 1.5, dmg: sunder.threat, flatThreat: sunder.threat });
    }
    list.sort((x, y) => y.dmg / (y.a.cost || 1e-9) - x.dmg / (x.a.cost || 1e-9));
    for (const c of list) take(c.a, c.perSec, c.dmg, c.flatThreat);
  }

  // Shield Block on cooldown (off the global cooldown, needs a shield): until the next one it blocks up to its number of
  // the swings that aren't missed, dodged or parried, instead of the usual block chance. Shield Specialization's rage
  // on those blocks pays for it in part or all. { perSec: extra blocks per second, rage: rage per second it costs }
  function shieldBlock(ctx, S, t, rage) {
    const sb = S.shield && inStance(ctx, "Shield Block") && bookRank("WARRIOR", "Shield Block", ctx.level);
    const max = +((/only block (\d+) attacks/.exec(bookDesc("WARRIOR", "Shield Block")) || [])[1] || 0);
    if (!sb || !max || !sb.cdMs) return { perSec: 0, rage: 0 };
    const cd = sb.cdMs / 1000;
    const swingsIn = Math.min(sb.durMs / 1000, cd) * t.swings;
    const blocked = Math.min(max, swingsIn * Math.max(0, 1 - t.o.miss - t.o.dodge - t.o.parry));
    const extra = Math.max(0, blocked - swingsIn * t.o.block); // blocks it adds over the usual chance
    const net = (sb.cost / 10 - extra * t.perBlock) / cd;
    const f = net <= 0 ? 1 : Math.min(1, Math.max(0, rage) / net);
    return { perSec: (f * extra) / cd, rage: f * net };
  }

  // Revenge's uses per second: after its cooldown it's ready at once if a block, dodge or parry came in the last
  // REVENGE_WINDOW seconds (or since it was used), else at the next one
  function revengeRate(t, moreBlocks, cd) {
    const procs = t.swings * (t.o.dodge + t.o.parry + t.o.block) + moreBlocks;
    return procs > 0 ? 1 / (cd + Math.exp(-procs * Math.min(REVENGE_WINDOW, cd)) / procs) : 0;
  }

  function rotation(ctx, S, white, abilities) {
    const byName = Object.fromEntries(abilities.filter((a) => !a.locked).map((a) => [a.name, a]));
    // melee swings only: a gun or wand doesn't auto-shoot while you melee (a Hunter's and a caster's plans use theirs)
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
    // Shaman: melee or casting by the main tree (more Elemental points: casting; more Enhancement: melee); with
    // neither ahead, whichever does more. A build can say which (ctx.style "caster" / "melee").
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

    // a caster casts (its spare time out of mana goes to the wand, inside casterRotation); white hits alone are only
    // for a class with no rotation worked out
    if (ctx.cls.power === 0) {
      const wand = white.find((w) => w.label === "Wand");
      const c = casterRotation(ctx, S, abilities, wand ? wand.dps : 0);
      if (c) return c;
    }
    return result(whiteDps + extra, white.length ? "White hits only; this class's rotation isn't worked out yet." : "Equip a weapon to see damage.");
  }

  // ------------------------------------------------------------ casters

  // Mana per second from Spirit, while you haven't spent mana for 5 seconds, for every class on Forever: Spirit ÷ 4 up to
  // 50 Spirit, each point above that half as much. The game's own GetManaRegen on the guild's characters (90 addon
  // snapshots, 2026-11-08: Priest, Druid, Paladin, Shaman, Hunter and Mage, levels 1-34, up to 136 Spirit) is exactly that,
  // whatever their level or Intellect, with gear's mana per 5 seconds on top (tools/snapshots.py). More than 136 Spirit
  // hasn't been seen. The original game had a rule per class ((13 + Spirit ÷ 4) ÷ 2 for a Priest...).
  const SPIRIT_PER_MANA = 4;
  const SPIRIT_FULL = 50;
  const REGEN_SEEN = ["PRIEST", "DRUID", "PALADIN", "SHAMAN", "HUNTER", "MAGE"]; // classes whose real characters showed it
  const REGEN_RULE = `Spirit ÷ ${SPIRIT_PER_MANA} per second, half that above ${SPIRIT_FULL} Spirit, as on Forever`;
  const spiritRegenOf = (spirit) => (Math.min(spirit, SPIRIT_FULL) + Math.max(0, spirit - SPIRIT_FULL) / 2) / SPIRIT_PER_MANA;

  // A stat from the addon's /kp export ("base:effective:plus:minus", UnitStat's four numbers) without gear or buffs.
  // The game's first number already counts gear: a level 15 Warrior's Strength "52:52:9:0" is 43 without its +9.
  function bareStat(field) {
    const [, effective, plus, minus] = field.split(":").map(Number);
    return effective - plus + minus;
  }
  function manaBudget(ctx, S, talentKeep) {
    const spiritRegen = spiritRegenOf(S.attr.spirit);
    const keep = talentKeep(ctx);
    // the leveling model (tools/make_builds.js) sets how much mana per second a fight may use (it pays for it in drinking)
    if (ctx.manaPerSec != null) return { perSec: ctx.manaPerSec, keep, busy: 0, extras: [] };
    // Mage: one Evocation (regen +1500% for 8 sec) and the best mana gem you can conjure, once per fight
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
        // "restore 1100 mana" or, with the tooltip's range, "restore 1045 to 1155 mana": use the average
        const m = /restore (\d+)(?: to (\d+))? mana/.exec(bookDesc("MAGE", gem));
        extra += m ? (parseFloat(m[1]) + parseFloat(m[2] || m[1])) / 2 : 0;
        extras.push("a mana gem");
      }
    }
    return { perSec: (S.mana + extra + (S.mp5 / 5 + spiritRegen * keep / 100 + blockMana(ctx, S)) * FIGHT_SEC) / FIGHT_SEC, keep, busy, extras };
  }
  // Something is hitting you: alone against a mob, or as the tank (a dungeon group's, a raid boss's: ctx.tank or a
  // Warrior in Defensive Stance); a group's or raid's damage dealers aren't hit often enough to count it. ctx.beingHit
  // says so outright (the addon's DPS tab: "I'm tanking it" or "someone else is").
  const beingHit = (ctx) => (ctx.beingHit != null ? ctx.beingHit :
    (ctx.target && ctx.target.mode === "same" && (!ctx.group || ctx.tank)) || ctx.tank === true ||
    (ctx.cls.token === "WARRIOR" && warriorStance(ctx) === "defensive"));
  // Mana per second from blocks while something hits you (Paladin's Shield Specialization: "your blocks a 100% chance
  // to restore 4% of your maximum Mana. May only occur once every 3 sec"): blocks come at the enemy's swings
  // (MOB_SWING) times your block chance, and after each one the talent waits out its few seconds
  function blockMana(ctx, S) {
    const pct = talentNumber(ctx, "Shield Specialization", /restore (\d+)% of your maximum Mana/);
    if (!pct || !S.shield || !beingHit(ctx)) return 0;
    const chance = talentNumber(ctx, "Shield Specialization", /(\d+)% chance to restore/) / 100;
    const wait = talentNumber(ctx, "Shield Specialization", /once every (\d+) sec/);
    const blocks = chance * swingOutcomes(S).block / MOB_SWING;
    return blocks > 0 ? (S.mana * pct / 100) / (wait + 1 / blocks) : 0;
  }
  const bookDesc = (token, name) => ((((KP.spellbook || {})[token] || []).find((b) => b.name === name)) || {}).desc || "";
  // talents that "allow N% of your Mana Regeneration to continue while casting" (Reflection, Reverence, ...)
  const keepWhileCasting = (ctx) => Math.max(0, ...ctx.flat.map((t, i) => {
    const r = ctx.ranks[i];
    const m = r && /allows? (\d+)% of your Mana [Rr]egeneration to continue while casting/.exec(t.desc[r - 1] || "");
    return m ? parseFloat(m[1]) : 0;
  }));

  // Warlock Life Tap: mana per cast from its tooltip ("(424 + 100% of Spirit) Mana"), plus Improved Life Tap
  function lifeTapMana(ctx, S) {
    if (ctx.cls.token !== "WARLOCK" || !bookRank("WARLOCK", "Life Tap", ctx.level)) return 0;
    const m = /into \(?(\d+)(?: \+ (\d+)% of Spirit\))? Mana/.exec(bookDesc("WARLOCK", "Life Tap"));
    if (!m) return 0;
    // the tooltip shows the top rank: scale its base by the rank known at this level
    const book = KP.spellbook.WARLOCK.find((b) => b.name === "Life Tap");
    const known = bookRank("WARLOCK", "Life Tap", ctx.level);
    const scale = book.ranks.length > 1 ? (book.ranks.indexOf(known) + 1) / book.ranks.length : 1;
    const base = parseFloat(m[1]) * scale + (m[2] ? S.attr.spirit * parseFloat(m[2]) / 100 : 0);
    // the health it costs is the base amount; Improved Life Tap adds mana only
    return { mana: base * (1 + talentNumber(ctx, "Improved Life Tap", /by (\d+)%/) / 100), health: base };
  }

  // Damage-over-time spells worth keeping up, then the best filler you can afford over a fight: the strongest
  // spell, or a mix of a strong one and an efficient one when the strong one would run you out of mana.
  // A spell that consumes another's damage over time is tried both ways (consumeVariants), and the best plan is kept.
  function casterRotation(ctx, S, abilities, wandDps = 0) {
    let best = null;
    for (const list of consumeVariants(ctx, abilities)) {
      const r = withAfflictedBonus(ctx, S, list, wandDps);
      if (r && (!best || r.dps > best.dps + 0.01)) best = r;
    }
    return best;
  }

  // A spell that consumes another's damage over time (Conflagrate: "afflicted by your Immolate spell ... consuming your
  // Immolate effect"): left out, or used with the other recast after each one, its burn cut short at the cooldown. A
  // talent can spare it ("Conflagrate has a 100% chance not to consume Immolate"); a partial chance counts as consumed.
  const CONSUMES = /afflicted by your ([\w ]+?) spell[\s\S]*?consuming your \1 effect/;
  function consumeVariants(ctx, abilities) {
    for (const a of abilities) {
      const m = CONSUMES.exec(a.rank.desc || "");
      const target = m && abilities.find((x) => x.name === m[1]);
      if (!target || a.locked || target.locked || !a.cdMs || !(target.durMs > a.cdMs)) continue;
      const spared = new RegExp(`${a.name} has a (\\d+)% chance not to consume ${target.name}`);
      if (ctx.flat.some((t, i) => ctx.ranks[i] && +((spared.exec(t.desc[ctx.ranks[i] - 1] || "") || [])[1] || 0) >= 100)) continue;
      const everyMs = 1000 / cooldownUses(ctx, a.cdMs); // the time between two uses, on average
      const share = everyMs / target.durMs;
      const cut = { ...target, durMs: everyMs, ticks: target.ticks * share, dotExpected: target.dotExpected * share,
        expected: target.directExpected + target.dotExpected * share };
      return [abilities.filter((x) => x !== a), abilities.map((x) => (x === target ? cut : x))];
    }
    return [abilities];
  }

  // "an additional 25% damage if the target is afflicted by Immolate" (Incinerate): counted while the plan keeps that
  // spell up; when it doesn't, the plan is made again without the bonus
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

  // Spells the game allows only one of on a target ("Only one Bane per Warlock can be active on any one target"): the
  // one that does the most per second it holds the target (of what lands before a leveling mob dies) is the one used
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

  // A Warlock also tries spending some of the fight on Life Tap (one global cooldown each) and keeps the best.
  function tappedRotation(ctx, S, abilities, wandDps) {
    const tap = lifeTapMana(ctx, S);
    let best = casterRotationWith(ctx, S, abilities, 0, 0, wandDps);
    if (!best || !tap) return best;
    for (let share = 0.02; share <= 0.4; share += 0.02) {
      const r = casterRotationWith(ctx, S, abilities, share, tap.mana, wandDps);
      if (r && r.dps > best.dps + 0.01) best = { ...r, tapHealth: (share * tap.health) / 1.5 };
    }
    return best;
  }

  function casterRotationWith(ctx, S, abilities, tapShare, tapMana, wandDps = 0) {
    // Arcane Blast is cast in its windows (below), not as a filler, once compute() picks how many per window
    const stack = ctx.blastCycle != null && stackingSpell(ctx);
    const usable = oneOfAKind(ctx, abilities.filter((a) => !a.locked && !a.aoe && !a.cc && !a.heal && a.expected > 0 && a.kind === "magic" &&
      !(stack && a.name === stack.name)));
    const castTime = (a) => Math.max(1.5, (a.channelMs || a.castMs) / 1000);
    const baseMana = (rules.baseMana[ctx.cls.token] || [])[ctx.level - 1] || 0;
    // talents that make casts cheaper on average: Clearcasting procs (Arcane Concentration), Master of Elements refunds
    const clearcast = (talentNumber(ctx, "Arcane Concentration", /(\d+)% chance/) ||
      talentNumber(ctx, "Elemental Focus", /(\d+)% chance/)) / 100; // Mage / Shaman Clearcasting
    const moe = talentNumber(ctx, "Master of Elements", /refund (\d+)%/) / 100;
    const manaOf = (a) => {
      const raw = a.cost || (a.costPct ? (a.costPct * baseMana) / 100 : 0);
      const refund = (a.school & (4 | 16)) ? moe * a.critChance / 100 : 0;
      return raw * (1 - clearcast) * (1 - refund);
    };
    const fillers = usable.filter((a) => !a.cdMs && (a.directExpected > 0 || a.channeled))
      .map((a) => ({ a, dps: (a.channeled ? a.expected : a.directExpected) / castTime(a), mps: manaOf(a) / castTime(a) }))
      .sort((x, y) => y.dps - x.dps);
    if (!fillers.length) return null;
    const budget = manaBudget(ctx, S, keepWhileCasting);
    // Life Tap: tapShare of the time spent tapping, 1.5 sec each
    let mana = budget.perSec + (tapShare * tapMana) / 1.5, busy = budget.busy + tapShare, dps = 0;
    const parts = [];
    const best = fillers[0];
    // Arcane Blast's window: k Blasts first, Blast i with i - 1 stacks (its own damage: the full stacks' spell damage is
    // in its expected, stats) and costing 100% more per stack; booked before anything else
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
      mana -= mps;
      dps += d;
      parts.push({ name: `${blast.name} (${k} per ${sec} sec)`, dps: d, spell: blast.name, kind: "keep", blasts: k, mps });
    }
    const dots = usable.filter((a) => !a.channeled && a.dotExpected > 0 && a.durMs > 0 && !a.cdMs)
      .map((a) => {
        const { everyMs, landed } = dotRecast(ctx, a.durMs, a.ticks);
        const every = Math.max(everyMs / 1000, castTime(a));
        const per = a.expected - a.dotExpected * (1 - landed);
        return { a, every, dps: per / every, time: castTime(a) / every, mps: manaOf(a) / every };
      })
      .filter((d) => d.dps / d.time > best.dps) // better than casting the filler in that time
      .sort((x, y) => y.dps / y.time - x.dps / x.time);
    for (const d of dots) {
      if (busy + d.time > 0.9 || d.mps > mana) continue;
      // keep it up only if it beats spending that casting time and mana on the filler
      const without = fillerPick(fillers, best, mana, 1 - busy).d * (1 - busy);
      const withIt = d.dps + fillerPick(fillers, best, mana - d.mps, 1 - busy - d.time).d * (1 - busy - d.time);
      if (withIt <= without) continue;
      busy += d.time;
      mana -= d.mps;
      dps += d.dps;
      parts.push({ name: `${d.a.name} (kept up)`, dps: d.dps, spell: d.a.name, kind: "keep" });
    }
    // spells with a cooldown (Mind Blast, Lava Burst, Chain Lightning, Fire Blast...): on cooldown when a cast does
    // more per second of casting than the filler. Target-limited spells (Undead/Demons) are left out; "20% health or
    // less" ones count for the last 20% of the fight. One whose damage over time outlasts its cooldown (Flame Shock)
    // can instead be recast as it runs out ("kept up"): a recast before then cuts off the ticks left. Only one of the
    // two is used.
    const forced = (a) => S.tal.upkeep.includes(a.name);
    const cds = usable.filter((a) => a.cdMs > 0 && (a.directExpected > 0 || a.dotExpected > 0) && !/Undead|Demon/.test(a.rank.desc || ""))
      .flatMap((a) => {
        const execute = /20% (?:health )?or less|20% or less health|less than 20% health/i.test(a.rank.desc || "");
        // landed = the share of each cast's damage over time that counts (cut off by the next cast, or by the mob dying)
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
      // a spell a counted bonus needs (S.tal.upkeep: Shadow and Flame) is cast on cooldown, first, worth it or not
      .filter((x) => (forced(x.a) ? !x.kept : x.per / x.time > best.dps));
    // placed one at a time in an order: tried most damage per second of casting first, then most damage per mana first
    // (short on mana, the cheaper spell can do more), and the plan with more damage in all (filler and wand too) kept
    const placeCooldowns = (worth) => {
      let b = busy, m = mana, d = 0;
      const placed = [], used = new Set();
      for (const x of [...cds].sort((x, y) => forced(y.a) - forced(x.a) || worth(y) - worth(x))) {
        if (used.has(x.a) || b + x.rate * x.time > 0.95) continue;
        const f = x.mps > m ? Math.max(0, m / x.mps) : 1; // only as often as the mana allows
        if (f < 0.05) continue;
        // worth it only if it beats spending that time and mana on the filler
        const without = fillerPick(fillers, best, m, 1 - b).d * (1 - b);
        const withIt = x.per * x.rate * f + fillerPick(fillers, best, m - x.mps * f, 1 - b - x.rate * x.time * f).d * (1 - b - x.rate * x.time * f);
        if (!forced(x.a) && withIt <= without) continue;
        b += x.rate * x.time * f;
        m -= x.mps * f;
        d += x.per * x.rate * f;
        used.add(x.a);
        placed.push({ name: `${x.a.name} (${x.kept ? "kept up" : "on cooldown"}${x.execute ? ", last 20%" : ""}${f < 0.99 ? `, ${Math.round(f * 100)}%` : ""})`, dps: x.per * x.rate * f,
          spell: x.a.name, kind: x.kept ? "keep" : "cooldown", execute: x.execute });
      }
      const rest = fillerPick(fillers, best, m, 1 - b);
      return { b, m, d, placed, total: d + rest.d * (1 - b) + (rest.starved ? wandDps * (1 - b) * (1 - rest.f) : 0) };
    };
    const plan = [(x) => x.per / x.time, (x) => (x.per * x.rate) / (x.mps || 1e-9)].map(placeCooldowns)
      .reduce((p, q) => (q.total > p.total + 0.01 ? q : p));
    busy = plan.b;
    mana = plan.m;
    dps += plan.d;
    parts.push(...plan.placed);
    const free = 1 - busy;
    let note = "Keeps damage-over-time spells up, uses cooldown spells when they're worth it, and casts the best single-target spell in between";
    const pick = fillerPick(fillers, best, mana, free);
    // mana actually used per second (from the pool and regen; Life Tap's mana isn't counted as spent)
    const fillerMana = free * (pick.starved ? pick.A.mps * pick.f : pick.f * pick.A.mps + (1 - pick.f) * pick.B.mps);
    const manaSpent = Math.max(0, budget.perSec - mana + fillerMana);
    if (pick.starved) note += `; your mana only covers ${Math.round(pick.f * 100)}% of the casting time, so the spell with the most damage per mana wins`;
    const fd = pick.d * free;
    dps += fd;
    // out of mana: the time you can't afford to cast goes to the wand (Mage, Priest, Warlock), which costs nothing
    const idle = pick.starved ? free * (1 - pick.f) : 0;
    if (wandDps && idle > 0.01) {
      parts.push({ name: `Wand (${Math.round(idle * 100)}% of the time, out of mana)`, dps: wandDps * idle, kind: "wand", share: idle });
      dps += wandDps * idle;
    }
    // spell and kind say what each part is for the Priority tab (keep, cooldown, filler, cheap = the cheaper filler);
    // instead = the filler that would hit harder if the mana lasted
    const instead = pick.A !== best ? best.a.name : undefined;
    if (pick.f >= 0.999 || pick.A === pick.B) {
      parts.push({ name: `${pick.A.a.name} (filler)`, dps: fd, spell: pick.A.a.name, kind: "filler", instead });
      if (instead) note += `; ${best.a.name} would hit harder but runs you out of mana over a fight`;
    } else {
      parts.push({ name: `${pick.A.a.name} (${Math.round(pick.f * 100)}% of fillers)`, dps: pick.f * pick.A.dps * free, spell: pick.A.a.name, kind: "filler", instead },
        { name: `${pick.B.a.name} (the rest, cheaper)`, dps: (1 - pick.f) * pick.B.dps * free, spell: pick.B.a.name, kind: "cheap" });
      note += `; mixes ${pick.A.a.name} with the cheaper ${pick.B.a.name} so the mana lasts`;
    }
    if (tapShare) note += `; Life Tap ${Math.round(tapShare * 100)}% of the time (${Math.round(tapMana)} mana each, health assumed healed back)`;
    else if (tapMana) note += "; Life Tap isn't needed: the mana lasts";
    note += `. Mana over a ${FIGHT_SEC / 60}-minute fight (${REGEN_RULE}` + (budget.keep ? `, ${budget.keep}% kept while casting` : "") +
      (budget.extras.length ? `, plus ${budget.extras.join(" and ")}` : "") + "; no potions). " +
      [ctx.flat.some((t, i) => t.name === "Ignite" && ctx.ranks[i]) && "Ignite counted", clearcast && "Clearcasting averaged in",
        moe && "Master of Elements refunds averaged in"].filter(Boolean).map((x) => x + ". ").join("") +
      "Spells with a cooldown are cast when they beat the filler; damage cooldowns (Arcane Power, Death Wish...) are averaged over their cooldown, procs aren't counted." + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, manaSpent };
  }

  // The filler for the casting time and mana that are left: the strongest spell, a strong/cheap mix that just fits
  // the mana, or (short on mana) one spell cast as often as the mana allows. d = damage per second of filler time.
  function fillerPick(fillers, best, mana, free) {
    const perFillerSec = mana / Math.max(free, 0.01); // mana you can spend per second of filler casting
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

  // ------------------------------------------------------------ healing

  // Single-target healing you can keep up over a fight: heals over time kept up, cooldown heals (Riptide, Swiftmend,
  // Power Word: Shield once per Weakened Soul) when they're worth it, then the best heal you can afford in between.
  // Crits heal 150%; every point of healing counts (no overhealing).
  const WEAKENED_SOUL_MS = 15000; // Power Word: Shield again on the same target (Classic; the debuff isn't in our data)
  function healRotation(ctx, S, abilities) {
    // one target only: no group or bouncing heals, no heals that only work on yourself, nothing we can't put a number
    // on (Swiftmend uses up a heal over time)
    const GROUP_HEALS = ["Holy Nova", "Prayer of Healing", "Chain Heal", "Wild Growth", "Tranquility", "Prayer of Mending"];
    // long-cooldown emergency heals (Desperate Prayer...) don't shape a fight's healing
    const heals = abilities.filter((a) => !a.locked && a.heal > 10 && !a.aoe && !GROUP_HEALS.includes(a.name) && !(a.cdMs >= 60000) &&
      !(a.rank.effects || []).some((e) => e.chain > 1) &&
      !(a.rank.effects || []).filter((e) => e.effect === 10 || e.aura === 8 || e.aura === 69).every((e) => e.target === 1));
    if (!heals.length) return null;
    const castTime = (a) => Math.max(1.5, (a.channelMs || a.castMs) / 1000);
    const baseMana = (rules.baseMana[ctx.cls.token] || [])[ctx.level - 1] || 0;
    const crit = Math.min(100, S.spellCrit) / 100;
    // Illumination-style talents: a heal crit gives back part of its base cost
    const back = (talentNumber(ctx, "Illumination", /Mana equal to (\d+)% of the base cost/) / 100) * crit;
    const manaOf = (a) => (a.cost || (a.costPct ? (a.costPct * baseMana) / 100 : 0)) * (1 - back);
    // Paladin: Oath of Light on the target adds healing to Holy Light, Flash of Light and Holy Shock (its tooltip
    // gives the level 60 numbers; they grow with level from 0). Boundless Light's extra Holy Shock crit is only for
    // allies without the Oath, so with Oath of Light learned the target is the Oath's and Boundless Light doesn't count.
    const oathText = learnedTalent(ctx, "Oath of Light") &&
      /Holy Light on them by up to (\d+), your Flash of Light by up to (\d+), and your Holy Shock by up to (\d+)/
        .exec((ctx.flat.find((t) => t.name === "Oath of Light") || { desc: [""] }).desc[0]);
    const oath = oathText ? { "Holy Light": +oathText[1], "Flash of Light": +oathText[2], "Holy Shock": +oathText[3] } : {};
    const boundless = oathText ? 0 : talentNumber(ctx, "Boundless Light", /Holy Shock spell by (\d+)%/);
    // each heal's own crit chance (talents that raise one spell's crit) and crit size (Holy Power)
    const critOf = (a) => Math.min(100, (a.critChance != null ? a.critChance : S.spellCrit) + (a.name === "Holy Shock" ? boundless : 0)) / 100;
    // Binding Heal heals you and the target for the same amount: only the target's half counts here
    const per = (a) => (a.heal * (a.name === "Binding Heal" ? 0.5 : 1) + (oath[a.name] || 0) * ctx.level / 60) *
      (1 + critOf(a) * ((a.healCritMult || 1.5) - 1));
    const isHot = (a) => (a.rank.effects || []).some((e) => e.effect === 6 && e.aura === 8) && !(a.rank.effects || []).some((e) => e.effect === 10);
    const isShield = (a) => (a.rank.effects || []).some((e) => e.aura === 69);
    const fillers = heals.filter((a) => !a.cdMs && !isHot(a) && !isShield(a))
      .map((a) => ({ a, dps: per(a) / castTime(a), mps: manaOf(a) / castTime(a) })).sort((x, y) => y.dps - x.dps);
    const budget = manaBudget(ctx, S, keepWhileCasting);
    let mana = budget.perSec, busy = budget.busy, hps = 0;
    const parts = [];
    const best = fillers[0] || { dps: 0, mps: 0 };
    // heals over time and cooldown heals: worth it when they beat the filler for the time and mana
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
      `Mana over a ${FIGHT_SEC / 60}-minute fight (${REGEN_RULE}${budget.keep ? `, ${budget.keep}% kept while casting` : ""}; no potions). ` +
      "Group heals (Chain Heal, Prayer of Healing, Wild Growth...) aren't counted.";
    return { hps, parts: parts.filter((p) => p.dps > 0.05), note };
  }

  // ------------------------------------------------------------ Rogue

  // a number in a learned talent's tooltip, found by a pattern (the tooltip uses the game's rank values)
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

  // Steady state: keep Slice and Dice up (refreshed at 5 points), spend the rest of the energy on the best
  // builder to 5 points and Eviscerate.
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
    // energy: 10 per second, Adrenaline Rush doubles it for 15 sec every 5 min
    const ar = learnedTalent(ctx, "Adrenaline Rush") && bookRank("ROGUE", "Adrenaline Rush", level);
    const regen = 10 * (1 + (ar ? cooldownShare(ctx, ar.durMs || 15000, ar.cdMs) : 0));
    const sealFate = talentNumber(ctx, "Seal Fate", /(\d+)% chance/) / 100;
    const ruthless = talentNumber(ctx, "Ruthlessness", /(\d+)% chance/) / 100;          // free point after a finisher
    const rsChance = Math.min(1, talentNumber(ctx, "Relentless Strikes", /(\d+)% chance per Combo Point/) * COMBO_POINTS / 100);
    const refund = rsChance * (talentNumber(ctx, "Relentless Strikes", /restore (\d+) Energy/) || 0);
    const pick = builders.map((b) => {
      const cp = (b.name === "Mutilate" ? 2 : 1) + (b.critChance / 100) * sealFate;
      const n = Math.max(0, (COMBO_POINTS - ruthless) / cp); // builders per 5-point finisher
      return { b, cp, n, energy: n * b.cost + evis.cost - refund, dmg: n * b.expected + evis.expected };
    }).sort((x, y) => y.dmg / y.energy - x.dmg / x.energy)[0];
    // Shank (Forever, level 24) on cooldown: off-hand damage that gives back more energy than it costs, plus combo
    // points with Boot Knife (Shank's own tooltip names points only with it; since the Nov 6 hotfix it says 2, like
    // Boot Knife). Each point replaces part of a builder: that builder's energy is saved (counted as extra energy for
    // the cycle below) and its damage isn't done (replaced = builders per second Shank stands in for). Flash of
    // Steel's shorter cooldown is in the game data; its extra energy, Boot Knife and Venom are server rules read from
    // their tooltips.
    const shank = byName["Shank"];
    const shankEvery = shank && !shank.locked && shank.expected ? 1 / cooldownUses(ctx, shank.cdMs) : 0; // sec between Shanks
    let shankEnergy = 0, replaced = 0;
    if (shankEvery) {
      const gain = shank.rank.effects.find((e) => e.effect === 30 && e.misc === 3).base +
        talentNumber(ctx, "Flash of Steel", /generated by your Shank ability by (\d+)/);
      const points = (talentNumber(ctx, "Boot Knife", /(\d+)% chance to add \d+ Combo Points/) / 100) *
        talentNumber(ctx, "Boot Knife", /chance to add (\d+) Combo Points/);
      replaced = points / shankEvery / pick.cp;
      shankEnergy = (gain - shank.cost) / shankEvery + replaced * pick.b.cost;
    }
    const energy = regen + shankEnergy; // energy per second for builders and finishers
    const bfRank = learnedTalent(ctx, "Blade Flurry") && bookRank("ROGUE", "Blade Flurry", level);
    const bf = bfRank ? 20 * cooldownShare(ctx, bfRank.durMs || 15000, bfRank.cdMs) : 0; // +20% attack speed, averaged
    const parts = [{ name: "White hits", dps: whiteDps * (1 + bf / 100) }];
    const notes = [];
    let dps;
    const snd = bookRank("ROGUE", "Slice and Dice", level);
    const haste = rankValue("Slice and Dice", level);
    const shankDps = shankEvery ? shank.expected / shankEvery : 0;
    // Instant Poison on both weapons: a chance per hit of Nature damage (spell hit table; poisons don't crit). Venom:
    // each Shank raises poison damage and chance for a few seconds (its tooltip's numbers), counted for its uptime.
    // Worked out per hit first, since Slice and Dice's faster swings apply it more often.
    const poison = procRank("Instant Poison", level);
    const venomUp = shankEvery ? Math.min(1, talentNumber(ctx, "Venom", /for (\d+) sec/) / shankEvery) : 0;
    const chance = (POISON_CHANCE + talentNumber(ctx, "Improved Poisons", /apply Poisons to your target by (\d+)%/) +
      venomUp * talentNumber(ctx, "Venom", /chance to apply Poisons by (\d+)%/)) / 100;
    const vile = (1 + talentNumber(ctx, "Vile Poisons", /dealt by your poisons by (\d+)%/) / 100) *
      (1 + venomUp * talentNumber(ctx, "Venom", /Poison damage by (\d+)%/) / 100);
    const perHit = poison ? chance * procAt(poison, level) * vile * ((100 - table(ctx, S, "magic").miss) / 100) * (1 + damagePct(S, 8) / 100) : 0;
    const swings = sum(melee.map((w) => (Math.max(0, 100 - w.miss - w.dodge) / 100) / w.effSpeed)) * (1 + bf / 100);
    // poison damage per second with this many ability casts per second and this much extra attack speed (Shank can't miss)
    const poisonDps = (casts, haste) => perHit * (swings * (1 + haste / 100) + Math.max(0, casts) * 0.9 + (shankEvery ? 1 / shankEvery : 0));
    const noSndCasts = (energy / pick.energy) * (pick.n + 1) - replaced;
    const noSnd = whiteDps * (1 + bf / 100) + (energy / pick.energy) * pick.dmg - replaced * pick.b.expected + shankDps + poisonDps(noSndCasts, 0);
    let poisonPart = poisonDps(noSndCasts, 0);
    let sndPoints = null; // combo points to refresh Slice and Dice at (0 = not worth it), for the Priority tab
    if (snd && haste) {
      // try Slice and Dice at 1-5 combo points: short and cheap, or long and expensive
      const longer = talentNumber(ctx, "Improved Slice and Dice", /by (\d+)%/);
      const cp = pick.n ? (COMBO_POINTS - ruthless) / pick.n : 1; // combo points per builder
      let best = null;
      for (let points = 1; points <= COMBO_POINTS; points++) {
        const D = ((snd.durMs + (snd.durPerPoint || 0) * points) / 1000) * (1 + longer / 100);
        const nSnd = Math.max(0, (points - ruthless) / cp);
        const sndEnergy = nSnd * pick.b.cost + snd.cost - Math.min(1, rsChance * points / COMBO_POINTS) * (refund / (rsChance || 1));
        const k = Math.max(0, (energy * D - sndEnergy) / pick.energy); // Eviscerates per Slice and Dice
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

  // ------------------------------------------------------------ Retribution Paladin and Enhancement Shaman

  const procRank = (name, level) => {
    let r = null;
    for (const x of (KP.abilities.PROCS || {})[name] || []) if (x.level <= level) r = x;
    return r;
  };
  // a proc rank's number at a level: it grows from the rank's SpellLevel up to its MaxLevel
  const procAt = (p, level, key = "value", per = "perLevel") =>
    p[key] + (p[per] || 0) * Math.max(0, Math.min(level, p.maxLevel || level) - (p.spellLevel || p.level));
  // a white swing's raw average (weapon + attack power), before armor: for Holy damage based on the weapon
  const rawSwing = (S, w, extraAp = 0) => (w.weapon.min + w.weapon.max) / 2 + ((S.ap + extraAp) / 14) * w.weapon.speed;
  // a melee swing's expected damage with more attack power, scaled from the white-hit numbers
  const swingWithAp = (S, mh, extraAp) => mh.perSwing * rawSwing(S, S.mh, extraAp) / rawSwing(S, S.mh);

  // Seal of Command procs (Holy damage, not reduced by armor) or Seal of Righteousness, Judgement every cooldown
  // (in Forever it doesn't use up the Seal), Holy Strike, Hammer of the Righteous with a one-hander, Hammer of
  // Wrath in the last 20% of the fight, all within the mana you have.
  const SOC_PPM = 7; // Seal of Command procs per minute: Classic's rate; the game files don't hold it
  const SOR_SPEEDS = [1.5, 3.8]; // weapon speeds taken as the ends of Seal of Righteousness's tooltip range (estimate)
  function retRotation(ctx, S, white, byName) {
    const mh = white.find((w) => w.label === "Main hand");
    if (!mh || !S.mh) return null;
    const level = ctx.level;
    const sealsPct = talentNumber(ctx, "Improved Seals", /by (\d+)%/) / 100;
    const holyPct = 1 + damagePct(S, 2) / 100;
    const vengeance = talentNumber(ctx, "Vengeance", /by (\d+)% for/) * 3; // assumed at full stacks while you crit
    const vMult = 1 + vengeance / 100;
    const land = Math.max(0, 100 - mh.miss - mh.dodge) / 100;
    const crit = Math.min(100, S.crit - critSuppression(ctx)) / 100;
    const socRank = learnedTalent(ctx, "Seal of Command") && bookRank("PALADIN", "Seal of Command", level);
    const sorRank = bookRank("PALADIN", "Seal of Righteousness", level);
    // with Seal of Command learned, both Seals are worked out and the better one kept
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
        // Seal of Righteousness on every landed swing. The tooltip's range runs from a fast one-hander (value/87 +
        // 7.65% Holy spell power) to a slow two-hander (value/25 + 12%); where a weapon falls in it is placed by its
        // speed between SOR_SPEEDS (an estimate: the exact rule isn't in the files)
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
        // Judgement of Command: half damage unless the target is stunned (tooltip); one Judgement per Hammer of
        // Justice cooldown is counted on a stunned target
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
          // Sanctified Judgement gives back part of the judged Seal's cost
          mana: Math.max(0, (jRank.costPct || 6) * baseMana / 100 * (1 - talentNumber(ctx, "Benediction", /by (\d+)%/) / 100) - refund * sealCost),
          busy: 1.5, cast: 0, spell: "Judgement" });
        // Swift Judgement (Protection talent): another Judgement on its own cooldown, free (game data)
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
      // Holy Shield while tanking: kept up (your stats count its block chance all fight), so like the Seal its mana and
      // global cooldowns come first. Its damage lands on each block until the charges run out (damage per block: game
      // data; block chance: your stats; the enemy's swings: MOB_SWING); spell power and crits on it aren't counted.
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
      // mana: the pool and regen over the fight, minus keeping the Seal up (recast every 30 sec) and Holy Shield
      const budget = manaBudget(ctx, S, keepWhileCasting);
      const fitted = fitShots(shots, Math.max(0, budget.perSec - sealCost / 30 - shieldMana), shieldBusy);
      for (const s of fitted) { // every one of these is Holy damage (game data)
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

  // Windfury Weapon's extra attacks on white hits, Stormstrike, the best shock (Stormstrike makes the next one
  // hit harder), Rage of the Farseer's attack speed averaged in, all within your mana.
  function enhRotation(ctx, S, white, byName) {
    const mh = white.find((w) => w.label === "Main hand");
    if (!mh) return null;
    const level = ctx.level;
    const parts = [], notes = [];
    // Rage of the Farseer: +30% attack speed for 25 sec, every 3 min
    const rof = learnedTalent(ctx, "Rage of the Farseer") && bookRank("SHAMAN", "Rage of the Farseer", level);
    const rofDesc = ((((KP.spellbook || {}).SHAMAN || []).find((b) => b.name === "Rage of the Farseer")) || {}).desc || "";
    const haste = rof ? parseFloat((/speed by (\d+)%/.exec(rofDesc) || [])[1] || 0) * cooldownShare(ctx, rof.durMs || 25000, rof.cdMs) : 0;
    const swingsPerSec = (1 + haste / 100) / mh.effSpeed;
    let dps = mh.perSwing * swingsPerSec;
    parts.push({ name: "White hits", dps });
    // Windfury Weapon: a chance per main-hand hit of extra attacks with bonus attack power
    const wf = bookRank("SHAMAN", "Windfury Weapon", level);
    if (wf) {
      const wfDesc = ((((KP.spellbook || {}).SHAMAN || []).find((b) => b.name === "Windfury Weapon")) || {}).desc || "";
      const m = /(\d+)% chance of granting you (\d+) extra attacks? with (\d+) extra melee attack power/.exec(wfDesc);
      if (m) {
        const boost = 1 + talentNumber(ctx, "Elemental Weapons", /Windfury Weapon effect by (\d+)%/) / 100;
        const land = Math.max(0, 100 - mh.miss - mh.dodge) / 100;
        const extra = parseFloat(m[1]) / 100 * parseFloat(m[2]) * land; // extra attacks per swing
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
    // Shocks share one cooldown. Flame Shock's burn outlasts it (21 sec in Forever) and a new Flame Shock replaces the
    // burn still running (Classic's rule), so it's cast once per burn; the other shock cooldowns go to the best direct
    // shock (Earth Shock, which Stormstrike's +20% lands on). The mana then goes where it does the most per point.
    const usableShock = (n) => byName[n] && !byName[n].locked && byName[n].expected ? byName[n] : null;
    const fs = usableShock("Flame Shock");
    const direct = ["Earth Shock", "Frost Shock"].map(usableShock).filter(Boolean).sort((a, b) => b.expected - a.expected)[0];
    const shockCd = Math.max(1.5, (((direct || fs) || {}).cdMs || 6000) / 1000);
    const shocks = cooldownUses(ctx, shockCd * 1000); // shocks per second
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
    notes.push("Lightning Bolts with Maelstrom Weapon, Flametongue/Rockbiter and Windfury Totem aren't counted yet");
    const note = notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") + "." + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note, manaSpent };
  }

  // ------------------------------------------------------------ Druid forms

  // Cat: keep Rake and Rip up when they're worth it, the rest of the energy on the best builder to 5 points and
  // Ferocious Bite. Rend and Tear: abilities hit harder while a bleed is up.
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
    // each bleed renewed as it runs out (once a fight when the mob dies sooner): its damage per use that lands
    const rakeCast = rake && dotRecast(ctx, rake.durMs || 9000, rake.ticks), ripCast = rip && dotRecast(ctx, rip.durMs || 12000, rip.ticks);
    const landedOf = (a, cast) => a.expected - a.dotExpected * (1 - cast.landed);
    let best = null;
    for (const useRake of rake ? [false, true] : [false]) {
      for (const useRip of rip ? [false, true] : [false]) {
        let rakeRate = useRake ? 1 / Math.max(1, rakeCast.everyMs / 1000) : 0;
        let ripRate = useRip ? 1 / Math.max(1, ripCast.everyMs / 1000) : 0;
        // energy for the bleeds and the builders that pay for Rip's 5 points (Rake gives a point too);
        // if that's more than you regenerate, they can't be kept up all the time
        const need = rakeRate * (useRake ? rake.cost : 0) + Math.max(0, COMBO_POINTS * ripRate - rakeRate) * builder.cost +
          ripRate * (useRip ? rip.cost : 0);
        if (need > regen) { rakeRate *= regen / need; ripRate *= regen / need; }
        const cpForRip = Math.max(0, COMBO_POINTS * ripRate - rakeRate);
        const fixed = rakeRate * (useRake ? rake.cost : 0) + cpForRip * builder.cost + ripRate * (useRip ? rip.cost : 0);
        const left = Math.max(0, regen - fixed);
        const biteRate = bite ? left / (COMBO_POINTS * builder.cost + bite.cost) : 0;
        const builderRate = cpForRip + biteRate * COMBO_POINTS + (bite ? 0 : left / builder.cost);
        // Rend and Tear counts only while a bleed is actually up
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
    notes.push("Cat Form's base attack follows Classic's rule (the game files don't hold it)");
    return { dps: best.dps, parts: best.parts.filter((p) => p.dps > 0.05),
      note: notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ") + "." + buffNote(ctx) };
  }

  // Bear: rage from your own hits (being hit gives a tank much more, not counted), spent on Primal Bite on cooldown,
  // Lacerate kept at 5 stacks, then Maul with what's left. Damage here is also your threat from damage.
  function bearRotation(ctx, S, white, byName) {
    const mh = white.find((w) => w.label === "Main hand");
    if (!mh) return null;
    let rage = rageFromDamage(mh.perSwing, ctx.level) / mh.effSpeed;
    const frenzy = talentNumber(ctx, "Blood Frenzy", /gain an additional (\d+) Rage/);
    if (frenzy) rage += (mh.crit / 100) / mh.effSpeed * frenzy; // extra rage on crits
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
    if (lac && rage > 0) { // 5 stacks refreshed once per duration: roughly 5 times one application's bleed
      const perSec = 1 / Math.max(1, (lac.durMs || 15000) / 1000), f = Math.min(1, rage / (lac.cost * perSec || 1));
      rage -= lac.cost * perSec * f;
      parts.push({ name: "Lacerate (5 stacks kept up)", dps: lac.expected * 5 * perSec * f, spell: "Lacerate" });
      dps += lac.expected * 5 * perSec * f;
    }
    const maul = ok("Maul") ? byName["Maul"] : null;
    if (maul && rage > 0) { // Maul replaces a swing: it adds its damage over that swing
      const swingRage = rageFromDamage(mh.perSwing, ctx.level);
      const perSec = Math.min(rage / (maul.cost + swingRage), 1 / mh.effSpeed);
      const d = perSec * Math.max(0, maul.expected - mh.perSwing);
      parts.push({ name: `Maul (${Math.round(perSec * mh.effSpeed * 100)}% of swings)`, dps: d, spell: "Maul" });
      dps += d;
    }
    const note = "Rage from your own hits (Classic formula)" + (frenzy ? ", Blood Frenzy counted" : "") +
      "; being hit gives a tank much more, not counted. Primal Bite on cooldown, Lacerate at 5 stacks, Maul with the rest. " +
      "Bear Form's base attack follows Classic's rule (the game files don't hold it)." + buffNote(ctx);
    return { dps, parts: parts.filter((p) => p.dps > 0.05), note };
  }

  // ------------------------------------------------------------ Hunter

  const FIGHT_SEC = 180; // the fight length the mana budget assumes

  // Fit attacks into the global cooldown / cast time, then into the mana you have over the fight.
  // shots: { name, perUse, rate (uses per sec if always pressed), mana, busy (sec of button time per use) };
  // taken: the share of each second already spent on something kept up (Holy Shield)
  const manaUsed = (fitted) => sum(fitted.map((s) => s.rate * s.f * (s.mana || 0))); // mana per second the fitted shots use
  function fitShots(shots, manaPerSec, taken = 0) {
    let time = 0.95 - taken; // leave a little room for moving and reacting
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

  // A Hunter's pet: its melee isn't in the game files, so it's measured. Its own damage per second before armor (a
  // family with no damage bonus) is what the guild's Hunters' pets do (site/data/measured.js, from tools/snapshots.py) and,
  // around those levels, a rise of 0.82 a level (10 pets at levels 5-29 in the first combat log, 2026-11-08; the Spider's own 30 to
  // 31 rises 0.79). Nothing above its last reading has been seen yet. A well-fed pet: the same Spider also read about 20% less, as
  // a content pet deals less than a happy one. Your share: 10%, rounded down, in all three readings (25 of 258, 26 of 262, 27 of 278).
  const PET_DPS_PER_LEVEL = 0.82;
  const PET_RAP_SHARE = 0.1;
  const PET_SPEED = 2; // the Spider's and most pets' in that log; only Frenzy's count of swings uses it
  function petRawDps(level, rap) {
    const m = KP.measured.petDps, last = Math.max(...Object.keys(m).map(Number));
    const own = byLevel(m, level, m[last] + PET_DPS_PER_LEVEL * (60 - last),
      (first) => m[first] - PET_DPS_PER_LEVEL * (first - level));
    return own + (PET_RAP_SHARE * rap) / 14;
  }
  // The families at either end of the damage bonus, from the game files: "Cat and Raptor +10%, Boar and Turtle -10%"
  function petFamilyText() {
    const all = Object.entries(rules.petFamilies), bonuses = all.map(([, f]) => f.damage);
    const at = (v) => `${all.filter(([, f]) => f.damage === v).map(([name]) => name).join(" and ")} ${v > 0 ? "+" : ""}${v}%`;
    return `${at(Math.max(...bonuses))}, ${at(Math.min(...bonuses))}`;
  }
  // A pet's Bite on autocast before armor: the game files' best rank for its level, whenever its cooldown is ready, 25% more for a
  // well-fed pet like its melee. The second combat log (2026-11-08): rank 1, 8 in the files, hit for 10; a pet with Bite alone used
  // it every 10.5 sec. Bite needs 3.5 focus a second, and the first log's Wolf got 60 focus back in about 8 sec. A pet with Claw on
  // autocast too bites less often, as Claw takes the focus (not counted). A pet keeps the rank it was taught: one in that log had rank 1.
  const PET_HAPPY = 1.25;
  function petBiteDps(ctx) {
    const rank = rules.petBite.ranks.findLast((r) => r.level <= ctx.level);
    return rank.damage * PET_HAPPY * cooldownUses(ctx, rules.petBite.cdMs);
  }
  // What the pet adds to your damage per second (null with Lone Wolf, or before a Hunter has one: level 10, with Revive Pet).
  // Its attacks follow your attack table with none of your hit or crit: 0 crits in 217 swings in that log, so its only crit
  // is Ferocity's, which Frenzy needs too. Claw isn't counted, nor are the families' own abilities.
  function petDamage(ctx, S) {
    if (learnedTalent(ctx, "Lone Wolf") || !bookRank("HUNTER", "Revive Pet", ctx.level)) return null;
    const d = Math.max(0, Math.min(3, ctx.target.diff));
    const t = table(ctx, { hit: 0 }, "melee");
    const glance = GLANCE_CHANCE[d];
    const crit = Math.max(0, talentNumber(ctx, "Ferocity", /by (\d+)%/) - critSuppression(ctx));
    const hit = 100 - t.miss - t.dodge - glance - crit;
    const perSwing = (hit + crit * 2 + glance * GLANCE_DAMAGE[d]) / 100;
    const perBite = (100 - t.miss - t.dodge + crit) / 100; // a special attack: no glancing blows
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
    // Rapid Fire: attack speed for 15 sec every few minutes (Rapid Killing shortens the cooldown)
    const rf = ((KP.spellbook || {}).HUNTER || []).find((b) => b.name === "Rapid Fire");
    const rfRank = rf && [...rf.ranks].reverse().find((r) => (r.level || 1) <= level);
    let haste = 0;
    if (rfRank) {
      const pct = parseFloat((/speed by (\d+)/.exec(rf.desc) || [])[1] || 0);
      const cut = talentEffect("Rapid Killing", (e) => e.aura === 107 && e.misc === 11);
      const cd = Math.max(1, rfRank.cdMs + (cut ? cut.value : 0));
      haste = pct * cooldownShare(ctx, rfRank.durMs || 15000, cd);
    }
    // mana: Spirit regen (spiritRegenOf) only partly continues while you keep shooting;
    // talents that "allow N% of your Mana Regeneration to continue while casting" (Rapid Recuperation needs Serpent Sting)
    const keepPct = (withSting) => Math.max(0, ...ctx.flat.map((t, i) => {
      const r = ctx.ranks[i];
      if (!r || (t.name === "Rapid Recuperation" && !withSting)) return 0;
      const m = /allows? (\d+)% of your Mana Regeneration to continue while casting/i.exec(t.desc[r - 1] || "");
      return m ? parseFloat(m[1]) : 0;
    }));
    const spiritRegen = spiritRegenOf(S.attr.spirit);
    const manaPerSec = (withSting) => ctx.manaPerSec != null ? ctx.manaPerSec
      : (S.mana + (S.mp5 / 5 + spiritRegen * keepPct(withSting) / 100) * FIGHT_SEC) / FIGHT_SEC;
    // a shot as often as opts.rate or opts.every (ms) say, else whenever its cooldown is ready (cooldownCasts)
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
    // Summon Hawk shares Arcane Shot's cooldown: the bigger hit is used. Only the hawk's dive is in the game files
    // (its tooltip: base + 5% of ranged attack power); its 18 sec of attacks after that aren't counted.
    const arcane = byName["Arcane Shot"], hawk = byName["Summon Hawk"];
    const hawkUp = hawk && !hawk.locked && hawk.expected > 0 && (!arcane || hawk.expected > arcane.expected);
    if (hawk && !hawk.locked) notes.push(`Summon Hawk's dive ${hawkUp ? "beats" : "is smaller than"} Arcane Shot (shared cooldown); the hawk's attacks after the dive aren't counted`);

    if (style === "ranged") {
      const auto = white.find((w) => w.label === "Ranged");
      if (!auto) return null;
      const aimed = byName["Aimed Shot"], multi = byName["Multi-Shot"];
      const big = aimed && (!multi || aimed.expected >= multi.expected) ? aimed : multi; // they share a cooldown
      const sting = byName["Serpent Sting"];
      const stingCast = sting && sting.durMs ? dotRecast(ctx, sting.durMs, sting.ticks) : null;
      const shots = [shot(big), shot(hawkUp ? hawk : arcane), shot(byName["Sniper Shot"]),
        shot(sting, stingCast ? { every: stingCast.everyMs, perUse: sting.expected - sting.dotExpected * (1 - stingCast.landed) } : {})].filter(Boolean);
      const fitted = fitShots(shots, manaPerSec(shots.some((s) => s.name === "Serpent Sting")));
      manaSpent = manaUsed(fitted);
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
        rate: cooldownUses(ctx, Math.max(raptor.cdMs, mh.effSpeed * 1000)), busy: 0 }));
      shots.push(shot(byName["Strider Kick"]));
      if (hawk && !hawk.locked) shots.push(shot(hawk)); // a summon: usable from melee too
      const mb = byName["Mongoose Bite"];
      const expose = talentEffect("Expose Prey", (e) => e.aura === 42);
      if (mb && expose) { // with Hunter's Mark up, every melee hit can allow Mongoose Bite
        const swingsPerSec = sum(white.filter((x) => x.label !== "Ranged" && x.label !== "Wand").map((w) => 1 / w.effSpeed));
        const bleed = learned("Lacerating Strikes") ? 1.4 : 1; // Lacerating Strikes: +40% as a bleed
        shots.push(shot(mb, { perUse: mb.expected * bleed, rate: Math.min(1 / (mb.cdMs / 1000), swingsPerSec * expose.value / 100) }));
      }
      const lac = byName["Lacerate"];
      const lacCast = lac && lac.durMs ? dotRecast(ctx, lac.durMs, lac.ticks) : null;
      shots.push(shot(lac, lacCast ? { every: lacCast.everyMs, perUse: lac.expected - lac.dotExpected * (1 - lacCast.landed) } : {}));
      const trap = byName["Immolation Trap"];
      shots.push(shot(trap)); // Forever lets you lay traps in combat; in melee the boss stands on it
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
      const t = isWand ? table(ctx, S, "magic") : table(ctx, S, ranged ? "ranged" : "melee");
      let miss = Math.max(0, t.miss + (dual && !ranged ? 19 : 0) - (label === "Off hand" ? S.tal.offhandHit : 0));
      const glance = !ranged ? GLANCE_CHANCE[d] : 0;
      const critBase = isWand ? S.spellCrit : S.crit - critSuppression(ctx);
      const crit = Math.max(0, Math.min(critBase, 100 - miss - t.dodge - glance));
      const hit = Math.max(0, 100 - miss - t.dodge - glance - crit);
      const critMult = isWand ? 1.5 : 2;
      const perSwing = avg * (hit + crit * critMult + glance * GLANCE_DAMAGE[d]) / 100;
      // melee procs: Flurry's attack speed, extra swings; Deep Wounds bleeds on crits (ignores armor)
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

  // How many of n targets one effect hits (the Abilities tab's target count; everything else uses 1), from the game
  // data: an area hits all of them up to the spell's limit (Whirlwind 4); a chain jumps to `chain` targets, each jump
  // doing chainAmp of the last (Chain Lightning 70%, Chain Heal 50%). An area heal is capped at a party (5).
  // Returns the targets hit and the damage multiplier (targets x falloff).
  const ONE_TARGET = [5, 6, 21, 25, 45, 57, 77]; // pet, enemy, ally, any, chain-heal ally, party member, channel target
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
    // e.maxTargets: one part's own limit (Consecration's extra damage: "the first 4 enemies", from its tooltip)
    const hits = Math.min(n, e.maxTargets || src.maxTargets || (heal ? 5 : n));
    return { hits, mult: hits };
  }

  // Damage of one set of effects (an ability rank or a spell it triggers). Returns min/max of the direct part,
  // the total of any damage over time, healing, and what it needed.
  // Shares of attack power that neither the game's files nor its tooltips show, from two combat logs (2026-11-08):
  // Thunder Clap rank 3 hit for 51, 53 and 56 in Defensive Stance at about 293, 328 and 363 attack power, and 57 and 59 in Battle,
  // its tooltip saying 33; Rend ticked for 13 and 14 at rank 3 and 15 and 16 at rank 4 in Defensive. The game rounds down.
  const UNSHOWN_AP = { "Thunder Clap": 0.07 };
  const UNSHOWN_AP_PER_TICK = { Rend: 0.02 };

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
    // targets (ctx.targets, default 1): each effect's damage x the targets it hits; weapon effects share one count
    let hits = 1, wMult = 1;
    // a share of attack power only the tooltip formula holds (Revenge 22.5%, Summon Hawk's dive 5% of ranged AP);
    // added once, to the first damage effect, when the effect itself has none
    let textBonus = src.textShares && !AP_DUMMY[src.familyName]
      ? (src.textShares.AP || 0) * S.ap + (src.textShares.RAP || 0) * S.rap : 0;
    for (const e of effects) {
      const hitsTarget = e.target !== 1;
      const isDamage = [2, 17, 31, 58, 121].includes(e.effect) || (e.effect === 6 && (e.aura === 3 || e.aura === 53));
      if (isDamage && !hitsTarget) continue; // damage to yourself
      if (isDamage) { if (SINGLE_TARGET.includes(e.target)) single = true; else area = true; }
      const v = value(e, src, ctx.level);
      const spread = (e.variance || 0) / 2;
      const perCombo = (e.perResource || 0) * COMBO_POINTS; // spread applies to the base part only
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
            (src.familyName === "Eviscerate" ? ap * EVISCERATE_AP_PER_POINT * COMBO_POINTS : 0) + (e.apCoef ? 0 : textBonus);
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
          if (e.aura === 3 || e.aura === 53) { // damage over time
            const dur = (src.durMs || 0) + (perCombo ? (LONGER_PER_POINT[src.familyName] || 0) * COMBO_POINTS : 0);
            const n = e.period ? Math.floor(dur / e.period) : 0;
            ticks = Math.max(ticks, n);
            dot += n * (v + perCombo + (physical ? 0 : e.coef * spellPower * coefMult) + (UNSHOWN_AP_PER_TICK[src.familyName] || 0) * ap) * m;
            if (hitsTarget) hits = Math.max(hits, th.hits);
          } else if (e.aura === 8) {
            const n = e.period ? Math.floor((src.durMs || 0) / e.period) : 0;
            heal += n * (v + e.coef * S.healing * coefMult) * m;
            hits = Math.max(hits, th.hits);
          } else if (e.aura === 69 && e.target !== 1) { // an absorb shield on someone else (Power Word: Shield)
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

  // Revenge's share of attack power skips Defensive Stance's penalty, though Improved Revenge counts on it: the game's tooltip
  // reads base x talents x stance + share x talents x attack power, and the first combat log agrees (153.7 at about 291).
  // What that gives back, before armor.
  function revengeStanceBack(ab, rank, S, mods) {
    if (ab.name !== "Revenge" || !rank.textShares) return 0;
    const stance = sum(S.tal.dmgPct.filter((d) => d.name === "Defensive Stance").map((d) => d.value));
    return (-stance / 100) * rank.textShares.AP * S.ap * (1 + mods.pct(0) / 100) * (1 + mods.pct(8) / 100);
  }

  // the first level a talent's row lets you have it: a row needs 5 more points spent, and you get a point a level from 10
  const talentOpensAt = (t) => 10 + 5 * t.row;

  function abilityResult(ab, S, ctx) {
    let rank = pickRank(ab, ctx.level);
    const base = { name: ab.name, icon: ab.icon, ability: ab };
    if (ab.talent) {
      const i = ctx.flat.findIndex((t) => t.id === ab.talent);
      if (i >= 0 && !ctx.ranks[i]) return { ...base, locked: "Needs the talent", rank: rank || ab.ranks[0] };
      // taken, it's yours whatever level the files give its first rank (a combat log: Stormstrike, 40 there, cast at 36)
      if (i >= 0 && !rank && ctx.level >= talentOpensAt(ctx.flat[i])) rank = ab.ranks[0];
    }
    // a race's own spell (Starshards: Night Elf Priests) counts only for that race
    if (ab.races && !ab.races.includes(ctx.race)) return { ...base, locked: `${ab.races.join(" and ")} only`, rank: rank || ab.ranks[0] };
    if (!rank) return { ...base, locked: `Learned at level ${ab.ranks[0].level}`, rank: ab.ranks[0] };
    // what it needs in your hands (game data): e.g. Backstab a dagger, Shield Slam a shield
    const needs = (((KP.spellbook || {})[ctx.cls.token] || []).find((b) => b.name === ab.name) || {}).needs;
    if (needs && ctx.worn.length) {
      if (needs.class === 4 && needs.subclassMask & (1 << 6) && !S.shield) return { ...base, rank, locked: "Needs a shield" };
      // shots check the ranged slot
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
    // talents that lengthen it (Improved Shadow Word: Pain +6 sec, Nature's Splendor): more ticks
    const durMs = Math.max(0, ((rank.durMs || 0) + mods.flat(1)) * (1 + mods.pct(1) / 100));
    const src = { ...rank, durMs, familyName: ab.name };
    // a strike with the off-hand weapon (Shank) says so in its tooltip; the files don't
    const hand = /with your off-hand weapon/.test(rank.desc || "") ? "offHand" : "mainHand";
    let r = effectDamage(rank.effects, src, S, ctx, hand, mods);
    // spells it sets off: add their damage (a periodic trigger fires once per tick). Aura 226 with a trigger = an area
    // spell's ticks (Blizzard, Consecration...), paired with its damage spell by the data script (areaLink)
    const periodic = (e) => e.effect === 6 && (e.aura === 23 || e.aura === 226) && e.trigger;
    const periodicTrigger = rank.effects.find(periodic);
    // only spells the ability itself sets off (not "when you're struck" procs like Lightning Shield)
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
    if (!r.hasDirect && !r.dot && !r.heal) return null; // nothing we can put a number on

    // talents: damage %, damage over time %, crit chance, crit damage, cast time, cost, cooldown
    const dmgMult = (1 + mods.pct(0) / 100) * (1 + mods.pct(8) / 100) * (1 + damagePct(S, rank.school || 1) / 100) *
      (r.kind === "ranged" && r.physical ? 1 + rangedPct(S, S.rg) / 100 : 1); // a ranged weapon shot
    const flatDmg = mods.flat(0);
    const dotMult = (1 + mods.pct(22) / 100) * (1 + damagePct(S, rank.school || 1) / 100);
    // armor stops every Physical hit, spell-like Thunder Clap too: the first combat log's 51 raw became 42
    const mit = r.physical ? 1 - mitigation(ctx, S) : 1;
    const stanceBack = revengeStanceBack(ab, rank, S, mods);
    const dmin = r.hasDirect ? ((r.dmin + flatDmg) * dmgMult + stanceBack) * mit : 0;
    const dmax = r.hasDirect ? ((r.dmax + flatDmg) * dmgMult + stanceBack) * mit : 0;
    // Improved Mind Flay: each tick hits harder than the last (the server's rule; its tooltip has the %)
    const growth = ab.name === "Mind Flay" ? talentNumber(ctx, "Improved Mind Flay", /deals (\d+)% more damage than its previous/) / 100 : 0;
    const tickGrowth = growth && r.ticks > 1 ? sum(Array.from({ length: r.ticks }, (_, k) => (1 + growth) ** k)) / r.ticks : 1;
    const dot = r.dot * dotMult * tickGrowth;
    const isSpell = r.kind === "magic";
    const critChance = Math.max(0, (isSpell ? S.spellCrit : S.crit - critSuppression(ctx)) + mods.flat(7));
    const critMult = 1 + (isSpell ? 0.5 : 1) * (1 + mods.pct(15) / 100);
    const t = table(ctx, S, r.kind);
    const miss = Math.max(0, t.miss - mods.flat(16));
    const land = Math.max(0, 100 - miss - t.dodge) / 100;
    const avg = (dmin + dmax) / 2;
    // talents the server works out (a "dummy" effect in the files holds only the number; the tooltip says what it does):
    // Improved Whirlwind hits the closest enemy harder; Lightning Overload sometimes casts a free copy for half damage
    const closest = ab.name === "Whirlwind"
      ? talentNumber(ctx, "Improved Whirlwind", /closest enemy by (\d+)%/) / 100 / Math.max(1, r.hits) : 0;
    const overload = ab.name === "Lightning Bolt" || ab.name === "Chain Lightning"
      ? (talentNumber(ctx, "Lightning Overload", /(\d+)% chance to cast a second/) / 100) * 0.5 : 0;
    let directExpected = land * avg * (1 + Math.min(100, critChance) / 100 * (critMult - 1)) * (1 + closest + overload);
    // Ignite (Mage): Fire crits burn for a share of their damage over 4 sec
    const ignite = (rank.school & 4) && isSpell ? talentNumber(ctx, "Ignite", /additional (\d+)% of your spell's damage/) : 0;
    if (ignite) directExpected += land * (Math.min(100, critChance) / 100) * avg * critMult * (ignite / 100);
    // damage over time that can crit in Forever (game data flag): its ticks crit like the ability's direct part
    const dotExpected = land * dot * (rank.dotCrit ? 1 + Math.min(100, critChance) / 100 * (critMult - 1) : 1);
    const expected = directExpected + dotExpected;
    const channelMs = rank.channeled ? rank.durMs : 0;
    const castMs = Math.max(0, (rank.castMs + mods.flat(10)) * (1 + mods.pct(10) / 100)) / (1 + (S.castHaste || 0) / 100);
    const cdMs = Math.max(0, (rank.cdMs + mods.flat(11)) * (1 + mods.pct(11) / 100));
    const schoolCost = sum(S.tal.costSchool.filter((c) => c.school & (rank.school || 1)).map((c) => c.value));
    const costRaw = Math.max(0, (rank.cost + mods.flat(14)) * (1 + mods.pct(14) / 100) * (1 + schoolCost / 100));
    const cost = rank.powerType === 1 ? costRaw / 10 : costRaw; // rage is stored x10
    // heals take the spell's own modifiers (Healing Way, Purification...), not "damage done %" auras (Naturalist, Searing Light)
    const heal = r.heal * (1 + mods.pct(0) / 100) * (1 + mods.pct(8) / 100);
    // a heal crit heals 150%; talents like Holy Power raise the bonus part
    const healCritMult = 1 + 0.5 * (1 + sum(S.tal.healCrit.filter((h) => h.school & (rank.school || 1)).map((h) => h.value)) / 100);
    // Execute: each leftover rage point adds amp x 10 damage, with the same talents, armor, hit and crit
    const amp = (rank.effects.find((e) => e.amp) || {}).amp;
    const perRage = amp && avg ? amp * 10 * dmgMult * mit * (expected / avg) : 0;
    // Stacking bleeds (Lacerate): "plus 10% weapon damage per existing application", "stacks up to 5 times" (tooltip;
    // the number is a dummy effect the server works out). weaponHit = that extra per existing stack, talents counted;
    // left out of the average above (it depends on the stacks), shown on the Abilities tab
    const stackMatch = /stacks up to (\d+) times/.exec(rank.desc || "");
    const perStack = /plus (\d+)% weapon damage per existing application/.exec(rank.desc || "");
    const stack = stackMatch && r.dot ? { max: +stackMatch[1],
      weaponHit: perStack && S.mh ? (+perStack[1] / 100) * rawSwing(S, S.mh) * dmgMult : 0, weaponPct: perStack ? +perStack[1] : 0 } : null;
    return {
      perRage, hits: r.hits, stack, critMult,
      ...base, rank, kind: r.kind, school: rank.school, dmin, dmax, avg, critAvg: avg * critMult, dot, ticks: r.ticks,
      heal, healCrit: heal * healCritMult, healCritMult, critChance: Math.min(100, critChance), miss, dodge: t.dodge, expected,
      castMs, channelMs, cdMs, cost, costPct: rank.cost ? 0 : rank.costPct, powerType: rank.powerType,
      combo: r.combo, aoe: r.area && !r.single,
      // crowd control (root, stun, fear, sleep): not part of a damage rotation
      cc: rank.effects.some((e) => e.effect === 6 && [5, 7, 12, 26].includes(e.aura)), directExpected, dotExpected, channeled: !!rank.channeled,
      durMs, mods: [...new Set(mods.list.map((m) => m.name))],
      perSecond: isSpell && ctx.cls.power === 0 && (expected || heal)
        ? (expected || heal * (1 + critChance / 100 * 0.5)) / Math.max(1.5, (channelMs || castMs) / 1000) : null,
    };
  }

  // Arcane Blast (game data): "Each time you cast Arcane Blast, you gain 12% of your Intellect as Spell Damage and the
  // mana cost of Arcane Blast is increased by 100%. Effect stacks up to 4 times and lasts 18 sec from time of initial
  // application." The plan opens each window with ctx.blastCycle Blasts (compute() tries 0 to one past the most stacks);
  // the rest of the window has the stacks' spell damage (stats). Null when no such spell is learned.
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
    // A same-level mob: the fight lasts as long as the mob takes to die at the damage you do in a fight that long
    // (fightMs). A long fight's damage gives the first guess, the damage in that fight the second; then the secant with
    // the latest guess on the other side of the answer, until one is within 1% (the guesses swing around the answer:
    // damage over time does more in a longer fight, and the plan can change spells at some length).
    if (ctx.fightSec === undefined && ctx.target && ctx.target.mode === "same") {
      const hp = ctx.target.health || mobHealth(ctx.level);
      const long = compute({ ...ctx, fightSec: null });
      if (!(dps(long) > 0)) return long;
      // a guessed length, and how much longer the mob lives than that (negative: it dies sooner)
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
    // Arcane Blast: the number of Blasts per window that does the most (stackingSpell)
    const stacking = ctx.blastCycle == null && stackingSpell(ctx);
    if (stacking) {
      let best = null;
      for (let k = 0; k <= stacking.max + 1; k++) {
        const R = compute({ ...ctx, blastCycle: k });
        if (!best || dps(R) > dps(best)) best = R;
      }
      return best;
    }
    // Demonic Sacrifice: whichever demon does more for this build (handRules)
    if (ctx.sacrifice == null && learnedTalent(ctx, "Demonic Sacrifice")) {
      const [imp, succubus] = Object.keys(SACRIFICE).map((s) => compute({ ...ctx, sacrifice: s }));
      return dps(imp) >= dps(succubus) ? imp : succubus;
    }
    // Shadow and Flame: with its bonuses (and the spells they need cast on cooldown) or without, whichever does more
    if (ctx.shadowAndFlame == null && learnedTalent(ctx, "Shadow and Flame")) {
      const [on, off] = [true, false].map((v) => compute({ ...ctx, shadowAndFlame: v }));
      return dps(on) >= dps(off) ? on : off;
    }
    const S = stats(ctx);
    const white = whiteHits(ctx, S);
    const list = (KP.abilities[ctx.cls.token] || []).map((ab) => abilityResult(ab, S, ctx)).filter(Boolean);
    const healing = ["PRIEST", "PALADIN", "DRUID", "SHAMAN"].includes(ctx.cls.token) && !S.form ? healRotation(ctx, S, list) : null;
    const rot = rotation(ctx, S, white, list);
    if (rot) rot.threat = threatOf(ctx, S, rot);
    return { S, white, abilities: list, rotation: rot, healing };
  }

  // The threat bonuses on you: your stance or bear form (game data), Righteous Fury while you tank (its tooltip's two
  // numbers) and your talents (game data: Defiance; less threat from Burning Soul, Silent Resolve...). Each is
  // { school mask, value %, name }. tank: you're the one holding the enemy (Defensive Stance, a bear form, Righteous Fury).
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

  // Threat per second by the original game's rules, which Forever's server is built on: a point of damage is a point of
  // threat, and so is the flat threat a spell adds (game data: Sunder Armor); each gets every threat bonus that matches
  // its school, multiplied together (+80% and +20% make x2.16), and the spell's own (a talent's threat modifier on it,
  // game data: Iron Creed on Holy Strike; or its tooltip's: Holy Shield's damage). unknown: attacks whose tooltip
  // promises "a high amount of threat" the server works out (not in the game files, so not counted).
  function threatOf(ctx, S, rot) {
    const tok = ctx.cls.token;
    const { mods, tank } = threatMods(ctx, S);
    const own = (spell) => {
      const ab = spell && (KP.abilities[tok] || []).find((a) => a.name === spell);
      const rank = ab && pickRank(ab, ctx.level);
      const tip = spell && /causes (\d+)% additional threat/.exec(bookDesc(tok, spell));
      return 1 + ((rank ? modsFor(S, rank).pct(2) : 0) + (tip ? +tip[1] : 0)) / 100; // spell modifier 2: threat
    };
    const mult = (school, spell) => mods.filter((m) => m.school & school).reduce((x, m) => x * (1 + m.value / 100), own(spell));
    const tps = sum(rot.parts.map((p) => p.dps * mult(p.school || 1, p.spell))) +
      sum((rot.flatThreat || []).map((f) => f.perSec * f.threat * mult(1, f.spell)));
    const unknown = [...new Set(rot.parts.map((p) => p.spell))].filter((n) => n && /amount of threat/.test(bookDesc(tok, n)));
    return { tps, mods, tank, unknown };
  }

  // Just the abilities (no rotation), for the Abilities tab: { S, results } with results[i] for KP.abilities[class][i]
  // (null when there's nothing to put a number on). `only` limits it to some ability indexes.
  function abilityResults(ctx, only) {
    const S = stats(ctx);
    const results = (KP.abilities[ctx.cls.token] || []).map((ab, i) => (!only || only.includes(i) ? abilityResult(ab, S, ctx) : null));
    return { S, results };
  }

  // A melee swing at you: the chance (0-1) that it misses, is dodged, parried or blocked (blocks need a shield). Each
  // point of defense skill adds 0.04% to each of the four (the original game's rule).
  const BASE_MISS = 0.05;
  function swingOutcomes(S) {
    const d = Math.max(0, S.defense) * 0.0004;
    return { miss: BASE_MISS + d, dodge: S.dodge / 100 + d, parry: S.parry / 100 + d, block: S.shield ? S.block / 100 + d : 0 };
  }
  // the share of swings that don't land in full (a block counted as avoided), at most 60%
  const avoidance = (S) => { const o = swingOutcomes(S); return Math.min(0.6, o.miss + o.dodge + o.parry + o.block); };

  // A normal mob (mobs live on the server, not in the files), from three combat logs (2026-11-08), levels 7 to 33 and one at 60.
  // Its melee damage per second before your armor and stance: about level - 4 up to 21 at level 25, then the original game's
  // curve (the logs: 20 to 23 at 28 to 31; about 71 at 60); and the seconds between its swings
  const mobDps = (L) => Math.max(Math.min(L - 4, 21), 0.014 * L * L + 0.35 * L);
  const MOB_SWING = 2;
  // its health (about 1,260 at 30, 4,365 read at 60; the logs read up to 4% more at 27 to 30): how long a fight against it lasts
  const mobHealth = (L) => (L < 20 ? 0.9 : 1) * L * L + 12 * L;
  // its armor: [level, armor] with straight lines between. Read in those logs up to level 33 and at 60; level 40 is the same
  // rise carried on (an estimate: nothing has been seen between 34 and 59); 63 is a raid boss's usual 3731
  const MOB_ARMOR = [[3, 46], [7, 245], [8, 322], [9, 412], [10, 518], [11, 545], [24, 1002], [40, 1563], [60, 3566], [63, 3731]];
  function mobArmor(L) {
    if (L <= MOB_ARMOR[0][0]) return (MOB_ARMOR[0][1] * L) / MOB_ARMOR[0][0];
    const i = MOB_ARMOR.findIndex(([level]) => level >= L);
    if (i < 0) return MOB_ARMOR[MOB_ARMOR.length - 1][1];
    const [l0, a0] = MOB_ARMOR[i - 1], [l1, a1] = MOB_ARMOR[i];
    return a0 + ((a1 - a0) * (L - l0)) / (l1 - l0);
  }
  // An elite: the same armor as a normal mob of its level, 3 times the health, hits about 2.2 times as hard (a dungeon's log reads
  // 1.8 to 2.8 by level, 2.0 at 28 to 33, Demoralizing Shout lowering it; first seen on 7 tough mobs at levels
  // 16, 17 and 30 in those logs, picked out by their health: the logs don't label elites). The enemies you can pick: keyed as
  // the planner's Target list and links name them.
  const ELITE_HEALTH = 3, ELITE_HIT = 2.2;
  const mobTargets = (L) => ({
    same: { diff: 0, armor: Math.round(mobArmor(L)), mode: "same", health: mobHealth(L), hitMult: 1 },
    elite: { diff: 0, armor: Math.round(mobArmor(L)), mode: "same", health: ELITE_HEALTH * mobHealth(L), hitMult: ELITE_HIT },
    elite3: { diff: 3, armor: Math.round(mobArmor(L + 3)), mode: "same", health: ELITE_HEALTH * mobHealth(L + 3), hitMult: ELITE_HIT },
  });

  // Leveling fights end when the mob dies: ctx.fightSec seconds (compute() works it out against a same-level mob;
  // null = a long fight, as against a raid boss), then ctx.restSec of eating and drinking (the leveling model's).
  const fightMs = (ctx) => (ctx.fightSec ? ctx.fightSec * 1000 : Infinity);
  // A damage-over-time spell recast as it runs out: once a fight when the fight is shorter than the spell (no sooner
  // than its cooldown), and the share of each cast's damage that lands before the mob dies. Its ticks come one tick
  // apart from one tick after the cast, so about half a tick of each fight is lost (Bane of Doom's single tick after
  // 1 min: nothing in a short fight).
  function dotRecast(ctx, durMs, ticks, cdMs = 0) {
    if (!(durMs > 0)) return { everyMs: cdMs, landed: 1 };
    const half = ticks > 0 ? durMs / ticks / 2 : 0, T = fightMs(ctx);
    return { everyMs: Math.max(cdMs, Math.min(durMs, T)), landed: T >= durMs ? 1 : Math.max(0, T - half) / (durMs - half) };
  }
  // A cooldown's uses per second of fighting, used whenever it's ready during `share` of the fight (0.2 = "20% health
  // or less"). A long fight: once per cooldown. Leveling: at the start of that part of each fight when ready, then every
  // cooldown while it lasts (half a use more than its length ÷ the cooldown, on average); it comes back during the
  // eating and drinking too, so a short one is ready at every pull.
  function cooldownUses(ctx, cdMs, share = 1) {
    if (!ctx.fightSec || ctx.restSec == null) return (share * 1000) / cdMs;
    const T = ctx.fightSec, C = cdMs / 1000;
    return Math.min(Math.max(1, 0.5 + (share * T) / C), (T + ctx.restSec) / C) / T;
  }
  // A spell used whenever its cooldown is ready: its uses per second (cooldownUses) and the share of each use's damage
  // over time that lands. One copy ticks at a time (the next use replaces it) and nothing ticks after the mob dies, so
  // at most the whole of that part of the fight is covered.
  function cooldownCasts(ctx, durMs, cdMs, share = 1) {
    const rate = cooldownUses(ctx, cdMs, share);
    const perFight = Math.max(rate, 1000 / fightMs(ctx)); // a use's burn can't outlast its fight either
    return { rate, landed: durMs > 0 ? Math.min(1, (share * 1000) / (perFight * durMs)) : 1 };
  }
  // The share of the fighting a cooldown's buff is up. A buff on you outlives the mob: each use covers its length within
  // one fight, or, when it lasts longer than a fight and the rest after it, the fighting in the fights it spans.
  function cooldownShare(ctx, durMs, cdMs) {
    if (!ctx.fightSec || ctx.restSec == null) return Math.min(1, durMs / cdMs);
    const T = ctx.fightSec, D = durMs / 1000;
    const covered = Math.max(Math.min(D, T), (D * T) / (T + ctx.restSec));
    return Math.min(1, cooldownUses(ctx, cdMs) * covered);
  }
  // how a cooldown's buff is counted, for the Talents and Racials lists
  const averagedText = (ctx, durMs, cdMs, share) => ` (averaged: ${Math.round(durMs / 1000)} sec every ${Math.round(cdMs / 6000) / 10} min` +
    (ctx.fightSec && ctx.restSec != null ? `; leveling: up ${Math.round(share * 100)}% of the fighting, counting the rest between fights)` : ")");
  // The rules the addon's own copy of the Warrior math reads (tools/export_sim.js writes them to its Data/Sim.lua)
  const simRules = () => ({ meleeMiss: MELEE_MISS, spellMiss: SPELL_MISS, glanceChance: GLANCE_CHANCE, glanceDamage: GLANCE_DAMAGE,
    baseMiss: BASE_MISS, mobSwing: MOB_SWING, revengeWindow: REVENGE_WINDOW, ragePerSwingSec: RAGE_PER_SWING_SEC, offhandRage: OFFHAND_RAGE,
    rageTakenPerC: RAGE_TAKEN_PER_C, ragePerHitTaken: RAGE_PER_HIT_TAKEN, rageC: RAGE_C, executePhase: EXECUTE_PHASE, recklessCd: RECKLESS_SWINGS_CD,
    normalSpeed: NORMAL_SPEED, unshownAp: UNSHOWN_AP, unshownApPerTick: UNSHOWN_AP_PER_TICK, apDummy: AP_DUMMY, mobArmor: MOB_ARMOR,
    eliteHealth: ELITE_HEALTH, eliteHit: ELITE_HIT, weaponTalents: Object.keys(WEAPON_TALENTS) });
  // the damage per second its swings do to you: through your misses, dodges, parries, blocks and armor, and changes to
  // the damage you take (Defensive Stance)
  function meleeTaken(S, level, hitMult = 1) {
    const armorDR = Math.min(0.75, S.armor / (S.armor + 400 + 85 * level));
    return mobDps(level) * hitMult * (1 - avoidance(S)) * (1 - armorDR) * (1 + (S.damageTaken || 0) / 100);
  }

  // survival: health through armor and avoidance against a raid boss (the measure the builds, "why" and Equip BiS use)
  function ehp(R, level) {
    const S = R.S;
    const armorDR = Math.min(0.75, S.armor / (S.armor + 400 + 85 * (level + 3)));
    return S.health / ((1 - armorDR) * (1 - avoidance(S))) / (1 + (S.damageTaken || 0) / 100);
  }

  // mana pool and in-combat regen per second (Spirit share kept while casting, plus mp5), for the leveling model
  function manaInfo(ctx) {
    const S = stats(ctx);
    return { pool: S.mana, regen: S.mp5 / 5 + spiritRegenOf(S.attr.spirit) * keepWhileCasting(ctx) / 100 + blockMana(ctx, S) };
  }

  // ------------------------------------------------------------ formulas

  // The rules behind the character sheet's numbers, written out for the addon's Formulas tab (tools/export_formulas.js),
  // from the same numbers this file works with. Each: name, text (in words, with the class's numbers), and either expr
  // (to work out with your own numbers) with game (the game's number to show next to it), digits and unit, or only text
  // for a rule of combat. expr uses level, str, agi, sta, int, spi, gearArmor (armor on your gear), armor, health,
  // dodge, parry, block (yours, as the game shows them) and the game tables baseHealth, baseMana, hpPerSta, with min
  // and max. estimate = the planner's guess, not checked
  // in game yet. test/calc.test.js checks every expr against this file's own numbers.
  const INPUT_NAMES = { level: "level", str: "Strength", agi: "Agility", sta: "Stamina", int: "Intellect", spi: "Spirit" };
  // a sum like "3 × level + 2 × Strength - 20" and the same as an expression; terms = [[how many, of what], ...]
  function linear(terms, constant) {
    const used = terms.filter(([n]) => n);
    const text = used.map(([n, k], i) => `${i ? " + " : ""}${n === 1 ? "" : `${n} × `}${INPUT_NAMES[k]}`).join("") +
      (constant ? ` ${constant < 0 ? "-" : "+"} ${Math.abs(constant)}` : "");
    const expr = used.map(([n, k]) => `${n} * ${k}`).concat(constant ? [String(constant)] : []).join(" + ");
    return { text, expr };
  }
  const MELEE = ["WARRIOR", "ROGUE", "PALADIN", "SHAMAN", "DRUID", "HUNTER"];
  const WANDS = ["PRIEST", "MAGE", "WARLOCK"];
  // Where a number in a formula comes from: the addon lists each under its formula as "number: what it is. From: ..."
  // and explains these sources once at the top (the original game's rule: worked out by the server, so not in the
  // game files; Classic servers use the same)
  const FROM = {
    files: (where) => `Forever's game files (${where})`,
    rule: "the original game's rule",
    checked: (how) => `the original game's rule, checked on Forever: ${how}`,
    patch: (when) => `Forever's patch notes, ${when}`,
    estimate: "the planner's estimate, not yet checked on Forever",
    planner: "the planner's own choice",
  };
  const round = (v, places) => Number(v.toFixed(places));

  // each formula: { name, text, numbers: [[the number as the text shows it, what it is, where it comes from], ...] }
  // plus, to work out with your numbers, expr, game, digits, unit, estimate and note (see above)
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
    // Agility per 1% crit: measured for some classes (KP.measured.agiPerCrit), the addon looks it up by level
    // (LevelTables.agiPerCrit from tools/export_formulas.js) as the input agiPerCrit
    const at60 = AGI_PER_CRIT[t] || 20;
    const agiMeasured = KP.measured.agiPerCrit[t];
    const agiLevels = agiMeasured && Object.keys(agiMeasured).map(Number).sort((a, b) => a - b);
    const lastMeasured = agiLevels && agiLevels[agiLevels.length - 1];
    const perCritNumber = agiMeasured
      ? ["the Agility per 1% crit at your level", `measured: ${round(agiMeasured[agiLevels[0]], 1)} at level ${agiLevels[0]}, ` +
        `${round(agiMeasured[lastMeasured], 1)} at level ${lastMeasured}; above that a straight line to the original game's ` +
        `${at60} at level 60 (an estimate there)`, FROM.checked(`the owner's Warrior at levels ${agiLevels[0]} to ${lastMeasured}, ` +
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
        [`${BASE_MISS * 100}%`, "an attack's base chance to miss you", FROM.rule],
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
            "seconds from gear keeps going", FROM.rule],
        ] });
    }
    if (t === "WARRIOR") {
      const fromLog = "a combat log on Forever: six Warriors with swings of 1.8 to 2.8 sec, up to level 30; level 60 not seen yet";
      out.push({ name: "Rage from your swing", digits: 1, expr: `${RAGE_PER_SWING_SEC} * speed`,
        text: `${RAGE_PER_SWING_SEC} × your weapon's swing time for each hit, whatever it hits for, so every weapon gives the same rage a second`,
        note: "A crit gives twice this; an off-hand hit half, plus what Dual Wield Specialization adds.",
        numbers: [
          [`${RAGE_PER_SWING_SEC}`, "rage per second of swing time", fromLog],
          ["crits: twice", "a crit gives exactly twice a hit's rage (18.7 against 9.3 on a 2.7 sec sword)", fromLog],
          ["off hand: half", "an off-hand hit's rage: no dual-wielding Warrior has been read yet", FROM.estimate],
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
    const hitsFrom = (power) => [[`${power} ÷ 14 × weapon speed`, "14 attack power add 1 damage per second, so a slow weapon " +
      "gets more per swing", FROM.rule], ["double damage", "a crit", FROM.rule]];
    if (MELEE.includes(t)) {
      out.push({ name: "White hits", text: "weapon damage + attack power ÷ 14 × weapon speed. Crits do double damage.",
        numbers: hitsFrom("attack power") });
    }
    if (t === "HUNTER") {
      out.push({ name: "Shots", text: "weapon damage + ranged attack power ÷ 14 × weapon speed. Crits do double damage.",
        numbers: hitsFrom("ranged attack power") });
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
        [`${caps.dualWhite}%`, "dual wielding makes white hits miss 19% more often", FROM.rule],
        [`${caps.spell}%`, `spells miss ${SPELL_MISS[3]}% of the time against it, and 1% always misses`, FROM.rule],
        [glance, "glancing blows: white hits that land for less; abilities never glance", FROM.rule],
        [lowerCrit, "about 1% less crit per level the boss is above you", FROM.rule],
      ] });
    return out;
  }

  KP.calc = { compute, stats, talentEffects, estimateBase, hunterStyle, hitCaps, manaInfo, abilityResults, mitigation, FORMS, ehp,
    STANCE_FORM, inMask, warriorStance, formulas, spiritRegenOf, petRawDps, rageConversion, rageFromDamage, bareStat, agiPerCrit, wearableFrom, talentOpensAt, swingOutcomes, avoidance, mobDps, mobHealth, mobArmor, mobTargets, meleeTaken, simRules };
})();
