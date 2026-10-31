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
      if (build.weapons) state.prio.weapons = build.weapons;
      if (build.style) state.prio.style = build.style;
      state.prio.tank = build.role === "tank";
    }
    app.setView("talents", false);
    app.changed();
    app.toast(`Loaded "${build.name}". Its leveling path and why each talent is picked are under the trees.`);
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
