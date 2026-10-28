// Kor'kron Planner: the Builds tab. Three suggested builds per class (data/builds.js, made by tools/make_builds.js)
// with the order to take each point while leveling. "Load" puts a build into the Talents tab, leveling path included.
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
  const ROLE = { dps: "Damage", tank: "Tank" };

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
    // set the Priority tab up for the build too
    if (state.prio) {
      if (build.weapons) state.prio.weapons = build.weapons;
      if (build.style) state.prio.style = build.style;
      state.prio.tank = build.role === "tank";
    }
    app.setView("talents", false);
    app.changed();
    app.toast(`Loaded "${build.name}". Its leveling path is under the trees.`);
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
    box.append(el("p", "muted small", `Estimated ${build.dps60} damage per second at 60, measured with ${build.reference.join(" + ")} ` +
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
      box.append(el("p", "muted", `No suggested ${state.cls.name} builds yet: Warrior and Hunter come first, the other classes follow.`));
      return;
    }
    const treeNames = KP.talents.trees[state.cls.token].map((t) => t.name);
    const how = el("p", "muted small build-how");
    how.textContent = "How these are made: the final builds are suggestions for each role. The leveling order comes from the " +
      "planner's math: you go down your main tree first and take its 31-point talent the moment it opens; within that, each " +
      "point goes where it adds the most damage (or, for a tank, survival and threat) at that level. Points the math can't " +
      "measure (utility, procs it doesn't model yet) say so and are placed by row.";
    box.append(how);
    const grid = el("div", "build-grid");
    for (const b of builds) grid.append(card(b, treeNames));
    box.append(grid);
  }

  app.hooks.push(render);
  app.renderBuilds = render;
  render();
})();
