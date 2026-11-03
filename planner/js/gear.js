// Kor'kron Planner: gear slots, item picker and character sheet.
// Item data (data/items.js, ~1.4 MB) loads the first time the Gear tab is opened or a link has gear in it.
(function () {
  "use strict";

  const KP = window.KP;
  const app = KP.app;
  const state = app.state;
  const rules = KP.classes.rules;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // ------------------------------------------------------------ slots and who can use what

  const SLOTS = [
    { key: "head", name: "Head", inv: [1] },
    { key: "neck", name: "Neck", inv: [2] },
    { key: "shoulder", name: "Shoulders", inv: [3] },
    { key: "back", name: "Back", inv: [16] },
    { key: "chest", name: "Chest", inv: [5, 20] },
    { key: "wrist", name: "Wrists", inv: [9] },
    { key: "hands", name: "Hands", inv: [10] },
    { key: "waist", name: "Waist", inv: [6] },
    { key: "legs", name: "Legs", inv: [7] },
    { key: "feet", name: "Feet", inv: [8] },
    { key: "finger1", name: "Ring", inv: [11] },
    { key: "finger2", name: "Ring", inv: [11] },
    { key: "trinket1", name: "Trinket", inv: [12] },
    { key: "trinket2", name: "Trinket", inv: [12] },
    { key: "mainHand", name: "Main Hand", inv: [13, 17, 21] },
    { key: "offHand", name: "Off Hand", inv: [13, 14, 22, 23] },
    { key: "ranged", name: "Ranged / Relic", inv: [15, 25, 26, 28] },
  ];

  // Weapon types (item subclass) each class can learn: the client's own skill table (SkillRaceClassInfo, checked on
  // build 1.60.1.70707). Forever adds one-handed axes for Rogues. The client also lists Shaman Dual Wield and Druid
  // polearms, but Classic Era has the same Season of Discovery rows and never allowed them, so they're left out.
  const AXE1 = 0, AXE2 = 1, BOW = 2, GUN = 3, MACE1 = 4, MACE2 = 5, POLE = 6, SWORD1 = 7, SWORD2 = 8,
    STAFF = 10, FIST = 13, MISC = 14, DAGGER = 15, THROWN = 16, XBOW = 18, WAND = 19;
  const WEAPONS = {
    WARRIOR: [AXE1, AXE2, BOW, GUN, MACE1, MACE2, POLE, SWORD1, SWORD2, STAFF, FIST, DAGGER, THROWN, XBOW, MISC],
    PALADIN: [AXE1, AXE2, MACE1, MACE2, POLE, SWORD1, SWORD2, MISC],
    HUNTER: [AXE1, AXE2, BOW, GUN, POLE, SWORD1, SWORD2, STAFF, FIST, DAGGER, THROWN, XBOW, MISC],
    ROGUE: [AXE1, BOW, GUN, MACE1, SWORD1, FIST, DAGGER, THROWN, XBOW, MISC],
    PRIEST: [MACE1, STAFF, DAGGER, WAND, MISC],
    SHAMAN: [AXE1, AXE2, MACE1, MACE2, STAFF, FIST, DAGGER, MISC],
    MAGE: [SWORD1, STAFF, DAGGER, WAND, MISC],
    WARLOCK: [SWORD1, STAFF, DAGGER, WAND, MISC],
    DRUID: [MACE1, MACE2, STAFF, FIST, DAGGER, MISC],
  };
  // Dual wield (one-handers in the off hand) and the level it's learned (client skill table; same as Classic).
  const DUAL_WIELD = { WARRIOR: 20, ROGUE: 10, HUNTER: 20 };
  // Warriors and Paladins learn Plate at 40; Hunters and Shamans learn Mail at 40 (client skill table; same as Classic).
  const ARMOR_AT_40 = { WARRIOR: 4, PALADIN: 4, HUNTER: 3, SHAMAN: 3 };
  // weapon skills learned later (client skill table): Warriors, Paladins and Hunters learn Polearms at 20
  const WEAPON_LEVEL = { WARRIOR: { [POLE]: 20 }, PALADIN: { [POLE]: 20 }, HUNTER: { [POLE]: 20 } };

  const WEAPON_NAMES = {
    0: "Axe", 1: "Axe", 2: "Bow", 3: "Gun", 4: "Mace", 5: "Mace", 6: "Polearm", 7: "Sword", 8: "Sword",
    10: "Staff", 13: "Fist Weapon", 14: "Miscellaneous", 15: "Dagger", 16: "Thrown", 18: "Crossbow", 19: "Wand",
  };
  const ARMOR_NAMES = { 1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate", 6: "Shield", 7: "Libram", 8: "Idol", 9: "Totem" };
  const INV_NAMES = {
    1: "Head", 2: "Neck", 3: "Shoulder", 5: "Chest", 6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrist", 10: "Hands",
    11: "Finger", 12: "Trinket", 13: "One-Hand", 14: "Off Hand", 15: "Ranged", 16: "Back", 17: "Two-Hand",
    20: "Chest", 21: "Main Hand", 22: "Off Hand", 23: "Held In Off-hand", 25: "Thrown", 26: "Ranged", 28: "Relic",
  };
  const QUALITY = ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"];

  // How each stat reads on a tooltip, and on the sheet.
  const STAT_TEXT = {
    strength: "Strength", agility: "Agility", stamina: "Stamina", intellect: "Intellect", spirit: "Spirit",
    hit: "Hit Rating", crit: "Critical Strike Rating", haste: "Haste Rating", dodge: "Dodge Rating",
    parry: "Parry Rating", block: "Block Rating", defense: "Defense Rating", expertise: "Expertise Rating",
    attackPower: "Attack Power", rangedAttackPower: "Ranged Attack Power", spellPower: "Spell Power",
    spellDamage: "Spell Damage", healing: "Healing", manaRegen: "Mana per 5 sec.", healthRegen: "Health per 5 sec.",
    blockValue: "Block Value", bonusArmor: "Armor", spellPen: "Spell Penetration", armorPen: "Armor Penetration",
    fireResist: "Fire Resistance", frostResist: "Frost Resistance", natureResist: "Nature Resistance",
    shadowResist: "Shadow Resistance", arcaneResist: "Arcane Resistance", holyResist: "Holy Resistance",
    fireDamage: "Fire Spell Damage", frostDamage: "Frost Spell Damage", natureDamage: "Nature Spell Damage",
    shadowDamage: "Shadow Spell Damage", arcaneDamage: "Arcane Spell Damage", holyDamage: "Holy Spell Damage",
    axeSkill: "Axe Skill", maceSkill: "Mace Skill", swordSkill: "Sword Skill", daggerSkill: "Dagger Skill",
    fistSkill: "Fist Weapon Skill", attackPowerVsUndead: "Attack Power against Undead",
    attackPowerVsDemons: "Attack Power against Demons", attackPowerVsBeasts: "Attack Power against Beasts",
    spellDamageVsUndead: "Spell Damage against Undead", mana: "Mana", health: "Health",
  };
  const RATING = { hit: "meleeHit", crit: "meleeCrit", haste: "meleeHaste", dodge: "dodge", parry: "parry",
    block: "block", defense: "defense", expertise: "expertise" };
  const SHORT = { strength: "Str", agility: "Agi", stamina: "Sta", intellect: "Int", spirit: "Spi", hit: "Hit",
    crit: "Crit", attackPower: "AP", spellPower: "SP", spellDamage: "Spell Dmg", healing: "Heal", defense: "Def",
    dodge: "Dodge", parry: "Parry", block: "Block", blockValue: "Block Value", rangedAttackPower: "RAP",
    manaRegen: "Mp5", haste: "Haste" };
  const TRIGGER = { 0: "Use", 1: "Equip", 2: "Chance on hit" };
  const SCHOOLS = ["Physical", "Holy", "Fire", "Nature", "Frost", "Shadow", "Arcane"];
  // where an item comes from: the game's own tag (data script, ItemModifiedAppearance); not every item has one
  const SOURCE_NAMES = { drop: "Drop", quest: "Quest", vendor: "Vendor", crafted: "Crafted" };
  // Wowhead's Forever database: its item pages list who drops, sells or makes an item (we only link to it)
  const wowheadUrl = (it) => `https://www.wowhead.com/forever/item=${it.id}`;

  // Filter buttons in the item picker. Several buttons in one row = any of them; none = everything.
  // Armor and source choices carry over between slots (Plate picked for the head stays on for the chest);
  // weapon choices are kept per slot. A row only shows when it can narrow the list.
  const HAND_NAMES = { 13: "One-Hand", 21: "Main Hand", 22: "Off Hand", 17: "Two-Hand", 14: "Shield", 23: "Held in off hand" };
  const FILTERS = [
    { id: "hand", label: "Hand", slots: ["mainHand", "offHand"],
      order: ["One-Hand", "Main Hand", "Off Hand", "Two-Hand", "Shield", "Held in off hand"],
      value: (it) => HAND_NAMES[it.inv] },
    { id: "type", label: "Type", slots: ["mainHand", "offHand", "ranged"],
      order: ["Axe", "Mace", "Sword", "Dagger", "Fist Weapon", "Staff", "Polearm", "Bow", "Gun", "Crossbow", "Thrown",
        "Wand", "Miscellaneous", "Libram", "Idol", "Totem"],
      value: (it) => (it.class === 2 ? WEAPON_NAMES[it.subclass] : it.inv === 28 ? ARMOR_NAMES[it.subclass] : null) },
    { id: "armor", label: "Armor", shared: true, slots: ["head", "shoulder", "chest", "wrist", "hands", "waist", "legs", "feet"],
      order: ["Cloth", "Leather", "Mail", "Plate", "Other"],
      value: (it) => (it.class === 4 ? (it.subclass >= 1 && it.subclass <= 4 ? ARMOR_NAMES[it.subclass] : "Other") : null) },
    { id: "source", label: "Source", shared: true, order: Object.values(SOURCE_NAMES), value: (it) => SOURCE_NAMES[it.src] },
  ];

  // ------------------------------------------------------------ state

  const gear = {};      // slot key -> item id
  let items = null;     // id -> item, once data/items.js has loaded
  let loading = false;
  let view = "talents";
  let pickSlot = null;
  // Worked out once each time the picker opens (nothing about the character changes while it's open):
  let usable = [];         // items this character can put in the open slot
  let gainCache = null;    // item id -> damage change if worn in the open slot
  let gainBase = 0;        // the score with what's in the slot now
  const chosen = {};       // filter key -> Set of chosen values
  const hayCache = new Map(); // item id -> the text the search looks through

  const slotByKey = Object.fromEntries(SLOTS.map((s) => [s.key, s]));

  function loadItems(then) {
    if (items) return then && then();
    if (loading) return;
    loading = true;
    const s = document.createElement("script");
    s.src = "data/items.js";
    s.onload = () => {
      items = new Map(KP.items.items.map((i) => [i.id, i]));
      then && then();
      if (app.renderPanel) app.renderPanel(); // the stats panel can now count the gear
      if (app.renderPriority) app.renderPriority();
      if (app.renderAbilities) app.renderAbilities();
    };
    s.onerror = () => app.toast("Couldn't load the item list.");
    document.head.append(s);
  }

  // ------------------------------------------------------------ rules

  function armorAllowed(it) {
    const cls = state.cls;
    if (it.subclass === 0) return true; // rings, necks, trinkets, held items
    if (!(cls.armorMask & (1 << it.subclass))) return false;
    const late = ARMOR_AT_40[cls.token];
    if (late && it.subclass === late && state.level < 40) return false;
    return true;
  }

  const myFaction = () => (KP.classes.races.find((r) => r.id === state.race) || {}).faction;

  // Why this item can't go in this slot for this character (null if it can). `mh` = the main hand to check an off-hand
  // item against (default: the one worn now; Equip BiS passes its own).
  function whyNot(it, slotKey, mh) {
    const slot = slotByKey[slotKey];
    const cls = state.cls;
    if (!slot.inv.includes(it.inv)) return "Wrong slot.";
    if (it.faction && myFaction() && it.faction !== myFaction()) return `${it.faction} only.`;
    if (it.classMask && !(it.classMask & (1 << (cls.id - 1)))) return `${cls.name}s can't use this.`;
    if (it.class === 2 && !(WEAPONS[cls.token] || []).includes(it.subclass)) return `${cls.name}s can't use ${WEAPON_NAMES[it.subclass] || "this weapon"}s.`;
    const wl = it.class === 2 && (WEAPON_LEVEL[cls.token] || {})[it.subclass];
    if (wl && state.level < wl) return `${cls.name}s learn ${WEAPON_NAMES[it.subclass]}s at level ${wl}.`;
    if (it.class === 4 && !armorAllowed(it)) {
      const late = ARMOR_AT_40[cls.token];
      return late === it.subclass ? `${cls.name}s learn ${ARMOR_NAMES[late]} at level 40.` : `${cls.name}s can't wear this.`;
    }
    if (slotKey === "offHand") {
      if ([13, 22].includes(it.inv)) {
        const dw = DUAL_WIELD[cls.token];
        if (!dw) return `${cls.name}s can't dual wield.`;
        if (state.level < dw) return `${cls.name}s learn Dual Wield at level ${dw}.`;
      }
      const main = mh !== undefined ? mh : items && items.get(gear.mainHand);
      if (main && main.inv === 17) return "Your main hand is a two-handed weapon.";
    }
    if (it.req > state.level) return `Requires level ${it.req}.`;
    return null;
  }

  function equipped() {
    // items that are actually worn: usable now and allowed in their slot
    const out = [];
    if (!items) return out;
    for (const s of SLOTS) {
      const it = items.get(gear[s.key]);
      if (it && !whyNot(it, s.key)) out.push({ slot: s.key, item: it });
    }
    return out;
  }

  // ------------------------------------------------------------ link

  app.encoders.push(() => {
    const ids = SLOTS.map((s) => (gear[s.key] ? gear[s.key].toString(36) : ""));
    while (ids.length && !ids[ids.length - 1]) ids.pop();
    return (ids.length ? "&g=" + ids.join(".") : "") + (view !== "talents" ? "&v=" + view : "");
  });

  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    for (const s of SLOTS) delete gear[s.key];
    (p.get("g") || "").split(".").forEach((v, i) => {
      const id = parseInt(v, 36);
      if (SLOTS[i] && id > 0) gear[SLOTS[i].key] = id;
    });
    return { view: ["gear", "priority", "abilities", "builds"].includes(p.get("v")) ? p.get("v") : "talents", hasGear: !!p.get("g") };
  }

  // ------------------------------------------------------------ icons and tooltips

  function iconStyle(node, fileId, size) {
    const n = KP.items.icons[String(fileId)];
    if (n == null) return;
    const cols = KP.items.iconCols;
    node.style.backgroundImage = "url(img/item-icons.jpg)";
    node.style.backgroundSize = `${cols * size}px auto`;
    node.style.backgroundPosition = `${-(n % cols) * size}px ${-Math.floor(n / cols) * size}px`;
  }

  const pct = (v) => (Math.round(v * 100) / 100).toString();

  function ratingPct(stat, amount) {
    const key = RATING[stat];
    if (!key) return null;
    const per = rules.ratings[key][Math.max(0, state.level - 1)];
    return per ? amount / per : null;
  }

  function typeLine(it) {
    if (it.class === 2) return WEAPON_NAMES[it.subclass] || "Weapon";
    if (it.class === 4 && ARMOR_NAMES[it.subclass] && it.inv !== 16) return ARMOR_NAMES[it.subclass];
    return "";
  }

  function itemTooltip(it, slotKey) {
    const box = el("div", "itip");
    box.append(el("h4", "q-" + QUALITY[it.quality], it.name));
    if (it.bop) box.append(el("div", null, "Binds when picked up"));
    else if (it.boe) box.append(el("div", null, "Binds when equipped"));
    const row = el("div", "two");
    row.append(el("span", null, INV_NAMES[it.inv] || ""), el("span", null, typeLine(it)));
    box.append(row);
    if (it.weapon) {
      const w = it.weapon;
      const r2 = el("div", "two");
      r2.append(el("span", null, `${w.min} - ${w.max} ${w.school ? SCHOOLS[w.school] + " " : ""}Damage`), el("span", null, `Speed ${w.speed.toFixed(2)}`));
      box.append(r2, el("div", null, `(${((w.min + w.max) / 2 / w.speed).toFixed(1)} damage per second)`));
      if (it.damageUnverified) box.append(el("div", "warn", "Weapon damage not confirmed for this item."));
    }
    if (it.armor) box.append(el("div", null, `${it.armor} Armor`));
    const stats = it.stats || {};
    for (const k of ["strength", "agility", "stamina", "intellect", "spirit"]) {
      if (stats[k]) box.append(el("div", null, `${stats[k] > 0 ? "+" : ""}${stats[k]} ${STAT_TEXT[k]}`));
    }
    for (const [k, v] of Object.entries(stats)) {
      if (["strength", "agility", "stamina", "intellect", "spirit"].includes(k)) continue;
      const p = ratingPct(k, v);
      const text = `Equip: +${v} ${STAT_TEXT[k] || k}` + (p != null && k !== "defense" ? ` (${pct(p)}%)` : "");
      box.append(el("div", "green", text));
    }
    for (const e of it.effects || []) {
      if (e.text) box.append(el("div", "green", `${TRIGGER[e.trigger] || "Equip"}: ${e.text}`));
    }
    if (it.req > 1) box.append(el("div", it.req > state.level ? "warn" : null, `Requires Level ${it.req}`));
    if (it.prof) box.append(el("div", null, `Requires ${it.prof.replace(/ (\d+)$/, " ($1)")}`));
    if (it.faction) box.append(el("div", it.faction !== myFaction() ? "warn" : "muted", `${it.faction} only`));
    box.append(el("div", "muted", `Item Level ${it.ilvl}` + (it.forever ? " · New in Forever" : "") +
      (it.src ? ` · Source: ${SOURCE_NAMES[it.src]}` : "")));
    if (it.set && KP.items.sets[it.set]) {
      const set = KP.items.sets[it.set];
      const have = new Set(equipped().map((e) => e.item.id));
      const count = set.items.filter((id) => have.has(id)).length;
      box.append(el("div", "setname", `${set.name} (${count}/${set.items.length})`));
      if (set.cls && set.cls !== state.cls.token) {
        const owner = (KP.classes.classes.find((c) => c.token === set.cls) || {}).name || set.cls;
        box.append(el("div", "warn", `A ${owner} set: its bonuses are for ${owner} abilities, and its pieces come from ${owner} tokens.`));
      }
      for (const b of set.bonuses) {
        box.append(el("div", count >= b.pieces ? "green" : "muted", `(${b.pieces}) Set: ${b.text || "?"}`));
      }
    }
    const why = slotKey ? whyNot(it, slotKey) : null;
    if (why) box.append(el("div", "warn", why));
    return box;
  }

  let tipFor = null;
  function showItemTip(it, anchor, slotKey) {
    const tip = $("tooltip");
    tip.textContent = "";
    tip.classList.remove("sticky");
    tip.append(itemTooltip(it, slotKey));
    tip.hidden = false;
    tipFor = anchor;
    const r = anchor.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.right + 12;
    if (x + w > innerWidth - 8) x = r.left - w - 12;
    if (x < 8) x = 8;
    tip.style.left = x + "px";
    tip.style.top = Math.max(8, Math.min(r.top, innerHeight - h - 8)) + "px";
  }
  function hideItemTip(anchor) {
    if (tipFor === anchor) { $("tooltip").hidden = true; tipFor = null; }
  }
  function hookTip(node, it, slotKey) {
    node.addEventListener("mouseenter", (e) => { if (e.pointerType !== "touch") showItemTip(it, node, slotKey); });
    node.addEventListener("mouseleave", () => hideItemTip(node));
    node.addEventListener("focus", () => showItemTip(it, node, slotKey));
    node.addEventListener("blur", () => hideItemTip(node));
  }

  function statSummary(it) {
    const parts = [];
    if (it.weapon) parts.push(`${((it.weapon.min + it.weapon.max) / 2 / it.weapon.speed).toFixed(1)} dps, ${it.weapon.speed.toFixed(1)} speed`);
    for (const [k, v] of Object.entries(it.stats || {})) {
      const p = ratingPct(k, v);
      parts.push(p != null && k !== "defense" ? `+${pct(p)}% ${SHORT[k] || k}` : `+${v} ${SHORT[k] || STAT_TEXT[k] || k}`);
    }
    if (it.effects && it.effects.some((e) => e.text)) parts.push("+ effect");
    return parts.join(", ");
  }

  // ------------------------------------------------------------ slots

  function renderSlots() {
    const box = $("slots");
    box.textContent = "";
    for (const s of SLOTS) {
      const it = items && items.get(gear[s.key]);
      const b = el("button", "slot");
      b.type = "button";
      const ic = el("span", "iicon");
      const text = el("span", "stext");
      if (it) {
        iconStyle(ic, it.icon, 40);
        ic.classList.add("q-border-" + QUALITY[it.quality]);
        text.append(el("span", "sname q-" + QUALITY[it.quality], it.name));
        const why = whyNot(it, s.key);
        text.append(el("span", why ? "ssub warn" : "ssub", why || statSummary(it)));
        hookTip(b, it, s.key);
      } else {
        ic.classList.add("empty");
        text.append(el("span", "sname muted", s.name), el("span", "ssub muted", "Empty"));
      }
      b.append(ic, text);
      b.setAttribute("aria-label", `${s.name}: ${it ? it.name : "empty"}`);
      b.addEventListener("click", () => openPicker(s.key));
      const row = el("div", "slot-row");
      row.append(b);
      if (it) row.append(wowheadLink(it));
      box.append(row);
    }
  }

  function wowheadLink(it) {
    const a = el("a", "wh", "↗");
    a.href = wowheadUrl(it);
    a.target = "_blank";
    a.rel = "noopener";
    a.title = "Where to get it: opens this item on Wowhead (who drops, sells or makes it)";
    a.setAttribute("aria-label", `${it.name} on Wowhead`);
    return a;
  }

  // ------------------------------------------------------------ picker

  function openPicker(slotKey) {
    pickSlot = slotKey;
    const slot = slotByKey[slotKey];
    $("pickerTitle").textContent = slot.name;
    $("pickerSearch").value = "";
    $("pickerRemove").hidden = !gear[slotKey];
    usable = [];
    for (const it of items.values()) if (!whyNot(it, slotKey)) usable.push(it);
    usable.sort((a, b) => b.ilvl - a.ilvl || b.quality - a.quality || a.name.localeCompare(b.name));
    gainCache = new Map();
    gainBase = app.scoreWith ? app.scoreWith(slotKey, items.get(gear[slotKey]) || null) : 0;
    renderPicker();
    $("picker").showModal();
    $("tooltip").hidden = true;
    if (matchMedia("(pointer: fine)").matches) $("pickerSearch").focus();
  }

  function hay(it) {
    let h = hayCache.get(it.id);
    if (h == null) {
      h = (it.name + " " + Object.keys(it.stats || {}).map((k) => STAT_TEXT[k] || k).join(" ") + " " + typeLine(it) +
        " " + (SOURCE_NAMES[it.src] || "") + " " + (it.effects || []).map((e) => e.text || "").join(" ")).toLowerCase();
      hayCache.set(it.id, h);
    }
    return h;
  }

  // damage change if this item replaced what's in the slot now (estimated DPS from the panel's math)
  function gainOf(it) {
    let g = gainCache.get(it.id);
    if (g == null) { g = app.scoreWith(pickSlot, it) - gainBase; gainCache.set(it.id, g); }
    return g;
  }

  // The filter rows for the open slot: which buttons to offer (from every item the character can use here, so they
  // don't jump around while typing) and which are switched on.
  function filterRows() {
    const rows = [];
    for (const f of FILTERS) {
      if (f.slots && !f.slots.includes(pickSlot)) continue;
      const present = new Set();
      let untagged = false;
      for (const it of usable) { const v = f.value(it); if (v) present.add(v); else untagged = true; }
      const options = f.order.filter((v) => present.has(v));
      if (options.length < 2 && !(options.length === 1 && untagged)) continue; // nothing to narrow
      const key = f.shared ? f.id : f.id + ":" + pickSlot;
      const on = new Set([...(chosen[key] || [])].filter((v) => present.has(v)));
      rows.push({ f, key, options, on });
    }
    return rows;
  }

  function renderFilters(rows, matches, passes) {
    const box = $("pickerFilters");
    const focusKey = box.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    box.textContent = "";
    box.hidden = !rows.length;
    for (const row of rows) {
      const line = el("div", "fgroup");
      line.setAttribute("role", "group");
      line.setAttribute("aria-label", row.f.label);
      const chips = el("div", "fchips");
      line.append(el("span", "flabel", row.f.label), chips);
      // how many items each button would show, with the search and the other rows applied
      const counts = {};
      for (const it of matches) if (passes(it, row)) { const v = row.f.value(it); if (v) counts[v] = (counts[v] || 0) + 1; }
      for (const v of row.options) {
        const on = row.on.has(v);
        const b = el("button", "btn small chip" + (on ? " primary" : ""), v + " ");
        b.type = "button";
        b.dataset.k = row.key + "|" + v;
        b.setAttribute("aria-pressed", String(on));
        b.append(el("span", "n", String(counts[v] || 0)));
        b.addEventListener("click", () => {
          const set = chosen[row.key] || (chosen[row.key] = new Set());
          if (set.has(v)) set.delete(v); else set.add(v);
          renderPicker();
        });
        chips.append(b);
      }
      box.append(line);
    }
    if (rows.some((r) => r.on.size)) {
      const clear = el("button", "btn small clear", "Clear filters");
      clear.type = "button";
      clear.dataset.k = "clear";
      clear.addEventListener("click", () => {
        for (const r of rows) delete chosen[r.key];
        renderPicker();
        $("pickerSearch").focus();
      });
      box.append(clear);
    }
    if (focusKey) {
      const again = [...box.querySelectorAll("button")].find((b) => b.dataset.k === focusKey);
      if (again) again.focus();
    }
  }

  function renderPicker() {
    const words = $("pickerSearch").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = words.length ? usable.filter((it) => words.every((w) => hay(it).includes(w))) : usable;
    const rows = filterRows();
    const passes = (it, skip) => rows.every((r) => r === skip || !r.on.size || r.on.has(r.f.value(it)));
    const list = matches.filter((it) => passes(it));
    renderFilters(rows, matches, passes);
    const filtered = words.length || rows.some((r) => r.on.size);
    const byGain = $("pickerSortBy").value === "gain" && app.scoreWith;
    const pool = byGain ? list.slice(0, 600) : list.slice(0, 200);
    if (byGain) pool.sort((a, b) => gainOf(b) - gainOf(a));
    const ul = $("pickerList");
    ul.textContent = "";
    const shown = pool.slice(0, 200);
    for (const it of shown) {
      const li = el("li");
      const b = el("button", "pick");
      b.type = "button";
      const ic = el("span", "iicon q-border-" + QUALITY[it.quality]);
      iconStyle(ic, it.icon, 40);
      const text = el("span", "stext");
      text.append(el("span", "sname q-" + QUALITY[it.quality], it.name),
        el("span", "ssub", `${typeLine(it) ? typeLine(it) + " · " : ""}ilvl ${it.ilvl}${it.req > 1 ? " · Req " + it.req : ""}` +
          `${it.src ? " · " + SOURCE_NAMES[it.src] : ""}${it.forever ? " · Forever" : ""}`),
        el("span", "ssub", statSummary(it)));
      b.append(ic, text);
      if (app.scoreWith) {
        const g = gainOf(it);
        const cls = Math.abs(g) < 0.05 ? "same" : g > 0 ? "up" : "down";
        const gain = el("span", "gain " + cls, (cls === "same" ? "±0" : `${g > 0 ? "+" : ""}${g.toFixed(1)} dps`) +
          (it.damageUnverified ? " ?" : ""));
        gain.title = "Change in estimated damage per second if you wear this instead" +
          (it.damageUnverified ? ". This weapon's damage isn't confirmed yet, so treat this one with care." : "");
        b.append(gain);
      }
      if (gear[pickSlot] === it.id) b.classList.add("current");
      b.addEventListener("click", () => equip(it.id));
      hookTip(b, it, pickSlot);
      li.append(b, wowheadLink(it));
      ul.append(li);
    }
    const s = (n) => (n === 1 ? "" : "s");
    $("pickerCount").textContent = list.length > shown.length
      ? `Showing the top ${shown.length} of ${list.length} items${byGain ? " by damage gain (among the 600 highest item levels)" : " by item level"}. ` +
        "Type or use the filters to narrow it down."
      : filtered
        ? (list.length ? `${list.length} of the ${usable.length} item${s(usable.length)} you can use at level ${state.level} match.`
          : `None of the ${usable.length} item${s(usable.length)} you can use at level ${state.level} match. Try fewer filters or words.`)
        : `${list.length} item${s(list.length)} you can use at level ${state.level}.`;
  }

  function equip(id) {
    const it = items.get(id);
    // the same unique item can't sit in both ring or trinket slots, so move it instead of copying
    const twin = { finger1: "finger2", finger2: "finger1", trinket1: "trinket2", trinket2: "trinket1" }[pickSlot];
    if (twin && gear[twin] === id) delete gear[twin];
    gear[pickSlot] = id;
    if (pickSlot === "mainHand" && it.inv === 17) delete gear.offHand;
    $("picker").close();
    $("tooltip").hidden = true;
    app.changed();
  }

  // ------------------------------------------------------------ Equip BiS

  // Fills every slot with the best item this character can use at its level, by the planner's own numbers (the panel's
  // math): damage per second, healing per second for a healer, or survival plus some threat for a tank (0.7 / 0.3, like
  // the tank builds). Trying every item takes seconds, so first each stat's worth is measured on the character (+25 of it,
  // +300 armor); in each slot the items worth most by those weights, plus items with an equip effect or a set (which
  // weights can't see), are then tried for real. Weapons: the best two-hander against the best one-hander + off hand.
  // Run twice, the second time with the whole set on (hit caps, set bonuses). Left out: items that need a profession,
  // weapons whose damage isn't confirmed, and the other faction's gear (whyNot).
  const BIS_SLOTS = ["head", "neck", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs", "feet",
    "finger1", "finger2", "trinket1", "trinket2", "ranged"];
  const TWIN = { finger1: "finger2", finger2: "finger1", trinket1: "trinket2", trinket2: "trinket1" };
  const ROLE_NAMES = { dps: "Damage", heal: "Healing", tank: "Tanking" };
  const CAN_HEAL = ["PALADIN", "PRIEST", "DRUID", "SHAMAN"], CAN_TANK = ["WARRIOR", "PALADIN", "DRUID"];
  let bisFor = "auto";   // the player's choice: auto, dps, heal, tank
  let bisNote = null;    // what the last run did

  function autoRole() {
    if (app.prioTank && app.prioTank()) return "tank";
    if (app.prioRole && app.prioRole() === "heal") return "heal";
    return "dps";
  }
  const bisRole = () => (bisFor !== "auto" && (bisFor === "dps" || (bisFor === "heal" ? CAN_HEAL : CAN_TANK).includes(state.cls.token))
    ? bisFor : autoRole());

  // the score of a set of gear (slot -> item): v = what the role wants, e = survival (breaks ties)
  function bisEval(g, role) {
    const c = app.ctx();
    c.worn = Object.entries(g).filter(([, it]) => it).map(([slot, item]) => ({ slot, item }));
    if (role === "tank") c.tank = true; // a Druid tanks in Bear Form
    const R = KP.calc.compute(c);
    const dps = (R.rotation && R.rotation.dps) || 0;
    const e = KP.calc.ehp(R, state.level);
    const v = role === "heal" ? (R.healing ? R.healing.hps : 0) : role === "tank" ? 0.7 * Math.log(e) + 0.3 * Math.log(1 + dps) : dps;
    return { v, e };
  }
  const better = (a, b) => !b || a.v > b.v + 1e-9 * Math.max(1, Math.abs(b.v)) ||
    (Math.abs(a.v - b.v) <= 1e-9 * Math.max(1, Math.abs(b.v)) && a.e > b.e + 1e-6);

  // what +1 of each stat is worth right now (v and survival), measured with a stand-in item
  function bisWeights(g, role, keys) {
    const base = bisEval(g, role);
    const w = { v: {}, e: {} };
    for (const k of keys) {
      const amt = k === "armor" || k === "bonusArmor" ? 300 : k === "health" || k === "mana" ? 200 : 25;
      const probe = k === "armor" ? { name: "", armor: amt } : { name: "", stats: { [k]: amt } };
      const r = bisEval({ ...g, probe }, role);
      w.v[k] = (r.v - base.v) / amt;
      w.e[k] = (r.e - base.e) / amt;
    }
    return w;
  }
  const linear = (it, w) => (it.armor || 0) * (w.armor || 0) + Object.entries(it.stats || {}).reduce((s, [k, v]) => s + v * (w[k] || 0), 0);
  const weaponDps = (it) => (it.weapon ? (it.weapon.min + it.weapon.max) / 2 / it.weapon.speed : 0);

  // the items worth trying for real: the best by the stat weights (and, for weapons, by damage per second), plus items
  // whose worth isn't all in their stats (equip effects, sets)
  function shortlist(list, W, n, weapons) {
    const scored = list.map((it) => ({ it, a: linear(it, W.v), b: linear(it, W.e) }));
    scored.sort((x, y) => y.a - x.a || y.b - x.b || y.it.ilvl - x.it.ilvl || y.it.quality - x.it.quality);
    const pick = new Set(scored.slice(0, n).map((x) => x.it));
    if (weapons) [...list].sort((x, y) => weaponDps(y) - weaponDps(x)).slice(0, n).forEach((it) => pick.add(it));
    scored.filter((x) => x.it.set || (x.it.effects || []).some((e) => e.auras && e.auras.length)).slice(0, 10).forEach((x) => pick.add(x.it));
    return [...pick];
  }

  // the best of these items in one slot, the rest of the gear as it is (ties: more survival, then the list's order)
  function bestFor(g, slotKey, cands, role) {
    let best = null;
    for (const it of cands) {
      if (TWIN[slotKey] && g[TWIN[slotKey]] && g[TWIN[slotKey]].id === it.id) continue; // one of each ring / trinket
      const r = bisEval({ ...g, [slotKey]: it }, role);
      if (better(r, best)) best = { it, ...r };
    }
    return best ? best.it : null;
  }

  // Dungeon and raid loot and many quest rewards have no level requirement (0 or 1: Onyxia Tooth Pendant, Darkmantle,
  // Forever's Discarded Circlet at item level 43), so the game would let a level 1 wear them; nobody gets them that early.
  // For BiS such an item counts from 5 levels below its item level (most Classic items' requirement), at most 60.
  const bisLevel = (it) => (it.req > 1 ? it.req : Math.min(60, Math.max(1, it.ilvl - 5)));
  // another class's tier set (the data lets anyone wear it, but the game hands it out through class-locked tokens)
  const setClass = (it) => it.set && KP.items.sets[it.set] && KP.items.sets[it.set].cls;
  const otherClassSet = (it) => setClass(it) && setClass(it) !== state.cls.token;

  function computeBis() {
    const role = bisRole();
    const ok = (it, slotKey, mh) => !it.prof && !it.damageUnverified && !otherClassSet(it) && bisLevel(it) <= state.level &&
      !whyNot(it, slotKey, mh);
    const lists = {};
    for (const s of [...BIS_SLOTS, "mainHand"]) lists[s] = [];
    for (const it of items.values()) {
      for (const s of [...BIS_SLOTS, "mainHand"]) if (slotByKey[s].inv.includes(it.inv) && ok(it, s, null)) lists[s].push(it);
    }
    const offFor = (mh) => [...items.values()].filter((it) => slotByKey.offHand.inv.includes(it.inv) && ok(it, "offHand", mh));
    const keys = new Set(["armor"]);
    for (const l of Object.values(lists)) for (const it of l) for (const k of Object.keys(it.stats || {})) keys.add(k);
    const g = {};
    for (let pass = 0; pass < 2; pass++) {
      const W = bisWeights(g, role, [...keys]);
      const n = pass ? 8 : 12;
      // weapons: a two-hander, or a one-hander with the best off hand for it
      const rest = { ...g, mainHand: null, offHand: null };
      const two = bestFor(rest, "mainHand", shortlist(lists.mainHand.filter((it) => it.inv === 17), W, n, true), role);
      let one = bestFor(rest, "mainHand", shortlist(lists.mainHand.filter((it) => it.inv !== 17), W, n, true), role);
      let off = one ? bestFor({ ...rest, mainHand: one }, "offHand", shortlist(offFor(one), W, n, true), role) : null;
      if (one && off) one = bestFor({ ...rest, offHand: off }, "mainHand", shortlist(lists.mainHand.filter((it) => it.inv !== 17), W, n, true), role) || one;
      const a = two ? bisEval({ ...rest, mainHand: two }, role) : null;
      const b = one ? bisEval({ ...rest, mainHand: one, offHand: off }, role) : null;
      if (a && (!b || better(a, b))) { g.mainHand = two; g.offHand = null; } else { g.mainHand = one; g.offHand = off; }
      for (const s of BIS_SLOTS) g[s] = bestFor({ ...g, [s]: null }, s, shortlist(lists[s], W, n, s === "ranged"), role);
    }
    return { g, role };
  }

  function equipBis() {
    if (!items) return;
    const t0 = performance.now();
    const before = bisEval(Object.fromEntries(equipped().map((w) => [w.slot, w.item])), bisRole());
    const { g, role } = computeBis();
    for (const s of SLOTS) { if (g[s.key]) gear[s.key] = g[s.key].id; else delete gear[s.key]; }
    const after = bisEval(g, role);
    const n = Object.values(g).filter(Boolean).length;
    const unit = role === "heal" ? "healing per second" : "damage per second";
    const shown = (r) => (role === "tank" ? null : r.v);
    bisNote = { role, n, ms: performance.now() - t0, before: shown(before), after: shown(after), unit };
    app.changed();
  }

  function renderTools() {
    const box = $("gearTools");
    if (!box) return;
    box.textContent = "";
    const tok = state.cls.token;
    const btn = el("button", "btn primary", `Equip BiS for level ${state.level}`);
    btn.type = "button";
    btn.disabled = !items;
    btn.title = "Puts the best item you can use at this level in every slot, by the planner's own numbers. Takes a moment.";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "Working…";
      setTimeout(() => { // let the button repaint first
        try { equipBis(); } catch (e) { console.error(e); app.toast("Couldn't work out the BiS gear (see the browser console)."); render(); }
      }, 30);
    });
    const sel = el("select");
    sel.setAttribute("aria-label", "What BiS is best at");
    const opts = [["auto", `Auto (${ROLE_NAMES[autoRole()]})`], ["dps", "Damage"]];
    if (CAN_HEAL.includes(tok)) opts.push(["heal", "Healing"]);
    if (CAN_TANK.includes(tok)) opts.push(["tank", "Tanking"]);
    for (const [v, label] of opts) { const o = el("option", null, label); o.value = v; sel.append(o); }
    sel.value = opts.some(([v]) => v === bisFor) ? bisFor : "auto";
    sel.addEventListener("change", () => { bisFor = sel.value; });
    const lab = el("label", "pfield");
    lab.append(el("span", null, "for"), sel);
    const clear = el("button", "btn", "Empty all slots");
    clear.type = "button";
    clear.disabled = !SLOTS.some((s) => gear[s.key]);
    clear.addEventListener("click", () => {
      if (!confirm("Take off every item?")) return;
      for (const s of SLOTS) delete gear[s.key];
      bisNote = null;
      app.changed();
    });
    box.append(btn, lab, clear);
    if (bisNote) {
      const b = bisNote;
      const fmt1 = (v) => (Math.round(v * 10) / 10).toLocaleString("en-US");
      box.append(el("p", "muted small gear-bis-note",
        `Equipped the best ${b.n} items for ${ROLE_NAMES[b.role].toLowerCase()} (${fmt1(b.ms / 1000)} sec)` +
        (b.after != null ? `: ${fmt1(b.after)} ${b.unit}` + (b.before != null && Math.abs(b.after - b.before) > 0.05 ? ` (was ${fmt1(b.before)})` : "") : "") +
        ". Your target, buffs and talents count. Dungeon and raid loot with no level requirement counts from 5 levels below its " +
        "item level. Left out: profession items (Engineering…), weapons whose damage isn't confirmed, other classes' tier sets " +
        "and the other faction's gear; " +
        "proc and \"Use:\" effects aren't in the math. Every item is still in the picker."));
    }
  }

  // ------------------------------------------------------------ character sheet

  app.worn = equipped;

  function renderSheet() {
    const box = $("sheet");
    box.textContent = "";
    if (!items) { box.append(el("p", "muted", "Loading items…")); return; }
    if (!KP.calc || !app.ctx) return;
    const cls = state.cls;
    const R = KP.calc.compute(app.ctx());
    const S = R.S, tal = S.tal, g = (k) => S.gear[k] || 0;
    const worn = equipped();

    const note = el("div", "sheet-note");
    note.append(el("strong", null, "Base stats: "),
      S.estimated.length
        ? "the game files don't include a character's own stats, so the planner uses estimates from Classic for your race, " +
          "class and level (shown in grey in the base stats box below). Type your real ones there once you can log in."
        : "as you entered them below, plus everything your gear and talents add.");
    box.append(note);

    const section = (title, rows) => {
      const s = el("div", "sheet-sec");
      s.append(el("h3", null, title));
      const dl = el("dl");
      for (const [label, value, hint] of rows) {
        if (value == null) continue;
        const dt = el("dt", null, label);
        // whole numbers, like the game (averaged racials such as Blood Fury leave fractions)
        const dd = el("dd", null, String(typeof value === "number" ? Math.round(value) : value));
        if (hint) dd.title = hint;
        dl.append(dt, dd);
      }
      s.append(dl);
      box.append(s);
    };
    const n = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toString();
    const wline = (it) => it ? `${it.weapon.min}-${it.weapon.max} (${it.weapon.speed.toFixed(2)})` : null;

    section("Attributes", ["strength", "agility", "stamina", "intellect", "spirit"].map((k) => [
      STAT_TEXT[k], Math.round(S.attr[k]) + (tal.statPct[k] ? ` (+${tal.statPct[k]}% talents, racials)` : ""),
    ]));
    section("Melee", [
      ["Attack power", S.ap, `${S.baseAp} from your level (Classic rule), ${cls.apPerStr} per Strength` +
        (cls.apPerAgi ? `, ${cls.apPerAgi} per Agility` : "") + ", plus gear"],
      ["Hit chance", n(S.hit, 2) + "%"],
      ["Crit chance", n(S.crit, 2) + "%", "From ratings and talents. Crit from Agility isn't included yet."],
      ["Main hand", wline(S.mh)],
      ["Off hand", wline(S.oh)],
    ]);
    if (S.rg) section("Ranged", [["Ranged attack power", S.rap], ["Weapon", wline(S.rg)]]);
    if (cls.power === 0 || S.sp || S.healing) {
      const schools = Object.entries(S.school).filter(([, v]) => v)
        .map(([k, v]) => [`${k[0].toUpperCase() + k.slice(1)} damage`, S.sp + v]);
      section("Spells", [
        ["Spell damage", S.sp], ["Healing", S.healing], ...schools,
        ["Spell hit", n(S.spellHit, 2) + "%"],
        ["Spell crit", n(S.spellCrit, 2) + "%", "From ratings and talents. Crit from Intellect isn't included yet."],
        ["Mana per 5 sec", S.mp5 || null],
      ]);
    }
    section("Defense", [
      ["Armor", S.armor, "Item armor (with talents) + bonus armor + 2 per Agility"],
      ["Defense", "+" + n(S.defense)],
      ["Dodge", "+" + n(S.dodge, 2) + "%"],
      ["Parry", ["MAGE", "PRIEST", "WARLOCK"].includes(cls.token) ? null : "+" + n(S.parry, 2) + "%"],
      ["Block", S.shield ? "+" + n(S.block, 2) + "%" : null],
      ["Block value", S.blockValue || null],
    ]);
    section("Health and mana", [
      ["Health", S.health, "Base health for your class and level, plus 10 per Stamina."],
      ["Mana", S.mana || null, "Base mana plus 15 per Intellect."],
    ]);
    const res = ["fire", "frost", "nature", "shadow", "arcane"].filter((r) => g(r + "Resist"));
    if (res.length) section("Resistances", res.map((r) => [r[0].toUpperCase() + r.slice(1), g(r + "Resist")]));

    if (tal.racials.length) {
      const s = el("div", "sheet-sec");
      s.append(el("h3", null, `Racials (${app.ctx().race})`));
      const ul = el("ul", "plain");
      for (const r of tal.racials) {
        const li = el("li", r.off ? "muted" : null);
        li.append(el("strong", null, r.name + ": "), r.text);
        li.title = r.desc || "";
        ul.append(li);
      }
      s.append(ul);
      box.append(s);
    }

    if (tal.lines.length) {
      const s = el("div", "sheet-sec");
      s.append(el("h3", null, "Talents counted"));
      const ul = el("ul", "plain");
      for (const l of tal.lines) {
        const li = el("li", l.off ? "muted" : null);
        li.append(el("strong", null, l.name + ": "), l.text);
        ul.append(li);
      }
      s.append(ul);
      box.append(s);
    }

    // set bonuses and item effects (shown as text; their numbers aren't added to the sheet yet)
    const sets = {};
    for (const w of worn) if (w.item.set) sets[w.item.set] = (sets[w.item.set] || 0) + 1;
    const effects = worn.flatMap((w) => (w.item.effects || []).filter((e) => e.text).map((e) => ({ ...e, from: w.item.name })));
    if (Object.keys(sets).length || effects.length) {
      const s = el("div", "sheet-sec");
      s.append(el("h3", null, "Set bonuses and item effects"));
      s.append(el("p", "muted small", "Listed for reference; these aren't added to the numbers above yet."));
      const ul = el("ul", "plain");
      for (const [id, count] of Object.entries(sets)) {
        const set = KP.items.sets[id];
        if (!set) continue;
        for (const b of set.bonuses) {
          const li = el("li", count >= b.pieces ? "green" : "muted");
          li.append(el("strong", null, `${set.name} (${b.pieces}): `), b.text || "?");
          ul.append(li);
        }
      }
      for (const e of effects) {
        const li = el("li", "green");
        li.append(el("strong", null, `${e.from}: `), `${TRIGGER[e.trigger] || "Equip"}: ${e.text}`);
        ul.append(li);
      }
      s.append(ul);
      box.append(s);
    }
  }

  // ------------------------------------------------------------ tabs and wiring

  function setView(v, push) {
    view = v;
    $("talentsView").hidden = v !== "talents";
    $("gearView").hidden = v !== "gear";
    $("priorityView").hidden = v !== "priority";
    $("abilitiesView").hidden = v !== "abilities";
    $("buildsView").hidden = v !== "builds";
    $("tabTalents").setAttribute("aria-selected", v === "talents");
    $("tabGear").setAttribute("aria-selected", v === "gear");
    $("tabPriority").setAttribute("aria-selected", v === "priority");
    $("tabAbilities").setAttribute("aria-selected", v === "abilities");
    $("tabBuilds").setAttribute("aria-selected", v === "builds");
    $("tooltip").hidden = true;
    if (v !== "talents" && v !== "builds") loadItems(render); // the priority and abilities tabs need your weapons too
    if (app.renderPriority) app.renderPriority();
    if (app.renderAbilities) app.renderAbilities();
    if (app.renderBuilds) app.renderBuilds();
    if (push) app.changed();
  }

  function render() {
    if (view !== "gear") return;
    renderTools();
    renderSlots();
    renderSheet();
  }

  $("tabTalents").addEventListener("click", () => setView("talents", true));
  $("tabGear").addEventListener("click", () => setView("gear", true));
  $("tabPriority").addEventListener("click", () => setView("priority", true));
  $("tabAbilities").addEventListener("click", () => setView("abilities", true));
  $("tabBuilds").addEventListener("click", () => setView("builds", true));
  app.setView = setView;
  app.view = () => view;
  $("pickerClose").addEventListener("click", () => $("picker").close());
  $("pickerSearch").addEventListener("input", renderPicker);
  $("pickerSortBy").addEventListener("change", renderPicker);
  $("pickerRemove").addEventListener("click", () => {
    delete gear[pickSlot];
    $("picker").close();
    app.changed();
  });
  $("picker").addEventListener("click", (e) => { if (e.target === $("picker")) $("picker").close(); }); // click outside
  $("picker").addEventListener("close", () => { $("tooltip").hidden = true; });

  app.hooks.push(render);
  addEventListener("hashchange", () => { const h = readHash(); setView(h.view, false); render(); });

  const start = readHash();
  setView(start.view, false);
  if (start.hasGear) loadItems(render);
})();
