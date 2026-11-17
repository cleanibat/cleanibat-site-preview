/* ==========================================================================
   Cleanibat — comportements UI (header, menu mobile, FAQ, galerie, sliders)
   ========================================================================== */
(function () {
  "use strict";

  /* ---- Header: transparent sur le hero, solide au scroll ---- */
  var header = document.querySelector(".site-header");
  if (header) {
    var solidFromStart = header.classList.contains("header-solid");
    var onScroll = function () {
      if (solidFromStart) return;
      if (window.scrollY > 60) {
        header.classList.add("is-scrolled");
      } else {
        header.classList.remove("is-scrolled");
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- Menu mobile ---- */
  var navToggle = document.querySelector(".nav-toggle");
  var navMain = document.querySelector(".nav-main");
  if (navToggle && navMain) {
    navToggle.addEventListener("click", function () {
      navMain.classList.toggle("is-open");
      var expanded = navMain.classList.contains("is-open");
      navToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    /* sous-menu "Services" en mobile : clic pour déplier */
    document.querySelectorAll(".nav-main .has-dropdown > a").forEach(function (link) {
      link.addEventListener("click", function (e) {
        if (window.innerWidth <= 980) {
          e.preventDefault();
          link.parentElement.classList.toggle("is-open");
        }
      });
    });
  }

  /* ---- FAQ accordéon ---- */
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var q = item.querySelector(".faq-q");
    var a = item.querySelector(".faq-a");
    if (!q || !a) return;
    q.addEventListener("click", function () {
      var isOpen = item.classList.contains("is-open");
      document.querySelectorAll(".faq-item.is-open").forEach(function (other) {
        if (other !== item) {
          other.classList.remove("is-open");
          other.querySelector(".faq-a").style.maxHeight = null;
        }
      });
      if (isOpen) {
        item.classList.remove("is-open");
        a.style.maxHeight = null;
      } else {
        item.classList.add("is-open");
        a.style.maxHeight = a.scrollHeight + "px";
      }
    });
  });

  /* ---- Filtre galerie réalisations ---- */
  var filterBtns = document.querySelectorAll(".filter-btn");
  var galleryItems = document.querySelectorAll(".gallery-item");
  if (filterBtns.length && galleryItems.length) {
    filterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterBtns.forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        var filter = btn.getAttribute("data-filter");
        galleryItems.forEach(function (item) {
          var cat = item.getAttribute("data-category");
          var show = filter === "all" || filter === cat;
          item.style.display = show ? "" : "none";
        });
      });
    });
  }

  /* ---- Curseur avant / après ---- */
  document.querySelectorAll(".ba-slider").forEach(function (slider) {
    var afterImg = slider.querySelector(".ba-after");
    var handle = slider.querySelector(".ba-handle");
    if (!afterImg || !handle) return;

    var setPos = function (clientX) {
      var rect = slider.getBoundingClientRect();
      var x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      var pct = (x / rect.width) * 100;
      afterImg.style.clipPath = "inset(0 0 0 " + pct + "%)";
      handle.style.left = pct + "%";
    };

    var dragging = false;
    handle.addEventListener("mousedown", function () { dragging = true; });
    window.addEventListener("mouseup", function () { dragging = false; });
    window.addEventListener("mousemove", function (e) {
      if (dragging) setPos(e.clientX);
    });
    slider.addEventListener("touchstart", function () { dragging = true; }, { passive: true });
    window.addEventListener("touchend", function () { dragging = false; });
    slider.addEventListener(
      "touchmove",
      function (e) {
        if (dragging && e.touches[0]) setPos(e.touches[0].clientX);
      },
      { passive: true }
    );
    slider.addEventListener("click", function (e) {
      setPos(e.clientX);
    });
  });

  /* ---- Année copyright ---- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---- Retour en haut de page (le header étant en position fixed,
     un simple lien ancre #siteHeader ne déclenche aucun scroll) ---- */
  document.querySelectorAll(".footer-top-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
})();
