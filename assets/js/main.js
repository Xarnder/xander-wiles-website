// --- UPDATED: assets/js/main.js ---
// This file now handles scripts specific to the HOME PAGE, like the profile picture effect.
// The mobile navigation logic has been moved to nav-loader.js to ensure it runs AFTER the navigation is loaded.

document.addEventListener('DOMContentLoaded', () => {

    // --- Unblur Profile Picture After Load (for homepage) ---
    const profilePic = document.querySelector('.profile-picture');

    // This function adds the 'loaded' class to unblur the image.
    const unblurImage = () => {
        if (profilePic) {
            profilePic.classList.add('loaded');
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