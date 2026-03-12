document.addEventListener("DOMContentLoaded", () => {
    console.log("App Initialization: DOM Loaded successfully.");

    // DOM Elements
    const cameraInput = document.getElementById('camera-input');
    const captureBtn = document.getElementById('capture-btn');
    const imageWorkspace = document.getElementById('image-workspace');
    const imageContainer = document.getElementById('image-container');
    const sourceImage = document.getElementById('source-image');
    const selectionBox = document.getElementById('selection-box');
    const resultsCard = document.getElementById('results-card');

    const colorSwatch = document.getElementById('color-swatch');
    const valHex = document.getElementById('val-hex');
    const valRgb = document.getElementById('val-rgb');
    const valHsv = document.getElementById('val-hsv');

    // Drag tracking variables
    let isDragging = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;

    // Trigger file input when capture button is clicked
    captureBtn.addEventListener('click', () => {
        console.log("User Action: Camera/Upload button clicked.");
        cameraInput.click();
    });

    // Handle Image Upload / Capture
    cameraInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            console.warn("Upload Warning: No file was selected.");
            return;
        }

        console.log(`Upload Success: File selected. Name: ${file.name}, Type: ${file.type}, Size: ${file.size} bytes`);

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log("File Reader: File loaded into memory. Setting as image source.");
            sourceImage.src = e.target.result;
            imageWorkspace.style.display = 'flex';
            resultsCard.style.display = 'none'; // Hide until area selected
            selectionBox.style.display = 'none'; // Reset box
        };
        reader.onerror = (e) => {
            console.error("File Reader Error: Failed to read file.", e);
        };
        reader.readAsDataURL(file);
    });

    // ==========================================
    // Interaction Logic (Touch & Mouse Dragging)
    // ==========================================

    function getPointerCoordinates(e) {
        // Handle both Mobile Touch events and Desktop Mouse events
        const rect = imageContainer.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            // Needed for touchend
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        }

        // Calculate relative coordinates within the image container
        let x = clientX - rect.left;
        let y = clientY - rect.top;

        // Clamp values so selection doesn't exceed image boundaries
        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        return { x, y };
    }

    function onDragStart(e) {
        console.log("Interaction Start: User started dragging/touching.");
        isDragging = true;
        const coords = getPointerCoordinates(e);
        startX = coords.x;
        startY = coords.y;

        selectionBox.style.left = startX + 'px';
        selectionBox.style.top = startY + 'px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'block';
    }

    function onDragMove(e) {
        if (!isDragging) return;

        // Prevent default only if we are actively dragging (stops page scroll on mobile)
        if (e.cancelable) e.preventDefault();

        const coords = getPointerCoordinates(e);
        currentX = coords.x;
        currentY = coords.y;

        // Calculate geometry allowing dragging in any direction
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        const left = Math.min(currentX, startX);
        const top = Math.min(currentY, startY);

        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
    }

    function onDragEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        console.log("Interaction End: User finished dragging.");

        const coords = getPointerCoordinates(e);
        const left = Math.min(coords.x, startX);
        const top = Math.min(coords.y, startY);
        let width = Math.abs(coords.x - startX);
        let height = Math.abs(coords.y - startY);

        // If the user just tapped without dragging, make it a 10x10 pixel box automatically
        if (width === 0 || height === 0) {
            console.log("Interaction Note: User tapped instead of dragged. Creating default selection.");
            width = 10;
            height = 10;
        }

        processSelectedArea(left, top, width, height);
    }

    // Attach Event Listeners
    // Touch Events (Mobile)
    imageContainer.addEventListener('touchstart', onDragStart, { passive: false });
    imageContainer.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);

    // Mouse Events (Desktop Fallback)
    imageContainer.addEventListener('mousedown', onDragStart);
    imageContainer.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);


    // ==========================================
    // Color Processing Logic
    // ==========================================

    function processSelectedArea(left, top, width, height) {
        console.log(`Processing Area: left: ${left}, top: ${top}, w: ${width}, h: ${height}`);

        // The visible image width/height differs from actual file width/height.
        // We calculate the scale ratio to map the screen selection coordinates to the actual image pixels.
        const displayedRect = sourceImage.getBoundingClientRect();

        // Prevent divide by zero if image is hidden
        if (displayedRect.width === 0 || displayedRect.height === 0) {
            console.error("Processing Error: Image display size is 0.");
            return;
        }

        const scaleX = sourceImage.naturalWidth / displayedRect.width;
        const scaleY = sourceImage.naturalHeight / displayedRect.height;

        const actualX = Math.round(left * scaleX);
        const actualY = Math.round(top * scaleY);
        const actualWidth = Math.round(width * scaleX);
        const actualHeight = Math.round(height * scaleY);

        console.log(`Mapped Actual Image Area: x: ${actualX}, y: ${actualY}, w: ${actualWidth}, h: ${actualHeight}`);

        // Create an invisible canvas memory object to grab the raw image data
        const canvas = document.createElement('canvas');
        canvas.width = actualWidth;
        canvas.height = actualHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Draw ONLY the cropped section of the original image onto the canvas
        try {
            ctx.drawImage(
                sourceImage,
                actualX, actualY, actualWidth, actualHeight, // Source slice
                0, 0, actualWidth, actualHeight              // Destination canvas position
            );
        } catch (err) {
            console.error("Canvas Error: Failed to draw image to canvas.", err);
            return;
        }

        // Extract pixel data array:[R, G, B, A, R, G, B, A, ...]
        let imageData;
        try {
            imageData = ctx.getImageData(0, 0, actualWidth, actualHeight).data;
        } catch (err) {
            console.error("Canvas Security Error: Unable to read pixels.", err);
            return;
        }

        let rSum = 0, gSum = 0, bSum = 0;
        const pixelCount = actualWidth * actualHeight;

        // Loop through array stepping by 4 (RGBA)
        for (let i = 0; i < imageData.length; i += 4) {
            rSum += imageData[i];       // Red
            gSum += imageData[i + 1];   // Green
            bSum += imageData[i + 2];   // Blue
        }

        const avgR = Math.round(rSum / pixelCount);
        const avgG = Math.round(gSum / pixelCount);
        const avgB = Math.round(bSum / pixelCount);

        console.log(`Success: Average RGB calculated: (${avgR}, ${avgG}, ${avgB})`);

        updateUI(avgR, avgG, avgB);
    }

    // ==========================================
    // Conversion & UI Update
    // ==========================================

    function updateUI(r, g, b) {
        // Convert RGB to HEX
        const hex = rgbToHex(r, g, b);

        // Convert RGB to HSV
        const hsv = rgbToHsv(r, g, b);

        // Display Data
        resultsCard.style.display = 'block';
        colorSwatch.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        valHex.textContent = hex;
        valRgb.textContent = `${r}, ${g}, ${b}`;
        valHsv.textContent = `${hsv[0]}°, ${hsv[1]}%, ${hsv[2]}%`;

        console.log(`UI Updated -> HEX: ${hex} | HSV: ${hsv[0]}, ${hsv[1]}, ${hsv[2]}`);
    }

    function rgbToHex(r, g, b) {
        // Convert base-10 R, G, B to Base-16 strings and pad them.
        return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
    }

    function rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;

        s = max === 0 ? 0 : d / max;

        if (max === min) {
            h = 0; // Grayscale / Achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [Math.round(h * 360), Math.round(s * 100), Math.round(v * 100)];
    }
});