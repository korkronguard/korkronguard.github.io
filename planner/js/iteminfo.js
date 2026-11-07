// Kor'kron Planner: how items read (qualities, slots, weapon and armor types, stat names, effects) and which weapons and
// armor each class can use. Shared by the Gear tab (gear.js) and the What's New page (whatsnew.js).
(function () {
  "use strict";

  // Weapon types (item subclass) each class can learn: the client's own skill table (SkillRaceClassInfo, checked on
  // build 1.60.1.70707). Forever adds one-handed axes for Rogues. The client also lists Shaman Dual Wield and Druid
  // polearms, but Classic Era has the same Season of Discovery rows and never allowed them, so they're left out.
  const AXE1 = 0, AXE2 = 1, BOW = 2, GUN = 3, MACE1 = 4, MACE2 = 5, POLE = 6, SWORD1 = 7, SWORD2 = 8,
    STAFF = 10, FIST = 13, MISC = 14, DAGGER = 15, THROWN = 16, XBOW = 18, WAND = 19;

  window.KP = window.KP || {};
  window.KP.itemInfo = {
    WEAPONS: {
      WARRIOR: [AXE1, AXE2, BOW, GUN, MACE1, MACE2, POLE, SWORD1, SWORD2, STAFF, FIST, DAGGER, THROWN, XBOW, MISC],
      PALADIN: [AXE1, AXE2, MACE1, MACE2, POLE, SWORD1, SWORD2, MISC],
      HUNTER: [AXE1, AXE2, BOW, GUN, POLE, SWORD1, SWORD2, STAFF, FIST, DAGGER, THROWN, XBOW, MISC],
      ROGUE: [AXE1, BOW, GUN, MACE1, SWORD1, FIST, DAGGER, THROWN, XBOW, MISC],
      PRIEST: [MACE1, STAFF, DAGGER, WAND, MISC],
      SHAMAN: [AXE1, AXE2, MACE1, MACE2, STAFF, FIST, DAGGER, MISC],
      MAGE: [SWORD1, STAFF, DAGGER, WAND, MISC],
      WARLOCK: [SWORD1, STAFF, DAGGER, WAND, MISC],
      DRUID: [MACE1, MACE2, STAFF, FIST, DAGGER, MISC],
    },
    // Dual wield (one-handers in the off hand) and the level it's learned (client skill table; same as Classic).
    DUAL_WIELD: { WARRIOR: 20, ROGUE: 10, HUNTER: 20 },
    // Warriors and Paladins learn Plate at 40; Hunters and Shamans learn Mail at 40 (client skill table; same as Classic).
    ARMOR_AT_40: { WARRIOR: 4, PALADIN: 4, HUNTER: 3, SHAMAN: 3 },
    // weapon skills learned later (client skill table): Warriors, Paladins and Hunters learn Polearms at 20
    WEAPON_LEVEL: { WARRIOR: { [POLE]: 20 }, PALADIN: { [POLE]: 20 }, HUNTER: { [POLE]: 20 } },

    WEAPON_NAMES: {
      0: "Axe", 1: "Axe", 2: "Bow", 3: "Gun", 4: "Mace", 5: "Mace", 6: "Polearm", 7: "Sword", 8: "Sword",
      10: "Staff", 13: "Fist Weapon", 14: "Miscellaneous", 15: "Dagger", 16: "Thrown", 18: "Crossbow", 19: "Wand",
    },
    ARMOR_NAMES: { 1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate", 6: "Shield", 7: "Libram", 8: "Idol", 9: "Totem" },
    INV_NAMES: {
      1: "Head", 2: "Neck", 3: "Shoulder", 4: "Shirt", 5: "Chest", 6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrist",
      10: "Hands", 11: "Finger", 12: "Trinket", 13: "One-Hand", 14: "Off Hand", 15: "Ranged", 16: "Back", 17: "Two-Hand",
      18: "Bag", 19: "Tabard", 20: "Chest", 21: "Main Hand", 22: "Off Hand", 23: "Held In Off-hand", 24: "Projectile",
      25: "Thrown", 26: "Ranged", 28: "Relic",
    },
    QUALITY: ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"],

    // How each stat reads on a tooltip, and on the sheet.
    STAT_TEXT: {
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
      attackPowerVsHumanoids: "Attack Power against Humanoids", attackPowerVsElementals: "Attack Power against Elementals",
      attackPowerVsMechanicals: "Attack Power against Mechanicals", spellDamageVsElementals: "Spell Damage against Elementals",
      spellDamageVsDemons: "Spell Damage against Demons", spellDamageVsBeasts: "Spell Damage against Beasts",
      attackPowerVsDragonkin: "Attack Power against Dragonkin", spellDamageVsHumanoids: "Spell Damage against Humanoids",
      physicalDamage: "Physical Damage", resistAll: "All Resistances", cooking: "Cooking",
    },
    // ItemEffect.TriggerType: 5 (on pick-up) and 6 (teaches a spell: mounts, pets) read "Use:" in the game too
    TRIGGER: { 0: "Use", 1: "Equip", 2: "Chance on hit", 5: "Use", 6: "Use" },
    SCHOOLS: ["Physical", "Holy", "Fire", "Nature", "Frost", "Shadow", "Arcane"],
    // where an item comes from: the game's own tag (data script, ItemModifiedAppearance); not every item has one
    SOURCE_NAMES: { drop: "Drop", quest: "Quest", vendor: "Vendor", crafted: "Crafted" },
    // Wowhead's Forever database: its item pages list who drops, sells or makes an item (we only link to it)
    wowheadUrl: (it) => `https://www.wowhead.com/forever/item=${it.id}`,
  };
})();
