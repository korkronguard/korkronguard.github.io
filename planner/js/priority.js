// Kor'kron Planner: the Priority tab. "What should I press?" for this character, worked out from its talents,
// level and gear. The order inside each group comes from the game's numbers (damage per rage / mana, cooldowns,
// stance rules); the groups themselves (keep buffs up, then cooldown attacks, then a rage dump...) are standard
// theory, and each line says which is which.
(function () {
  "use strict";

  const KP = window.KP;
  const app = KP.app;
  const state = app.state;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const fmt = (v, d = 0) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const sec = (ms) => (ms >= 60000 && ms % 60000 === 0 ? `${ms / 60000} min` : `${fmt(ms / 1000, ms % 1000 ? 1 : 0)} sec`);
  const firstNumber = (text) => { const m = /(\d+(?:\.\d+)?)/.exec(text || ""); return m ? parseFloat(m[1]) : null; };
  // the number after a phrase in a tooltip, e.g. numberAfter(desc, "Attack Power by") -> 120
  const numberAfter = (text, phrase) => { const i = (text || "").indexOf(phrase); return i < 0 ? null : firstNumber(text.slice(i + phrase.length)); };

  // Warrior stances in the game's SpellShapeshift mask
  const STANCE = { battle: 1 << 16, defensive: 1 << 17, berserker: 1 << 18 };
  const STANCE_NAME = { battle: "Battle Stance", defensive: "Defensive Stance", berserker: "Berserker Stance" };
  const TWO_HAND = [1, 5, 6, 8, 10]; // weapon subclasses: 2H axe, 2H mace, polearm, 2H sword, staff

  // Settings on this tab (in the link): tank mode, Hunter style
  state.prio = state.prio || { tank: null, style: "auto", weapons: "auto" };
  const WEAPON_SETUPS = { "2h": "Two-hander", dw: "Dual wield", shield: "Sword and board" };
  const WS_LINK = { "2h": "2", dw: "d", shield: "s" };
  app.encoders.push(() => {
    let s = "";
    if (state.prio.tank != null) s += "&tk=" + (state.prio.tank ? 1 : 0);
    if (state.prio.style !== "auto") s += "&hs=" + state.prio.style[0];
    if (state.prio.weapons !== "auto") s += "&ws=" + WS_LINK[state.prio.weapons];
    return s;
  });
  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    const tk = p.get("tk");
    state.prio = { tank: tk === "1" ? true : tk === "0" ? false : null,
      style: { r: "ranged", m: "melee" }[p.get("hs")] || "auto",
      weapons: Object.keys(WS_LINK).find((k) => WS_LINK[k] === p.get("ws")) || "auto" };
  }

  // ------------------------------------------------------------ what this character has

  function character() {
    const ctx = app.ctx();
    const flat = app.flat(), ranks = app.liveRanks();
    const talent = {}; // name -> points
    const treePts = [0, 0, 0];
    flat.forEach((t, i) => {
      if (!ranks[i]) return;
      talent[t.name] = (talent[t.name] || 0) + ranks[i];
      treePts[t.tree] += ranks[i];
    });
    const talentById = (id) => {
      const i = flat.findIndex((t) => t.id === id);
      return i >= 0 ? { t: flat[i], rank: ranks[i] } : null;
    };
    const book = KP.spellbook[state.cls.token] || [];
    const R = KP.calc.compute(ctx);
    const res = Object.fromEntries(R.abilities.map((a) => [a.name, a]));
    const worn = ctx.worn;
    const mh = (worn.find((w) => w.slot === "mainHand" && w.item.class === 2) || {}).item;
    const oh = (worn.find((w) => w.slot === "offHand") || {}).item;
    const ranged = (worn.find((w) => w.slot === "ranged" && w.item.class === 2) || {}).item;
    const c = {
      ctx, R, res, talent, treePts, flat, level: state.level, token: state.cls.token,
      trees: KP.talents.trees[state.cls.token].map((t) => t.name),
      mh, oh, ranged, gearKnown: !!(app.worn && worn.length),
      twoHand: !!(mh && TWO_HAND.includes(mh.subclass)),
      shield: !!(oh && oh.class === 4 && oh.subclass === 6),
      dualWield: !!(oh && oh.class === 2),
    };
    // what's in your hands: from the gear (the Warrior's Weapons choice can override it)
    c.hold = { known: c.gearKnown, shield: c.shield, twoHand: c.twoHand, dual: c.dualWield };
    c.spell = (name) => book.find((b) => b.name === name);
    c.rank = (name) => {
      const b = c.spell(name);
      if (!b) return null;
      let r = null;
      for (const x of b.ranks) if ((x.level || 1) <= c.level) r = x;
      return r;
    };
    // learned = trained by this level and, if it comes from a talent, that talent has a point
    c.why = (name) => {
      const b = c.spell(name);
      if (!b) return "not in this class's spellbook";
      if (b.talent) {
        const t = talentById(b.talent);
        if (t && !t.rank) return `talent: ${t.t.name} (${t.t.treeName})`;
      }
      if (!c.rank(name)) return `learned at level ${b.ranks[0].level}`;
      return null;
    };
    c.has = (name) => !c.why(name);
    return c;
  }

  // ------------------------------------------------------------ building the list

  // A priority list: sections of entries; abilities the character doesn't have yet go to "later".
  function list(c) {
    const out = { title: "", facts: [], toggles: [], sections: [], later: [], stanceSkipped: [] };
    const current = { section: null };
    out.section = (title, note) => {
      current.section = { title, note, items: [] };
      out.sections.push(current.section);
    };
    // opts: tag, text (when/how), facts (data lines), source ("data" | "theory"), stance (key), score
    out.add = (name, opts = {}) => {
      if (!opts.always && !c.has(name)) {
        const why = c.why(name);
        if (why && !out.later.some((l) => l.name === name) && worthMentioning(c, name)) out.later.push({ name, why });
        return null;
      }
      const missing = !opts.always && holdMissing(c, (c.spell(name) || {}).needs);
      if (missing) {
        if (!out.later.some((l) => l.name === name)) out.later.push({ name, why: "needs " + missing });
        return null;
      }
      const b = c.spell(name) || {};
      if (opts.stance && b.stances && !(b.stances & STANCE[opts.stance])) {
        const ok = Object.keys(STANCE).filter((k) => b.stances & STANCE[k]).map((k) => STANCE_NAME[k]);
        out.stanceSkipped.push({ name, needs: ok.join(" or ") });
        return null;
      }
      const item = { name: opts.label || name, icon: opts.icon || b.icon, tag: opts.tag, text: opts.text,
        facts: (opts.facts || []).filter(Boolean), source: opts.source || "data", score: opts.score };
      current.section.items.push(item);
      return item;
    };
    // sort the items added since `from` by score (highest first): the data-driven part of the order
    out.sortFrom = (from) => {
      const items = current.section.items;
      const head = items.slice(0, from), tail = items.slice(from);
      tail.sort((a, b) => (b.score || 0) - (a.score || 0));
      current.section.items = head.concat(tail);
    };
    return out;
  }

  // What an item requirement (from the game's SpellEquippedItems) asks for: "shield", "dual", "twoHand" or null.
  // Weapon subclass bits: one-handers 0 axe, 4 mace, 7 sword, 13 fist, 15 dagger; shield = armor subclass bit 6.
  const ONE_HAND_BITS = (1 << 0) | (1 << 4) | (1 << 7) | (1 << 13) | (1 << 15);
  const OFF_HAND_WEAPON = 1 << 22; // inventory type 22
  function holdNeed(needs) {
    if (!needs) return null;
    if (needs.class === 4 && needs.subclassMask & (1 << 6)) return "shield";
    if (needs.invTypes & OFF_HAND_WEAPON) return "dual";
    if (needs.class === 2 && !(needs.subclassMask & ONE_HAND_BITS)) return "twoHand";
    return null;
  }
  const NEED_TEXT = { shield: "a shield (Sword and board)", dual: "an off-hand weapon (Dual wield)", twoHand: "a two-handed weapon" };
  function holdMissing(c, needs) {
    const need = holdNeed(needs);
    return need && c.hold.known && !c.hold[need] ? NEED_TEXT[need] : null;
  }

  // "Not yet": level-locked spells always; talent-locked ones only from a tree you've put real points into
  function worthMentioning(c, name) {
    const b = c.spell(name);
    if (!b || !b.talent) return true;
    const t = c.flat.find((x) => x.id === b.talent);
    if (!t) return true;
    const pts = c.treePts[t.tree];
    return pts >= Math.max(...c.treePts) || pts >= t.row * 5;
  }

  const perUse = (a) => (a && !a.locked && a.expected ? a.expected : 0);
  const perCost = (a) => (a && a.cost ? perUse(a) / a.cost : 0);
  const dmgLine = (a, unit) => {
    if (!a || a.locked) return a && a.locked ? a.locked : null;
    if (!a.expected) return null;
    const bits = [`${fmt(a.expected)} average damage`];
    if (a.cost) bits.push(`${fmt(a.cost)} ${unit}`, `${fmt(a.expected / a.cost, 1)} per ${unit}`);
    if (a.cdMs) bits.push(`${sec(a.cdMs)} cooldown`);
    return bits.join(" · ");
  };

  // ------------------------------------------------------------ Warrior

  function warrior(c) {
    const L = list(c);
    const [arms, fury, prot] = c.treePts;
    const spec = c.talent["Shield Slam"] || (prot > arms && prot > fury) ? "prot"
      : c.talent["Mortal Strike"] || (arms >= fury && arms > 0) ? "arms" : c.talent["Bloodthirst"] || fury > 0 ? "fury" : "arms";
    const tank = state.prio.tank != null ? state.prio.tank : spec === "prot";
    L.toggles.push({ key: "tank", label: "Tank mode", on: tank,
      help: "On: you hold the boss (Defensive Stance, threat first). Off: you're free to deal damage, e.g. an off-tank between pulls." });
    const specName = { arms: "Arms", fury: "Fury", prot: "Protection" }[spec];
    L.title = `${specName} Warrior${tank ? ", tanking" : ""}`;
    L.facts.push(`Talents: ${arms} / ${fury} / ${prot}` + (c.talent["Mortal Strike"] ? " · Mortal Strike" : "") +
      (c.talent["Bloodthirst"] ? " · Bloodthirst" : "") + (c.talent["Shield Slam"] ? " · Shield Slam" : ""));
    // weapons: from the gear unless the player picks a setup (any setup can tank or deal damage)
    const fromGear = c.twoHand ? "2h" : c.dualWield ? "dw" : c.shield ? "shield" : null;
    const guess = spec === "prot" ? "shield" : spec === "fury" ? "dw" : "2h";
    const auto = fromGear || guess;
    const setup = state.prio.weapons !== "auto" ? state.prio.weapons : auto;
    c.hold = { known: true, shield: setup === "shield", twoHand: setup === "2h", dual: setup === "dw" };
    L.toggles.push({ key: "weapons", label: "Weapons", value: state.prio.weapons,
      options: [["auto", `Auto (${WEAPON_SETUPS[auto]}${fromGear ? "" : ", guessed"})`], ...Object.entries(WEAPON_SETUPS)],
      help: "What you hold changes what you can press: shield abilities need a shield, and some talents only work with one setup." });
    L.facts.push(`Weapons: ${WEAPON_SETUPS[setup]}` + (state.prio.weapons === "auto" && !fromGear ? " (guessed from your talents; pick gear on Gear & Stats for real numbers)" : ""));
    if (state.prio.weapons !== "auto" && fromGear && fromGear !== setup) {
      L.facts.push(`Your equipped gear is ${WEAPON_SETUPS[fromGear]}: the list follows your choice, but damage numbers still use what you wear.`);
    }
    if (!c.gearKnown) L.facts.push("No gear picked: damage numbers need a weapon (Gear & Stats tab).");
    const A = c.res;
    const unit = "rage";
    weaponTalents(c, L, setup);

    if (tank) return warriorTank(c, L, A, unit);

    // stance: Arms lives in Battle Stance (Overpower, Sweeping Strikes, Spearing Strike are Battle-only),
    // Fury in Berserker Stance (+crit; Whirlwind is Berserker-only)
    const berserkerCrit = firstNumber((c.spell("Berserker Stance") || {}).desc);
    const stance = spec === "fury" && c.has("Berserker Stance") ? "berserker" : "battle";
    L.facts.push(`Stance: ${STANCE_NAME[stance]}` + (stance === "berserker" && berserkerCrit ? ` (+${berserkerCrit}% crit, from the game data)` : "") +
      (stance === "battle" ? " (Overpower, Sweeping Strikes and Spearing Strike only work here)" : ""));

    // ---- before and during the fight: buffs and debuffs
    L.section("Keep up", "Buffs and debuffs first: they make everything else hit harder.");
    const bs = c.rank("Battle Shout");
    L.add("Battle Shout", { tag: "Keep up", text: "Refresh before it runs out (lasts " + sec((bs || {}).durMs || 120000) + ").",
      facts: [bs ? `Rank for level ${c.level}: +${fmt(buffNumber("Battle Shout", c.level))} attack power for the group, ${fmt(bs.cost / 10)} rage` +
        (c.talent["Booming Voice"] ? " (Booming Voice: 25% cheaper)" : "") : null] });
    if (!(c.ctx.buffs || {})["Sunder Armor"]) {
      const withSunder = KP.calc.compute({ ...c.ctx, buffs: { ...(c.ctx.buffs || {}), "Sunder Armor": true } });
      const gain = c.R.rotation && withSunder.rotation && c.R.rotation.dps ? (withSunder.rotation.dps / c.R.rotation.dps - 1) * 100 : 0;
      L.add("Sunder Armor", { tag: "If no tank does it", text: "Stack it to 5 on the boss, then let it be (a tank usually keeps it up).",
        facts: [`5 stacks: −${fmt(buffNumber("Sunder Armor", c.level) * 5)} armor on the target` + (gain > 0.5 ? `, about +${fmt(gain)}% damage for you` : ""),
          "Switch on \"Sunder Armor ×5\" in the panel if your raid keeps it up."] });
    }
    if (c.has("Rend") && stance !== "berserker" && (c.talent["Bloodthrill"] || c.talent["Improved Rend"])) {
      const rend = A["Rend"];
      L.add("Rend", { tag: "Keep up", text: c.talent["Bloodthrill"] ? "Keep it on the target: Bloodthrill needs it." : "Keep it on the target.",
        facts: [c.talent["Bloodthrill"] ? `Bloodthrill: your main-hand hits on a Rended target have a ${fmt(talentNumber(c, "Bloodthrill"))}% chance to allow Overpower` : null,
          dmgLine(rend, unit), "Bleed: armor doesn't reduce it"] });
    }

    // ---- the attacks: on cooldown, ordered by damage per rage
    L.section("Attack priority", "Press the first one that's ready. Within this group the order is damage per rage with your current talents and gear.");
    const start = 0;
    const cdHit = (name, text, extra) => {
      const a = A[name];
      return L.add(name, { tag: "On cooldown", text, stance, score: perCost(a) + (extra || 0), facts: [dmgLine(a, unit)] });
    };
    cdHit("Mortal Strike", "Use every time it's ready.", 1000);
    cdHit("Bloodthirst", "Use every time it's ready.", 1000);
    cdHit("Whirlwind", "Use every time it's ready (hits up to 4 enemies).");
    if (c.has("Overpower")) {
      const op = A["Overpower"];
      L.add("Overpower", { tag: "When it lights up", stance, score: perCost(op),
        text: "Only after the target dodges" + (c.talent["Bloodthrill"] ? " or Bloodthrill procs" : "") + ". Cheap and can't be dodged.",
        facts: [dmgLine(op, unit), c.talent["Improved Overpower"] ? `Improved Overpower: +${fmt(talentNumber(c, "Improved Overpower"))}% crit chance on it` : null] });
    }
    const slam = c.rank("Slam");
    if (slam) {
      const imp = c.talent["Improved Slam"];
      const it = cdHit("Slam", imp ? "Use on cooldown: with Improved Slam it no longer delays your swing." :
        "Has a cast time that delays your next swing; better with Improved Slam.");
      if (it) it.facts.push(`Cooldown in Forever: ${sec(slam.cdMs - (imp ? 3000 : 0))}${imp ? " (Improved Slam −3 sec)" : ""}`);
    }
    cdHit("Spearing Strike", "On cooldown; much stronger against Giants, Dragonkin and mounted targets.");
    if (c.has("Shield Slam") && c.hold.shield) {
      const it = cdHit("Shield Slam", "Works in any stance (game data), so keep using it while you deal damage.", 900);
      if (it && c.talent["Bastion"]) it.facts.push(`Bastion: +${fmt(talentNumber(c, "Bastion"))}% damage with a shield`);
    }
    L.add("Victory Rush", { tag: "When it lights up", stance, score: 999, text: "Free: only for 20 sec after you kill something. Great while leveling.",
      facts: [dmgLine(A["Victory Rush"], unit) || "Costs no rage; also heals you for 10% of your health"] });
    L.sortFrom(start);
    // rage dump last
    const hs = A["Heroic Strike"];
    const swing = (c.R.white || []).find((w) => w.label === "Main hand");
    if (c.has("Heroic Strike")) {
      const net = hs && swing ? hs.expected - swing.perSwing : 0;
      L.add("Heroic Strike", { tag: "Rage dump", text: "Only with rage left over after the attacks above (it replaces your next swing).",
        facts: [hs && !hs.locked && swing ? `Adds ${fmt(net)} damage over a normal swing for ${fmt(hs.cost)} rage (${fmt(net / hs.cost, 1)} per rage)` : dmgLine(hs, unit),
          c.talent["Improved Heroic Strike"] ? `Improved Heroic Strike: −${fmt(talentNumber(c, "Improved Heroic Strike"))} rage` : null] });
    }

    // ---- Execute phase
    if (c.has("Execute")) {
      const ex = A["Execute"];
      L.section("Below 20% health: Execute phase", "The order changes: rage is worth more in Execute than almost anywhere else.");
      const pool = 30; // a typical rage pool when you press it
      const exPerRage = ex && !ex.locked && ex.expected ? (ex.expected + Math.max(0, pool - ex.cost) * ex.perRage) / Math.max(pool, ex.cost) : 0;
      const big = A["Mortal Strike"] && c.has("Mortal Strike") ? A["Mortal Strike"] : c.has("Bloodthirst") ? A["Bloodthirst"] : null;
      const bigPerRage = perCost(big);
      if (big && bigPerRage > exPerRage && exPerRage) {
        L.add(big.name, { tag: "Still on cooldown", text: `Keep using it: with your gear it beats Execute per rage.`, stance,
          facts: [`${big.name}: ${fmt(bigPerRage, 1)} damage per rage vs Execute ${fmt(exPerRage, 1)} (at ${pool} rage)`] });
      }
      L.add("Execute", { tag: "Spam", stance, text: "Every global cooldown. All your rage goes in: each extra point adds damage.",
        facts: [ex && !ex.locked ? `${fmt(ex.expected)} average + ${fmt(ex.perRage, 1)} per extra rage point · costs ${fmt(ex.cost)} rage` +
          (c.talent["Improved Execute"] ? ` (Improved Execute −${fmt(talentNumber(c, "Improved Execute"))})` : "") : dmgLine(ex, unit),
          exPerRage ? `About ${fmt(exPerRage, 1)} damage per rage at ${pool} rage` : null] });
      if (big && !(bigPerRage > exPerRage && exPerRage)) {
        L.add(big.name, { tag: "Skip", stance, text: "Put the rage into Execute instead.",
          facts: [exPerRage ? `${big.name} ${fmt(bigPerRage, 1)} per rage vs Execute ${fmt(exPerRage, 1)}` : null] });
      }
      if (c.has("Heroic Strike")) L.add("Heroic Strike", { tag: "Stop", text: "Don't: every rage point is worth more in Execute." });
    }

    // ---- big cooldowns
    L.section("Cooldowns", "Long cooldowns: line them up with each other and with the Execute phase.");
    L.add("Death Wish", { tag: "Cooldown", text: "On cooldown in long fights; otherwise save it for the Execute phase.",
      facts: [c.spell("Death Wish") ? `+${fmt(firstNumber(c.spell("Death Wish").desc))}% physical damage for 30 sec, ${sec(c.rank("Death Wish")?.cdMs || 180000)} cooldown` : null] });
    L.add("Recklessness", { tag: "Cooldown", text: "Once per fight: at the start of the Execute phase (Berserker Stance).",
      facts: [c.rank("Recklessness") ? `+100% crit for 15 sec, ${sec(c.rank("Recklessness").cdMs)} cooldown; you take 20% more damage` : null] });
    L.add("Bloodrage", { tag: "Cooldown", text: "For rage: at the pull and whenever you're short.",
      facts: [c.talent["Improved Bloodrage"] ? `Improved Bloodrage: +${fmt(talentNumber(c, "Improved Bloodrage"))}% rage from it` : "20 rage over 10 sec for some health"] });

    // ---- several targets
    L.section("Several targets", null);
    L.add("Sweeping Strikes", { tag: "First", stance, text: "Your next 5 hits also strike a second enemy." });
    L.add("Whirlwind", { tag: "On cooldown", stance: "berserker", text: "Up to 4 enemies (Berserker Stance)." });
    L.add("Cleave", { tag: "Rage dump", text: "Instead of Heroic Strike when 2+ enemies stand together." +
      (c.talent["Raging Blows"] ? " Raging Blows makes it 3 rage cheaper." : "") });
    L.add("Thunder Clap", { tag: "Optional", stance, text: "Slows their attacks; small damage." });
    // off-tank: free to deal damage now, but ready to take the boss
    if (spec === "prot" || c.hold.shield) {
      L.section("Off-tanking: when you have to take the boss", "Turn on Tank mode above to see the threat priority.");
      const tm = talentNumber(c, "Improved Tactical Mastery");
      L.add("Defensive Stance", { tag: "Swap", text: "Swap before you take the boss." +
        (tm ? ` Improved Tactical Mastery lets you keep up to ${fmt(tm)} more rage when you change stances.` : " Changing stance costs most of your rage."),
        facts: ["Defensive Stance: 10% less damage taken and dealt (game data)"] });
      L.add("Taunt", { tag: "Then", text: "Pull the boss to you (Defensive Stance)." });
      L.add("Revenge", { tag: "After that", text: "Back in Defensive Stance, Revenge and Shield Slam lead your threat." });
    }
    // the 31-point talents exclude each other in practice: don't suggest the other one
    L.later = L.later.filter((l) => !(["Mortal Strike", "Bloodthirst", "Shield Slam"].includes(l.name) &&
      ["Mortal Strike", "Bloodthirst", "Shield Slam"].some((n) => c.talent[n])));
    return L;
  }

  // learned talents that only work with one weapon setup: say whether they count with this one
  function weaponTalents(c, L, setup) {
    const ranks = app.liveRanks();
    const rows = [];
    c.flat.forEach((t, i) => {
      const r = ranks[i];
      if (!r) return;
      let need = holdNeed(t.needs);
      if (!need && /while a shield|with a shield|your shield/i.test(t.desc[r - 1])) need = "shield";
      if (need) rows.push({ t, r, ok: !!c.hold[need], need });
      else if (t.name === "Weaponmaster") rows.push({ t, r, ok: true, typed: true });
    });
    if (!rows.length) return;
    L.section("Your weapon talents", `Talents that depend on what you hold, checked against ${WEAPON_SETUPS[setup]}.`);
    for (const { t, r, ok, need, typed } of rows) {
      const mh = c.mh ? c.mh.name : null;
      L.add(t.name, { always: true, icon: t.icon, tag: ok ? "Counts" : "Wasted here",
        text: typed ? (mh ? `Bonus depends on your main-hand weapon type (${mh}).` : "Bonus depends on your main-hand weapon type: axe/polearm crit, mace/staff armor, sword extra swings.")
          : ok ? "Works with this setup." : `Needs ${NEED_TEXT[need]}: does nothing with ${WEAPON_SETUPS[setup]}.`,
        facts: [t.desc[r - 1].split("\n")[0]] });
    }
  }

  function warriorTank(c, L, A, unit) {
    const stance = "defensive";
    L.facts.push("Stance: Defensive Stance" + (c.talent["Defiance"] && c.hold.shield ? ` (Defiance: +${fmt(talentNumber(c, "Defiance"))}% threat with a shield)` : ""));
    if (c.hold.shield) {
      L.facts.push("Sword and board: the tankiest setup. Blocking (Shield Block, block chance), the shield's armor, Shield Slam and Shield Wall all need it.");
    } else {
      L.facts.push((c.hold.dual ? "Dual-wield" : "Two-hander") + " tank: more damage, so more threat from damage, but you take more: " +
        "no blocks, no Shield Slam, Shield Block or Shield Wall (they need a shield, game data), and Revenge only lights up after dodges and parries.");
      if (c.hold.dual) L.facts.push("Theory: while Heroic Strike is queued, your off-hand misses less, so keep one queued when rage allows.");
    }
    L.section("Threat priority", "Press the first one that's ready. The damage numbers come from your gear; extra threat noted where the game files hold it.");
    const threatLine = (name) => {
      const r = c.rank(name);
      const d = (c.spell(name) || {}).desc || "";
      if (r && r.threat) return `Bonus threat: ${fmt(r.threat)} (game data)`;
      if (/threat/i.test(d)) return "Extra threat on top of its damage (worked out by the server, not in the game files)";
      return null;
    };
    L.add("Shield Slam", { tag: "On cooldown", stance, text: "Biggest threat hit. Needs a shield.",
      facts: [dmgLine(A["Shield Slam"], unit), threatLine("Shield Slam")] });
    L.add("Revenge", { tag: "When it lights up", stance, text: (c.hold.shield ? "After you block, dodge or parry." : "After you dodge or parry (no blocks without a shield).") + " Cheap: use every time.",
      facts: [dmgLine(A["Revenge"], unit), threatLine("Revenge"),
        c.talent["Improved Revenge"] ? `Improved Revenge: +${fmt(talentNumber(c, "Improved Revenge"))}% damage` : null] });
    for (const name of ["Mortal Strike", "Bloodthirst"]) {
      L.add(name, { tag: "On cooldown", stance, text: "Works in Defensive Stance (game data): good threat from big damage.",
        facts: [dmgLine(A[name], unit)] });
    }
    const sunder = c.rank("Sunder Armor");
    L.add("Sunder Armor", { tag: "Build to 5, then filler", stance, text: "Stack it to 5 early (the raid's damage goes up), then use it as a filler.",
      facts: [sunder ? `−${fmt(buffNumber("Sunder Armor", c.level))} armor per stack, ${fmt(sunder.cost / 10)} rage` +
        (c.talent["Improved Sunder Armor"] ? ` (Improved Sunder Armor −${fmt(talentNumber(c, "Improved Sunder Armor"))})` : "") : null, threatLine("Sunder Armor")] });
    L.add("Shield Block", { tag: "On cooldown", stance, text: "Against physical hitters: fewer big hits and more Revenges.",
      facts: [c.talent["Shield Specialization"] ? `Shield Specialization: ${fmt(talentNumber(c, "Shield Specialization"))}% more block chance, rage when you block` : null] });
    L.add("Heroic Strike", { tag: "Rage dump", text: c.hold.shield ? "Only with spare rage (keep enough for Shield Slam and Revenge)." :
      "Your main rage dump without a shield; Cleave instead when you hold 2+ enemies.",
      facts: [dmgLine(A["Heroic Strike"], unit), threatLine("Heroic Strike")] });
    L.section("Keep up", null);
    L.add("Thunder Clap", { tag: "Keep up", stance, text: "Slows the boss's attacks (less damage to you).",
      facts: [c.spell("Thunder Clap") ? `${fmt(numberAfter(c.spell("Thunder Clap").desc, "attacks by"))}% slower attacks` : null,
        c.talent["Improved Thunder Clap"] ? `Improved Thunder Clap: −${fmt(talentNumber(c, "Improved Thunder Clap"))} rage` : null] });
    L.add("Demoralizing Shout", { tag: "Keep up", text: "Lowers the boss's attack power.", facts: [threatLine("Demoralizing Shout")] });
    L.add("Battle Shout", { tag: "Keep up", text: "Also gives a little threat on every enemy in combat with you." });
    L.add("Bloodrage", { tag: "At the pull", text: "Rage to start with." });
    L.section("When things go wrong", null);
    L.add("Taunt", { tag: "Lost aggro", stance, text: "Pulls the target back to you." });
    L.add("Mocking Blow", { tag: "Taunt on cooldown", stance: "battle", text: "Needs Battle Stance (game data): a second taunt if Taunt is resisted." });
    L.add("Shield Wall", { tag: "Emergency", stance, text: "60% less damage for 12 sec." });
    L.add("Last Stand", { tag: "Emergency", text: "30% more health for 20 sec." });
    return L;
  }

  // ------------------------------------------------------------ Hunter

  function hunter(c) {
    const L = list(c);
    const [bm, mm, sv] = c.treePts;
    const meleeTalents = ["Lacerating Strikes", "Strider Kick", "Predator's Edge", "Savage Strikes", "Expose Prey"].filter((n) => c.talent[n]);
    const auto = sv > Math.max(bm, mm) && meleeTalents.length >= 2 ? "melee" : "ranged";
    const style = state.prio.style === "auto" ? auto : state.prio.style;
    L.toggles.push({ key: "style", label: "Style", value: state.prio.style, auto,
      options: [["auto", `Auto (${auto})`], ["ranged", "Ranged"], ["melee", "Melee"]],
      help: "Ranged: shots and Auto Shot. Melee: Forever's Survival melee kit (Raptor Strike, Lacerate, Mongoose Bite, Strider Kick)." });
    const specName = bm >= mm && bm >= sv && bm > 0 ? "Beast Mastery" : mm >= sv && mm > 0 ? "Marksmanship" : sv > 0 ? "Survival" : "Hunter";
    L.title = `${specName} Hunter, ${style}`;
    L.facts.push(`Talents: ${bm} / ${mm} / ${sv}` + (meleeTalents.length ? ` · melee talents: ${meleeTalents.join(", ")}` : ""));
    if (c.gearKnown) {
      L.facts.push(style === "ranged" ? (c.ranged ? `Ranged weapon: ${c.ranged.name}` : "No ranged weapon equipped") :
        (c.mh ? `Melee weapon: ${c.mh.name}` : "No melee weapon equipped"));
    } else {
      L.facts.push("No gear picked: damage numbers need weapons (Gear & Stats tab).");
    }
    const A = c.res;
    const unit = "mana";
    const lone = c.talent["Lone Wolf"];

    L.section("Before the pull", null);
    if (style === "ranged") {
      L.add("Aspect of the Hawk", { tag: "Keep up", text: "Your ranged aspect.",
        facts: [c.spell("Aspect of the Hawk") ? `+${fmt(numberAfter(c.spell("Aspect of the Hawk").desc, "Attack Power by"))} ranged attack power at max rank` : null,
          c.talent["Deadly Aspects"] ? "Deadly Aspects: Auto Shot can proc +30% ranged attack speed while it's active" : null] });
    } else {
      L.add("Aspect of the Beast", { always: true, tag: "Keep up", text: "Melee attack power for a melee Hunter." +
        (c.spell("Aspect of the Beast") ? "" : " (The game files don't say at what level it's learned.)"),
        facts: [c.spell("Aspect of the Beast") ? `+${fmt(numberAfter(c.spell("Aspect of the Beast").desc, "Attack Power by"))} melee attack power` : null,
          c.talent["Deadly Aspects"] ? "Deadly Aspects: melee hits can proc extra melee attack speed while it's active" : null] });
    }
    L.add("Trueshot Aura", { tag: "Keep up", text: "Group ranged attack power; lasts 30 min." });
    if (lone) {
      L.add("Call Pet", { always: true, label: "No pet (Lone Wolf)", tag: "Talent", source: "data",
        text: "Leave your pet dismissed: Lone Wolf gives +20% damage only without an active pet." });
    } else {
      L.add("Call Pet", { always: true, tag: "Pet out", text: "Send the pet in first." + (c.talent["Focused Fire"] ? " Focused Fire: +2% damage for you and the pet while it's out." : "") });
    }
    L.add("Hunter's Mark", { tag: "Keep up", text: style === "ranged" ? "On the boss for the whole fight." : "On the target: Expose Prey procs need it.",
      facts: [c.spell("Hunter's Mark") ? `+${fmt(numberAfter(c.spell("Hunter's Mark").desc, "against that target by"))} ranged attack power for everyone attacking the target (max rank)` : null,
        c.talent["Expose Prey"] ? "Expose Prey: your attacks on a Marked target can allow Mongoose Bite" : null] });

    if (style === "ranged") {
      L.section("Shot priority", "Keep Auto Shot going and fit these in without delaying it. Shots that share a cooldown are compared with your numbers.");
      const aimed = A["Aimed Shot"], multi = A["Multi-Shot"];
      // Aimed Shot and Multi-Shot share a cooldown: pick the bigger hit
      if (c.has("Aimed Shot") || c.has("Multi-Shot")) {
        const useAimed = c.has("Aimed Shot") && perUse(aimed) >= perUse(multi);
        const pick = useAimed ? "Aimed Shot" : "Multi-Shot";
        const other = useAimed ? "Multi-Shot" : "Aimed Shot";
        const it = L.add(pick, { tag: "On cooldown", score: 1000 + perUse(A[pick]),
          text: `Shares its cooldown with ${other}: ${pick} hits harder for you.` + (useAimed ? " It has a cast time: start it right after an Auto Shot." : ""),
          facts: [dmgLine(A[pick], unit), c.has(other) && perUse(A[other]) ? `${other}: ${fmt(perUse(A[other]))} average (use it instead on 3+ targets)` : null,
            c.talent["Barrage"] ? `Barrage: +${fmt(talentNumber(c, "Barrage"))}% damage on Multi-Shot, Aimed Shot and Volley` : null,
            aimed && aimed.castMs ? `Aimed Shot cast: ${sec(aimed.castMs)}` : null] });
        if (!it && c.has(other)) L.add(other, { tag: "On cooldown", score: 1000 + perUse(A[other]), facts: [dmgLine(A[other], unit)] });
      }
      L.add("Sniper Shot", { tag: "On cooldown", score: 500 + perUse(A["Sniper Shot"]), text: "Long-range hit; also gives your next 3 shots +10 yards range.",
        facts: [dmgLine(A["Sniper Shot"], unit)] });
      // Arcane Shot and Summon Hawk share a cooldown
      const hawkTalents = ["Unleashed Fury", "Ferocity"].filter((n) => c.talent[n]);
      if (c.has("Summon Hawk") && hawkTalents.length) {
        L.add("Summon Hawk", { tag: "On cooldown", score: 400, source: "theory",
          text: `Shares its cooldown with Arcane Shot. Your ${hawkTalents.join(" and ")} make hawks stronger, so favour the hawk (2 at a time).`,
          facts: ["The hawk's damage isn't in the game files (it's a summoned creature), so this one is theory"] });
      }
      L.add("Arcane Shot", { tag: "On cooldown", score: 300 + perUse(A["Arcane Shot"]),
        text: "Instant." + (c.talent["Improved Arcane Shot"] ? ` Improved Arcane Shot: ${fmt(talentNumber(c, "Improved Arcane Shot"), 1)} sec shorter cooldown.` : ""),
        facts: [dmgLine(A["Arcane Shot"], unit)] });
      const ss = A["Serpent Sting"], arc = A["Arcane Shot"];
      if (c.has("Serpent Sting")) {
        const worth = perCost(ss) >= perCost(arc) * 0.8 || c.talent["Rapid Recuperation"] || c.talent["Improved Stings"];
        L.add("Serpent Sting", { tag: worth ? "Keep up" : "Optional", score: worth ? 800 : 100,
          text: worth ? "Keep it on the target." : "Only if the fight is long and you have mana to spare.",
          facts: [ss && !ss.locked ? `${fmt(ss.expected)} damage over ${sec(c.rank("Serpent Sting")?.durMs || 15000)} for ${fmt(ss.cost)} mana (${fmt(perCost(ss), 1)} per mana)` +
            (arc && arc.cost ? ` vs Arcane Shot ${fmt(perCost(arc), 1)} per mana` : "") : null,
            c.talent["Improved Stings"] ? `Improved Stings: +${fmt(talentNumber(c, "Improved Stings"))}% Serpent Sting damage` : null,
            c.talent["Rapid Recuperation"] ? "Rapid Recuperation: mana regeneration keeps going for 15 sec after you sting" : null] });
      }
      L.sortFrom(0);
      const auto = (c.R.white || []).find((w) => w.label === "Ranged");
      L.add("Auto Shot", { tag: "Always", score: 0, text: "Never let it stop; don't move or cast through it.",
        facts: [auto ? `${fmt(auto.dps, 1)} damage per second on its own` : null] });
    } else {
      L.section("Melee priority", "Press the first one that's ready.");
      const lac = A["Lacerate"];
      L.add("Lacerate", { tag: "Keep up", score: 900, text: "Keep the bleed on the target.",
        facts: [lac && !lac.locked ? `${fmt(lac.expected)} damage over ${sec(c.rank("Lacerate")?.durMs || 21000)}, ${fmt(lac.cost)} mana · bleed: armor doesn't reduce it` : dmgLine(lac, unit)] });
      L.add("Mongoose Bite", { tag: "When it lights up", score: 800 + perUse(A["Mongoose Bite"]),
        text: "After you dodge" + (c.talent["Expose Prey"] ? " or when Expose Prey procs" : "") + ".",
        facts: [dmgLine(A["Mongoose Bite"], unit), c.talent["Lacerating Strikes"] ? "Lacerating Strikes: it also adds a bleed worth 40% of its damage" : null] });
      L.add("Counterattack", { tag: "When it lights up", score: 700, text: "After you parry. Can't be dodged.", facts: [dmgLine(A["Counterattack"], unit)] });
      L.add("Strider Kick", { tag: "On cooldown", score: 600 + perUse(A["Strider Kick"]), text: "100% weapon damage.", facts: [dmgLine(A["Strider Kick"], unit)] });
      L.add("Raptor Strike", { tag: "On cooldown", score: 500 + perUse(A["Raptor Strike"]), text: "Every 6 sec (it goes on your next swing).",
        facts: [dmgLine(A["Raptor Strike"], unit), c.talent["Savage Strikes"] ? `Savage Strikes: +${fmt(talentNumber(c, "Savage Strikes"))}% crit on melee abilities` : null] });
      L.sortFrom(0);
      L.add("Serpent Sting", { tag: "At range", score: 0, text: "When you have to step out of melee." });
    }

    L.section("Cooldowns", null);
    L.add("Rapid Fire", { tag: "Cooldown", text: "On cooldown.",
      facts: [c.rank("Rapid Fire") ? `+${fmt(numberAfter(c.spell("Rapid Fire").desc, "speed by"))}% attack speed for 15 sec, ${sec(c.rank("Rapid Fire").cdMs - (talentNumber(c, "Rapid Killing") || 0) * 60000)} cooldown` +
        (c.talent["Rapid Killing"] ? " (Rapid Killing)" : "") : null] });
    if (!lone) L.add("Bestial Wrath", { tag: "Cooldown", text: "On cooldown: +50% pet damage for 18 sec." });
    if (!lone) L.add("Intimidation", { tag: "Cooldown", text: "Pet stun with a guaranteed crit; also useful threat for the pet." });

    L.section("Several targets", null);
    L.add("Multi-Shot", { tag: "On cooldown", text: "Instead of Aimed Shot when 3+ enemies stand together." });
    L.add("Volley", { tag: "Channel", text: "Big packs only (mana heavy)." });
    L.add("Explosive Trap", { tag: "Before the pull", text: "Drop it where the pack will stand." + (c.talent["Clever Traps"] ? " Clever Traps: +30% trap damage." : "") });
    return L;
  }

  // ------------------------------------------------------------ everyone else: from the numbers alone

  function generic(c) {
    const L = list(c);
    L.title = `${state.cls.name}: basic list`;
    L.facts.push("A full priority for this class is coming. Until then: your damage abilities by the numbers.");
    const unit = { 0: "mana", 1: "rage", 3: "energy" }[state.cls.power] || "mana";
    const ready = c.R.abilities.filter((a) => !a.locked && a.expected && !a.cc && !a.aoe);
    if (c.R.abilities.some((a) => a.locked === "Needs a weapon")) L.facts.push("Equip a weapon (Gear & Stats tab) to rank your weapon attacks too.");
    const dots = ready.filter((a) => a.dotExpected > a.directExpected);
    if (dots.length) {
      L.section("Keep up", "Damage over time: keep it on the target.");
      for (const a of dots) L.add(a.name, { tag: "Keep up", facts: [dmgLine(a, unit)] });
    }
    L.section("Then", state.cls.power === 0 ? "Ordered by damage per second of casting." : `Ordered by damage per ${unit}.`);
    for (const a of ready.filter((x) => !dots.includes(x))) {
      const score = state.cls.power === 0 ? a.expected / Math.max(1.5, (a.channelMs || a.castMs) / 1000) : perCost(a) * 100 + (a.cdMs ? 1000 : 0);
      L.add(a.name, { tag: a.cdMs ? "On cooldown" : "Filler", score, facts: [dmgLine(a, unit)] });
    }
    L.sortFrom(0);
    return L;
  }

  // ------------------------------------------------------------ data helpers

  function buffNumber(name, level) {
    let v = 0;
    for (const r of (KP.abilities.BUFFS || {})[name] || []) if (r.level <= level) v = r.value;
    return v;
  }
  // a talent's first number at the learned rank (from its own tooltip text, which uses the game's rank values)
  function talentNumber(c, name) {
    const i = c.flat.findIndex((t) => t.name === name);
    const r = i >= 0 ? app.liveRanks()[i] : 0;
    return r ? firstNumber(c.flat[i].desc[r - 1]) : null;
  }

  // ------------------------------------------------------------ drawing

  function iconStyle(node, fileId, size) {
    const n = KP.talents.icons[String(fileId)];
    if (n == null) return;
    const cols = KP.talents.iconCols;
    node.style.backgroundSize = `${cols * size}px auto`;
    node.style.backgroundPosition = `${-(n % cols) * size}px ${-Math.floor(n / cols) * size}px`;
  }

  function toggles(L) {
    const box = el("div", "prio-toggles");
    for (const t of L.toggles) {
      if (t.options) {
        const l = el("label", "pfield");
        const s = el("select");
        for (const [v, label] of t.options) { const o = el("option", null, label); o.value = v; s.append(o); }
        s.value = t.value;
        s.addEventListener("change", () => { state.prio[t.key] = s.value; app.changed(); });
        l.append(el("span", null, t.label), s);
        l.title = t.help;
        box.append(l);
      } else {
        const l = el("label", "pcheck prio-switch");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = t.on;
        cb.addEventListener("change", () => { state.prio[t.key] = cb.checked; app.changed(); });
        l.append(cb, el("span", null, t.label));
        l.title = t.help;
        box.append(l, el("span", "muted small", t.help));
      }
    }
    return box;
  }

  function draw(L) {
    const box = $("prio");
    box.textContent = "";
    const head = el("div", "prio-head");
    head.append(el("h2", null, L.title));
    for (const f of L.facts) head.append(el("p", "muted small", f));
    if (L.toggles.length) head.append(toggles(L));
    box.append(head);
    let n = 0;
    for (const s of L.sections) {
      if (!s.items.length) continue;
      const sec = el("section", "prio-sec");
      sec.append(el("h3", null, s.title));
      if (s.note) sec.append(el("p", "muted small", s.note));
      const ol = el("ol", "prio-list");
      for (const it of s.items) {
        n++;
        const li = el("li", "prio-item");
        const ic = el("span", "icon aicon");
        iconStyle(ic, it.icon, 32);
        const main = el("div", "prio-main");
        const title = el("div", "prio-title");
        title.append(el("strong", null, it.name));
        if (it.tag) title.append(el("span", "prio-tag", it.tag));
        if (it.source === "theory") title.append(el("span", "prio-tag theory", "theory"));
        main.append(title);
        if (it.text) main.append(el("div", "prio-text", it.text));
        for (const f of it.facts) main.append(el("div", "prio-fact", f));
        li.append(ic, main);
        ol.append(li);
      }
      sec.append(ol);
      box.append(sec);
    }
    if (L.stanceSkipped.length) {
      const s = el("section", "prio-sec");
      s.append(el("h3", null, "Not in this stance"));
      const p = el("p", "muted small");
      p.textContent = L.stanceSkipped.map((x) => `${x.name} (needs ${x.needs})`).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
      s.append(p);
      box.append(s);
    }
    if (L.later.length) {
      const s = el("section", "prio-sec");
      s.append(el("h3", null, "Not available right now"));
      s.append(el("p", "muted small", "These would join the list above (not learned yet, or not with this setup): " + L.later.map((x) => `${x.name} (${x.why})`).join(" · ")));
      box.append(s);
    }
    box.append(el("p", "muted small prio-foot", "Numbers: your character against the target in the panel, from Forever's game data " +
      "(damage, costs, cooldowns, stances, talent ranks). The groups and anything marked \"theory\" are general class knowledge. " +
      "Damage is an estimate (see the panel's notes)."));
  }

  function render() {
    if (!app.view || app.view() !== "priority" || !state.cls || !KP.spellbook) return;
    const c = character();
    const L = c.token === "WARRIOR" ? warrior(c) : c.token === "HUNTER" ? hunter(c) : generic(c);
    draw(L);
  }

  app.hooks.push(render);
  app.renderPriority = render;
  addEventListener("hashchange", () => { readHash(); render(); });
  readHash();
  render();
})();
