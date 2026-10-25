// Shared code for the dark pages: events, roster cards, embers, the skyline, fade-ins.
document.documentElement.classList.add("js");

var KG = (function () {
  var EASTERN = "America/New_York";
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
  // Minutes Eastern time is ahead of UTC at a given moment (-300 in winter, -240 in summer).
  var easternParts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric"
  });
  function easternOffset(date) {
    var p = {};
    easternParts.formatToParts(date).forEach(function (x) { p[x.type] = +x.value; });
    var asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
    return Math.round((asUtc - date.getTime()) / 60000);
  }
  // An Eastern wall-clock time as a real moment.
  function eastern(y, m, d, hh, mm) {
    var guess = new Date(Date.UTC(y, m - 1, d, hh, mm) + 300 * 60000);
    var off = easternOffset(guess);
    var t = new Date(Date.UTC(y, m - 1, d, hh, mm) - off * 60000);
    var off2 = easternOffset(t);
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
          var start = eastern(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), t[0], t[1]);
          if (start >= from && start <= to) out.push({ ev: ev, start: start, allDay: false });
        }
      } else if (ev.date) {
        var d = ymd(ev.date), s;
        if (ev.time) { var tt = hm(ev.time); s = eastern(d[0], d[1], d[2], tt[0], tt[1]); }
        else s = new Date(d[0], d[1] - 1, d[2]);
        var endOfDay = new Date(s.getTime() + (ev.time ? (ev.hours || 2) * 3600000 : 86400000 - 1));
        if (endOfDay >= from && s <= to) out.push({ ev: ev, start: s, allDay: !ev.time });
      }
    });
    return out.sort(function (a, b) { return a.start - b.start; });
  }

  var viewerZone = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "";
  function timeText(o) {
    if (o.allDay) return "All day";
    var local = o.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    if (viewerZone === EASTERN) return local;
    var east = o.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: EASTERN });
    return local + " (" + east + " Eastern)";
  }

  function eventCard(o) {
    var ev = o.ev, p = pillar(ev.pillar), d = o.start;
    return '<div class="event panel" style="--accent:' + p.color + '">' +
      '<div class="event-date"><span class="mon">' + d.toLocaleDateString([], { month: "short" }) + "</span>" +
      '<span class="day">' + d.getDate() + '</span><span class="dow">' + d.toLocaleDateString([], { weekday: "short" }) + "</span></div>" +
      "<div><h3>" + esc(ev.title) + "</h3>" +
      '<div class="meta"><b>' + p.label + "</b>" + timeText(o) + (ev.where ? " · " + esc(ev.where) : "") + "</div>" +
      (ev.notes ? '<div class="notes">' + esc(ev.notes) + "</div>" : "") +
      "</div></div>";
  }

  function upcoming(n) {
    var now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var to = new Date(start.getTime() + 120 * 86400000);
    return occurrences(window.KG_EVENTS, start, to).filter(function (o) {
      var end = o.allDay ? new Date(o.start.getTime() + 86400000) : new Date(o.start.getTime() + (o.ev.hours || 2) * 3600000);
      return end > now;
    }).slice(0, n);
  }

  function renderUpcoming(el, n) {
    if (!el) return;
    var list = upcoming(n);
    el.innerHTML = list.length ? list.map(eventCard).join("") :
      '<p class="empty panel">No musters posted yet. Raid nights, battleground pushes and Hearth nights will appear here.</p>';
  }

  // ---------- roster ----------
  function memberCard(m, root) {
    var p = pillar(m.pillar);
    var color = CLASS_COLORS[m.class] || "#e9dcc6";
    var portrait = m.portrait
      ? '<img src="' + root + "players/images/" + esc(m.portrait) + '" alt="' + esc(m.name) + '" loading="lazy">'
      : '<div class="placeholder"><img src="' + root + 'assets/crest.svg" alt=""><span>Portrait to come</span></div>';
    var tag = '<span class="tag" style="--accent:' + p.color + '">' + p.label.split(" · ")[0] + (m.alt ? " · Alt" : "") + "</span>";
    var inner =
      '<div class="portrait">' + portrait + tag + "</div>" +
      '<div class="member-body"><h3>' + esc(m.name) + "</h3>" +
      '<p class="class" style="color:' + color + '">' + esc(m.race) + " " + esc(m.class) + "</p>" +
      '<p class="title">' + esc(m.title) + "</p>" +
      '<p class="blurb">' + esc(m.blurb) + "</p>" +
      (m.page ? '<span class="read">Read the record &rarr;</span>' : "") + "</div>";
    return m.page
      ? '<a class="member panel" data-pillar="' + esc(m.pillar) + '" href="' + root + "players/" + esc(m.page) + '">' + inner + "</a>"
      : '<div class="member panel" data-pillar="' + esc(m.pillar) + '">' + inner + "</div>";
  }
  function renderMembers(el, root, limit) {
    if (!el) return;
    var list = (window.KG_PLAYERS || []).slice(0, limit || 999);
    el.innerHTML = list.map(function (m) { return memberCard(m, root); }).join("");
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
    renderUpcoming: renderUpcoming, renderMembers: renderMembers, embers: embers, skyline: skyline, reveal: reveal,
    viewerZone: viewerZone
  };
})();
