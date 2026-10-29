// The Guard's ranks and roster on the website.
//
// KG_RANKS: the rank ladder, highest first (the roster page is grouped by these).
// KG_PLAYERS: one entry per character.
//   id        short name used in the record link (players/record.html?id=...)
//   player    the member's handle (what the guild calls them)
//   rank      exactly one of the KG_RANKS names
//   name, race, class      the character, as the player gave it ("" / missing if not given)
//   portrait  an image in players/images, or video: a link to a short clip
//   story, appearance      the player's own words, one string per paragraph. NEVER edit or add to these.
//   page      a hand-made page in players/ instead of the generated record (Grimscar's scrolls)
//   alt       true for a second character of the same player
window.KG_RANKS = [
  {
    "name": "High Overlord",
    "group": "command",
    "pillar": "command",
    "role": "Guild Master",
    "lore": "Saurfang's exact title. It carries the ultimate authority over the Vanguard and sets the honorable, low-drama tone for the entire command."
  },
  {
    "name": "Warmaster",
    "group": "command",
    "pillar": "vanguard",
    "role": "Raid Officers",
    "lore": "The seasoned combat veterans who dictate battlefield strategy and call the shots."
  },
  {
    "name": "Blood Guard",
    "group": "command",
    "pillar": "outriders",
    "role": "PvP Officers",
    "lore": "The commanders who organize the Outriders and lead the charge against the Alliance."
  },
  {
    "name": "Quartermaster",
    "group": "command",
    "pillar": "hearth",
    "role": "Banking & Crafting Officers",
    "lore": "Every campaign lives and dies by its supply lines. The Quartermaster ensures the Kor'kron is armed, fed, and supplied before taking the field."
  },
  {
    "name": "Hearth-Caller",
    "group": "command",
    "pillar": "hearth",
    "role": "Social Officers",
    "lore": "The Hearth-Caller gathers the clan around the fire: the social glue that keeps the guild a brotherhood on off-nights when the armor comes off."
  },
  {
    "name": "Kor'kron Vanguard",
    "group": "line",
    "pillar": "vanguard",
    "role": "Core Raiders",
    "lore": "The absolute tip of the spear. Proven to hold the line, execute mechanics, and show up prepared week after week."
  },
  {
    "name": "Legionnaire",
    "group": "line",
    "pillar": "vanguard",
    "role": "Raid Team",
    "lore": "The reliable, heavy-hitting backbone of the Horde's military. A highly respected combat rank for a proven soldier."
  },
  {
    "name": "Oathbound",
    "group": "line",
    "pillar": "vanguard",
    "role": "Raid & PvP Recruits",
    "lore": "Sworn by blood oath, proving their discipline in the heat of battle before being forged into a Legionnaire or an Outrider."
  },
  {
    "name": "Hearthguard",
    "group": "line",
    "pillar": "hearth",
    "role": "Casuals & Friends",
    "lore": "The respected defenders of the guild's culture and home. An army is nothing without the people it fights for."
  },
  {
    "name": "Scout",
    "group": "line",
    "pillar": "hearth",
    "role": "New Arrivals",
    "lore": "Riding ahead, testing the perimeter, getting the lay of the land before officially joining the clan."
  }
];

window.KG_PLAYERS = [
  {
    "id": "grimscar-orc",
    "player": "Grimscar",
    "rank": "High Overlord",
    "name": "Grimscar Greystone",
    "race": "Orc",
    "class": "Warrior",
    "title": "High Overlord of the Kor'kron Guard",
    "page": "grimscar-orc.html",
    "portrait": "",
    "blurb": "A Blackrock veteran of all three wars, freed from the camps by Thrall. His axe is banded with the iron of his own shackles."
  },
  {
    "id": "grimscar-tauren",
    "player": "Grimscar",
    "rank": "High Overlord",
    "alt": true,
    "name": "Grimscar Greystone",
    "race": "Tauren",
    "class": "Hunter",
    "title": "Pathfinder of the Kor'kron Guard",
    "page": "grimscar-tauren.html",
    "portrait": "",
    "blurb": "Last son of the Greystone stone-keepers, saved from the centaur by Thrall's orcs. Walks ahead of the Guard with his lion, Dustmane."
  },
  {
    "id": "quint",
    "player": "Quint",
    "rank": "Hearth-Caller"
  },
  {
    "id": "natryl",
    "player": "Natryl",
    "rank": "Hearth-Caller",
    "name": "Natryl Graves",
    "race": "Undead",
    "class": "Priest",
    "portrait": "natryl-natryl-graves.jpeg",
    "story": [
      "In life, he was a veteran battlefield confessor of Old Lordaeron who knew that wars are won by discipline, not fanatic zeal. Breaking free of the Scourge's grasp in Deathknell with his mind sharp, he cast aside his mortal name to become Natryl Graves, seeing only arrogance in the Apothecarium’s schemes and desperation among his Forsaken brethren. He traded the church's dogma for the cold mastery of the Forgotten Shadow, enduring the searing agony of wielding the Light only when triage demanded it, and viewed his second existence as a grim duty rather than a curse. When word reached Tirisfal of High Overlord Saurfang’s decree forming the Kor'kron Guard, a hardened force valuing quiet resolve and steady veterans, he set out from Deathknell. With a worn staff and iron focus, he marched toward the zeppelin towers to earn his tabard, ready to fortify and mend the Warchief’s frontline."
    ],
    "appearance": [
      "Natryl moves with the quiet, economical precision of a soldier who has survived too many campaigns to waste energy. Withered muscle clings tightly to his frame, and his jaw is set in a permanent, stoic grimace that hides the lingering phantom pain of his resurrection. He wears dark, travel-stained robes kept meticulously mended, smelling faintly of Tirisfal grave-moss, ozone, and cauterized flesh. Resting across his shoulders is a heavy, iron-shod staff built more for breaking a charging grunt's knee than conducting a choir, awaiting the day he drapes the Kor'kron tabard over his chest."
    ]
  },
  {
    "id": "roric",
    "player": "Roric",
    "rank": "Kor'kron Vanguard",
    "class": "Rogue",
    "video": "https://static.klipy.com/ii/ce286d05b8e1a47cd4f32b0e1b6dec0e/4f/24/l6njZkXZ.mp4"
  },
  {
    "id": "mindtrip",
    "player": "Mindtrip",
    "rank": "Quartermaster",
    "name": "Anathema Hallowfall",
    "race": "Undead",
    "class": "Paladin",
    "portrait": "mindtrip-anathema-hallowfall.jpg",
    "story": [
      "Anathema Hallowfall-once Leila D’Vryce—was a zealous paladin of the Argent Dawn who fell defending Light’s Hope Chapel from the Scourge. Raised by a necromancer, her indomitable connection to the Light immediately shattered his control in a blinding flash of radiance, allowing her to escape. Though the Argent Dawn officially tolerated her undead state, the agonizing pain of her holy magic drew cruel whispers of \"heretic\" and \"anathema\" from her former peers; embracing the insult, she took it as her new name and vowed to endure the burning torment of the Light so others wouldn't have to. Wandering Azeroth to find where a holy monster could best serve, she now tracks rumors of the Kor’kron Guard seeking to pledge her scarred soul, mace and shield to their brutal frontline."
    ]
  },
  {
    "id": "killswitch",
    "player": "Killswitch",
    "rank": "Blood Guard"
  },
  {
    "id": "sullenwind",
    "player": "Sullenwind",
    "rank": "Blood Guard"
  },
  {
    "id": "nerrfed",
    "player": "Nerrfed",
    "rank": "Blood Guard"
  },
  {
    "id": "beeroism",
    "player": "Beeroism",
    "rank": "Kor'kron Vanguard"
  },
  {
    "id": "axolotl",
    "player": "Axolotl",
    "rank": "Kor'kron Vanguard"
  },
  {
    "id": "klaus",
    "player": "Klaus",
    "rank": "Kor'kron Vanguard"
  },
  {
    "id": "matadoots",
    "player": "Matadoots",
    "rank": "Kor'kron Vanguard"
  },
  {
    "id": "jack",
    "player": "Jack",
    "rank": "Kor'kron Vanguard"
  },
  {
    "id": "kimchi",
    "player": "Kimchi",
    "rank": "Kor'kron Vanguard"
  },
  {
    "id": "mortimer",
    "player": "Mortimer",
    "rank": "Kor'kron Vanguard"
  },
  {
    "id": "xsylas",
    "player": "Xsylas",
    "rank": "Hearthguard"
  },
  {
    "id": "neg",
    "player": "Neg",
    "rank": "Hearthguard"
  },
  {
    "id": "coolit",
    "player": "Coolit",
    "rank": "Hearthguard"
  },
  {
    "id": "zuljack",
    "player": "Zul'jack",
    "rank": "Hearthguard"
  },
  {
    "id": "papaed",
    "player": "PapaEd",
    "rank": "Hearthguard"
  },
  {
    "id": "randaman",
    "player": "RanDaMan",
    "rank": "Hearthguard"
  },
  {
    "id": "soeze",
    "player": "Soeze",
    "rank": "Hearthguard"
  },
  {
    "id": "ffk",
    "player": "FFK",
    "rank": "Hearthguard"
  }
];
