/* ==========================================================================
   Cleanibat — conversion « Demande de devis » (lot L6, docs/TRACKING.md)
   --------------------------------------------------------------------------
   Chargé en defer par merci.html, APRÈS consent.js.
   Contrat avec devis.js (lot L1) :
   - juste avant l'envoi, sessionStorage 'cb_lead' =
     JSON {ts, service, prenom, email, phone_e164} ;
   - contact.php redirige vers merci.html?ref=<lead_id>.
   Si cb_lead existe et date de moins de 30 min : UN seul push generate_lead
   (transaction_id = lead_id pour la déduplication Google Ads), avec user_data
   (conversions améliorées) seulement si le visiteur a accepté les cookies,
   puis cb_lead est supprimé. Rechargement, accès direct ou robot sans JS :
   aucun push.
   Pour la page merci : window.cbLeadInfo = {prenom, service, lead_id} (ou null).
   ========================================================================== */
(function () {
  "use strict";

  var KEY = "cb_lead";
  var MAX_AGE = 30 * 60 * 1000;
  window.cbLeadInfo = null;

  var raw = null;
  try {
    raw = sessionStorage.getItem(KEY);
    if (raw !== null) sessionStorage.removeItem(KEY); /* supprimé d'abord : jamais compté deux fois */
  } catch (e) {
    return;
  }
  if (!raw) return;

  var lead;
  try {
    lead = JSON.parse(raw);
  } catch (e) {
    return;
  }
  var ts = lead && Number(lead.ts);
  if (!ts || Date.now() - ts > MAX_AGE || ts - Date.now() > 60000) return;

  var ref = "";
  try {
    ref = new URLSearchParams(window.location.search).get("ref") || "";
  } catch (e) {}
  ref = ref.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

  function consent() {
    if (window.cbConsent && typeof window.cbConsent.get === "function") return window.cbConsent.get();
    try {
      var c = JSON.parse(localStorage.getItem("cb_consent") || "null");
      if (c && c.ts && Date.now() - c.ts < 182 * 864e5) return c.v;
    } catch (e) {}
    return null;
  }

  var service = typeof lead.service === "string" ? lead.service.slice(0, 40) : "";
  var ev = {
    event: "generate_lead",
    form_id: "devisForm",
    lead_id: ref,
    transaction_id: ref,
    service: service,
    value: 1,
    currency: "EUR",
  };

  if (consent() === "granted") {
    var ud = {};
    var email = typeof lead.email === "string" ? lead.email.trim().toLowerCase() : "";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ud.email = email;
    var phone = typeof lead.phone_e164 === "string" ? lead.phone_e164.replace(/\s+/g, "") : "";
    if (/^\+[1-9]\d{7,14}$/.test(phone)) ud.phone_number = phone;
    if (ud.email || ud.phone_number) ev.user_data = ud;
  }

  window.cbLeadInfo = {
    prenom: typeof lead.prenom === "string" ? lead.prenom.slice(0, 60) : "",
    service: service,
    lead_id: ref,
  };

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(ev);
})();
