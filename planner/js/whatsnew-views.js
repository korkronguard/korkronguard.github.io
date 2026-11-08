// Kor'kron Planner: two of the What's New page's views. Abilities & Talents shows what each game update changed for the
// classes (data/changes.js, each card's ranks and tooltips); Blizzard's Posts lists what Blizzard said (data/blueposts.js,
// with our own notes from data/blue-notes.js). whatsnew.js runs the page and calls these.
(function () {
  "use strict";

  const KP = window.KP;
  const DATA = KP.changes || { updates: [], forms: {} };
  const POSTS = (KP.bluePosts || { posts: [] }).posts;
  const NOTES = KP.blueNotes || [];
  const CLASSES = KP.classes.classes;

  const KINDS = [["added", "New"], ["changed", "Changed"], ["removed", "Removed"]];
  const KIND_NAME = Object.fromEntries(KINDS);
  const TYPES = [["ability", "Abilities"], ["talent", "Talents"], ["racial", "Racials"]];
  const POST_KINDS = [["notes", "Hotfixes & class notes"], ["news", "News"], ["reply", "Forum replies"], ["other", "Other posts"]];
  const POST_KIND_NAME = Object.fromEntries(POST_KINDS);
  const POWER = { 0: "mana", 1: "rage", 3: "energy" };
  const ROWS_SHOWN = 40;   // per group, until "Show all"
  const KEEP_WORDS = 8;    // unchanged words kept each side of a change in a row's short view

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function longDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  // a post's time (UTC from the forum) as the day it was where the reader is
  const postDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // a dropdown's choices; the one chosen stays listed (with 0) when the other filters leave nothing in it
  function fillSelect(select, first, options, value, label) {
    select.textContent = "";
    select.append(new Option(first, ""));
    if (value !== "" && !options.some(([v]) => v === value)) options = [...options, [value, `${label} (0)`]];
    for (const [v, text] of options) select.append(new Option(text, v));
    select.value = value;
  }

  // a row's button opens and closes its details; `open` remembers which across redraws
  function expandable(li, btn, key, open, detail) {
    if (open.has(key)) li.append(detail());
    btn.setAttribute("aria-expanded", String(open.has(key)));
    btn.addEventListener("click", () => {
      if (open.delete(key)) li.querySelector(".wn-detail").remove();
      else { open.add(key); li.append(detail()); }
      btn.setAttribute("aria-expanded", String(open.has(key)));
    });
  }

  // an icon from the update's sprite sheet
  function spriteIcon(u, fileId, cls) {
    const span = el("span", cls);
    const i = u.icons[fileId];
    if (i === undefined) {
      span.classList.add("none");
    } else {
      const size = DATA.iconSize, cols = DATA.iconCols;
      span.style.backgroundImage = `url(img/changes/${u.id}.jpg)`;
      span.style.backgroundPosition = `-${(i % cols) * size}px -${Math.floor(i / cols) * size}px`;
    }
    return span;
  }

  // a card before the update: its old values put back (null = it didn't have that)
  function before(c) {
    const old = { ...c };
    delete old.was;
    for (const [k, v] of Object.entries(c.was)) {
      if (v === null) delete old[k];
      else old[k] = v;
    }
    return old;
  }

  // ------------------------------------------------------------ two versions of a tooltip

  // the two texts as runs of words: { kind, text } with kind "same", "old" (only in a) or "new" (only in b)
  function wordRuns(a, b) {
    const x = a.split(" "), y = b.split(" ");
    const lcs = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
    for (let i = x.length - 1; i >= 0; i--) {
      for (let j = y.length - 1; j >= 0; j--) {
        lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const runs = [];
    const push = (kind, word) => {
      const last = runs[runs.length - 1];
      if (last && last.kind === kind) last.text += " " + word;
      else runs.push({ kind, text: word });
    };
    let i = 0, j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) { push("same", x[i]); i++; j++; }
      else if (i < x.length && (j === y.length || lcs[i + 1][j] >= lcs[i][j + 1])) { push("old", x[i]); i++; }
      else { push("new", y[j]); j++; }
    }
    return runs;
  }

  // the runs with long stretches of unchanged words cut down, so a row shows the change and its surroundings
  function shortRuns(runs) {
    return runs.map((r, n) => {
      if (r.kind !== "same") return r;
      const w = r.text.split(" ");
      const head = w.slice(0, KEEP_WORDS).join(" "), tail = w.slice(-KEEP_WORDS).join(" ");
      if (n === 0 && w.length > KEEP_WORDS) return { kind: "same", text: `… ${tail}` };
      if (n === runs.length - 1 && w.length > KEEP_WORDS) return { kind: "same", text: `${head} …` };
      if (n > 0 && n < runs.length - 1 && w.length > KEEP_WORDS * 2) return { kind: "same", text: `${head} … ${tail}` };
      return r;
    });
  }

  function appendRuns(parent, runs) {
    for (const r of runs) {
      if (r.kind === "same") parent.append(r.text + " ");
      else parent.append(el(r.kind === "old" ? "del" : "ins", null, r.text), " ");
    }
  }

  // ------------------------------------------------------------ reading an ability, talent or racial card

  function timeText(ms) {
    const sec = ms / 1000;
    if (sec >= 3600) return `${+(sec / 3600).toFixed(2)} hr`;
    if (sec >= 60) return `${+(sec / 60).toFixed(2)} min`;
    return `${+sec.toFixed(2)} sec`;
  }
  const timeOr = (ms, none) => (ms ? timeText(ms) : none);
  function costText(r) {
    const power = POWER[r.powerType || 0] || "power";
    if (r.costPct) return `${r.costPct}% ${power}`;
    if (r.cost) return `${r.powerType === 1 ? r.cost / 10 : r.cost} ${power}`; // the game stores rage x 10
    return "no cost";
  }

  // a rank's numbers a player can see: [label, its text, its value, is a higher one better?]
  const RANK_NUMBERS = [
    ["Learned at level", (r) => String(r.level || 1), (r) => r.level || 1, false],
    ["Cost", costText, (r) => r.costPct || r.cost || 0, false],
    ["Cooldown", (r) => timeOr(r.cdMs, "none"), (r) => r.cdMs || 0, false],
    ["Cast time", (r) => timeOr(r.castMs, "instant"), (r) => r.castMs || 0, false],
    ["Global cooldown", (r) => timeOr(r.gcdMs, "none"), (r) => r.gcdMs || 0, false],
    ["Duration", (r) => timeOr(r.durMs, "none"), (r) => r.durMs || 0, true],
    ["Duration per combo point", (r) => timeOr(r.durPerPoint, "none"), (r) => r.durPerPoint || 0, true],
  ];

  function rankFacts(r) {
    return [r.level > 1 ? `Level ${r.level}` : "", r.cost || r.costPct ? costText(r) : "",
      r.castMs ? `${timeText(r.castMs)} cast` : "", r.cdMs ? `${timeText(r.cdMs)} cooldown` : "",
      r.durMs ? `lasts ${timeText(r.durMs)}` : ""].filter(Boolean).join(" · ");
  }

  function rankDiffs(old, now, add) {
    if (old.length !== now.length) {
      add(`Ranks ${old.length} → ${now.length}`);
      return;
    }
    for (const [label, show, value, higherIsBetter] of RANK_NUMBERS) {
      const changed = now.map((r, i) => [old[i], r, i]).filter(([a, b]) => show(a) !== show(b));
      if (!changed.length) continue;
      const [a, b, i] = changed[changed.length - 1];
      const texts = new Set(changed.map(([x, y]) => `${show(x)} → ${show(y)}`));
      const where = now.length === 1 ? "" : changed.length === 1 ? ` (rank ${i + 1})` : texts.size > 1 ? " (top rank)" : "";
      add(`${label} ${show(a)} → ${show(b)}${where}`, value(b) > value(a) === higherIsBetter);
    }
  }

  // masks hold a bit per form (form number - 1): `forms` = the forms it needs or works in, `notIn` = the ones it's barred from
  function formDiffs(old, now, add) {
    const has = (mask, bit) => Boolean(((mask || 0) >>> bit) & 1);
    for (let bit = 0; bit < 32; bit++) {
      const wasIn = has(old.forms, bit), isIn = has(now.forms, bit), wasOut = has(old.notIn, bit), isOut = has(now.notIn, bit);
      const name = (DATA.forms || {})[bit + 1] || `form ${bit + 1}`;
      if (isOut && !wasOut) add(`No longer works in ${name}`, false);
      else if (isIn && !wasIn) add(wasOut || old.forms ? `Now works in ${name}` : `Now needs ${name}`, Boolean(wasOut || old.forms));
      else if (wasIn && !isIn) add(now.forms ? `No longer works in ${name}` : `No longer limited to ${name}`, !now.forms);
      else if (wasOut && !isOut) add(`Now works in ${name}`, true);
    }
  }

  // what changed besides the tooltip's words, one short line each; dir "up" = better for the player, "down" = worse
  function spellDiffs(c) {
    const old = before(c), out = [], fields = Object.keys(c.was);
    const add = (text, better) => out.push({ text, dir: better === undefined ? "" : better ? "up" : "down" });
    const list = (names) => (names || []).join(", ") || "none";
    for (const field of fields) {
      switch (field) {
        case "ranks": rankDiffs(old.ranks || [], c.ranks || [], add); break;
        case "name": add(`Renamed from “${old.name}”`); break;
        case "forms": case "notIn":
          if (field === "notIn" && fields.includes("forms")) break; // one pass for both
          formDiffs(old, c, add);
          break;
        case "stealthOnly": add(c.stealthOnly ? "Now only from stealth" : "No longer needs stealth"); break;
        case "passive": add(c.passive ? "Now passive" : "No longer passive"); break;
        case "tree": add(`Moved from the ${old.tree} tree to ${c.tree}`); break;
        case "row": case "col":
          if (field === "col" && fields.includes("row")) break; // one line for both
          add("Moved within its talent tree");
          break;
        case "requires": add(`Needs first: ${list(old.requires)} → ${list(c.requires)}`); break;
        case "needs": add("What it needs equipped changed"); break;
        case "races": add(`Races: ${list(old.races)} → ${list(c.races)}`); break;
        case "classMask": add("Which classes get it changed"); break;
        default: add("Changed in the game's files");
      }
    }
    return out;
  }

  // how to read a change: "tooltip" = only the words moved, the spell's numbers in the game's files didn't (usually a
  // corrected tooltip); "hidden" = the numbers moved and the tooltip doesn't show it; "" = neither
  function changeKind(c) {
    const a = before(c).ranks || [], b = c.ranks || [];
    if (!c.was.ranks || a.length !== b.length) return "";
    const pairs = b.map((r, i) => [a[i], r]);
    const words = pairs.some(([x, y]) => x.text !== y.text);
    const numbers = pairs.some(([x, y]) => x.numbers !== y.numbers);
    const shown = pairs.some(([x, y]) => RANK_NUMBERS.some(([, show]) => show(x) !== show(y)));
    if (words && !numbers && !shown && Object.keys(c.was).length === 1) return "tooltip";
    if (numbers && !words && !shown) return "hidden";
    return "";
  }
  const CHANGE_LABEL = {
    tooltip: ["Tooltip text only", "The words changed, but the spell's numbers in the game's files didn't: usually a corrected tooltip, not a change to how it works."],
    hidden: ["Numbers changed, tooltip didn't", "The spell's numbers in the game's files changed, and its tooltip doesn't show how."],
  };

  // the ranks whose tooltip changed, as positions; none when the number of ranks changed (they can't be paired up)
  function changedTexts(c) {
    const a = before(c).ranks || [], b = c.ranks || [];
    if (!c.was.ranks || a.length !== b.length) return [];
    return b.map((_, i) => i).filter((i) => a[i].text !== b[i].text);
  }

  const className = (token) => (CLASSES.find((cl) => cl.token === token) || {}).name || "";
  const racialClasses = (c) => CLASSES.filter((cl) => c.classMask & (1 << (cl.id - 1))).map((cl) => cl.name).join(", ");

  function spellMeta(c) {
    const ranks = c.ranks.length > 1 ? `${c.ranks.length} ranks` : "";
    if (c.type === "racial") return ["Racial", c.races.join(", "), c.classMask ? racialClasses(c) : ""].filter(Boolean).join(" · ");
    return [className(c.cls), c.type === "talent" ? `${c.tree} talent` : "Ability", ranks, c.races ? `${c.races.join(", ")} only` : ""]
      .filter(Boolean).join(" · ");
  }

  // ------------------------------------------------------------ filters

  const updateMatches = (e, f) => f.u === "all" || e.u.id === f.u;
  const forClass = (c, token) => {
    if (c.type !== "racial") return c.cls === token;
    const cl = CLASSES.find((x) => x.token === token);
    return !c.classMask || Boolean(c.classMask & (1 << (cl.id - 1)));
  };
  const wordsMatch = (text, q) => {
    const h = text.toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => h.includes(w));
  };

  // f: { u (update id or "all"), k (kind or "all"), q (search), cls (class token), st (ability, talent, racial) }
  function spellPasses(e, f) {
    const c = e.card;
    if (!updateMatches(e, f)) return false;
    if (f.k !== "all" && e.kind !== f.k) return false;
    if (f.st && c.type !== f.st) return false;
    if (f.cls && !forClass(c, f.cls)) return false;
    if (!f.q) return true;
    const old = c.was && c.was.ranks ? c.was.ranks : [];
    return wordsMatch([c.name, spellMeta(c), ...c.ranks.map((r) => r.text), ...old.map((r) => r.text)].join(" "), f.q);
  }

  const notesForPost = (p) => NOTES.filter((n) => n.post === p.id);

  // f: { q (search), pk (post kind or "all") }
  function postPasses(p, f) {
    if (f.pk !== "all" && p.kind !== f.pk) return false;
    if (!f.q) return true;
    return wordsMatch([p.title, p.author, p.role, p.excerpt, ...notesForPost(p).map((n) => n.text)].join(" "), f.q);
  }

  // Blizzard's words on a game update, in our own: what the game's files can't show
  function updateNotes(f) {
    return NOTES.filter((n) => n.update && (f.u === "all" || n.update === f.u) && (!f.cls || !n.cls || n.cls === f.cls)
      && (!f.q || wordsMatch(n.text, f.q)));
  }

  // ------------------------------------------------------------ the Abilities & Talents view

  const SPELLS = DATA.updates.flatMap((u) => KINDS.flatMap(([kind]) => ((u.spells || {})[kind] || []).map((card) => ({ u, kind, card }))));

  function spellDetail(e) {
    const c = e.card, box = el("div", "wn-detail wn-ranks");
    const changed = e.kind === "changed" ? changedTexts(c) : [];
    if (changed.length) {
      const old = before(c).ranks;
      for (const i of changed) {
        const runs = wordRuns(old[i].text, c.ranks[i].text);
        const label = c.ranks.length > 1 ? `Rank ${i + 1}: ` : "";
        const was = el("div", "wn-rank-text"), now = el("div", "wn-rank-text");
        appendRuns(was, runs.filter((r) => r.kind !== "new"));
        appendRuns(now, runs.filter((r) => r.kind !== "old"));
        const row = el("div", "wn-rank-pair");
        const col = (title, body) => {
          const part = el("div", "wn-col");
          part.append(el("div", "lbl", label + title), body);
          return part;
        };
        row.append(col("Before", was), col("Now", now));
        box.append(row);
      }
      return box;
    }
    // new or removed, or a change that left the words alone: each rank as it reads
    if (e.kind === "changed") box.append(el("div", "lbl", "Tooltip (unchanged)"));
    if (e.kind === "removed") box.append(el("div", "lbl", "Before it was removed"));
    for (const [i, r] of c.ranks.entries()) {
      const line = el("div", "wn-rank-line");
      if (c.ranks.length > 1) line.append(el("span", "lbl", `Rank ${i + 1}`));
      line.append(el("div", "wn-rank-text", r.text));
      if (rankFacts(r)) line.append(el("div", "wn-meta", rankFacts(r)));
      box.append(line);
    }
    return box;
  }

  function spellRow(e, f, open) {
    const c = e.card;
    const li = el("li", "wn-item");
    const head = el("div", "wn-head");
    const btn = el("button", "wn-row");
    btn.type = "button";
    const main = el("span", "wn-main");
    main.append(el("span", "wn-name", c.name), el("span", "wn-meta", spellMeta(c) + (f.u === "all" ? ` · ${longDate(e.u.date)}` : "")));
    if (e.kind === "changed") {
      const chips = el("span", "wn-diffs");
      const label = CHANGE_LABEL[changeKind(c)];
      if (label) {
        const chip = el("span", "wn-diff wn-how", label[0]);
        chip.title = label[1];
        chips.append(chip);
      }
      for (const d of spellDiffs(c)) chips.append(el("span", "wn-diff " + d.dir, d.text));
      if (chips.children.length) main.append(chips);
      const changed = changedTexts(c);
      if (changed.length) {
        const top = changed[changed.length - 1];
        const words = el("span", "wn-sum");
        if (c.ranks.length > 1) words.append(el("span", "wn-rank-label", `Rank ${top + 1}: `));
        appendRuns(words, shortRuns(wordRuns(before(c).ranks[top].text, c.ranks[top].text)));
        main.append(words);
      }
    } else {
      main.append(el("span", "wn-sum", c.ranks[c.ranks.length - 1].text));
    }
    btn.append(spriteIcon(e.u, c.icon, "wn-icon"), main);
    head.append(btn, el("span", "wn-badge " + e.kind, KIND_NAME[e.kind]));
    li.append(head);
    expandable(li, btn, `${e.u.id}:${e.kind}:${c.id}`, open, () => spellDetail(e));
    return li;
  }

  function notesPanel(f) {
    const notes = updateNotes(f);
    if (!notes.length) return null;
    const box = el("section", "wn-notes");
    box.append(el("h3", null, "What Blizzard also said"),
      el("p", "wn-notes-sub", "Blizzard announced these, and the game's files can't show them: rules kept on Blizzard's servers, or fixes with no number to compare. Written in our own words."));
    const ul = el("ul");
    for (const n of notes) {
      const li = el("li");
      if (n.cls) li.append(el("strong", null, `${className(n.cls)}: `));
      li.append(n.text + " ");
      const post = POSTS.find((p) => p.id === n.post);
      if (post) li.append(postLink(post, "Blizzard's post"));
      ul.append(li);
    }
    box.append(ul);
    return box;
  }

  function renderSpellFilters(f) {
    fillSelect($("spellCls"), "Any class", CLASSES.map((cl) => [cl.token, cl.name]), f.cls);
    const list = SPELLS.filter((e) => spellPasses(e, { ...f, st: "" }));
    const count = (type) => list.filter((e) => e.card.type === type).length;
    fillSelect($("spellType"), "All types", TYPES.map(([t, name]) => [t, `${name} (${count(t)})`]), f.st,
      (TYPES.find(([t]) => t === f.st) || [])[1]);
  }

  // groups in class order, racials last
  function spellGroups(list) {
    const groups = [...CLASSES.map((cl) => [cl.token, cl.name, cl.color]), ["", "Racials", null]];
    return groups.map(([token, name, color]) => ({ token, name, color, entries: list.filter((e) => e.card.cls === token) }))
      .filter((g) => g.entries.length);
  }

  function renderSpells(f, open, allShown) {
    const list = SPELLS.filter((e) => spellPasses(e, f)).sort((a, b) => a.card.name.localeCompare(b.card.name));
    const inUpdate = SPELLS.filter((e) => updateMatches(e, f)).length;
    const panel = notesPanel(f);
    $("summary").textContent = !inUpdate ? "This update didn't change any abilities, talents or racials in the game's files."
      : !list.length ? (panel ? "No changes in the game's files match, only what Blizzard said." : "Nothing matches these filters.")
        : `${list.length} change${list.length === 1 ? "" : "s"}` + (list.length !== inUpdate ? ` match your filters (of ${inUpdate})` : "") +
          ". Click one for every rank, before and after.";
    const out = $("results");
    out.textContent = "";
    if (panel) out.append(panel);
    for (const g of spellGroups(list)) {
      const section = el("section", "wn-group");
      const h = el("h3", null, g.name);
      if (g.color) h.style.color = g.color;
      h.append(el("span", "n", String(g.entries.length)));
      const ul = el("ul", "wn-list");
      const key = `spell:${g.token}`;
      const shown = allShown.has(key) ? g.entries : g.entries.slice(0, ROWS_SHOWN);
      for (const e of shown) ul.append(spellRow(e, f, open));
      section.append(h, ul);
      if (shown.length < g.entries.length) {
        const more = el("button", "btn wn-more", `Show all ${g.entries.length}`);
        more.type = "button";
        more.addEventListener("click", () => { allShown.add(key); renderSpells(f, open, allShown); });
        section.append(more);
      }
      out.append(section);
    }
  }

  // ------------------------------------------------------------ the Blizzard's Posts view

  function postLink(p, text) {
    const a = el("a", "wn-link", text);
    a.href = p.url;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function postRow(p) {
    const li = el("li", "wn-item wn-post");
    const head = el("div", "wn-post-head");
    const title = postLink(p, p.title);
    title.className = "wn-post-title";
    head.append(title, el("span", "wn-badge wn-kind", POST_KIND_NAME[p.kind]));
    const meta = [p.role ? `${p.author}, ${p.role}` : p.author, postDate(p.date), p.edited ? `edited ${postDate(p.edited)}` : "",
      p.n > 1 ? "a reply in the thread" : ""].filter(Boolean).join(" · ");
    li.append(head, el("div", "wn-meta", meta));
    if (p.excerpt) li.append(el("p", "wn-post-text", p.excerpt));
    const notes = notesForPost(p);
    if (notes.length) {
      const ul = el("ul", "wn-post-notes");
      for (const n of notes) {
        const note = el("li");
        if (n.cls) note.append(el("strong", null, `${className(n.cls)}: `));
        note.append(n.text);
        ul.append(note);
      }
      li.append(ul);
    }
    return li;
  }

  function renderPostFilters(f, set) {
    const box = $("postKinds");
    box.textContent = "";
    const list = POSTS.filter((p) => postPasses(p, { ...f, pk: "all" }));
    for (const [k, label] of [["all", "All"], ...POST_KINDS]) {
      const n = k === "all" ? list.length : list.filter((p) => p.kind === k).length;
      const b = el("button", null, `${label} ${n}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(f.pk === k));
      b.addEventListener("click", () => set({ pk: k }));
      box.append(b);
    }
  }

  function renderPosts(f, allShown) {
    const list = POSTS.filter((p) => postPasses(p, f));
    $("summary").textContent = !POSTS.length ? "No posts collected yet."
      : !list.length ? "No posts match these filters."
        : `${list.length} post${list.length === 1 ? "" : "s"}` + (list.length !== POSTS.length ? ` match your filters (of ${POSTS.length})` : "") +
          ", newest first. Each title opens the post on Blizzard's forum. The search looks at titles, the short previews and our notes.";
    const out = $("results");
    out.textContent = "";
    const ul = el("ul", "wn-list");
    const shown = allShown.has("posts") ? list : list.slice(0, ROWS_SHOWN);
    for (const p of shown) ul.append(postRow(p));
    out.append(ul);
    if (shown.length < list.length) {
      const more = el("button", "btn wn-more", `Show all ${list.length}`);
      more.type = "button";
      more.addEventListener("click", () => { allShown.add("posts"); renderPosts(f, allShown); });
      out.append(more);
    }
  }

  KP.whatsNewViews = { $, el, longDate, fillSelect, expandable, spriteIcon, before, KINDS, KIND_NAME, POST_KINDS, SPELLS, POSTS,
    wordRuns, shortRuns, spellDiffs, changeKind, changedTexts, spellMeta, spellPasses, postPasses, updateNotes, spellGroups,
    renderSpellFilters, renderSpells, renderPostFilters, renderPosts };
})();
