// The Guard's first clears, shown on conquests.html: one entry per dungeon or raid, the first time
// the guild cleared it together. Newest first within raids and dungeons.
//   kind    "raid" or "dungeon"
//   place   the dungeon or raid
//   date    the day of the clear, "YYYY-MM-DD" (guild time, US Central)
//   image   the kill picture, in assets/conquests/
//   party   the characters there, left to right in the picture, as named in game; a name that matches a character
//           in players.js links to their record (the first match: "Grimscar Greystone" is the orc, not the tauren alt)
//   note    optional line under the picture
window.KG_CONQUESTS = [
  {
    kind: "dungeon",
    place: "Ragefire Chasm",
    date: "2026-11-05",
    image: "ragefire-chasm.jpg",
    party: ["Sliver Skylance", "Grimscar Greystone", "Maltstorm Kegbreaker", "Spikey Booger", "Rowland Tembo"]
  }
];
