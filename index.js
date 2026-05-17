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
