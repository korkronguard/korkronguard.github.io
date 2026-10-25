// The guild calendar. Every time here is US Eastern; the site converts it for each visitor.
//
// One-off event:   { title, date: "2026-11-06", time: "20:00", hours: 3, pillar, where, notes }
// All-day event:   { title, date: "2026-11-04", pillar, notes }            (no time)
// Weekly event:    { title, weekly: "Tue", time: "20:00", hours: 3, from: "2026-11-10", until: "", pillar, where, notes }
//
// pillar: "vanguard" (raid), "outriders" (PvP), "hearth" (social), or "server" (game-wide news)
window.KG_EVENTS = [
  {
    title: "WoW: Forever name reservation opens",
    date: "2026-10-27",
    pillar: "server",
    notes: "Claim your character names before launch.",
  },
  {
    title: "WoW: Forever servers go live",
    date: "2026-11-04",
    pillar: "server",
    notes: "The Guard musters in Durotar.",
  },
];
