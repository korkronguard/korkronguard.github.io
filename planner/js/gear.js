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

  // Weapon types (item subclass) each class can learn, from Classic's trainers. To check in game.
  const AXE1 = 0, AXE2 = 1, BOW = 2, GUN = 3, MACE1 = 4, MACE2 = 5, POLE = 6, SWORD1 = 7, SWORD2 = 8,
    STAFF = 10, FIST = 13, MISC = 14, DAGGER = 15, THROWN = 16, XBOW = 18, WAND = 19;
  const WEAPONS = {
    WARRIOR: [AXE1, AXE2, BOW, GUN, MACE1, MACE2, POLE, SWORD1, SWORD2, STAFF, FIST, DAGGER, THROWN, XBOW, MISC],
    PALADIN: [AXE1, AXE2, MACE1, MACE2, POLE, SWORD1, SWORD2, MISC],
    HUNTER: [AXE1, AXE2, BOW, GUN, POLE, SWORD1, SWORD2, STAFF, FIST, DAGGER, THROWN, XBOW, MISC],
    ROGUE: [BOW, GUN, MACE1, SWORD1, FIST, DAGGER, THROWN, XBOW, MISC],
    PRIEST: [MACE1, STAFF, DAGGER, WAND, MISC],
    SHAMAN: [AXE1, AXE2, MACE1, MACE2, STAFF, FIST, DAGGER, MISC],
    MAGE: [SWORD1, STAFF, DAGGER, WAND, MISC],
    WARLOCK: [SWORD1, STAFF, DAGGER, WAND, MISC],
    DRUID: [MACE1, MACE2, STAFF, FIST, DAGGER, MISC],
  };
  // Dual wield (one-handers in the off hand) and the level it's learned, from Classic.
  const DUAL_WIELD = { WARRIOR: 20, ROGUE: 10, HUNTER: 20 };
  // Classic: Warriors and Paladins learn Plate at 40; Hunters and Shamans learn Mail at 40.
  const ARMOR_AT_40 = { WARRIOR: 4, PALADIN: 4, HUNTER: 3, SHAMAN: 3 };

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

  // ------------------------------------------------------------ state

  const gear = {};      // slot key -> item id
  let items = null;     // id -> item, once data/items.js has loaded
  let loading = false;
  let view = "talents";
  let pickSlot = null;

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

  // Why this item can't go in this slot for this character (null if it can).
  function whyNot(it, slotKey) {
    const slot = slotByKey[slotKey];
    const cls = state.cls;
    if (!slot.inv.includes(it.inv)) return "Wrong slot.";
    if (it.classMask && !(it.classMask & (1 << (cls.id - 1)))) return `${cls.name}s can't use this.`;
    if (it.class === 2 && !(WEAPONS[cls.token] || []).includes(it.subclass)) return `${cls.name}s can't use ${WEAPON_NAMES[it.subclass] || "this weapon"}s.`;
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
      const mh = items && items.get(gear.mainHand);
      if (mh && mh.inv === 17) return "Your main hand is a two-handed weapon.";
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
    return (ids.length ? "&g=" + ids.join(".") : "") + (view === "gear" ? "&v=gear" : "");
  });

  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    for (const s of SLOTS) delete gear[s.key];
    (p.get("g") || "").split(".").forEach((v, i) => {
      const id = parseInt(v, 36);
      if (SLOTS[i] && id > 0) gear[SLOTS[i].key] = id;
    });
    return { view: p.get("v") === "gear" ? "gear" : "talents", hasGear: !!p.get("g") };
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
    box.append(el("div", "muted", `Item Level ${it.ilvl}` + (it.forever ? " · New in Forever" : "")));
    if (it.set && KP.items.sets[it.set]) {
      const set = KP.items.sets[it.set];
      const have = new Set(equipped().map((e) => e.item.id));
      const count = set.items.filter((id) => have.has(id)).length;
      box.append(el("div", "setname", `${set.name} (${count}/${set.items.length})`));
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
      box.append(b);
    }
  }

  // ------------------------------------------------------------ picker

  function openPicker(slotKey) {
    pickSlot = slotKey;
    const slot = slotByKey[slotKey];
    $("pickerTitle").textContent = slot.name;
    $("pickerSearch").value = "";
    $("pickerRemove").hidden = !gear[slotKey];
    renderPicker();
    $("picker").showModal();
    $("tooltip").hidden = true;
    if (matchMedia("(pointer: fine)").matches) $("pickerSearch").focus();
  }

  function renderPicker() {
    const q = $("pickerSearch").value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const list = [];
    for (const it of items.values()) {
      if (whyNot(it, pickSlot)) continue;
      if (words.length) {
        const hay = (it.name + " " + Object.keys(it.stats || {}).map((k) => STAT_TEXT[k] || k).join(" ") + " " +
          typeLine(it) + " " + (it.effects || []).map((e) => e.text || "").join(" ")).toLowerCase();
        if (!words.every((w) => hay.includes(w))) continue;
      }
      list.push(it);
    }
    list.sort((a, b) => b.ilvl - a.ilvl || b.quality - a.quality || a.name.localeCompare(b.name));
    const ul = $("pickerList");
    ul.textContent = "";
    const shown = list.slice(0, 200);
    for (const it of shown) {
      const li = el("li");
      const b = el("button", "pick");
      b.type = "button";
      const ic = el("span", "iicon q-border-" + QUALITY[it.quality]);
      iconStyle(ic, it.icon, 40);
      const text = el("span", "stext");
      text.append(el("span", "sname q-" + QUALITY[it.quality], it.name),
        el("span", "ssub", `${typeLine(it) ? typeLine(it) + " · " : ""}ilvl ${it.ilvl}${it.req > 1 ? " · Req " + it.req : ""}${it.forever ? " · Forever" : ""}`),
        el("span", "ssub", statSummary(it)));
      b.append(ic, text);
      if (gear[pickSlot] === it.id) b.classList.add("current");
      b.addEventListener("click", () => equip(it.id));
      hookTip(b, it, pickSlot);
      li.append(b);
      ul.append(li);
    }
    $("pickerCount").textContent = list.length > shown.length
      ? `Showing the top ${shown.length} of ${list.length} items by item level. Type to narrow it down.`
      : `${list.length} item${list.length === 1 ? "" : "s"} you can use at level ${state.level}.`;
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
    note.append(el("strong", null, "What this sheet shows: "),
      Object.keys(state.base || {}).length
        ? "your base stats as entered below, plus everything your gear and talents add."
        : "everything your gear and talents add. Your character's base stats (from race and level) are kept on the game's " +
          "servers, not in the game files. You can type yours in under \"Your base stats\" below.");
    box.append(note);

    const section = (title, rows) => {
      const s = el("div", "sheet-sec");
      s.append(el("h3", null, title));
      const dl = el("dl");
      for (const [label, value, hint] of rows) {
        if (value == null) continue;
        const dt = el("dt", null, label);
        const dd = el("dd", null, String(value));
        if (hint) dd.title = hint;
        dl.append(dt, dd);
      }
      s.append(dl);
      box.append(s);
    };
    const n = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toString();
    const wline = (it) => it ? `${it.weapon.min}-${it.weapon.max} (${it.weapon.speed.toFixed(2)})` : null;

    section("Attributes", ["strength", "agility", "stamina", "intellect", "spirit"].map((k) => [
      STAT_TEXT[k], S.attr[k] + (tal.statPct[k] ? ` (talents +${tal.statPct[k]}%)` : ""),
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
    $("tabTalents").setAttribute("aria-selected", v === "talents");
    $("tabGear").setAttribute("aria-selected", v === "gear");
    $("tooltip").hidden = true;
    if (v === "gear") loadItems(render);
    if (push) app.changed();
  }

  function render() {
    if (view !== "gear") return;
    renderSlots();
    renderSheet();
  }

  $("tabTalents").addEventListener("click", () => setView("talents", true));
  $("tabGear").addEventListener("click", () => setView("gear", true));
  $("pickerClose").addEventListener("click", () => $("picker").close());
  $("pickerSearch").addEventListener("input", renderPicker);
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
