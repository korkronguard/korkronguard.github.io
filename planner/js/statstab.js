// Kor'kron Planner: the Stat Weights tab. For each of this character's two numbers (staying alive and damage, or healing),
// the stats that count: how much of each it has, what 1 more point adds, how that compares with its main stat, and how far
// a cap is. The addon's Stats tab shows the same in game for the character you're playing (its UI/Stats.lua). The math
// and the list are calc.js's (statWeights, statList); this file draws them.
(function () {
  "use strict";

  const KP = window.KP;
  const app = KP.app;
  const state = app.state;
  const { STAT_TEXT } = KP.itemInfo;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const NAMES = { ...STAT_TEXT, armor: "Armor", bonusArmor: "Bonus Armor", mainHand: "Main-hand weapon", offHand: "Off-hand weapon", ranged: "Ranged weapon" };
  const WEAPON = { mainHand: true, offHand: true, ranged: true };
  // every stat an item can have that the math could count: not resistances or professions
  const KEYS = ["armor", ...Object.keys(STAT_TEXT).filter((k) => !/Resist|^resistAll$|^cooking$/.test(k))];
  const NO_PARRY = ["MAGE", "PRIEST", "WARLOCK", "DRUID"]; // classes that never parry: parry rating isn't listed for them
  // a section per number: its heading, the character's own total in words, what a point adds in words, what the number is
  const SECTION = {
    survival: { title: "Staying alive", total: "your effective health is", unit: "effective health",
      about: "Effective health is how much damage you can take before you die: your health, and what your armor, dodge, parry and block " +
        "keep off you, measured against a raid boss." },
    damage: { title: "Damage", total: "you do", after: "a second", unit: "damage a second",
      about: "Your damage a second against the target chosen on the right: the planner's own estimate, the same number as on the other tabs." },
    healing: { title: "Healing", total: "you heal", after: "a second", unit: "healing a second",
      about: "Your healing a second on one target, as much as your mana keeps up over a fight: the planner's own estimate." },
  };

  // "1,759", "61.3": a whole number with its thousands apart, a small one with a decimal
  const amount = (x) => (x < 100 ? Number(x.toFixed(1)) : Math.round(x)).toLocaleString("en-US");
  // "+31", "+1.4", "+0.61", "+0.027": two figures for small numbers, so a point's worth still shows
  const worth = (x) => {
    const a = Math.abs(x);
    if (a < 0.0005) return null;
    return (x < 0 ? "−" : "+") + (a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : String(Number(a.toPrecision(2))));
  };
  const pct = (x, d = 1) => Number(x.toFixed(d)).toString();

  // "47 more, then nothing" for the nearest turn of a stat's worth, "capped: 12 to spare" past one; "" when none is in reach
  function coming(turn) {
    if (!turn) return "";
    if (turn.spare != null) return `capped: ${Math.round(turn.spare)} to spare`;
    const first = turn.turns[0];
    return first ? `${Math.round(first.at)} more, then ${worth(first.worth) || "nothing"}` : "";
  }
  // the same in a sentence, for the line's hover text
  function comingLine(turn) {
    if (turn.spare != null) return `More adds nothing: you have ${Math.round(turn.spare)} more than you need.`;
    const [first, second] = turn.turns;
    if (!first) return null;
    return `That holds for the next ${Math.round(first.at)} points, then each adds ${worth(first.worth) || "nothing"}` +
      (second ? ` for ${Math.round(second.at) - Math.round(first.at)} more, then ${worth(second.worth) || "nothing"}` : "") + ".";
  }
  // what hit has to reach against the target
  function hitLine(W) {
    const caps = KP.calc.hitCaps(W.ctx), S = W.base.R.S;
    if (W.spells) return `Against this target your spells stop missing at ${pct(caps.spell)}% hit (1% always miss). You have ${pct(S.spellHit)}%.`;
    return `Against this target your abilities stop missing at ${pct(caps.melee)}% hit` +
      (S.oh ? `, your white swings with two weapons at ${pct(caps.dualWhite)}%` : "") + `. You have ${pct(S.hit)}%.`;
  }

  // a line's hover text: the stat in full sentences
  function about(W, section, row) {
    const s = SECTION[section.kind], name = NAMES[row.key] || row.key;
    const out = [`${WEAPON[row.key] ? "Each 1 more damage a second on it" : "1 more point"} adds ${worth(row.worth)} ${s.unit}.`];
    const chance = row.chance == null ? "" : row.key === "crit" ? `; your ${W.spells ? "spell " : ""}crit chance is ${pct(row.chance, 2)}%`
      : `; with your talents that's ${pct(row.chance, 2)}% ${W.spells ? "spell " : ""}hit`;
    out.push(`You have ${amount(row.amount)}${WEAPON[row.key] ? " damage a second on it" : ""}${chance}.`);
    if (row.same != null) out.push(`That's worth as much ${s.unit} as ${pct(row.same, 2)} ${NAMES[row.main]}.`);
    if (row.key === "armor" || row.key === "bonusArmor") out.push("Armor comes in hundreds on an item, so it adds up.");
    const line = row.turn && comingLine(row.turn);
    if (line) out.push(line);
    if (row.key === "hit") out.push(hitLine(W));
    return `${name}. ${out.join(" ")}`;
  }

  function table(W, section) {
    const s = SECTION[section.kind];
    const box = el("div", "stat-sec");
    // against an elite a Warrior's damage counts their own Sunder Armor (calc.js ownSunder): said here, because the number is
    // so much higher than against a normal enemy
    const sunder = section.kind === "damage" && KP.calc.ownSunder(W.ctx);
    const h = el("h3", null, `${s.title}: ${s.total} ${amount(section.total)}${s.after ? " " + s.after : ""}` +
      (sunder ? `, with your Sunder Armor at ${sunder.stacks} stacks` : ""));
    h.title = s.about + (sunder ? ` Against an elite this counts your own Sunder Armor: ${sunder.stacks} stacks from the start of the fight, ` +
      "then kept up, its rage paid out of this number. A normal enemy's number counts none: it dies before the stacks pay for themselves." : "");
    h.classList.add("hint-u");
    box.append(h);
    const t = el("table", "stat-table");
    const head = el("tr");
    for (const [text, cls] of [["Stat"], ["You have", "num"], ["+1 adds", "num"], ["Same worth as"], ["Until a cap"]]) head.append(el("th", cls, text));
    const thead = el("thead");
    thead.append(head);
    const body = el("tbody");
    for (const row of section.rows) {
      const tr = el("tr");
      tr.title = about(W, section, row);
      const have = amount(row.amount) + (WEAPON[row.key] ? " a sec" : row.chance != null ? ` (${pct(row.chance)}%)` : "");
      tr.append(el("td", "stat-name", NAMES[row.key] || row.key), el("td", "num", have), el("td", "num stat-adds", worth(row.worth)),
        el("td", "muted", row.same != null ? `${pct(row.same, 2)} ${NAMES[row.main]}` : ""), el("td", "stat-cap", coming(row.turn)));
      body.append(tr);
    }
    t.append(thead, body);
    const wrap = el("div", "lab-scroll");
    wrap.append(t);
    box.append(wrap);
    return box;
  }

  function render() {
    if (!app.view || app.view() !== "stats" || !state.cls || !KP.calc) return;
    const box = $("statsBox");
    const kit = app.gearKit;
    const frag = document.createDocumentFragment();
    const head = el("div", "prio-head");
    head.append(el("h2", null, "What each stat is worth to you"));
    frag.append(head);
    if (!kit.items()) {
      frag.append(el("p", "muted", "Loading items…"));
      box.textContent = "";
      box.append(frag);
      return;
    }
    const role = kit.bisRole();
    const ctx = app.ctx();
    if (role === "tank") ctx.tank = true; // a Druid tanks in Bear Form
    const W = KP.calc.statWeights(ctx, role, KEYS.filter((k) => !(k === "parry" && NO_PARRY.includes(state.cls.token))));
    const sections = KP.calc.statList(W);
    head.append(el("p", "muted", "Worked out for this character as it stands: its level, race and talents, the gear picked on the Gear & Stats tab, " +
      "and the target and buffs chosen on the right."));
    const pick = el("label", "pfield stat-role");
    pick.append(el("span", null, "Judged for"), kit.roleSelect("What the stats are judged for", render));
    head.append(pick);
    if (!ctx.worn.length) {
      frag.append(el("p", "small lab-warn", "No gear picked: these are for a character wearing nothing. Pick items on the Gear & Stats tab, or press Equip BiS there."));
    } else if (!(W.base.d > 0) && role !== "heal") {
      frag.append(el("p", "small lab-warn", "No damage to measure: pick a weapon on the Gear & Stats tab."));
    }
    for (const section of sections) frag.append(table(W, section));
    frag.append(el("p", "muted small prio-foot", "Hover a line for more. Each number is this character's damage, healing or effective health with a " +
      "little more of the stat on (25 points; 300 armor), less without, per point, in a fight of the same length: the measure Equip BiS uses, " +
      "and the addon's item tooltips and bag arrows. A stat that adds next to nothing beside the others is left out. Procs, \"Use:\" effects " +
      "and set bonuses aren't counted. In game, the Kor'kron Planner addon's Stats tab shows the same for the character you're playing."));
    box.textContent = "";
    box.append(frag);
  }

  // the list takes 50-300 ms: changes that come quickly (dragging the level slider) draw it once they stop
  let timer = 0;
  function soon() {
    if (!app.view || app.view() !== "stats") return;
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  }

  app.hooks.push(soon);
  app.renderStats = render;
  addEventListener("hashchange", soon);
  render();
})();
