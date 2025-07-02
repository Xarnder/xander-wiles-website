// assets/js/main.js
document.addEventListener('DOMContentLoaded', () => {
    const navToggle = document.querySelector('.nav-toggle');
    const mainNav = document.querySelector('.main-nav'); // The main <nav> container

    if (navToggle && mainNav) {
        navToggle.addEventListener('click', (e) => {
            // Stop the click from bubbling up to other elements
            e.stopPropagation(); 
            
            // Toggle the 'active' class on the main <nav> container
            mainNav.classList.toggle('active');
            
            // Toggle a class on the body to prevent scrolling
            document.body.classList.toggle('nav-open');
            
            // Update ARIA attribute for accessibility
            const isActive = mainNav.classList.contains('active');
            navToggle.setAttribute('aria-expanded', isActive);
        });
    }
});