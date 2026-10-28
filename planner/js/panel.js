// Kor'kron Planner: the stats + attacks panel (next to the talent trees, and on the Gear tab),
// target and base-stat settings, change badges, and the "if you add a point" preview for talent tooltips.
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
  const STATS = ["strength", "agility", "stamina", "intellect", "spirit"];
  const STAT_SHORT = { strength: "Str", agility: "Agi", stamina: "Sta", intellect: "Int", spirit: "Spi" };
  // base values a player can type in from the character screen (no gear): the 5 stats and crit chances
  const BASE = [...STATS, "crit", "spellCrit"];
  const BASE_LABEL = { ...STAT_SHORT, crit: "Crit %", spellCrit: "Spell crit %" };
  const POWER = { 0: "mana", 1: "rage", 3: "energy" };
  const SCHOOL = { 1: "Physical", 2: "Holy", 4: "Fire", 8: "Nature", 16: "Frost", 20: "Frostfire", 32: "Shadow", 64: "Arcane" };

  // ------------------------------------------------------------ settings: target and base stats (in the link)

  state.base = state.base || {};
  state.target = state.target || { mode: "boss", armor: null };
  // group buffs / target debuffs the player can switch on (letter in the link -> name in the data)
  const BUFF_KEYS = { b: "Battle Shout", m: "Blessing of Might", k: "Blessing of Kings", w: "Mark of the Wild",
    e: "Strength of Earth", g: "Grace of Air", p: "Leader of the Pack", t: "Trueshot Aura", i: "Arcane Intellect",
    s: "Sunder Armor", x: "Expose Armor", f: "Faerie Fire", r: "Curse of Recklessness" };
  // [name, label, who brings it, what it does ({v} = the number at your level)]
  const BUFF_LIST = [
    ["Group buffs", [
      ["Battle Shout", "Battle Shout", "Warrior", "+{v} melee attack power"],
      ["Blessing of Might", "Blessing of Might", "Paladin", "+{v} melee attack power"],
      ["Blessing of Kings", "Blessing of Kings", "Paladin", "+{v}% all stats"],
      ["Mark of the Wild", "Mark of the Wild", "Druid", "+{v} all stats"],
      ["Strength of Earth", "Strength of Earth Totem", "Shaman", "+{v} Strength"],
      ["Grace of Air", "Grace of Air Totem", "Shaman", "+{v} Agility"],
      ["Leader of the Pack", "Leader of the Pack", "Feral Druid (talent)", "+{v}% crit"],
      ["Trueshot Aura", "Trueshot Aura", "Hunter (talent)", "+{v} ranged attack power"],
      ["Arcane Intellect", "Arcane Intellect", "Mage", "+{v} Intellect"],
    ]],
    ["Target debuffs", [
      ["Sunder Armor", "Sunder Armor ×5", "Warrior", "−{v} armor per stack, 5 stacks"],
      ["Expose Armor", "Expose Armor (5 points)", "Rogue", "−{v} armor per combo point; doesn't stack with Sunder (Classic rule)"],
      ["Faerie Fire", "Faerie Fire", "Druid", "−{v} armor"],
      ["Curse of Recklessness", "Curse of Recklessness", "Warlock", "−{v} armor"],
    ]],
  ];
  const buffNumber = (name) => {
    let v = 0;
    for (const r of (KP.abilities.BUFFS || {})[name] || []) if (r.level <= state.level) v = Math.max(v, r.value);
    return v;
  };
  state.buffs = state.buffs || {};
  let buffsOpen = false; // remember whether the buff list is open between redraws

  function defaultArmor(level, mode) {
    // a raid boss at 60 is usually given 3731 armor; scaled down for lower levels (estimate)
    const lvl = mode === "boss" ? level + 3 : level;
    return Math.round((3731 * lvl) / 63);
  }
  function target() {
    const mode = state.target.mode;
    return { diff: mode === "boss" ? 3 : 0, armor: state.target.armor != null ? state.target.armor : defaultArmor(state.level, mode), mode };
  }

  app.encoders.push(() => {
    let s = "";
    const b = BASE.map((k) => state.base[k] || "").join("_");
    if (b.replace(/_/g, "")) s += "&b=" + b.replace(/_+$/, "");
    if (state.target.mode !== "boss") s += "&tg=" + state.target.mode;
    if (state.target.armor != null) s += "&ar=" + state.target.armor;
    const bf = Object.keys(BUFF_KEYS).filter((k) => state.buffs[BUFF_KEYS[k]]).join("");
    if (bf) s += "&bf=" + bf;
    return s;
  });
  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    state.base = {};
    (p.get("b") || "").split("_").forEach((v, i) => { const n = parseFloat(v); if (BASE[i] && n > 0) state.base[BASE[i]] = n; });
    state.target = { mode: p.get("tg") === "same" ? "same" : "boss", armor: p.get("ar") ? parseInt(p.get("ar"), 10) : null };
    state.buffs = {};
    for (const ch of p.get("bf") || "") if (BUFF_KEYS[ch]) state.buffs[BUFF_KEYS[ch]] = true;
  }

  // ------------------------------------------------------------ the character as the math sees it

  function ctx(ranks) {
    return {
      cls: state.cls, level: state.level, flat: app.flat(), ranks: ranks || app.liveRanks(),
      race: (KP.classes.races.find((r) => r.id === state.race) || {}).name,
      worn: app.worn ? app.worn() : [], base: state.base, target: target(), buffs: state.buffs,
      style: (state.prio || {}).style, // Hunter ranged/melee choice from the Priority tab
      tank: (state.prio || {}).tank,   // tank mode (a Druid tanks in Bear Form)
    };
  }
  app.ctx = ctx;

  // what each talent point would change (for the talent tooltip)
  app.previewTalent = (index) => {
    const now = app.liveRanks();
    const t = app.flat()[index];
    if (!t || now[index] >= t.ranks.length) return null;
    const next = now.slice();
    next[index]++;
    const a = KP.calc.compute(ctx(now)), b = KP.calc.compute(ctx(next));
    const lines = [];
    const add = (label, x, y, d = 0, unit = "") => {
      if (fmt(x, d) !== fmt(y, d)) lines.push({ label, text: `${fmt(x, d)}${unit} → ${fmt(y, d)}${unit}`, up: y > x });
    };
    add("Damage per sec", a.rotation.dps, b.rotation.dps, 1);
    add("Attack power", a.S.ap, b.S.ap);
    add("Crit", a.S.crit, b.S.crit, 1, "%");
    add("Hit", a.S.hit, b.S.hit, 1, "%");
    add("Spell crit", a.S.spellCrit, b.S.spellCrit, 1, "%");
    add("Spell hit", a.S.spellHit, b.S.spellHit, 1, "%");
    add("Armor", a.S.armor, b.S.armor);
    add("Health", a.S.health, b.S.health);
    add("White damage per sec", sum(a.white.map((w) => w.dps)), sum(b.white.map((w) => w.dps)), 1);
    b.abilities.forEach((ab, i) => {
      const old = a.abilities[i];
      if (!old) return;
      if (old.locked && !ab.locked) { lines.push({ label: ab.name, text: "unlocked", up: true }); return; }
      if (ab.locked) return;
      if (Math.abs(ab.expected - old.expected) > 0.05) add(ab.name, old.expected, ab.expected, 0, " avg");
      else if (Math.abs(ab.heal - old.heal) > 0.05) add(ab.name, old.heal, ab.heal, 0, " heal");
      else if (Math.abs(ab.castMs - old.castMs) > 1) add(ab.name, old.castMs / 1000, ab.castMs / 1000, 1, "s cast");
      else if (Math.abs(ab.cost - old.cost) > 0.01) add(ab.name, old.cost, ab.cost, 0, " cost");
      else if (Math.abs(ab.cdMs - old.cdMs) > 1) add(ab.name, old.cdMs / 1000, ab.cdMs / 1000, 0, "s cooldown");
    });
    return lines;
  };
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  // Estimated DPS with a different item (or none) in one slot, for the gear picker.
  app.scoreWith = (slotKey, item) => {
    const c = ctx();
    const others = c.worn.filter((w) => w.slot !== slotKey && !(item && item.inv === 17 && w.slot === "offHand"));
    const worn = item ? [...others, { slot: slotKey, item }] : others;
    return KP.calc.compute({ ...c, worn }).rotation.dps;
  };
  app.score = () => KP.calc.compute(ctx()).rotation.dps;

  // ------------------------------------------------------------ drawing

  let prev = null;       // last numbers, to show what changed
  let badges = {};       // key -> delta text from the latest change

  function iconStyle(node, fileId, size) {
    const n = KP.talents.icons[String(fileId)];
    if (n == null) return;
    const cols = KP.talents.iconCols;
    node.style.backgroundSize = `${cols * size}px auto`;
    node.style.backgroundPosition = `${-(n % cols) * size}px ${-Math.floor(n / cols) * size}px`;
  }

  function badge(key, node) {
    const b = badges[key];
    if (!b) return;
    node.append(el("span", "delta " + (b.up ? "up" : "down"), b.text));
  }

  function controls(R) {
    const box = el("div", "pctl");
    const tsel = el("select");
    tsel.setAttribute("aria-label", "Target");
    for (const [v, label] of [["boss", "Raid boss (3 levels higher)"], ["same", "Same level as you"]]) {
      const o = el("option", null, label);
      o.value = v;
      tsel.append(o);
    }
    tsel.value = state.target.mode;
    tsel.addEventListener("change", () => { state.target.mode = tsel.value; state.target.armor = null; app.changed(); });
    const armor = el("input");
    armor.type = "number";
    armor.min = "0";
    armor.step = "100";
    armor.value = target().armor;
    armor.setAttribute("aria-label", "Target armor");
    armor.addEventListener("change", () => {
      const v = parseInt(armor.value, 10);
      state.target.armor = isNaN(v) || v === defaultArmor(state.level, state.target.mode) ? null : Math.max(0, v);
      app.changed();
    });
    const l1 = el("label", "pfield");
    l1.append(el("span", null, "Target"), tsel);
    const l2 = el("label", "pfield");
    l2.append(el("span", null, "Armor"), armor);
    box.append(l1, l2);

    // group buffs and target debuffs: off by default (just you); switch on what your group brings
    const on = Object.values(BUFF_KEYS).filter((n) => state.buffs[n]).length;
    const bdet = el("details", "pbuffs-box");
    bdet.open = buffsOpen;
    bdet.addEventListener("toggle", () => { buffsOpen = bdet.open; });
    bdet.append(el("summary", null, `Buffs & debuffs: ${on ? on + " on" : "none (just you)"}`));
    const tools = el("div", "pbuff-tools");
    for (const [label, val] of [["All on", true], ["All off", false]]) {
      const btn = el("button", "btn small", label);
      btn.type = "button";
      btn.addEventListener("click", () => { for (const n of Object.values(BUFF_KEYS)) state.buffs[n] = val; app.changed(); });
      tools.append(btn);
    }
    bdet.append(tools);
    for (const [group, items] of BUFF_LIST) {
      bdet.append(el("div", "pbuff-group", group));
      const wrap = el("div", "pbuffs");
      for (const [name, label, who, what] of items) {
        const v = buffNumber(name);
        const l = el("label", "pcheck");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = !!state.buffs[name];
        cb.disabled = !v;
        cb.addEventListener("change", () => { state.buffs[name] = cb.checked; app.changed(); });
        l.title = v ? `${who}: ${what.replace("{v}", v)} (best rank at level ${state.level}, from the game data)` : `${who}: not available at level ${state.level}`;
        l.append(cb, el("span", null, label), el("span", "muted small", v ? " " + what.replace("{v}", v) : " (higher level)"));
        wrap.append(l);
      }
      bdet.append(wrap);
    }
    box.append(bdet);

    const det = el("details", "pbase");
    det.open = Object.keys(state.base).length > 0;
    det.append(el("summary", null, Object.keys(state.base).length ? "Your base stats" : "Base stats: Classic estimates (type your own)"));
    det.append(el("p", "muted small", "Grey numbers are estimates from Classic for your race, class and level. " +
      "Type the stats your character has with no gear on (from the character screen) to replace them. " +
      "Crit % is the crit chance shown with no gear on (it includes crit from Agility). " +
      "The game files don't include any of these, so without them the numbers count only gear, talents and level."));
    const row = el("div", "pbase-row");
    for (const k of BASE) {
      const lab = el("label");
      const inp = el("input");
      inp.type = "number";
      inp.min = "0";
      inp.value = state.base[k] || "";
      const e = R.S.estimate[k];
      inp.placeholder = e ? (k === "crit" || k === "spellCrit" ? e.toFixed(1) : String(e)) : "0";
      inp.addEventListener("change", () => {
        const v = parseFloat(inp.value);
        if (v > 0) state.base[k] = v; else delete state.base[k];
        app.changed();
      });
      if (k === "crit" || k === "spellCrit") inp.step = "0.01";
      lab.append(el("span", null, BASE_LABEL[k]), inp);
      row.append(lab);
    }
    det.append(row);
    box.append(det);
    return box;
  }

  function statGrid(R) {
    const S = R.S;
    const grid = el("div", "pstats");
    const cell = (label, value, key, title) => {
      const c = el("div", "pstat");
      c.append(el("span", "pl", label));
      const v = el("span", "pv", value);
      if (title) { v.title = title; v.classList.add("hint-u"); }
      badge(key, v);
      c.append(v);
      grid.append(c);
    };
    const estNote = (k) => (S.estimated.includes(k) ? "Includes an estimated base value (Classic). Type yours in the base stats box." : null);
    for (const k of STATS) cell(STAT_SHORT[k], fmt(S.attr[k]), "attr." + k, estNote(k));
    const melee = !!(S.mh || ["WARRIOR", "ROGUE", "PALADIN", "SHAMAN", "DRUID", "HUNTER"].includes(state.cls.token));
    if (melee) {
      cell("Attack power", fmt(S.ap), "ap", `Includes ${S.baseAp} from your level (Classic rule)`);
      cell("Hit", fmt(S.hit, 1) + "%", "hit");
      cell("Crit", fmt(S.crit, 1) + "%", "crit", S.estimated.includes("crit")
        ? "Base crit and crit from Agility are Classic estimates; plus gear ratings and talents." : "Your base crit + gear + talents.");
    }
    if (state.cls.power === 0) {
      cell("Spell damage", fmt(S.sp), "sp");
      cell("Spell hit", fmt(S.spellHit, 1) + "%", "spellHit");
      cell("Spell crit", fmt(S.spellCrit, 1) + "%", "spellCrit", S.estimated.includes("spellCrit")
        ? "Base spell crit and crit from Intellect are Classic estimates; plus gear ratings and talents." : "Your base spell crit + gear + talents.");
      if (S.healing) cell("Healing", fmt(S.healing), "healing");
    }
    cell("Armor", fmt(S.armor), "armor");
    cell("Health", fmt(S.health), "health", "Base health for your level + 10 per Stamina");
    if (S.mana) cell("Mana", fmt(S.mana), "mana", "Base mana for your level + 15 per Intellect");
    return grid;
  }

  function rotationBox(R) {
    const box = el("div", "prot");
    const top = el("div", "prot-top");
    top.append(el("span", "muted small", "Estimated damage per second"));
    const v = el("strong", "prot-dps", fmt(R.rotation.dps, 1));
    badge("rotation", v);
    top.append(v);
    box.append(top);
    const ul = el("ul", "plain small");
    for (const p of R.rotation.parts) {
      const li = el("li");
      li.append(el("span", null, p.name), el("span", "muted", ` ${fmt(p.dps, 1)}`));
      ul.append(li);
    }
    box.append(ul, el("p", "muted small", "Rough: " + R.rotation.note));
    return box;
  }

  // healers: single-target healing per second you can keep up over a fight
  function healingBox(R) {
    const box = el("div", "prot");
    const top = el("div", "prot-top");
    top.append(el("span", "muted small", "Estimated healing per second (one target)"));
    const v = el("strong", "prot-dps green", fmt(R.healing.hps, 1));
    badge("healing.hps", v);
    top.append(v);
    box.append(top);
    const ul = el("ul", "plain small");
    for (const p of R.healing.parts) {
      const li = el("li");
      li.append(el("span", null, p.name), el("span", "muted", ` ${fmt(p.dps, 1)}`));
      ul.append(li);
    }
    box.append(ul, el("p", "muted small", "Rough: " + R.healing.note));
    return box;
  }

  function whiteTable(R) {
    const box = el("div", "psec");
    box.append(el("h4", null, "White hits (auto attack)"));
    if (!R.white.length) {
      box.append(el("p", "muted small", "Equip a weapon on the Gear & Stats tab to see auto-attack damage."));
      return box;
    }
    for (const w of R.white) {
      const row = el("div", "prow");
      const name = el("div", "pname");
      name.append(el("strong", null, w.label), el("span", "muted small", ` ${w.item}`));
      const nums = el("div", "pnums");
      nums.append(el("span", null, `${fmt(w.min)}–${fmt(w.max)}`), el("span", "muted", ` · crit ${fmt(w.critAvg)} · `));
      const d = el("strong", null, `${fmt(w.dps, 1)} dps`);
      badge("white." + w.label, d);
      nums.append(d);
      row.append(name, nums);
      row.title = (w.procs && w.procs.length && w.label === "Main hand" ? w.procs.join(". ") + ".\n" : "") +
        `Speed ${w.speed.toFixed(2)}. Against your target: ${fmt(w.miss, 1)}% miss, ${fmt(w.dodge, 1)}% dodge, ` +
        `${fmt(w.glance)}% glancing, ${fmt(w.crit, 1)}% crit. Armor is taken off.`;
      box.append(row);
    }
    const total = sum(R.white.map((w) => w.dps));
    if (R.white.length > 1) {
      const t = el("div", "prow total");
      const d = el("strong", null, `${fmt(total, 1)} dps`);
      badge("white.total", d);
      t.append(el("div", "pname", "Total"), d);
      box.append(t);
    }
    return box;
  }

  function abilityRow(a) {
    const row = el("div", "abl" + (a.locked ? " locked" : ""));
    const ic = el("span", "icon aicon");
    iconStyle(ic, a.icon, 32);
    const main = el("div", "amain");
    const title = el("div", "atitle");
    title.append(el("strong", null, a.name));
    if (a.rank && a.ability.ranks.length > 1) title.append(el("span", "muted small", ` rank ${a.ability.ranks.indexOf(a.rank) + 1}`));
    main.append(title);
    const sub = el("div", "asub muted small");
    if (a.locked) {
      sub.textContent = a.locked;
    } else {
      const bits = [];
      if (a.channelMs) bits.push(`channeled ${fmt(a.channelMs / 1000, 1)}s`);
      else if (a.castMs) bits.push(`${fmt(a.castMs / 1000, 1)}s cast`);
      else bits.push("instant");
      if (a.cost) bits.push(`${fmt(a.cost)} ${POWER[a.powerType] || ""}`.trim());
      else if (a.costPct) bits.push(`${fmt(a.costPct)}% of base mana`);
      if (a.combo) bits.push("at 5 combo points");
      if (a.aoe) bits.push("area");
      if (a.cdMs >= 1500) bits.push(`${fmt(a.cdMs / 1000, a.cdMs % 1000 ? 1 : 0)}s cooldown`);
      if (a.mods.length) bits.push("talents: " + a.mods.join(", "));
      sub.textContent = bits.join(" · ");
    }
    main.append(sub);
    const nums = el("div", "anums");
    if (!a.locked) {
      if (a.dmax > 0) nums.append(el("div", null, fmt(a.dmin) === fmt(a.dmax) ? fmt(a.dmin) : `${fmt(a.dmin)}–${fmt(a.dmax)}`));
      if (a.dot > 0) nums.append(el("div", "small", `+${fmt(a.dot)} over ${fmt(a.ticks)} ticks`));
      if (a.heal > 0) nums.append(el("div", "green", `heals ${fmt(a.heal)}`));
      const avg = el("div", "aavg");
      if (a.expected > 0) {
        avg.append(el("strong", null, fmt(a.expected)), el("span", "muted small", " avg"));
        badge("ab." + a.name, avg);
      }
      nums.append(avg);
      if (a.perSecond) nums.append(el("div", "muted small", `${fmt(a.perSecond, 1)}/sec of cast`));
    }
    row.append(ic, main, nums);
    if (!a.locked) {
      const school = SCHOOL[a.school] || "";
      row.title = (a.rank.desc ? a.rank.desc + "\n\n" : "") +
        `${school} · ${a.kind === "magic" ? "spell" : a.kind} · crit ${fmt(a.critChance, 1)}% for ${fmt(a.critAvg)} · ` +
        `${fmt(a.miss, 1)}% miss${a.dodge ? `, ${fmt(a.dodge, 1)}% dodge` : ""}.\n` +
        "Avg = average damage per use, counting misses and crits" + (a.kind !== "magic" && a.school === 1 ? ", after armor." : ".");
    }
    return row;
  }

  function abilityList(R) {
    const box = el("div", "psec");
    box.append(el("h4", null, "Abilities"));
    const ready = R.abilities.filter((a) => !a.locked);
    const locked = R.abilities.filter((a) => a.locked);
    for (const a of ready) box.append(abilityRow(a));
    if (locked.length) {
      const det = el("details", "plocked");
      det.append(el("summary", "muted small", `${locked.length} not available yet (level or talent)`));
      for (const a of locked) det.append(abilityRow(a));
      box.append(det);
    }
    return box;
  }

  function panel(R, opts) {
    const box = el("div", "panel-in");
    if (opts.controls) box.append(controls(R));
    // a healer build (most points in a healing tree's spells) sees its healing first
    const heals = R.healing && R.healing.hps > 0;
    const healerFirst = heals && (!R.rotation || R.healing.hps > R.rotation.dps);
    if (healerFirst) box.append(healingBox(R), rotationBox(R));
    else box.append(rotationBox(R), ...(heals ? [healingBox(R)] : []));
    box.append(statGrid(R), whiteTable(R), abilityList(R));
    box.append(el("p", "muted small pnote", "Estimates. Forever's own numbers for abilities, gear and talents; " +
      "the attack table, armor and level attack power follow Classic's rules. Hover a line for details."));
    return box;
  }

  function snapshot(R) {
    const m = { rotation: R.rotation.dps, "healing.hps": R.healing ? R.healing.hps : 0, ap: R.S.ap, hit: R.S.hit, crit: R.S.crit, sp: R.S.sp, spellHit: R.S.spellHit, spellCrit: R.S.spellCrit,
      healing: R.S.healing, armor: R.S.armor, health: R.S.health, mana: R.S.mana, "white.total": sum(R.white.map((w) => w.dps)) };
    for (const k of STATS) m["attr." + k] = R.S.attr[k];
    for (const w of R.white) m["white." + w.label] = w.dps;
    for (const a of R.abilities) if (!a.locked) m["ab." + a.name] = a.expected;
    return m;
  }

  function render() {
    if (!KP.calc || !state.cls) return;
    const R = KP.calc.compute(ctx());
    const snap = snapshot(R);
    badges = {};
    if (prev && prev.cls === state.cls.token) {
      for (const [k, v] of Object.entries(snap)) {
        const o = prev.values[k];
        if (o == null || Math.abs(v - o) < 0.05) continue;
        const d = v - o;
        const pctKey = /hit|crit/i.test(k) && !k.startsWith("ab.") && !k.startsWith("white");
        badges[k] = { up: d > 0, text: (d > 0 ? "+" : "") + fmt(d, pctKey ? 1 : Math.abs(d) < 10 ? 1 : 0) };
      }
    }
    prev = { cls: state.cls.token, values: snap };
    const side = $("talentSide");
    if (side) { side.textContent = ""; side.append(panel(R, { controls: true })); }
    const gearBox = $("gearAttacks");
    if (gearBox) { gearBox.textContent = ""; gearBox.append(panel(R, { controls: true })); }
    const prioBox = $("prioSide");
    if (prioBox) { prioBox.textContent = ""; prioBox.append(panel(R, { controls: true })); }
  }

  app.hooks.push(render);
  addEventListener("hashchange", () => { readHash(); render(); });
  readHash();
  render();
  app.renderPanel = () => { prev = null; render(); }; // e.g. items finished loading: no change badges
})();
