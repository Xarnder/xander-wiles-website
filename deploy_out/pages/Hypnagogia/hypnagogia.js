// Debug logging starts
console.log("🌌 Hypnagogia.js: Script successfully loaded.");

document.addEventListener("DOMContentLoaded", () => {
    console.log("🌌 Hypnagogia.js: DOM fully loaded and parsed. Initializing magical effects...");

    // Select all elements with the class 'hidden'
    const hiddenElements = document.querySelectorAll('.hidden');

    if (hiddenElements.length === 0) {
        console.warn("⚠️ Hypnagogia.js Warning: No elements with class 'hidden' found. Animations will not run.");
    } else {
        console.log(`🌌 Hypnagogia.js: Found ${hiddenElements.length} hidden elements. Setting up IntersectionObserver...`);
    }

    // Set up the Intersection Observer for scroll animations
    try {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('show');
                    console.log("🌌 Hypnagogia.js Debug: Element scrolled into view, adding 'show' class.");
                } else {
                    // Optional: Remove 'show' if you want it to fade out again when scrolling up
                    // entry.target.classList.remove('show'); 
                }
            });
        }, {
            threshold: 0.1 // Triggers when 10% of the element is visible
        });

        hiddenElements.forEach((el) => observer.observe(el));
        console.log("🌌 Hypnagogia.js: IntersectionObserver running successfully.");

    } catch (error) {
        console.error("❌ Hypnagogia.js Error: IntersectionObserver failed to initialize. Details:", error);
    }
});