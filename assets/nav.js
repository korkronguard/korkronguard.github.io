// Draws the site header and footer on every page, so the menu lives in one place.
// Each page loads this with data-root (path back to the site root) and data-page (which link to highlight).
(function () {
  var me = document.currentScript;
  var root = me.getAttribute("data-root") || "";
  var page = me.getAttribute("data-page") || "";

  var links = [
    ["home", "index.html", "Home"],
    ["lore", "lore.html", "The Lore"],
    ["guard", "players/index.html", "The Guard"],
    ["calendar", "calendar.html", "Calendar"],
    ["tools", "index.html#tools", "Guild Tools"],
    ["planner", "planner/index.html", "Planner"],
    ["join", "index.html#join", "Join"]
  ];

  var items = links.map(function (l) {
    var current = l[0] === page ? ' aria-current="page"' : "";
    return '<li><a href="' + root + l[1] + '"' + current + ">" + l[2] + "</a></li>";
  }).join("");

  var header = document.createElement("header");
  header.className = "kg-header";
  header.innerHTML =
    '<div class="kg-header-inner">' +
      '<a class="kg-brand" href="' + root + 'index.html"><img src="' + root + 'assets/crest.svg" alt=""><span>Kor\'kron Guard</span></a>' +
      '<button class="kg-menu" type="button" aria-expanded="false" aria-controls="kg-links">Menu</button>' +
      '<ul class="kg-links" id="kg-links">' + items + "</ul>" +
    "</div>";
  document.body.insertBefore(header, document.body.firstChild);

  var btn = header.querySelector(".kg-menu"), list = header.querySelector(".kg-links");
  btn.addEventListener("click", function () {
    var open = list.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  var footer = document.createElement("footer");
  footer.className = "kg-footer";
  footer.innerHTML =
    '<p class="cry">Lok\'tar ogar!</p>' +
    "<nav>" + links.map(function (l) { return '<a href="' + root + l[1] + '">' + l[2] + "</a>"; }).join("") + "</nav>" +
    '<p class="fine">The Kor\'kron Guard is a Horde guild of WoW: Forever. This is a fan site, not affiliated with Blizzard Entertainment. World of Warcraft and Warcraft are trademarks of Blizzard Entertainment, Inc.</p>';
  document.body.appendChild(footer);

  // Background music: "Gathering Force", quiet and looping, with an on/off button in the corner.
  // Browsers won't play sound until the visitor clicks or presses a key, so it starts on the first one.
  // Every visit starts with music on; turning it off lasts for the rest of that visit (sessionStorage).
  // The song picks up where it left off on the next page.
  var VOLUME = 0.15;
  var store = function (kind, key, value) {
    try {
      var s = window[kind];
      if (value === undefined) return s.getItem(key);
      s.setItem(key, value);
    } catch (e) { return null; }
  };
  var music = new Audio(root + "assets/audio/gathering-force.mp3");
  music.loop = true;
  music.volume = VOLUME;
  music.preload = "auto";
  try { localStorage.removeItem("kg-music"); } catch (e) {} // clear the old remember-forever setting
  var wantOn = store("sessionStorage", "kg-music") !== "off";
  var resumeAt = parseFloat(store("sessionStorage", "kg-music-time")) || 0;
  if (resumeAt) music.addEventListener("loadedmetadata", function () { music.currentTime = resumeAt; }, { once: true });

  var soundBtn = document.createElement("button");
  soundBtn.type = "button";
  soundBtn.className = "kg-sound";
  document.body.appendChild(soundBtn);
  var paint = function () {
    var on = wantOn && !music.paused;
    soundBtn.classList.toggle("on", on);
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.setAttribute("aria-label", on ? "Turn music off" : "Turn music on");
    soundBtn.title = on ? "Music on (click to silence)" : "Music off (click to play)";
    soundBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>' +
      (on ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
          : '<path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') + "</svg>";
  };
  music.addEventListener("play", paint);
  music.addEventListener("pause", paint);
  var start = function () { var p = music.play(); if (p && p.catch) p.catch(function () {}); };

  var firstTouch = function (e) {
    if (e.target.closest && e.target.closest(".kg-sound")) return;
    document.removeEventListener("pointerdown", firstTouch);
    document.removeEventListener("keydown", firstTouch);
    if (wantOn && music.paused) start();
  };
  if (wantOn) {
    start(); // works if the browser allows it; otherwise wait for the first click or key
    document.addEventListener("pointerdown", firstTouch);
    document.addEventListener("keydown", firstTouch);
  }
  soundBtn.addEventListener("click", function () {
    wantOn = !(wantOn && !music.paused);
    store("sessionStorage", "kg-music", wantOn ? "on" : "off");
    if (wantOn) start(); else music.pause();
    paint();
  });
  window.addEventListener("pagehide", function () {
    store("sessionStorage", "kg-music-time", String(music.currentTime || 0));
  });
  paint();
})();
