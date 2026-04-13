// Configuration
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
let modelsLoaded = false;
let processedBlobs = [];
let loadedFiles = []; // Store files for deferred processing
let firstImageCache = null; // Cache for the first image
let firstFaceBox = null; // Cache for the detected face box
let currentMode = 'crop'; // 'crop' or 'censor'
let currentCensorType = 'solid'; // 'solid' or 'blur'
let currentCensorShape = 'rect'; // 'rect' or 'circle'
let censorColor = '#000000';
let censorEmoji = '🕶️';
let blurStrength = 20;

// Manual Crop Globals
let cropperInstance = null;
let editingBlobIndex = -1;

// Elements
const imageInput = document.getElementById('imageInput');
const paddingInput = document.getElementById('paddingInput');
const paddingValDisplay = document.getElementById('paddingVal');
const ratioWidthInput = document.getElementById('ratioWidth');
const ratioHeightInput = document.getElementById('ratioHeight');
const useOriginalRatioInput = document.getElementById('useOriginalRatio');
const statusArea = document.getElementById('statusArea');
const gallery = document.getElementById('gallery');
const galleryStatus = document.getElementById('galleryStatus');
const downloadBtn = document.getElementById('downloadBtn');
const processBtn = document.getElementById('processBtn');
const dropZone = document.getElementById('dropZone');
const imageCounter = document.getElementById('imageCounter');
const previewCard = document.getElementById('previewCard');
const previewCanvas = document.getElementById('previewCanvas');
const previewLoader = document.getElementById('previewLoader');
const verticalPosInput = document.getElementById('verticalPosInput');
const verticalPosVal = document.getElementById('verticalPosVal');
const presetBtns = document.querySelectorAll('.preset-btn');
const modeBtns = document.querySelectorAll('.mode-btn');

// Advanced Censor Elements
const censorOptionsPanel = document.getElementById('censorOptionsPanel');
const typeBtns = document.querySelectorAll('.type-btn');
const shapeBtns = document.querySelectorAll('.shape-btn');
const solidOptions = document.getElementById('solidOptions');
const blurOptions = document.getElementById('blurOptions');
const emojiOptions = document.getElementById('emojiOptions');
const censorColorInput = document.getElementById('censorColor');
const colorHexDisplay = document.getElementById('colorHex');
const blurStrengthInput = document.getElementById('blurStrength');
const blurStrengthVal = document.getElementById('blurStrengthVal');
const censorEmojiInput = document.getElementById('censorEmoji');

// Edit Crop Elements
const editCropModal = document.getElementById('editCropModal');
const editCropImage = document.getElementById('editCropImage');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const saveCropBtn = document.getElementById('saveCropBtn');

// Debug Logger
function log(message, type = 'info') {
    statusArea.textContent = message;
    const style = type === 'error' ? 'color: red; background: #fff0f0;' : 'color: #bada55; background: #222;';
    console.log(`%c[FaceCrop] ${message}`, style);
}

// 1. Initialize AI Models
async function loadModels() {
    try {
        log("Loading AI Models...");
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        modelsLoaded = true;
        log("AI Models Ready. Please select a folder.");
    } catch (error) {
        console.error(error);
        log("Error loading AI models. Check console.", "error");
    }
}

// 2. Handle Inputs
paddingInput.addEventListener('input', (e) => {
    paddingValDisplay.textContent = e.target.value;
    if (firstImageCache && firstFaceBox) {
        updatePreviewCanvas();
    }
});

function handleRatioChange() {
    // Clear active presets if manual input is changed
    // We check if the event caller was a preset btn to avoid circular logic
    if (firstImageCache && firstFaceBox) {
        updatePreviewCanvas();
    }
}

ratioWidthInput.addEventListener('input', () => {
    presetBtns.forEach(b => b.classList.remove('active'));
    handleRatioChange();
});
ratioHeightInput.addEventListener('input', () => {
    presetBtns.forEach(b => b.classList.remove('active'));
    handleRatioChange();
});

useOriginalRatioInput.addEventListener('change', (e) => {
    const disabled = e.target.checked;
    ratioWidthInput.disabled = disabled;
    ratioHeightInput.disabled = disabled;
    presetBtns.forEach(btn => btn.disabled = disabled);
    handleRatioChange();
});

verticalPosInput.addEventListener('input', (e) => {
    verticalPosVal.textContent = e.target.value;
    if (firstImageCache && firstFaceBox) {
        updatePreviewCanvas();
    }
});

presetBtns.forEach(btn => {
    if (btn.dataset.w === "1" && btn.dataset.h === "1") {
        btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ratioWidthInput.value = btn.dataset.w;
        ratioHeightInput.value = btn.dataset.h;
        handleRatioChange();
    });
});

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        log(`Switched to ${currentMode} mode.`);
        
        // Show/Hide advanced censor options
        if (censorOptionsPanel) {
            censorOptionsPanel.style.display = currentMode === 'censor' ? 'block' : 'none';
        }

        if (firstImageCache && firstFaceBox) {
            updatePreviewCanvas();
        }
    });
});

// Advanced Censor Listeners
typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        typeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCensorType = btn.dataset.type;
        
        solidOptions.style.display = currentCensorType === 'solid' ? 'block' : 'none';
        blurOptions.style.display = currentCensorType === 'blur' ? 'block' : 'none';
        emojiOptions.style.display = currentCensorType === 'emoji' ? 'block' : 'none';
        
        if (firstImageCache && firstFaceBox) updatePreviewCanvas();
    });
});

censorEmojiInput.addEventListener('input', (e) => {
    censorEmoji = e.target.value;
    if (firstImageCache && firstFaceBox) updatePreviewCanvas();
});

shapeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        shapeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCensorShape = btn.dataset.shape;
        if (firstImageCache && firstFaceBox) updatePreviewCanvas();
    });
});

censorColorInput.addEventListener('input', (e) => {
    censorColor = e.target.value;
    colorHexDisplay.textContent = censorColor.toUpperCase();
    if (firstImageCache && firstFaceBox) updatePreviewCanvas();
});

blurStrengthInput.addEventListener('input', (e) => {
    blurStrength = parseInt(e.target.value);
    blurStrengthVal.textContent = blurStrength;
    if (firstImageCache && firstFaceBox) updatePreviewCanvas();
});

imageInput.addEventListener('change', async (e) => {
    handleNewFiles(e.target.files);
});

const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        handleNewFiles(e.target.files);
    });
}

// Drag and Drop Logic
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    handleNewFiles(files);
});

async function handleNewFiles(fileList) {
    if (!modelsLoaded) {
        alert("Please wait for AI models to load.");
        return;
    }

    const newFiles = Array.from(fileList);
    const validExtensions = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const validFiles = newFiles.filter(file => validExtensions.includes(file.type));

    if (validFiles.length === 0) {
        if (loadedFiles.length === 0) alert("No valid images found.");
        return;
    }

    // Append to existing
    loadedFiles = [...loadedFiles, ...validFiles];

    // Reset UI slightly (but don't clear everything if we are appending!)
    // If we want to allow "Process" to run on the WHOLE batch:
    downloadBtn.disabled = true;
    processBtn.disabled = false;
    processBtn.innerText = `Process ${loadedFiles.length} Images`;

    updateCounter();

    // If we haven't set up a preview yet, try to do it with new files
    if (!firstImageCache) {
        log(`Analyzing new images for preview...`);
        // Only scan the NEW files for a preview if needed, or scan all?
        // Scanning validFiles is enough if we just want A preview.
        await setupPreview(validFiles);
    } else {
        log(`${validFiles.length} images added. Total: ${loadedFiles.length}`);
    }
}

function updateCounter() {
    imageCounter.textContent = `${loadedFiles.length} images ready`;
}

processBtn.addEventListener('click', async () => {
    if (loadedFiles.length === 0) return;

    processBtn.disabled = true;
    // Don't hide preview! previewCard.style.display = 'none'; 

    gallery.innerHTML = ''; // Clear prior results
    if (galleryStatus) galleryStatus.textContent = ''; // Clear status message
    processedBlobs = [];

    // Force space for scrolling (simulating ~3 rows) so valid scroll target exists
    gallery.style.minHeight = '800px';

    // Smooth scroll to the gallery area where results will appear
    setTimeout(() => {
        gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    log(`Starting batch processing for ${loadedFiles.length} images...`);

    let processedCount = 0;
    const usedNames = new Set();

    for (const file of loadedFiles) {


        try {
            // Unique Name Generation - moved inside loop
            let baseName = file.name;
            let uniqueName = baseName;
            let counter = 1;
            const parts = baseName.split('.');
            const ext = parts.length > 1 ? parts.pop() : '';
            const nameNoExt = parts.join('.');

            // Check against both usedNames set AND previously processed names to be safe?
            // actually just usedNames set is cleared at start of processBtn click??
            // NO, we want to allow accumulative processing? 
            // "allow the user to keep drainging in new images" -> usually implies we process ALL of them.
            // But if I already processed some, should I re-process them? 
            // The user probably wants to add more, then click process.
            // So `processedBlobs` is cleared on processBtn click, implying a fresh batch run.
            // That's fine.

            while (usedNames.has(uniqueName)) {
                uniqueName = `${nameNoExt}_${counter}.${ext}`;
                counter++;
            }
            usedNames.add(uniqueName);

            // Process and ADD to batch
            await processImage(file, uniqueName);
        } catch (err) {
            console.error(`Failed to process ${file.name}:`, err);
            createErrorCard(file.name);
        }
        processedCount++;
        statusArea.textContent = `Processing: ${processedCount} / ${loadedFiles.length}`;
    }

    log("Batch Processing Complete!");
    downloadBtn.disabled = false;
    processBtn.disabled = false;
    processBtn.innerText = "Process Again";

    // Dynamic Gallery AR Logic
    const ratios = processedBlobs.map(b => b.outputWidth / b.outputHeight);
    if (ratios.length > 0) {
        const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        // Check if all ratios are within 5% of the average
        const allSimilar = ratios.every(r => Math.abs(r - avg) / avg <= 0.05);
        if (allSimilar) {
            gallery.style.setProperty('--gallery-ar', avg);
            if (galleryStatus) {
                const shape = avg > 1.1 ? "Landscape" : (avg < 0.9 ? "Portrait" : "Square");
                galleryStatus.textContent = `✨ Detected uniform ${shape} aspect ratio. Layout adjusted.`;
            }
        } else {
            gallery.style.removeProperty('--gallery-ar');
            if (galleryStatus) galleryStatus.textContent = "Mixed aspect ratios detected. Using standard square grid.";
        }
    }

    // Restore preview so user can adjust and re-run
    previewCard.style.display = 'block';
});

// 3. Core Logic for Batch
async function processImage(file, uniqueName) {
    let img;
    try {
        img = await faceapi.bufferToImage(file);
    } catch (e) {
        console.warn("Could not decode image", file.name);
        return;
    }

    const detections = await faceapi.detectAllFaces(img);

    let box;
    let isError = false;

    if (!detections || detections.length === 0) {
        console.warn(`No face detected in ${file.name}, using full image.`);
        // Fallback to full image
        box = { x: 0, y: 0, width: img.width, height: img.height };
        isError = true;
    } else {
        // Sort by area (largest face)
        const largestFace = detections.sort((a, b) => {
            const areaA = a.box.width * a.box.height;
            const areaB = b.box.width * b.box.height;
            return areaB - areaA;
        })[0];
        box = largestFace.box;
    }

    let x, y, width, height;

    if (isError) {
        // Use full image
        x = 0;
        y = 0;
        width = img.width;
        height = img.height;
    } else {
        // Calculate Padding
        const paddingPercent = parseInt(paddingInput.value) / 100;
        const padX = box.width * paddingPercent;
        const padY = box.height * paddingPercent;

        // Base crop box (Face + Padding)
        let cx = Math.max(0, box.x - padX);
        let cy = Math.max(0, box.y - padY);
        let cw = Math.min(img.width - cx, box.width + (padX * 2));
        let ch = Math.min(img.height - cy, box.height + (padY * 2));

        // Aspect Ratio Adjustment
        let targetRatio;
        if (useOriginalRatioInput.checked) {
            targetRatio = img.width / img.height;
        } else {
            const rW = parseFloat(ratioWidthInput.value) || 1;
            const rH = parseFloat(ratioHeightInput.value) || 1;
            targetRatio = rW / rH;
        }

        const currentRatio = cw / ch;

        // Adjust dimensions to meet target ratio completely within image bounds if possible,
        // or by expanding relevant dimension.
        // Strategy: Expand the crop box to match ratio, centered on the current crop box.

        let targetW, targetH;

        if (currentRatio > targetRatio) {
            // Current is wider than target. Need to increase height (or decrease width, but we prefer expanding context)
            // Let's hold width constant and increase height
            targetW = cw;
            targetH = cw / targetRatio;
        } else {
            // Current is taller than target. Need to increase width
            targetH = ch;
            targetW = ch * targetRatio;
        }

        // Center the new dimensions on the old center
        const centerX = cx + cw / 2;
        const centerY = cy + ch / 2;

        x = centerX - targetW / 2;
        y = centerY - targetH / 2;
        width = targetW;
        height = targetH;

        // Ensure bounds validation (might break ratio if image is too small,
        // effectively similar to 'contain' logic but we want to crop)
        // For simplicity, we just clamp and crop what we can, but ideally we'd shrink if out of bounds.
        // A better approach for strict ratio is to shrink the box if it goes out of bounds.

        // 1. Check if width is too big
        if (width > img.width) {
            width = img.width;
            height = width / targetRatio;
            x = (img.width - width) / 2;
        }

        // 2. Check if height is too big
        if (height > img.height) {
            height = img.height;
            width = height * targetRatio;
            // If height was forced to shrink, we should re-center or at least keep within image
            // We'll handle y clamp below anyway.
        }

        // Apply Vertical Position
        const verticalPosPercent = (parseInt(document.getElementById('verticalPosInput').value) || 50) / 100;
        const faceCenterY = box.y + box.height / 2;
        const faceCenterX = box.x + box.width / 2;

        x = faceCenterX - width / 2;
        y = faceCenterY - (height * verticalPosPercent);

        // 3. Clamp positions AND Re-adjust if out of bounds (to preserve ratio)
        // If x is < 0, we shift it right, if x + width > img.width, we shift it left.
        // Same for y.
        
        x = Math.max(0, Math.min(x, img.width - width));
        y = Math.max(0, Math.min(y, img.height - height));
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (currentMode === 'censor') {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        drawCensor(ctx, x, y, width, height, {
            type: currentCensorType,
            shape: currentCensorShape,
            color: censorColor,
            blur: blurStrength,
            emoji: censorEmoji
        }, img);
    } else {
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
    }

    // Save to blob list for ZIP
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            if (blob) {
                const prefix = currentMode === 'censor' ? 'censored_' : 'cropped_';
                processedBlobs.push({
                    name: `${prefix}${uniqueName}`,
                    blob: blob,
                    isError: isError,
                    originalFile: file,
                    outputWidth: currentMode === 'censor' ? img.width : width,
                    outputHeight: currentMode === 'censor' ? img.height : height,
                    cropWidth: width,
                    cropHeight: height,
                    cropX: x,
                    cropY: y,
                    mode: currentMode,
                    censorType: currentCensorType,
                    censorShape: currentCensorShape,
                    censorColor: censorColor,
                    censorEmoji: censorEmoji,
                    blurStrength: blurStrength,
                    targetRatio: useOriginalRatioInput.checked ? NaN : ((parseFloat(ratioWidthInput.value)||1)/(parseFloat(ratioHeightInput.value)||1))
                });
                displayResult(canvas.toDataURL(), isError);
            }
            resolve();
        }, 'image/jpeg', 0.95);
    });
}

// 4. Preview Logic (Optimized)
// 4. Preview Logic (Optimized)
// 4. Preview Logic (Optimized)
async function setupPreview(filesToScan = loadedFiles) {
    log("Searching for a valid preview image...");

    // Show preview card with loader immediately
    previewCard.style.display = 'block';
    if (previewLoader) previewLoader.style.display = 'flex';
    // Clear previous canvas if any, or leave it? Clearing is better to show "working"
    // previewCanvas.getContext('2d').clearRect(0, 0, previewCanvas.width, previewCanvas.height); 
    // Actually, keep old one if appending? But user expects feedback for new batch.

    // Tiny delay to allow UI to render spinner before heavy blocking task
    await new Promise(r => setTimeout(r, 50));

    for (const file of filesToScan) {
        try {
            const img = await faceapi.bufferToImage(file);
            const detections = await faceapi.detectAllFaces(img);

            if (detections && detections.length > 0) {
                // Found a face!
                firstImageCache = img;

                const largestFace = detections.sort((a, b) => {
                    const areaA = a.box.width * a.box.height;
                    const areaB = b.box.width * b.box.height;
                    return areaB - areaA;
                })[0];

                firstFaceBox = largestFace.box;

                const title = previewCard.querySelector('h3');
                if (title) title.innerText = `Preview (${file.name})`;

                updatePreviewCanvas();
                log(`Preview ready using ${file.name}. Adjust padding or Start Processing.`);

                // Hide loader
                if (previewLoader) previewLoader.style.display = 'none';
                return; // Stop searching
            }
        } catch (err) {
            console.warn(`Could not check ${file.name} for preview`, err);
        }
    }

    log("No faces detected in any of the uploaded images.", "error");
    if (previewLoader) previewLoader.style.display = 'none';
}

function updatePreviewCanvas() {
    if (!firstImageCache || !firstFaceBox) return;

    const box = firstFaceBox;
    const paddingPercent = parseInt(paddingInput.value) / 100;

    const padX = box.width * paddingPercent;
    const padY = box.height * paddingPercent;

    // Base crop
    let cx = Math.max(0, box.x - padX);
    let cy = Math.max(0, box.y - padY);
    let cw = Math.min(firstImageCache.width - cx, box.width + (padX * 2));
    let ch = Math.min(firstImageCache.height - cy, box.height + (padY * 2));

    // Aspect Ratio Logic (Shared with processImage)
    let targetRatio;
    if (useOriginalRatioInput.checked) {
        targetRatio = firstImageCache.width / firstImageCache.height;
    } else {
        const rW = parseFloat(ratioWidthInput.value) || 1;
        const rH = parseFloat(ratioHeightInput.value) || 1;
        targetRatio = rW / rH;
    }

    const currentRatio = cw / ch;
    let targetW, targetH;

    if (currentRatio > targetRatio) {
        targetW = cw;
        targetH = cw / targetRatio;
    } else {
        targetH = ch;
        targetW = ch * targetRatio;
    }

    const centerX = cx + cw / 2;
    const centerY = cy + ch / 2;

    let x = centerX - targetW / 2;
    let y = centerY - targetH / 2;
    let width = targetW;
    let height = targetH;

    // Bounds Checks
    if (width > firstImageCache.width) {
        width = firstImageCache.width;
        height = width / targetRatio;
    }
    if (height > firstImageCache.height) {
        height = firstImageCache.height;
        width = height * targetRatio;
    }

    // Apply Vertical Position
    const vPos = (parseInt(verticalPosInput.value) || 50) / 100;
    const faceCenterY = box.y + box.height / 2;
    const faceCenterX = box.x + box.width / 2;

    x = faceCenterX - width / 2;
    y = faceCenterY - (height * vPos);

    // Final Clamping
    x = Math.max(0, Math.min(x, firstImageCache.width - width));
    y = Math.max(0, Math.min(y, firstImageCache.height - height));


    previewCanvas.width = (currentMode === 'censor') ? firstImageCache.width : width;
    previewCanvas.height = (currentMode === 'censor') ? firstImageCache.height : height;
    const ctx = previewCanvas.getContext('2d');

    if (currentMode === 'censor') {
        ctx.drawImage(firstImageCache, 0, 0);
        drawCensor(ctx, x, y, width, height, {
            type: currentCensorType,
            shape: currentCensorShape,
            color: censorColor,
            blur: blurStrength,
            emoji: censorEmoji
        }, firstImageCache);
    } else {
        ctx.drawImage(firstImageCache, x, y, width, height, 0, 0, width, height);
    }
}

// 5. Lightbox Logic
let currentLightboxIndex = 0;
let currentZoom = 1;

const lightboxModal = document.getElementById('lightboxModal');
const lightboxImage = document.getElementById('lightboxImage');
const closeLightboxBtn = document.getElementById('closeLightbox');
const prevSlideBtn = document.getElementById('prevSlide');
const nextSlideBtn = document.getElementById('nextSlide');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomLevelDisplay = document.getElementById('zoomLevel');

function updateZoomUI() {
    lightboxImage.style.transform = `scale(${currentZoom})`;
    zoomLevelDisplay.innerText = `${Math.round(currentZoom * 100)}%`;
}

function adjustZoom(delta) {
    currentZoom += delta;
    if (currentZoom < 0.1) currentZoom = 0.1;
    if (currentZoom > 5) currentZoom = 5;
    updateZoomUI();
}

function resetZoom() {
    currentZoom = 1;
    updateZoomUI();
}

function openLightbox(index) {
    if (index < 0 || index >= processedBlobs.length) return;

    // Skip if current item has no blob/url (shouldn't happen but safe guard)
    // Actually we need the DataURL. `processedBlobs` has `blob`. We need to create URL or store it.
    // Optimization: We are storing blob. Let's create an ObjectURL or find the image in DOM.
    // Better: use the index to find the image in `gallery` children, or regenerate URL.
    // Since `gallery` has `img` tags with `src` as DataURL, we can use that!

    const galleryItems = gallery.querySelectorAll('.image-card img');
    if (!galleryItems[index]) return;

    currentLightboxIndex = index;
    lightboxImage.src = galleryItems[index].src;
    lightboxModal.style.display = "flex";
    resetZoom(); // Reset zoom when opening
}

function closeLightbox() {
    lightboxModal.style.display = "none";
}

function changeSlide(step) {
    let newIndex = currentLightboxIndex + step;
    const total = processedBlobs.length;

    // Wrap around
    if (newIndex >= total) newIndex = 0;
    if (newIndex < 0) newIndex = total - 1;

    openLightbox(newIndex);
}

// Check if image is valid for lightbox (e.g. not an error with no image, though we show full image for error now)
// Our logic uses gallery DOM, so if it's there it works.

// Event Listeners
closeLightboxBtn.onclick = closeLightbox;
prevSlideBtn.onclick = (e) => { e.stopPropagation(); changeSlide(-1); };
nextSlideBtn.onclick = (e) => { e.stopPropagation(); changeSlide(1); };

zoomInBtn.onclick = (e) => { e.stopPropagation(); adjustZoom(0.25); };
zoomOutBtn.onclick = (e) => { e.stopPropagation(); adjustZoom(-0.25); };

// Close on background click
lightboxModal.onclick = (e) => {
    if (e.target === lightboxModal) {
        closeLightbox();
    }
};

// Keyboard Nav
document.addEventListener('keydown', (e) => {
    if (lightboxModal.style.display === "flex") {
        if (e.key === "ArrowLeft") changeSlide(-1);
        if (e.key === "ArrowRight") changeSlide(1);
        if (e.key === "ArrowUp") { e.preventDefault(); adjustZoom(0.25); }
        if (e.key === "ArrowDown") { e.preventDefault(); adjustZoom(-0.25); }
        if (e.key === "Escape") closeLightbox();
    }
});


// 6. UI Helpers
function displayResult(dataUrl, isError = false) {
    const div = document.createElement('div');
    div.className = 'image-card';
    if (isError) {
        div.classList.add('error-border');
    }
    const img = document.createElement('img');
    img.src = dataUrl;

    const index = processedBlobs.length - 1;
    
    // Add Click to Open Lightbox
    img.onclick = (e) => {
        e.stopPropagation();
        openLightbox(index);
    };
    img.style.cursor = "pointer";
    div.appendChild(img);

    // Edit Button
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-overlay-btn';
    editBtn.title = "Edit Crop";
    editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
    editBtn.onclick = (e) => {
        e.stopPropagation();
        openEditModal(index);
    };
    div.appendChild(editBtn);

    gallery.appendChild(div);
}

function createErrorCard(msg) {
    const div = document.createElement('div');
    div.className = 'image-card error-card';
    div.innerText = msg;
    gallery.appendChild(div);
}

// 7. Download Handling (Zip)
downloadBtn.addEventListener('click', () => {
    if (processedBlobs.length === 0) return;

    const excludeNoFace = document.getElementById('excludeNoFace').checked;
    const zip = new JSZip();

    let count = 0;
    processedBlobs.forEach(item => {
        if (excludeNoFace && item.isError) {
            return; // Skip this file
        }
        zip.file(item.name, item.blob);
        count++;
    });

    if (count === 0) {
        alert(`No valid ${currentMode === 'censor' ? 'censored' : 'cropped'} images to download!`);
        return;
    }

    log(`Zipping ${count} files...`);

    zip.generateAsync({ type: "blob" })
        .then(function (content) {
            // Use FileSaver.js for better cross-browser/mobile support
            saveAs(content, `${currentMode === 'censor' ? 'censored' : 'cropped'}_faces.zip`);
            log("Download started.");
        });
});

// 8. Manual Crop Editing Logic
function openEditModal(index) {
    const data = processedBlobs[index];
    if (!data || !data.originalFile) return;

    editingBlobIndex = index;
    const objectUrl = URL.createObjectURL(data.originalFile);
    
    editCropImage.src = objectUrl;
    editCropModal.style.display = 'flex';

    editCropImage.onload = () => {
        if (cropperInstance) {
            cropperInstance.destroy();
        }

        cropperInstance = new Cropper(editCropImage, {
            viewMode: 1, // Restrict crop box to not exceed canvas
            dragMode: 'move', // Allow moving image
            aspectRatio: data.targetRatio, // Preserve selected ratio (or NaN if free)
            autoCropArea: 1,
            ready() {
                // If it was already cropped successfully (or even if it was error, we default to full image crop box)
                if (data.cropWidth && data.cropHeight) {
                     cropperInstance.setData({
                         x: data.cropX,
                         y: data.cropY,
                         width: data.cropWidth,
                         height: data.cropHeight
                     });
                }
            }
        });
    };
}

function closeEditModal() {
    editCropModal.style.display = 'none';
    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
    editCropImage.src = '';
    editingBlobIndex = -1;
}

if (cancelCropBtn) cancelCropBtn.addEventListener('click', closeEditModal);

if (saveCropBtn) {
    saveCropBtn.addEventListener('click', async () => {
        if (!cropperInstance || editingBlobIndex < 0) return;

        saveCropBtn.disabled = true;
        saveCropBtn.innerText = "Saving...";

        const data = processedBlobs[editingBlobIndex];
        const cropData = cropperInstance.getData();
        
        // Update new crop rect info
        data.cropX = cropData.x;
        data.cropY = cropData.y;
        data.cropWidth = cropData.width;
        data.cropHeight = cropData.height;
        data.isError = false;

        const finalizeSave = (blob, newUrl) => {
            data.blob = blob;
            const cards = gallery.querySelectorAll('.image-card');
            if (cards[editingBlobIndex]) {
                const img = cards[editingBlobIndex].querySelector('img');
                if (img) img.src = newUrl;
                cards[editingBlobIndex].classList.remove('error-border');
            }

            // Update metadata for dynamic AR check if they edit!!
            const imgEl = editCropImage;
            data.outputWidth = (data.mode === 'censor') ? imgEl.naturalWidth : cropData.width;
            data.outputHeight = (data.mode === 'censor') ? imgEl.naturalHeight : cropData.height;

            // Re-run the similarity check since an image changed!
            updateGalleryLayout();

            saveCropBtn.disabled = false;
            saveCropBtn.innerText = "Save Crop";
            closeEditModal();
        };

        if (data.mode === 'censor') {
            const img = editCropImage; // The original full image being edited
            const fullCanvas = document.createElement('canvas');
            fullCanvas.width = img.naturalWidth;
            fullCanvas.height = img.naturalHeight;
            const fCtx = fullCanvas.width && fullCanvas.height ? fullCanvas.getContext('2d') : null;
            if (fCtx) {
                fCtx.drawImage(img, 0, 0);
                
                drawCensor(fCtx, cropData.x, cropData.y, cropData.width, cropData.height, {
                    type: data.censorType,
                    shape: data.censorShape || currentCensorShape,
                    color: data.censorColor || censorColor,
                    blur: data.blurStrength,
                    emoji: data.censorEmoji || censorEmoji
                }, img);
                
                const newUrl = fullCanvas.toDataURL('image/jpeg', 0.95);
                fullCanvas.toBlob((blob) => {
                    finalizeSave(blob, newUrl);
                }, 'image/jpeg', 0.95);
            }
        } else {
            const canvas = cropperInstance.getCroppedCanvas({
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            if (!canvas) {
                saveCropBtn.disabled = false;
                saveCropBtn.innerText = "Save Crop";
                return;
            }

            const newUrl = canvas.toDataURL('image/jpeg', 0.95);
            canvas.toBlob((blob) => {
                finalizeSave(blob, newUrl);
            }, 'image/jpeg', 0.95);
        }
    });
}

function updateGalleryLayout() {
    if (processedBlobs.length === 0) return;
    const ratios = processedBlobs.map(b => (b.outputWidth || 1) / (b.outputHeight || 1));
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    
    // Check if all ratios are within 5% of the average
    const allSimilar = ratios.every(r => Math.abs(r - avg) / avg <= 0.05);
    
    if (allSimilar) {
        gallery.style.setProperty('--gallery-ar', avg);
        const shape = avg > 1.1 ? "Landscape" : (avg < 0.9 ? "Portrait" : "Square");
        if (galleryStatus) galleryStatus.textContent = `✨ Detected uniform ${shape} aspect ratio. Layout adjusted.`;
    } else {
        gallery.style.removeProperty('--gallery-ar');
        if (galleryStatus) galleryStatus.textContent = "Mixed aspect ratios detected. Using standard square grid.";
    }
}

// Final Initialization
loadModels();

// 9. New Drawing Helper
function drawCensor(ctx, x, y, width, height, options, sourceImg) {
    const { type, shape, color, blur } = options;
    
    ctx.save();
    ctx.beginPath();
    
    if (shape === 'circle') {
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const radiusX = width / 2;
        const radiusY = height / 2;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    } else {
        ctx.rect(x, y, width, height);
    }
    
    ctx.clip();
    
    if (type === 'blur') {
        ctx.filter = `blur(${blur}px)`;
        // Drawing full image censored
        ctx.drawImage(sourceImg, 0, 0);
    } else if (type === 'emoji') {
        const emojiToDraw = options.emoji || '🕶️';
        const fontSize = Math.min(width, height) * 0.9;
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emojiToDraw, x + width / 2, y + height / 2);
    } else {
        ctx.fillStyle = color;
        ctx.fill();
    }
    
    ctx.restore();
}