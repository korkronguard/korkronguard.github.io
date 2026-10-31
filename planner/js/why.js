// Kor'kron Planner: "Why these talents", under the leveling path on the Talents tab. For every talent picked: what
// it does (the game's tooltip), why it's worth the points (measured by taking it out and comparing, or a written
// note when the math can't see it), what it unlocks, and when it's taken while leveling. When the picks are one of
// the suggested builds (Builds tab), the build's own measurements at level 60 are used: for a level 60 build its
// damage/healing/survival in a group, for a leveling build how much faster it levels solo (kills plus resting).
(function () {
  "use strict";

  const KP = window.KP;
  const app = KP.app;
  const state = app.state;
  const PER_ROW = 5, FIRST_LEVEL = 10;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const fmt = (v, d = 1) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

  function iconStyle(node, fileId, size) {
    const n = KP.talents.icons[String(fileId)];
    if (n == null) return;
    const cols = KP.talents.iconCols;
    node.style.backgroundSize = `${cols * size}px auto`;
    node.style.backgroundPosition = `${-(n % cols) * size}px ${-Math.floor(n / cols) * size}px`;
  }

  // the suggested build these picks came from, if they still match it point for point
  function loadedBuild() {
    if (!state.loadedBuild || !state.cls) return null;
    const b = ((KP.builds || {})[state.cls.token] || []).find((x) => x.key === state.loadedBuild);
    if (!b) return null;
    const flat = app.flat();
    const seq = b.order.map((o) => flat.findIndex((t) => t.id === o.id));
    return seq.length === state.seq.length && seq.every((v, i) => v === state.seq[i]) ? b : null;
  }

  // survival: health through armor and avoidance (the same measure the builds use)
  function ehp(R, level) {
    const S = R.S;
    const armorDR = Math.min(0.75, S.armor / (S.armor + 400 + 85 * (level + 3)));
    const avoid = Math.min(0.6, (S.dodge + S.parry + S.block) / 100 + Math.max(0, S.defense) * 0.0004);
    return S.health / ((1 - armorDR) * (1 - avoid));
  }

  // what each picked talent is worth now (your level, gear and buffs): take all its points out and compare
  function liveWorth(ranks) {
    const base = KP.calc.compute(app.ctx(ranks));
    const b = { dps: (base.rotation && base.rotation.dps) || 0, hps: (base.healing && base.healing.hps) || 0, ehp: ehp(base, state.level) };
    const out = {};
    ranks.forEach((r, i) => {
      if (!r) return;
      const without = ranks.slice();
      without[i] = 0;
      const R = KP.calc.compute(app.ctx(without));
      const e = ehp(R, state.level);
      out[app.flat()[i].id] = { dps: b.dps - ((R.rotation && R.rotation.dps) || 0), hps: b.hps - ((R.healing && R.healing.hps) || 0),
        ehpPct: e ? ((b.ehp - e) / e) * 100 : 0, baseDps: b.dps, baseHps: b.hps };
    });
    return out;
  }

  function liveCover(ranks) {
    const R = KP.calc.compute(app.ctx(ranks));
    const m = /mana only covers (\d+)%/.exec((R.rotation && R.rotation.note) || "");
    return m ? parseInt(m[1], 10) : null;
  }

  // when the math can't put a number on it: what kind of talent it is, from its tooltip
  function kindOf(t, desc, manaCover, build) {
    const d = desc || "";
    if (!t.passive) return `It gives you a new ability (${t.name}). The Priority tab shows when to use it.`;
    if (/threat/i.test(d)) return "Mostly about threat (holding the enemy's attention). The damage math doesn't count threat modifiers, so its value doesn't show in the numbers.";
    if (/\b(pets?|hawks?|demons?|Imp|Voidwalker|Succubus|Felhunter|Felguard|minions?)\b/.test(d))
      return "It works through your pet or summon. Their damage and stats are kept on the server (not in the game files), so the planner can't count it.";
    if (/damage taken|damage you take|absorb|Armor|health|Dodge|Parry|Block|Defense|resist|pushback|lose casting time|interrupt/i.test(d) && !/damage (done|dealt) by your/i.test(d))
      return "A defensive talent: it keeps you alive or casting under pressure. The damage numbers can't show that.";
    if (/(mana|rage|energy)/i.test(d) && /(cost|regenerat|refund|restor|generat|gain)/i.test(d))
      return "It's about your resource (mana, rage or energy): more presses before you run dry. The planner counts some of this, not all.";
    if (/stun|snare|slow|daz|root|immobil|fear|silence|movement|speed|range|radius|area|stealth|detect|duration of/i.test(d))
      return "Utility and control (range, slows, stuns, movement). The numbers only measure damage on one target, so they can't see it.";
    if (manaCover != null && /cast(ing)? time|critical strike|speed/i.test(d))
      return "Over a 3-minute fight this setup runs short of mana (" + (manaCover ? `mana for only ${manaCover}% of the main spell's casting` :
        "the damage-over-time spells use it all") + "), so faster casts " +
        "don't add damage in the numbers. It still pays off in short fights, burst moments and once your gear gives more mana.";
    if (/critical strike|damage|chance to hit|hit chance|attack power|spell power|attack speed/i.test(d))
      return build ? "In this build's numbers it adds nothing: it boosts abilities the build doesn't use in its main rotation " +
        "(handy for other fights or as filler on the way down the tree)." : "It adds damage, but the math shows no change with your current setup: often because no weapon is picked yet " +
        "(Gear & Stats tab), or because it boosts an ability you don't have yet.";
    if (/chance/i.test(d)) return "A chance-based effect the planner doesn't simulate yet, so its value doesn't show in the numbers.";
    return "Its effect isn't part of the planner's math yet.";
  }

  // for a talent the math did measure: what kind of gain that is, in plain words
  function gainKind(desc) {
    const d = desc || "";
    if (/critical strike/i.test(d)) return "More critical strikes: a crit hits for double (more with some talents), and several talents trigger on crits.";
    if (/chance to hit|hit chance|chance to be hit/i.test(d)) return "Fewer misses: attacks that would have missed now land, until you reach the hit cap (see Hit on the panel).";
    if (/(cost|Mana|Rage|Energy)/.test(d) && /reduc/i.test(d)) return "Cheaper presses: more of your best attacks or spells fit into a fight.";
    if (/speed|cast time|cooldown/i.test(d)) return "Faster or more often: more attacks or casts per minute.";
    if (/Strength|Agility|Stamina|Intellect|Spirit|attack power|spell power|healing/i.test(d)) return "More of a stat, which raises everything that scales with it.";
    if (/damage|heal/i.test(d)) return "A straight increase to what it names.";
    return "";
  }

  function render() {
    const box = $("why");
    if (!box) return;
    box.textContent = "";
    if (!state.cls || !state.seq.length || (app.view && app.view() !== "talents")) { box.hidden = true; return; }
    box.hidden = false;

    const flat = app.flat();
    const build = loadedBuild();
    const live = app.liveRanks();
    const all = new Array(flat.length).fill(0);
    const first = {}, last = {};
    state.seq.forEach((i, k) => { all[i]++; if (first[i] == null) first[i] = k; last[i] = k; });
    const notes = KP.talentNotes || {};
    const role = build ? build.role : state.prio && state.prio.tank ? "tank" : null;
    const worth = build ? build.worth : liveWorth(live);
    const manaCover = build ? build.manaCover : liveCover(live);
    const leveling = build && build.kind === "leveling";
    const where = leveling ? "in this build at level 60 solo (gear for your level, a same-level mob, eating and drinking counted)"
      : build ? "in this build at level 60 (its reference gear, raid buffs on)" : `at level ${state.level} with your gear and buffs`;

    // the main number for each talent, to rank them
    const main = (w) => !w ? 0 : leveling ? w.levelPct || 0 : role === "tank" ? w.ehpPct * 2 + (w.dps || 0) / 10 : role === "heal" ? w.hps : Math.max(w.dps, w.hps);
    const ranked = flat.map((t, i) => i).filter((i) => all[i] && main(worth[flat[i].id]) > 0.05)
      .sort((a, b) => main(worth[flat[b].id]) - main(worth[flat[a].id]));

    const head = el("div", "path-head");
    head.append(el("h2", null, "Why these talents"));
    head.append(el("span", "muted", build ? `${build.name}: what each pick does and why it's in the build.` : "What each pick does and why it's worth the points."));
    box.append(head);
    if (build) box.append(el("p", "why-summary", build.summary));
    box.append(el("p", "muted small", `"Worth" = what you'd lose without it, ${where}. ` +
      "Talents the math can't measure explain themselves in words. Rows: each row of a tree needs 5 more points spent in that tree, " +
      "so some points are there to reach a stronger talent further down."));

    KP.talents.trees[state.cls.token].forEach((tree, ti) => {
      const picks = flat.map((t, i) => i).filter((i) => flat[i].tree === ti && all[i]).sort((a, b) => first[a] - first[b]);
      if (!picks.length) return;
      const pts = picks.reduce((s, i) => s + all[i], 0);
      const sec = el("section", "why-tree");
      sec.append(el("h3", null, `${tree.name} (${pts} point${pts === 1 ? "" : "s"})`));
      const ol = el("ol", "why-list");
      for (const i of picks) {
        const t = flat[i];
        const desc = t.desc[all[i] - 1] || t.desc[0];
        const w = worth[t.id];
        const li = el("li", "why-item");
        const ic = el("span", "icon why-icon");
        iconStyle(ic, t.icon, 32);
        const body = el("div");
        const title = el("div", "why-title");
        title.append(el("strong", null, t.name), el("span", "muted small", ` ${all[i]}/${t.ranks.length}`));
        const lv1 = first[i] + FIRST_LEVEL, lv2 = last[i] + FIRST_LEVEL;
        title.append(el("span", "prio-tag", lv1 === lv2 ? `level ${lv1}` : `levels ${lv1}–${lv2}`));
        if (!live[i]) title.append(el("span", "prio-tag", "planned"));
        body.append(title, el("div", "why-desc", desc));

        const reasons = [];
        if (t.row === 6) reasons.push(`The tree's 31-point talent: the main reason to go this deep into ${tree.name}.`);
        const unlocks = flat.filter((x, j) => all[j] && (x.requires || []).some((r) => r.talent === t.id));
        if (unlocks.length) reasons.push(`Needed for ${unlocks.map((x) => x.name).join(" and ")}.`);
        const bits = [];
        if (w && w.levelPct > 0.05) bits.push(`${fmt(w.levelPct)}% faster leveling (quicker kills or less eating and drinking)`);
        if (w && w.dps > 0.05) bits.push(`${fmt(w.dps)} damage per second` + (w.baseDps || build ? ` (${fmt((w.dps / ((w.baseDps || build.dps60 || 1) - w.dps)) * 100)}%)` : ""));
        if (w && w.hps > 0.05) bits.push(`${fmt(w.hps)} healing per second`);
        if (w && w.ehpPct > 0.05) bits.push(`${fmt(w.ehpPct)}% survival (health through armor and avoidance)`);
        const rank = ranked.indexOf(i);
        if (bits.length) reasons.push(`Worth ${bits.join(", ")}` + (rank >= 0 ? `: number ${rank + 1} of your ${ranked.length} measurable talents.` : "."));
        const note = notes[`${state.cls.token}:${t.name}`];
        if (note) reasons.push(note);
        else if (bits.length && gainKind(desc)) reasons.push(gainKind(desc));
        else if (!bits.length && t.row !== 6 && !build && !live[i])
          reasons.push(`Planned for level ${lv1}: raise the level to see what it adds.`);
        else if (!bits.length && t.row !== 6) reasons.push(kindOf(t, desc, manaCover, build));
        if (!bits.length && !note && !unlocks.length && t.row < 6) {
          const deeper = flat.filter((x, j) => all[j] && x.tree === ti && x.row > t.row && main(worth[x.id]) > 0.05);
          if (deeper.length) reasons.push(`Its points also count toward reaching ${deeper.slice(0, 2).map((x) => x.name).join(" and ")} further down the tree.`);
        }
        const why = el("div", "why-why");
        why.append(el("strong", null, "Why: "), reasons.join(" "));
        body.append(why);
        li.append(ic, body);
        ol.append(li);
      }
      sec.append(ol);
      box.append(sec);
    });
  }

  app.hooks.push(render);
  app.renderWhy = render;
  render();
})();
