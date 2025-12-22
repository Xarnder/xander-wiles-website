document.addEventListener('DOMContentLoaded', () => {
    console.log("%c[Akensile Debug] Website Loaded Successfully", "color: #00ff00; font-weight: bold;");

    // 1. Debugging Book Cover Image (WEBP CHECK)
    const bookImg = document.getElementById('book-cover-img');
    if (bookImg) {
        bookImg.onerror = function() {
            console.error("%c[Akensile Debug] ERROR: Book cover image not found!", "color: red; font-weight: bold;");
            console.warn("Please ensure you saved your book cover as 'book-cover.webp' inside the 'assets/images/' folder.");
        };
        bookImg.onload = function() {
            console.log("[Akensile Debug] Book cover image loaded.");
        };
    }

    // 2. Debugging New Feature Art Image (WEBP CHECK)
    const featureImg = document.getElementById('feature-art-img');
    if (featureImg) {
        featureImg.onerror = function() {
            console.error("%c[Akensile Debug] ERROR: Feature art image not found!", "color: red; font-weight: bold;");
            console.warn("Please add a large image named 'feature-art.webp' inside the 'assets/images/' folder.");
        };
        featureImg.onload = function() {
            console.log("[Akensile Debug] Feature art image loaded.");
        };
    }

    // 3. Debugging Global Nav Loader
    const navPlaceholder = document.getElementById('main-nav-placeholder');
    if (!navPlaceholder) {
        console.error("%c[Akensile Debug] ERROR: Nav placeholder <div> missing in HTML.", "color: red;");
    } else {
        setTimeout(() => {
            if (navPlaceholder.innerHTML.trim() === "") {
                console.warn("%c[Akensile Debug] WARNING: Nav placeholder is empty.", "color: orange;");
                console.warn("Ensure '/assets/js/nav-loader.js' exists and is fetching your header correctly.");
            } else {
                console.log("[Akensile Debug] Global Navigation loaded.");
            }
        }, 1000);
    }

    // 4. Scroll Reveal Animation Logic
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                console.log(`[Akensile Debug] Revealing element: ${entry.target.className}`);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const fadeElements = document.querySelectorAll('.fade-in-up');
    if(fadeElements.length > 0) {
        fadeElements.forEach(el => observer.observe(el));
    }
});