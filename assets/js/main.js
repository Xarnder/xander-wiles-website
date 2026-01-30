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


    // --- Hidden Test Pages Toggle ---
    const toggleButton = document.getElementById('toggle-hidden-pages');
    const hiddenSection = document.getElementById('hidden-test-pages');

    if (toggleButton && hiddenSection) {
        toggleButton.addEventListener('click', () => {
            const isHidden = hiddenSection.style.display === 'none';
            hiddenSection.style.display = isHidden ? 'block' : 'none';
            toggleButton.textContent = isHidden ? 'Hide Hidden Test Pages' : 'Show Hidden Test Pages';

            // Optional: Scroll to the section when opening
            if (isHidden) {
                // hiddenSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
});