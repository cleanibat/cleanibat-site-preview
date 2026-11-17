/* ==========================================================================
   Cleanibat — bandeau cookies et Consent Mode v2 (lot L6, docs/TRACKING.md)
   --------------------------------------------------------------------------
   - Le consentement par défaut (tout refusé) est posé dans le <head>, avant
     GTM (site/tracking_head.py). Ce fichier gère seulement le choix.
   - Choix mémorisé 6 mois dans localStorage 'cb_consent' = {v, ts}.
   - Au choix : gtag('consent','update'), puis dataLayer
     {event:'consent_update', consent_state}. Un refus supprime les cookies
     Google Ads / Analytics (_gcl_*, _ga*, _gid) et Meta (_fbp, _fbc) déjà posés.
   - API : window.cbConsent.get() -> 'granted' | 'denied' | null ;
           window.cbConsent.open() rouvre le bandeau.
   - Tout élément [data-consent-open] rouvre le bandeau (« Gérer les cookies »).
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "cb_consent";
  var TTL = 182 * 864e5; /* 6 mois, comme dans le <head> */
  var SIGNALS = ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"];

  window.dataLayer = window.dataLayer || [];
  var gtag =
    typeof window.gtag === "function"
      ? window.gtag
      : function () {
          window.dataLayer.push(arguments);
        };

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || "null");
      if (c && (c.v === "granted" || c.v === "denied") && c.ts && Date.now() - c.ts < TTL) {
        return c.v;
      }
    } catch (e) {}
    return null;
  }

  var state = read();
  var banner = document.getElementById("cookie-banner");
  var root = document.documentElement;

  /* Hauteur du bandeau -> --cb-banner-h (sert à remonter la barre d'appel et la barre Continuer/Retour de l'assistant de devis) */
  function measure() {
    if (!banner || banner.hidden) return;
    root.style.setProperty("--cb-banner-h", banner.offsetHeight + "px");
  }

  function show(on, focus) {
    if (!banner) return;
    banner.hidden = !on;
    if (document.body) document.body.classList.toggle("has-cookie-banner", on);
    if (on) {
      measure();
      if (focus) {
        var first = banner.querySelector("[data-consent]");
        if (first) first.focus();
      }
    } else {
      root.style.removeProperty("--cb-banner-h");
    }
  }

  function clearCookies() {
    var host = location.hostname;
    var bare = host.replace(/^www\./, "");
    var domains = ["", "; domain=" + host, "; domain=." + host, "; domain=" + bare, "; domain=." + bare];
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (!/^(_gcl_|_ga|_gid|_fbp$|_fbc$)/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + d;
      });
    });
  }

  function setConsent(v) {
    v = v === "granted" ? "granted" : "denied";
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: v, ts: Date.now() }));
    } catch (e) {}
    state = v;
    var upd = {};
    SIGNALS.forEach(function (s) {
      upd[s] = v;
    });
    gtag("consent", "update", upd);
    window.dataLayer.push({ event: "consent_update", consent_state: v });
    if (v === "denied") clearCookies();
    try {
      document.dispatchEvent(new CustomEvent("cb:consent", { detail: v }));
    } catch (e) {}
    show(false);
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-consent],[data-consent-open]") : null;
    if (!t) return;
    if (t.hasAttribute("data-consent-open")) {
      e.preventDefault();
      show(true, true);
      return;
    }
    setConsent(t.getAttribute("data-consent"));
  });

  if (window.ResizeObserver && banner) {
    new ResizeObserver(measure).observe(banner);
  } else {
    window.addEventListener("resize", measure);
  }

  window.cbConsent = {
    get: function () {
      return state;
    },
    open: function () {
      show(true, true);
    },
  };

  if (!state) show(true, false);
})();
