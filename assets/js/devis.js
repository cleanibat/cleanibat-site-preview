/* ==========================================================================
   Cleanibat - assistant de devis en 4 étapes (lot L1)
   --------------------------------------------------------------------------
   Amélioration progressive du formulaire #devisForm (site/form.py) :
   sans JS, toutes les étapes s'affichent et le formulaire s'envoie en POST
   classique vers /contact.php. Ce script :
   - affiche une étape à la fois (classe .is-wizard), avec Retour / Continuer ;
   - valide chaque étape (mêmes messages que contact.php), annonce les erreurs
     (role=alert) et place le focus sur le premier champ en erreur ;
   - propose la commune à partir du code postal (geo.api.gouv.fr) ;
   - réduit les photos (1600 px, JPEG 0,72) avant l'envoi ;
   - récupère le jeton anti-robot (/contact.php?jeton=1) ;
   - sauvegarde le brouillon dans sessionStorage 'cb_devis_v1' ;
   - pose sessionStorage 'cb_lead' juste avant l'envoi (CONTRAT avec
     assets/js/lead.js, lot L6, qui le lit sur merci.html) ;
   - pousse form_start, form_step, form_error, form_submit_attempt dans le
     dataLayer (diagnostic, PAS des conversions).
   L'envoi reste NATIF (pas de fetch) : contact.php répond par une
   redirection 303 vers /merci.html.
   ========================================================================== */
(function () {
  "use strict";

  var form = document.getElementById("devisForm");
  if (!form || !form.classList || !form.classList.contains("devis")) return;

  var FORM_ID = "devisForm";
  var STORE_KEY = "cb_devis_v1";
  var LEAD_KEY = "cb_lead";
  var TOKEN_URL = "/contact.php?jeton=1";
  var GEO_URL = "https://geo.api.gouv.fr/communes?fields=nom,codeDepartement&format=json&codePostal=";
  var MAX_PHOTOS = 3;
  var MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  var PHOTO_MAX_SIDE = 1600;
  var TOKEN_MIN_AGE = 4500; // ms : contact.php refuse un jeton de moins de 4 s
  var TOKEN_MAX_AGE = 3600 * 1000; // ms : au-delà, on en redemande un (validité serveur : 2 h)
  var STEP_NAMES = ["besoin", "precisions", "adresse", "coordonnees"];
  var SERVICES = ["toiture", "toiture-hydrofuge", "toiture-gouttieres", "facade", "terrasse", "professionnel"];
  var ALIASES = { hydrofuge: "toiture-hydrofuge", gouttieres: "toiture-gouttieres", "gouttières": "toiture-gouttieres",
    "façade": "facade", pro: "professionnel", professionnels: "professionnel", allee: "terrasse" };
  var MSG = {
    service: "Choisissez le type de travaux pour continuer.",
    code_postal: "Indiquez un code postal à 5 chiffres (ex : 62300).",
    ville: "Indiquez votre commune.",
    prenom: "Indiquez votre prénom.",
    nom: "Indiquez votre nom.",
    telephone_vide: "Indiquez votre numéro pour que nous puissions vous rappeler.",
    telephone: "Ce numéro ne semble pas valide. Exemple : 06 12 34 56 78.",
    email: "Cette adresse email ne semble pas valide (vous pouvez aussi laisser ce champ vide).",
    photos_max: "3 photos maximum.",
    photos_lourde: "Cette photo est trop lourde (8 Mo max). Essayez une autre photo ou envoyez-la par email après votre demande.",
    consent: "Cochez la case pour que nous puissions vous recontacter."
  };

  var steps = [].slice.call(form.querySelectorAll(".devis-step"));
  var N = steps.length;
  if (!N) return;
  var current = 1;
  var reducedMotion = false;
  try { reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  window.dataLayer = window.dataLayer || [];
  function push(obj) { try { window.dataLayer.push(obj); } catch (e) {} }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} }
  function el(name) { return form.elements[name] || null; }
  function q(sel, root) { return (root || form).querySelector(sel); }
  function qa(sel, root) { return [].slice.call((root || form).querySelectorAll(sel)); }
  function val(name) { var f = el(name); return f && typeof f.value === "string" ? f.value.trim() : ""; }
  function setHidden(name, value) {
    var f = el(name);
    if (!f) {
      f = document.createElement("input");
      f.type = "hidden";
      f.name = name;
      form.appendChild(f);
    }
    f.value = value == null ? "" : String(value);
  }
  function formLocation() { return form.getAttribute("data-form-location") || ""; }
  function lastCta() { return ssGet("cleanibat_last_cta") || ""; }
  function radioValue(name) {
    var r = q('input[name="' + name + '"]:checked');
    return r ? r.value : "";
  }
  function service() { return radioValue("service"); }
  var LETTER_RE = null;
  try { LETTER_RE = new RegExp("\\p{L}", "gu"); } catch (e) { LETTER_RE = /[A-Za-z\u00C0-\u024F]/g; }
  function letters(s) { return (String(s).match(LETTER_RE) || []).length; }

  /* ---------- Téléphone (même règle que contact.php) ---------- */
  function phoneNational(raw) {
    var d = String(raw || "").replace(/[\s.\-()]/g, "");
    var m = /^(?:\+33|0033|0)([1-79]\d{8})$/.exec(d);
    if (!m) return null;
    var nine = m[1];
    if (/(\d)\1{7}/.test(nine) || "0" + nine === "0123456789") return null;
    return "0" + nine;
  }
  function phonePretty(nat) { return nat.replace(/(\d{2})(?=\d)/g, "$1 "); }
  function emailOk(s) { return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(s); }

  /* ---------- Initialisation ---------- */
  form.classList.add("is-wizard");
  form.noValidate = true;
  setHidden("_js", "1");
  setHidden("form_location", formLocation());
  try {
    if (/[?&]test=1(&|$)/.test(window.location.search)) setHidden("_test", "1");
  } catch (e) {}

  var progressItems = qa(".devis-progress li");
  var countEl = q(".devis-count");
  var liveEl = document.getElementById("devisLive");
  var submitBtn = q(".devis-submit");
  var submitLabel = submitBtn ? submitBtn.textContent : "";

  // Barre Retour / Continuer : rendue par site/form.py (pas de décalage au
  // démarrage) ; créée ici seulement si elle manque.
  var nav = q(".devis-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.className = "devis-nav";
    nav.innerHTML =
      '<button type="button" class="btn btn-ghost devis-back">Retour</button>' +
      '<button type="button" class="btn btn-accent devis-next">Continuer</button>';
    form.appendChild(nav);
  }
  var backBtn = q(".devis-back", nav);
  var nextBtn = q(".devis-next", nav);

  /* ---------- Sous-blocs de l'étape 2 ---------- */
  function applySubs() {
    var s = service();
    qa(".devis-sub").forEach(function (sub) {
      var fors = (sub.getAttribute("data-for") || "").split(/\s+/);
      var show = fors.indexOf(s) !== -1 || fors.indexOf("*") !== -1;
      sub.hidden = !show;
      sub.classList.remove("is-off");
      qa("input, select, textarea", sub).forEach(function (f) { f.disabled = !show; });
    });
  }

  /* ---------- Erreurs ---------- */
  function errorTarget(name) {
    if (name === "service") return document.getElementById("g-service");
    return el(name === "photos" ? "photos[]" : name);
  }
  function setError(name, msg) {
    var p = document.getElementById(name + "-err");
    if (p) p.textContent = msg;
    var t = errorTarget(name);
    if (t && t.setAttribute) t.setAttribute("aria-invalid", "true");
  }
  function clearError(name) {
    var p = document.getElementById(name + "-err");
    if (p) p.textContent = "";
    var t = errorTarget(name);
    if (t && t.removeAttribute) t.removeAttribute("aria-invalid");
  }
  function focusField(name) {
    var t;
    if (name === "service") t = q('input[name="service"]:checked') || q('input[name="service"]');
    else t = errorTarget(name);
    if (t && t.focus) {
      try { t.focus({ preventScroll: false }); } catch (e) { t.focus(); }
    }
  }

  var errorsPushed = {};
  function validate(n) {
    var errs = [];
    if (n === 1) {
      if (!service()) errs.push(["service", MSG.service]);
    } else if (n === 3) {
      if (!/^\d{5}$/.test(val("code_postal"))) errs.push(["code_postal", MSG.code_postal]);
      if (!val("ville")) errs.push(["ville", MSG.ville]);
    } else if (n === 4) {
      if (letters(val("prenom")) < 2) errs.push(["prenom", MSG.prenom]);
      if (letters(val("nom")) < 2) errs.push(["nom", MSG.nom]);
      var tel = val("telephone");
      if (!tel) errs.push(["telephone", MSG.telephone_vide]);
      else if (!phoneNational(tel)) errs.push(["telephone", MSG.telephone]);
      var mail = val("email");
      if (mail && !emailOk(mail)) errs.push(["email", MSG.email]);
      var c = el("consent");
      if (c && !c.checked) errs.push(["consent", MSG.consent]);
    }
    return errs;
  }
  function stepFields(n) {
    return { 1: ["service"], 2: [], 3: ["code_postal", "ville"], 4: ["prenom", "nom", "telephone", "email", "consent"] }[n] || [];
  }
  function showErrors(n, errs) {
    stepFields(n).forEach(clearError);
    errs.forEach(function (e) {
      setError(e[0], e[1]);
      var key = n + ":" + e[0];
      if (!errorsPushed[key]) {
        errorsPushed[key] = true;
        push({ event: "form_error", form_id: FORM_ID, step_number: n, field: e[0] });
      }
    });
    if (errs.length) {
      if (liveEl) liveEl.textContent = errs.length > 1 ? errs.length + " champs à corriger." : "";
      focusField(errs[0][0]);
    }
  }

  /* ---------- Navigation ---------- */
  var stepsPushed = {};
  function pushStep(n) {
    if (stepsPushed[n]) return;
    stepsPushed[n] = true;
    push({ event: "form_step", form_id: FORM_ID, step_number: n, step_name: STEP_NAMES[n - 1] || "", service: service() });
  }
  function scrollToForm() {
    try {
      var r = form.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.6) {
        form.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
    } catch (e) {}
  }
  function goTo(n, focus) {
    n = Math.max(1, Math.min(N, n));
    current = n;
    if (n === 2) applySubs();
    steps.forEach(function (s, i) { s.classList.toggle("is-active", i + 1 === n); });
    progressItems.forEach(function (li, i) {
      li.classList.toggle("is-done", i + 1 < n);
      if (i + 1 === n) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    if (countEl) countEl.textContent = "Étape " + n + " sur " + N;
    backBtn.hidden = n === 1;
    nextBtn.hidden = n === N;
    form.classList.toggle("is-last-step", n === N);
    if (started) pushStep(n);
    if (focus) {
      scrollToForm();
      var legend = q(".devis-legend", steps[n - 1]);
      if (legend) {
        try { legend.focus({ preventScroll: true }); } catch (e) { legend.focus(); }
      }
    }
    // Pas de brouillon tant que le visiteur n'a pas touché au formulaire : sinon
    // le service et la commune par défaut d'une page (ex. Lens) seraient
    // restaurés sur la page suivante (ex. Lille ou façade).
    if (started) saveSoon();
  }
  function next() {
    var errs = validate(current);
    if (errs.length) { showErrors(current, errs); return false; }
    stepFields(current).forEach(clearError);
    goTo(current + 1, true);
    return true;
  }
  nextBtn.addEventListener("click", function () { start(); next(); });
  backBtn.addEventListener("click", function () { goTo(current - 1, true); });

  /* Étape 1 : un clic ou un toucher sur une carte passe à l'étape 2 (pas au clavier). */
  var autoTimer = null;
  form.addEventListener("click", function (e) {
    var card = e.target && e.target.closest ? e.target.closest(".choice-card") : null;
    if (!card || current !== 1 || !(e.detail > 0)) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () { if (current === 1 && service()) next(); }, 250);
  });
  form.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || !t.name) return;
    if (t.name === "service") { clearError("service"); applySubs(); }
    if (t.name === "consent" && t.checked) clearError("consent");
  });

  /* Entrée = Continuer (sauf à la dernière étape, où elle envoie). */
  form.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || current >= N) return;
    var t = e.target;
    if (!t || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.tagName === "A" || t.type === "file") return;
    e.preventDefault();
    start();
    next();
  });

  /* ---------- Premier contact : jeton + form_start ---------- */
  var started = false;
  var tokenAt = 0;
  var tokenPromise = null;
  function fetchToken() {
    if (!window.fetch) return Promise.resolve(false);
    tokenPromise = fetch(TOKEN_URL, { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("jeton " + r.status); return r.json(); })
      .then(function (j) {
        if (!j || !j.t || !j.h) throw new Error("jeton invalide");
        setHidden("_t", j.t);
        setHidden("_h", j.h);
        setHidden("_b", j.b || "");
        tokenAt = Date.now();
        return true;
      })
      .catch(function () { return false; });
    return tokenPromise;
  }
  function start() {
    if (started) return;
    started = true;
    fetchToken();
    push({ event: "form_start", form_id: FORM_ID, form_location: formLocation(), cta_source: lastCta() });
    pushStep(current);
  }
  ["focusin", "pointerdown", "keydown", "input"].forEach(function (type) {
    form.addEventListener(type, start, { passive: true });
  });

  /* ---------- Code postal -> commune ---------- */
  var cpInput = el("code_postal");
  var villeInput = el("ville");
  var datalist = document.getElementById("villeList");
  var cpChoices = document.getElementById("devisCpChoices");
  var zoneMsg = document.getElementById("devisZoneMsg");
  var lastCp = "";
  var villeAuto = true;
  var geoCtrl = null;

  function setVille(name) {
    if (!villeInput) return;
    villeInput.value = name;
    villeAuto = true;
    clearError("ville");
    if (cpChoices) {
      qa("button", cpChoices).forEach(function (b) { b.setAttribute("aria-pressed", b.textContent === name ? "true" : "false"); });
    }
    saveSoon();
  }
  function renderCommunes(list) {
    if (datalist) {
      datalist.innerHTML = "";
      list.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.nom;
        datalist.appendChild(o);
      });
    }
    if (!cpChoices) return;
    cpChoices.innerHTML = "";
    if (list.length < 2) { cpChoices.hidden = true; return; }
    list.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = c.nom;
      b.setAttribute("aria-pressed", villeInput && villeInput.value === c.nom ? "true" : "false");
      b.addEventListener("click", function () { setVille(c.nom); });
      cpChoices.appendChild(b);
    });
    cpChoices.hidden = false;
  }
  function zoneCheck(cp, dept) {
    if (!zoneMsg) return;
    var d = dept || (cp ? cp.slice(0, 2) : "");
    zoneMsg.hidden = !(cp && cp.length === 5 && d !== "59" && d !== "62");
  }
  function lookupCp(cp) {
    zoneCheck(cp, "");
    if (!window.fetch) return;
    try { if (geoCtrl) geoCtrl.abort(); } catch (e) {}
    var ctrl = window.AbortController ? new AbortController() : null;
    geoCtrl = ctrl;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 3000) : null;
    fetch(GEO_URL + encodeURIComponent(cp), ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error("geo " + r.status); return r.json(); })
      .then(function (list) {
        if (timer) clearTimeout(timer);
        if (val("code_postal") !== cp || !list || !list.length) { renderCommunes([]); return; }
        list.sort(function (a, b) { return a.nom.localeCompare(b.nom, "fr"); });
        renderCommunes(list);
        zoneCheck(cp, list[0].codeDepartement);
        if (list.length === 1 && (villeAuto || !val("ville"))) setVille(list[0].nom);
        else if (list.length > 1 && villeAuto && val("ville")) {
          var known = list.some(function (c) { return c.nom.toLowerCase() === val("ville").toLowerCase(); });
          if (!known) villeInput.value = "";
        }
      })
      .catch(function () { if (timer) clearTimeout(timer); renderCommunes([]); });
  }
  if (cpInput) {
    cpInput.addEventListener("input", function () {
      var digits = cpInput.value.replace(/\D/g, "").slice(0, 5);
      if (digits !== cpInput.value) cpInput.value = digits;
      if (digits.length === 5) {
        clearError("code_postal");
        if (digits !== lastCp) { lastCp = digits; lookupCp(digits); }
      } else {
        lastCp = "";
        if (zoneMsg) zoneMsg.hidden = true;
        if (cpChoices) cpChoices.hidden = true;
      }
    });
  }
  if (villeInput) {
    villeInput.addEventListener("input", function () { villeAuto = false; if (val("ville")) clearError("ville"); });
  }

  /* ---------- Téléphone : affichage 06 12 34 56 78 ---------- */
  var telInput = el("telephone");
  if (telInput) {
    telInput.addEventListener("blur", function () {
      var nat = phoneNational(telInput.value);
      if (nat) { telInput.value = phonePretty(nat); clearError("telephone"); }
    });
  }
  ["prenom", "nom", "email"].forEach(function (name) {
    var f = el(name);
    if (f) f.addEventListener("input", function () { if (f.getAttribute("aria-invalid")) clearError(name); });
  });

  /* ---------- Photos : 3 max, réduites à 1600 px ---------- */
  var photoInput = el("photos[]");
  var thumbs = document.getElementById("devisThumbs");
  var photos = []; // [{file, url}]
  var photoJobs = 0;
  var photoWaiters = [];
  var canDT = false;
  try { canDT = typeof DataTransfer === "function" && !!new DataTransfer().items; } catch (e) { canDT = false; }

  function photosIdle() {
    return photoJobs === 0 ? Promise.resolve() : new Promise(function (res) { photoWaiters.push(res); });
  }
  function jobDone() {
    photoJobs = Math.max(0, photoJobs - 1);
    if (photoJobs === 0) { var w = photoWaiters; photoWaiters = []; w.forEach(function (f) { f(); }); }
  }
  function decodeImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ src: img, done: function () { URL.revokeObjectURL(url); } }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }
  function decode(file) {
    if (window.createImageBitmap) {
      try {
        return createImageBitmap(file, { imageOrientation: "from-image" })
          .then(function (bmp) { return { src: bmp, done: function () { if (bmp.close) bmp.close(); } }; })
          .catch(function () { return decodeImg(file); });
      } catch (e) { return decodeImg(file); }
    }
    return decodeImg(file);
  }
  function compress(file, n) {
    var keepOriginal = function () { return file.size <= MAX_PHOTO_BYTES ? file : null; };
    return decode(file).then(function (d) {
      var w = d.src.naturalWidth || d.src.width;
      var h = d.src.naturalHeight || d.src.height;
      if (!w || !h) { d.done(); return keepOriginal(); }
      var scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(d.src, 0, 0, canvas.width, canvas.height);
      d.done();
      return new Promise(function (resolve) {
        if (!canvas.toBlob) { resolve(keepOriginal()); return; }
        canvas.toBlob(function (blob) {
          if (!blob) { resolve(keepOriginal()); return; }
          try {
            var out = new File([blob], "photo-" + n + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
            resolve(out.size < file.size || file.size > MAX_PHOTO_BYTES ? out : keepOriginal());
          } catch (e) { resolve(keepOriginal()); }
        }, "image/jpeg", 0.72);
      });
    }).catch(function () { return keepOriginal(); });
  }
  function syncInput() {
    if (!canDT || !photoInput) return;
    try {
      var dt = new DataTransfer();
      photos.forEach(function (p) { dt.items.add(p.file); });
      photoInput.files = dt.files;
    } catch (e) {}
  }
  function renderThumbs() {
    if (!thumbs) return;
    thumbs.innerHTML = "";
    photos.forEach(function (p, i) {
      var li = document.createElement("li");
      var img = document.createElement("img");
      img.alt = "";
      img.width = 72;
      img.height = 72;
      img.src = p.url;
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Retirer la photo " + (i + 1));
      b.textContent = "×";
      b.addEventListener("click", function () {
        try { URL.revokeObjectURL(p.url); } catch (e) {}
        photos.splice(photos.indexOf(p), 1);
        syncInput();
        renderThumbs();
        clearError("photos");
        if (photoInput) photoInput.focus();
      });
      li.appendChild(img);
      li.appendChild(b);
      thumbs.appendChild(li);
    });
    thumbs.hidden = photos.length === 0;
  }
  if (photoInput) {
    photoInput.addEventListener("change", function () {
      clearError("photos");
      var picked = [].slice.call(photoInput.files || []);
      if (!canDT) {
        // Navigateur ancien : on ne peut pas modifier la sélection, on la contrôle seulement.
        if (picked.length > MAX_PHOTOS) { photoInput.value = ""; setError("photos", MSG.photos_max); return; }
        for (var i = 0; i < picked.length; i++) {
          if (picked[i].size > MAX_PHOTO_BYTES) { photoInput.value = ""; setError("photos", MSG.photos_lourde); return; }
        }
        return;
      }
      var room = MAX_PHOTOS - photos.length;
      if (picked.length > room) setError("photos", MSG.photos_max);
      picked = picked.slice(0, Math.max(0, room));
      syncInput(); // remet la sélection courante (sans les nouvelles) pendant le traitement
      picked.forEach(function (file) {
        photoJobs++;
        var n = photos.length + photoJobs;
        compress(file, n).then(function (out) {
          if (!out) { setError("photos", MSG.photos_lourde); return; }
          if (photos.length >= MAX_PHOTOS) { setError("photos", MSG.photos_max); return; }
          var url = "";
          try { url = URL.createObjectURL(out); } catch (e) {}
          photos.push({ file: out, url: url });
          syncInput();
          renderThumbs();
        }).then(jobDone, jobDone);
      });
    });
  }

  /* ---------- Brouillon (sessionStorage) ---------- */
  var SKIP = { _t: 1, _h: 1, _b: 1, _js: 1, _test: 1, website: 1, "photos[]": 1, form_location: 1 };
  var saveTimer = null;
  function save() {
    var data = { step: current, f: {} };
    qa(".devis-step input, .devis-step textarea, .devis-step select").forEach(function (f) {
      if (!f.name || SKIP[f.name] || f.type === "file") return;
      if (f.type === "radio") { if (f.checked) data.f[f.name] = f.value; }
      else if (f.type === "checkbox") { if (f.checked) data.f[f.name] = f.value || "on"; }
      else if (f.value) data.f[f.name] = f.value;
    });
    ssSet(STORE_KEY, JSON.stringify(data));
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }
  form.addEventListener("input", saveSoon);
  form.addEventListener("change", saveSoon);

  function restore() {
    var data = null;
    try { data = JSON.parse(ssGet(STORE_KEY) || "null"); } catch (e) { data = null; }
    if (!data || !data.f) return 0;
    Object.keys(data.f).forEach(function (name) {
      if (SKIP[name]) return;
      var v = data.f[name];
      qa('[name="' + name.replace(/"/g, "") + '"]').forEach(function (f) {
        if (f.type === "radio" || f.type === "checkbox") f.checked = f.value === v || (f.type === "checkbox" && v === "on");
        else if (f.type !== "file") f.value = v;
      });
    });
    // Commune par défaut de la page (ex. Lens) restaurée telle quelle : elle reste
    // « automatique » et sera remplacée par la recherche du code postal.
    if (val("ville")) villeAuto = val("ville") === (form.getAttribute("data-default-ville") || "");
    if (val("code_postal").length === 5) { lastCp = val("code_postal"); zoneCheck(lastCp, ""); }
    return parseInt(data.step, 10) || 1;
  }
  function selectService(v) {
    var r = q('input[name="service"][value="' + v + '"]');
    if (r) { r.checked = true; return true; }
    return false;
  }

  var startStep = restore();
  var urlService = "";
  try {
    var m = /[?&]besoin=([^&#]+)/.exec(window.location.search);
    if (m) {
      urlService = decodeURIComponent(m[1].replace(/\+/g, " ")).toLowerCase();
      urlService = ALIASES[urlService] || urlService;
    }
  } catch (e) { urlService = ""; }
  var defService = form.getAttribute("data-default-service") || "";
  if (urlService && SERVICES.indexOf(urlService) !== -1 && selectService(urlService)) {
    startStep = Math.max(startStep, 2);
  } else if (defService && (service() === defService || (!service() && selectService(defService)))) {
    // service de la page (radio déjà cochée par site/form.py, ou cochée ici)
    startStep = Math.max(startStep, 2);
  }
  var defVille = form.getAttribute("data-default-ville") || "";
  // Commune par défaut = valeur automatique : un code postal d'une autre commune la remplace.
  if (defVille && villeInput && !val("ville")) { villeInput.value = defVille; villeAuto = true; }

  applySubs();
  if (!service()) startStep = 1;
  goTo(startStep || 1, false);
  if (startStep > 1 && ssGet(STORE_KEY)) start();

  /* ---------- Envoi ---------- */
  var waiting = false;
  var sending = false;
  var attemptPushed = false;
  var retried = false;

  function setBusy(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? "Envoi en cours…" : submitLabel;
    submitBtn.setAttribute("aria-busy", on ? "true" : "false");
  }
  function delay(ms) { return new Promise(function (res) { setTimeout(res, Math.max(0, ms)); }); }
  function resubmit() {
    waiting = false;
    setBusy(false);
    try {
      if (form.requestSubmit) form.requestSubmit(submitBtn || undefined);
      else if (submitBtn) submitBtn.click();
      else HTMLFormElement.prototype.submit.call(form);
    } catch (e) {
      HTMLFormElement.prototype.submit.call(form);
    }
  }

  form.addEventListener("submit", function (e) {
    if (sending || waiting) { e.preventDefault(); return; }
    // Validation de toutes les étapes ; on revient sur la première en erreur.
    for (var n = 1; n <= N; n++) {
      var errs = validate(n);
      if (errs.length) {
        e.preventDefault();
        if (n !== current) goTo(n, false);
        showErrors(n, errs);
        return;
      }
    }
    // Photos encore en cours de réduction, ou jeton absent / trop récent / trop vieux : on attend.
    var age = tokenAt ? Date.now() - tokenAt : -1;
    var needToken = !retried && (age < 0 || age > TOKEN_MAX_AGE);
    var tooRecent = age >= 0 && age < TOKEN_MIN_AGE;
    if (photoJobs > 0 || needToken || (tooRecent && !retried)) {
      e.preventDefault();
      waiting = true;
      setBusy(true);
      var p = photosIdle();
      if (needToken) {
        retried = true;
        p = p.then(function () { return tokenPromise && age < 0 ? tokenPromise : fetchToken(); })
          .then(function (ok) { if (!ok && !tokenAt) return fetchToken(); return ok; });
      }
      p.then(function () {
        var a = tokenAt ? Date.now() - tokenAt : TOKEN_MIN_AGE;
        return delay(TOKEN_MIN_AGE - a);
      }).then(function () { retried = true; resubmit(); }, function () { retried = true; resubmit(); });
      return;
    }

    // Envoi natif.
    sending = true;
    var tel = phoneNational(val("telephone"));
    if (tel && telInput) telInput.value = phonePretty(tel);
    var cta = lastCta();
    if (cta) setHidden("cta_source", cta);
    try { setHidden("page_url", window.location.href); } catch (err) {}
    if (!attemptPushed) {
      attemptPushed = true;
      push({ event: "form_submit_attempt", form_id: FORM_ID, service: service(), nb_photos: photos.length || (photoInput && photoInput.files ? photoInput.files.length : 0) });
    }
    ssSet(LEAD_KEY, JSON.stringify({
      ts: Date.now(),
      service: service(),
      prenom: val("prenom"),
      email: val("email"),
      phone_e164: tel ? "+33" + tel.slice(1) : ""
    }));
    save();
    setBusy(true);
  });

  /* Retour arrière depuis merci.html (page en cache) : bouton réactivé, nouveau jeton. */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    sending = false;
    waiting = false;
    retried = false;
    setBusy(false);
    if (started) fetchToken();
  });
})();
