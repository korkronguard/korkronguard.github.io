// The Guard's first clears, shown on conquests.html: one entry per dungeon or raid, the first time
// the guild cleared it together, plus the odd picture from the road to one (with a label). Newest first within raids
// and dungeons; entries on the same day keep the order they have here.
//   kind    "raid" or "dungeon"
//   place   the dungeon or raid (for an entry with a label: the picture's title)
//   label   optional line above the title in place of "First Clear · Dungeon", for a picture that isn't the clear
//   date    the day of the clear, "YYYY-MM-DD" (guild time, US Central)
//   image   the kill picture, in assets/conquests/
//   party   the characters there, left to right in the picture, as named in game; a name that matches a character
//           in players.js links to their record (the first match: "Grimscar Greystone" is the orc, not the tauren alt)
//   note    optional line under the picture
window.KG_CONQUESTS = [
  {
    kind: "dungeon",
    place: "The Deadmines",
    date: "2026-11-06",
    image: "deadmines.jpg",
    party: ["Maltstorm Kegbreaker", "Nerrfed Forever", "Sullen Blightfall", "Grimscar Greystone", "Spikey Booger"]
  },
  {
    kind: "dungeon",
    label: "On the Road to the Deadmines",
    place: "Infiltrating Westfall",
    date: "2026-11-06",
    image: "infiltrating-westfall.jpg",
    note: "As Horde, the Guard had to swim up into Westfall to reach the Deadmines.",
    party: ["Nerrfed Forever", "Spikey Booger", "Sullen Blightfall", "Maltstorm Kegbreaker", "Grimscar Greystone"]
  },
  {
    kind: "dungeon",
    place: "Shadowfang Keep",
    date: "2026-11-06",
    image: "shadowfang-keep.jpg",
    party: ["Grimscar Greystone", "Maltstorm Kegbreaker", "Svannis Everclear", "Sullen Blightfall", "Nerrfed Forever"]
  },
  {
    kind: "dungeon",
    place: "Ruins of Lordaeron",
    date: "2026-11-05",
    image: "ruins-of-lordaeron.jpg",
    party: ["Smoking Peacebloom", "Grimscar Greystone", "Sliver Skylance", "Anathema Hallowfall", "Sullen Blightfall"]
  },
  {
    kind: "dungeon",
    place: "Ragefire Chasm",
    date: "2026-11-05",
    image: "ragefire-chasm.jpg",
    party: ["Sliver Skylance", "Grimscar Greystone", "Maltstorm Kegbreaker", "Spikey Booger", "Rowland Tembo"]
  }
];
