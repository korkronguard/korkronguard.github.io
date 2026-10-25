// Shared code for the dark pages: events, roster cards, embers, the skyline, fade-ins.
document.documentElement.classList.add("js");

var KG = (function () {
  // The guild schedules everything in US Central; visitors see times converted to their own zone.
  var GUILD_ZONE = "America/Chicago", GUILD_ZONE_NAME = "Central";
  var PILLARS = {
    command:   { label: "Command",          color: "var(--gold)" },
    vanguard:  { label: "Vanguard · Raid",  color: "var(--vanguard)" },
    outriders: { label: "Outriders · PvP",  color: "var(--outriders)" },
    hearth:    { label: "Hearth",           color: "var(--hearth)" },
    server:    { label: "Server News",      color: "var(--server)" }
  };
  // Classic-era class colors.
  var CLASS_COLORS = {
    Druid: "#FF7D0A", Hunter: "#ABD473", Mage: "#69CCF0", Paladin: "#F58CBA", Priest: "#FFFFFF",
    Rogue: "#FFF569", Shaman: "#0070DE", Warlock: "#9482C9", Warrior: "#C79C6E"
  };
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pillar(key) { return PILLARS[key] || PILLARS.server; }

  // ---------- time ----------
  // Minutes guild time is ahead of UTC at a given moment (Central: -360 in winter, -300 in summer).
  var guildParts = new Intl.DateTimeFormat("en-US", {
    timeZone: GUILD_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"
  });
  function guildOffset(date) {
    var p = {};
    guildParts.formatToParts(date).forEach(function (x) { p[x.type] = +x.value; });
    var asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
    return Math.round((asUtc - date.getTime()) / 60000);
  }
  // A guild-time (Central) wall-clock time as a real moment.
  function guildTime(y, m, d, hh, mm) {
    var guess = new Date(Date.UTC(y, m - 1, d, hh, mm) + 360 * 60000);
    var off = guildOffset(guess);
    var t = new Date(Date.UTC(y, m - 1, d, hh, mm) - off * 60000);
    var off2 = guildOffset(t);
    return off2 === off ? t : new Date(Date.UTC(y, m - 1, d, hh, mm) - off2 * 60000);
  }
  function ymd(s) { var p = s.split("-"); return [+p[0], +p[1], +p[2]]; }
  function hm(s) { var p = (s || "0:0").split(":"); return [+p[0], +p[1]]; }

  // Every occurrence of every event between two moments.
  function occurrences(events, from, to) {
    var out = [];
    (events || []).forEach(function (ev) {
      if (ev.weekly) {
        var dow = DAYS.indexOf(ev.weekly.slice(0, 3));
        var first = ev.from ? ymd(ev.from) : null;
        var last = ev.until ? ymd(ev.until) : null;
        var cur = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()) - 86400000;
        var end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) + 86400000;
        if (first) cur = Math.max(cur, Date.UTC(first[0], first[1] - 1, first[2]));
        if (last) end = Math.min(end, Date.UTC(last[0], last[1] - 1, last[2]));
        for (; cur <= end; cur += 86400000) {
          var day = new Date(cur);
          if (day.getUTCDay() !== dow) continue;
          var t = hm(ev.time);
          var start = guildTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), t[0], t[1]);
          if (start >= from && start <= to) out.push({ ev: ev, start: start, allDay: false });
        }
      } else if (ev.date && ev.endDate && !ev.time) {
        // Multi-day, all-day event (e.g. the Darkmoon Faire): one occurrence per day, so it shows on each calendar day.
        var a = ymd(ev.date), b = ymd(ev.endDate);
        var last = new Date(b[0], b[1] - 1, b[2]);
        for (var day = new Date(a[0], a[1] - 1, a[2]); day <= last; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
          if (new Date(day.getTime() + 86400000 - 1) >= from && day <= to) out.push({ ev: ev, start: day, allDay: true, span: true });
        }
      } else if (ev.date) {
        var d = ymd(ev.date), s;
        if (ev.time) { var tt = hm(ev.time); s = guildTime(d[0], d[1], d[2], tt[0], tt[1]); }
        else s = new Date(d[0], d[1] - 1, d[2]);
        var endOfDay = new Date(s.getTime() + (ev.time ? (ev.hours || 2) * 3600000 : 86400000 - 1));
        if (endOfDay >= from && s <= to) out.push({ ev: ev, start: s, allDay: !ev.time });
      }
    });
    return out.sort(function (a, b) { return a.start - b.start; });
  }

  var viewerZone = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "";
  // A friendly name for the visitor's zone, like "Central Time" or "Pacific Time".
  function zoneLabel() {
    try {
      var part = new Intl.DateTimeFormat("en-US", { timeZoneName: "longGeneric" }).formatToParts(new Date())
        .filter(function (x) { return x.type === "timeZoneName"; })[0];
      if (part && !/^GMT/.test(part.value)) return part.value;
    } catch (e) {}
    return viewerZone ? viewerZone.split("/").pop().replace(/_/g, " ") + " time" : "your local time";
  }
  function shortDate(s) { var d = ymd(s); return new Date(d[0], d[1] - 1, d[2]).toLocaleDateString([], { month: "short", day: "numeric" }); }
  function timeText(o) {
    if (o.span) return shortDate(o.ev.date) + " – " + shortDate(o.ev.endDate);
    if (o.allDay) return "All day";
    var local = o.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    if (viewerZone === GUILD_ZONE) return local;
    var guild = o.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: GUILD_ZONE });
    return local + " (" + guild + " " + GUILD_ZONE_NAME + ")";
  }

  function eventCard(o) {
    var ev = o.ev, p = pillar(ev.pillar), d = o.start;
    return '<div class="event panel" style="--accent:' + p.color + '">' +
      '<div class="event-date"><span class="mon">' + d.toLocaleDateString([], { month: "short" }) + "</span>" +
      '<span class="day">' + d.getDate() + '</span><span class="dow">' + d.toLocaleDateString([], { weekday: "short" }) + "</span></div>" +
      "<div><h3>" + esc(ev.title) + "</h3>" +
      '<div class="meta"><b>' + p.label + "</b>" + timeText(o) + (ev.where ? " · " + esc(ev.where) : "") +
      (ev.source === "game" ? ' <span class="from-game">· In-game calendar</span>' : "") + "</div>" +
      (ev.notes ? '<div class="notes">' + esc(ev.notes) + "</div>" : "") +
      (ev.link ? '<a class="event-link" href="' + esc(ev.link) + '" target="_blank" rel="noopener">Read more &rarr;</a>' : "") +
      "</div></div>";
  }

  function upcoming(n) {
    var now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var to = new Date(start.getTime() + 120 * 86400000);
    var seen = [];
    return occurrences(window.KG_EVENTS, start, to).filter(function (o) {
      var end = o.allDay ? new Date(o.start.getTime() + 86400000) : new Date(o.start.getTime() + (o.ev.hours || 2) * 3600000);
      if (end <= now) return false;
      if (o.span) { if (seen.indexOf(o.ev) >= 0) return false; seen.push(o.ev); }   // a multi-day event appears once in the list
      return true;
    }).slice(0, n);
  }

  function renderUpcoming(el, n) {
    if (!el) return;
    var list = upcoming(n);
    el.innerHTML = list.length ? list.map(eventCard).join("") :
      '<p class="empty panel">No musters posted yet. Raid nights, battleground pushes and Hearth nights will appear here.</p>';
  }

  // ---------- roster ----------
  function rankOf(m) {
    return (window.KG_RANKS || []).filter(function (r) { return r.name === m.rank; })[0] || { name: m.rank || "", pillar: "hearth" };
  }
  // A member "has a record" once they've sent a story (or have a hand-made page).
  function hasRecord(m) { return !!(m.page || (m.story && m.story.length)); }
  function recordHref(m, root) {
    return root + "players/" + (m.page ? esc(m.page) : "record.html?id=" + encodeURIComponent(m.id));
  }
  function raceClass(m) { return [m.race, m.class].filter(Boolean).join(" "); }
  // "Played by X" only when the character's name doesn't already start with the player's handle.
  function playedBy(m) { return !!(m.name && m.player && m.name.toLowerCase().indexOf(m.player.toLowerCase()) !== 0); }
  function classColor(m) { return CLASS_COLORS[m.class] || "#e9dcc6"; }
  // The opening sentence of the player's own story, for the card.
  function firstSentence(m) {
    if (m.blurb) return m.blurb;
    var t = (m.story && m.story[0]) || "";
    var match = t.match(/^.*?[.!?](\s|$)/);
    return (match ? match[0] : t).trim();
  }
  function portraitHtml(m, root, cls) {
    if (m.portrait) return '<img class="' + (cls || "") + '" src="' + root + "players/images/" + esc(m.portrait) + '" alt="' + esc(m.name || m.player) + '" loading="lazy">';
    if (m.video) return '<video class="' + (cls || "") + '" src="' + esc(m.video) + '" autoplay loop muted playsinline aria-label="' + esc(m.player) + '"' +
      " onerror=\"this.outerHTML=''\"></video>";
    return "";
  }

  function memberCard(m, root) {
    var p = pillar(rankOf(m).pillar);
    var pic = portraitHtml(m, root) || '<div class="placeholder"><img src="' + root + 'assets/crest.svg" alt=""><span>Portrait to come</span></div>';
    var tag = '<span class="tag" style="--accent:' + p.color + '">' + esc(m.rank) + (m.alt ? " · Alt" : "") + "</span>";
    var rc = raceClass(m);
    return '<a class="member panel" href="' + recordHref(m, root) + '">' +
      '<div class="portrait">' + pic + tag + "</div>" +
      '<div class="member-body"><h3>' + esc(m.name || m.player) + "</h3>" +
      (rc ? '<p class="class" style="color:' + classColor(m) + '">' + esc(rc) + "</p>" : "") +
      (playedBy(m) ? '<p class="title">Played by ' + esc(m.player) + "</p>" : "") +
      '<p class="blurb">' + esc(firstSentence(m)) + "</p>" +
      '<span class="read">Read the record &rarr;</span></div></a>';
  }
  function nameplate(m, root) {
    var p = pillar(rankOf(m).pillar), rc = raceClass(m);
    var pic = portraitHtml(m, root, "plate-pic") || '<img class="plate-crest" src="' + root + 'assets/crest.svg" alt="">';
    return '<a class="nameplate" style="--accent:' + p.color + '" href="' + recordHref(m, root) + '">' + pic +
      '<span><b>' + esc(m.name || m.player) + "</b>" +
      (rc ? '<em style="color:' + classColor(m) + '">' + esc(rc) + "</em>" : "<em>Record awaiting</em>") + "</span></a>";
  }

  // Home page: a few members who have sent their story.
  function renderMembers(el, root, limit) {
    if (!el) return;
    var list = (window.KG_PLAYERS || []).filter(hasRecord).slice(0, limit || 999);
    el.innerHTML = list.map(function (m) { return memberCard(m, root); }).join("");
  }

  // The Guard page: every rank, highest first, with its members.
  function renderRoster(el, root) {
    if (!el) return;
    var players = window.KG_PLAYERS || [];
    var html = "";
    (window.KG_RANKS || []).forEach(function (r, i) {
      var members = players.filter(function (m) { return m.rank === r.name; });
      var p = pillar(r.pillar);
      if (i === 0 || r.group !== window.KG_RANKS[i - 1].group) {
        html += '<h2 class="rank-group">' + (r.group === "command" ? "Ranks of Command" : "Ranks of the Line") + "</h2>";
      }
      html += '<section class="rank-section' + (members.length ? "" : " empty") + '" style="--accent:' + p.color + '">' +
        '<div class="rank-head"><h3>' + esc(r.name) + '</h3><span class="rank-role">' + esc(r.role) + "</span>" +
        (members.length ? '<span class="rank-count">' + members.length + "</span>" : "") + "</div>";
      if (!members.length) {
        html += '<p class="rank-lore">' + esc(r.lore) + ' <span class="rank-open">' + (r.group === "command" ? "Seat open." : "None yet.") + "</span></p></section>";
        return;
      }
      html += '<p class="rank-lore">' + esc(r.lore) + "</p>";
      var full = members.filter(hasRecord), plates = members.filter(function (m) { return !hasRecord(m); });
      if (full.length) html += '<div class="member-grid">' + full.map(function (m) { return memberCard(m, root); }).join("") + "</div>";
      if (plates.length) html += '<div class="plates">' + plates.map(function (m) { return nameplate(m, root); }).join("") + "</div>";
      html += "</section>";
    });
    el.innerHTML = html;
  }

  // ---------- atmosphere ----------
  function embers(el, count) {
    if (!el) return;
    var html = "";
    for (var i = 0; i < count; i++) {
      var size = (Math.random() * 2.5 + 1.5).toFixed(1);
      html += '<i style="left:' + (Math.random() * 100).toFixed(1) + "%;width:" + size + "px;height:" + size + "px;" +
        "animation-duration:" + (Math.random() * 9 + 8).toFixed(1) + "s;animation-delay:-" + (Math.random() * 16).toFixed(1) + "s;" +
        "--drift:" + (Math.random() * 160 - 80).toFixed(0) + 'px"></i>';
    }
    el.innerHTML = html;
  }

  // Orgrimmar on the horizon: a spiked wall, the gate towers with their tusks, and the great hall.
  function skyline(g) {
    if (!g) return;
    var s = "";
    var tusk = function (x, y, dir) {
      return '<path d="M' + x + " " + y + " C " + (x - 16 * dir) + " " + (y - 8) + ", " + (x - 22 * dir) + " " + (y - 30) + ", " +
        (x - 10 * dir) + " " + (y - 50) + " C " + (x - 12 * dir) + " " + (y - 30) + ", " + (x - 5 * dir) + " " + (y - 16) + ", " +
        (x + 7 * dir) + " " + (y - 8) + ' Z"/>';
    };
    var banner = function (x, y) {
      return '<line x1="' + x + '" y1="' + (y - 34) + '" x2="' + x + '" y2="' + (y + 4) + '" stroke="#0d0907" stroke-width="3"/>' +
        '<path d="M' + (x + 1) + " " + (y - 32) + " h16 v28 l-8 -6 l-8 6 Z\" fill=\"#8e1c12\"/>";
    };
    // wall with spikes
    s += '<rect x="420" y="258" width="600" height="50"/>';
    for (var x = 428; x < 1012; x += 26) s += '<path d="M' + x + " 260 L" + (x + 7) + " 236 L" + (x + 14) + ' 260 Z"/>';
    // great hall
    s += '<path d="M650 300 L650 222 Q720 150 790 222 L790 300 Z"/>';
    s += '<path d="M714 166 L720 128 L726 166 Z"/>';
    s += tusk(668, 214, 1) + tusk(772, 214, -1);
    // gate towers
    [560, 860].forEach(function (tx) {
      s += '<path d="M' + (tx - 24) + " 300 L" + (tx - 20) + " 196 L" + (tx + 20) + " 196 L" + (tx + 24) + ' 300 Z"/>';
      s += '<path d="M' + (tx - 28) + " 198 L" + tx + " 170 L" + (tx + 28) + ' 198 Z"/>';
      s += tusk(tx - 20, 192, 1) + tusk(tx + 20, 192, -1);
      s += banner(tx - 4, 168);
    });
    // huts outside the walls
    [[180, 46], [270, 36], [340, 54], [1080, 50], [1160, 38], [1250, 58]].forEach(function (h) {
      var hx = h[0], w = h[1];
      s += '<path d="M' + hx + " 304 Q" + (hx + w / 2) + " " + (304 - w) + " " + (hx + w) + ' 304 Z"/>';
      s += '<path d="M' + (hx + w / 2 - 3) + " " + (306 - w) + " L" + (hx + w / 2) + " " + (284 - w) + " L" + (hx + w / 2 + 3) + " " + (306 - w) + ' Z"/>';
    });
    // ground
    s += '<path d="M0 360 L0 300 Q360 286 720 298 T1440 296 L1440 360 Z"/>';
    g.innerHTML = s;
  }

  function reveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { items.forEach(function (i) { i.classList.add("seen"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } });
    }, { threshold: .1 });
    items.forEach(function (i) { io.observe(i); });
  }

  return {
    PILLARS: PILLARS, esc: esc, pillar: pillar, occurrences: occurrences, timeText: timeText, eventCard: eventCard,
    renderUpcoming: renderUpcoming, renderMembers: renderMembers, renderRoster: renderRoster, embers: embers, skyline: skyline, reveal: reveal,
    rankOf: rankOf, hasRecord: hasRecord, raceClass: raceClass, classColor: classColor, portraitHtml: portraitHtml, playedBy: playedBy,
    viewerZone: viewerZone, zoneLabel: zoneLabel, GUILD_ZONE: GUILD_ZONE, GUILD_ZONE_NAME: GUILD_ZONE_NAME
  };
})();
