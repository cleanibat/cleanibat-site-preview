/* ==========================================================================
   Cleanibat - barre d'appel mobile (lot L1)
   Masque la barre .sticky-cta (classe is-hidden) quand le formulaire #devis
   est à l'écran, pour ne jamais cacher le bouton d'envoi. Émis par
   site/sticky_cta.py sur toutes les pages sauf merci.html.
   ========================================================================== */
(function () {
  "use strict";
  try {
    var bar = document.querySelector(".sticky-cta");
    var target = document.getElementById("devis");
    if (!bar || !target || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var on = entry.isIntersecting;
        bar.classList.toggle("is-hidden", on);
        if (on) bar.setAttribute("aria-hidden", "true");
        else bar.removeAttribute("aria-hidden");
      });
    }, { rootMargin: "0px 0px -15% 0px", threshold: 0 });
    io.observe(target);
  } catch (e) {}
})();
