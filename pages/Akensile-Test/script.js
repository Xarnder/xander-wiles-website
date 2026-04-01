document.addEventListener('DOMContentLoaded', () => {
    console.log("%c[Akensile Debug] Website Loaded Successfully", "color: #00ff00; font-weight: bold;");

    // ─────────────────────────────────────────────
    // 1. IMAGE DEBUGGING (WEBP CHECK)
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // 2. NAVIGATION DEBUG
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // 3. SCROLL REVEAL ANIMATION LOGIC
    // ─────────────────────────────────────────────
    const observerOptions = { threshold: 0.1 };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const fadeElements = document.querySelectorAll('.fade-in-up');
    if (fadeElements.length > 0) {
        fadeElements.forEach(el => observer.observe(el));
    }

    // ─────────────────────────────────────────────
    // 4. SCROLL-SCRUBBING IMAGE SEQUENCE
    // ─────────────────────────────────────────────

    // --- Configuration ---
    const SEQUENCE_CONFIG = {
        frameCount: 100,
        imagePath: 'assets/images/sequence/',
        imagePrefix: 'frame_',
        imageExtension: '.webp',
        // Pad frame numbers to 4 digits: frame_0001.webp
        padLength: 4
    };

    const canvas = document.getElementById('sequence-canvas');
    const stickyWrapper = document.querySelector('.scroll-sequence-sticky');
    const section = document.querySelector('.scroll-sequence-section');

    if (!canvas || !stickyWrapper || !section) {
        console.warn("[Akensile Debug] Scroll sequence elements not found — skipping.");
        return;
    }

    const ctx = canvas.getContext('2d');
    const frames = new Array(SEQUENCE_CONFIG.frameCount);
    let framesLoaded = 0;
    let sequenceReady = false;
    let currentFrameIndex = -1; // Track to avoid redundant redraws
    let isScrolling = false;

    /**
     * Build the file path for a given frame index (0-based).
     * e.g. index 0 → "assets/images/sequence/frame_0001.webp"
     */
    function getFramePath(index) {
        const num = String(index + 1).padStart(SEQUENCE_CONFIG.padLength, '0');
        return `${SEQUENCE_CONFIG.imagePath}${SEQUENCE_CONFIG.imagePrefix}${num}${SEQUENCE_CONFIG.imageExtension}`;
    }

    /**
     * Draw a frame onto the canvas using "cover" scaling logic.
     * This ensures the image fills the canvas without stretching,
     * replicating object-fit: cover behaviour on <canvas>.
     */
    function drawFrame(img) {
        if (!img || !img.complete || img.naturalWidth === 0) return;

        const cw = canvas.width;
        const ch = canvas.height;
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;

        // Calculate cover dimensions
        const scale = Math.max(cw / iw, ch / ih);
        const sw = iw * scale;
        const sh = ih * scale;
        const sx = (cw - sw) / 2;
        const sy = (ch - sh) / 2;

        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(img, sx, sy, sw, sh);
    }

    /**
     * Resize canvas to match its display size (for sharp rendering).
     */
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        // Reset scale for next drawFrame; we handle it manually
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Use raw pixel dimensions for drawFrame
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        // Re-draw the current frame at new size
        if (sequenceReady && currentFrameIndex >= 0 && frames[currentFrameIndex]) {
            drawFrame(frames[currentFrameIndex]);
        }
    }

    /**
     * Asynchronous preloader — loads all frames in the background.
     * Uses a concurrency limiter to avoid hammering the network.
     */
    function preloadFrames() {
        const CONCURRENCY = 6; // Max parallel downloads
        let nextToLoad = 0;

        function loadNext() {
            if (nextToLoad >= SEQUENCE_CONFIG.frameCount) return;

            const index = nextToLoad++;
            const img = new Image();
            img.src = getFramePath(index);

            img.onload = () => {
                frames[index] = img;
                framesLoaded++;

                if (framesLoaded === SEQUENCE_CONFIG.frameCount) {
                    onAllFramesLoaded();
                } else {
                    loadNext(); // Fill the slot with next download
                }
            };

            img.onerror = () => {
                console.warn(`[Akensile Sequence] Failed to load frame: ${getFramePath(index)}`);
                framesLoaded++;
                // Continue loading even if one frame fails
                if (framesLoaded === SEQUENCE_CONFIG.frameCount) {
                    onAllFramesLoaded();
                } else {
                    loadNext();
                }
            };
        }

        // Kick off initial batch
        for (let i = 0; i < Math.min(CONCURRENCY, SEQUENCE_CONFIG.frameCount); i++) {
            loadNext();
        }

        console.log(`%c[Akensile Sequence] Preloading ${SEQUENCE_CONFIG.frameCount} frames in background...`, "color: #8a00e6;");
    }

    /**
     * Called when every frame has been loaded into memory.
     */
    function onAllFramesLoaded() {
        sequenceReady = true;
        console.log("%c[Akensile Sequence] All frames loaded — canvas is ready!", "color: #00ff00; font-weight: bold;");

        // Trigger CSS fade-in
        stickyWrapper.classList.add('canvas-ready');

        // Render the first visible frame immediately
        updateFrame();
    }

    /**
     * Map scroll progress through the entire page to a frame index,
     * then render that frame.
     */
    function updateFrame() {
        if (!sequenceReady) return;

        const scrollTop = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        
        if (maxScroll <= 0) return;

        // Progress is 0 at the top, 1 at the bottom
        const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
        
        const frameIndex = Math.min(
            SEQUENCE_CONFIG.frameCount - 1,
            Math.floor(progress * SEQUENCE_CONFIG.frameCount)
        );

        // Only redraw if the frame actually changed
        if (frameIndex !== currentFrameIndex && frames[frameIndex]) {
            currentFrameIndex = frameIndex;
            drawFrame(frames[frameIndex]);
        }
    }

    /**
     * Throttled scroll handler using requestAnimationFrame.
     */
    function onScroll() {
        if (!isScrolling) {
            isScrolling = true;
            requestAnimationFrame(() => {
                updateFrame();
                isScrolling = false;
            });
        }
    }

    // --- Initialise ---
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('scroll', onScroll, { passive: true });

    // Start background preloading (the page is fully usable during this)
    preloadFrames();
});