// What Blizzard said about class changes, in our own words, written by hand (FOREVER_CHANGES.md, "Keeping it current").
// post: the forum post it comes from (data/blueposts.js); the note shows on that post in the Blizzard's Posts view.
// update: the game update it belongs to (data/changes.js), for what the game's files can't show: the note also shows
// above that update's list in the Abilities & Talents view. Leave it out while a change is only announced.
// cls: the class it's about, when there is one (the class filter uses it).
window.KP = window.KP || {};
KP.blueNotes = [
  // Announced for Tuesday, November 10: give these an update when the hotfix lands
  { post: 30783956, text: "Hunter pets and Voidwalkers are to tank about as well as in Classic Era; Blizzard will raise their stats as needed." },
  { post: 30783956, cls: "SHAMAN", text: "Enhancement: Strength is to become the strongest stat, so Mage and Warlock gear stops being the best. Blizzard tells leveling Enhancement Shamans to collect Strength and Attack Power from now on." },

  // Announced for November 10 and in the game since that afternoon (the second "Server hotfixes" update of November 10)
  { post: 30783956, update: "6729f4a494", cls: "WARLOCK", text: "Affliction, as Blizzard announced it: Siphon Life, Corruption and Bane of Agony are to stay worth casting next to Wrack, which beat them when channeled alone. Total damage is meant to stay the same." },

  // Blizzard's notes for the November 10 hotfixes (posted that night). The Hunter costs, Nature's Swiftness, Wrack, Soul
  // Siphon and Bane of Havoc are in the game's files (the two updates of November 10); these are the class changes the
  // files read that afternoon don't show. Give the Enhancement lines their own update once the files show them
  { post: 30849309, update: "6729f4a494", cls: "SHAMAN", text: "Enhancement: Stormstrike deals 100% weapon damage (was 150%) every 8 sec (was 6). Mental Dexterity turns 33/66/100% of your Intellect into attack power (was 50/100/150%). Blizzard: Enhancement leaned too far toward Spell Power and Intellect gear, and this moves it back toward Windfury before the raid opens." },
  { post: 30849309, update: "6729f4a494", cls: "SHAMAN", text: "Maelstrom Weapon takes 20% off cast time and mana cost per application at every rank (was 4/8/12/16/20%) and activates 6/7/8/9/10 times a minute by rank (was 20 at every rank). Its tooltip shows your chance per swing for your main-hand weapon's speed." },
  { post: 30849309, update: "6729f4a494", cls: "SHAMAN", text: "Weapon imbues and weapon totems now work at the same time: Windfury Weapon and Windfury Totem can both go off on your attacks." },
  { post: 30849309, update: "6729f4a494", cls: "WARLOCK", text: "Wrack speeds up how often Siphon Life, Corruption and Bane of Agony deal damage, not how long they last: Bane of Agony still lasts its 24 sec and ticks twice as often while you channel. The time skipped is kept when the channel ends or is interrupted." },
  { post: 30849309, update: "6729f4a494", cls: "WARLOCK", text: "The Imp, Voidwalker, Succubus and Incubus have about 15% more base health, and the Imp's Firebolt hits harder at ranks 1 to 4." },
  { post: 30849309, update: "6729f4a494", cls: "HUNTER", text: "Pets have 115% of their normal health: a bug had given them 150%. The Hawk's melee damage is about 80% higher." },
  { post: 30849309, update: "6729f4a494", cls: "WARRIOR", text: "Sweeping Strikes no longer loses charges when it hits no second target." },
  { post: 30849309, update: "6729f4a494", cls: "DRUID", text: "Omen of Clarity can activate again after you swap specializations." },
  { post: 30849309, update: "6729f4a494", cls: "PRIEST", text: "The Revelation enchant is no longer set off by Vampiric Embrace's healing, and Holy Nova is unlearned when you take the talent back." },

  // The November 9 hotfixes (the update "Server hotfixes" recorded on November 10)
  { post: 30831545, update: "b074e54934", cls: "DRUID", text: "Natural Instinct now works on Lacerate and Pounce. That's the \"Numbers changed\" on Natural Instinct in Abilities & Talents." },
  { post: 30831545, update: "b074e54934", cls: "DRUID", text: "Feral Charge in Cat Form now puts you in combat right away." },
  { post: 30831545, update: "b074e54934", cls: "MAGE", text: "Arcane Concentration's chance is now split across a cast and each of its bolts; it gave 10% on the cast and on every bolt." },
  { post: 30831545, update: "b074e54934", cls: "MAGE", text: "Flamestrike's ticks on the ground no longer use up Clearcasting." },
  { post: 30831545, update: "b074e54934", cls: "PALADIN", text: "Consecration no longer stops dealing its increased damage after enemies inside it despawned." },
  { post: 30831545, update: "b074e54934", cls: "PRIEST", text: "Casting Fear Ward no longer breaks Shadowform, and Power Infusion now stays on the ally you cast it on." },
  { post: 30831545, update: "b074e54934", cls: "SHAMAN", text: "Lightning Overload now deals the right damage for Lightning Bolt." },
  { post: 30831545, update: "b074e54934", cls: "WARLOCK", text: "Incinerate is no longer available outside Destruction." },
  { post: 30831545, update: "b074e54934", cls: "HUNTER", text: "Vulgara the Insatiable and the Shrieklings of Zephras now belong to the right pet families." },
  { post: 30831545, update: "b074e54934", text: "Tauren: Cultivation goes on cooldown only once its cast completes." },

  // Since launch (the update "Class changes since launch")
  { post: 30732723, update: "cebea63224", cls: "WARRIOR", text: "Defensive Stance's threat bonus went from 30% to 80%. Its tooltip gets that number from the server." },
  { post: 30774771, update: "cebea63224", text: "The Quick and the Dead (legacy talent) now always works; it sometimes didn't." },
  { post: 30774771, update: "cebea63224", text: "The Cooldown Manager now shows how long crowd control really lasts, counting diminishing returns and reductions like the Orc stun resistance." },
  { post: 30774771, update: "cebea63224", cls: "DRUID", text: "Bloom now heals its target." },
  { post: 30774771, update: "cebea63224", cls: "DRUID", text: "Swiftmend's tooltip no longer says it consumes the effect." },
  { post: 30774771, update: "cebea63224", cls: "DRUID", text: "Night Elf: Shadowmeld no longer lets Druids use Ravage and Pounce." },
  { post: 30774771, update: "cebea63224", cls: "MAGE", text: "Arcane Blast's effect now lasts its full 18 seconds." },
  { post: 30774771, update: "cebea63224", cls: "MAGE", text: "Mages no longer learn a Research spell that vanishes at the next login: only Study, from its quest." },
  { post: 30774771, update: "cebea63224", cls: "WARLOCK", text: "The Voidwalker has about 40 more base health at every level." },
  { post: 30774771, update: "cebea63224", cls: "WARLOCK", text: "Soul Siphon no longer makes Wrack raise its own damage." },
  { post: 30774771, update: "cebea63224", cls: "WARLOCK", text: "Orc: Command no longer raises some Warlock pet abilities too much. That's the \"Numbers changed\" on the Command racial in Abilities & Talents." },
];
