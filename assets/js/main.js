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

    // --- 2. Progressive Image Loading for Profile Picture ---
    const profilePic = document.querySelector('.profile-picture');

    if (profilePic && profilePic.dataset.src) {
        console.log('DEBUG: Progressive image loader initiated.');
        
        const highResSrc = profilePic.dataset.src;
        console.log(`DEBUG: Attempting to load high-res image: ${highResSrc}`);
        
        // Create a temporary image in memory
        const tempImage = new Image();
        tempImage.src = highResSrc;

        // When the high-res image is fully downloaded...
        tempImage.onload = () => {
            console.log('DEBUG: High-resolution image has finished downloading.');
            // Replace the low-res 'src' with the high-res one
            profilePic.src = highResSrc;
            // Add the 'loaded' class to trigger the CSS transition (unblur)
            profilePic.classList.add('loaded');
            console.log('DEBUG: Image source updated and "loaded" class applied.');
        };
        
        // If there's an error loading the high-res image...
        tempImage.onerror = () => {
            console.error(`DEBUG: CRITICAL - Failed to load the high-resolution image from path: ${highResSrc}. Check if the file exists and the path is correct.`);
        };
    } else {
        console.log('DEBUG: No element with class ".profile-picture" and "data-src" attribute was found. Skipping progressive loader.');
    }
});