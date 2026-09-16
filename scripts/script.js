(() => {
    "use strict";

    const root = document.documentElement;
    const header = document.querySelector("[data-header]");
    const menuToggle = document.querySelector("[data-menu-toggle]");
    const mobileMenu = document.querySelector("[data-menu-mobile]");
    const contactDock = document.querySelector("[data-contact-dock]");
    const contactToggle = document.querySelector("[data-contact-toggle]");
    const contactPanel = document.querySelector("[data-contact-panel]");
    const contactClose = document.querySelector("[data-contact-close]");
    const contactDismiss = document.querySelector("[data-contact-dismiss]");
    const contactTriggers = [...document.querySelectorAll("[data-contact-trigger]")];
    const mobileQuery = window.matchMedia("(max-width: 768px)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!header || !mobileMenu || !contactDock || !contactPanel) {
        return;
    }

    let menuOpen = false;
    let contactPanelOpen = false;
    let headerVisible = true;
    let dockVisible = false;
    let lastScrollY = Math.max(window.scrollY, 0);
    let accumulatedDelta = 0;
    let lastDirection = 0;
    let frameRequested = false;
    let lastContactTrigger = null;
    let scrollSmoother = null;

    const DIRECTION_THRESHOLD = 18;
    const TOP_THRESHOLD = 32;
    const focusableSelector = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const activeParallax = new Set();
    const parallaxElements = [...document.querySelectorAll("[data-parallax]")];

    function setInert(element, shouldBeInert) {
        if (!element) return;

        if (shouldBeInert) {
            element.setAttribute("inert", "");
        } else {
            element.removeAttribute("inert");
        }
    }

    function getFocusable(container) {
        return [...container.querySelectorAll(focusableSelector)].filter((element) => {
            return !element.hasAttribute("inert") && element.getClientRects().length > 0;
        });
    }

    function syncContactPanelAccess() {
        const shouldExposePanel = dockVisible && (!mobileQuery.matches || contactPanelOpen);
        contactPanel.setAttribute("aria-hidden", String(!shouldExposePanel));
        setInert(contactPanel, !shouldExposePanel);
    }

    function closeMobileMenu(returnFocus = false) {
        if (!menuOpen) return;

        menuOpen = false;
        mobileMenu.classList.remove("is-open");
        mobileMenu.setAttribute("aria-hidden", "true");
        setInert(mobileMenu, true);
        menuToggle?.setAttribute("aria-expanded", "false");

        if (returnFocus && menuToggle) {
            menuToggle.focus({ preventScroll: true });
        }
    }

    function openMobileMenu() {
        if (!mobileQuery.matches || menuOpen) return;

        setDockVisible(false);
        setHeaderVisible(true);
        menuOpen = true;
        mobileMenu.classList.add("is-open");
        mobileMenu.setAttribute("aria-hidden", "false");
        setInert(mobileMenu, false);
        menuToggle?.setAttribute("aria-expanded", "true");

        requestAnimationFrame(() => {
            getFocusable(mobileMenu)[0]?.focus({ preventScroll: true });
        });
    }

    function closeContactPanel(returnFocus = false) {
        if (!contactPanelOpen) {
            syncContactPanelAccess();
            return;
        }

        contactPanelOpen = false;
        contactDock.classList.remove("is-panel-open");
        contactToggle?.setAttribute("aria-expanded", "false");
        syncContactPanelAccess();

        if (returnFocus && dockVisible && contactToggle) {
            contactToggle.focus({ preventScroll: true });
        }
    }

    function openContactPanel() {
        if (!mobileQuery.matches || contactPanelOpen) return;

        contactPanelOpen = true;
        contactDock.classList.add("is-panel-open");
        contactToggle?.setAttribute("aria-expanded", "true");
        syncContactPanelAccess();

        requestAnimationFrame(() => {
            getFocusable(contactPanel)[0]?.focus({ preventScroll: true });
        });
    }

    function setHeaderVisible(visible) {
        if (headerVisible === visible) return;

        headerVisible = visible;
        header.classList.toggle("is-hidden", !visible);
        header.setAttribute("aria-hidden", String(!visible));
        setInert(header, !visible);

        if (!visible) {
            closeMobileMenu(false);
        }
    }

    function setDockVisible(visible) {
        if (dockVisible === visible) {
            syncContactPanelAccess();
            return;
        }

        dockVisible = visible;
        contactDock.classList.toggle("is-visible", visible);
        contactDock.setAttribute("aria-hidden", String(!visible));
        setInert(contactDock, !visible);

        if (!visible) {
            closeContactPanel(false);
        } else {
            syncContactPanelAccess();
        }
    }

    function showContact(trigger) {
        lastContactTrigger = trigger;
        closeMobileMenu(false);
        setHeaderVisible(false);
        setDockVisible(true);

        if (mobileQuery.matches) {
            openContactPanel();
        } else {
            requestAnimationFrame(() => {
                contactPanel.querySelector(".contact-button")?.focus({ preventScroll: true });
            });
        }
    }

    function dismissContact(returnFocus = false) {
        const returnTarget = lastContactTrigger?.closest("[data-menu-mobile]")
            ? menuToggle
            : lastContactTrigger;

        lastContactTrigger = null;
        setDockVisible(false);
        setHeaderVisible(true);

        if (returnFocus) {
            requestAnimationFrame(() => {
                (returnTarget || menuToggle || header.querySelector(".marca"))?.focus({ preventScroll: true });
            });
        }
    }

    function updateChromeFromScroll() {
        const currentScrollY = Math.max(window.scrollY, 0);

        if (currentScrollY <= TOP_THRESHOLD) {
            accumulatedDelta = 0;
            lastDirection = 0;
            setDockVisible(false);
            setHeaderVisible(true);
            lastScrollY = currentScrollY;
            return;
        }

        const delta = currentScrollY - lastScrollY;
        lastScrollY = currentScrollY;

        if (Math.abs(delta) < 1) return;

        const direction = delta > 0 ? 1 : -1;
        if (direction !== lastDirection) {
            accumulatedDelta = 0;
            lastDirection = direction;
        }

        accumulatedDelta += Math.abs(delta);
        if (accumulatedDelta < DIRECTION_THRESHOLD) return;

        accumulatedDelta = 0;

        if (direction > 0) {
            lastContactTrigger = null;
            closeMobileMenu(false);
            setHeaderVisible(false);
            setDockVisible(true);
        } else {
            setDockVisible(false);
            setHeaderVisible(true);
        }
    }

    function updateParallax() {
        if (reducedMotionQuery.matches) {
            activeParallax.forEach((element) => {
                element.style.transform = "none";
            });
            return;
        }

        const viewportHeight = window.innerHeight;

        activeParallax.forEach((element) => {
            const rect = element.getBoundingClientRect();
            const strength = Number(element.dataset.parallax) || 18;
            const denominator = (viewportHeight + rect.height) / 2;
            const normalized = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - viewportHeight / 2) / denominator));
            const mobileFactor = mobileQuery.matches ? 0.58 : 1;
            const offset = normalized * strength * mobileFactor;
            element.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0) scale(1.06)`;
        });
    }

    function updateFrame() {
        frameRequested = false;
        updateChromeFromScroll();
        updateParallax();
    }

    function requestFrame() {
        if (frameRequested) return;
        frameRequested = true;
        requestAnimationFrame(updateFrame);
    }

    function setupScrollSmoother() {
        const gsap = window.gsap;
        const ScrollTrigger = window.ScrollTrigger;
        const ScrollSmoother = window.ScrollSmoother;

        if (reducedMotionQuery.matches || !gsap || !ScrollTrigger || !ScrollSmoother) {
            scrollSmoother?.kill();
            scrollSmoother = null;
            root.classList.remove("has-scroll-smoother");
            return;
        }

        if (scrollSmoother) return;

        gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
        scrollSmoother = ScrollSmoother.create({
            wrapper: "#smooth-wrapper",
            content: "#smooth-content",
            smooth: 0.8,
            smoothTouch: 0.1,
            effects: false,
            onUpdate: requestFrame
        });
        root.classList.add("has-scroll-smoother");
    }

    function setupSmoothAnchorLinks() {
        document.querySelectorAll('a[href^="#"]:not(.skip-link):not([data-contact-trigger])').forEach((link) => {
            link.addEventListener("click", (event) => {
                if (!scrollSmoother) return;

                const hash = link.getAttribute("href");
                const target = hash && document.querySelector(hash);
                if (!target) return;

                event.preventDefault();
                closeMobileMenu(false);

                const position = target.id === "inicio"
                    ? "top top"
                    : `top ${mobileQuery.matches ? 86 : 96}px`;

                scrollSmoother.scrollTo(target, true, position);
                window.history.pushState(null, "", hash);
            });
        });
    }

    function trapFocus(event, container) {
        if (event.key !== "Tab") return;

        const focusable = getFocusable(container);
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function setupReveal() {
        const revealElements = [...document.querySelectorAll("[data-reveal]")];

        revealElements.forEach((element) => {
            const delay = Math.max(0, Math.min(Number(element.dataset.delay) || 0, 360));
            element.style.setProperty("--reveal-delay", `${delay}ms`);
        });

        if (!("IntersectionObserver" in window)) {
            revealElements.forEach((element) => element.classList.add("is-visible"));
            root.classList.add("reveal-ready");
            return;
        }

        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        }, {
            rootMargin: "0px 0px -10% 0px",
            threshold: 0.12
        });

        revealElements.forEach((element) => revealObserver.observe(element));
        root.classList.add("reveal-ready");
    }

    function setupParallax() {
        if (!("IntersectionObserver" in window)) {
            parallaxElements.forEach((element) => activeParallax.add(element));
            updateParallax();
            return;
        }

        const parallaxObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    activeParallax.add(entry.target);
                } else {
                    activeParallax.delete(entry.target);
                }
            });
            requestFrame();
        }, {
            rootMargin: "18% 0px 18% 0px",
            threshold: 0
        });

        parallaxElements.forEach((element) => parallaxObserver.observe(element));
    }

    menuToggle?.addEventListener("click", () => {
        if (menuOpen) {
            closeMobileMenu(true);
        } else {
            openMobileMenu();
        }
    });

    mobileMenu.querySelectorAll("a:not([data-contact-trigger])").forEach((link) => {
        link.addEventListener("click", () => closeMobileMenu(false));
    });

    contactTriggers.forEach((trigger) => {
        trigger.addEventListener("click", (event) => {
            event.preventDefault();
            showContact(trigger);
        });
    });

    contactToggle?.addEventListener("click", () => {
        if (contactPanelOpen) {
            closeContactPanel(true);
        } else {
            lastContactTrigger = null;
            openContactPanel();
        }
    });

    contactClose?.addEventListener("click", () => dismissContact(true));
    contactDismiss?.addEventListener("click", () => dismissContact(true));

    document.addEventListener("pointerdown", (event) => {
        if (menuOpen && !header.contains(event.target)) {
            closeMobileMenu(false);
        }

        if (contactPanelOpen && !contactDock.contains(event.target)) {
            if (lastContactTrigger) {
                dismissContact(false);
            } else {
                closeContactPanel(false);
            }
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            if (contactPanelOpen) {
                dismissContact(true);
            } else if (menuOpen) {
                closeMobileMenu(true);
            }
            return;
        }

        if (contactPanelOpen) {
            trapFocus(event, contactPanel);
        } else if (menuOpen) {
            trapFocus(event, mobileMenu);
        }
    });

    window.addEventListener("scroll", requestFrame, { passive: true });
    window.addEventListener("resize", requestFrame, { passive: true });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            lastScrollY = Math.max(window.scrollY, 0);
            requestFrame();
        }
    });

    const handleMobileChange = () => {
        closeMobileMenu(false);
        closeContactPanel(false);
        syncContactPanelAccess();
        requestFrame();
    };

    const handleReducedMotionChange = () => {
        setupScrollSmoother();
        parallaxElements.forEach((element) => {
            element.style.transform = reducedMotionQuery.matches ? "none" : "";
        });
        requestFrame();
    };

    if (typeof mobileQuery.addEventListener === "function") {
        mobileQuery.addEventListener("change", handleMobileChange);
        reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
    } else {
        mobileQuery.addListener(handleMobileChange);
        reducedMotionQuery.addListener(handleReducedMotionChange);
    }

    contactDock.setAttribute("aria-hidden", "true");
    setInert(contactDock, true);
    syncContactPanelAccess();
    setupScrollSmoother();
    setupSmoothAnchorLinks();
    setupReveal();
    setupParallax();
    root.classList.add("ui-ready");
    requestFrame();
})();
