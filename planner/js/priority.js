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
    c.hold = { known: c.gearKnown, shield: c.shield, twoHand: c.twoHand, dual: c.dualWield, oneHand: !!(c.mh && !c.twoHand) };
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
  // Two-handers: 1 axe, 5 mace, 6 polearm, 8 sword, 10 staff.
  const ONE_HAND_BITS = (1 << 0) | (1 << 4) | (1 << 7) | (1 << 13) | (1 << 15);
  const TWO_HAND_BITS = (1 << 1) | (1 << 5) | (1 << 6) | (1 << 8) | (1 << 10);
  const OFF_HAND_WEAPON = 1 << 22; // inventory type 22
  function holdNeed(needs) {
    if (!needs) return null;
    if (needs.class === 4 && needs.subclassMask & (1 << 6)) return "shield";
    if (needs.invTypes & OFF_HAND_WEAPON) return "dual";
    if (needs.class === 2 && !(needs.subclassMask & ONE_HAND_BITS)) return "twoHand";
    if (needs.class === 2 && needs.subclassMask === 1 << 15) return "dagger";
    if (needs.class === 2 && !(needs.subclassMask & TWO_HAND_BITS)) return "oneHand";
    return null;
  }
  const NEED_TEXT = { shield: "a shield (Sword and board)", dual: "an off-hand weapon (Dual wield)", twoHand: "a two-handed weapon",
    oneHand: "a one-handed weapon", dagger: "a dagger in the main hand" };
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
    const setup = weaponSetup(c, L, spec === "prot" ? "shield" : spec === "fury" ? "dw" : "2h", ["2h", "dw", "shield"]);
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

  // Weapons: from the gear unless the player picks a setup (any setup can tank or deal damage).
  // guess = the setup to assume without gear; allowed = the setups this class can use.
  function weaponSetup(c, L, guess, allowed) {
    const fromGear = c.twoHand ? "2h" : c.dualWield ? "dw" : c.shield ? "shield" : null;
    const auto = fromGear && allowed.includes(fromGear) ? fromGear : guess;
    const chosen = allowed.includes(state.prio.weapons) ? state.prio.weapons : "auto";
    const setup = chosen !== "auto" ? chosen : auto;
    c.hold = { known: true, shield: setup === "shield", twoHand: setup === "2h", dual: setup === "dw", oneHand: setup !== "2h" };
    L.toggles.push({ key: "weapons", label: "Weapons", value: chosen,
      options: [["auto", `Auto (${WEAPON_SETUPS[auto]}${fromGear ? "" : ", guessed"})`], ...allowed.map((k) => [k, WEAPON_SETUPS[k]])],
      help: "What you hold changes what you can press: shield abilities need a shield, and some talents only work with one setup." });
    L.facts.push(`Weapons: ${WEAPON_SETUPS[setup]}` + (chosen === "auto" && !fromGear ? " (guessed from your talents; pick gear on Gear & Stats for real numbers)" : ""));
    if (chosen !== "auto" && fromGear && fromGear !== setup) {
      L.facts.push(`Your equipped gear is ${WEAPON_SETUPS[fromGear]}: the list follows your choice, but damage numbers still use what you wear.`);
    }
    if (!c.gearKnown) L.facts.push("No gear picked: damage numbers need a weapon (Gear & Stats tab).");
    return setup;
  }

  // ------------------------------------------------------------ Paladin

  function paladin(c) {
    const L = list(c);
    const [holy, prot, ret] = c.treePts;
    const spec = c.talent["Holy Shield"] || (prot > holy && prot > ret) ? "prot"
      : c.talent["Seal of Command"] || c.talent["Twist of Light"] || (ret >= holy && ret > 0) ? "ret" : "holy";
    const tank = state.prio.tank != null ? state.prio.tank : spec === "prot";
    L.toggles.push({ key: "tank", label: "Tank mode", on: tank,
      help: "On: you hold the boss (Righteous Fury, threat first). Off: you're free to deal damage." });
    L.title = `${{ prot: "Protection", ret: "Retribution", holy: "Holy" }[spec]} Paladin${tank ? ", tanking" : ""}`;
    L.facts.push(`Talents: ${holy} / ${prot} / ${ret}` + (c.talent["Holy Shield"] ? " · Holy Shield" : "") +
      (c.talent["Seal of Command"] ? " · Seal of Command" : "") + (c.talent["Light's Vigil"] ? " · Light's Vigil" : ""));
    const setup = weaponSetup(c, L, spec === "ret" ? "2h" : "shield", ["shield", "2h"]);
    weaponTalents(c, L, setup);
    const A = c.res;
    const unit = "mana";
    const desc = (n) => (c.spell(n) || {}).desc || "";
    if (spec === "holy" && !tank) return healer(c, "Holy Paladin", `Talents: ${holy} / ${prot} / ${ret}`);

    if (tank) {
      L.facts.push("No taunt in the Paladin spellbook (game data): you hold threat with damage, so open strong.");
      L.section("Keep up", null);
      L.add("Righteous Fury", { tag: "Keep up", text: "Always on while you tank (lasts 30 min).",
        facts: [`+${fmt(numberAfter(desc("Righteous Fury"), "Holy attacks by"))}% threat from your Holy damage (game data)`,
          c.talent["Improved Righteous Fury"] ? `Improved Righteous Fury: ${fmt(talentNumber(c, "Improved Righteous Fury"))}% less damage taken` : null] });
      L.add("Seal of Fury", { tag: "Keep up", text: "Your tanking Seal: Holy damage on every hit" + (c.hold.shield ? ", and with a shield each hit also gives you an absorb shield." : "."),
        facts: [`+${fmt(numberAfter(desc("Seal of Fury"), "additional"))} Holy damage per hit (max rank)`,
          c.talent["Improved Seal of Fury"] ? "Improved Seal of Fury: mana back when the shield is used up" : null] });
      L.add("Devotion Aura", { tag: "Keep up", text: "Armor for you and your party.", facts: [`+${fmt(numberAfter(desc("Devotion Aura"), "Gives"))} armor (max rank)`] });
      L.add("Blessing of Kings", { tag: "On yourself", text: "Or Might if another Paladin gives Kings." });
      L.section("Threat priority", "Press the first one that's ready. Holy damage is boosted by Righteous Fury, so your Holy abilities lead.");
      L.add("Holy Shield", { tag: "Keep up", text: "Refresh it as it runs out: more blocks, and every block hits back.",
        facts: [`+${fmt(numberAfter(desc("Holy Shield"), "block by"))}% block chance for 10 sec, ${fmt(numberAfter(desc("Holy Shield"), "deals"))} Holy damage per block at max rank, +20% threat on that damage`,
          c.talent["Redoubt"] ? "Redoubt: more blocks still" : null, c.talent["Reckoning"] ? "Reckoning: blocks can give you extra attacks" : null] });
      L.add("Hammer of the Righteous", { tag: "On cooldown", text: "Holy damage to your target and nearby enemies. Needs a one-handed axe, mace or sword.",
        facts: ["Holy damage = 3 × your main-hand weapon's damage per second (game data; the planner doesn't put a number on it yet)",
          c.rank("Hammer of the Righteous") ? `${sec(c.rank("Hammer of the Righteous").cdMs)} cooldown, shared with Crusader Strike` : null] });
      L.add("Holy Strike", { tag: "On cooldown", text: "Weapon damage plus Holy damage.",
        facts: [dmgLine(A["Holy Strike"], unit), c.talent["Iron Creed"] ? `Iron Creed: +${fmt(talentNumber(c, "Iron Creed"))}% threat, and with Righteous Fury 10% less damage taken for 6 sec` : null] });
      L.add("Judgement", { tag: "On cooldown", text: "Judges your Seal on the target (the Seal stays).",
        facts: [`${sec((c.rank("Judgement") || {}).cdMs || 10000)} cooldown` + (c.talent["Improved Judgement"] ? ` (Improved Judgement −${fmt(talentNumber(c, "Improved Judgement"))} sec)` : "")] });
      L.add("Consecration", { tag: "Packs", text: "Holy damage on the ground: best when you hold several enemies (mana heavy).",
        facts: [c.rank("Consecration") ? `${fmt(c.rank("Consecration").cost)} mana, ${sec(c.rank("Consecration").cdMs)} cooldown` : null,
          c.talent["Consecrated Ground"] ? "Consecrated Ground: +10% Holy damage against the first 4 enemies in it" : null] });
      L.add("Exorcism", { tag: "Undead / Demons", text: "Only against Undead and Demons.", facts: [dmgLine(A["Exorcism"], unit)] });
      L.add("Hammer of Wrath", { tag: "Below 20%", text: "Only when the target is at 20% health or less.", facts: [dmgLine(A["Hammer of Wrath"], unit)] });
      L.section("Mana", "Paladin tanks run on mana: these keep it going.");
      L.add("Blessing of Wisdom", { tag: "If no one else", text: "Mana every 5 sec." });
      if (c.talent["Shield Specialization"] && c.hold.shield) L.add("Shield Specialization", { always: true, icon: talentIcon(c, "Shield Specialization"), tag: "Talent", text: "Your blocks give back 4% of your maximum mana." });
      L.section("When things go wrong", null);
      L.add("Templar's Bulwark", { tag: "Emergency", text: "An absorb shield as big as your health for 8 sec." });
      L.add("Lay on Hands", { tag: "Emergency", text: "Heals you to full (uses all your mana)." });
      L.add("Divine Protection", { tag: "Last resort", text: "Immune for 8 sec, but you can't attack: the boss may leave you." });
      L.add("Divine Shield", { tag: "Last resort", text: "Immune for 12 sec but deal 50% less damage (game data): expect to lose threat." });
      return L;
    }

    // dealing damage (Retribution, or a Protection Paladin off-tanking)
    L.section("Keep up", null);
    if (c.has("Seal of Command") && c.hold.twoHand) {
      L.add("Seal of Command", { tag: "Keep up", text: "Your damage Seal with a slow two-hander: extra Holy hits worth 70% of your weapon damage.",
        facts: [dmgLine(A["Seal of Command"], unit)] });
    } else {
      L.add("Seal of Righteousness", { tag: "Keep up", text: "Holy damage on every hit; slower weapons hit harder with it." });
    }
    if (c.talent["Twist of Light"]) {
      L.add("Twist of Light", { always: true, icon: talentIcon(c, "Twist of Light"), tag: "Talent",
        text: "Swapping between Command, Righteousness, Fury and Justice leaves an Echo of the old Seal: change Seals instead of only refreshing." });
    }
    L.add("Blessing of Might", { tag: "On yourself", text: "Melee attack power (or Kings if another Paladin gives Might).",
      facts: [`+${fmt(buffNumber("Blessing of Might", c.level))} attack power at your level`] });
    L.add("Retribution Aura", { tag: "Aura", text: "If no other Paladin runs an aura, otherwise Devotion." });
    L.section("Attack priority", "Press the first one that's ready.");
    L.add("Judgement", { tag: "On cooldown", text: "Judge your Seal, then keep the Seal up.",
      facts: [`${sec((c.rank("Judgement") || {}).cdMs || 10000)} cooldown` + (c.talent["Improved Judgement"] ? ` (Improved Judgement −${fmt(talentNumber(c, "Improved Judgement"))} sec)` : ""),
        c.talent["Sanctified Judgement"] ? "Sanctified Judgement: 60% of the Seal's mana back" : null] });
    L.add("Holy Strike", { tag: "On cooldown", text: "Weapon damage plus Holy damage.",
      facts: [dmgLine(A["Holy Strike"], unit), c.talent["Sacred Arbiter"] ? "Sacred Arbiter: +20% damage and it refreshes your Judgements" : null] });
    L.add("Hammer of the Righteous", { tag: "On cooldown", text: "With a one-handed axe, mace or sword.",
      facts: ["Holy damage = 3 × your main-hand weapon's damage per second (game data)"] });
    L.add("Hammer of Wrath", { tag: "Below 20%", text: "Only when the target is at 20% health or less." +
      (c.talent["Instrument of Law"] ? " Instrument of Law: 1 sec faster cast." : ""), facts: [dmgLine(A["Hammer of Wrath"], unit)] });
    L.add("Exorcism", { tag: "Undead / Demons", text: "Only against Undead and Demons.", facts: [dmgLine(A["Exorcism"], unit)] });
    L.add("Consecration", { tag: "Packs", text: "Several enemies only (mana heavy)." + (c.talent["Holy Conduit"] ? " Holy Conduit makes it 40% cheaper." : "") });
    if (spec === "prot" || c.hold.shield) {
      L.section("Off-tanking: when you have to take the boss", "Turn on Tank mode above to see the threat priority.");
      L.add("Righteous Fury", { tag: "Before you tank", text: "Turn it on before you take the boss." +
        (c.talent["Instrument of Law"] ? " Without it you make 20% less threat (Instrument of Law), so leave it off while you only deal damage." : ""), });
      L.add("Seal of Fury", { tag: "Swap", text: "Swap to your tanking Seal." });
      L.add("Holy Shield", { tag: "Then", text: "Up before the boss reaches you." });
    }
    return L;
  }

  // ------------------------------------------------------------ Druid

  function druid(c) {
    const L = list(c);
    const [bal, feral, resto] = c.treePts;
    const isFeral = feral > Math.max(bal, resto);
    const tank = state.prio.tank != null ? state.prio.tank : isFeral && !!(c.talent["Natural Reaction"] || c.talent["Thick Hide"]);
    L.toggles.push({ key: "tank", label: "Tank mode", on: tank,
      help: "On: Bear Form tank (threat first). Off: Cat Form damage, e.g. an off-tank between pulls." });
    if (!isFeral && !tank) return resto > bal ? healer(c, "Restoration Druid", `Talents: ${bal} / ${feral} / ${resto}`) : generic(c);
    L.title = `Feral Druid, ${tank ? "Bear Form tank" : "Cat Form damage"}`;
    L.facts.push(`Talents: ${bal} / ${feral} / ${resto}`);
    L.facts.push("Form attacks use Classic's base-attack rule (the game files don't hold it); everything else is Forever's data.");
    const desc = (n) => (c.spell(n) || {}).desc || "";
    const cost = (n, unit) => {
      const a = c.res[n];
      if (a && !a.locked && a.expected) return dmgLine(a, unit); // damage, cost and damage per point of rage/energy
      const r = c.rank(n);
      return r ? `${fmt(r.cost / (unit === "rage" ? 10 : 1))} ${unit}` + (r.cdMs ? `, ${sec(r.cdMs)} cooldown` : "") : null;
    };
    const ff = c.spell("Faerie Fire");
    const ffInForm = ff && ff.stances && (ff.stances & (tank ? (1 << 4) | (1 << 7) : 1));
    if (tank) {
      const form = c.has("Dire Bear Form") ? "Dire Bear Form" : "Bear Form";
      L.section("Keep up", null);
      L.add(form, { tag: "Form", text: "Your tanking form.", facts: [desc(form).split(".")[0]] });
      L.add("Faerie Fire", { tag: "Keep up", text: (ffInForm ? "Castable in Bear Form in Forever (game data). " : "") + "Less armor on the boss for everyone.",
        facts: [`−${fmt(buffNumber("Faerie Fire", c.level))} armor at your level`] });
      L.add("Demoralizing Roar", { tag: "Keep up", text: "Lowers the boss's attack power.",
        facts: [cost("Demoralizing Roar", "rage"), c.rank("Demoralizing Roar") && c.rank("Demoralizing Roar").threat ? `Bonus threat: ${fmt(c.rank("Demoralizing Roar").threat)} (game data)` : null] });
      L.section("Threat priority", "Press the first one that's ready.");
      L.add("Primal Bite", { tag: "On cooldown", text: "Weapon damage plus a high amount of threat." + (c.talent["Berserk"] ? " Berserk: no cooldown and it hits 3 targets while active." : ""),
        facts: [cost("Primal Bite", "rage"), c.talent["Ferocity"] ? `Ferocity: −${fmt(talentNumber(c, "Ferocity"))} rage` : null] });
      L.add("Lacerate", { tag: "Stack to 5", text: "Build 5 stacks, then refresh before it runs out. Causes a high amount of threat.",
        facts: [cost("Lacerate", "rage"), c.talent["Shredding Attacks"] ? `Shredding Attacks: −${fmt(numberAfter(c.flat.find((t) => t.name === "Shredding Attacks").desc[(c.talent["Shredding Attacks"] || 1) - 1], "Lacerate ability by"))} rage` : null] });
      L.add("Maul", { tag: "Rage dump", text: "On your next swing, whenever you have spare rage.",
        facts: [cost("Maul", "rage"), c.talent["Ferocity"] ? `Ferocity: −${fmt(talentNumber(c, "Ferocity"))} rage` : null] });
      L.add("Swipe", { tag: "2+ enemies", text: "Hits nearby enemies." + (c.talent["Feral Instinct"] ? ` Feral Instinct: +${fmt(talentNumber(c, "Feral Instinct"))}% damage.` : ""), facts: [cost("Swipe", "rage")] });
      L.section("Rage", "Where your rage comes from besides getting hit.");
      L.add("Enrage", { tag: "On cooldown", text: "Rage now and over 10 sec, but lowers your armor for the duration (game data).", facts: [desc("Enrage").split(".").slice(0, 2).join(".") + "."] });
      for (const n of ["Furor", "Natural Reaction", "Blood Frenzy"]) {
        if (c.talent[n]) L.add(n, { always: true, icon: talentIcon(c, n), tag: "Talent", text: c.flat.find((t) => t.name === n).desc[c.talent[n] - 1].split(".")[0] + "." });
      }
      L.section("When things go wrong", null);
      L.add("Growl", { tag: "Lost aggro", text: "Taunts the target back." });
      L.add("Challenging Roar", { tag: "Many loose", text: "Every enemy nearby attacks you for 6 sec." });
      L.add("Frenzied Regeneration", { tag: "Emergency", text: "Turns rage into health for 10 sec." });
      L.add("Bash", { tag: "Interrupt", text: "Stuns the target for 4 sec." + (c.talent["Brutal Impact"] ? " Brutal Impact: longer stun, shorter cooldown." : "") });
      return L;
    }
    L.section("Keep up", null);
    L.add("Cat Form", { tag: "Form", text: "Your damage form.", facts: [desc("Cat Form").split(".")[0]] });
    L.add("Faerie Fire", { tag: "If no other Druid", text: (ffInForm ? "Castable in Cat Form in Forever (game data). " : "") + "Less armor on the boss.",
      facts: [`−${fmt(buffNumber("Faerie Fire", c.level))} armor at your level`] });
    L.add("Rake", { tag: "Keep up", text: "Bleed: armor doesn't reduce it." + (c.talent["Rend and Tear"] ? ` Rend and Tear: +${fmt(talentNumber(c, "Rend and Tear"))}% damage on bleeding targets, so keep one up.` : ""),
      facts: [cost("Rake", "energy")] });
    L.section("Opener", null);
    L.add("Ravage", { tag: "From Prowl", text: "Prowl, get behind the target, open with Ravage." });
    L.section("Combo points", "Build to 5 points, then spend.");
    L.add("Shred", { tag: "Builder", text: "Your builder from behind." + (c.talent["Shredding Attacks"] ? ` Shredding Attacks: −${fmt(talentNumber(c, "Shredding Attacks"))} energy.` : ""), facts: [cost("Shred", "energy")] });
    L.add("Claw", { tag: "Builder", text: "When you can't get behind the target.", facts: [cost("Claw", "energy")] });
    L.add("Rip", { tag: "Finisher", text: "At 5 points when it isn't on the target: a bleed that scales with attack power.", facts: [cost("Rip", "energy")] });
    L.add("Ferocious Bite", { tag: "Finisher", text: "At 5 points while Rip is up.",
      facts: [cost("Ferocious Bite", "energy"), `Each extra point of energy adds ${fmt(numberAfter(desc("Ferocious Bite"), "energy into"), 1)} damage (game data)`] });
    L.section("Cooldowns", null);
    if (c.talent["Shifting Power"]) {
      L.add("Shifting Power", { always: true, icon: talentIcon(c, "Shifting Power"), tag: "Out of energy",
        text: "Turns mana into energy." + (c.talent["Improved Shifting Power"] ? " Improved Shifting Power: shorter cooldown." : "") });
    }
    if (isFeral) {
      L.section("Off-tanking: when you have to take the boss", "Turn on Tank mode above to see the threat priority.");
      L.add(c.has("Dire Bear Form") ? "Dire Bear Form" : "Bear Form", { tag: "Swap", text: "Shift to Bear Form." + (c.talent["Furor"] ? " Furor gives you 10 rage when you do." : "") });
      L.add("Growl", { tag: "Then", text: "Taunt the boss." });
    }
    return L;
  }

  // ------------------------------------------------------------ Rogue

  function rogue(c) {
    const L = list(c);
    const [ass, com, sub] = c.treePts;
    L.title = `${ass >= com && ass >= sub && ass ? "Assassination" : com >= sub && com ? "Combat" : sub ? "Subtlety" : ""} Rogue`.trim();
    L.facts.push(`Talents: ${ass} / ${com} / ${sub}` + ["Mutilate", "Seal Fate", "Blade Flurry", "Adrenaline Rush", "Hemorrhage", "Preparation"]
      .filter((n) => c.talent[n]).map((n) => " · " + n).join(""));
    // main-hand weapon type: Backstab, Mutilate and Ambush need a dagger (game data)
    const fromGear = c.mh ? (c.mh.subclass === 15 ? "dagger" : "other") : null;
    const guess = c.talent["Mutilate"] || c.talent["Puncturing Wounds"] || c.talent["Opportunity"] || sub > com ? "dagger" : "other";
    const auto = fromGear || guess;
    const chosen = ["dagger", "other"].includes(state.prio.weapons) ? state.prio.weapons : "auto";
    const setup = chosen === "auto" ? auto : chosen;
    const NAMES = { dagger: "Daggers", other: "Swords, maces or fists" };
    c.hold = { known: true, dagger: setup === "dagger", oneHand: true, dual: !!c.dualWield || !c.gearKnown };
    L.toggles.push({ key: "weapons", label: "Main hand", value: chosen,
      options: [["auto", `Auto (${NAMES[auto]}${fromGear ? "" : ", guessed"})`], ["dagger", NAMES.dagger], ["other", NAMES.other]],
      help: "Backstab, Mutilate and Ambush need a dagger in the main hand (game data); Sinister Strike works with anything." });
    L.facts.push(`Main hand: ${NAMES[setup]}` + (chosen === "auto" && !fromGear ? " (guessed from your talents)" : ""));
    if (chosen !== "auto" && fromGear && fromGear !== setup) L.facts.push(`You're wearing ${NAMES[fromGear].toLowerCase()}: damage numbers use what you wear.`);
    if (!c.gearKnown) L.facts.push("No gear picked: damage numbers need weapons (Gear & Stats tab).");
    const A = c.res, unit = "energy";
    const rot = c.R.rotation || {};
    const desc = (n) => (c.spell(n) || {}).desc || "";

    L.section("Opener", "From Stealth.");
    L.add("Premeditation", { tag: "Before you open", text: "Two free combo points." });
    L.add("Ambush", { tag: "Opener", text: "From behind, with a dagger." + (c.talent["Initiative"] ? " Initiative adds an extra combo point." : ""),
      facts: [dmgLine(A["Ambush"], unit), c.talent["Improved Ambush"] ? `Improved Ambush: +${fmt(talentNumber(c, "Improved Ambush"))}% crit chance` : null] });
    L.add("Cheap Shot", { tag: "Opener", text: "A stun and 2 combo points (good when you can't get behind)." });
    L.add("Garrote", { tag: "Opener", text: "A bleed from behind" + (c.talent["Dirty Deeds"] ? " (Dirty Deeds: from any side, cheaper)." : "."), facts: [dmgLine(A["Garrote"], unit)] });

    L.section("Keep up", null);
    const snd = c.rank("Slice and Dice");
    if (snd) {
      const haste = buffNumber("Slice and Dice", c.level);
      const worth = rot.sndPoints;
      L.add("Slice and Dice", { tag: worth === 0 ? "Not worth it yet" : "Keep up",
        text: worth ? `Refresh it at ${worth} combo point${worth > 1 ? "s" : ""}: the best length for your current numbers.` :
          worth === 0 ? "With your gear your white hits are too small for it to pay off: put the points into Eviscerate instead. It wins once you have more attack power or buffs." :
            "Keep it up between Eviscerates.",
        facts: [`+${haste}% attack speed (game data), ${sec(snd.durMs)} plus ${sec(snd.durPerPoint || 3000)} per combo point` +
          (c.talent["Improved Slice and Dice"] ? ` (Improved Slice and Dice: +${fmt(talentNumber(c, "Improved Slice and Dice"))}% longer)` : "")] });
    }
    if (!(c.ctx.buffs || {})["Sunder Armor"]) {
      L.add("Expose Armor", { tag: "If no Warrior sunders", text: "5 points on the boss when no Warrior keeps Sunder Armor up.",
        facts: [`−${fmt(buffNumber("Expose Armor", c.level))} armor per combo point (−${fmt(buffNumber("Expose Armor", c.level) * 5)} at 5, game data)`,
          "In Classic it doesn't stack with Sunder Armor (check in game)"] });
    }
    if (c.talent["Serrated Blades"] || c.talent["Thousand Cuts"] || c.talent["Hemorrhage"]) {
      L.add("Rupture", { tag: "Keep up", text: "Your talents favour it: keep the bleed going.",
        facts: [dmgLine(A["Rupture"], unit), c.talent["Serrated Blades"] ? "Serrated Blades: +30% Rupture damage" : null,
          c.talent["Thousand Cuts"] ? "Thousand Cuts: each Rupture tick makes your next Hemorrhage/Backstab cheaper" : null] });
    }
    L.add("Venom", { tag: "Keep up", text: "Finisher: +30% poison damage and +10% poison chance while it lasts." });

    L.section("Combo point builders", "Use the best one you can (order = damage per energy with your gear).");
    const start = 0;
    for (const [n, note] of [["Mutilate", "Needs daggers in both hands; 2 combo points."], ["Backstab", "From behind, with a dagger."],
      ["Sinister Strike", "Works with any weapon, from any side."], ["Hemorrhage", "Also makes your Rupture hit harder."],
      ["Ghostly Strike", "On cooldown when you have the energy (also +15% dodge)."]]) {
      const a = A[n];
      L.add(n, { tag: n === rot.builder ? "Your main builder" : n === "Ghostly Strike" ? "On cooldown" : "Builder", text: note,
        score: perCost(a) + (n === rot.builder ? 1000 : 0), facts: [dmgLine(a, unit)] });
    }
    L.sortFrom(start);
    const cpTalents = [["Seal Fate", "crits add an extra combo point"], ["Ruthlessness", "finishers can leave a combo point behind"],
      ["Relentless Strikes", "finishers can give 25 energy back"], ["Puncturing Wounds", "Backstab can add an extra point"]]
      .filter(([n]) => c.talent[n]).map(([n, t]) => `${n}: ${t}`);
    L.section("Finisher", "At 5 combo points.");
    const ev = A["Eviscerate"];
    L.add("Eviscerate", { tag: "At 5 points", text: "Your damage finisher.",
      facts: [dmgLine(ev, unit), ...cpTalents,
        "Its attack power part is an estimate: the game files don't hold it (we use 3% of attack power per point)"] });

    L.section("Cooldowns", null);
    L.add("Adrenaline Rush", { tag: "Cooldown", text: "Double energy for 15 sec: line it up with Slice and Dice up." });
    L.add("Blade Flurry", { tag: "Cooldown", text: "+20% attack speed and a second target for 15 sec." });
    L.add("Cold Blood", { tag: "Cooldown", text: "Before a 5-point Eviscerate (or a Mutilate): a guaranteed crit." });
    L.add("Preparation", { tag: "Cooldown", text: "Resets your other cooldowns: use it after the first round of them." });
    L.add("Vanish", { tag: "Situational", text: "Drops threat" + (c.hold.dagger ? ", and lets you Ambush again." : ".") });
    L.section("Threat", null);
    L.add("Feint", { tag: "When threat is high", text: "Lowers your threat without breaking your rotation." });
    L.facts.push("Poisons are items, not spells, so they're not in the planner's numbers yet (they add real damage in game).");
    return L;
  }

  // ------------------------------------------------------------ Shaman

  function shaman(c) {
    const [ele, enh, resto] = c.treePts;
    const spec = c.talent["Stormstrike"] || (enh > ele && enh > resto) ? "enh" : resto > ele ? "resto" : "ele";
    if (spec === "resto") return healer(c, "Restoration Shaman", `Talents: ${ele} / ${enh} / ${resto}`);
    const L = list(c);
    const A = c.res, unit = "mana";
    const rot = c.R.rotation || {};
    L.title = spec === "enh" ? "Enhancement Shaman" : "Elemental Shaman";
    L.facts.push(`Talents: ${ele} / ${enh} / ${resto}` + ["Stormstrike", "Rage of the Farseer", "Lava Burst", "Elemental Mastery"]
      .filter((n) => c.talent[n]).map((n) => " · " + n).join(""));
    if (!c.gearKnown) L.facts.push("No gear picked: damage numbers need a weapon (Gear & Stats tab).");
    const desc = (n) => (c.spell(n) || {}).desc || "";
    if (spec === "enh") {
      L.section("Keep up", null);
      L.add("Windfury Weapon", { tag: "Keep up", text: "Your main-hand imbue: chances of extra attacks on every hit.",
        facts: [desc("Windfury Weapon").split(".").slice(1, 2).join(".").trim() + " (game data)",
          c.talent["Elemental Weapons"] ? `Elemental Weapons: Windfury effect +${fmt(talentNumber(c, "Elemental Weapons") ? numberAfter(c.flat.find((t) => t.name === "Elemental Weapons").desc[c.talent["Elemental Weapons"] - 1], "Windfury Weapon effect by") : 0)}%` : null,
          "On the main hand it turns off the Windfury Totem's benefit for you (game data)"] });
      L.add("Strength of Earth Totem", { tag: "Totem", text: "Strength for your melee group.", facts: [`+${fmt(buffNumber("Strength of Earth", c.level))} Strength at your level`] });
      L.add("Grace of Air Totem", { tag: "Totem", text: "Agility for your melee group.", facts: [`+${fmt(buffNumber("Grace of Air", c.level))} Agility at your level`] });
      L.add("Windfury Totem", { tag: "Totem", text: "For the rest of your melee group (your own Windfury Weapon replaces it for you)." });
      L.section("Attack priority", "Press the first one that's ready.");
      L.add("Stormstrike", { tag: "On cooldown", score: 1000, text: "Weapon damage, and your next Earth Shock, Lightning Bolt or Chain Lightning hits 20% harder.",
        facts: [dmgLine(A["Stormstrike"], unit), c.talent["Improved Stormstrike"] ? "Improved Stormstrike: 50% mana regeneration while casting for 15 sec after it" : null] });
      const shocks = ["Earth Shock", "Flame Shock", "Frost Shock"].filter((n) => c.has(n));
      const bestShock = shocks.map((n) => [n, A[n]]).filter(([, a]) => a && !a.locked && a.expected).sort((x, y) => y[1].expected - x[1].expected)[0];
      for (const n of shocks) {
        L.add(n, { tag: bestShock && bestShock[0] === n ? "On cooldown" : "Situational", score: bestShock && bestShock[0] === n ? 900 : 100,
          text: n === "Earth Shock" ? "Right after Stormstrike for the +20%. Also your interrupt." : n === "Flame Shock" ? "Fire damage plus a burn over 12 sec." : "Slows the target.",
          facts: [dmgLine(A[n], unit), "Shocks share one cooldown: the planner uses whichever does the most for you" +
            (c.talent["Shamanistic Focus"] ? ` (Shamanistic Focus: ${fmt(talentNumber(c, "Shamanistic Focus"))}% cheaper)` : "")] });
      }
      L.add("Lightning Bolt", { tag: "With Maelstrom", score: 50, text: "When Maelstrom Weapon has made it fast and cheap (5 stacks: instant).",
        facts: [c.talent["Maelstrom Weapon"] ? "Maelstrom Weapon: melee hits make your next Lightning Bolt faster and cheaper (game data)" : null] });
      L.sortFrom(0);
      L.section("Cooldowns", null);
      L.add("Rage of the Farseer", { tag: "Cooldown", text: "On cooldown: +30% attack speed for 25 sec, every 3 min." });
    } else {
      L.section("Keep up", null);
      L.add("Flame Shock", { tag: "Keep up", text: "Its burn is worth keeping on the target, and Lava Burst hits harder while it's there.",
        facts: [dmgLine(A["Flame Shock"], unit)] });
      L.section("Spell priority", "Press the first one that's ready.");
      L.add("Lava Burst", { tag: "On cooldown", score: 1000, text: "Your big hit; +20% while Flame Shock is on the target.", facts: [dmgLine(A["Lava Burst"], unit)] });
      L.add("Chain Lightning", { tag: "On cooldown", score: 500, text: "On cooldown if your mana allows; best with several targets.", facts: [dmgLine(A["Chain Lightning"], unit)] });
      L.add("Lightning Bolt", { tag: "Filler", score: 100, text: "Your filler between cooldowns.", facts: [dmgLine(A["Lightning Bolt"], unit)] });
      L.sortFrom(0);
      L.section("Cooldowns", null);
      L.add("Elemental Mastery", { tag: "Cooldown", text: "Before a Lava Burst or Lightning Bolt." });
    }
    if (rot.note) L.facts.push("Estimate: " + rot.note.split(". ")[0] + ".");
    return L;
  }

  // ------------------------------------------------------------ Priest

  function priest(c) {
    const [disc, holy, shadow] = c.treePts;
    if (shadow > Math.max(disc, holy) || c.talent["Shadowform"]) {
      const L = generic(c);
      L.title = "Shadow Priest";
      L.facts.unshift(`Talents: ${disc} / ${holy} / ${shadow}`);
      L.section("Keep up", null);
      L.add("Shadowform", { tag: "Always", text: "Stay in it: more Shadow damage and less damage taken (you can't cast Holy spells in it)." });
      L.add("Vampiric Embrace", { tag: "Keep up", text: "Heals your group from your Shadow damage." });
      L.add("Inner Fire", { tag: "Keep up", text: "Armor and attack power for you." });
      return L;
    }
    return healer(c, disc > holy ? "Discipline Priest" : "Holy Priest", `Talents: ${disc} / ${holy} / ${shadow}`);
  }

  // ------------------------------------------------------------ healers (any class)

  const HEALER_TOOLS = {
    PALADIN: { emergency: ["Holy Shock", "Divine Favor", "Lay on Hands", "Divine Shield"], mana: ["Blessing of Wisdom", "Light's Vigil"],
      group: [] },
    DRUID: { emergency: ["Swiftmend", "Nature's Swiftness", "Barkskin"], mana: ["Innervate"], group: ["Wild Growth", "Tranquility"] },
    SHAMAN: { emergency: ["Nature's Swiftness", "Riptide"], mana: ["Mana Tide Totem", "Water Shield", "Mana Spring Totem"],
      group: ["Chain Heal", "Healing Stream Totem"] },
    PRIEST: { emergency: ["Power Word: Shield", "Penance", "Desperate Prayer", "Power Infusion"], mana: ["Inner Focus"],
      group: ["Prayer of Healing", "Holy Nova", "Prayer of Mending"] },
  };

  function healer(c, title, talentsLine) {
    const L = list(c);
    L.title = title;
    L.facts.push(talentsLine);
    if (!c.gearKnown) L.facts.push("No gear picked: healing numbers use your base stats only (Gear & Stats tab for real numbers).");
    const H = c.R.healing;
    const baseMana = (KP.classes.rules.baseMana[c.token] || [])[c.level - 1] || 0;
    const manaOf = (a) => a.cost || (a.costPct ? (a.costPct * baseMana) / 100 : 0);
    const crit = Math.min(100, c.R.S.spellCrit) / 100;
    if (H) L.facts.push(`Estimate: ${fmt(H.hps, 1)} healing per second on one target, sustained over a 3-minute fight (no overhealing).`);
    const tools = HEALER_TOOLS[c.token] || { emergency: [], mana: [], group: [] };
    // what the estimate keeps up or uses on cooldown
    const steady = (H ? H.parts : []).filter((p) => /kept up|on cooldown|absorb/.test(p.name));
    if (steady.length) {
      L.section("Keep up and use on cooldown", "From the healing estimate: worth their time and mana for you.");
      for (const p of steady) {
        const name = p.name.replace(/ \(.*$/, "");
        L.add(name, { tag: /kept up/.test(p.name) ? "Keep up" : /absorb/.test(p.name) ? "Shield" : "On cooldown",
          facts: [`${fmt(p.dps, 1)} healing per second in the estimate`] });
      }
    }
    // every single-target heal, by healing per mana (what decides most of a healer's casts)
    const heals = c.R.abilities.filter((a) => !a.locked && a.heal > 10 && !tools.group.includes(a.name) && !(a.cdMs >= 60000));
    const main = H && H.parts.find((p) => /main heal|% of casts/.test(p.name));
    L.section("Your heals by the numbers", "Most efficient first. When mana is tight, lean on the top of this list; when someone is dropping fast, the biggest heal wins.");
    for (const a of heals) {
      const amount = a.heal * (a.name === "Binding Heal" ? 0.5 : 1) * (1 + crit * 0.5); // Binding Heal: the target's half
      const mana = manaOf(a);
      const cast = Math.max(1.5, (a.channelMs || a.castMs) / 1000);
      L.add(a.name, { tag: main && main.name.startsWith(a.name) ? "Main heal" : a.cdMs ? "Cooldown" : "Heal", score: mana ? amount / mana : 0,
        facts: [`${fmt(amount)} average healing${a.name === "Binding Heal" ? " on the target (you get the same)" : ""} (crits counted) · ${fmt(mana)} mana · ${fmt(mana ? amount / mana : 0, 1)} per mana · ` +
          `${fmt(amount / cast)} per second of casting` + (a.cdMs ? ` · ${sec(a.cdMs)} cooldown` : "")] });
    }
    L.sortFrom(0);
    if (tools.emergency.length) {
      L.section("When someone is about to die", null);
      for (const n of tools.emergency) L.add(n, { tag: "Emergency", text: firstSentence((c.spell(n) || {}).desc) });
    }
    if (tools.mana.length) {
      L.section("Mana", null);
      for (const n of tools.mana) L.add(n, { tag: "Mana", text: firstSentence((c.spell(n) || {}).desc) });
    }
    if (tools.group.length) {
      L.section("Group healing", "Not in the one-target estimate: use these when several people are hurt.");
      for (const n of tools.group) L.add(n, { tag: "Group", text: firstSentence((c.spell(n) || {}).desc) });
    }
    return L;
  }
  const firstSentence = (d) => ((d || "").split(/(?<=\.)\s/)[0] || "").trim();

  function talentIcon(c, name) {
    const t = c.flat.find((x) => x.name === name);
    return t && t.icon;
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
    const auto = KP.calc.hunterStyle({ ...c.ctx, style: "auto" }); // same rule as the damage estimate
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
    const starved = (c.R.rotation && c.R.rotation.starved) || [];
    if (starved.length) {
      L.facts.push(`Mana: over a 3-minute fight your mana can't pay for every ${starved.join(" / ")}. ` +
        "Skip the lowest damage per mana first (see the numbers below), or bring more Intellect / mana regen.");
    }

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
      L.add("Immolation Trap", { tag: "Optional", score: 0, text: "Usable in combat in Forever: worth it when the boss is tanked close enough to reach its feet.",
        facts: [dmgLine(A["Immolation Trap"], unit)] });
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
      const trap = A["Immolation Trap"];
      L.add("Immolation Trap", { tag: "On cooldown", score: 650 + perUse(trap),
        text: "Drop it at your feet, under the boss: Forever lets you lay traps in combat.",
        facts: [trap && !trap.locked ? `${fmt(trap.expected)} Fire damage over ${sec(trap.durMs || 15000)}, ${fmt(trap.cost)} mana, ${sec(trap.cdMs)} cooldown` +
          (trap.mods && trap.mods.length ? ` (${trap.mods.join(", ")})` : "") : dmgLine(trap, unit),
          "In Classic traps only worked out of combat; Forever's game data drops that rule"] });
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
    for (const r of (KP.abilities.BUFFS || {})[name] || []) if (r.level <= level) v = Math.max(v, r.value);
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
    const rules = { WARRIOR: warrior, HUNTER: hunter, PALADIN: paladin, DRUID: druid, ROGUE: rogue, SHAMAN: shaman, PRIEST: priest };
    const L = (rules[c.token] || generic)(c);
    draw(L);
  }

  app.hooks.push(render);
  app.renderPriority = render;
  addEventListener("hashchange", () => { readHash(); render(); });
  readHash();
  render();
})();
