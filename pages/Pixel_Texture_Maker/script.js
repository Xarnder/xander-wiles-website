/* 
    Texture Processor Script
    Handles loading, processing, and zipping of textures.
*/

// --- DOM Elements ---
const fileInput = document.getElementById('fileInput');
const fileCountSpan = document.getElementById('fileCount');
const processBtn = document.getElementById('processBtn');
const downloadBtn = document.getElementById('downloadBtn');
const logContent = document.getElementById('log-content');
const resultsGrid = document.getElementById('resultsGrid');

// --- State ---
let loadedFiles = [];
let processedBlobs = new Map(); // filename -> Blob

// --- Logger Helper ---
function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight; // Auto scroll

    // Also log to browser console as requested
    console.log(`%c[${type.toUpperCase()}] ${message}`, type === 'error' ? 'color: red' : 'color: cyan');
}

// --- Event Listeners ---
fileInput.addEventListener('change', (e) => {
    loadedFiles = Array.from(e.target.files);

    if (loadedFiles.length > 0) {
        fileCountSpan.textContent = `${loadedFiles.length} file(s) loaded`;
        processBtn.disabled = false;
        downloadBtn.disabled = true; // Reset download
        resultsGrid.innerHTML = ''; // Clear old results
        processedBlobs.clear();
        log(`Loaded ${loadedFiles.length} files. Ready to process.`, 'success');
    } else {
        fileCountSpan.textContent = "No files selected";
        processBtn.disabled = true;
    }
});

processBtn.addEventListener('click', async () => {
    processBtn.disabled = true;
    log("Starting batch processing...", 'info');

    // Reset State
    processedBlobs.clear();
    resultsGrid.innerHTML = '';

    for (const file of loadedFiles) {
        try {
            await initializeAndProcessImage(file);
        } catch (err) {
            log(`Error processing ${file.name}: ${err.message}`, 'error');
        }
    }

    log("Batch processing complete.", 'success');
    processBtn.disabled = false;
    downloadBtn.disabled = false;
});

downloadBtn.addEventListener('click', () => {
    if (processedBlobs.size === 0) {
        log("No processed images to zip.", 'error');
        return;
    }

    log("Generating ZIP file from current state...", 'info');
    const zip = new JSZip();

    processedBlobs.forEach((blob, filename) => {
        zip.file(filename, blob);
    });

    zip.generateAsync({ type: "blob" })
        .then(function (content) {
            saveAs(content, "processed_textures_16x16.zip");
            log("ZIP download started.", 'success');
        });
});

// --- Core Image Processing Logic ---

async function initializeAndProcessImage(file) {
    log(`Initializing: ${file.name}...`, 'info');

    // 1. Load Image
    const img = await loadImageFromFile(file);

    // 2. Pre-calculate Darkest Color (Static per image)
    const { darkestColor } = findDarkestColor(img);

    // 3. Generate Raw 16x16 Preview (Static per image)
    const rawSmallSrc = generateRaw16x16(img);

    // 4. Create UI Card
    const { card, slider, processedImgElement, thresholdValueSpan } = createInteractiveCard(file.name, img.src, rawSmallSrc);

    // 5. Define Processing Function
    const updateProcessing = async () => {
        const threshold = parseInt(slider.value, 10);
        thresholdValueSpan.textContent = threshold;

        // Process Image with current threshold
        const blob = await processImageWithThreshold(img, darkestColor, threshold);

        // Update UI
        const url = URL.createObjectURL(blob);
        processedImgElement.src = url;

        // Update State for Zip
        processedBlobs.set(file.name, blob);
    };

    // 6. Bind Listener
    slider.addEventListener('input', updateProcessing);

    // 7. Initial Run
    await updateProcessing();
}

function findDarkestColor(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let minLum = 255;
    let darkestColor = { r: 0, g: 0, b: 0 };

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a < 255) continue;

        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        if (lum < minLum) {
            minLum = lum;
            darkestColor = { r, g, b };
        }
    }
    return { darkestColor };
}

function generateRaw16x16(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, 16, 16);
    return canvas.toDataURL();
}

async function processImageWithThreshold(img, darkestColor, similarityThreshold) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Selection
    const selectionMask = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const dist = Math.sqrt(
            Math.pow(r - darkestColor.r, 2) +
            Math.pow(g - darkestColor.g, 2) +
            Math.pow(b - darkestColor.b, 2)
        );

        if (dist < similarityThreshold) {
            selectionMask[i / 4] = 1;
        }
    }

    // Dilation
    const expandedMask = new Uint8Array(width * height);
    const expandRadius = 5;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (selectionMask[idx] === 1) {
                for (let dy = -expandRadius; dy <= expandRadius; dy++) {
                    for (let dx = -expandRadius; dx <= expandRadius; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (dx * dx + dy * dy <= expandRadius * expandRadius) {
                                expandedMask[ny * width + nx] = 1;
                            }
                        }
                    }
                }
            }
        }
    }

    // Application
    for (let i = 0; i < expandedMask.length; i++) {
        if (expandedMask[i] === 1) {
            const dataIdx = i * 4;
            data[dataIdx] = darkestColor.r;
            data[dataIdx + 1] = darkestColor.g;
            data[dataIdx + 2] = darkestColor.b;
            data[dataIdx + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    // Downsample
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = 16;
    smallCanvas.height = 16;
    const smallCtx = smallCanvas.getContext('2d');
    smallCtx.imageSmoothingEnabled = false;
    smallCtx.drawImage(canvas, 0, 0, 16, 16);

    return new Promise(resolve => smallCanvas.toBlob(resolve));
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function createInteractiveCard(filename, originalSrc, rawSrc) {
    const card = document.createElement('div');
    card.className = 'result-card glass-panel';

    // Unique ID for slider to avoid conflicts if needed, but scoped anyway
    const sliderId = `slider-${filename.replace(/\s+/g, '-')}`;

    card.innerHTML = `
        <h3>${filename}</h3>
        <div class="controls-row">
            <label for="${sliderId}">Threshold: <span class="threshold-value">30</span></label>
            <input type="range" id="${sliderId}" class="threshold-slider" min="0" max="100" value="30">
        </div>
        <div class="preview-container">
            <div class="preview-box">
                <img src="${originalSrc}" width="64" height="64">
                <span>Original</span>
            </div>
            <div class="preview-box">
                <img src="${rawSrc}" width="64" height="64" style="width:64px; height:64px; image-rendering: pixelated;">
                <span>Raw 16x</span>
            </div>
            <div class="preview-box">
                <img class="processed-output" src="" width="64" height="64" style="width:64px; height:64px">
                <span>Processed</span>
            </div>
        </div>
    `;

    resultsGrid.appendChild(card);

    return {
        card,
        slider: card.querySelector('.threshold-slider'),
        processedImgElement: card.querySelector('.processed-output'),
        thresholdValueSpan: card.querySelector('.threshold-value')
    };
}