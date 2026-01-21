/**
 * Sensory Experience Script
 * Handles canvas drawing and mouse proximity detection.
 */

console.log("DEBUG: Script started initialization.");

const canvas = document.getElementById('sensoryCanvas');
const ctx = canvas.getContext('2d');

let width, height;
let dots = [];
let animationFrameId;

// Configuration
// Configuration
let densityPercentage = 70; // Default 70%
// We map 1% - 100% to a spacing factor.
// High density = Low spacing. Low density = High Spacing.
// Let's define a range: Spacing 10px (Dense) to 100px (Sparse).
const MIN_SPACING = 10;
const MAX_SPACING = 150;

function getSpacingFromDensity(percentage) {
    // Invert percentage: 100% -> MIN_SPACING, 1% -> MAX_SPACING
    // Linear interpolation
    const p = percentage / 100;
    return MAX_SPACING - (p * (MAX_SPACING - MIN_SPACING));
}

let spacingFactor = getSpacingFromDensity(densityPercentage);

let lightRadius = 150; // How far the mouse 'light' reaches (px)
let maxDotSize = 2;   // Size of the dots in pixels

// Mouse State
let mouse = {
    x: -1000, // Start off screen
    y: -1000
};

// Initialization
function init() {
    console.log("DEBUG: Initializing canvas dimensions...");
    resize();
    createDots();
    animate();

    setupEventListeners();
}

function setupEventListeners() {
    // Window Resize
    window.addEventListener('resize', () => {
        console.log("DEBUG: Window resized.");
        resize();
        createDots();
    });

    // Mouse Movement
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    // Touch Support for Mobile
    window.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        mouse.x = touch.clientX;
        mouse.y = touch.clientY;
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        mouse.x = touch.clientX;
        mouse.y = touch.clientY;
    }, { passive: true });

    // Scroll to resize light radius
    window.addEventListener('wheel', (e) => {
        if (e.deltaY > 0) {
            lightRadius -= 15;
        } else {
            lightRadius += 15;
        }
        if (lightRadius < 20) lightRadius = 20;
        if (lightRadius > 800) lightRadius = 800;
    }, { passive: true });



    // Settings Modal Logic
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPopup = document.getElementById('settingsPopup');
    const closeSettings = document.getElementById('closeSettings');
    const updateSettingsBtn = document.getElementById('updateSettingsBtn');
    const densityInput = document.getElementById('densityInput');
    const densitySlider = document.getElementById('densitySlider');
    const sizeSlider = document.getElementById('sizeSlider');
    const sizeInput = document.getElementById('sizeInput');

    if (settingsBtn && settingsPopup) {
        // Open
        settingsBtn.addEventListener('click', () => {
            densityInput.value = densityPercentage;
            densitySlider.value = densityPercentage;
            sizeSlider.value = maxDotSize;
            sizeInput.value = maxDotSize;
            settingsPopup.classList.remove('hidden');
        });

        // Close
        const closeMenu = () => settingsPopup.classList.add('hidden');
        if (closeSettings) closeSettings.addEventListener('click', closeMenu);

        // Close on background click
        settingsPopup.addEventListener('click', (e) => {
            if (e.target === settingsPopup) closeMenu();
        });

        // Live Update Function
        const performLiveUpdate = () => {
            // Update Density
            let dVal = parseInt(densityInput.value);
            if (isNaN(dVal) || dVal < 1) dVal = 1;
            if (dVal > 100) dVal = 100;

            densityPercentage = dVal;
            spacingFactor = getSpacingFromDensity(densityPercentage);

            // Update Size
            let sVal = parseFloat(sizeInput.value);
            if (isNaN(sVal) || sVal < 0.1) sVal = 0.1;
            maxDotSize = sVal;

            createDots(); // Regenerate immediately
        };

        // Sync and Live Update Density
        if (densitySlider && densityInput) {
            densitySlider.addEventListener('input', () => {
                densityInput.value = densitySlider.value;
                performLiveUpdate();
            });
            densityInput.addEventListener('input', () => {
                densitySlider.value = densityInput.value;
                performLiveUpdate();
            });
        }

        // Sync and Live Update Size
        if (sizeSlider && sizeInput) {
            sizeSlider.addEventListener('input', () => {
                sizeInput.value = sizeSlider.value;
                performLiveUpdate();
            });
            sizeInput.addEventListener('input', () => {
                sizeSlider.value = sizeInput.value;
                performLiveUpdate();
            });
        }
    }
}

// Resize Canvas to Full Screen
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    console.log(`DEBUG: Canvas resized to ${width}x${height}`);
}

// Create Random Dots
function createDots() {
    dots = [];
    // Calculate number of dots based on screen area to maintain consistent density
    const area = width * height;
    const dotCount = Math.floor(area / (spacingFactor * spacingFactor));

    console.log(`DEBUG: Generating ${dotCount} dots (Density: ${densityPercentage}%, Spacing: ${spacingFactor.toFixed(1)}px).`);

    for (let i = 0; i < dotCount; i++) {
        dots.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * maxDotSize + 0.5 // Random size between 0.5 and maxDotSize + 0.5
        });
    }
}

// The Animation Loop
function animate() {
    // 1. Clear the screen (Paint it black)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);

    // 2. Loop through every dot
    for (let i = 0; i < dots.length; i++) {
        const d = dots[i];

        // Calculate distance between mouse and dot using Pythagorean theorem
        const dx = mouse.x - d.x;
        const dy = mouse.y - d.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 3. Check Proximity
        if (distance < lightRadius) {
            // Map distance to opacity (0 to 1)
            const opacity = 1 - (distance / lightRadius);

            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.fill();
        }
    }

    animationFrameId = requestAnimationFrame(animate);
}

// Start
try {
    init();
} catch (error) {
    console.error("DEBUG ERROR: Something went wrong during initialization:", error);
}