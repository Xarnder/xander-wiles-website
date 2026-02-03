/**
 * Auto Hide Page - Landing Page Logic
 * Handles animations and debug logging
 */

console.log("[Landing] Initializing script...");

document.addEventListener('DOMContentLoaded', () => {
    
    // Debug: Check if global header placeholder exists
    const navPlaceholder = document.getElementById('main-nav-placeholder');
    if (navPlaceholder) {
        console.log("[Landing] Global Nav Placeholder found.");
    } else {
        console.warn("[Landing] WARNING: Global Nav Placeholder NOT found.");
    }

    // --- Intersection Observer for Animations ---
    // This makes elements fade in as you scroll down
    const observerOptions = {
        threshold: 0.1, // Trigger when 10% of element is visible
        rootMargin: "0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                console.log(`[Landing] Element revealed: .${entry.target.classList[0]}`);
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.fade-in');
    
    if (animatedElements.length > 0) {
        console.log(`[Landing] Found ${animatedElements.length} elements to animate.`);
        animatedElements.forEach(el => observer.observe(el));
    } else {
        console.warn("[Landing] No elements found with class .fade-in");
    }

    // --- Smooth Scroll Debugging ---
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            console.log(`[Landing] Navigation clicked. Target: ${targetId}`);
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            } else if (targetId === '#') {
                // Handle empty hash (e.g., top of page)
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                console.error(`[Landing] Target element ${targetId} not found in DOM.`);
            }
        });
    });

    // --- Download Button Tracking (Mock) ---
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            // e.preventDefault(); // Remove this when you have a real URL
            console.log("[Landing] User clicked Download/Add to Chrome");
        });
    }

    console.log("[Landing] Initialization complete.");
});