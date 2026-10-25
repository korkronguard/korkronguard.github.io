// Parchment effects for the scroll pages: ragged edges, and each part fading in as it comes into view.
// Load with data-seed="<number>" so each scroll tears a little differently.
(function () {
  var seedStart = parseInt(document.currentScript.getAttribute("data-seed"), 10) || 27;
  document.documentElement.classList.add("js");

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    // Ragged, worn left and right edges on the parchment.
    var el = document.getElementById("parchment");
    if (el) {
      var seed;
      var rand = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      var tear = function () {
        seed = seedStart;
        var h = el.offsetHeight, step = 16, left = [], right = [];
        for (var y = 0; y <= h; y += step) {
          left.push((rand() * 7).toFixed(1) + "px " + y + "px");
          right.push("calc(100% - " + (rand() * 7).toFixed(1) + "px) " + y + "px");
        }
        left.push("0px " + h + "px");
        right.push("100% " + h + "px");
        el.style.clipPath = "polygon(" + left.concat(right.reverse()).join(",") + ")";
      };
      tear();
      if (window.ResizeObserver) new ResizeObserver(tear).observe(el);
      else window.addEventListener("resize", tear);
    }

    // Fade each part of the scroll in as it comes into view.
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { items.forEach(function (i) { i.classList.add("seen"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } });
    }, { threshold: .12 });
    items.forEach(function (i) { io.observe(i); });
  });
})();
