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
})();
