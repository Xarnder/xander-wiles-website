// assets/js/main.js
document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            const isVisible = navLinks.classList.contains('active');
            navLinks.classList.toggle('active');
            navToggle.setAttribute('aria-expanded', !isVisible);
        });
    }
});