// Kor'kron Planner: the Abilities tab. A spreadsheet-style table of every class ability with this character's numbers:
// one hit, the average per use (misses, dodges, crits), the total on the chosen number of targets, cost, damage per
// point of cost and per second of casting. A row opens to show which talents change that ability and the result of
// every combination of them (each at 0 or all its points; the other talents stay as in the build), the damage by
// number of targets, and for a stacking bleed (Lacerate) by stack. Talent abilities the build hasn't taken are worked
// out as if it had; a Druid's abilities each in the form they need (rage in Bear Form, energy in Cat Form).
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
  const fmt = (v, d = 0) => (v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const fmtPct = (v) => (v > 0 ? "+" : "") + fmt(v, Math.abs(v) < 10 ? 1 : 0) + "%";
  const sec = (ms) => fmt(ms / 1000, ms % 1000 ? 1 : 0) + " sec";
  const POWER = { 0: "mana", 1: "rage", 3: "energy" };
  const SCHOOL = { 1: "Physical", 2: "Holy", 4: "Fire", 8: "Nature", 16: "Frost", 20: "Frostfire", 32: "Shadow", 64: "Arcane" };
  // "on your next swing" attacks: they replace a normal swing, so they add their damage minus that swing's
  const NEXT_SWING = ["Heroic Strike", "Maul", "Cleave", "Raptor Strike"];
  const MAX_PICK = 6;          // talents in the combinations at once (2^6 = 64 rows)
  const TARGET_CHIPS = [1, 2, 3, 4, 5, 10];
  const MAX_TARGETS = 20;
  const NO_AP = ["MAGE", "PRIEST", "WARLOCK"];
  const SPELLS = ["PALADIN", "SHAMAN", "DRUID", "PRIEST", "MAGE", "WARLOCK"];
  const HEALERS = ["PALADIN", "SHAMAN", "DRUID", "PRIEST"];

  // ------------------------------------------------------------ settings (in the link)

  state.lab = state.lab || { targets: 1, ap: null, sp: null, healing: null, shape: {} };
  app.encoders.push(() => {
    const L = state.lab;
    let s = "";
    if (L.targets > 1) s += "&nt=" + L.targets;
    if (L.ap != null) s += "&xa=" + L.ap;
    if (L.sp != null) s += "&xs=" + L.sp;
    if (L.healing != null) s += "&xh=" + L.healing;
    // stance / form switches that aren't Auto: "&sh=stance.berserker_prowl.off"
    const sh = Object.entries(L.shape || {}).filter(([, v]) => v && v !== "auto").map(([k, v]) => k + "." + v).join("_");
    if (sh) s += "&sh=" + sh;
    return s;
  });
  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    const num = (k) => { const v = parseInt(p.get(k), 10); return isNaN(v) || v < 0 ? null : v; };
    const shape = {};
    for (const part of (p.get("sh") || "").split("_")) { const [k, v] = part.split("."); if (k && v) shape[k] = v; }
    state.lab = { targets: Math.max(1, Math.min(MAX_TARGETS, num("nt") || 1)), ap: num("xa"), sp: num("xs"), healing: num("xh"), shape };
  }

  // ------------------------------------------------------------ stances and forms

  // The switches per class (the game's own stances and forms: KP.abilities.STANCES). Auto works each ability out in
  // a stance or form it can be used in. A switch only shows what's learned at this level.
  const learnedShape = (name) => {
    const s = (((KP.abilities.STANCES || {})[state.cls.token]) || []).find((x) => x.name === name);
    if (!s) return false;
    if (s.talent) { const i = app.flat().findIndex((t) => t.id === s.talent); return i >= 0 && !!app.liveRanks()[i]; }
    return s.level <= state.level;
  };
  function shapeSwitches() {
    const tok = state.cls.token;
    const out = [];
    if (tok === "WARRIOR") {
      const opts = [["auto", `Auto (${STANCE_LABEL[warriorDefault()]} first)`], ["battle", "Battle"]];
      if (learnedShape("Defensive Stance")) opts.push(["defensive", "Defensive"]);
      if (learnedShape("Berserker Stance")) opts.push(["berserker", "Berserker"]);
      out.push({ key: "stance", label: "Stance", opts, help: "Battle: no change. Defensive: −10% damage dealt and taken, more threat. " +
        "Berserker: +3% crit, +10% damage taken (game data). Abilities that need another stance are locked." });
    }
    if (tok === "DRUID") {
      const opts = [["auto", "Auto (each in its form)"], ["caster", "Caster"]];
      if (learnedShape("Cat Form")) opts.push(["cat", "Cat"]);
      if (learnedShape("Bear Form")) opts.push(["bear", learnedShape("Dire Bear Form") ? "Dire Bear" : "Bear"]);
      if (learnedShape("Moonkin Form")) opts.push(["moonkin", "Moonkin"]);
      out.push({ key: "form", label: "Form", opts, help: "Your form changes attack power, armor and which talents work (Sharpened Claws, " +
        "Predatory Strikes, Heart of the Wild only in Cat or Bear Form). Abilities of other forms are locked." });
      if (learnedShape("Prowl")) out.push({ key: "prowl", label: "Prowl", opts: [["auto", "Auto (openers from Prowl)"], ["on", "Prowling"], ["off", "Not prowling"]],
        help: "Ravage and Pounce only work from Prowl (game data)." });
    }
    if (tok === "ROGUE" && learnedShape("Stealth")) {
      out.push({ key: "stealth", label: "Stealth", opts: [["auto", "Auto (openers from Stealth)"], ["on", "In Stealth"], ["off", "Not in Stealth"]],
        help: "Ambush, Garrote and Cheap Shot only work from Stealth (game data)." });
    }
    if (tok === "PRIEST" && learnedShape("Shadowform")) {
      out.push({ key: "shadowform", label: "Shadowform", opts: [["auto", "On (you have it)"], ["off", "Off"]],
        help: "Shadowform: +Shadow damage, cheaper Shadow spells, less physical damage taken; no Holy spells or Holy talents in it (game data)." });
    }
    if (tok === "HUNTER") {
      out.push({ key: "aspect", label: "Aspect", opts: [["auto", "Auto (Hawk for ranged)"], ["hawk", "Aspect of the Hawk"], ["none", "None"]],
        help: "Aspect of the Hawk adds ranged attack power (rank for your level)." });
    }
    return out;
  }
  const STANCE_LABEL = { battle: "Battle Stance", defensive: "Defensive Stance", berserker: "Berserker Stance" };
  // the Warrior's main stance (calc's rule, shared with the estimates and builds): tank -> Defensive, Fury -> Berserker,
  // else Battle
  const warriorDefault = () => KP.calc.warriorStance(app.ctx());
  const setting = (key) => ((state.lab.shape || {})[key]) || "auto";
  const bookOf = (ab) => (((KP.spellbook || {})[state.cls.token] || []).find((b) => b.name === ab.name)) || {};
  // what the math needs to know about the stance or form one ability is worked out in (ctx fields), and its name
  function shapeFor(ab) {
    const tok = state.cls.token;
    const book = bookOf(ab);
    const o = {};
    let label = null;
    if (tok === "WARRIOR") {
      let st = setting("stance");
      if (st === "auto") {
        const ok = (s) => (s === "battle" || learnedShape(STANCE_LABEL[s])) && (!book.stances || KP.calc.inMask(book.stances, KP.calc.STANCE_FORM[s]));
        st = [warriorDefault(), "battle", "berserker", "defensive"].find(ok) || warriorDefault();
      }
      o.stance = st;
      label = STANCE_LABEL[st];
    }
    if (tok === "DRUID") {
      let f = setting("form");
      if (f === "auto") {
        const p = ab.ranks[0].powerType;
        f = p === 1 ? "bear" : p === 3 ? "cat" : learnedShape("Moonkin Form") && KP.calc.inMask(book.stances || 0, 31) ? "moonkin" : "caster";
      }
      o.form = f === "caster" ? "none" : f;
      label = { bear: learnedShape("Dire Bear Form") ? "Dire Bear Form" : "Bear Form", cat: "Cat Form", moonkin: "Moonkin Form" }[f] || null;
      const pr = setting("prowl");
      if (pr !== "auto") o.prowl = pr === "on";
      if (book.stealthOnly && pr !== "off" && f === "cat") label = (label ? label + ", " : "") + "Prowl";
    }
    if (tok === "ROGUE") {
      const s = setting("stealth");
      if (s !== "auto") o.stealth = s === "on";
      if (book.stealthOnly && s !== "off") label = "Stealth";
    }
    if (tok === "PRIEST" && setting("shadowform") === "off") o.shadowform = false;
    else if (tok === "PRIEST" && learnedShape("Shadowform")) o.shadowform = true;
    if (tok === "HUNTER" && setting("aspect") !== "auto") o.aspect = setting("aspect");
    // the row tag: only where Auto picks per ability (a chosen stance is in the toolbar already)
    const auto = tok === "WARRIOR" ? setting("stance") === "auto" : tok === "DRUID" ? setting("form") === "auto" : true;
    const opener = (tok === "ROGUE" || tok === "DRUID") && book.stealthOnly && label && /Stealth|Prowl/.test(label);
    return { o, label, tag: auto ? label : opener ? (tok === "ROGUE" ? "Stealth" : "Prowl") : null };
  }
  // the same for the side panel's stats: the switches that are set (a Warrior on Auto shows its usual stance)
  app.labShape = () => {
    if (!state.cls) return {};
    const tok = state.cls.token, o = {};
    if (tok === "WARRIOR") o.stance = setting("stance") === "auto" ? warriorDefault() : setting("stance");
    if (tok === "DRUID" && setting("form") !== "auto") o.form = setting("form") === "caster" ? "none" : setting("form");
    if (tok === "PRIEST" && setting("shadowform") === "off") o.shadowform = false;
    if (tok === "HUNTER" && setting("aspect") !== "auto") o.aspect = setting("aspect");
    return o;
  };

  // on-page choices (not in the link)
  const open = new Set();   // "<class>:<ability>" rows that are open
  const picked = {};        // "<class>:<ability>" -> talent indexes in its combinations (the player's choice)
  let sort = { key: null, dir: -1 };
  const keyOf = (ab) => state.cls.token + ":" + ab.name;

  // ------------------------------------------------------------ the math

  const abilities = () => KP.abilities[state.cls.token] || [];
  const isDruid = () => state.cls.token === "DRUID";
  // the talent that teaches an ability (Mortal Strike, Primal Bite...)
  const grantIndex = (ab) => (ab.talent ? app.flat().findIndex((t) => t.id === ab.talent) : -1);
  const withRank = (ranks, i, r) => { const x = ranks.slice(); x[i] = r; return x; };

  function override() {
    const L = state.lab, o = {};
    if (L.ap != null) o.ap = L.ap;
    if (L.sp != null) o.sp = L.sp;
    if (L.healing != null) o.healing = L.healing;
    return Object.keys(o).length ? o : undefined;
  }
  // the character as the math sees it, with the stance / form fields (shape.o) for one ability
  function ctxFor(ranks, n, shape) {
    const c = app.ctx(ranks);
    c.targets = n;
    Object.assign(c, (shape && shape.o) || {});
    c.override = override();
    return c;
  }

  // Every ability's result for these talent ranks and number of targets (null where there's nothing to count),
  // each in its own stance or form, talent abilities as if learned. `only` = ability indexes to work out.
  function evaluate(ranks, n, only) {
    const list = abilities();
    const out = new Array(list.length).fill(null);
    const groups = new Map();
    list.forEach((ab, i) => {
      if (only && !only.includes(i)) return;
      const g = grantIndex(ab);
      const force = g >= 0 && !ranks[g] ? g : -1;
      const shape = shapeFor(ab);
      const key = JSON.stringify(shape.o) + "|" + force;
      if (!groups.has(key)) groups.set(key, { shape, force, idx: [] });
      groups.get(key).idx.push(i);
    });
    for (const g of groups.values()) {
      const r = g.force >= 0 ? withRank(ranks, g.force, 1) : ranks;
      const { results } = KP.calc.abilityResults(ctxFor(r, n, g.shape), g.idx);
      for (const i of g.idx) out[i] = results[i];
    }
    return out;
  }

  const usable = (r) => r && !r.locked;
  const healAvg = (r) => r.heal * (1 + Math.min(100, r.critChance) / 100 * ((r.healCritMult || 1.5) - 1));
  const isHealing = (r) => !(r.expected > 0) && r.heal > 0;
  const critMult = (r) => (isHealing(r) ? r.healCritMult || 1.5 : r.critMult || 2);
  // a placeholder number (Swiftmend's heal is 1 in the files: the server works it out from your HoT)
  const placeholder = (r) => usable(r) && Math.max(r.expected || 0, r.heal || 0) < 2;
  const valueOf = (r) => (!usable(r) ? 0 : isHealing(r) ? healAvg(r) : r.expected);
  // mana costs given as a share of base mana; a helper "rank" with no cost (Holy Nova's heal) takes the cost of the
  // spell you cast at that level
  function costOf(r) {
    if (r.cost) return r.cost;
    if (r.costPct) {
      const base = (KP.classes.rules.baseMana[state.cls.token] || [])[state.level - 1] || 0;
      return Math.round(base * r.costPct / 100);
    }
    const twin = ((r.ability && r.ability.ranks) || []).find((x) => x !== r.rank && x.level === r.rank.level && x.cost);
    return twin ? (twin.powerType === 1 ? twin.cost / 10 : twin.cost) : 0;
  }
  const channelMs = (r) => r.channelMs || 0;

  // The numbers in a table row. r = result on the chosen targets, one = on one target.
  function metrics(r, one) {
    if (!usable(r) || !usable(one) || placeholder(one)) return null;
    const heal = isHealing(r);
    const hit = heal ? one.heal : (one.dmin + one.dmax) / 2 + one.dot;
    const avg = valueOf(one), total = valueOf(r);
    const cost = costOf(r);
    const timeMs = Math.max(r.rank.gcdMs || 0, channelMs(r), r.castMs || 0);
    return { heal, hit, avg, total, hits: r.hits || 1, cost, power: POWER[r.powerType] || "", perCost: cost ? total / cost : null,
      perSec: timeMs ? total / (timeMs / 1000) : null, timeMs };
  }

  // the numbers that tell whether a talent changes an ability
  const KEYS = ["expected", "heal", "cost", "castMs", "cdMs", "critChance", "durMs", "dot"];
  function differs(a, b) {
    if (!usable(a) || !usable(b)) return usable(a) !== usable(b);
    const near = (x, y) => Math.abs((x || 0) - (y || 0)) <= 1e-6 * Math.max(1, Math.abs(x || 0));
    return KEYS.some((k) => !near(a[k], b[k])) || !near(a.stack && a.stack.weaponHit, b.stack && b.stack.weaponHit);
  }

  // what a talent does to one ability, going from 0 to all its points
  function changeText(a, b) {
    if (!usable(a) || !usable(b)) return [usable(b) ? "makes it usable" : "makes it unusable"];
    const out = [];
    const va = valueOf(a), vb = valueOf(b);
    const what = isHealing(b) ? "healing" : "damage";
    if (Math.abs(vb - va) > 0.05) out.push(va > 0 ? `${fmtPct((vb / va - 1) * 100)} ${what}` : `adds ${fmt(vb)} ${what}`);
    const ca = costOf(a), cb = costOf(b);
    if (ca !== cb) out.push(`cost ${fmt(ca)} → ${fmt(cb)} ${POWER[b.powerType] || ""}`.trim());
    if (Math.abs(a.castMs - b.castMs) > 1) out.push(`cast ${sec(a.castMs)} → ${sec(b.castMs)}`);
    if (Math.abs(a.cdMs - b.cdMs) > 1) out.push(`cooldown ${sec(a.cdMs)} → ${sec(b.cdMs)}`);
    if (Math.abs(a.critChance - b.critChance) > 0.05) out.push(`crit ${fmt(a.critChance, 1)}% → ${fmt(b.critChance, 1)}%`);
    const xa = critMult(a), xb = critMult(b);
    if (Math.abs(xa - xb) > 0.001) out.push(`crits ×${fmt(xa, 2)} → ×${fmt(xb, 2)}`);
    if (Math.abs((a.durMs || 0) - (b.durMs || 0)) > 1) out.push(`lasts ${sec(a.durMs)} → ${sec(b.durMs)}`);
    const sa = (a.stack && a.stack.weaponHit) || 0, sb = (b.stack && b.stack.weaponHit) || 0;
    if (Math.abs(sa - sb) > 0.05) out.push(`per-stack hit ${fmt(sa)} → ${fmt(sb)}`);
    return out.length ? out : ["changes it slightly"];
  }

  function model() {
    const list = abilities();
    const flat = app.flat();
    const n = state.lab.targets;
    const ranks = app.liveRanks();
    const atN = evaluate(ranks, n);
    const at1 = n > 1 ? evaluate(ranks, 1) : atN;
    // which talents change which ability: each talent at 0 and at all its points, the others as in the build
    const changes = list.map(() => []);
    flat.forEach((t, ti) => {
      const full = t.ranks.length, now = ranks[ti] || 0;
      const zero = now === 0 ? atN : evaluate(withRank(ranks, ti, 0), n);
      const max = now === full ? atN : evaluate(withRank(ranks, ti, full), n);
      list.forEach((ab, i) => {
        if (ab.talent === t.id || !atN[i] || (atN[i].locked && /^Learned at/.test(atN[i].locked))) return;
        if (differs(zero[i], max[i])) changes[i].push({ ti, zero: zero[i], max: max[i] });
      });
    });
    // a talent that changes only a few abilities is "for this ability"; one that changes most of them works through
    // your stats (crit, attack power, Strength...) and is listed apart
    const reach = new Array(flat.length).fill(0);
    changes.forEach((c) => c.forEach((x) => reach[x.ti]++));
    const rows = [];
    list.forEach((ab, i) => {
      if (!atN[i]) return;
      const r = atN[i], one = at1[i];
      const ch = changes[i].map((x) => {
        const va = valueOf(x.zero), vb = valueOf(x.max);
        return { ...x, gain: va > 0 ? (vb / va - 1) * 100 : 0,
          specific: (x.max && (x.max.mods || []).includes(flat[x.ti].name)) || reach[x.ti] <= 3 };
      });
      const g = grantIndex(ab);
      rows.push({ ab, i, r, one, m: metrics(r, one), changes: ch, shape: shapeFor(ab), notTaken: g >= 0 && !ranks[g] ? flat[g] : null });
    });
    return { list, flat, n, ranks, rows };
  }

  // talents chosen for an ability's combinations: the player's pick, else the ones for this ability (biggest first)
  function pickedFor(row) {
    const k = keyOf(row.ab);
    if (!picked[k]) {
      const by = (a, b) => Math.abs(b.gain) - Math.abs(a.gain);
      const own = row.changes.filter((c) => c.specific).sort(by);
      const start = own.length ? own.slice(0, MAX_PICK) : row.changes.slice().sort(by).slice(0, 3);
      picked[k] = start.map((c) => c.ti);
    }
    return picked[k].filter((ti) => row.changes.some((c) => c.ti === ti)).sort((a, b) => a - b);
  }

  // ------------------------------------------------------------ drawing

  function iconStyle(node, fileId, size) {
    const n = KP.talents.icons[String(fileId)];
    if (n == null) return;
    const cols = KP.talents.iconCols;
    node.style.backgroundSize = `${cols * size}px auto`;
    node.style.backgroundPosition = `${-(n % cols) * size}px ${-Math.floor(n / cols) * size}px`;
  }

  function head(M) {
    const box = el("div", "prio-head");
    box.append(el("h2", null, `${state.cls.name} abilities at level ${state.level}`));
    box.append(el("p", "muted", "Every ability with this character's numbers (talents, gear, and the target and buffs set in the panel). " +
      "Click a row to see which talents change it and the result of every combination of them, plus the damage by number of targets."));
    return box;
  }

  function bar(M) {
    const box = el("div", "prio-toggles lab-bar");
    // number of targets
    const tg = el("div", "lab-field");
    tg.append(el("span", "lab-label", "Targets"));
    const chips = el("div", "lab-chips");
    for (const v of TARGET_CHIPS) {
      const b = el("button", "btn chip" + (state.lab.targets === v ? " primary" : ""), String(v));
      b.type = "button";
      b.setAttribute("aria-pressed", state.lab.targets === v);
      b.addEventListener("click", () => { state.lab.targets = v; app.changed(); });
      chips.append(b);
    }
    const inp = el("input", "lab-num");
    inp.type = "number";
    inp.min = "1";
    inp.max = String(MAX_TARGETS);
    inp.value = state.lab.targets;
    inp.setAttribute("aria-label", "Number of targets");
    inp.addEventListener("change", () => {
      const v = parseInt(inp.value, 10);
      state.lab.targets = Math.max(1, Math.min(MAX_TARGETS, isNaN(v) ? 1 : v));
      app.changed();
    });
    chips.append(inp);
    tg.append(chips);
    tg.title = "Enemies in reach (or allies, for group heals). Area attacks hit all of them up to the game's limit; chain attacks jump to their own number.";
    box.append(tg);

    // what-if numbers
    const tok = state.cls.token;
    const S = KP.calc.stats({ ...app.ctx(), ...app.labShape() });
    const fields = [];
    if (!NO_AP.includes(tok)) fields.push(["ap", "Attack power", Math.round(tok === "HUNTER" ? S.rap : S.ap)]);
    if (SPELLS.includes(tok)) fields.push(["sp", "Spell damage", Math.round(S.sp)]);
    if (HEALERS.includes(tok)) fields.push(["healing", "Healing", Math.round(S.healing)]);
    const wf = el("div", "lab-field");
    wf.append(el("span", "lab-label", "What if"));
    const wrap = el("div", "lab-chips");
    for (const [key, label, now] of fields) {
      const l = el("label", "pfield");
      const i = el("input");
      i.type = "number";
      i.min = "0";
      i.step = "50";
      i.placeholder = String(now);
      i.value = state.lab[key] != null ? state.lab[key] : "";
      i.addEventListener("change", () => {
        const v = parseInt(i.value, 10);
        state.lab[key] = isNaN(v) || v < 0 ? null : v;
        app.changed();
      });
      l.title = `Type a number to see every ability with that much ${label.toLowerCase()} instead of yours (${now}${isDruid() && key === "ap" ? " in the chosen form" : ""}). Empty = yours.`;
      l.append(el("span", null, label), i);
      wrap.append(l);
    }
    if (fields.some(([k]) => state.lab[k] != null)) {
      const reset = el("button", "btn small", "Use mine");
      reset.type = "button";
      reset.addEventListener("click", () => { state.lab.ap = state.lab.sp = state.lab.healing = null; app.changed(); });
      wrap.append(reset);
    }
    wf.append(wrap);
    box.append(wf);

    // stance / form switches (Warrior stance, Druid form and Prowl, Rogue Stealth, Shadowform, Hunter aspect)
    const sw = shapeSwitches();
    if (sw.length) {
      const sf = el("div", "lab-field");
      const row = el("div", "lab-chips");
      for (const s of sw) {
        const l = el("label", "pfield");
        const sel = el("select");
        for (const [v, label] of s.opts) { const o = el("option", null, label); o.value = v; sel.append(o); }
        sel.value = s.opts.some(([v]) => v === setting(s.key)) ? setting(s.key) : "auto";
        sel.addEventListener("change", () => { state.lab.shape = { ...(state.lab.shape || {}), [s.key]: sel.value }; app.changed(); });
        l.title = s.help;
        l.append(el("span", "lab-label", s.label), sel);
        row.append(l);
      }
      sf.append(row);
      box.append(sf);
    }
    return box;
  }

  const COLS = [
    { key: "name", label: "Ability", sort: (row) => row.ab.name, text: true },
    { key: "hits", label: "Targets", title: "How many of your targets it hits (game data)." },
    { key: "hit", label: "One hit", title: "One target, a normal hit (no crit), after armor. Damage over time is added in full." },
    { key: "avg", label: "Average", title: "One target, per use: counting misses, dodges and crits." },
    { key: "total", label: "Total", title: "Average per use on all the targets it hits." },
    { key: "cost", label: "Cost" },
    { key: "perCost", label: "Per cost", title: "Total for each point of rage, energy or mana it costs." },
    { key: "perSec", label: "Per sec", title: "Total per second of your time: its cast or channel, at least the global cooldown. Empty for attacks off the global cooldown." },
    { key: "talents", label: "Talents", title: "Talents that change it. Click a row to see them all." },
  ];
  const sortValue = (row, key) => (key === "name" ? row.ab.name
    : key === "talents" ? row.changes.filter((c) => c.specific).length + row.changes.length / 100 : row.m ? row.m[key] : null);

  function table(M) {
    const wrap = el("div", "lab-scroll");
    const t = el("table", "lab-table");
    const thead = el("thead");
    const htr = el("tr");
    for (const c of COLS) {
      const th = el("th", c.text ? "" : "num");
      th.scope = "col";
      const b = el("button", "lab-sort", c.key === "total" && M.n > 1 ? `Total, ${M.n} targets` : c.label);
      b.type = "button";
      if (c.title) b.title = c.title + " Click to sort.";
      if (sort.key === c.key) { b.append(el("span", "lab-arrow", sort.dir < 0 ? " ▾" : " ▴")); th.setAttribute("aria-sort", sort.dir < 0 ? "descending" : "ascending"); }
      b.addEventListener("click", () => {
        if (sort.key === c.key) sort = sort.dir < 0 ? { key: c.key, dir: 1 } : { key: null, dir: -1 };
        else sort = { key: c.key, dir: c.text ? 1 : -1 };
        render();
      });
      th.append(b);
      htr.append(th);
    }
    thead.append(htr);
    t.append(thead);

    const ready = M.rows.filter((row) => !(row.r.locked && /^Learned at/.test(row.r.locked)));
    const later = M.rows.filter((row) => row.r.locked && /^Learned at/.test(row.r.locked));
    if (sort.key) {
      ready.sort((a, b) => {
        const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * sort.dir;
      });
    }
    const tbody = el("tbody");
    for (const row of ready) {
      tbody.append(abilityRow(row, M));
      if (open.has(keyOf(row.ab))) tbody.append(detailRow(row, M));
    }
    t.append(tbody);
    wrap.append(t);
    const box = el("div");
    box.append(wrap);
    if (later.length) {
      box.append(el("p", "muted small lab-later", "Learned at a higher level: " +
        later.map((row) => `${row.ab.name} (${row.r.locked.replace(/^Learned at level /, "")})`).join(" · ")));
    }
    return box;
  }

  function nameCell(row) {
    const td = el("td", "lab-name");
    const b = el("button", "lab-open");
    b.type = "button";
    b.setAttribute("aria-expanded", open.has(keyOf(row.ab)));
    const ic = el("span", "icon aicon");
    iconStyle(ic, row.ab.icon, 32);
    const txt = el("span", "lab-ntext");
    const title = el("span", "lab-title");
    title.append(el("strong", null, row.ab.name));
    const rank = row.r.rank;
    if (rank && row.ab.ranks.length > 1) title.append(el("span", "muted small", ` rank ${row.ab.ranks.indexOf(rank) + 1}`));
    txt.append(title);
    const tags = el("span", "lab-tags");
    if (row.shape && row.shape.tag) tags.append(el("span", "prio-tag", row.shape.tag));
    if (row.notTaken) tags.append(el("span", "prio-tag theory", "talent not taken"));
    if (row.m && row.m.heal) tags.append(el("span", "prio-tag lab-heal", "heal"));
    if (tags.childNodes.length) txt.append(tags);
    b.append(el("span", "lab-caret", open.has(keyOf(row.ab)) ? "▾" : "▸"), ic, txt);
    b.addEventListener("click", () => {
      const k = keyOf(row.ab);
      if (open.has(k)) open.delete(k); else open.add(k);
      render();
    });
    td.append(b);
    return td;
  }

  function abilityRow(row, M) {
    const tr = el("tr", "lab-row" + (open.has(keyOf(row.ab)) ? " open" : "") + (row.m ? "" : " locked"));
    tr.append(nameCell(row));
    if (!row.m) {
      const td = el("td", "muted lab-lock", lockText(row));
      td.colSpan = COLS.length - 2;
      tr.append(td, talentCount(row));
      return tr;
    }
    const m = row.m;
    const cls = m.heal ? "num green" : "num";
    const hitsTd = el("td", "num", String(m.hits));
    if (m.hits > 1) hitsTd.classList.add("lab-multi");
    const one = row.one;
    const hitTd = el("td", cls, fmt(m.hit));
    if (!m.heal && one.dmax > 0 && Math.round(one.dmin) !== Math.round(one.dmax)) hitTd.title = `${fmt(one.dmin)} to ${fmt(one.dmax)}` + (one.dot ? ` + ${fmt(one.dot)} over time` : "");
    const totalTd = el("td", cls + " lab-total");
    totalTd.append(el("strong", null, fmt(m.total)));
    tr.append(hitsTd, hitTd, el("td", cls, fmt(m.avg)), totalTd,
      el("td", "num", m.cost ? `${fmt(m.cost)} ${m.power}` : "free"),
      el("td", "num", m.perCost != null ? fmt(m.perCost, 1) : "–"),
      el("td", "num", m.perSec != null ? fmt(m.perSec, 1) : "–"), talentCount(row));
    return tr;
  }

  const lockText = (row) => row.r.locked || (placeholder(row.one) ? "Its number is worked out by the server (see the tooltip)" : "–");
  // talents for this ability (the general ones, which change most abilities, in the tooltip)
  function talentCount(row) {
    const own = row.changes.filter((c) => c.specific).length, rest = row.changes.length - own;
    const td = el("td", "num", own ? String(own) : "–");
    if (rest) td.append(el("span", "muted small", ` +${rest}`));
    td.title = `${own} talent${own === 1 ? "" : "s"} for this ability` + (rest ? `, ${rest} more that change most of your abilities (crit, hit, damage %...)` : "");
    return td;
  }

  // ------------------------------------------------------------ an opened row

  function detailRow(row, M) {
    const tr = el("tr", "lab-detail");
    const td = el("td");
    td.colSpan = COLS.length;
    const grid = el("div", "lab-grid");
    grid.append(about(row, M));
    const side = el("div", "lab-col");
    const tgt = byTargets(row, M);
    if (tgt) side.append(tgt);
    const st = stacks(row);
    if (st) side.append(st);
    if (side.childNodes.length) grid.append(side);
    td.append(grid, talentsBlock(row, M));
    tr.append(td);
    return tr;
  }

  function about(row, M) {
    const box = el("div", "lab-block");
    const r = row.r, one = row.one;
    box.append(el("h4", null, "About"));
    if (r.rank && r.rank.desc) box.append(el("p", "lab-desc", r.rank.desc));
    if (row.notTaken) box.append(el("p", "small lab-warn", `Needs the talent ${row.notTaken.name} (${row.notTaken.treeName}). Worked out as if you had it.`));
    if (!row.m) { box.append(el("p", "muted small", lockText(row))); return box; }
    const facts = el("ul", "plain small lab-facts");
    const add = (t) => facts.append(el("li", null, t));
    const kind = r.kind === "magic" ? "spell" : r.kind;
    add(`${SCHOOL[r.school] || ""} ${kind}`.trim() + " · " + (channelMs(r) ? `channeled ${sec(channelMs(r))}` : r.castMs ? `${sec(r.castMs)} cast` : "instant") +
      (r.cdMs >= 1500 ? ` · ${sec(r.cdMs)} cooldown` : "") + (row.shape && row.shape.label ? ` · in ${row.shape.label}` : ""));
    // how many it hits
    const e = targetRule(r);
    if (e) add(e);
    if (one.dmax > 0) add(`One hit: ${fmt(one.dmin)}` + (Math.round(one.dmin) !== Math.round(one.dmax) ? ` to ${fmt(one.dmax)}` : "") + (r.combo ? " (at 5 combo points)" : ""));
    if (one.dot > 0) add(`Over time: ${fmt(one.dot)} in ${one.ticks} ticks` + (r.rank.dotCrit ? " (its ticks can crit in Forever)" : ""));
    if (one.heal > 0) add(`Heals ${fmt(one.heal)}, crit ${fmt(r.critChance, 1)}% for ×${fmt(r.healCritMult || 1.5, 2)}`);
    if (!row.m.heal) {
      const crits = one.dmax > 0 || r.rank.dotCrit;
      add((crits ? `Crit ${fmt(r.critChance, 1)}% for ×${fmt(critMult(r), 2)}` : "Its ticks can't crit") +
        ` · ${fmt(r.miss, 1)}% miss` + (r.dodge ? ` · ${fmt(r.dodge, 1)}% dodge` : ""));
      if (r.kind !== "magic" && r.school === 1 && one.dmax > 0) {
        const c = ctxFor(M.ranks, 1, row.shape);
        add(`Armor takes off ${fmt(KP.calc.mitigation(c, KP.calc.stats(c)) * 100, 1)}% of the hit (bleeds ignore it)`);
      }
    }
    if (NEXT_SWING.includes(row.ab.name)) {
      const c = ctxFor(M.ranks, 1, row.shape);
      const mh = KP.calc.compute(c).white.find((w) => w.label === "Main hand");
      if (mh) add(`On your next swing: it replaces a normal swing (${fmt(mh.perSwing)} on average), so it adds ${fmt(row.m.total - mh.perSwing)}` +
        (row.m.cost ? ` (${fmt((row.m.total - mh.perSwing) / row.m.cost, 1)} per ${row.m.power})` : "") + ".");
    }
    if (r.mods && r.mods.length) add("Changed by: " + r.mods.join(", "));
    box.append(facts);
    return box;
  }

  // what the game data says about its targets
  function targetRule(r) {
    const effects = [...r.rank.effects, ...Object.values(r.rank.triggers || {}).flatMap((t) => t.effects)];
    const chain = effects.find((e) => e.chain > 1 && e.target !== 1);
    if (chain) return `Hits up to ${chain.chain} targets` + (chain.chainAmp ? `, each jump doing ${fmt(chain.chainAmp * 100)}% of the last` : "") + " (game data)";
    const one = [1, 5, 6, 21, 25, 45, 57, 77];
    const area = effects.find((e) => !one.includes(e.target) && ([2, 10, 17, 31, 58, 121].includes(e.effect) || (e.effect === 6 && [3, 8, 53, 69].includes(e.aura))));
    if (!area) return null;
    const max = r.rank.maxTargets || Object.values(r.rank.triggers || {}).map((t) => t.maxTargets || 0).find(Boolean);
    const heal = area.effect === 10 || area.aura === 8;
    const part = effects.find((e) => e.maxTargets);
    const ticks = r.rank.effects.find((e) => e.areaLink);
    return (max ? `Hits every target in its area, up to ${max} (game data)` : heal ? "Heals your group in its area (counted as up to 5, a party)" :
      "Hits every target in its area (no limit in the game data)") +
      (part ? `; part of its damage only the first ${part.maxTargets} (tooltip)` : "") +
      (ticks ? `. Damage every ${sec(ticks.period)} while it lasts (the damage spell is matched to it by name and level)` : "");
  }

  function byTargets(row, M) {
    if (!row.m) return null;
    const far = evaluate(M.ranks, MAX_TARGETS, [row.i])[row.i];
    if (!usable(far) || (far.hits || 1) <= 1) return null;
    const cap = far.hits;
    const counts = [];
    for (let k = 1; k <= Math.min(cap, 5); k++) counts.push(k);
    if (cap > 5) counts.push(cap >= MAX_TARGETS ? 10 : cap);
    const box = el("div", "lab-block");
    box.append(el("h4", null, "By number of targets"));
    const t = el("table", "lab-sub");
    const hr = el("tr");
    for (const h of ["Targets", "Hits", "Total", "Per target", "Per cost"]) hr.append(el("th", h === "Targets" ? "" : "num", h));
    const th = el("thead");
    th.append(hr);
    t.append(th);
    const body = el("tbody");
    for (const k of counts) {
      const r = k === M.n ? row.r : evaluate(M.ranks, k, [row.i])[row.i];
      const m = metrics(r, row.one);
      if (!m) continue;
      const tr = el("tr", k === M.n ? "mine" : "");
      tr.append(el("td", null, String(k)), el("td", "num", String(m.hits)), el("td", "num", fmt(m.total)),
        el("td", "num", fmt(m.total / k, 1)), el("td", "num", m.perCost != null ? fmt(m.perCost, 1) : "–"));
      body.append(tr);
    }
    t.append(body);
    box.append(t);
    if (cap >= MAX_TARGETS) box.append(el("p", "muted small", "No limit on targets in the game data: 10 shown."));
    return box;
  }

  // a stacking bleed (Lacerate): what one more application does at each number of stacks already on the target
  function stacks(row) {
    const s = row.one && row.one.stack;
    if (!s || !row.m) return null;
    const one = row.one;
    const tick = one.ticks ? one.dot / one.ticks : 0;
    const box = el("div", "lab-block");
    box.append(el("h4", null, "By stacks already on the target"));
    const t = el("table", "lab-sub");
    const hr = el("tr");
    for (const h of ["Stacks", "Extra hit", "Per tick", "Bleed in total", "Extra hit per cost"]) hr.append(el("th", h === "Stacks" ? "" : "num", h));
    const th = el("thead");
    th.append(hr);
    t.append(th);
    const body = el("tbody");
    for (let k = 0; k <= s.max; k++) {
      const after = Math.min(k + 1, s.max);
      const extra = k * s.weaponHit;
      const tr = el("tr");
      tr.append(el("td", null, String(k)), el("td", "num", fmt(extra, 1)), el("td", "num", fmt(tick * after, 1)),
        el("td", "num", fmt(one.dot * after)), el("td", "num", row.m.cost ? fmt(extra / row.m.cost, 2) : "–"));
      body.append(tr);
    }
    t.append(body);
    box.append(t);
    box.append(el("p", "muted small", `Plain numbers: no misses or crits. Extra hit = ${s.weaponPct}% of your weapon damage per stack already there ` +
      `(${fmt(s.weaponHit, 1)} each, from the tooltip). The game may add it at once or spread it over the bleed: to check in game.`));
    return box;
  }

  function talentsBlock(row, M) {
    const box = el("div", "lab-block lab-talents");
    box.append(el("h4", null, "Talents that change it"));
    if (!row.changes.length) {
      box.append(el("p", "muted small", "No talent changes this ability's numbers (that the planner can measure)."));
      return box;
    }
    const chosen = pickedFor(row);
    const k = keyOf(row.ab);
    const ul = el("ul", "plain lab-tlist");
    const sorted = row.changes.slice().sort((a, b) => (b.specific - a.specific) || Math.abs(b.gain) - Math.abs(a.gain));
    for (const c of sorted) {
      const t = M.flat[c.ti];
      const li = el("li");
      const l = el("label", "pcheck");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = chosen.includes(c.ti);
      cb.disabled = !cb.checked && chosen.length >= MAX_PICK;
      cb.addEventListener("change", () => {
        const now = pickedFor(row);
        picked[k] = cb.checked ? [...now, c.ti] : now.filter((x) => x !== c.ti);
        render();
      });
      const name = el("span", "lab-tname", `${t.name} `);
      name.title = (t.desc && t.desc[t.ranks.length - 1]) || "";
      l.append(cb, name, el("span", "muted small", `${M.ranks[c.ti] || 0}/${t.ranks.length}`));
      li.append(l, el("span", "small lab-tdo", changeText(c.zero, c.max).join(" · ")));
      if (!c.specific) li.append(el("span", "prio-tag", "changes most abilities"));
      ul.append(li);
    }
    box.append(el("p", "muted small", `Tick up to ${MAX_PICK} for the table below: every combination, each talent at 0 or all its points. ` +
      "The other talents stay as in your build. Talents marked \"changes most abilities\" work through crit, hit, attack power or damage " +
      "for everything, not this ability alone."));
    box.append(ul);
    if (chosen.length) box.append(comboTable(row, M, chosen));
    return box;
  }

  function comboTable(row, M, chosen) {
    const flat = M.flat;
    const rows = [];
    for (let mask = 0; mask < 1 << chosen.length; mask++) {
      const ranks = M.ranks.slice();
      chosen.forEach((ti, b) => { ranks[ti] = mask & (1 << b) ? flat[ti].ranks.length : 0; });
      const r = evaluate(ranks, M.n, [row.i])[row.i];
      const one = M.n > 1 ? evaluate(ranks, 1, [row.i])[row.i] : r;
      rows.push({ mask, n: chosen.filter((_, b) => mask & (1 << b)).length, m: metrics(r, one), ranks });
    }
    // the build's own row: its ranks if they're all 0 or full, else an extra row
    const mineMask = chosen.reduce((acc, ti, b) => acc | ((M.ranks[ti] || 0) === flat[ti].ranks.length ? 1 << b : 0), 0);
    const exact = chosen.every((ti) => !M.ranks[ti] || M.ranks[ti] === flat[ti].ranks.length);
    if (!exact) rows.push({ mask: -1, n: 99, m: row.m, ranks: M.ranks, mine: true });
    rows.forEach((x) => { if (exact && x.mask === mineMask) x.mine = true; });
    rows.sort((a, b) => a.n - b.n || ((a.m && a.m.total) || 0) - ((b.m && b.m.total) || 0));
    const none = rows.find((x) => x.mask === 0);
    const base = none && none.m ? none.m.total : 0;

    const box = el("div", "lab-combos");
    box.append(el("h4", null, `Every combination (${1 << chosen.length})`));
    const wrap = el("div", "lab-scroll");
    const t = el("table", "lab-sub lab-ctable");
    const hr = el("tr");
    const heads = ["Talents", "Cost", "One hit", "Average", M.n > 1 ? `Total, ${M.n} targets` : "Total", "Per cost", "Per sec", "vs none"];
    heads.forEach((h, i) => hr.append(el("th", i ? "num" : "", h)));
    const th = el("thead");
    th.append(hr);
    t.append(th);
    const body = el("tbody");
    for (const x of rows) {
      const tr = el("tr", x.mine ? "mine" : "");
      const names = el("td", "lab-cnames");
      const list = x.mask === -1
        ? chosen.filter((ti) => M.ranks[ti]).map((ti) => `${flat[ti].name} ${M.ranks[ti]}/${flat[ti].ranks.length}`)
        : chosen.filter((_, b) => x.mask & (1 << b)).map((ti) => `${flat[ti].name} ${flat[ti].ranks.length}/${flat[ti].ranks.length}`);
      if (!list.length) names.append(el("span", "muted", "none"));
      for (const s of list) names.append(el("span", "lab-chip", s));
      if (x.mine) names.append(el("span", "prio-tag theory", "your build"));
      const m = x.m;
      const cls = m && m.heal ? "num green" : "num";
      tr.append(names);
      if (!m) {
        const td = el("td", "muted", "can't be used like this");
        td.colSpan = heads.length - 1;
        tr.append(td);
      } else {
        tr.append(el("td", "num", m.cost ? `${fmt(m.cost)}` : "free"), el("td", cls, fmt(m.hit)), el("td", cls, fmt(m.avg)),
          el("td", cls + " lab-total", fmt(m.total)), el("td", "num", m.perCost != null ? fmt(m.perCost, 1) : "–"),
          el("td", "num", m.perSec != null ? fmt(m.perSec, 1) : "–"),
          el("td", "num " + (base && m.total > base + 0.05 ? "green" : ""), base ? (Math.abs(m.total - base) < 0.05 ? "–" : fmtPct((m.total / base - 1) * 100)) : "–"));
      }
      body.append(tr);
    }
    t.append(body);
    wrap.append(t);
    box.append(wrap);
    return box;
  }

  function foot() {
    return el("p", "muted small prio-foot", "Estimates from Forever's game data (damage, costs, targets, talent ranks) and Classic's rules for " +
      "armor, the attack table and base attack power, like the rest of the planner. Combinations take each talent at 0 or all its points " +
      "and ignore the points a tree needs before it. Area heals are counted on up to 5 targets (a party). Blizzard, Hurricane, Volley, " +
      "Rain of Fire and Consecration: the game files don't link the area to its damage, so the damage spell with the same name and " +
      "learn level is used (it matches their tooltips).");
  }

  function render() {
    if (!app.view || app.view() !== "abilities" || !state.cls || !KP.calc) return;
    const box = $("lab");
    if (!box) return;
    const M = model();
    const frag = document.createDocumentFragment();
    frag.append(head(M), bar(M));
    if (M.rows.some((row) => row.r.locked === "Needs a weapon")) {
      frag.append(el("p", "small lab-warn", "No weapon picked: weapon attacks show \"Needs a weapon\". Pick one on the Gear & Stats tab."));
    }
    frag.append(table(M), foot());
    box.textContent = "";
    box.append(frag);
  }

  // the table takes 50-150 ms: changes that come quickly (dragging the level slider) draw it once per frame
  let queued = false;
  function soon() {
    if (queued || !app.view || app.view() !== "abilities") return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  app.hooks.push(soon);
  app.renderAbilities = render;
  addEventListener("hashchange", () => { readHash(); soon(); });
  readHash();
  render();
})();
