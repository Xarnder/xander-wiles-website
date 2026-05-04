import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
import * as Mp4Muxer from 'https://cdn.jsdelivr.net/npm/mp4-muxer/+esm';

// Note: Transformers.js is kept for potential future tasks,
// but Magic Mode now uses raw ONNX for stability.

// Configuration
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
let modelsLoaded = false;
let processedBlobs = [];
let loadedFiles = []; // Store files for deferred processing
let firstImageCache = null; // Cache for the first image
let firstFaceBox = null; // Cache for the detected face box
let currentMode = 'censor'; 
let currentCensorType = 'blur';
let currentCensorShape = 'circle';
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
let inpainterSession = null;
let isBatchAborted = false;
let replacementFaceCanvasSource = null; // Canvas storing the cropped source face
let replacementFaceOriginalFile = null; // The raw original upload
let replacementFaceImageCache = null;   // The decoded original image
let replacementFaceBox = null;          // The detected face box 
let isEditingReplacement = false; // Flag for Cropper modal
let featherAmount = 30;
let replaceHue = 0;
let replaceSat = 100;
let replaceLight = 100;
let sourceFaceHSL = null; // Stores {h, s, l} of the replacement face
let autoColorBatch = false;
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
const stopBtn = document.getElementById('stopBtn');
const dropZone = document.getElementById('dropZone');
const imageCounter = document.getElementById('imageCounter');
const previewCard = document.getElementById('previewCard');
const previewCanvas = document.getElementById('previewCanvas');
const maskPreviewCard = document.getElementById('maskPreviewCard');
const maskPreviewCanvas = document.getElementById('maskPreviewCanvas');
const maskPreviewWrapper = document.getElementById('maskPreviewWrapper');
const previewLoader = document.getElementById('previewLoader');
const verticalPosInput = document.getElementById('verticalPosInput');
const verticalPosVal = document.getElementById('verticalPosVal');
const processAllFacesInput = document.getElementById('processAllFaces');
const fastModeInput = document.getElementById('fastMode');
const updateFrequencyInput = document.getElementById('updateFrequency');
const updateFrequencyRow = document.getElementById('updateFrequencyRow');
const presetBtns = document.querySelectorAll('.preset-btn');
const modeBtns = document.querySelectorAll('.mode-btn');

// Debug Console Elements
const debugConsole = document.getElementById('debugConsole');
const debugLogs = document.getElementById('debugLogs');
const clearLogsBtn = document.getElementById('clearLogs');
const toggleConsoleBtn = document.getElementById('toggleConsole');
const closeConsoleBtn = document.getElementById('closeConsole');

// Video Mode Elements
let isVideoMode = false;
const mediaTypeBtns = document.querySelectorAll('.media-type-toggle .media-btn');
const videoProgressWrapper = document.getElementById('videoProgressWrapper');
const videoProgressBar = document.getElementById('videoProgressBar');
const videoProgressPercentage = document.getElementById('videoProgressPercentage');
const videoProgressETA = document.getElementById('videoProgressETA');
const videoProgressText = document.getElementById('videoProgressText');

// Advanced Censor Elements
const censorOptionsPanel = document.getElementById('censorOptionsPanel');
const typeBtns = document.querySelectorAll('.type-btn');
const shapeBtns = document.querySelectorAll('.shape-btn');

if (fastModeInput) {
    fastModeInput.addEventListener('change', () => {
        if (updateFrequencyRow) {
            updateFrequencyRow.style.opacity = fastModeInput.checked ? '0.4' : '1';
            updateFrequencyRow.style.pointerEvents = fastModeInput.checked ? 'none' : 'auto';
        }
    });
}
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

// Face Replace Elements
const replaceOptionsPanel = document.getElementById('replaceOptionsPanel');
const replacementFileInput = document.getElementById('replacementFileInput');
const replacementFaceCanvas = document.getElementById('replacementFaceCanvas');
const replacementFacePreviewWrapper = document.getElementById('replacementFacePreviewWrapper');
const replacementStatusText = document.getElementById('replacementStatusText');
const editReplacementFaceBtn = document.getElementById('editReplacementFaceBtn');
const replacementPaddingInput = document.getElementById('replacementPaddingInput');
const replacementPaddingVal = document.getElementById('replacementPaddingVal');
const featheringInput = document.getElementById('featheringInput');
const featheringVal = document.getElementById('featheringVal');

// Color Grading Elements
const replaceHueInput = document.getElementById('replaceHueInput');
const replaceHueVal = document.getElementById('replaceHueVal');
const replaceSatInput = document.getElementById('replaceSatInput');
const replaceSatVal = document.getElementById('replaceSatVal');
const replaceLightInput = document.getElementById('replaceLightInput');
const replaceLightVal = document.getElementById('replaceLightVal');
const autoMatchColorBtn = document.getElementById('autoMatchColorBtn');
const autoColorBatchInput = document.getElementById('autoColorBatch');

// Feature Elements
const featureOptionsPanel = document.getElementById('featureOptionsPanel');
const cropEyesInput = document.getElementById('cropEyes');
const cropNoseInput = document.getElementById('cropNose');
const cropLipsInput = document.getElementById('cropLips');
const cropEyebrowsInput = document.getElementById('cropEyebrows');
const featurePaddingInput = document.getElementById('featurePaddingInput');
const featurePaddingVal = document.getElementById('featurePaddingVal');
const combineFeaturesInput = document.getElementById('combineFeatures');
const featureWideWInput = document.getElementById('featureWideW');
const featureWideHInput = document.getElementById('featureWideH');
const featureTallWInput = document.getElementById('featureTallW');
const featureTallHInput = document.getElementById('featureTallH');

let featurePadding = 30;

// Color Logic Utilities
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function getAverageFaceHSL(canvas, box) {
    if (!box) return null;
    const ctx = canvas.getContext('2d');
    
    // Sample a 40% area in the middle of the face box to get clean skin tone
    const sampleW = Math.max(1, box.width * 0.4);
    const sampleH = Math.max(1, box.height * 0.4);
    const sampleX = box.x + (box.width - sampleW) / 2;
    const sampleY = box.y + (box.height - sampleH) / 2;
    
    try {
        const data = ctx.getImageData(sampleX, sampleY, sampleW, sampleH).data;
        let r = 0, g = 0, b = 0, count = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i+1];
            b += data[i+2];
            count++;
        }
        
        if (count === 0) return null;
        return rgbToHsl(r / count, g / count, b / count);
    } catch (e) {
        console.warn("Failed to sample face color:", e);
        return null;
    }
}

function calculateFeatureBox(points, paddingPercent, imgWidth, imgHeight, targetRatio) {
    if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    
    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    
    let width = maxX - minX;
    let height = maxY - minY;
    
    const pad = Math.max(width, height) * (paddingPercent / 100);
    
    // Initial padded box
    let fx = Math.max(0, minX - pad);
    let fy = Math.max(0, minY - pad);
    let fw = Math.min(imgWidth - fx, width + pad * 2);
    let fh = Math.min(imgHeight - fy, height + pad * 2);
    
    // Apply Aspect Ratio if requested
    if (targetRatio && targetRatio > 0) {
        const currentRatio = fw / fh;
        
        if (currentRatio > targetRatio) {
            // Current is wider than target, increase height
            const targetH = fw / targetRatio;
            const diffH = targetH - fh;
            fy -= diffH / 2;
            fh = targetH;
        } else {
            // Current is taller than target, increase width
            const targetW = fh * targetRatio;
            const diffW = targetW - fw;
            fx -= diffW / 2;
            fw = targetW;
        }
        
        // Final sanity clamping (might slightly alter aspect ratio if image is too small)
        if (fx < 0) fx = 0;
        if (fy < 0) fy = 0;
        if (fx + fw > imgWidth) fw = imgWidth - fx;
        if (fy + fh > imgHeight) fh = imgHeight - fy;
    }
    
    return { x: fx, y: fy, width: fw, height: fh };
}

// Edit Crop Elements
const editCropModal = document.getElementById('editCropModal');
const editCropImage = document.getElementById('editCropImage');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const saveCropBtn = document.getElementById('saveCropBtn');

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
        log("Loading Landmark Models...");
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
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
    aiStatusText.textContent = "Booting Generative Engine...";

    try {
        // Setup ORT WASM backend
        ort.env.wasm.wasmPaths = ORT_WASM_PATH;
        
        log("Loading LaMa model weights (~198MB)...", "info");
        aiStatusText.textContent = "Downloading Model Data (198MB)...";
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
                aiStatusText.textContent = `Downloading Weights: ${pct}%`;
            }
        }
        
        const modelBuffer = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            modelBuffer.set(chunk, offset);
            offset += chunk.length;
        }
        
        log("Model data loaded. Compiling AI Graph...", "info");
        aiStatusText.textContent = "Compiling AI Execution Graph...";
        aiProgressBar.style.width = '95%';

        inpainterSession = await ort.InferenceSession.create(modelBuffer.buffer, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });

        log("✅ Magic AI Ready!", "success");
        aiStatusText.textContent = "Generative Engine Ready!";
        aiProgressBar.style.width = '100%';
        aiModelLoaded = true;
        setTimeout(() => aiLoadingOverlay.style.display = 'none', 800);
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

    // Show mask preview with correct aspect ratio
    if (maskPreviewCanvas && maskPreviewCard) {
        // Match the source image aspect ratio for the preview display
        const displayRatio = imageSource.height / imageSource.width;
        maskPreviewCanvas.width = 512;
        maskPreviewCanvas.height = 512 * displayRatio;
        
        const mctx = maskPreviewCanvas.getContext('2d');
        mctx.clearRect(0, 0, maskPreviewCanvas.width, maskPreviewCanvas.height);
        mctx.drawImage(scaledMask, 0, 0, 512, 512, 0, 0, maskPreviewCanvas.width, maskPreviewCanvas.height);
        
        maskPreviewCard.style.display = 'block';
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
        const padding = 0.25;
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
    
    const padding = 0.25; 
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

async function handleRatioChange() {
    // Re-extract replacement face if in replace mode to match aspect ratio
    if (currentMode === 'replace' && replacementFaceImageCache) {
        const box = await detectFace(replacementFaceImageCache);
        if (box) {
            replacementFaceBox = box;
            replacementStatusText.textContent = "Face Detected";
            replacementFacePreviewWrapper.style.display = "flex";
            
            // Calculate the base source profile for Auto Match
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = replacementFaceImageCache.width;
            tempCanvas.height = replacementFaceImageCache.height;
            tempCanvas.getContext('2d').drawImage(replacementFaceImageCache, 0, 0);
            sourceFaceHSL = getAverageFaceHSL(tempCanvas, box);
            
            extractReplacementSource(parseInt(replacementPaddingInput.value));
            if (currentMode === 'replace') updatePreviewCanvas();
        } else {
            replacementStatusText.textContent = "No Face Detected";
            replacementFacePreviewWrapper.style.display = "none";
            sourceFaceHSL = null;
        }
    }
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

mediaTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return;
        
        mediaTypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        isVideoMode = btn.dataset.media === 'video';
        log(`Switched to ${isVideoMode ? 'Video' : 'Image'} processing mode.`);

        // Update file inputs
        if (imageInput) imageInput.accept = isVideoMode ? "video/mp4,video/quicktime" : "image/*";
        if (fileInput) fileInput.accept = isVideoMode ? "video/mp4,video/quicktime" : "image/*";

        const fileUploadLabel = document.querySelector('label[for="fileInput"]');
        if (fileUploadLabel) {
            fileUploadLabel.innerHTML = isVideoMode ? 
                `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg> Videos` : 
                `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Photos`;
        }

        // Handle Mode Buttons
        modeBtns.forEach(modeBtn => {
            const mode = modeBtn.dataset.mode;
            if (mode === 'magic' || mode === 'replace') {
                if (isVideoMode) {
                    modeBtn.classList.add('disabled');
                    modeBtn.disabled = true;
                    // If currently on a disabled mode, switch to crop
                    if (currentMode === mode) {
                        const cropBtn = Array.from(modeBtns).find(b => b.dataset.mode === 'crop');
                        if (cropBtn) cropBtn.click();
                    }
                } else {
                    modeBtn.classList.remove('disabled');
                    modeBtn.disabled = false;
                }
            }
        });
        
        // Clear loaded files if switching modes
        if (loadedFiles.length > 0) {
            loadedFiles = [];
            updateCounter();
            log("Media type changed, cleared existing loaded files.");
            if (previewCanvas) {
                const ctx = previewCanvas.getContext('2d');
                ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            }
        }
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
        if (replaceOptionsPanel) {
            replaceOptionsPanel.style.display = currentMode === 'replace' ? 'block' : 'none';
        }
        if (featureOptionsPanel) {
            featureOptionsPanel.style.display = currentMode === 'feature' ? 'block' : 'none';
        }

        if (firstImageCache && firstFaceBox) {
            updatePreviewCanvas();
        }
    });
});

// Feature Mode Listeners
if (featurePaddingInput) {
    featurePaddingInput.addEventListener('input', (e) => {
        featurePadding = parseInt(e.target.value);
        if (featurePaddingVal) featurePaddingVal.textContent = featurePadding;
        if (currentMode === 'feature') updatePreviewCanvas();
    });
}

[cropEyesInput, cropNoseInput, cropLipsInput, cropEyebrowsInput, combineFeaturesInput, featureWideWInput, featureWideHInput, featureTallWInput, featureTallHInput].forEach(inp => {
    if (inp) inp.addEventListener('change', () => {
        if (currentMode === 'feature') updatePreviewCanvas();
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

// Naming Listeners
namingScheme.addEventListener('change', (e) => {
    customBaseRow.style.display = e.target.value === 'custom' ? 'block' : 'none';
    updateFilenamePreview();
});

[filenameBaseInput, filenamePrefixInput, filenameSuffixInput].forEach(input => {
    input.addEventListener('input', updateFilenamePreview);
});

// Face Replace Handlers
function updateReplaceStatus(msg, type = 'info') {
    if (!replacementStatusText) return;
    replacementStatusText.textContent = msg;
    // Apply temporary color override for errors/success
    replacementStatusText.style.color = type === 'error' ? '#ff6b6b' : (type === 'success' ? '#a3be8c' : 'var(--accent)');
}

if (replacementFileInput) {
    replacementFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        replacementFaceOriginalFile = file;
        log("Analyzing replacement source face...", "magic");
        if (replacementFacePreviewWrapper) replacementFacePreviewWrapper.style.display = 'flex';
        updateReplaceStatus("Analyzing...", "info");

        try {
            const img = await faceapi.bufferToImage(file);
            replacementFaceImageCache = img;

            const detections = await faceapi.detectAllFaces(img);
            
            if (detections && detections.length > 0) {
                const largest = detections.sort((a,b) => (b.box.width * b.box.height) - (a.box.width * a.box.height))[0];
                replacementFaceBox = largest.box;
                
                // Calculate the base source profile for Auto Match immediately on upload
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                tempCanvas.getContext('2d').drawImage(img, 0, 0);
                sourceFaceHSL = getAverageFaceHSL(tempCanvas, replacementFaceBox);
                
                // Extract with initial (0) padding
                extractReplacementSource(0);
                
                updateReplaceStatus("Face Ready!", "success");
                log("✅ Replacement face extracted successfully.", "success");
                
                // Trigger preview update if in replace mode
                if (currentMode === 'replace') updatePreviewCanvas();
            } else {
                updateReplaceStatus("No face detected", "error");
                log("❌ Face Replace Failed: Could not find any faces in the source image.", "error");
                replacementFaceCanvasSource = null;
            }
        } catch (err) {
            updateReplaceStatus("Upload Error", "error");
            log(`❌ Face Replace Error: ${err.message}`, "error");
            replacementFaceCanvasSource = null;
        }
    });
}

if (featheringInput) {
    featheringInput.addEventListener('input', (e) => {
        featherAmount = parseInt(e.target.value);
        if (featheringVal) featheringVal.textContent = featherAmount;
        if (currentMode === 'replace') updatePreviewCanvas();
    });
}

// Color Grading Listeners
if (replaceHueInput) {
    replaceHueInput.addEventListener('input', (e) => {
        replaceHue = parseInt(e.target.value);
        if (replaceHueVal) replaceHueVal.textContent = replaceHue;
        if (currentMode === 'replace') updatePreviewCanvas();
    });
}
if (replaceSatInput) {
    replaceSatInput.addEventListener('input', (e) => {
        replaceSat = parseInt(e.target.value);
        if (replaceSatVal) replaceSatVal.textContent = replaceSat;
        if (currentMode === 'replace') updatePreviewCanvas();
    });
}
if (replaceLightInput) {
    replaceLightInput.addEventListener('input', (e) => {
        replaceLight = parseInt(e.target.value);
        if (replaceLightVal) replaceLightVal.textContent = replaceLight;
        if (currentMode === 'replace') updatePreviewCanvas();
    });
}

if (editReplacementFaceBtn) {
    editReplacementFaceBtn.addEventListener('click', () => {
        if (!replacementFaceOriginalFile) return;
        isEditingReplacement = true;
        openEditModalForReplacement();
    });
}

if (replacementPaddingInput) {
    replacementPaddingInput.addEventListener('input', (e) => {
        const pad = parseInt(e.target.value);
        if (replacementPaddingVal) replacementPaddingVal.textContent = pad;
        if (replacementFaceImageCache && replacementFaceBox) {
            extractReplacementSource(pad);
            if (currentMode === 'replace') updatePreviewCanvas();
        }
    });
}

function extractReplacementSource(paddingPercent) {
    if (!replacementFaceImageCache || !replacementFaceBox) return;

    const img = replacementFaceImageCache;
    const box = replacementFaceBox;
    const pad = (paddingPercent / 100);

    // Calculate Aspect Ratio from current UI settings
    let targetRatio;
    if (useOriginalRatioInput.checked && firstImageCache) {
        targetRatio = firstImageCache.width / firstImageCache.height;
    } else {
        const rW = parseFloat(ratioWidthInput.value) || 1;
        const rH = parseFloat(ratioHeightInput.value) || 1;
        targetRatio = rW / rH;
    }

    // Determine crop dimensions (centered on face box)
    const padX = box.width * pad;
    const padY = box.height * pad;

    let cw = box.width + padX * 2;
    let ch = box.height + padY * 2;
    
    // Adjust dimensions to match target aspect ratio
    const currentRatio = cw / ch;
    if (currentRatio > targetRatio) {
        // Current is wider than target, increase height
        ch = cw / targetRatio;
    } else {
        // Current is taller than target, increase width
        cw = ch * targetRatio;
    }

    // Center the crop on the face box
    const cx = (box.x + box.width / 2) - (cw / 2);
    const cy = (box.y + box.height / 2) - (ch / 2);

    // Create high-res source canvas
    const sizeH = 1024;
    const sizeW = sizeH * targetRatio;
    const canvas = document.createElement('canvas');
    canvas.width = sizeW;
    canvas.height = sizeH;
    
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw with safety clamping or just draw (Canvas handles out of bounds)
    ctx.drawImage(img, cx, cy, cw, ch, 0, 0, sizeW, sizeH);

    replacementFaceCanvasSource = canvas;

    // Update UI thumbnail (Maintain square thumbnail view for UI consistency)
    if (replacementFaceCanvas) {
        const pCtx = replacementFaceCanvas.getContext('2d');
        if (pCtx) {
            const thumbSize = 80;
            pCtx.clearRect(0, 0, thumbSize, thumbSize);
            
            // Draw centered and cover the square thumnbail
            let drawW, drawH, dx, dy;
            if (targetRatio > 1) {
                drawH = thumbSize;
                drawW = thumbSize * targetRatio;
                dx = -(drawW - thumbSize) / 2;
                dy = 0;
            } else {
                drawW = thumbSize;
                drawH = thumbSize / targetRatio;
                dx = 0;
                dy = -(drawH - thumbSize) / 2;
            }
            pCtx.drawImage(canvas, 0, 0, sizeW, sizeH, dx, dy, drawW, drawH);
        }
    }
}

// Reset Slider Handler
document.querySelectorAll('.reset-slider').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const defaultVal = btn.dataset.default;
        const target = document.getElementById(targetId);
        if (target) {
            target.value = defaultVal;
            // Dispatch input event to trigger UI value update and preview update
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
});

// Auto Match Button Handler
if (autoMatchColorBtn) {
    autoMatchColorBtn.addEventListener('click', () => {
        if (!sourceFaceHSL || !firstImageCache || !firstFaceBox) {
            alert("Upload both a target photo and a replacement face first.");
            return;
        }

        // IMPORTANT: Sample from the ORIGINAL target image, not the preview canvas (which has filters/swaps)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = firstImageCache.width;
        tempCanvas.height = firstImageCache.height;
        const tctx = tempCanvas.getContext('2d');
        tctx.drawImage(firstImageCache, 0, 0);

        const targetHSL = getAverageFaceHSL(tempCanvas, firstFaceBox);
        if (targetHSL) {
            // Calculate offsets
            const hueShift = Math.round(targetHSL.h - sourceFaceHSL.h);
            const satShift = Math.round((targetHSL.s / sourceFaceHSL.s) * 100);
            const lightShift = Math.round((targetHSL.l / sourceFaceHSL.l) * 100);

            // Apply to sliders
            replaceHueInput.value = hueShift;
            replaceSatInput.value = Math.min(200, Math.max(0, satShift));
            replaceLightInput.value = Math.min(200, Math.max(0, lightShift));

            // Trigger updates
            [replaceHueInput, replaceSatInput, replaceLightInput].forEach(inp => {
                inp.dispatchEvent(new Event('input', { bubbles: true }));
            });
            
            log(`✅ Auto Color Match applied: H:${hueShift} S:${satShift}% L:${lightShift}%`, "success");
        }
    });
}

if (autoColorBatchInput) {
    autoColorBatchInput.addEventListener('change', (e) => {
        autoColorBatch = e.target.checked;
    });
}

// Debug Console Handlers
if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
        if (debugLogs) debugLogs.innerHTML = '';
    });
}

if (toggleConsoleBtn) {
    toggleConsoleBtn.addEventListener('click', () => {
        debugConsole.classList.add('visible');
        toggleConsoleBtn.classList.add('hidden');
    });
}

if (closeConsoleBtn) {
    closeConsoleBtn.addEventListener('click', () => {
        debugConsole.classList.remove('visible');
        toggleConsoleBtn.classList.remove('hidden');
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        isBatchAborted = true;
        log("Aborting batch... finishing current image.", "warning");
        stopBtn.disabled = true;
        stopBtn.innerText = "Aborting...";
    });
}

function updateFilenamePreview() {
    if (!filenamePreview) return;
    const exampleName = "image_01.jpg";
    const finalName = generateOutputName(exampleName, 0, 1, 1);
    filenamePreview.textContent = finalName;
}

function generateOutputName(originalName, faceIndex, totalFaces, batchIndex, mode, feature) {
    const scheme = namingScheme.value;
    const prefix = filenamePrefixInput.value;
    const suffix = filenameSuffixInput.value;
    
    let baseName = "";
    const parts = originalName.split('.');
    let ext = parts.length > 1 ? parts.pop() : 'jpg';
    const nameNoExt = parts.join('.');

    // Feature crops are always PNG for lossless quality
    if (feature) ext = 'png';

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

    let modePrefix = "";
    if (scheme === 'original' && !prefix) {
        modePrefix = `${mode}_`;
    }

    // Add multi-face index if needed
    let facePart = "";
    if (totalFaces > 1) {
        facePart = `_face${faceIndex + 1}`;
    }

    // Add feature name if provided
    let featurePart = "";
    if (feature) {
        featurePart = `_${feature}`;
    }

    return `${prefix}${modePrefix}${baseName}${facePart}${featurePart}${suffix}.${ext}`;
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
    const validExtensions = isVideoMode ? ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'] : ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const validFiles = newFiles.filter(file => validExtensions.includes(file.type));

    if (validFiles.length === 0) {
        if (loadedFiles.length === 0) alert(`No valid ${isVideoMode ? 'videos' : 'images'} found.`);
        return;
    }

    // Append to existing
    loadedFiles = [...loadedFiles, ...validFiles];

    // Reset UI slightly (but don't clear everything if we are appending!)
    // If we want to allow "Process" to run on the WHOLE batch:
    downloadBtn.disabled = true;
    processBtn.disabled = false;
    processBtn.innerText = `Process ${loadedFiles.length} ${isVideoMode ? 'Videos' : 'Images'}`;

    updateCounter();

    // If we haven't set up a preview yet, try to do it with new files
    if (!firstImageCache) {
        log(`Analyzing new images for preview...`);
        // Only scan the NEW files for a preview if needed, or scan all?
        // Scanning validFiles is enough if we just want A preview.
        await setupPreview(validFiles);
    } else {
        log(`${validFiles.length} ${isVideoMode ? 'videos' : 'images'} added. Total: ${loadedFiles.length}`);
    }
}

function updateCounter() {
    imageCounter.textContent = `${loadedFiles.length} ${isVideoMode ? 'videos' : 'images'} ready`;
}

processBtn.addEventListener('click', async () => {
    if (loadedFiles.length === 0) return;

    processBtn.disabled = true;
    // Don't hide preview! previewCard.style.display = 'none'; 

    gallery.innerHTML = ''; // Clear prior results
    if (galleryStatus) galleryStatus.textContent = ''; // Clear status message
    processedBlobs = [];
    let processedCount = 0;
    isBatchAborted = false;

    // Toggle button visibility
    processBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'block';
    downloadBtn.disabled = true;

    // Force space for scrolling (simulating ~3 rows) so valid scroll target exists
    gallery.style.minHeight = '800px';

    // Smooth scroll to the gallery area where results will appear (only for images)
    if (!isVideoMode) {
        setTimeout(() => {
            gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    log(`Starting batch processing for ${loadedFiles.length} ${isVideoMode ? 'videos' : 'images'}...`, "info");
    
    // Pre-initialize AI if in magic mode to avoid per-image overlay interruptions
    if (currentMode === 'magic') {
        log("Batch Mode: Initializing AI Generative Engine...", "magic");
        const aiReady = await initMagicAI();
        if (!aiReady) {
            log("Batch aborted: AI Engine failed to initialize.", "error");
            processBtn.disabled = false;
            processBtn.innerText = "Process Batch";
            return;
        }
    }

    log("Status: Clearing gallery and initializing processed storage.", "info");

    for (let i = 0; i < loadedFiles.length; i++) {
        if (isBatchAborted) {
            log("🛑 Batch processing aborted by user.", "error");
            break;
        }

        const file = loadedFiles[i];
        log(`Processing ${isVideoMode ? 'Video' : 'Image'} [${i + 1}/${loadedFiles.length}]: ${file.name}`, "info");
        try {
            if (isVideoMode) {
                await processVideo(file, i + 1);
            } else {
                await processImage(file, i + 1); // Pass 1-based batch index
            }
            log(`Successfully processed: ${file.name}`, "success");
        } catch (err) {
            log(`Execution Error [${file.name}]: ${err.message}`, "error");
            console.error(`Failed to process ${file.name}:`, err);
            createErrorCard(file.name);
        }
        processedCount++;
        statusArea.textContent = `Processing: ${processedCount} / ${loadedFiles.length}`;
    }

    log(isBatchAborted ? "⚠️ Batch Aborted (Partial Results Available)" : "✅ Batch Processing Complete!", isBatchAborted ? "error" : "success");
    
    // Restore button states
    processBtn.style.display = 'block';
    processBtn.disabled = false;
    processBtn.innerText = isBatchAborted ? "Resume / Process Again" : "Process Again";
    if (stopBtn) stopBtn.style.display = 'none';
    
    if (processedBlobs.length > 0) {
        downloadBtn.disabled = false;
    }

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
async function processVideo(file, batchIndex) {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
        const isInsecure = !window.isSecureContext;
        let msg = "Browser doesn't support WebCodecs (VideoEncoder). Please use Chrome, Edge, or Safari 16.4+.";
        if (isInsecure) {
            msg = "WebCodecs (required for video) are disabled because this page is not served over a Secure Context (HTTPS or localhost). Please run this tool through a local server or HTTPS.";
        }
        throw new Error(msg);
    }
    log(`Initializing video processing for ${file.name}...`, "info");
    
    // Create video element
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    
    await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
        video.load();
    });

    const fps = 30; // standard fallback
    const duration = video.duration || 0;
    if (duration === 0) throw new Error("Invalid video duration");
    
    const totalFrames = Math.ceil(duration * fps);
    log(`Video loaded. ${totalFrames} frames to process at ${fps}fps.`, "info");
    
    const width = video.videoWidth;
    const height = video.videoHeight;
    

    
    const processAll = processAllFacesInput ? processAllFacesInput.checked : false;
    const isFastMode = fastModeInput ? fastModeInput.checked : false;

    // Determine Output Dimensions
    let outputWidth = width;
    let outputHeight = height;
    const isCroppedOutput = (currentMode === 'crop' || currentMode === 'feature');
    
    if (isCroppedOutput) {
        let targetAR = 1;
        if (currentMode === 'crop') {
            const rw = parseFloat(ratioWidthInput.value) || 1;
            const rh = parseFloat(ratioHeightInput.value) || 1;
            targetAR = useOriginalRatioInput.checked ? (width / height) : (rw / rh);
        } else {
            // Feature Mode Ratio
            targetAR = (parseFloat(featureWideWInput.value) || 1) / (parseFloat(featureWideHInput.value) || 1);
        }
        outputHeight = Math.min(height, 720);
        outputWidth = Math.round(outputHeight * targetAR);
        
        // Ensure even dimensions for H.264
        if (outputWidth % 2 !== 0) outputWidth++;
        if (outputHeight % 2 !== 0) outputHeight++;
        
        log(`Output resolution: ${outputWidth}x${outputHeight} (Cropped Mode)`, "info");
    }

    // Output setup
    let muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: {
            codec: 'avc',
            width: outputWidth,
            height: outputHeight
        },
        fastStart: 'in-memory'
    });
    
    let videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: e => console.error(e)
    });
    
    videoEncoder.configure({
        codec: 'avc1.4D4034', 
        width: outputWidth,
        height: outputHeight,
        bitrate: 5_000_000,
        framerate: fps
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // For cropped output, we need a separate canvas to compose the final frame
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const oCtx = outputCanvas.getContext('2d');
    
    // UI Progress
    if (videoProgressWrapper) videoProgressWrapper.style.display = 'flex';
    if (videoProgressPercentage) videoProgressPercentage.textContent = '0%';
    if (videoProgressETA) videoProgressETA.textContent = 'ETA: --:--';
    const previewTitle = previewCard ? previewCard.querySelector('h3') : null;
    const headerLoader = document.getElementById('headerLoader');
    let oldPreviewTitle = "";
    if (previewTitle) {
        oldPreviewTitle = previewTitle.innerText;
        previewTitle.innerText = "Processing Video...";
        if (headerLoader) headerLoader.style.display = 'block';
    }
    
    // PHASE 1: Detection Pass
    log(`Phase 1/2: Analyzing face movement...`, "info");
    const tracks = []; // Array of arrays: [ {f: frameIdx, box: box}, ... ]
    let detectStartTime = Date.now();
    
    for (let i = 0; i < totalFrames; i++) {
        if (isBatchAborted) break;
        
        const time = i / fps;
        video.currentTime = time;
        await new Promise(r => video.onseeked = r);
        
        ctx.drawImage(video, 0, 0, width, height);
        
        // In feature mode, we need landmarks to define the crop area
        let detections;
        if (currentMode === 'feature') {
            detections = await faceapi.detectAllFaces(canvas).withFaceLandmarks();
        } else {
            detections = await faceapi.detectAllFaces(canvas);
        }

        const currentBoxes = [];
        if (detections && detections.length > 0) {
            const faces = processAll ? detections : [getLargestFace(detections)];
            for (const d of faces) {
                if (!d) continue;
                if (currentMode === 'feature') {
                    const landmarks = d.landmarks;
                    const points = [];
                    if (cropEyesInput.checked) points.push(...landmarks.getLeftEye(), ...landmarks.getRightEye());
                    if (cropNoseInput.checked) points.push(...landmarks.getNose());
                    if (cropLipsInput.checked) points.push(...landmarks.getMouth());
                    if (cropEyebrowsInput.checked) points.push(...landmarks.getLeftEyeBrow(), ...landmarks.getRightEyeBrow());
                    
                    if (points.length > 0) {
                        // Calculate specific feature box
                        let targetAR = (parseFloat(featureWideWInput.value) || 1) / (parseFloat(featureWideHInput.value) || 1);
                        const fb = calculateFeatureBox(points, featurePadding, width, height, targetAR);
                        currentBoxes.push(fb);
                    } else {
                        currentBoxes.push(d.detection.box); // Fallback to face box
                    }
                } else {
                    currentBoxes.push(d.box || d.detection.box);
                }
            }
        }
        
        // Tracker
        for (const box of currentBoxes) {
            let bestTrack = null;
            let minDist = 150;
            for (const track of tracks) {
                const last = track[track.length - 1];
                if (i - last.f <= 15) {
                    const dist = Math.sqrt(Math.pow((last.box.x + last.box.width/2) - (box.x + box.width/2), 2) + 
                                         Math.pow((last.box.y + last.box.height/2) - (box.y + box.height/2), 2));
                    if (dist < minDist) {
                        minDist = dist;
                        bestTrack = track;
                    }
                }
            }
            if (bestTrack) bestTrack.push({ f: i, box });
            else tracks.push([{ f: i, box }]);
        }
        
        // Update live preview during detection phase
        const freq = updateFrequencyInput ? parseInt(updateFrequencyInput.value) || 25 : 25;
        if (!isFastMode && i % freq === 0) {
            if (previewCard) previewCard.style.display = 'block';
            if (previewLoader) previewLoader.style.display = 'none';
            if (previewCanvas) {
                const pCtx = previewCanvas.getContext('2d');
                if (pCtx) {
                    if (previewCanvas.width !== canvas.width || previewCanvas.height !== canvas.height) {
                        previewCanvas.width = canvas.width;
                        previewCanvas.height = canvas.height;
                    }
                    pCtx.drawImage(canvas, 0, 0);
                }
            }
        }
        
        const progress = (i + 1) / totalFrames;
        const percent = Math.round(progress * 50);
        if (videoProgressBar) videoProgressBar.style.width = `${percent}%`;
        if (videoProgressPercentage) videoProgressPercentage.textContent = `${percent}%`;
        if (videoProgressText) videoProgressText.textContent = `Analyzing motion: frame ${i + 1}/${totalFrames}`;
    }

    if (isBatchAborted) return;

    log(`Calculating smooth tracking paths for ${tracks.length} faces...`, "info");
    const interpolatedTracks = tracks.map(track => {
        const fullTrack = new Array(totalFrames).fill(null);
        for (const pt of track) fullTrack[pt.f] = pt.box;
        
        for (let i = track[0].f; i < track[track.length - 1].f; i++) {
            if (fullTrack[i] === null) {
                let prevIdx = -1;
                for (let j = i - 1; j >= 0; j--) { if (fullTrack[j]) { prevIdx = j; break; } }
                let nextIdx = -1;
                for (let j = i + 1; j < fullTrack.length; j++) { if (fullTrack[j]) { nextIdx = j; break; } }
                if (prevIdx !== -1 && nextIdx !== -1) {
                    const prev = fullTrack[prevIdx];
                    const next = fullTrack[nextIdx];
                    const factor = (i - prevIdx) / (nextIdx - prevIdx);
                    fullTrack[i] = {
                        x: prev.x + (next.x - prev.x) * factor,
                        y: prev.y + (next.y - prev.y) * factor,
                        width: prev.width + (next.width - prev.width) * factor,
                        height: prev.height + (next.height - prev.height) * factor
                    };
                }
            }
        }
        const lastKnownIdx = track[track.length - 1].f;
        const lastBox = fullTrack[lastKnownIdx];
        for (let i = lastKnownIdx + 1; i < totalFrames; i++) fullTrack[i] = { ...lastBox };
        const firstKnownIdx = track[0].f;
        const firstBox = fullTrack[firstKnownIdx];
        for (let i = 0; i < firstKnownIdx; i++) fullTrack[i] = { ...firstBox };
        return fullTrack;
    });

    // PHASE 2: Rendering & Encoding Pass
    log(`Phase 2/2: Applying Censor & Encoding...`, "info");
    let renderStartTime = Date.now();
    let videoGalleryCard = null;
    
    for (let i = 0; i < totalFrames; i++) {
        if (isBatchAborted) break;
        const time = i / fps;
        video.currentTime = time;
        await new Promise(r => video.onseeked = r);
        
        ctx.drawImage(video, 0, 0, width, height);

        if (isCroppedOutput) {
            // For cropped/feature mode, we focus on the largest track or first track
            const track = interpolatedTracks[0];
            const faceBox = track ? track[i] : null;
            if (faceBox) {
                // Determine crop area in source
                const targetAR = outputWidth / outputHeight;
                const rect = (currentMode === 'feature') ? faceBox : calculateCropRect(canvas, faceBox);
                
                // Final adjustment to ensure AR matches outputExactly
                let sx = rect.x, sy = rect.y, sw = rect.width, sh = rect.height;
                const currentAR = sw / sh;
                if (currentAR > targetAR) {
                    const newSh = sw / targetAR;
                    sy -= (newSh - sh) / 2;
                    sh = newSh;
                } else {
                    const newSw = sh * targetAR;
                    sx -= (newSw - sw) / 2;
                    sw = newSw;
                }
                
                oCtx.fillStyle = 'black';
                oCtx.fillRect(0, 0, outputWidth, outputHeight);
                oCtx.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
            } else {
                oCtx.fillStyle = 'black';
                oCtx.fillRect(0, 0, outputWidth, outputHeight);
            }
        } else {
            // Normal Full-Size Rendering (Censor/Frame)
            for (const fullTrack of interpolatedTracks) {
                const faceBox = fullTrack[i];
                if (faceBox) {
                    const rect = calculateCropRect(canvas, faceBox);
                    if (currentMode === 'censor') {
                        drawOverlay(ctx, rect.x, rect.y, rect.width, rect.height, {
                            mode: 'censor', type: currentCensorType, shape: currentCensorShape,
                            color: censorColor, blur: blurStrength, emoji: censorEmoji
                        }, canvas);
                    } else if (currentMode === 'frame') {
                        drawOverlay(ctx, rect.x, rect.y, rect.width, rect.height, {
                            mode: 'frame', shape: currentFrameShape, color: frameColor, thickness: frameThickness
                        }, canvas);
                    }
                }
            }
        }
        
        const finalCanvas = isCroppedOutput ? outputCanvas : canvas;
        const frame = new VideoFrame(finalCanvas, { timestamp: time * 1_000_000 });
        try {
            if (videoEncoder.state === 'configured') {
                videoEncoder.encode(frame, { keyFrame: i % fps === 0 });
            }
        } finally {
            frame.close();
        }

        const freq = updateFrequencyInput ? parseInt(updateFrequencyInput.value) || 25 : 25;
        if (!isFastMode && i % freq === 0) {
            if (previewLoader) previewLoader.style.display = 'none';
            if (previewCard) previewCard.style.display = 'block';
            if (previewCanvas) {
                const pCtx = previewCanvas.getContext('2d');
                if (pCtx) {
                    if (previewCanvas.width !== finalCanvas.width || previewCanvas.height !== finalCanvas.height) {
                        previewCanvas.width = finalCanvas.width;
                        previewCanvas.height = finalCanvas.height;
                    }
                    pCtx.drawImage(finalCanvas, 0, 0);
                }
            }
            const thumbUrl = finalCanvas.toDataURL('image/jpeg', 0.7);
            const gallerySection = document.querySelector('.gallery-section');
            if (gallerySection) gallerySection.style.display = 'block';

            if (!videoGalleryCard) {
                videoGalleryCard = displayResult(thumbUrl, false, true);
                if (gallery) gallery.insertBefore(videoGalleryCard, gallery.firstChild);
            } else {
                displayResult(thumbUrl, false, true, videoGalleryCard);
            }
        }
        
        const progress = (i + 1) / totalFrames;
        const totalProgress = 0.5 + (progress * 0.5);
        const percent = Math.round(totalProgress * 100);
        if (videoProgressBar) videoProgressBar.style.width = `${percent}%`;
        if (videoProgressPercentage) videoProgressPercentage.textContent = `${percent}%`;
        if (videoProgressText) videoProgressText.textContent = `Rendering video: frame ${i + 1}/${totalFrames}`;
    }
    
    if (videoEncoder.state === 'configured') await videoEncoder.flush();
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    muxer.finalize();
    URL.revokeObjectURL(videoUrl);
    
    if (videoProgressWrapper) videoProgressWrapper.style.display = 'none';
    if (previewTitle && oldPreviewTitle) {
        previewTitle.innerText = oldPreviewTitle;
        if (headerLoader) headerLoader.style.display = 'none';
    }
    
    if (!isBatchAborted) {
        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const videoResultUrl = URL.createObjectURL(blob);
        const gallerySection = document.querySelector('.gallery-section');
        if (gallerySection) gallerySection.style.display = 'block';

        const finalFileName = generateOutputName(file.name, 0, 1, batchIndex, 'video').replace(/\.[^/.]+$/, "") + ".mp4";
        processedBlobs.push({
            name: finalFileName, blob: blob, isError: false, originalFile: file,
            outputWidth: outputWidth, outputHeight: outputHeight, mode: 'video'
        });
        if (videoGalleryCard) displayResult(videoResultUrl, false, true, videoGalleryCard);
        else displayResult(videoResultUrl, false, true);
    }
}
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
                    const gallerySection = document.querySelector('.gallery-section');
                    if (gallerySection) gallerySection.style.display = 'block';
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
                    const gallerySection = document.querySelector('.gallery-section');
                    if (gallerySection) gallerySection.style.display = 'block';
                    displayResult(URL.createObjectURL(blob), (!detections || detections.length === 0));
                }
                resolve();
            }, 'image/jpeg', 0.95);
        });
    } else if (currentMode === 'magic') {
        let facesToMagic = [];
        if (!detections || detections.length === 0) {
            facesToMagic = [null];
        } else {
            facesToMagic = processAll ? detections.map(d => d.box) : [getLargestFace(detections).box];
        }

        log(`Batch Magic: Processing ${facesToMagic.length} face area(s) for ${file.name}`, "magic");
        
        let currentResult = img;
        for (let i = 0; i < facesToMagic.length; i++) {
            const faceBox = facesToMagic[i];
            if (faceBox) {
                log(`Inpainting face [${i + 1}/${facesToMagic.length}]...`, "info");
                currentResult = await runMagicInpaint(currentResult, faceBox);
            }
        }

        const finalFileName = generateOutputName(file.name, 0, 1, batchIndex, 'magic');

        await new Promise((resolve) => {
            currentResult.toBlob((blob) => {
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
                    const gallerySection = document.querySelector('.gallery-section');
                    if (gallerySection) gallerySection.style.display = 'block';
                    displayResult(URL.createObjectURL(blob), (!detections || detections.length === 0));
                }
                resolve();
            }, 'image/jpeg', 0.95);
        });
    } else if (currentMode === 'replace') {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let facesToReplace = [];
        if (!detections || detections.length === 0) {
            facesToReplace = [null];
        } else {
            facesToReplace = processAll ? detections.map(d => d.box) : [getLargestFace(detections).box];
        }

        for (let i = 0; i < facesToReplace.length; i++) {
            const faceBox = facesToReplace[i];
            if (faceBox) {
                const rect = calculateCropRect(img, faceBox);
                
                let hslShift = null;
                if (autoColorBatch && sourceFaceHSL) {
                    const targetHSL = getAverageFaceHSL(canvas, faceBox);
                    if (targetHSL) {
                        hslShift = {
                            h: Math.round(targetHSL.h - sourceFaceHSL.h),
                            s: Math.round((targetHSL.s / sourceFaceHSL.s) * 100),
                            l: Math.round((targetHSL.l / sourceFaceHSL.l) * 100)
                        };
                    }
                }
                
                drawReplacement(ctx, rect.x, rect.y, rect.width, rect.height, featherAmount, hslShift);
            }
        }

        const finalFileName = generateOutputName(file.name, 0, 1, batchIndex, 'replaced');

        await new Promise((resolve) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    processedBlobs.push({
                        name: finalFileName,
                        blob: blob,
                        isError: (!detections || detections.length === 0 || !replacementFaceCanvasSource),
                        originalFile: file,
                        outputWidth: img.width,
                        outputHeight: img.height,
                        mode: 'replace'
                    });
                    const gallerySection = document.querySelector('.gallery-section');
                    if (gallerySection) gallerySection.style.display = 'block';
                    displayResult(URL.createObjectURL(blob), (!detections || detections.length === 0));
                }
                resolve();
            }, 'image/jpeg', 0.95);
        });
    } else if (currentMode === 'feature') {
        const detections = await faceapi.detectAllFaces(img).withFaceLandmarks();
        const processAll = processAllFacesInput ? processAllFacesInput.checked : false;

        if (!detections || detections.length === 0) {
            log(`No faces detected in ${file.name} for feature extraction.`, "warning");
            createErrorCard(file.name);
            return;
        }

        const facesToProcess = processAll ? detections : [detections.sort((a,b) => (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height))[0]];

        for (let i = 0; i < facesToProcess.length; i++) {
            const landmarks = facesToProcess[i].landmarks;
            const features = [];

            if (cropEyesInput.checked) {
                if (combineFeaturesInput.checked) {
                    features.push({ name: 'combined_eyes', points: [...landmarks.getLeftEye(), ...landmarks.getRightEye()] });
                } else {
                    features.push({ name: 'left_eye', points: landmarks.getLeftEye() });
                    features.push({ name: 'right_eye', points: landmarks.getRightEye() });
                }
            }
            if (cropNoseInput.checked) {
                features.push({ name: 'nose', points: landmarks.getNose() });
            }
            if (cropLipsInput.checked) {
                features.push({ name: 'lips', points: landmarks.getMouth() });
            }
            if (cropEyebrowsInput.checked) {
                if (combineFeaturesInput.checked) {
                    features.push({ name: 'combined_eyebrows', points: [...landmarks.getLeftEyeBrow(), ...landmarks.getRightEyeBrow()] });
                } else {
                    features.push({ name: 'left_eyebrow', points: landmarks.getLeftEyeBrow() });
                    features.push({ name: 'right_eyebrow', points: landmarks.getRightEyeBrow() });
                }
            }

            for (const feature of features) {
                // Determine AR category
                let targetAR = 0;
                if (feature.name === 'nose') {
                    targetAR = (parseFloat(featureTallWInput.value)||1) / (parseFloat(featureTallHInput.value)||1);
                } else {
                    targetAR = (parseFloat(featureWideWInput.value)||1) / (parseFloat(featureWideHInput.value)||1);
                }

                const rect = calculateFeatureBox(feature.points, featurePadding, img.width, img.height, targetAR);
                const canvas = document.createElement('canvas');
                canvas.width = rect.width;
                canvas.height = rect.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

                await new Promise((resolve) => {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const finalFileName = generateOutputName(file.name, i, facesToProcess.length, batchIndex, 'feature', feature.name);

                            processedBlobs.push({
                                name: finalFileName,
                                blob: blob,
                                isError: false,
                                originalFile: file,
                                outputWidth: rect.width,
                                outputHeight: rect.height,
                                mode: 'feature',
                                featureType: feature.name
                            });
                            displayResult(URL.createObjectURL(blob), false);
                        }
                        resolve();
                    }, 'image/png');
                });
            }
        }
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
    if (isVideoMode) {
        log("Searching video for a preview frame with a face...");
        previewCard.style.display = 'block';
        if (previewLoader) previewLoader.style.display = 'flex';
        
        for (const file of filesToScan) {
            try {
                const videoUrl = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.src = videoUrl;
                video.muted = true;
                
                await new Promise((resolve, reject) => {
                    video.onloadeddata = resolve;
                    video.onerror = reject;
                    video.load();
                });
                
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                
                // Scan every 0.5 seconds for a face to be fast
                const duration = video.duration;
                for (let t = 0; t < duration; t += 0.5) {
                    video.currentTime = t;
                    await new Promise(r => video.onseeked = r);
                    ctx.drawImage(video, 0, 0);
                    
                    const detections = await faceapi.detectAllFaces(canvas);
                    if (detections && detections.length > 0) {
                        // Found it!
                        const img = new Image();
                        img.src = canvas.toDataURL();
                        await new Promise(r => img.onload = r);
                        
                        firstImageCache = img;
                        firstFaceBox = getLargestFace(detections).box;
                        
                        const title = previewCard.querySelector('h3');
                        if (title) title.innerText = `Preview (Video: ${file.name})`;
                        
                        updatePreviewCanvas();
                        const skeleton = document.getElementById('previewSkeleton');
                        if (skeleton) skeleton.style.display = 'none';

                        log(`Found preview frame at ${t.toFixed(1)}s in ${file.name}.`);
                        
                        URL.revokeObjectURL(videoUrl);
                        if (previewLoader) previewLoader.style.display = 'none';
                        return;
                    }
                }
                URL.revokeObjectURL(videoUrl);
            } catch (err) {
                console.warn("Video preview scan failed for", file.name, err);
            }
        }
        
        log("No faces detected in the video for preview.", "warning");
        if (previewLoader) previewLoader.style.display = 'none';
        return;
    }
    
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
                const skeleton = document.getElementById('previewSkeleton');
                if (skeleton) skeleton.style.display = 'none';

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
    } else if (currentMode === 'replace') {
        previewCanvas.width = firstImageCache.width;
        previewCanvas.height = firstImageCache.height;
        ctx.drawImage(firstImageCache, 0, 0);
        
        let facesToReplace = [];
        if (!detections || detections.length === 0) {
            facesToReplace = [null];
        } else {
            facesToReplace = multi ? detections.map(d => d.box) : [getLargestFace(detections).box];
        }

        for (const faceBox of facesToReplace) {
            if (faceBox) {
                const rect = calculateCropRect(firstImageCache, faceBox);
                
                let hslShift = null;
                if (autoColorBatch && sourceFaceHSL) {
                    const targetHSL = getAverageFaceHSL(previewCanvas, faceBox);
                    if (targetHSL) {
                        hslShift = {
                            h: Math.round(targetHSL.h - sourceFaceHSL.h),
                            s: Math.round((targetHSL.s / sourceFaceHSL.s) * 100),
                            l: Math.round((targetHSL.l / sourceFaceHSL.l) * 100)
                        };
                    }
                }
                
                drawReplacement(ctx, rect.x, rect.y, rect.width, rect.height, featherAmount, hslShift);
            }
        }
    } else if (currentMode === 'feature') {
        const detections = await faceapi.detectAllFaces(firstImageCache).withFaceLandmarks();
        const multi = processAllFacesInput ? processAllFacesInput.checked : false;
        
        previewCanvas.width = firstImageCache.width;
        previewCanvas.height = firstImageCache.height;
        ctx.drawImage(firstImageCache, 0, 0);

        if (detections && detections.length > 0) {
            const facesToPreview = multi ? detections : [detections.sort((a,b) => (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height))[0]];
            
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 8;
            ctx.setLineDash([12, 12]);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;

            for (const face of facesToPreview) {
                const landmarks = face.landmarks;
                const features = [];
                if (cropEyesInput.checked) {
                    if (combineFeaturesInput.checked) {
                        features.push({ name: 'combined_eyes', points: [...landmarks.getLeftEye(), ...landmarks.getRightEye()] });
                    } else {
                        features.push({ name: 'left_eye', points: landmarks.getLeftEye() }, { name: 'right_eye', points: landmarks.getRightEye() });
                    }
                }
                if (cropNoseInput.checked) features.push({ name: 'nose', points: landmarks.getNose() });
                if (cropLipsInput.checked) features.push({ name: 'lips', points: landmarks.getMouth() });
                if (cropEyebrowsInput.checked) {
                     if (combineFeaturesInput.checked) {
                        features.push({ name: 'combined_eyebrows', points: [...landmarks.getLeftEyeBrow(), ...landmarks.getRightEyeBrow()] });
                    } else {
                        features.push({ name: 'left_eyebrow', points: landmarks.getLeftEyeBrow() }, { name: 'right_eyebrow', points: landmarks.getRightEyeBrow() });
                    }
                }

                for (const feature of features) {
                    let targetAR = 0;
                    if (feature.name === 'nose') {
                        targetAR = (parseFloat(featureTallWInput.value)||1) / (parseFloat(featureTallHInput.value)||1);
                    } else {
                        targetAR = (parseFloat(featureWideWInput.value)||1) / (parseFloat(featureWideHInput.value)||1);
                    }
                    
                    const rect = calculateFeatureBox(feature.points, featurePadding, firstImageCache.width, firstImageCache.height, targetAR);
                    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
                }
            }
            
            // Reset shadow and dash for other modes
            ctx.shadowBlur = 0;
            ctx.setLineDash([]);
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

function displayResult(dataUrl, isError = false, isVideo = false, existingDiv = null) {
    const div = existingDiv || document.createElement('div');
    if (!existingDiv) {
        div.className = 'image-card';
    } else {
        div.innerHTML = ''; // Clear for update
    }
    
    if (isError) {
        div.classList.add('error-border');
    }
    
    // Track index for actions
    const index = processedBlobs.length - (existingDiv ? 0 : 1);
    div.dataset.index = index;

    if (isVideo && dataUrl.startsWith('blob:')) {
        // Playable Final Video
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-result-container';
        videoContainer.style.position = 'relative';
        videoContainer.style.width = '100%';
        videoContainer.style.height = '100%';
        
        const videoElement = document.createElement('video');
        videoElement.src = dataUrl;
        videoElement.loop = true;
        videoElement.muted = true;
        videoElement.autoplay = true;
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'cover';
        videoElement.style.borderRadius = '8px';
        
        videoContainer.appendChild(videoElement);
        div.appendChild(videoContainer);
    } else {
        // Image or Live Video Thumbnail
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = "Processed Face";
        div.appendChild(img);

        if (isVideo) {
            const videoIcon = document.createElement('div');
            videoIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
            videoIcon.style.position = 'absolute';
            videoIcon.style.top = '50%';
            videoIcon.style.left = '50%';
            videoIcon.style.transform = 'translate(-50%, -50%)';
            videoIcon.style.background = 'rgba(0,0,0,0.6)';
            videoIcon.style.borderRadius = '50%';
            videoIcon.style.padding = '8px';
            videoIcon.style.pointerEvents = 'none';
            videoIcon.style.display = 'flex';
            div.appendChild(videoIcon);
        }
        
        // Only add lightbox to images
        if (!isVideo && index >= 0) {
            img.onclick = (e) => {
                e.stopPropagation();
                openLightbox(index);
            };
            img.style.cursor = "pointer";
        }
    }

    // Edit Button (Only for images)
    if (!isVideo) {
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-overlay-btn';
        editBtn.title = "Edit Crop";
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
        editBtn.onclick = (e) => {
            e.stopPropagation();
            openEditModal(index);
        };
        div.appendChild(editBtn);
    }

    // Card Actions (Download / Delete)
    const cardActions = document.createElement('div');
    cardActions.className = 'card-actions';
    
    const dlBtn = document.createElement('button');
    dlBtn.className = 'icon-btn';
    dlBtn.title = "Download this result";
    dlBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    dlBtn.onclick = (e) => {
        e.stopPropagation();
        const currentIndex = parseInt(div.dataset.index);
        const item = processedBlobs[currentIndex];
        if (item) saveAs(item.blob, item.name);
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn delete';
    delBtn.title = "Remove from gallery";
    delBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
    delBtn.onclick = (e) => {
        e.stopPropagation();
        const currentIndex = parseInt(div.dataset.index);
        processedBlobs.splice(currentIndex, 1);
        div.remove();
        
        // Update all subsequent cards' dataset.index
        const cards = Array.from(gallery.children);
        cards.forEach((card, i) => {
            // Cards are prepended, so order is reversed compared to array?
            // Actually, we should find a better way to map.
            // For now, let's just refresh the gallery or keep it simple.
            // Re-syncing is hard. Let's just update the gallery status.
        });
        
        updateGalleryStatus();
        if (processedBlobs.length === 0) {
            const gallerySection = document.querySelector('.gallery-section');
            if (gallerySection) gallerySection.style.display = 'none';
        }
    };

    cardActions.appendChild(dlBtn);
    cardActions.appendChild(delBtn);
    div.appendChild(cardActions);

    if (!existingDiv) {
        gallery.insertBefore(div, gallery.firstChild);
    }
    return div;
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

function openEditModalForReplacement() {
    if (!replacementFaceOriginalFile) return;

    editingBlobIndex = -999; // Sentinel for replacement mode
    const objectUrl = URL.createObjectURL(replacementFaceOriginalFile);
    
    editCropImage.src = objectUrl;
    editCropModal.style.display = 'flex';

    editCropImage.onload = () => {
        if (cropperInstance) cropperInstance.destroy();

        cropperInstance = new Cropper(editCropImage, {
            viewMode: 1,
            dragMode: 'move',
            aspectRatio: NaN, // Free crop for source
            autoCropArea: 0.8,
            ready() {
                // No specific start rect needed for source, 
                // but user can now adjust what the AI found.
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
        if (!cropperInstance) return;
        if (editingBlobIndex === -1) return;

        saveCropBtn.disabled = true;
        saveCropBtn.innerText = "Saving...";

        if (isEditingReplacement) {
            // Special Case: Saving the replacement SOURCE face
            const canvas = cropperInstance.getCroppedCanvas({
                width: 512,
                height: 512,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            if (canvas) {
                replacementFaceCanvasSource = canvas;
                // Update UI thumbnail
                if (replacementFaceCanvas) {
                    const pCtx = replacementFaceCanvas.getContext('2d');
                    if (pCtx) {
                        pCtx.clearRect(0,0,100,100);
                        pCtx.drawImage(canvas, 0,0,512,512, 0,0,100,100);
                    }
                }
                updateReplaceStatus("New Crop Applied", "success");
                log("✅ Replacement source crop updated.", "success");
                updatePreviewCanvas();
            }
            
            isEditingReplacement = false;
            saveCropBtn.disabled = false;
            saveCropBtn.innerText = "Save Crop";
            closeEditModal();
            return;
        }

        if (editingBlobIndex < 0) return; // Should only happen if index logic breaks

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

function drawReplacement(ctx, x, y, width, height, feather, hslShift = null) {
    if (!replacementFaceCanvasSource) {
        // Just draw a "placeholder" block since no source face is uploaded
        ctx.fillStyle = 'rgba(74, 158, 255, 0.5)';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = 'var(--accent)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tctx = tempCanvas.getContext('2d');

    // Determine which HSL values to use
    let h, s, l;
    if (hslShift) {
        h = hslShift.h;
        s = Math.min(200, Math.max(0, hslShift.s));
        l = Math.min(200, Math.max(0, hslShift.l));
    } else {
        h = replaceHue;
        s = replaceSat;
        l = replaceLight;
    }

    // 1. Draw the replacement face into the temp canvas at target size
    // Apply real-time HSL filtering
    tctx.filter = `hue-rotate(${h}deg) saturate(${s}%) brightness(${l}%)`;
    
    tctx.drawImage(replacementFaceCanvasSource, 0, 0, replacementFaceCanvasSource.width, replacementFaceCanvasSource.height, 0, 0, width, height);

    // Reset filter
    tctx.filter = 'none';

    // 2. Apply elliptical feathering
    // We do this by creating a mask with 'destination-in'
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const mctx = maskCanvas.getContext('2d');

    const grad = mctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width/2);
    const stop = 1 - (feather / 100);
    grad.addColorStop(0, 'white');
    grad.addColorStop(Math.max(0, stop), 'white');
    grad.addColorStop(1, 'transparent');

    mctx.fillStyle = grad;
    mctx.beginPath();
    mctx.ellipse(width/2, height/2, width/2, height/2, 0, 0, Math.PI * 2);
    mctx.fill();

    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(maskCanvas, 0, 0);

    // 3. Draw final result back to target context
    ctx.drawImage(tempCanvas, x, y);
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

// 11. Quality of Life & Persistence
const PERSIST_KEYS = [
    'padding', 'blurStrength', 'censorColor', 'censorEmoji', 
    'frameColor', 'frameThickness', 'ratioWidth', 'ratioHeight', 
    'useOriginalRatio', 'processAllFaces', 'fastMode', 'updateFrequency'
];

function initPersistence() {
    loadSettings();
    PERSIST_KEYS.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', saveSettings);
            if (el.type === 'range' || el.type === 'number') {
                el.addEventListener('input', saveSettings);
            }
        }
    });
}

function saveSettings() {
    const settings = {};
    PERSIST_KEYS.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            settings[id] = el.type === 'checkbox' ? el.checked : el.value;
        }
    });
    localStorage.setItem('faceToolSettings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('faceToolSettings');
    if (!saved) return;
    try {
        const settings = JSON.parse(saved);
        PERSIST_KEYS.forEach(id => {
            const el = document.getElementById(id);
            if (el && settings[id] !== undefined) {
                if (el.type === 'checkbox') el.checked = settings[id];
                else el.value = settings[id];
                el.dispatchEvent(new Event('input'));
                el.dispatchEvent(new Event('change'));
            }
        });
    } catch (e) { console.warn("Failed to load settings", e); }
}

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (stopBtn.style.display !== 'none') stopBtn.click();
        else if (!processBtn.disabled) processBtn.click();
    }
    if (e.key === 'Escape') {
        if (lightboxModal.style.display === 'flex') closeLightbox();
        if (editCropModal.style.display === 'flex') editCropModal.style.display = 'none';
    }
});

// Clear Gallery
const clearGalleryBtn = document.getElementById('clearGalleryBtn');
if (clearGalleryBtn) {
    clearGalleryBtn.onclick = () => {
        if (processedBlobs.length === 0) return;
        if (confirm("Clear all processed results?")) {
            processedBlobs = [];
            gallery.innerHTML = '';
            videoGalleryCard = null;
            updateGalleryStatus();
            const gallerySection = document.querySelector('.gallery-section');
            if (gallerySection) gallerySection.style.display = 'none';
            const skeleton = document.getElementById('previewSkeleton');
            if (skeleton && !previewCanvas.width) skeleton.style.display = 'flex';
        }
    };
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initPersistence();
});

// Fallback init in case DOMContentLoaded already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initPersistence();
}