// The Guard's roster on the website. One entry per character with a record.
//   page:     the character's story page in the players folder ("" if none yet)
//   portrait: an image in players/images ("" shows the Guard's crest instead)
//   pillar:   "command", "vanguard", "outriders" or "hearth"
//   alt:      true for an alternate character or second telling
window.KG_PLAYERS = [
  {
    name: "Grimscar Greystone",
    race: "Orc", class: "Warrior",
    title: "High Overlord of the Kor'kron Guard",
    pillar: "command",
    page: "grimscar-orc.html",
    portrait: "",
    blurb: "A Blackrock veteran of all three wars, freed from the camps by Thrall. His axe is banded with the iron of his own shackles.",
  },
  {
    name: "Grimscar Greystone",
    race: "Tauren", class: "Hunter",
    title: "Pathfinder of the Kor'kron Guard",
    pillar: "outriders",
    alt: true,
    page: "grimscar-tauren.html",
    portrait: "",
    blurb: "Last son of the Greystone stone-keepers, saved from the centaur by Thrall's orcs. Walks ahead of the Guard with his lion, Dustmane.",
  },
];
