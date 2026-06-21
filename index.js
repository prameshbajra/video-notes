const nav = document.querySelector("[data-nav]");
const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = document.querySelectorAll(".nav-links a");

const setNavState = (open) => {
    if (!nav || !navToggle) return;
    nav.dataset.open = String(open);
    navToggle.setAttribute("aria-expanded", String(open));
};

const closeNav = () => setNavState(false);

if (nav && navToggle) {
    setNavState(false);
    navToggle.addEventListener("click", () => {
        const isOpen = nav.dataset.open === "true";
        setNavState(!isOpen);
    });

    navLinks.forEach((link) => {
        link.addEventListener("click", () => {
            if (window.innerWidth <= 900) closeNav();
        });
    });
}

window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeNav();
});

// ---- Install CTA: point each install link at the visitor's browser store ----
// HTML defaults to Chrome (works without JS); Firefox visitors get the AMO link.
const STORES = {
    chrome: {
        url: "https://chromewebstore.google.com/detail/video-notes/phgnkidiglnijkpmmdjcgdkekfoelcom",
        name: "Chrome",
    },
    firefox: {
        url: "https://addons.mozilla.org/firefox/addon/video-notes-for-youtube/",
        name: "Firefox",
    },
};

const installTarget = /firefox/i.test(navigator.userAgent) ? STORES.firefox : STORES.chrome;

document.querySelectorAll("[data-install]").forEach((link) => {
    link.href = installTarget.url;
});
document.querySelectorAll("[data-browser-name]").forEach((el) => {
    el.textContent = installTarget.name;
});
