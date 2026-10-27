// Kor'kron Planner: talent calculator.
// The build is a list of talent picks in the order they were clicked; that order is the leveling path.
(function () {
  "use strict";

  const MAX_POINTS = 51;
  const FIRST_TALENT_LEVEL = 10;
  const PER_ROW = 5;          // points needed in a tree to unlock each new row
  const LINK_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

  const DATA = window.KP || {};
  const classes = DATA.classes.classes;
  const races = DATA.classes.races;
  const T = DATA.talents;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // ------------------------------------------------------------ state

  const state = { cls: null, race: null, level: 60, seq: [] };
  let flat = [];        // this class's talents, in link order: tree by tree, row by row
  let byId = new Map(); // talent id -> entry in flat

  // Shared with the gear page (js/gear.js): it adds its own part of the link and redraws after changes.
  const app = (window.KP.app = {
    state,
    encoders: [],   // functions returning extra link parts, e.g. "&g=..."
    hooks: [],      // called after every change
    flat: () => flat,
    liveRanks: () => tally(state.seq.slice(0, pointsForLevel(state.level))).ranks,
    changed: () => changed(),
    toast: (msg) => toast(msg),
  });

  const pointsForLevel = (lvl) => Math.max(0, Math.min(MAX_POINTS, lvl - FIRST_TALENT_LEVEL + 1));
  const levelForPoint = (n) => n + FIRST_TALENT_LEVEL; // n = 0-based pick number

  function loadClass(token) {
    state.cls = classes.find((c) => c.token === token) || classes[0];
    flat = [];
    byId = new Map();
    T.trees[state.cls.token].forEach((tree, ti) => {
      tree.talents.forEach((t) => {
        const entry = { ...t, tree: ti, treeName: tree.name, index: flat.length };
        flat.push(entry);
        byId.set(t.id, entry);
      });
    });
    const ok = races.filter((r) => r.classes.includes(state.cls.id));
    if (!state.race || !ok.some((r) => r.id === state.race)) state.race = ok[0] && ok[0].id;
    document.documentElement.style.setProperty("--class", state.cls.color);
  }

  // Replays picks and returns counts, or the first pick that isn't allowed.
  function tally(seq) {
    const ranks = new Array(flat.length).fill(0);
    const treePts = [0, 0, 0];
    for (let k = 0; k < seq.length; k++) {
      const t = flat[seq[k]];
      if (!t || problem(t, ranks, treePts, k)) return { ranks, treePts, bad: k };
      ranks[t.index]++;
      treePts[t.tree]++;
    }
    return { ranks, treePts, bad: -1 };
  }

  // Why a point can't go into talent t right now (null if it can).
  function problem(t, ranks, treePts, total) {
    if (ranks[t.index] >= t.ranks.length) return "Already at max rank.";
    if (total >= MAX_POINTS) return "All " + MAX_POINTS + " points are spent.";
    if (treePts[t.tree] < t.row * PER_ROW) return `Requires ${t.row * PER_ROW} points in ${t.treeName}.`;
    for (const req of t.requires || []) {
      const p = byId.get(req.talent);
      if (p && ranks[p.index] < req.rank) return `Requires ${req.rank} point${req.rank > 1 ? "s" : ""} in ${p.name}.`;
    }
    return null;
  }

  // Put picks in a valid order, keeping the original order as much as possible. null if impossible.
  function reorder(seq) {
    const rest = seq.slice();
    const out = [];
    const ranks = new Array(flat.length).fill(0);
    const treePts = [0, 0, 0];
    while (rest.length) {
      const k = rest.findIndex((i) => !problem(flat[i], ranks, treePts, out.length));
      if (k < 0) return null;
      const i = rest.splice(k, 1)[0];
      out.push(i);
      ranks[i]++;
      treePts[flat[i].tree]++;
    }
    return out;
  }

  // For a damaged link: keep the picks that work, in order, and drop the rest.
  function keepValid(seq) {
    const out = [];
    const ranks = new Array(flat.length).fill(0);
    const treePts = [0, 0, 0];
    for (const i of seq) {
      if (problem(flat[i], ranks, treePts, out.length)) continue;
      out.push(i);
      ranks[i]++;
      treePts[flat[i].tree]++;
    }
    return out;
  }

  function addPoint(t) {
    const avail = pointsForLevel(state.level);
    if (state.seq.length >= avail) {
      if (state.level < 60 && state.seq.length < MAX_POINTS) {
        return toast(state.seq.length > avail
          ? "Some points are planned past this level. Raise the level to add more."
          : `No points left at level ${state.level}. Raise the level to plan further.`);
      }
      return toast("All " + MAX_POINTS + " points are spent.");
    }
    const { ranks, treePts } = tally(state.seq);
    const why = problem(t, ranks, treePts, state.seq.length);
    if (why) return toast(why);
    state.seq.push(t.index);
    changed();
  }

  function removePoint(t) {
    const at = state.seq.lastIndexOf(t.index);
    if (at < 0) return;
    const next = state.seq.slice();
    next.splice(at, 1);
    const fixed = reorder(next);
    if (!fixed) return toast("Other talents depend on this one. Remove those first.");
    state.seq = fixed;
    changed();
  }

  function resetTree(ti) {
    const next = state.seq.filter((i) => flat[i].tree !== ti);
    const fixed = reorder(next);
    state.seq = fixed || next;
    changed();
  }

  // ------------------------------------------------------------ share link

  function encode() {
    const seq = state.seq.map((i) => LINK_CHARS[i]).join("");
    return `#c=${state.cls.token.toLowerCase()}&r=${state.race}&l=${state.level}&t=${seq}` +
      app.encoders.map((f) => f()).join("");
  }

  function decode(hash) {
    const p = new URLSearchParams(hash.replace(/^#/, ""));
    const token = (p.get("c") || "").toUpperCase();
    if (!classes.some((c) => c.token === token)) return false;
    state.race = parseInt(p.get("r"), 10) || null;
    loadClass(token);
    const lvl = parseInt(p.get("l"), 10);
    state.level = lvl >= 1 && lvl <= 60 ? lvl : 60;
    const seq = [...(p.get("t") || "")].map((ch) => LINK_CHARS.indexOf(ch)).filter((i) => i >= 0 && i < flat.length);
    state.seq = reorder(seq.slice(0, MAX_POINTS)) || keepValid(seq);
    return true;
  }

  function changed() {
    history.replaceState(null, "", encode());
    render();
    if (openTip) showTip(openTip.talent, openTip.anchor, openTip.sticky);
    app.hooks.forEach((f) => f());
  }

  // ------------------------------------------------------------ drawing

  function iconStyle(node, fileId, size) {
    const n = T.icons[String(fileId)];
    if (n == null) return;
    const cols = T.iconCols;
    node.style.backgroundSize = `${cols * size}px auto`;
    node.style.backgroundPosition = `${-(n % cols) * size}px ${-Math.floor(n / cols) * size}px`;
  }

  function buildClassPicker() {
    const box = $("classPicker");
    box.textContent = "";
    for (const c of classes) {
      const b = el("button", "class-btn");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.style.setProperty("--c", c.color);
      const ic = el("span", "icon");
      iconStyle(ic, c.icon, 28);
      b.append(ic, el("span", "name", c.name));
      b.addEventListener("click", () => {
        if (state.cls.token === c.token) return;
        if (state.seq.length && !confirm(`Switch to ${c.name}? This clears your ${state.cls.name} talents.`)) return;
        state.seq = [];
        loadClass(c.token);
        hideTip();
        changed();
      });
      b.dataset.token = c.token;
      box.append(b);
    }
  }

  function geometry() {
    const cs = getComputedStyle(document.documentElement);
    const size = parseFloat(cs.getPropertyValue("--icon"));
    const gx = parseFloat(cs.getPropertyValue("--gap-x"));
    const gy = parseFloat(cs.getPropertyValue("--gap-y"));
    return { size, gx, gy, x: (col) => col * (size + gx), y: (row) => row * (size + gy) };
  }

  function render() {
    const { ranks, treePts } = tally(state.seq);
    const avail = pointsForLevel(state.level);
    const activeSeq = state.seq.slice(0, avail);
    const live = tally(activeSeq); // what's learned at the chosen level
    const g = geometry();

    // class buttons, race, level
    for (const b of $("classPicker").children) b.setAttribute("aria-checked", b.dataset.token === state.cls.token);
    const sel = $("race");
    sel.textContent = "";
    for (const r of races.filter((r) => r.classes.includes(state.cls.id))) {
      const o = el("option", null, `${r.name} (${r.faction})`);
      o.value = r.id;
      sel.append(o);
    }
    sel.value = state.race;
    $("levelRange").value = state.level;
    $("levelNum").value = state.level;

    // points summary
    const pts = $("points");
    pts.textContent = "";
    if (state.level < FIRST_TALENT_LEVEL) {
      pts.append(`Talents start at level ${FIRST_TALENT_LEVEL}.`);
    } else {
      const s = el("strong", null, String(Math.min(state.seq.length, avail)));
      pts.append("Points: ", s, ` / ${avail}`);
    }
    pts.append(el("span", "split", `(${live.treePts.join(" / ")})`));
    if (state.seq.length > avail) pts.append(el("span", "split", `+${state.seq.length - avail} planned later`));

    // trees
    const box = $("trees");
    box.textContent = "";
    T.trees[state.cls.token].forEach((tree, ti) => {
      const panel = el("div", "tree");
      const head = el("div", "tree-head");
      const ic = el("span", "icon");
      iconStyle(ic, tree.icon, 30);
      const reset = el("button", "reset", "Reset");
      reset.type = "button";
      reset.title = `Reset ${tree.name}`;
      reset.addEventListener("click", () => resetTree(ti));
      head.append(ic, el("h3", null, tree.name), el("span", "spent", String(live.treePts[ti])), reset);

      const grid = el("div", "grid");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      grid.append(svg);
      const mine = flat.filter((t) => t.tree === ti);
      for (const t of mine) {
        // prerequisite arrows
        for (const req of t.requires || []) {
          const p = byId.get(req.talent);
          if (p) drawArrow(svg, g, p, t, live.ranks[p.index] >= req.rank);
        }
        const b = el("button", "talent icon");
        b.type = "button";
        b.style.left = g.x(t.col) + "px";
        b.style.top = g.y(t.row) + "px";
        b.dataset.index = t.index;
        iconStyle(b, t.icon, g.size - 4); // inside the 2px border
        const now = live.ranks[t.index];
        const planned = ranks[t.index] - now;
        const max = t.ranks.length;
        const canAdd = !problem(t, live.ranks, live.treePts, activeSeq.length);
        if (now >= max) b.classList.add("max");
        else if (now > 0) b.classList.add("some");
        else if (planned > 0) b.classList.add("planned-only");
        else if (canAdd) b.classList.add("open");
        const rank = el("span", "rank", `${now}/${max}`);
        if (planned > 0) {
          rank.textContent = `${now}`;
          rank.append(el("span", "plan", `+${planned}`), `/${max}`);
        }
        b.append(rank);
        if (t.unconfirmed) b.append(el("span", "flag unconfirmed"));
        else if (t.estimated) b.append(el("span", "flag"));
        b.setAttribute("aria-label", `${t.name}, rank ${now} of ${max}`);
        hookTalent(b, t);
        grid.append(b);
      }
      panel.append(head, grid);
      box.append(panel);
    });

    // leveling path
    const ol = $("path");
    ol.textContent = "";
    if (!state.seq.length) ol.append(el("li", "empty", "No talents picked yet."));
    const seen = new Array(flat.length).fill(0);
    state.seq.forEach((i, k) => {
      const t = flat[i];
      seen[i]++;
      const li = el("li", k >= avail ? "planned" : null);
      const ic = el("span", "icon");
      iconStyle(ic, t.icon, 20);
      li.append(el("span", "lvl", "Lv " + levelForPoint(k)), ic, el("span", null, t.name),
        el("span", "r", `${seen[i]}/${t.ranks.length}`));
      ol.append(li);
    });

    const m = DATA.meta || {};
    $("dataNote").textContent = `Data: WoW: Forever game files, build ${m.build || "?"}, read from wago.tools on ${m.built || "?"}.`;
  }

  // Arrow from talent a down/across to talent b (straight, or across then down).
  function drawArrow(svg, g, a, b, on) {
    const ns = "http://www.w3.org/2000/svg";
    const half = g.size / 2;
    const ax = g.x(a.col) + half, ay = g.y(a.row) + half;
    const bx = g.x(b.col) + half, by = g.y(b.row) + half;
    let d, tip;
    if (a.row === b.row) {
      const dir = Math.sign(bx - ax);
      const end = bx - dir * (half + 2);
      d = `M${ax + dir * half} ${ay} H${end}`;
      tip = [[end + dir * 2, ay], [end - dir * 6, ay - 6], [end - dir * 6, ay + 6]];
    } else {
      const end = by - half - 2;
      d = a.col === b.col ? `M${ax} ${ay + half} V${end}` : `M${ax + Math.sign(bx - ax) * half} ${ay} H${bx} V${end}`;
      tip = [[bx, end + 2], [bx - 6, end - 6], [bx + 6, end - 6]];
    }
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    const poly = document.createElementNS(ns, "polygon");
    poly.setAttribute("points", tip.map((p) => p.join(",")).join(" "));
    if (on) { path.classList.add("on"); poly.classList.add("on"); }
    svg.append(path, poly);
  }

  // ------------------------------------------------------------ input and tooltip

  let lastPointer = "mouse";
  let openTip = null;
  document.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; }, true);

  function hookTalent(b, t) {
    b.addEventListener("click", (e) => {
      if (lastPointer === "touch") {
        showTip(t, b, true); // on phones: tap shows details with + / - buttons
        return;
      }
      if (e.shiftKey) removePoint(t); else addPoint(t);
    });
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); removePoint(t); });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "-") { e.preventDefault(); removePoint(t); }
    });
    b.addEventListener("mouseenter", () => { if (lastPointer !== "touch") showTip(t, b, false); });
    b.addEventListener("mouseleave", () => { if (openTip && !openTip.sticky) hideTip(); });
    b.addEventListener("focus", () => { if (lastPointer !== "touch") showTip(t, b, false); });
    b.addEventListener("blur", () => { if (openTip && !openTip.sticky) hideTip(); });
  }

  function showTip(t, anchor, sticky) {
    // the grid is redrawn on every change, so find the fresh button for this talent
    if (!anchor.isConnected) {
      anchor = document.querySelector(`.talent[data-index="${t.index}"]`);
      if (!anchor) return hideTip();
    }
    openTip = { talent: t, anchor, sticky };
    const tip = $("tooltip");
    tip.textContent = "";
    tip.classList.toggle("sticky", sticky);
    const avail = pointsForLevel(state.level);
    const activeSeq = state.seq.slice(0, avail);
    const live = tally(activeSeq);
    const now = live.ranks[t.index];
    const max = t.ranks.length;
    tip.append(el("h4", null, t.name), el("div", "rk", `Rank ${now}/${max}`));
    const why = now < max ? problem(t, live.ranks, live.treePts, activeSeq.length) : null;
    if (why && !why.startsWith("All") && !why.startsWith("Already")) tip.append(el("div", "req", why));
    if (now > 0) tip.append(el("p", null, t.desc[now - 1]));
    if (now < max) {
      if (now > 0) tip.append(el("div", "lbl", "Next rank:"));
      tip.append(el("p", null, t.desc[now]));
    }
    if (t.unconfirmed) {
      tip.append(el("div", "note unconfirmed", "Not in Forever's game files yet. This is the Classic version and may be different in Forever."));
    } else if (t.estimated === "reworked") {
      tip.append(el("div", "note", "Changed in Forever. The game files only give the full value, so the numbers per rank are estimated."));
    } else if (t.estimated) {
      tip.append(el("div", "note", "Numbers per rank are estimated from Classic (Forever's files only give one rank)."));
    }
    // what one more point would change in the numbers (from js/panel.js)
    if (now < max && app.previewTalent) {
      const lines = app.previewTalent(t.index) || [];
      if (lines.length) {
        tip.append(el("div", "lbl", now ? "One more point:" : "Learning it:"));
        const ul = el("ul", "preview");
        for (const l of lines.slice(0, 8)) {
          const li = el("li", l.up ? "up" : "down");
          li.append(el("span", null, l.label + ": "), l.text);
          ul.append(li);
        }
        if (lines.length > 8) ul.append(el("li", "muted", `…and ${lines.length - 8} more`));
        tip.append(ul);
      } else if (t.effects && t.effects[now] && t.effects[now].length) {
        tip.append(el("div", "note muted", "Doesn't change the numbers we calculate yet."));
      }
    }
    if (sticky) {
      const row = el("div", "tbtns");
      const minus = el("button", "btn", "− Remove");
      const plus = el("button", "btn primary", "+ Add");
      minus.type = plus.type = "button";
      minus.addEventListener("click", () => removePoint(t));
      plus.addEventListener("click", () => addPoint(t));
      row.append(minus, plus);
      tip.append(row);
    } else if (now < max && !why) {
      tip.append(el("div", "hint2", "Click to learn"));
    }
    tip.hidden = false;
    placeTip(tip, anchor);
  }

  function placeTip(tip, anchor) {
    const r = anchor.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.right + 12;
    if (x + w > innerWidth - 8) x = r.left - w - 12;
    if (x < 8) x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    let y = r.top;
    if (x === r.right + 12 || x === r.left - w - 12) y = Math.min(r.top, innerHeight - h - 8);
    else y = r.bottom + 10 + h > innerHeight ? r.top - h - 10 : r.bottom + 10;
    tip.style.left = x + "px";
    tip.style.top = Math.max(8, y) + "px";
  }

  function hideTip() {
    openTip = null;
    $("tooltip").hidden = true;
  }

  document.addEventListener("click", (e) => {
    if (openTip && openTip.sticky && !e.target.closest(".tooltip, .talent")) hideTip();
  });
  addEventListener("scroll", () => { if (openTip && !openTip.sticky) hideTip(); }, { passive: true });
  addEventListener("resize", () => render());

  let toastTimer = 0;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------ controls

  function setLevel(v) {
    const lvl = Math.max(1, Math.min(60, parseInt(v, 10) || 1));
    if (lvl === state.level) return;
    state.level = lvl;
    changed();
  }
  $("levelRange").addEventListener("input", (e) => setLevel(e.target.value));
  $("levelNum").addEventListener("change", (e) => setLevel(e.target.value));
  $("race").addEventListener("change", (e) => { state.race = parseInt(e.target.value, 10); changed(); });
  $("resetAll").addEventListener("click", () => {
    if (state.seq.length && !confirm("Clear all talents?")) return;
    state.seq = [];
    changed();
  });
  $("copyLink").addEventListener("click", async () => {
    const url = location.href.split("#")[0] + encode();
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Paste it in Discord to share this build.");
    } catch {
      prompt("Copy this link:", url);
    }
  });
  addEventListener("hashchange", () => {
    if (location.hash !== encode() && decode(location.hash)) {
      hideTip();
      render();
      app.hooks.forEach((f) => f());
    }
  });
  if ("ontouchstart" in window) $("hint").textContent = "Tap a talent to see it, then use + and − to add or remove points.";

  // ------------------------------------------------------------ start

  buildClassPicker();
  if (!decode(location.hash)) {
    loadClass("WARRIOR");
  }
  render();
})();
