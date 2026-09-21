/* Anne Waithaka — portfolio interactions.
   Small, dependency-free enhancements. Every page works without this file. */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* --- Header: merge with the dark masthead, then turn to restrained glass --- */
  function initHeader() {
    var header = document.querySelector("[data-header]");
    if (!header) return;

    var update = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 16);
    };

    var frame = null;
    window.addEventListener(
      "scroll",
      function () {
        if (frame) return;
        frame = window.requestAnimationFrame(function () {
          frame = null;
          update();
        });
      },
      { passive: true }
    );

    update();
  }

  /* --- Mobile navigation --- */
  function initNav() {
    var header = document.querySelector("[data-header]");
    var toggle = document.querySelector("[data-nav-toggle]");
    var nav = document.getElementById("primary-nav");
    if (!header || !toggle || !nav) return;

    var focusable =
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function setOpen(open) {
      header.setAttribute("data-nav-open", open ? "true" : "false");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute(
        "aria-label",
        open ? "Close navigation menu" : "Open navigation menu"
      );
      document.body.classList.toggle("is-nav-open", open);
    }

    function isOpen() {
      return header.getAttribute("data-nav-open") === "true";
    }

    toggle.addEventListener("click", function () {
      setOpen(!isOpen());
      if (isOpen()) {
        var first = nav.querySelector(focusable);
        if (first) first.focus();
      }
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (!isOpen()) return;

      if (event.key === "Escape") {
        setOpen(false);
        toggle.focus();
        return;
      }

      if (event.key !== "Tab") return;

      var items = [toggle].concat(Array.prototype.slice.call(nav.querySelectorAll(focusable)));
      var first = items[0];
      var last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.matchMedia("(min-width: 64rem)").addEventListener("change", function (event) {
      if (event.matches) setOpen(false);
    });
  }

  /* --- Gentle reveal on scroll --- */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
    if (!items.length) return;

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      items.forEach(function (item) {
        item.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    items.forEach(function (item, index) {
      item.style.setProperty("--reveal-delay", Math.min(index, 4) * 55 + "ms");
      observer.observe(item);
    });
  }

  /* --- Work index filtering (progressive: all projects show without JS) --- */
  function initWorkFilter() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-types]"));
    var status = document.querySelector("[data-filter-status]");
    if (!buttons.length || !cards.length) return;

    function apply(filter) {
      var shown = 0;

      cards.forEach(function (card) {
        var types = (card.getAttribute("data-types") || "").split(/\s+/);
        var match = filter === "all" || types.indexOf(filter) !== -1;
        card.hidden = !match;
        if (match) shown += 1;
      });

      buttons.forEach(function (button) {
        button.setAttribute(
          "aria-pressed",
          button.getAttribute("data-filter") === filter ? "true" : "false"
        );
      });

      if (status) {
        status.textContent =
          "Showing " +
          shown +
          (shown === 1 ? " project" : " projects") +
          (filter === "all" ? "" : " in " + filter) +
          ".";
      }
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        apply(button.getAttribute("data-filter"));
      });
    });
  }

  /* --- Copy email without a form or third-party script --- */
  function initCopy() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-copy]"));
    if (!buttons.length) return;

    function legacyCopy(value) {
      var field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (error) {
        ok = false;
      }
      document.body.removeChild(field);
      return ok;
    }

    buttons.forEach(function (button) {
      var status = button.parentElement.querySelector("[data-copy-status]");

      button.addEventListener("click", function () {
        var value = button.getAttribute("data-copy");
        if (!value) return;

        var done = function (ok) {
          if (!status) return;
          status.textContent = ok
            ? "Copied " + value + " to your clipboard."
            : "Copy failed — the address is " + value + ".";
          window.setTimeout(function () {
            status.textContent = "";
          }, 6000);
        };

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(value).then(
            function () {
              done(true);
            },
            function () {
              done(legacyCopy(value));
            }
          );
        } else {
          done(legacyCopy(value));
        }
      });
    });
  }

  /* --- Current year in the footer --- */
  function initYear() {
    var year = String(new Date().getFullYear());
    document.querySelectorAll("[data-year]").forEach(function (node) {
      node.textContent = year;
    });
  }

  function init() {
    initHeader();
    initNav();
    initReveal();
    initWorkFilter();
    initCopy();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
