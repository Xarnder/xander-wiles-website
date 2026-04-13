import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Note: Transformers.js is kept for potential future tasks, 
// but Magic Mode now uses raw ONNX for stability.

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

// Frame Settings
let currentFrameShape = 'rect';
let frameColor = '#4a9eff';
let frameThickness = 5;

// Manual Crop Globals
let cropperInstance = null;
let editingBlobIndex = -1;

// AI Magic Mode Globals
let aiModelLoaded = false;
let inpainterSession = null;
const aiLoadingOverlay = document.getElementById('aiLoadingOverlay');
const aiProgressBar = document.getElementById('aiProgressBar');
const aiStatusText = document.getElementById('aiStatusText');

const LAMA_MODEL_URL = './models/lama_fp32.onnx';
const ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';

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
const maskPreviewCanvas = document.getElementById('maskPreviewCanvas');
const maskPreviewWindow = document.getElementById('maskPreviewWindow');
const maskWindowMeta = document.getElementById('maskWindowMeta');
const closeMaskWindowBtn = document.getElementById('closeMaskWindow');
const previewLoader = document.getElementById('previewLoader');
const verticalPosInput = document.getElementById('verticalPosInput');
const verticalPosVal = document.getElementById('verticalPosVal');
const processAllFacesInput = document.getElementById('processAllFaces');
const presetBtns = document.querySelectorAll('.preset-btn');
const modeBtns = document.querySelectorAll('.mode-btn');

// Debug Console Elements
const debugConsole = document.getElementById('debugConsole');
const debugLogs = document.getElementById('debugLogs');
const clearLogsBtn = document.getElementById('clearLogs');

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

// Frame Elements
const frameOptionsPanel = document.getElementById('frameOptionsPanel');
const frameShapeBtns = document.querySelectorAll('.frame-shape-btn');
const frameColorInput = document.getElementById('frameColor');
const frameColorHex = document.getElementById('frameColorHex');
const frameThicknessInput = document.getElementById('frameThickness');
const frameThicknessVal = document.getElementById('frameThicknessVal');

// Naming Elements
const namingScheme = document.getElementById('namingScheme');
const customBaseRow = document.getElementById('customBaseRow');
const filenameBaseInput = document.getElementById('filenameBase');
const filenamePrefixInput = document.getElementById('filenamePrefix');
const filenameSuffixInput = document.getElementById('filenameSuffix');
const filenamePreview = document.getElementById('filenamePreview');

// Edit Crop Elements
const editCropModal = document.getElementById('editCropModal');
const editCropImage = document.getElementById('editCropImage');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const saveCropBtn = document.getElementById('saveCropBtn');

// Magic Mode Option Elements
const magicOptionsPanel = document.getElementById('magicOptionsPanel');
const magicPromptInput = document.getElementById('magicPromptInput');
const magicPaddingInput = document.getElementById('magicPadding');
const magicPaddingVal = document.getElementById('magicPaddingVal');

// Debug Logger
function log(message, type = 'info') {
    statusArea.textContent = message;
    
    // Write to Debug Console
    if (debugLogs) {
        const entry = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        entry.className = `log-entry log-${type}`;
        entry.innerHTML = `[${timestamp}] ${message}`;
        debugLogs.appendChild(entry);
        debugLogs.scrollTop = debugLogs.scrollHeight;
    }

    const style = type === 'error' ? 'color: red; background: #fff0f0;' : 'color: #bada55; background: #222;';
    console.log(`%c[FaceCrop] ${message}`, style);
}

// 1. Initialize AI Models
async function loadModels() {
    try {
        log("Loading Detection Models...");
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        modelsLoaded = true;
        log("AI Models Ready. Select a fold or images.");
    } catch (error) {
        console.error(error);
        log("Error loading AI models.", "error");
    }
}

// 2. AI Magic Mode Implementation (Raw ONNX)
async function initMagicAI() {
    if (aiModelLoaded) return true;

    log("Initializing Magic AI (Raw ONNX)...", "magic");
    aiLoadingOverlay.style.display = 'flex';
    aiStatusText.textContent = "Setting up AI Runtime...";

    try {
        // Setup ORT WASM backend
        ort.env.wasm.wasmPaths = ORT_WASM_PATH;
        
        log("Loading LaMa model (~198MB, cached after first load)...", "info");
        aiStatusText.textContent = "Loading AI model...";
        aiProgressBar.style.width = '5%';

        // Fetch model with progress tracking
        const response = await fetch(LAMA_MODEL_URL);
        if (!response.ok) throw new Error(`Failed to load model: HTTP ${response.status}`);
        
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let received = 0;
        
        const reader = response.body.getReader();
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (total > 0) {
                const pct = Math.round((received / total) * 90) + 5;
                aiProgressBar.style.width = `${pct}%`;
                aiStatusText.textContent = `Loading model... ${pct}%`;
            }
        }
        
        const modelBuffer = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            modelBuffer.set(chunk, offset);
            offset += chunk.length;
        }
        
        log("Model data loaded. Creating ONNX session...", "info");
        aiStatusText.textContent = "Compiling AI graph...";
        aiProgressBar.style.width = '95%';

        inpainterSession = await ort.InferenceSession.create(modelBuffer.buffer, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });

        log("✅ AI Magic Session Ready!", "success");
        aiProgressBar.style.width = '100%';
        aiModelLoaded = true;
        setTimeout(() => aiLoadingOverlay.style.display = 'none', 500);
        return true;
    } catch (err) {
        log(`Critical Error: Magic AI Failed. ${err.message}`, "error");
        console.error("Magic AI Failed:", err);
        aiStatusText.textContent = `Error: ${err.message}`;
        setTimeout(() => aiLoadingOverlay.style.display = 'none', 4000);
        return false;
    }
}

async function runMagicInpaint(imageSource, faceBox) {
    if (!aiModelLoaded) {
        const ok = await initMagicAI();
        if (!ok) return null;
    }
    
    log("Running AI Inpainting (Raw ONNX)...", "magic");
    const startTime = performance.now();

    const targetSize = 512;
    
    // 1. Prepare tensors — returns mask canvas too for preview
    log("Preprocessing image and mask (512x512)...", "info");
    const { imageTensor, maskTensor, maskCanvas: scaledMask } = await prepareInpaintTensors(imageSource, faceBox, targetSize);

    // Show mask preview in the floating window at ORIGINAL image aspect ratio
    if (maskPreviewCanvas && maskPreviewWindow) {
        // Draw at original image size so aspect ratio is preserved
        maskPreviewCanvas.width = imageSource.width;
        maskPreviewCanvas.height = imageSource.height;
        const mCtx = maskPreviewCanvas.getContext('2d');
        // Original image as background (grey tinted)
        mCtx.drawImage(imageSource, 0, 0);
        mCtx.fillStyle = 'rgba(0,0,0,0.5)';
        mCtx.fillRect(0, 0, imageSource.width, imageSource.height);
        // Scale scaledMask (512x512) back up to original dimensions so mask lines up
        mCtx.globalAlpha = 0.85;
        mCtx.drawImage(scaledMask, 0, 0, 512, 512, 0, 0, imageSource.width, imageSource.height);
        mCtx.globalAlpha = 1.0;
        // Update meta
        if (maskWindowMeta) maskWindowMeta.textContent = `${imageSource.width}×${imageSource.height}px`;
        maskPreviewWindow.style.display = 'block';
    }

    try {
        log("Executing ONNX Inference...", "magic");
        
        const feeds = { image: imageTensor, mask: maskTensor };
        const results = await inpainterSession.run(feeds);
        const outputTensor = results['output']; // Carve LaMa outputs [0,255] directly

        log("Post-processing AI output...", "info");
        const outCanvas = tensorToCanvas(outputTensor, targetSize);
        
        // 2. Composite: draw original image, then paint ONLY the inpainted
        //    face region back over it (scaled from 512x512 space to original coords)
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = imageSource.width;
        finalCanvas.height = imageSource.height;
        const ctx = finalCanvas.getContext('2d');

        // Base: original image
        ctx.drawImage(imageSource, 0, 0);

        // Compute face bounding region (with padding) in ORIGINAL image space
        const padding = magicPaddingInput ? (parseInt(magicPaddingInput.value) / 100) : 0.25;
        const prompt = magicPromptInput ? magicPromptInput.value.trim() : '';
        if (prompt) log(`Style hint: "${prompt}" (stored for future text-guided models)`, "info");
        const bx = Math.max(0, faceBox.x - faceBox.width * padding);
        const by = Math.max(0, faceBox.y - faceBox.height * padding);
        const bw = Math.min(imageSource.width - bx, faceBox.width * (1 + padding * 2));
        const bh = Math.min(imageSource.height - by, faceBox.height * (1 + padding * 2));

        // Scale those same coordinates in 512x512 space
        const scaleX = targetSize / imageSource.width;
        const scaleY = targetSize / imageSource.height;
        const sx = bx * scaleX;
        const sy = by * scaleY;
        const sw = bw * scaleX;
        const sh = bh * scaleY;

        // Paint only the face patch from the AI output onto the original
        ctx.drawImage(outCanvas, sx, sy, sw, sh, bx, by, bw, bh);

        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        log(`✅ Generation Successful! (took ${duration}s)`, "success");
        
        return finalCanvas; 
    } catch (err) {
        log(`Inference Error: ${err.message}`, "error");
        throw err;
    }
}

// 2.1 AI Pre-processors
async function prepareInpaintTensors(img, faceBox, size) {
    // Create 512x512 Canvas for Image
    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = size;
    imgCanvas.height = size;
    const imgCtx = imgCanvas.getContext('2d');
    imgCtx.drawImage(img, 0, 0, size, size);
    
    // Create 512x512 Canvas for Mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    const mctx = maskCanvas.getContext('2d');
    mctx.fillStyle = 'black';
    mctx.fillRect(0, 0, size, size);
    
    // Scale mask coordinates to 512x512
    const scaleX = size / img.width;
    const scaleY = size / img.height;
    
    const padding = magicPaddingInput ? (parseInt(magicPaddingInput.value) / 100) : 0.25;
    const bx = Math.max(0, (faceBox.x - faceBox.width * padding) * scaleX);
    const by = Math.max(0, (faceBox.y - faceBox.height * padding) * scaleY);
    const bw = Math.min(size - bx, (faceBox.width * (1 + padding * 2)) * scaleX);
    const bh = Math.min(size - by, (faceBox.height * (1 + padding * 2)) * scaleY);
    
    mctx.fillStyle = 'white';
    mctx.fillRect(bx, by, bw, bh);

    // Convert to Float32 Tensors: image in [-1, 1], mask binary [0, 1]
    // LaMa (Carve ONNX) expects image normalized to [-1, 1] range
    const imgData = imgCtx.getImageData(0, 0, size, size).data;
    const maskData = mctx.getImageData(0, 0, size, size).data;

    const r = new Float32Array(size * size);
    const g = new Float32Array(size * size);
    const b = new Float32Array(size * size);
    const m = new Float32Array(size * size);

    for (let i = 0; i < size * size; i++) {
        // Normalize image pixels from [0,255] -> [0,1] (Carve LaMa expects [0,1] input)
        r[i] = imgData[i * 4]     / 255.0;
        g[i] = imgData[i * 4 + 1] / 255.0;
        b[i] = imgData[i * 4 + 2] / 255.0;
        m[i] = maskData[i * 4] > 128 ? 1.0 : 0.0;
    }

    const imageTensor = new ort.Tensor('float32', new Float32Array([...r, ...g, ...b]), [1, 3, size, size]);
    const maskTensor  = new ort.Tensor('float32', m, [1, 1, size, size]);

    return { imageTensor, maskTensor, maskCanvas };
}

function tensorToCanvas(tensor, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);

    const data = tensor.data;
    const stride = size * size;

    for (let i = 0; i < size * size; i++) {
        // Output is already in [0,255] range — just clamp and write
        imageData.data[i * 4]     = Math.max(0, Math.min(255, data[i]));
        imageData.data[i * 4 + 1] = Math.max(0, Math.min(255, data[i + stride]));
        imageData.data[i * 4 + 2] = Math.max(0, Math.min(255, data[i + stride * 2]));
        imageData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
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
        if (frameOptionsPanel) {
            frameOptionsPanel.style.display = currentMode === 'frame' ? 'block' : 'none';
        }
        if (magicOptionsPanel) {
            magicOptionsPanel.style.display = currentMode === 'magic' ? 'block' : 'none';
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

processAllFacesInput.addEventListener('change', () => {
    if (firstImageCache && firstFaceBox) updatePreviewCanvas();
});

censorColorInput.addEventListener('input', (e) => {
    censorColor = e.target.value;
    colorHexDisplay.textContent = censorColor.toUpperCase();
    if (firstImageCache && firstFaceBox) updatePreviewCanvas();
});

blurStrengthInput.addEventListener('input', (e) => {
    blurStrength = parseInt(e.target.value);
    if (blurStrengthVal) blurStrengthVal.textContent = blurStrength;
    if (firstImageCache && firstFaceBox) updatePreviewCanvas();
});

// Frame Listeners
frameShapeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        frameShapeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFrameShape = btn.dataset.shape;
        if (firstImageCache && firstFaceBox) updatePreviewCanvas();
    });
});

frameColorInput.addEventListener('input', (e) => {
    frameColor = e.target.value;
    if (frameColorHex) frameColorHex.textContent = frameColor.toUpperCase();
    if (firstImageCache && firstFaceBox) updatePreviewCanvas();
});

frameThicknessInput.addEventListener('input', (e) => {
    frameThickness = parseInt(e.target.value);
    if (frameThicknessVal) frameThicknessVal.textContent = frameThickness;
    if (firstImageCache && firstFaceBox) updatePreviewCanvas();
});

// Magic Mode Listeners
if (magicPaddingInput) {
    magicPaddingInput.addEventListener('input', (e) => {
        if (magicPaddingVal) magicPaddingVal.textContent = e.target.value;
        if (firstImageCache && firstFaceBox && currentMode === 'magic') updatePreviewCanvas();
    });
}

// Mask Window Close Button
if (closeMaskWindowBtn) {
    closeMaskWindowBtn.addEventListener('click', () => {
        if (maskPreviewWindow) maskPreviewWindow.style.display = 'none';
    });
}

// Naming Listeners
namingScheme.addEventListener('change', (e) => {
    customBaseRow.style.display = e.target.value === 'custom' ? 'block' : 'none';
    updateFilenamePreview();
});

[filenameBaseInput, filenamePrefixInput, filenameSuffixInput].forEach(input => {
    input.addEventListener('input', updateFilenamePreview);
});

// Debug Console Helper
if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
        if (debugLogs) debugLogs.innerHTML = '';
    });
}

function updateFilenamePreview() {
    if (!filenamePreview) return;
    const exampleName = "image_01.jpg";
    const finalName = generateOutputName(exampleName, 0, 1, 1);
    filenamePreview.textContent = finalName;
}

function generateOutputName(originalName, faceIndex, totalFaces, batchIndex, mode) {
    const scheme = namingScheme.value;
    const prefix = filenamePrefixInput.value;
    const suffix = filenameSuffixInput.value;
    
    let baseName = "";
    const parts = originalName.split('.');
    const ext = parts.length > 1 ? parts.pop() : 'jpg';
    const nameNoExt = parts.join('.');

    if (scheme === 'original') {
        baseName = nameNoExt;
    } else if (scheme === 'custom') {
        const customBase = filenameBaseInput.value || 'Result';
        baseName = customBase;
        if (loadedFiles.length > 1) {
             baseName += `_${batchIndex}`;
        }
    } else if (scheme === 'sequential') {
        baseName = String(batchIndex).padStart(3, '0');
    }

    // Default mode prefix if user didn't provide a custom prefix?
    // User might want BOTH. Let's keep the mode prefix unless prefix is set?
    // Actually, usually users want one or the other. 
    // Let's add the mode prefix ONLY if scheme is original and no custom prefix.
    let modePrefix = "";
    if (scheme === 'original' && !prefix) {
        modePrefix = `${mode}_`;
    }

    // Add multi-face index if needed
    let facePart = "";
    if (totalFaces > 1) {
        facePart = `_face${faceIndex + 1}`;
    }

    return `${prefix}${modePrefix}${baseName}${facePart}${suffix}.${ext}`;
}

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

    log(`Starting batch processing for ${loadedFiles.length} images...`, "info");
    log("Status: Clearing gallery and initializing processed storage.", "info");

    for (let i = 0; i < loadedFiles.length; i++) {
        const file = loadedFiles[i];
        log(`Processing Image [${i + 1}/${loadedFiles.length}]: ${file.name}`, "info");
        try {
            await processImage(file, i + 1); // Pass 1-based batch index
            log(`Successfully processed: ${file.name}`, "success");
        } catch (err) {
            log(`Execution Error [${file.name}]: ${err.message}`, "error");
            console.error(`Failed to process ${file.name}:`, err);
            createErrorCard(file.name);
        }
        processedCount++;
        statusArea.textContent = `Processing: ${processedCount} / ${loadedFiles.length}`;
    }

    log("✅ Batch Processing Complete!", "success");
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
async function processImage(file, batchIndex) {
    let img;
    try {
        img = await faceapi.bufferToImage(file);
    } catch (e) {
        console.warn("Could not decode image", file.name);
        return;
    }

    const detections = await faceapi.detectAllFaces(img);
    const processAll = processAllFacesInput ? processAllFacesInput.checked : false;

    if (currentMode === 'censor') {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let facesToCensor = [];
        if (!detections || detections.length === 0) {
            facesToCensor = [null]; // Fallback to full image
        } else {
            facesToCensor = processAll ? detections.map(d => d.box) : [getLargestFace(detections).box];
        }

        for (let i = 0; i < facesToCensor.length; i++) {
            const faceBox = facesToCensor[i];
            const rect = calculateCropRect(img, faceBox);
            drawOverlay(ctx, rect.x, rect.y, rect.width, rect.height, {
                mode: 'censor',
                type: currentCensorType,
                shape: currentCensorShape,
                color: censorColor,
                blur: blurStrength,
                emoji: censorEmoji
            }, img);
        }

        const finalFileName = generateOutputName(file.name, 0, 1, batchIndex, 'censored');

        await new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    processedBlobs.push({
                        name: finalFileName,
                        blob: blob,
                        isError: (!detections || detections.length === 0),
                        originalFile: file,
                        outputWidth: img.width,
                        outputHeight: img.height,
                        mode: 'censor',
                        censorType: currentCensorType,
                        censorShape: currentCensorShape,
                        censorColor: censorColor,
                        blurStrength: blurStrength,
                        censorEmoji: censorEmoji
                    });
                    displayResult(URL.createObjectURL(blob), (!detections || detections.length === 0));
                }
                resolve();
            }, 'image/jpeg', 0.95);
        });
    } else if (currentMode === 'frame') {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let facesToFrame = [];
        if (!detections || detections.length === 0) {
            facesToFrame = [null];
        } else {
            facesToFrame = processAll ? detections.map(d => d.box) : [getLargestFace(detections).box];
        }

        for (let i = 0; i < facesToFrame.length; i++) {
            const faceBox = facesToFrame[i];
            const rect = calculateCropRect(img, faceBox);
            drawOverlay(ctx, rect.x, rect.y, rect.width, rect.height, {
                mode: 'frame',
                shape: currentFrameShape,
                color: frameColor,
                thickness: frameThickness
            }, img);
        }

        const finalFileName = generateOutputName(file.name, 0, 1, batchIndex, 'framed');

        await new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    processedBlobs.push({
                        name: finalFileName,
                        blob: blob,
                        isError: (!detections || detections.length === 0),
                        originalFile: file,
                        outputWidth: img.width,
                        outputHeight: img.height,
                        mode: 'frame',
                        frameShape: currentFrameShape,
                        frameColor: frameColor,
                        frameThickness: frameThickness
                    });
                    displayResult(URL.createObjectURL(blob), (!detections || detections.length === 0));
                }
                resolve();
            }, 'image/jpeg', 0.95);
        });
    } else if (currentMode === 'magic') {
        const faceBox = (detections && detections.length > 0) ? getLargestFace(detections).box : null;
        
        let outCanvas;
        if (faceBox) {
            outCanvas = await runMagicInpaint(img, faceBox);
        } else {
            // Fallback: just use original
            outCanvas = document.createElement('canvas');
            outCanvas.width = img.width;
            outCanvas.height = img.height;
            outCanvas.getContext('2d').drawImage(img, 0, 0);
        }

        const finalFileName = generateOutputName(file.name, 0, 1, batchIndex, 'magic');

        await new Promise((resolve) => {
            outCanvas.toBlob((blob) => {
                if (blob) {
                    processedBlobs.push({
                        name: finalFileName,
                        blob: blob,
                        isError: (!detections || detections.length === 0),
                        originalFile: file,
                        outputWidth: img.width,
                        outputHeight: img.height,
                        mode: 'magic'
                    });
                    displayResult(URL.createObjectURL(blob), (!detections || detections.length === 0));
                }
                resolve();
            }, 'image/jpeg', 0.95);
        });
    } else {
        // Crop Mode
        let facesToCrop = [];
        if (!detections || detections.length === 0) {
            facesToCrop = [null];
        } else {
            facesToCrop = processAll ? detections.map(d => d.box) : [getLargestFace(detections).box];
        }

        for (let i = 0; i < facesToCrop.length; i++) {
            const faceBox = facesToCrop[i];
            const rect = calculateCropRect(img, faceBox);
            const canvas = document.createElement('canvas');
            canvas.width = rect.width;
            canvas.height = rect.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

            await new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    if (blob) {
                        const finalFileName = generateOutputName(file.name, i, facesToCrop.length, batchIndex, 'cropped');
                        processedBlobs.push({
                            name: finalFileName,
                            blob: blob,
                            isError: rect.isError,
                            originalFile: file,
                            outputWidth: rect.width,
                            outputHeight: rect.height,
                            cropWidth: rect.width,
                            cropHeight: rect.height,
                            cropX: rect.x,
                            cropY: rect.y,
                            mode: 'crop',
                            targetRatio: useOriginalRatioInput.checked ? NaN : ((parseFloat(ratioWidthInput.value)||1)/(parseFloat(ratioHeightInput.value)||1))
                        });
                        displayResult(URL.createObjectURL(blob), rect.isError);
                    }
                    resolve();
                }, 'image/jpeg', 0.95);
            });
        }
    }
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

async function updatePreviewCanvas() {
    if (!firstImageCache || !firstFaceBox) return;

    const detections = await faceapi.detectAllFaces(firstImageCache);
    const multi = processAllFacesInput ? processAllFacesInput.checked : false;

    const ctx = previewCanvas.getContext('2d');

    if (currentMode === 'censor') {
        previewCanvas.width = firstImageCache.width;
        previewCanvas.height = firstImageCache.height;
        ctx.drawImage(firstImageCache, 0, 0);
        
        let facesToCensor = [];
        if (!detections || detections.length === 0) {
            facesToCensor = [null];
        } else {
            facesToCensor = multi ? detections.map(d => d.box) : [getLargestFace(detections).box];
        }

        for (const faceBox of facesToCensor) {
            const rect = calculateCropRect(firstImageCache, faceBox);
            drawOverlay(ctx, rect.x, rect.y, rect.width, rect.height, {
                mode: 'censor',
                type: currentCensorType,
                shape: currentCensorShape,
                color: censorColor,
                blur: blurStrength,
                emoji: censorEmoji
            }, firstImageCache);
        }
    } else if (currentMode === 'frame') {
        previewCanvas.width = firstImageCache.width;
        previewCanvas.height = firstImageCache.height;
        ctx.drawImage(firstImageCache, 0, 0);
        
        let facesToFrame = [];
        if (!detections || detections.length === 0) {
            facesToFrame = [null];
        } else {
            facesToFrame = multi ? detections.map(d => d.box) : [getLargestFace(detections).box];
        }

        for (const faceBox of facesToFrame) {
            const rect = calculateCropRect(firstImageCache, faceBox);
            drawOverlay(ctx, rect.x, rect.y, rect.width, rect.height, {
                mode: 'frame',
                shape: currentFrameShape,
                color: frameColor,
                thickness: frameThickness
            }, firstImageCache);
        }
    } else if (currentMode === 'magic') {
        previewCanvas.width = firstImageCache.width;
        previewCanvas.height = firstImageCache.height;
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("AI Magic Preview Initializing...", previewCanvas.width / 2, previewCanvas.height / 2);

        const faceBox = (detections && detections.length > 0) ? getLargestFace(detections).box : null;
        if (faceBox) {
            const outCanvas = await runMagicInpaint(firstImageCache, faceBox);
            ctx.drawImage(outCanvas, 0, 0);
        } else {
            ctx.drawImage(firstImageCache, 0, 0);
        }
    } else {
        // Crop Mode Preview (Always shows the first/largest detected face)
        const faceBox = (detections && detections.length > 0) ? (multi ? detections[0].box : getLargestFace(detections).box) : null;
        const rect = calculateCropRect(firstImageCache, faceBox);
        previewCanvas.width = rect.width;
        previewCanvas.height = rect.height;
        ctx.drawImage(firstImageCache, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
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

        if (data.mode === 'censor' || data.mode === 'frame') {
            const img = editCropImage; // The original full image being edited
            const fullCanvas = document.createElement('canvas');
            fullCanvas.width = img.naturalWidth;
            fullCanvas.height = img.naturalHeight;
            const fCtx = fullCanvas.width && fullCanvas.height ? fullCanvas.getContext('2d') : null;
            if (fCtx) {
                fCtx.drawImage(img, 0, 0);
                
                drawOverlay(fCtx, cropData.x, cropData.y, cropData.width, cropData.height, {
                    mode: data.mode,
                    type: data.censorType,
                    color: data.censorColor || data.frameColor || censorColor,
                    blur: data.blurStrength || blurStrength,
                    emoji: data.censorEmoji || censorEmoji,
                    thickness: data.frameThickness || frameThickness,
                    shape: data.censorShape || data.frameShape || currentCensorShape || currentFrameShape
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
log("System initialized. AI Detection Models loaded.", "success");
log("Ready for image processing. Select mode to continue.", "info");

// 9. Processing Helpers
function getLargestFace(detections) {
    if (!detections || detections.length === 0) return null;
    return detections.sort((a, b) => {
        const areaA = a.box.width * a.box.height;
        const areaB = b.box.width * b.box.height;
        return areaB - areaA;
    })[0];
}

function calculateCropRect(img, faceBox) {
    if (!faceBox) return { x: 0, y: 0, width: img.width, height: img.height, isError: true };

    // Calculate Padding
    const paddingPercent = parseInt(paddingInput.value) / 100;
    const padX = faceBox.width * paddingPercent;
    const padY = faceBox.height * paddingPercent;

    // Base crop box (Face + Padding)
    let cx = Math.max(0, faceBox.x - padX);
    let cy = Math.max(0, faceBox.y - padY);
    let cw = Math.min(img.width - cx, faceBox.width + (padX * 2));
    let ch = Math.min(img.height - cy, faceBox.height + (padY * 2));

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

    let width = targetW;
    let height = targetH;

    if (width > img.width) {
        width = img.width;
        height = width / targetRatio;
    }
    if (height > img.height) {
        height = img.height;
        width = height * targetRatio;
    }

    const verticalPosPercent = (parseInt(document.getElementById('verticalPosInput').value) || 50) / 100;
    const faceCenterY = faceBox.y + faceBox.height / 2;
    const faceCenterX = faceBox.x + faceBox.width / 2;

    let x = faceCenterX - width / 2;
    let y = faceCenterY - (height * verticalPosPercent);

    x = Math.max(0, Math.min(x, img.width - width));
    y = Math.max(0, Math.min(y, img.height - height));

    return { x, y, width, height, isError: false, faceBox };
}

// 10. New Drawing Helper
function drawOverlay(ctx, x, y, width, height, options, sourceImg) {
    const { mode, type, shape, color, blur, thickness } = options;
    
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
    
    if (mode === 'frame') {
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness || 5;
        ctx.stroke();
    } else {
        ctx.clip();
        
        if (type === 'blur') {
            ctx.filter = `blur(${blur}px)`;
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
    }
    
    ctx.restore();
}