/* ==========================================================================
   Cleanibat — attribution & tracking (lot L6, docs/TRACKING.md)
   --------------------------------------------------------------------------
   - Capture les UTM / gclid / fbclid / msclkid dès l'arrivée sur le site
   - Conserve un "first touch" (1er contact) et un "last touch" (dernier
     contact) pour survivre à la navigation multi-pages :
       * cookies acceptés (cbConsent) : localStorage, 90 jours ;
       * sinon (aucun choix ou refus) : RIEN n'est écrit dans le navigateur ;
         l'origine reste en mémoire pour la page en cours
         (window.cleanibatAttribution) et les UTM passent dans les liens
         vers le devis.
   - Identifiants publicitaires (gclid, fbclid, msclkid, gbraid, wbraid) :
     joints au formulaire et aux liens seulement si les cookies sont acceptés.
   - Réinjecte ces valeurs dans les champs cachés de tous les formulaires
     marqués .js-track-form, pour qu'elles remontent jusqu'au CRM / à la
     boîte mail avec chaque demande de devis (cta_source et page_url sont
     remis à jour au clic sur un CTA et au moment de l'envoi)
   - Pousse des événements dans window.dataLayer pour Google Tag Manager :
     cta_click, phone_click, email_click.
   - La conversion « Demande de devis » n'est PLUS poussée ici (elle partait
     à chaque clic sur Envoyer, même invalide) : elle part de merci.html
     (assets/js/lead.js), seulement après un envoi réussi.
   ========================================================================== */
(function () {
  "use strict";

  var STORAGE_KEY_FIRST = "cleanibat_attribution_first";
  var STORAGE_KEY_LAST = "cleanibat_attribution_last";
  var CTA_KEY = "cleanibat_last_cta";
  var MAX_AGE_DAYS = 90;

  window.dataLayer = window.dataLayer || [];

  /* Consentement lu directement (consent.js est chargé en defer, après ce fichier) */
  function consentGranted() {
    try {
      var c = JSON.parse(localStorage.getItem("cb_consent") || "null");
      return !!(c && c.v === "granted" && c.ts && Date.now() - c.ts < 182 * 864e5);
    } catch (e) {
      return false;
    }
  }

  function store(persistent) {
    try {
      return persistent ? window.localStorage : window.sessionStorage;
    } catch (e) {
      return null;
    }
  }

  function trackedParams(search) {
    var out = {};
    var params;
    try {
      params = new URLSearchParams(search);
    } catch (e) {
      return out;
    }
    var keys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "msclkid",
      "gbraid",
      "wbraid",
    ];
    keys.forEach(function (k) {
      var v = params.get(k);
      if (v) out[k] = v.slice(0, 300);
    });
    return out;
  }

  function readStorage(key, persistent) {
    try {
      var s = store(persistent);
      var raw = s && s.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      var ageDays = (Date.now() - data.timestamp) / 86400000;
      if (!(ageDays <= MAX_AGE_DAYS)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeStorage(key, data, persistent) {
    try {
      var s = store(persistent);
      if (s) s.setItem(key, JSON.stringify(data));
    } catch (e) {
      /* stockage indisponible (navigation privée...) : on ignore */
    }
  }

  function removeStorage(key, persistent) {
    try {
      var s = store(persistent);
      if (s) s.removeItem(key);
    } catch (e) {}
  }

  function buildAttribution(params) {
    return {
      utm_source: params.utm_source || "",
      utm_medium: params.utm_medium || "",
      utm_campaign: params.utm_campaign || "",
      utm_term: params.utm_term || "",
      utm_content: params.utm_content || "",
      gclid: params.gclid || "",
      fbclid: params.fbclid || "",
      msclkid: params.msclkid || "",
      landing_page: window.location.pathname,
      referrer: document.referrer || "direct",
      timestamp: Date.now(),
    };
  }

  var persistent = consentGranted();
  var currentParams = trackedParams(window.location.search);
  var hasNewParams = Object.keys(currentParams).length > 0;
  var AD_IDS = ["gclid", "fbclid", "msclkid", "gbraid", "wbraid"];

  // Anciennes versions : l'origine était écrite en sessionStorage sans accord. On l'efface.
  removeStorage(STORAGE_KEY_FIRST, false);
  removeStorage(STORAGE_KEY_LAST, false);
  if (!persistent) {
    removeStorage(STORAGE_KEY_FIRST, true);
    removeStorage(STORAGE_KEY_LAST, true);
  }

  var firstTouch = persistent ? readStorage(STORAGE_KEY_FIRST, true) : null;
  if (!firstTouch) {
    firstTouch = buildAttribution(hasNewParams ? currentParams : {});
    if (!hasNewParams) {
      firstTouch.utm_source = "direct";
      firstTouch.utm_medium = "none";
    }
  }
  var lastTouch = persistent ? readStorage(STORAGE_KEY_LAST, true) : null;
  if (hasNewParams || !lastTouch) {
    lastTouch = buildAttribution(hasNewParams ? currentParams : lastTouch || {});
  }
  if (persistent) {
    writeStorage(STORAGE_KEY_FIRST, firstTouch, true);
    writeStorage(STORAGE_KEY_LAST, lastTouch, true);
  }

  window.cleanibatAttribution = {
    first: firstTouch,
    last: lastTouch,
  };

  /* Choix fait dans le bandeau (consent.js) : on garde ou on oublie l'origine */
  document.addEventListener("cb:consent", function (e) {
    var granted = e.detail === "granted";
    if (granted) {
      writeStorage(STORAGE_KEY_FIRST, firstTouch, true);
      writeStorage(STORAGE_KEY_LAST, lastTouch, true);
    } else {
      removeStorage(STORAGE_KEY_FIRST, true);
      removeStorage(STORAGE_KEY_LAST, true);
    }
    removeStorage(STORAGE_KEY_FIRST, false);
    removeStorage(STORAGE_KEY_LAST, false);
    forms.forEach(function (form) { fillAdIds(form, granted); });
  });

  function lastCta() {
    try {
      return sessionStorage.getItem(CTA_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  /* ---- Réinjection dans les formulaires ---- */
  function fillHiddenField(form, name, value) {
    var input = form.querySelector('input[name="' + name + '"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value || "";
  }

  var forms = document.querySelectorAll(".js-track-form");

  /* gclid / fbclid : seulement avec l'accord du visiteur */
  function fillAdIds(form, granted) {
    fillHiddenField(form, "gclid", granted ? lastTouch.gclid : "");
    fillHiddenField(form, "fbclid", granted ? lastTouch.fbclid : "");
  }

  function refreshContext(form) {
    fillHiddenField(form, "page_url", window.location.href);
    fillHiddenField(form, "cta_source", lastCta());
  }

  forms.forEach(function (form) {
    fillHiddenField(form, "utm_source", lastTouch.utm_source);
    fillHiddenField(form, "utm_medium", lastTouch.utm_medium);
    fillHiddenField(form, "utm_campaign", lastTouch.utm_campaign);
    fillHiddenField(form, "utm_term", lastTouch.utm_term);
    fillHiddenField(form, "utm_content", lastTouch.utm_content);
    fillAdIds(form, persistent);
    fillHiddenField(form, "first_utm_source", firstTouch.utm_source);
    fillHiddenField(form, "first_landing_page", firstTouch.landing_page);
    fillHiddenField(form, "landing_page", lastTouch.landing_page);
    fillHiddenField(form, "referrer", lastTouch.referrer);
    refreshContext(form);

    /* Le CTA cliqué après le chargement (barre d'appel, header...) est pris
       en compte : cta_source et page_url sont relus au moment de l'envoi. */
    form.addEventListener("submit", function () {
      refreshContext(form);
      fillAdIds(form, consentGranted());
    });
  });

  /* ---- Clics CTA : data-cta="hero-devis-toiture" par ex. ---- */
  document.querySelectorAll("[data-cta]").forEach(function (el) {
    el.addEventListener("click", function () {
      var ctaId = el.getAttribute("data-cta");
      try {
        sessionStorage.setItem(CTA_KEY, ctaId);
      } catch (e) {}
      forms.forEach(function (form) {
        fillHiddenField(form, "cta_source", ctaId);
      });
      window.dataLayer.push({
        event: "cta_click",
        cta_id: ctaId,
        cta_text: (el.textContent || "").trim(),
        page_path: window.location.pathname,
      });
    });
  });

  /* ---- Clics téléphone / email (tracking d'appel) ---- */
  document.querySelectorAll('a[href^="tel:"]').forEach(function (el) {
    el.addEventListener("click", function () {
      window.dataLayer.push({
        event: "phone_click",
        phone_number: el.getAttribute("href").replace("tel:", ""),
        page_path: window.location.pathname,
      });
    });
  });
  document.querySelectorAll('a[href^="mailto:"]').forEach(function (el) {
    el.addEventListener("click", function () {
      window.dataLayer.push({
        event: "email_click",
        page_path: window.location.pathname,
      });
    });
  });

  /* ---- Ajout automatique des UTM courants sur les liens internes vers le
     devis, pour ne jamais perdre l'attribution même sans formulaire JS ---- */
  if (hasNewParams) {
    var linkParams = {};
    Object.keys(currentParams).forEach(function (k) {
      if (persistent || AD_IDS.indexOf(k) === -1) linkParams[k] = currentParams[k];
    });
    var qs = new URLSearchParams(linkParams);
    document.querySelectorAll('a[href*="contact.html"], a[href*="#devis"]').forEach(function (a) {
      try {
        // Ancre de la même page (#devis) : ne pas toucher, sinon le lien peut
        // recharger la page au lieu de défiler jusqu'au formulaire.
        if ((a.getAttribute("href") || "").charAt(0) === "#") return;
        var url = new URL(a.href, window.location.origin);
        qs.forEach(function (v, k) {
          if (!url.searchParams.has(k)) url.searchParams.set(k, v);
        });
        a.href = url.pathname + "?" + url.searchParams.toString() + url.hash;
      } catch (e) {}
    });
  }
})();
