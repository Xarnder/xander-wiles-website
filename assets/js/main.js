// assets/js/main.js
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Mobile Navigation Menu ---
    const navToggle = document.querySelector('.nav-toggle');
    const mainNav = document.querySelector('.main-nav');

    if (navToggle && mainNav) {
        navToggle.addEventListener('click', (e) => {
            e.stopPropagation(); 
            mainNav.classList.toggle('active');
            document.body.classList.toggle('nav-open');
            const isActive = mainNav.classList.contains('active');
            navToggle.setAttribute('aria-expanded', isActive);
        });
    }

 // --- 2. Unblur Profile Picture After Load ---
    const profilePic = document.querySelector('.profile-picture');

    // This function adds the 'loaded' class to unblur the image.
    const unblurImage = () => {
        if (profilePic) {
            profilePic.classList.add('loaded');
            console.log('DEBUG: Profile picture is loaded, applying unblur effect.');
        }
    };

    if (profilePic) {
        // If the image is already loaded by the time the script runs (e.g., from cache)
        if (profilePic.complete) {
            unblurImage();
        } else {
            // Otherwise, wait for the 'load' event to fire.
            profilePic.addEventListener('load', unblurImage);
        }
    }
});