// Kor'kron Planner: the Manual Crowd Pummeler check (Gear tab, Druids only).
// The MCP (item 9449) is a level 29 two-handed mace whose "Use:" gives +50% attack speed for 30 sec, with 3 charges and a
// 3-minute cooldown (all read from the item's data). In Cat and Bear Form the planner counts only a weapon's stats, not
// its damage (Classic's rule; a switch tries the other rule), so the haste keeps it worth holding long after its item
// level says otherwise. This box answers "when does another weapon beat it?" two ways: with the gear on now (each weapon
// against the MCP, and how much of the fight the haste must be up to break even), and level by level with the best gear
// at each level (Equip BiS's search with the MCP left out). The haste counts as an average over the fight, like the
// racial cooldowns (calc.js ctx.useBuffs); the other tabs and Equip BiS still leave "Use:" effects out.
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
  const QUALITY = ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"];

  const MCP_ID = 9449;
  // fight lengths to compare in (seconds; 0 = no haste at all)
  const FIGHTS = [
    [20, "20 sec (a mob, when it's ready)"],
    [60, "1 minute"],
    [120, "2 minutes"],
    [180, "3 minutes (a boss: the planner's usual fight)"],
    [300, "5 minutes"],
    [0, "No haste (out of charges or on cooldown)"],
  ];
  const FORM_NAMES = { cat: "Cat Form", bear: "Bear Form" };
  const opt = { form: "auto", fight: 180, rule: "stats" };
  let isOpen = true;
  let nowCache = { key: null, data: null };
  const scan = { key: null, rows: [], next: 0, last: 60, running: false, form: null };

  const formNow = () => (opt.form !== "auto" ? opt.form : app.prioTank && app.prioTank() ? "bear" : "cat");
  const roleOf = (form) => (form === "bear" ? "tank" : "dps");
  const useOf = (it) => it && (it.effects || []).find((e) => e.useAuras && e.useAuras.some((a) => a.aura === 319));
  const hasteOf = (use) => use.useAuras.find((a) => a.aura === 319).value;

  // the part of a fight of `sec` seconds the buff is up, used at the pull and again whenever it's ready (charges allowing)
  function shareOf(sec, use) {
    if (!sec) return 0;
    const dur = use.durMs / 1000, cd = use.cdMs ? use.cdMs / 1000 : Infinity;
    let up = 0;
    for (let k = 0; k < (use.charges || Infinity) && k * cd < sec; k++) up += Math.min(dur, sec - k * cd);
    return Math.min(1, up / sec);
  }
  // every share the fight choices need, so changing the fight doesn't redo the work
  const sharesFor = (use) => [...new Set(FIGHTS.map(([s]) => shareOf(s, use)).concat([0, 1]))].sort((a, b) => a - b);

  // the character settings for one evaluation: the form, the weapon rule, the MCP's haste (only when holding it)
  const extra = (form, use, share) => ({ form, formWeaponDps: opt.rule === "damage",
    useBuffs: use ? [{ auras: use.useAuras, share }] : undefined });

  // the MCP's result ({ v, e, dps }) at every share: [[share, result], ...]
  function mcpPoints(g, form, role, use) {
    const kit = app.gearKit;
    return sharesFor(use).map((x) => [x, kit.withCtx(extra(form, use, x), () => kit.bisEval(g, role))]);
  }
  const at = (pts, x) => {
    const p = pts.find((q) => Math.abs(q[0] - x) < 1e-9);
    return p ? p[1] : pts[0][1];
  };

  // the haste share where the MCP ties a score: 0 = its stats alone are worth as much; Infinity = never (even all fight)
  function breakEven(pts, v) {
    if (v <= pts[0][1].v) return 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, a] = pts[i - 1], [x1, b] = pts[i];
      if (v <= b.v) return b.v > a.v ? x0 + ((x1 - x0) * (v - a.v)) / (b.v - a.v) : x1;
    }
    return Infinity;
  }
  // a's lead over b in %: damage for Cat; for Bear the tank score (0.7 survival + 0.3 threat, in logs) as one number
  const lead = (role, a, b) => (role === "tank" ? (Math.exp(a.v - b.v) - 1) * 100 : b.v ? (a.v / b.v - 1) * 100 : 0);
  const fmt1 = (v) => (Math.round(v * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtPct = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))}%`;
  const fmtTime = (s) => {
    const t = Math.round(s);
    return t < 90 ? `${t} sec` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  };
  // "a 3-minute fight" / "3-minute fights" (no haste: "a fight with no haste")
  const fightWords = (plural) => {
    if (!opt.fight) return plural ? "fights with no haste" : "a fight with no haste";
    const len = opt.fight < 60 ? `${opt.fight}-second` : `${opt.fight / 60}-minute`;
    return plural ? `${len} fights` : `a ${len} fight`;
  };

  // the least share of any fight the haste is up when used whenever it's ready (30 sec / 3 min), while it has charges
  const floorOf = (use) => (use.cdMs ? Math.min(1, use.durMs / use.cdMs) : 0);
  // when another weapon beats the MCP, from the break-even share
  function evenText(b, use) {
    if (b === 0) return "Never (the MCP's stats alone are worth more)";
    if (b === Infinity) return "Always (even with the haste up all fight)";
    const pct = Math.max(1, Math.round(b * 100));
    if (b < floorOf(use)) return `Only with no haste (ties at ${pct}%)`;
    return b < 1 ? `Fights over ${fmtTime(use.durMs / 1000 / b)} (ties at ${pct}%)` : `Ties at ${pct}%`;
  }

  const name = (s) => (s.oh ? `${s.mh.name} + ${s.oh.name}` : s.mh.name);
  function itemName(it) {
    return el("span", "q-" + QUALITY[it.quality], it.name);
  }
  function setupCell(s) {
    const td = el("td", "mcp-name");
    td.append(itemName(s.mh));
    if (s.oh) td.append(" + ", itemName(s.oh));
    return td;
  }

  // a key for what the numbers depend on (the link minus the tab, plus the settings here)
  function keyOf(drop) {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    for (const k of ["v", "bd", ...drop]) p.delete(k);
    return p.toString() + "|" + opt.form + "|" + opt.rule + "|" + formNow();
  }

  // ------------------------------------------------------------ with your gear now

  function nowData(form, role, use) {
    const kit = app.gearKit, items = kit.items();
    const mcp = items.get(MCP_ID);
    const worn = Object.fromEntries(kit.equipped().map((w) => [w.slot, w.item]));
    const rest = { ...worn, mainHand: null, offHand: null };
    const out = {};
    kit.withCtx(extra(form, null, 0), () => {
      const ok = (it, s, mh) => it.id !== MCP_ID && kit.bisOk(it, s, mh);
      const mains = [...items.values()].filter((it) => kit.slotByKey.mainHand.inv.includes(it.inv) && ok(it, "mainHand", null));
      const keys = new Set(["armor"]);
      for (const it of items.values()) if (it.class === 2 || it.inv === 23) for (const k of Object.keys(it.stats || {})) keys.add(k);
      const W = kit.bisWeights(rest, role, [...keys]);
      // the best few two-handers, and one-handers with the best off-hand item for them (Druids can't dual wield)
      const twos = kit.shortlist(mains.filter((it) => it.inv === 17), W, 8, true);
      const ones = kit.shortlist(mains.filter((it) => it.inv !== 17), W, 6, true);
      const one = ones.length ? kit.bestFor(rest, "mainHand", ones, role) : null;
      const offs = one ? [...items.values()].filter((it) => kit.slotByKey.offHand.inv.includes(it.inv) && ok(it, "offHand", one)) : [];
      const off = offs.length ? kit.bestFor({ ...rest, mainHand: one }, "offHand", kit.shortlist(offs, W, 6, false), role) : null;
      const setups = [...twos.map((mh) => ({ mh })), ...ones.map((mh) => ({ mh, oh: off && !kit.whyNot(off, "offHand", mh) ? off : null }))];
      for (const s of setups) s.r = kit.bisEval({ ...rest, mainHand: s.mh, offHand: s.oh || null }, role);
      setups.sort((a, b) => b.r.v - a.r.v || b.r.e - a.r.e);
      out.top = setups.slice(0, 6);
      if (worn.mainHand && worn.mainHand.id !== MCP_ID) {
        const mine = out.top.find((s) => s.mh.id === worn.mainHand.id && (s.oh || null) === (worn.offHand || null));
        if (mine) mine.mine = true;
        else out.top.push({ mh: worn.mainHand, oh: worn.offHand || null, mine: true,
          r: kit.bisEval({ ...rest, mainHand: worn.mainHand, offHand: worn.offHand || null }, role) });
      }
      out.wearingMcp = !!(worn.mainHand && worn.mainHand.id === MCP_ID);
    });
    out.pts = mcpPoints({ ...rest, mainHand: mcp, offHand: null }, form, role, use);
    return out;
  }

  function renderNow(box, form, role, use, mcp) {
    box.append(el("h4", null, `With your gear now (level ${state.level})`));
    const why = app.gearKit.whyNot(mcp, "mainHand", null);
    if (why) {
      box.append(el("p", "mcp-head", `You can't hold the MCP yet: ${why} The level-by-level check below starts at level ${mcp.req}.`));
      return;
    }
    const key = keyOf([]);
    if (nowCache.key !== key) nowCache = { key, data: nowData(form, role, use) };
    const d = nowCache.data;
    const u = shareOf(opt.fight, use);
    const m = at(d.pts, u);
    const best = d.top.reduce((a, s) => (!a || s.r.v > a.r.v ? s : a), null); // the best other weapon, yours included
    const head = el("p", "mcp-head");
    if (best) {
      const l = lead(role, m, best.r);
      const win = l >= 0;
      head.append(opt.fight ? `In ${fightWords()} the MCP's haste is up ${Math.round(u * 100)}% of the time. ` : "With no haste the MCP is just its stats. ");
      head.append(el("strong", null, win ? `The MCP is ahead by ${fmtPct(l).slice(1)}` : `${name(best)} is ahead by ${fmtPct(-l).slice(1)}`));
      head.append(win ? ` of the best other weapon you could use (${name(best)}).` : " of the MCP.");
      box.append(head);
    }
    if (!d.top.length) { box.append(el("p", "muted small", "No other weapon to compare at this level.")); return; }

    const tank = role === "tank";
    const scroll = el("div", "lab-scroll");
    const t = el("table", "lab-table mcp-table");
    const thead = el("thead"), hr = el("tr");
    const cols = ["Weapon", tank ? "Threat (damage/sec)" : "Damage/sec", ...(tank ? ["Survival vs the MCP"] : []), tank ? "Overall vs the MCP" : "vs the MCP",
      "Beats the MCP", ""];
    cols.forEach((c, i) => { hr.append(el("th", i > 0 && i < cols.length - 2 ? "num" : null, c)); });
    thead.append(hr);
    t.append(thead);
    const tb = el("tbody");
    const wearBtn = (mh, oh, worn) => {
      const td = el("td");
      if (worn) { td.append(el("span", "muted small", "worn")); return td; }
      const b = el("button", "btn small", "Wear");
      b.type = "button";
      b.addEventListener("click", () => app.gearKit.wear(mh, oh));
      td.append(b);
      return td;
    };
    // the MCP's own row (the haste for the chosen fight; without it underneath)
    const self = el("tr", "mcp-row mcp-self");
    const selfName = el("td", "mcp-name");
    selfName.append(itemName(mcp), el("div", "muted small", opt.fight ? `haste up ${Math.round(u * 100)}% of the fight; with none: ${fmt1(at(d.pts, 0).dps)}` : "no haste: just its stats"));
    self.append(selfName, el("td", "num", fmt1(m.dps)));
    if (tank) self.append(el("td", "num", "—"));
    self.append(el("td", "num", "—"), el("td", "muted small", `+${hasteOf(use)}% attack speed for ${use.durMs / 1000} sec`), wearBtn(mcp, null, d.wearingMcp));
    tb.append(self);
    for (const s of d.top) {
      const tr = el("tr", "mcp-row" + (s.mine ? " mcp-mine" : ""));
      const nm = setupCell(s);
      if (s.mine) nm.append(el("div", "muted small", "your weapon"));
      tr.append(nm, el("td", "num", fmt1(s.r.dps)));
      if (tank) tr.append(el("td", "num", fmtPct((s.r.e / m.e - 1) * 100)));
      const l = lead(role, s.r, m);
      tr.append(el("td", "num " + (l > 0.05 ? "green" : l < -0.05 ? "warn" : ""), fmtPct(l)),
        el("td", "small", evenText(breakEven(d.pts, s.r.v), use)));
      tr.append(wearBtn(s.mh, s.oh, s.mine));
      tb.append(tr);
    }
    t.append(tb);
    scroll.append(t);
    box.append(scroll);
    box.append(el("p", "muted small", `The best weapons you could hold now by the planner's math, with the rest of your gear as it is ` +
      `(${tank ? "Bear Form: survival and threat, weighed 0.7 / 0.3 like Equip BiS's tanking" : "Cat Form damage"}). Same rules as ` +
      "Equip BiS: dungeon and raid loot with no level requirement counts from 5 levels below its item level; no profession items " +
      "or weapons whose damage isn't confirmed."));
  }

  // ------------------------------------------------------------ level by level

  function scanLevel(L, form, role, use, mcp) {
    const kit = app.gearKit;
    const keep = state.level;
    state.level = L; // the talents (your leveling path up to L), item levels and form ranks all follow the level
    try {
      const { g } = kit.computeBis({ role, ctx: extra(form, null, 0), skip: new Set([MCP_ID]), passes: 1 });
      const other = kit.withCtx(extra(form, null, 0), () => kit.bisEval(g, role));
      const pts = mcpPoints({ ...g, mainHand: mcp, offHand: null }, form, role, use);
      return { level: L, mh: g.mainHand, oh: g.offHand, other, pts };
    } finally {
      state.level = keep;
    }
  }

  function startScan() {
    const items = app.gearKit.items();
    const mcp = items && items.get(MCP_ID);
    if (!mcp) return;
    Object.assign(scan, { key: keyOf(["l", "g"]), rows: [], next: Math.max(1, mcp.req), running: true, form: formNow() });
    render();
    setTimeout(step, 30);
  }
  function step() {
    if (!scan.running) return;
    if (scan.key !== keyOf(["l", "g"])) { scan.running = false; render(); return; } // something changed: stop
    const items = app.gearKit.items(), mcp = items.get(MCP_ID), use = useOf(mcp);
    const t0 = performance.now();
    try {
      do { scan.rows.push(scanLevel(scan.next, scan.form, roleOf(scan.form), use, mcp)); scan.next++; }
      while (scan.next <= scan.last && performance.now() - t0 < 120);
    } catch (e) {
      console.error(e);
      scan.running = false;
      app.toast("The level check stopped with an error (see the browser console).");
    }
    if (scan.next > scan.last) scan.running = false;
    render();
    if (scan.running) setTimeout(step, 0);
  }

  // "29-35, 38, 40-60"
  function ranges(levels) {
    const out = [];
    for (const l of levels) {
      const last = out[out.length - 1];
      if (last && l === last[1] + 1) last[1] = l; else out.push([l, l]);
    }
    return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
  }

  function renderScan(box, use, mcp) {
    box.append(el("h4", null, "Level by level (the best gear at each level)"));
    const fresh = scan.key === keyOf(["l", "g"]);
    const role = roleOf(scan.form || formNow());
    const bar = el("div", "mcp-scanbar");
    const btn = el("button", "btn" + (scan.rows.length && fresh ? "" : " primary"),
      scan.running ? `Checking level ${scan.next}…` : scan.rows.length ? (fresh ? "Check again" : "Check again (something changed)") : `Check levels ${mcp.req} to 60`);
    btn.type = "button";
    btn.disabled = scan.running;
    btn.addEventListener("click", startScan);
    bar.append(btn, el("span", "muted small", "Runs Equip BiS's search at every level with the MCP left out, then puts the MCP " +
      "in that weapon's place. Takes a few seconds."));
    box.append(bar);
    if (!scan.rows.length) return;
    if (!fresh && !scan.running) box.append(el("p", "muted small", `These results (${FORM_NAMES[scan.form]}) are from before your last change.`));

    const u = shareOf(opt.fight, use);
    // who's ahead at each level; within half a percent counts as even (the math isn't that exact)
    const EVEN = 0.5;
    const rows = scan.rows.map((r) => {
      const l = lead(role, r.other, at(r.pts, u));
      return { ...r, m: at(r.pts, u), l, side: l >= EVEN ? "other" : l <= -EVEN ? "mcp" : "even" };
    });
    const levels = (side) => rows.filter((r) => r.side === side).map((r) => r.level);
    const mcpAhead = levels("mcp"), even = levels("even"), otherAhead = levels("other");
    const lastRow = rows[rows.length - 1];
    const sum = el("p", "mcp-head");
    sum.append(`In ${fightWords(true)}: `);
    if (!otherAhead.length) {
      sum.append(el("strong", null, `the MCP is never beaten ${scan.running ? "so far" : `from level ${rows[0].level} to ${lastRow.level}`}`),
        even.length ? ` (about even at ${ranges(even)}).` : ".");
    } else {
      // from which level another weapon stays ahead to the end (if it does)
      let k = rows.length;
      while (k > 0 && rows[k - 1].side === "other") k--;
      const parts = [];
      if (mcpAhead.length) parts.push(`the MCP is ahead at ${ranges(mcpAhead)}`);
      if (even.length) parts.push(`about even at ${ranges(even)}`);
      if (parts.length) sum.append(parts.join("; ") + ". ");
      if (k === 0) sum.append(el("strong", null, `Another weapon is ahead at every level${scan.running ? " so far" : ""}`), ".");
      else if (k < rows.length && !scan.running) {
        sum.append(el("strong", null, `From level ${rows[k].level}, ${name(rows[k])} beats it`), ", and another weapon stays ahead from there.");
        const early = otherAhead.filter((l) => l < rows[k].level);
        if (early.length) sum.append(` (Also ahead at ${ranges(early)}.)`);
      } else sum.append(`Another weapon is ahead at ${ranges(otherAhead)}.`);
    }
    box.append(sum);

    const tank = role === "tank";
    const scroll = el("div", "lab-scroll");
    const t = el("table", "lab-table mcp-table");
    const thead = el("thead"), hr = el("tr");
    const cols = ["Level", "Best other weapon", tank ? "MCP threat" : "MCP dps", tank ? "Other threat" : "Other dps",
      ...(tank ? ["Other survival"] : []), "Other vs MCP", "Other beats the MCP"];
    cols.forEach((c, i) => { hr.append(el("th", i === 0 || (i >= 2 && i < cols.length - 1) ? "num" : null, c)); });
    thead.append(hr);
    t.append(thead);
    const tb = el("tbody");
    for (const r of rows) {
      const tr = el("tr", "mcp-row" + (r.level === state.level ? " mcp-mine" : ""));
      tr.append(el("td", "num", String(r.level)), r.mh ? setupCell(r) : el("td", "muted", "none"),
        el("td", "num", fmt1(r.m.dps)), el("td", "num", fmt1(r.other.dps)));
      if (tank) tr.append(el("td", "num", fmtPct((r.other.e / r.m.e - 1) * 100)));
      tr.append(el("td", "num " + (r.l > 0.05 ? "green" : r.l < -0.05 ? "warn" : ""), fmtPct(r.l)),
        el("td", "small", evenText(breakEven(r.pts, r.other.v), use)));
      tb.append(tr);
    }
    t.append(tb);
    scroll.append(t);
    box.append(scroll);
    box.append(el("p", "muted small", `${FORM_NAMES[scan.form]}. Each level has its own best gear (Equip BiS's search for that level) ` +
      "and your talents up to that level from your leveling path (the order you clicked them), with your target and the group buffs " +
      "switched on in the panel. \"Other vs MCP\": green = the other weapon wins, red = the MCP wins" +
      (role === "tank" ? " (survival and threat weighed 0.7 / 0.3)" : "") + ". Changing the fight length re-reads the results " +
      "without checking again."));
    if (!state.seq.length) box.append(el("p", "small warn", "No talents picked: load a Feral build on the Builds tab first for a truer picture."));
  }

  // ------------------------------------------------------------ the box

  function select(label, value, options, onChange) {
    const lab = el("label", "pfield");
    const sel = el("select");
    for (const [v, text] of options) { const o = el("option", null, text); o.value = String(v); sel.append(o); }
    sel.value = String(value);
    sel.addEventListener("change", () => onChange(sel.value));
    lab.append(el("span", null, label), sel);
    return lab;
  }

  function render() {
    const box = $("mcpBox");
    if (!box) return;
    const show = !!(app.view && app.view() === "gear" && state.cls && state.cls.token === "DRUID");
    box.hidden = !show;
    if (!show) return;
    box.textContent = "";
    const det = el("details", "mcp-details");
    det.open = isOpen;
    det.addEventListener("toggle", () => {
      if (det.open === isOpen) return;
      isOpen = det.open;
      if (isOpen) render();
    });
    det.append(el("summary", null, "Manual Crowd Pummeler check: when does another weapon beat it?"));
    box.append(det);
    if (!isOpen) return;
    const kit = app.gearKit;
    const items = kit && kit.items();
    if (!items) { det.append(el("p", "muted", "Loading items…")); return; }
    const mcp = items.get(MCP_ID), use = useOf(mcp);
    if (!mcp || !use) { det.append(el("p", "muted", "The Manual Crowd Pummeler isn't in this build of the game data.")); return; }

    det.append(el("p", "muted small mcp-intro", `The MCP is a level ${mcp.req} two-handed mace (${Object.entries(mcp.stats || {})
      .map(([k, v]) => `${v} ${k[0].toUpperCase() + k.slice(1)}`).join(", ")}) whose "Use:" gives +${hasteOf(use)}% attack speed for ` +
      `${use.durMs / 1000} sec, with ${use.charges || "unlimited"} charges and a ${use.cdMs / 60000}-minute cooldown (game data). ` +
      "In Cat and Bear Form only a weapon's stats count, not its damage (Classic's rule, the planner's default), so that haste keeps " +
      "it ahead of weapons with a much higher item level. Here it's compared with every weapon you could hold, the haste averaged " +
      "over the fight."));

    const auto = app.prioTank && app.prioTank() ? "Bear" : "Cat";
    const bar = el("div", "mcp-bar");
    bar.append(
      select("Form", opt.form, [["auto", `Auto (${auto}: Priority tab's tank mode)`], ["cat", "Cat Form (damage)"], ["bear", "Bear Form (tanking)"]],
        (v) => { opt.form = v; render(); }),
      select("Fight", opt.fight, FIGHTS, (v) => { opt.fight = +v; render(); }),
      select("Weapon in forms", opt.rule, [["stats", "Only its stats count (Classic)"], ["damage", "Its damage counts too (guild bear sheet)"]],
        (v) => { opt.rule = v; render(); }));
    det.append(bar);

    const form = formNow(), role = roleOf(form);
    const nowBox = el("div", "mcp-sec");
    det.append(nowBox);
    try { renderNow(nowBox, form, role, use, mcp); } catch (e) { console.error(e); nowBox.append(el("p", "warn", "Couldn't work this out (see the browser console).")); }
    const scanBox = el("div", "mcp-sec");
    det.append(scanBox);
    renderScan(scanBox, use, mcp);

    const notes = el("ul", "muted small mcp-notes");
    for (const n of [
      `Haste: used at the pull and again whenever it's ready, it's up ${use.durMs / 1000} sec of a ${use.cdMs / 60000}-minute fight ` +
        `(${Math.round(shareOf(180, use) * 100)}%). It means more white hits (in Bear Form also more rage, so more Maul); energy ` +
        "and abilities don't speed up. Each use spends a charge; with none left the MCP is a plain stat stick (pick \"No haste\").",
      `"Ties at 13%": the share of the fight the haste must be up for the MCP to match that weapon. Used whenever it's ready, ` +
        `it's up all of a fight of ${use.durMs / 1000} sec or less and at least ${Math.round(floorOf(use) * 100)}% of any longer one ` +
        "(while it has charges), so a weapon that ties below that only wins once the charges are gone.",
      "Leveling: with a 3-minute cooldown most mobs get no haste, and the charges run out, so \"No haste\" or \"1 minute\" is closer.",
      "Which weapon rule Forever uses isn't in the game files. The planner uses Classic's (the form's own attack, so a weapon's damage " +
        "doesn't matter); the guild's bear spreadsheet counts the weapon's damage per second at the form's speed instead. Check in game.",
      "The buff has no weapon requirement or form restriction in the game data, so it may work in form and may stay if you swap " +
        "weapons after using it: check in game. This check assumes you keep holding the MCP.",
      "Only here: the other tabs and Equip BiS still leave \"Use:\" effects out of the math.",
    ]) notes.append(el("li", null, n));
    det.append(notes);
  }

  app.renderMcp = render;
  app.openMcp = () => {
    isOpen = true;
    render();
    const box = $("mcpBox");
    if (box && !box.hidden) box.scrollIntoView({ behavior: "smooth", block: "start" });
  };
})();
