// Kor'kron Planner: the Builds tab. Suggested builds per class (data/builds.js, made by tools/make_builds.js), two per
// spec: a leveling build (solo, 10-60) and a level 60 build (groups and raids), each with the order to take every
// point. "Load" puts a build into the Talents tab, leveling path included.
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
  const ROLE = { dps: "Damage", tank: "Tank", heal: "Healer" };
  const KINDS = [["leveling", "Leveling (solo, 10-60)"], ["group", "Level 60 (groups and raids)"]];

  // the loaded build goes in the link (&bd=key) so a shared link keeps its explanations; it only counts while the
  // picks still match the build
  const readBuild = () => { state.loadedBuild = new URLSearchParams(location.hash.replace(/^#/, "")).get("bd") || null; };
  readBuild();
  addEventListener("hashchange", readBuild);
  app.encoders.push(() => {
    if (!state.loadedBuild || !state.cls) return "";
    const b = ((KP.builds || {})[state.cls.token] || []).find((x) => x.key === state.loadedBuild);
    if (!b) return "";
    const seq = sequence(b);
    return seq.length === state.seq.length && seq.every((v, i) => v === state.seq[i]) ? "&bd=" + b.key : "";
  });

  function iconStyle(node, fileId, size) {
    const n = KP.talents.icons[String(fileId)];
    if (n == null) return;
    const cols = KP.talents.iconCols;
    node.style.backgroundSize = `${cols * size}px auto`;
    node.style.backgroundPosition = `${-(n % cols) * size}px ${-Math.floor(n / cols) * size}px`;
  }

  // the build's points in the order they're taken, as indexes into this class's talent list (the link format)
  function sequence(build) {
    const flat = app.flat();
    return build.order.map((o) => flat.findIndex((t) => t.id === o.id)).filter((i) => i >= 0);
  }

  function load(build) {
    state.seq = sequence(build);
    state.loadedBuild = build.key; // "Why these talents" uses the build's own numbers while the picks still match
    // set the Priority tab up for the build too
    if (state.prio) {
      // the Priority tab's weapon choice (a Rogue picks a main hand: daggers or anything else)
      if (build.weapons) state.prio.weapons = state.cls.token === "ROGUE" ? (build.weapons === "daggers" ? "dagger" : "other") : build.weapons;
      if (build.style && state.cls.token === "HUNTER") state.prio.style = build.style; // ranged or melee Hunter
      state.prio.tank = build.role === "tank";
      // leveling builds deal damage (even the "healer who fights" ones); level 60 healer builds heal
      state.prio.role = build.kind === "leveling" ? "dps" : build.role === "heal" ? "heal" : "auto";
    }
    app.setView("talents", false);
    app.changed();
    app.toast(`Loaded "${build.name}". Its leveling path and why each talent is picked are under the trees.`);
  }

  // The stance or form a build lives in (the same rule the estimates use: calc.js warriorStance, tank mode, Shadowform,
  // Moonkin Form), with that stance's numbers from the game data and when to dance out of it.
  const STANCE_KEY = { battle: "Battle Stance", defensive: "Defensive Stance", berserker: "Berserker Stance" };
  function stanceNumbers(name) {
    const s = (((KP.abilities.STANCES || {})[state.cls.token]) || []).find((x) => x.name === name);
    const sign = (v) => (v > 0 ? "+" : "−") + Math.abs(v);
    const bits = ((s && s.auras) || []).map((a) => a.aura === 290 || a.aura === 52 ? `${sign(a.value)}% crit`
      : a.aura === 79 && a.value ? `${sign(a.value)}% damage dealt` : a.aura === 87 && a.value ? `${sign(a.value)}% damage taken`
        : a.aura === 10 && a.value ? `${sign(a.value)}% threat` : null).filter(Boolean);
    return bits.length ? ` (${bits.join(", ")}; game data)` : "";
  }
  function stanceNote(build) {
    const tok = state.cls.token;
    const flat = app.flat();
    const ranks = flat.map(() => 0);
    for (const o of build.order) { const i = flat.findIndex((t) => t.id === o.id); if (i >= 0) ranks[i]++; }
    const has = (name) => flat.some((t, i) => t.name === name && ranks[i]);
    if (tok === "WARRIOR") {
      const ctx = (level) => ({ cls: state.cls, level, flat, ranks, tank: build.role === "tank" ? true : undefined });
      const st = KP.calc.warriorStance(ctx(60));
      const early = build.kind === "leveling" && st !== "battle" ? KP.calc.warriorStance(ctx(st === "berserker" ? 29 : 9)) : st;
      const from = early !== st ? `${STANCE_KEY[early]} until level ${st === "berserker" ? 30 : 10}, then ` : "";
      if (st === "berserker") {
        return `${from}${STANCE_KEY.berserker}${stanceNumbers("Berserker Stance")} for most of the fight. Dance to Battle Stance for ` +
          `Overpower when it lights up${has("Sweeping Strikes") ? " and Sweeping Strikes on packs" : ""}, then back. The numbers count Berserker Stance.`;
      }
      if (st === "defensive") {
        return `${from}${STANCE_KEY.defensive}${stanceNumbers("Defensive Stance")} while you hold the target. When you're not tanking, ` +
          "Battle Stance (or Berserker Stance from level 30) to deal damage. The numbers count Defensive Stance.";
      }
      return `${STANCE_KEY.battle}${stanceNumbers("Battle Stance")} for most of the fight: Overpower, Sweeping Strikes and Spearing Strike ` +
        "only work there. Dance to Berserker Stance for Whirlwind (from level 30) when you have the rage, then back. The numbers count Battle Stance.";
    }
    if (tok === "DRUID") {
      if (build.role === "tank") return "Bear Form (Dire Bear Form from level 40) while tanking; Cat Form or caster form between pulls if you like. The numbers count Bear Form.";
      if (/^Feral|Cat/i.test(build.name) || has("Shred") || (build.points[1] > build.points[0] && build.points[1] > build.points[2])) {
        return "Cat Form for damage; out of it only to heal yourself or buff. Ravage and Pounce need Prowl. The numbers count Cat Form.";
      }
      if (has("Moonkin Form")) return "Moonkin Form for damage (no heals in it, game data); drop it to heal. The numbers count Moonkin Form.";
      return null;
    }
    if (tok === "PRIEST" && has("Shadowform")) {
      return "Shadowform for damage (+Shadow damage, cheaper Shadow spells; no Holy spells or Holy talents in it, game data). Drop it to heal.";
    }
    return null;
  }

  function card(build, treeNames) {
    const box = el("article", "build-card");
    const head = el("div", "build-head");
    const flat = app.flat();
    const capstone = build.order.find((o) => /31-point/.test(o.why));
    const capT = capstone && flat.find((t) => t.id === capstone.id);
    const ic = el("span", "icon build-icon");
    if (capT) iconStyle(ic, capT.icon, 40);
    const titles = el("div");
    titles.append(el("h3", null, build.name));
    const meta = el("div", "build-meta");
    meta.append(el("span", "prio-tag", ROLE[build.role] || build.role),
      el("span", "muted small", `${build.points.join(" / ")} (${treeNames.map((n, i) => `${n} ${build.points[i]}`).filter((_, i) => build.points[i]).join(", ")})`));
    titles.append(meta);
    head.append(ic, titles);
    box.append(head, el("p", "build-summary", build.summary));
    if (build.provisional) {
      const p = el("p", "build-stance");
      p.append(el("strong", null, "Provisional: "), build.provisional);
      box.append(p);
    }
    const stance = stanceNote(build);
    if (stance) {
      const p = el("p", "build-stance");
      p.append(el("strong", null, "Stance: "), stance);
      box.append(p);
    }
    if (capstone) box.append(el("p", "muted small", `${capstone.name} at level ${capstone.level}.`));
    if (build.kind === "leveling") {
      box.append(el("p", "muted small", `Solo at 60: about ${build.kill60} sec per same-level mob and ${build.rest60}% of your time ` +
        `eating and drinking (${build.dps60} damage per second while fighting). Measured with the best green or blue gear you ` +
        `can use at each level (at 60: ${build.reference.join(" + ")} and ${build.armorPieces} armor pieces), no group buffs. ` +
        "Use it to compare builds, not as a promise."));
      const pair = ((KP.builds || {})[state.cls.token] || []).find((x) => x.kind !== "leveling" && x.key === build.pair);
      if (pair) {
        const go = el("button", "btn small", `At 60, for groups: ${pair.name}`);
        go.type = "button";
        go.addEventListener("click", () => { state.buildKind = "group"; render(); });
        box.append(go);
      }
    } else box.append(el("p", "muted small", build.hps60 != null
      ? `Estimated ${build.hps60} healing per second at 60 on one target (sustained over a fight, no overhealing), measured with ` +
        `${build.reference.join(" + ")} and raid buffs on. Use it to compare builds, not as a promise.`
      : `Estimated ${build.dps60} damage per second at 60, measured with ${build.reference.join(" + ")} ` +
        "and raid buffs on. Use it to compare builds, not as a promise."));
    const btn = el("button", "btn primary", "Load this build");
    btn.type = "button";
    btn.addEventListener("click", () => load(build));
    box.append(btn);

    const det = el("details", "build-order");
    det.append(el("summary", null, "Leveling order: what to take at each level, and why"));
    const ol = el("ol");
    for (const o of build.order) {
      const t = flat.find((x) => x.id === o.id);
      const li = el("li");
      const ti = el("span", "icon build-ticon");
      if (t) iconStyle(ti, t.icon, 20);
      li.append(el("span", "build-lv", `Lv ${o.level}`), ti, el("span", null, `${o.name} ${o.rank}/${t ? t.ranks.length : "?"}`),
        el("span", "muted small", " " + o.why));
      ol.append(li);
    }
    det.append(ol);
    box.append(det);
    return box;
  }

  function render() {
    if (!app.view || app.view() !== "builds" || !state.cls) return;
    const box = $("builds");
    box.textContent = "";
    const builds = (KP.builds || {})[state.cls.token];
    if (!builds || !builds.length) {
      box.append(el("p", "muted", `No suggested ${state.cls.name} builds yet.`));
      return;
    }
    const treeNames = KP.talents.trees[state.cls.token].map((t) => t.name);
    // leveling or level 60: starts on leveling below 60
    const kind = state.buildKind || (state.level < 60 ? "leveling" : "group");
    const bar = el("div", "build-kinds");
    for (const [k, label] of KINDS) {
      const b = el("button", "btn" + (k === kind ? " primary" : ""), label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(k === kind));
      b.addEventListener("click", () => { state.buildKind = k; render(); });
      bar.append(b);
    }
    box.append(bar);
    const how = el("p", "muted small build-how");
    how.textContent = kind === "leveling"
      ? "Leveling builds are for questing alone as that spec. The order comes from the planner's math: at each level the next " +
        "point goes where you'd level fastest, counting both how quickly you kill a same-level mob and how long you then eat " +
        "and drink (so damage, survival and mana savings all count), with no group buffs and the gear you'd have at that level. " +
        "You go down your main tree first and take its 31-point talent at 40. Mob health and damage and food and drink rates " +
        "come from Classic (they aren't in Forever's files). Points the math can't measure (pets, utility, procs) say so and " +
        "are placed by row."
      : "Level 60 builds are for groups and raids: measured with raid buffs on against a raid boss. The final builds are " +
        "suggestions for each role. The leveling order comes from the planner's math: you go down your main tree first and " +
        "take its 31-point talent the moment it opens; within that, each point goes where it adds the most damage (for a tank, " +
        "survival and threat; for a healer, healing) at that level. Points the math can't measure (utility, procs it doesn't " +
        "model yet) say so and are placed by row.";
    box.append(how);
    const grid = el("div", "build-grid");
    for (const b of builds.filter((x) => (x.kind || "group") === kind)) grid.append(card(b, treeNames));
    box.append(grid);
  }

  app.hooks.push(render);
  app.renderBuilds = render;
  render();
})();
