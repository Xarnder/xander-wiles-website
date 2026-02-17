document.addEventListener('DOMContentLoaded', () => {
    console.log('[Balanced Life] DOM fully loaded and parsed.');

    // Check if global nav loaded (Debug purpose)
    const navPlaceholder = document.getElementById('main-nav-placeholder');
    if (navPlaceholder) {
        console.log('[Balanced Life] Navigation placeholder found.');
    } else {
        console.warn('[Balanced Life] Navigation placeholder MISSING.');
    }

    // Animation Observer
    const observerOptions = {
        root: null, // viewport
        rootMargin: '0px',
        threshold: 0.1 // Trigger when 10% of element is visible
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                console.log(`[Balanced Life] Animating in: ${entry.target.querySelector('h2').innerText}`);
                entry.target.classList.add('fade-in-visible');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, observerOptions);

    // Target all cards
    const cards = document.querySelectorAll('.card');

    if (cards.length === 0) {
        console.error('[Balanced Life] No cards found! Check HTML structure.');
    } else {
        console.log(`[Balanced Life] Found ${cards.length} cards to animate.`);
        cards.forEach((card, index) => {
            // Add a slight delay based on index for a staggered effect
            card.style.transitionDelay = `${index * 100}ms`;
            observer.observe(card);

            // Audio Interaction
            card.addEventListener('click', () => {
                const audio = new Audio('assets/audio/bell.mp3');

                // Random playback rate between 0.5 and 1.5 for larger variation
                const randomRate = 0.5 + Math.random() * 1.0;

                // CRITICAL: Disable pitch preservation so speed change affects pitch
                if (audio.preservesPitch !== undefined) {
                    audio.preservesPitch = false;
                } else if (audio.webkitPreservesPitch !== undefined) {
                    audio.webkitPreservesPitch = false;
                } else if (audio.mozPreservesPitch !== undefined) {
                    audio.mozPreservesPitch = false;
                }

                audio.playbackRate = randomRate;

                // Important: Reset to start if already playing
                audio.currentTime = 0;
                audio.play().catch(err => console.warn('[Balanced Life] Audio play failed:', err));
            });
        });
    }

    // Resize Debugger
    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        if (width < 1024) {
            console.log(`[Balanced Life] Viewport: Mobile/Tablet (${width}px) - Stacked Layout`);
        } else {
            console.log(`[Balanced Life] Viewport: Desktop (${width}px) - Grid Layout`);
        }
    });
});