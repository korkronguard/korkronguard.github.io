// What Blizzard said about class changes, in our own words, written by hand (FOREVER_CHANGES.md, "Keeping it current").
// post: the forum post it comes from (data/blueposts.js); the note shows on that post in the Blizzard's Posts view.
// update: the game update it belongs to (data/changes.js), for what the game's files can't show: the note also shows
// above that update's list in the Abilities & Talents view. Leave it out while a change is only announced.
// cls: the class it's about, when there is one (the class filter uses it).
window.KP = window.KP || {};
KP.blueNotes = [
  // Announced for Tuesday, November 10: give these an update when the hotfix lands
  { post: 30783956, text: "Hunter pets and Voidwalkers are to tank about as well as in Classic Era; Blizzard will raise their stats as needed." },
  { post: 30783956, cls: "WARLOCK", text: "Affliction: Siphon Life, Corruption and Bane of Agony are to stay worth casting next to Wrack, which beats them when channeled alone. Total damage stays the same." },
  { post: 30783956, cls: "SHAMAN", text: "Enhancement: Strength is to become the strongest stat, so Mage and Warlock gear stops being the best. Blizzard tells leveling Enhancement Shamans to collect Strength and Attack Power from now on." },

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
