// Kor'kron Planner: the What's New page (whats-new.html). Lists what each WoW: Forever update added, changed or removed
// (data/changes.js, written by tools/game_changes.py from the game's own files), grouped by category, with a search,
// filters, a before/now view of each changed item, and a link that keeps the filters.
(function () {
  "use strict";

  const KP = window.KP;
  const { WEAPONS, WEAPON_NAMES, ARMOR_NAMES, INV_NAMES, QUALITY, STAT_TEXT, TRIGGER, SCHOOLS, SOURCE_NAMES,
    wowheadUrl } = KP.itemInfo;
  const DATA = KP.changes || { updates: [], categories: {} };
  const CLASSES = KP.classes.classes;

  const KINDS = [["added", "New"], ["changed", "Changed"], ["removed", "Removed"]];
  const KIND_NAME = Object.fromEntries(KINDS);
  // categories in the order players look for them: gear, then what you use and craft, then the rest
  const CATEGORY_ORDER = [4, 2, 0, 9, 7, 1, 11, 6, 5, 15, 12, 13];
  const PRIMARY = ["strength", "agility", "stamina", "intellect", "spirit"];
  const FISHING_POLE = 20; // any class can use one
  const ROWS_SHOWN = 40;   // per category, until "Show all"

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const dps = (w) => ((w.min + w.max) / 2 / w.speed).toFixed(1);

  // ------------------------------------------------------------ reading a card

  const category = (c) => DATA.categories[c.class] || { name: "Other", subs: {} };
  const typeName = (c) => category(c).subs[c.subclass] || "";

  // "Plate Chest", "Two-Hand Axe", "Potions": what kind of item it is, the way the game's tooltip and auction house say it
  function typeLine(c) {
    const slot = INV_NAMES[c.inv] || "";
    if (c.class === 2) return `${slot} ${WEAPON_NAMES[c.subclass] || typeName(c)}`.trim();
    if (c.class === 4) {
      if (c.subclass === 6) return "Shield";
      const kind = c.subclass > 0 && c.inv !== 16 ? ARMOR_NAMES[c.subclass] || typeName(c) : "";
      return `${kind} ${slot}`.trim();
    }
    return typeName(c) || category(c).name;
  }

  const binding = (c) => (c.bop ? "Binds when picked up" : c.boe ? "Binds when equipped" : "");
  const classList = (c) => CLASSES.filter((cl) => c.classMask & (1 << (cl.id - 1))).map((cl) => cl.name).join(", ");
  // a stat type the game hasn't named for us yet (/kp datamine names them) comes as "stat129"
  const statName = (k) => STAT_TEXT[k] || k.replace(/^stat(\d+)$/, "unnamed stat $1");
  const statText = (k, v) => `${v > 0 ? "+" : ""}${v} ${statName(k)}`;
  const byPrimary = ([a], [b]) => (PRIMARY.includes(b) - PRIMARY.includes(a));
  // an effect's cooldown the way the game's tooltip writes it: "1 Min, 30 Sec"
  const cooldown = (sec) => [[Math.floor(sec / 3600), "Hour"], [Math.floor((sec % 3600) / 60), "Min"], [sec % 60, "Sec"]]
    .filter(([n]) => n).map(([n, unit]) => `${n} ${unit}`).join(", ");
  const effectLine = (e) => `${TRIGGER[e.trigger] || "Use"}: ${e.text}${e.cd ? ` (${cooldown(e.cd)} Cooldown)` : ""}`;

  // an item's effects that differ only in cooldown, one line each; null when anything else about them changed
  function cooldownChanges(old, now) {
    const a = old.effects || [], b = now.effects || [];
    if (a.length !== b.length || a.some((e, i) => e.text !== b[i].text || e.trigger !== b[i].trigger)) return null;
    return b.map((e, i) => [a[i].cd || 0, e.cd || 0]).filter(([x, y]) => x !== y);
  }

  function metaLine(c) {
    return [typeLine(c), `Item level ${c.ilvl}`, c.req > 1 ? `Requires level ${c.req}` : "",
      c.src ? SOURCE_NAMES[c.src] : "", c.faction ? `${c.faction} only` : ""].filter(Boolean).join(" · ");
  }

  // the numbers that matter at a glance: weapon damage, armor, the main stats; else what it does
  function summary(c) {
    const parts = [];
    if (c.weapon) parts.push(`${c.weapon.min}-${c.weapon.max} damage (${dps(c.weapon)} DPS)`);
    if (c.armor) parts.push(`${c.armor} Armor`);
    parts.push(...Object.entries(c.stats || {}).sort(byPrimary).slice(0, 4).map(([k, v]) => statText(k, v)));
    if (c.bagSlots) parts.push(`${c.bagSlots} slots`);
    const fx = (c.effects || [])[0];
    if (!parts.length && fx) parts.push(effectLine(fx));
    if (!parts.length && c.flavor) parts.push(`“${c.flavor}”`);
    return parts.join(" · ");
  }

  // the item before the update: the card with its old values put back (null = it didn't have that)
  function before(c) {
    const old = { ...c };
    delete old.was;
    for (const [k, v] of Object.entries(c.was)) {
      if (v === null) delete old[k];
      else old[k] = v;
    }
    return old;
  }

  // what changed, one short line each; dir "up" = better for the player, "down" = worse, "" = neither
  function diffs(c) {
    const old = before(c);
    const out = [];
    const add = (text, better) => out.push({ text, dir: better === undefined ? "" : better ? "up" : "down" });
    const fields = Object.keys(c.was);
    for (const field of fields) {
      switch (field) {
        case "stats": {
          const a = old.stats || {}, b = c.stats || {};
          for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (a[k] !== b[k]) add(`${statName(k)} ${a[k] || 0} → ${b[k] || 0}`, (b[k] || 0) > (a[k] || 0));
          }
          break;
        }
        case "armor": add(`Armor ${old.armor || 0} → ${c.armor || 0}`, (c.armor || 0) > (old.armor || 0)); break;
        case "weapon": {
          const a = old.weapon, b = c.weapon;
          if (!a || !b) { add(b ? "Now deals weapon damage" : "No longer deals weapon damage"); break; }
          if (a.min !== b.min || a.max !== b.max) add(`Damage ${a.min}-${a.max} → ${b.min}-${b.max}`, b.min + b.max > a.min + a.max);
          if (a.speed !== b.speed) add(`Speed ${a.speed.toFixed(2)} → ${b.speed.toFixed(2)}`);
          if (dps(a) !== dps(b)) add(`DPS ${dps(a)} → ${dps(b)}`, +dps(b) > +dps(a));
          if (a.school !== b.school) add(`${SCHOOLS[a.school]} damage → ${SCHOOLS[b.school]}`);
          break;
        }
        case "ilvl": add(`Item level ${old.ilvl} → ${c.ilvl}`, c.ilvl > old.ilvl); break;
        case "req": add(`Requires level ${old.req} → ${c.req}`, c.req < old.req); break;
        case "quality": add(`${cap(QUALITY[old.quality])} → ${cap(QUALITY[c.quality])}`, c.quality > old.quality); break;
        case "name": add(`Renamed from “${old.name}”`); break;
        case "effects": {
          const cds = cooldownChanges(old, c);
          if (!cds) add("What it does changed");
          else for (const [a, b] of cds) add(`Cooldown ${a ? cooldown(a) : "none"} → ${b ? cooldown(b) : "none"}`, b < a);
          break;
        }
        case "bagSlots": add(`${old.bagSlots || 0} → ${c.bagSlots || 0} bag slots`, (c.bagSlots || 0) > (old.bagSlots || 0)); break;
        case "src": add(`Source: ${SOURCE_NAMES[old.src] || "none"} → ${SOURCE_NAMES[c.src] || "none"}`); break;
        case "faction": add(`${old.faction ? old.faction + " only" : "Both factions"} → ${c.faction ? c.faction + " only" : "both factions"}`); break;
        case "prof": add(`Requires ${old.prof || "no profession"} → ${c.prof || "no profession"}`); break;
        case "set": add(`Set: ${old.set || "none"} → ${c.set || "none"}`); break;
        case "classMask": add(`Classes: ${classList(old) || "all"} → ${classList(c) || "all"}`); break;
        case "unique": add(c.unique ? "Now unique" : "No longer unique"); break;
        case "flavor": add("Description changed"); break;
        case "bop": case "boe":
          if (field === "boe" && fields.includes("bop")) break; // one line for both
          add(`${binding(old) || "No binding"} → ${binding(c) || "no binding"}`);
          break;
        default: // slot, inv, class, subclass: one line for the kind of item
          if (["slot", "inv", "class", "subclass"].find((k) => fields.includes(k)) === field) add(`${typeLine(old)} → ${typeLine(c)}`);
      }
    }
    return out;
  }

  // ------------------------------------------------------------ filters

  // can this class use it at level 60 (class-only items, weapon skills, armor types)?
  function usableBy(c, cls) {
    if (c.classMask && !(c.classMask & (1 << (cls.id - 1)))) return false;
    if (c.class === 2) return c.subclass === FISHING_POLE || (WEAPONS[cls.token] || []).includes(c.subclass);
    if (c.class === 4 && c.subclass > 0 && ARMOR_NAMES[c.subclass]) return !!(cls.armorMask & (1 << c.subclass));
    return true;
  }

  const hay = new WeakMap();
  function haystack(c) {
    let h = hay.get(c);
    if (h === undefined) {
      h = [c.name, typeLine(c), category(c).name, typeName(c), c.flavor, c.set, c.prof, c.faction, SOURCE_NAMES[c.src],
        ...Object.keys(c.stats || {}).map(statName), ...(c.effects || []).map((e) => e.text)]
        .filter(Boolean).join(" ").toLowerCase();
      hay.set(c, h);
    }
    return h;
  }

  // f: { u (update id or "all"), k (kind or "all"), q (search), c (category), t (type), s (slot name), ql (qualities),
  // lo, hi (required level), cls (class token), f (faction) }; "" or [] = not filtered
  function passes(e, f) {
    const c = e.card;
    if (f.u !== "all" && e.u.id !== f.u) return false;
    if (f.k !== "all" && e.kind !== f.k) return false;
    if (f.c !== "" && String(c.class) !== f.c) return false;
    if (f.t !== "" && String(c.subclass) !== f.t) return false;
    if (f.s !== "" && INV_NAMES[c.inv] !== f.s) return false;
    if (f.ql.length && !f.ql.includes(c.quality)) return false;
    const req = Math.max(1, c.req || 0);
    if ((f.lo && req < f.lo) || (f.hi && req > f.hi)) return false;
    if (f.cls && !usableBy(c, CLASSES.find((cl) => cl.token === f.cls))) return false;
    if (f.f && c.faction && c.faction !== f.f) return false;
    if (f.q) {
      const h = haystack(c);
      if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => h.includes(w))) return false;
    }
    return true;
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  const SORTS = {
    ilvl: (a, b) => b.ilvl - a.ilvl || byName(a, b),
    req: (a, b) => (b.req || 0) - (a.req || 0) || b.ilvl - a.ilvl || byName(a, b),
    quality: (a, b) => b.quality - a.quality || b.ilvl - a.ilvl || byName(a, b),
    name: byName,
  };

  KP.whatsNew = { passes, diffs, before, summary, typeLine, usableBy };
  if (!window.document) return; // loaded by the tests, without a page

  // ------------------------------------------------------------ the page

  const ENTRIES = DATA.updates.flatMap((u) => KINDS.flatMap(([kind]) => (u[kind] || []).map((card) => ({ u, kind, card }))));
  const BLANK = { k: "all", q: "", c: "", t: "", s: "", ql: [], lo: "", hi: "", cls: "", f: "", sort: "ilvl" };
  let f = { u: DATA.updates.length ? DATA.updates[0].id : "all", ...BLANK };
  const open = new Set();         // rows showing their details
  const allShown = new Set();     // categories showing every row

  function longDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // ---- the address keeps the filters, so a link shows the same list
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const num = (k) => { const n = parseInt(p.get(k), 10); return n >= 1 && n <= 60 ? n : ""; };
    const u = p.get("u");
    f = {
      ...f,
      u: u === "all" || DATA.updates.some((x) => x.id === u) ? u : f.u,
      k: KIND_NAME[p.get("k")] ? p.get("k") : "all",
      q: p.get("q") || "", c: p.get("c") || "", t: (p.get("c") && p.get("t")) || "", s: p.get("s") || "",
      ql: (p.get("ql") || "").split(",").filter((x) => /^\d$/.test(x)).map(Number),
      lo: num("lo"), hi: num("hi"),
      cls: CLASSES.some((cl) => cl.token === p.get("cls")) ? p.get("cls") : "",
      f: ["Horde", "Alliance"].includes(p.get("f")) ? p.get("f") : "",
      sort: SORTS[p.get("sort")] ? p.get("sort") : "ilvl",
    };
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (f.u !== (DATA.updates[0] || {}).id) p.set("u", f.u);
    for (const k of ["k", "q", "c", "t", "s", "lo", "hi", "cls", "f", "sort"]) if (f[k] !== BLANK[k]) p.set(k, f[k]);
    if (f.ql.length) p.set("ql", f.ql.join(","));
    const hash = p.toString();
    history.replaceState(null, "", hash ? "#" + hash : location.pathname + location.search);
  }

  function set(changes) {
    f = { ...f, ...changes };
    render();
  }

  // ---- updates (left)
  function counts(list) {
    const n = { added: 0, changed: 0, removed: 0 };
    for (const e of list) n[e.kind]++;
    return n;
  }
  function countLine(n) {
    const line = el("span", "wn-counts");
    if (n.added) line.append(el("span", "added", `${n.added} new`));
    if (n.changed) line.append(el("span", "changed", `${n.changed} changed`));
    if (n.removed) line.append(el("span", "removed", `${n.removed} removed`));
    return line;
  }
  function renderUpdates() {
    const box = $("updates");
    box.textContent = "";
    if (!DATA.updates.length) {
      box.append(el("p", "wn-empty", "No updates recorded yet: the next game update will show here."));
      return;
    }
    const button = (id, title, sub, n, note) => {
      const b = el("button", "wn-update");
      b.type = "button";
      b.setAttribute("aria-pressed", String(f.u === id));
      b.append(el("span", "t", title), el("span", "d", sub), countLine(n));
      if (note) b.append(el("span", "note", note));
      b.addEventListener("click", () => set({ u: id }));
      box.append(b);
    };
    for (const u of DATA.updates) {
      const builds = u.from === u.to ? `Build ${u.to}` : `Build ${u.from} → ${u.to}`;
      button(u.id, u.title, `${longDate(u.date)} · ${builds}`, counts(ENTRIES.filter((e) => e.u === u)), u.note);
    }
    if (DATA.updates.length > 1) button("all", "All updates", `${DATA.updates.length} updates`, counts(ENTRIES));
  }

  // ---- filters (top)
  // a dropdown's choices; the one chosen stays listed (with 0) when the other filters leave nothing in it
  function fillSelect(select, first, options, value, label) {
    select.textContent = "";
    select.append(new Option(first, ""));
    if (value !== "" && !options.some(([v]) => v === value)) options = [...options, [value, `${label} (0)`]];
    for (const [v, text] of options) select.append(new Option(text, v));
    select.value = value;
  }
  // [value, "name (how many)"] for each value of key() among the list's items
  function tally(list, key, label) {
    const n = new Map();
    for (const e of list) {
      const k = key(e.card);
      if (k === "") continue;
      const t = n.get(k) || { count: 0, label: label(e.card) };
      t.count++;
      n.set(k, t);
    }
    return [...n].map(([k, t]) => [String(k), `${t.label} (${t.count})`]);
  }

  function renderFilters() {
    const kinds = $("kinds");
    kinds.textContent = "";
    const forKinds = ENTRIES.filter((e) => passes(e, { ...f, k: "all" }));
    const n = counts(forKinds);
    for (const [k, label] of [["all", "All"], ...KINDS]) {
      const b = el("button", k === "all" ? "" : k, `${label} ${k === "all" ? forKinds.length : n[k]}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(f.k === k));
      b.addEventListener("click", () => set({ k }));
      kinds.append(b);
    }

    const forCats = ENTRIES.filter((e) => passes(e, { ...f, c: "", t: "", s: "" }));
    const chosen = DATA.categories[f.c] || { name: "Other", subs: {} };
    const cats = tally(forCats, (c) => c.class, (c) => category(c).name)
      .sort(([a], [b]) => order(+a) - order(+b));
    fillSelect($("category"), "All categories", cats, f.c, chosen.name);

    const forTypes = ENTRIES.filter((e) => passes(e, { ...f, t: "", s: "" }));
    $("typeField").hidden = f.c === "";
    fillSelect($("type"), "All types", tally(forTypes, (c) => (typeName(c) ? c.subclass : ""), typeName)
      .sort((a, b) => a[1].localeCompare(b[1])), f.t, chosen.subs[f.t]);

    // slots only for gear
    const forSlots = ENTRIES.filter((e) => passes(e, { ...f, s: "" }));
    const slots = tally(forSlots, (c) => INV_NAMES[c.inv] || "", (c) => INV_NAMES[c.inv]);
    $("slotField").hidden = !f.s && (slots.length < 2 || !["", "2", "4"].includes(f.c));
    fillSelect($("slot"), "All slots", slots.sort((a, b) => a[0].localeCompare(b[0])), f.s, f.s);

    fillSelect($("cls"), "Any class", CLASSES.map((cl) => [cl.token, cl.name]), f.cls);
    $("faction").value = f.f;
    $("sort").value = f.sort;
    if (document.activeElement !== $("search")) $("search").value = f.q;
    $("levelLo").value = f.lo;
    $("levelHi").value = f.hi;

    const chips = $("qualities");
    chips.textContent = "";
    const present = new Set(ENTRIES.filter((e) => f.u === "all" || e.u.id === f.u).map((e) => e.card.quality));
    for (const q of [...present].sort()) {
      const b = el("button", "chip q-" + QUALITY[q], cap(QUALITY[q]));
      b.type = "button";
      b.setAttribute("aria-pressed", String(f.ql.includes(q)));
      b.addEventListener("click", () => set({ ql: f.ql.includes(q) ? f.ql.filter((x) => x !== q) : [...f.ql, q] }));
      chips.append(b);
    }
    $("clear").hidden = Object.keys(BLANK).every((k) => k === "sort" || String(f[k]) === String(BLANK[k]));
  }
  const order = (cls) => {
    const i = CATEGORY_ORDER.indexOf(cls);
    return i < 0 ? CATEGORY_ORDER.length + cls : i;
  };

  // ---- the list
  function icon(e) {
    const c = e.card;
    const span = el("span", "wn-icon q-border-" + QUALITY[c.quality]);
    const i = e.u.icons[c.icon];
    if (i === undefined) {
      span.classList.add("none");
    } else {
      const size = DATA.iconSize, cols = DATA.iconCols;
      span.style.backgroundImage = `url(img/changes/${e.u.id}.jpg)`;
      span.style.backgroundPosition = `-${(i % cols) * size}px -${Math.floor(i / cols) * size}px`;
    }
    return span;
  }

  function tooltip(c) {
    const box = el("div", "itip");
    box.append(el("h4", "q-" + QUALITY[c.quality], c.name));
    if (c.unique) box.append(el("div", null, "Unique"));
    if (binding(c)) box.append(el("div", null, binding(c)));
    if (c.inv && c.inv !== 18) {
      const right = c.class === 2 ? WEAPON_NAMES[c.subclass] || typeName(c)
        : c.class === 4 && c.subclass > 0 && c.inv !== 16 ? ARMOR_NAMES[c.subclass] || typeName(c) : "";
      const two = el("div", "two");
      two.append(el("span", null, INV_NAMES[c.inv] || ""), el("span", null, right));
      box.append(two);
    }
    if (c.weapon) {
      const w = c.weapon, two = el("div", "two");
      two.append(el("span", null, `${w.min} - ${w.max} ${w.school ? SCHOOLS[w.school] + " " : ""}Damage`),
        el("span", null, `Speed ${w.speed.toFixed(2)}`));
      box.append(two, el("div", null, `(${dps(w)} damage per second)`));
    }
    if (c.armor) box.append(el("div", null, `${c.armor} Armor`));
    const stats = Object.entries(c.stats || {}).sort(byPrimary);
    for (const [k, v] of stats) {
      box.append(PRIMARY.includes(k) ? el("div", null, statText(k, v)) : el("div", "green", `Equip: ${statText(k, v)}`));
    }
    for (const e of c.effects || []) box.append(el("div", "green", effectLine(e)));
    if (c.bagSlots) box.append(el("div", null, `${c.bagSlots} Slot ${typeName(c) || "Bag"}`));
    if (c.classMask) box.append(el("div", null, `Classes: ${classList(c)}`));
    if (c.req > 1) box.append(el("div", null, `Requires Level ${c.req}`));
    if (c.prof) box.append(el("div", null, `Requires ${c.prof.replace(/ (\d+)$/, " ($1)")}`));
    if (c.faction) box.append(el("div", null, `${c.faction} only`));
    if (c.set) box.append(el("div", "setname", `Set: ${c.set}`));
    if (c.flavor) box.append(el("div", "flavor", `“${c.flavor}”`));
    box.append(el("div", "muted", [`Item Level ${c.ilvl}`, c.forever ? "New in Forever" : "",
      c.src ? `Source: ${SOURCE_NAMES[c.src]}` : ""].filter(Boolean).join(" · ")));
    return box;
  }

  let tipFor = null;
  function showTip(c, anchor) {
    const tip = $("tooltip");
    tip.textContent = "";
    tip.append(tooltip(c));
    tip.hidden = false;
    tipFor = anchor;
    const r = anchor.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.left + 52;
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    let y = r.bottom + 6;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = y + "px";
  }
  function hideTip(anchor) {
    if (tipFor === anchor) { $("tooltip").hidden = true; tipFor = null; }
  }

  function detail(e) {
    const box = el("div", "wn-detail");
    const column = (label, c) => {
      const col = el("div", "wn-col");
      if (label) col.append(el("div", "lbl", label));
      col.append(tooltip(c));
      return col;
    };
    if (e.kind === "changed") box.append(column("Before", before(e.card)), column("Now", e.card));
    else box.append(column(e.kind === "removed" ? "Before it was removed" : "", e.card));
    return box;
  }

  function row(e) {
    const c = e.card, key = `${e.u.id}:${e.kind}:${c.id}`;
    const li = el("li", "wn-item");
    const head = el("div", "wn-head");
    const btn = el("button", "wn-row");
    btn.type = "button";
    btn.setAttribute("aria-expanded", String(open.has(key)));
    const main = el("span", "wn-main");
    main.append(el("span", "wn-name q-" + QUALITY[c.quality], c.name),
      el("span", "wn-meta", metaLine(c) + (f.u === "all" ? ` · ${longDate(e.u.date)}` : "")));
    const sum = e.kind === "changed" ? "" : summary(c);
    if (e.kind === "changed") {
      const d = el("span", "wn-diffs");
      for (const x of diffs(c)) d.append(el("span", "wn-diff " + x.dir, x.text));
      main.append(d);
    } else if (sum) {
      main.append(el("span", "wn-sum", sum));
    }
    btn.append(icon(e), main);
    const link = el("a", "wn-link", "Wowhead");
    link.href = wowheadUrl(c);
    link.target = "_blank";
    link.rel = "noopener";
    link.title = "Where it drops and who sells it, on Wowhead";
    head.append(btn, el("span", "wn-badge " + e.kind, KIND_NAME[e.kind]), link);
    li.append(head);
    if (open.has(key)) li.append(detail(e));
    btn.addEventListener("click", () => {
      hideTip(btn);
      if (open.delete(key)) li.querySelector(".wn-detail").remove();
      else { open.add(key); li.append(detail(e)); }
      btn.setAttribute("aria-expanded", String(open.has(key)));
    });
    btn.addEventListener("pointerenter", (ev) => { if (ev.pointerType === "mouse" && !open.has(key)) showTip(c, btn); });
    btn.addEventListener("pointerleave", () => hideTip(btn));
    return li;
  }

  function renderResults() {
    const list = ENTRIES.filter((e) => passes(e, f)).sort((a, b) => SORTS[f.sort](a.card, b.card));
    const inUpdate = ENTRIES.filter((e) => f.u === "all" || e.u.id === f.u).length;
    const filtered = list.length !== inUpdate;
    $("summary").textContent = !list.length ? (inUpdate ? "No items match these filters." : "")
      : `${list.length} item${list.length === 1 ? "" : "s"}` + (filtered ? ` match your filters (of ${inUpdate})` : "") +
        ". Click an item for its full tooltip" + (f.k !== "added" ? ", and before and after for changed ones." : ".");
    const out = $("results");
    out.textContent = "";
    const groups = new Map();
    for (const e of list) {
      if (!groups.has(e.card.class)) groups.set(e.card.class, []);
      groups.get(e.card.class).push(e);
    }
    for (const [cls, entries] of [...groups].sort(([a], [b]) => order(a) - order(b))) {
      const section = el("section", "wn-group");
      const h = el("h3", null, category(entries[0].card).name);
      h.append(el("span", "n", String(entries.length)));
      const ul = el("ul", "wn-list");
      const shown = allShown.has(cls) ? entries : entries.slice(0, ROWS_SHOWN);
      for (const e of shown) ul.append(row(e));
      section.append(h, ul);
      if (shown.length < entries.length) {
        const more = el("button", "btn wn-more", `Show all ${entries.length}`);
        more.type = "button";
        more.addEventListener("click", () => { allShown.add(cls); renderResults(); });
        section.append(more);
      }
      out.append(section);
    }
  }

  function render() {
    writeHash();
    renderUpdates();
    renderFilters();
    renderResults();
  }

  // ---- controls
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  let searchTimer;
  $("search").addEventListener("input", (ev) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => set({ q: ev.target.value.trim() }), 150);
  });
  $("category").addEventListener("change", (ev) => set({ c: ev.target.value, t: "", s: "" }));
  $("type").addEventListener("change", (ev) => set({ t: ev.target.value }));
  $("slot").addEventListener("change", (ev) => set({ s: ev.target.value }));
  $("cls").addEventListener("change", (ev) => set({ cls: ev.target.value }));
  $("faction").addEventListener("change", (ev) => set({ f: ev.target.value }));
  $("sort").addEventListener("change", (ev) => set({ sort: ev.target.value }));
  for (const [id, key] of [["levelLo", "lo"], ["levelHi", "hi"]]) {
    $(id).addEventListener("change", (ev) => {
      const n = parseInt(ev.target.value, 10);
      set({ [key]: n >= 1 && n <= 60 ? n : "" });
    });
  }
  $("clear").addEventListener("click", () => set({ ...BLANK, sort: f.sort }));
  $("copyLink").addEventListener("click", () => {
    navigator.clipboard.writeText(location.href).then(() => toast("Link copied: it opens this list with these filters."),
      () => toast("Couldn't copy the link: copy it from the address bar instead."));
  });
  window.addEventListener("hashchange", () => { readHash(); render(); });

  const newest = DATA.updates[0];
  $("dataNote").textContent = newest
    ? `Newest: ${newest.title}, ${longDate(newest.date)}. ${DATA.updates.length} update${DATA.updates.length === 1 ? "" : "s"} recorded.`
    : "";
  readHash();
  render();
})();
