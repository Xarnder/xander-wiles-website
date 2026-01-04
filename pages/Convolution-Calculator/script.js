/* =========================================
   Configuration & State
   ========================================= */
const state = {
    mode: 'numerical', // 'numerical' or 'image'
    gridSize: 5, // Fallback for square size controls
    gridWidth: 5,
    gridHeight: 5,
    kernelSize: 3,
    maxVal: 10,

    // Kernel A
    kernelName: 'identity',
    kernelMatrix: [],

    // Kernel B (Dual)
    useDual: false,
    kernelNameB: 'identity',
    kernelMatrixB: [],
    mixMode: 'magnitude', // 'magnitude', 'add', 'sub'

    usePadding: false,
    inputMatrix: [],

    // Image Mode State
    sourceImage: null, // HTMLImageElement
    inputImageData: null, // ImageData
    outputImageData: null // ImageData
};

// Common Kernels by Size
const KERNELS = {
    2: {
        identity: [[1, 0], [0, 0]],
        robertsX: [[1, 0], [0, -1]],
        robertsY: [[0, 1], [-1, 0]],
        uniform: [[0.25, 0.25], [0.25, 0.25]]
    },
    3: {
        identity: [[0, 0, 0], [0, 1, 0], [0, 0, 0]],
        shiftLeft: [[0, 0, 0], [0, 0, 1], [0, 0, 0]],
        shiftRight: [[0, 0, 0], [1, 0, 0], [0, 0, 0]],
        shiftUp: [[0, 0, 0], [0, 0, 0], [0, 1, 0]],
        shiftDown: [[0, 1, 0], [0, 0, 0], [0, 0, 0]],
        edge1: [[1, 0, -1], [0, 0, 0], [-1, 0, 1]],
        edge2: [[0, 1, 0], [1, -4, 1], [0, 1, 0]],
        sobelX: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
        sobelY: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]],
        sharpen: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]],
        boxBlur: [[1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9]],
        gaussian: [[1 / 16, 2 / 16, 1 / 16], [2 / 16, 4 / 16, 2 / 16], [1 / 16, 2 / 16, 1 / 16]]
    },
    5: {
        identity: [
            [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]
        ],
        boxBlur: Array(5).fill().map(() => Array(5).fill(1 / 25)),
        gaussian: [
            [1 / 273, 4 / 273, 7 / 273, 4 / 273, 1 / 273],
            [4 / 273, 16 / 273, 26 / 273, 16 / 273, 4 / 273],
            [7 / 273, 26 / 273, 41 / 273, 26 / 273, 7 / 273],
            [4 / 273, 16 / 273, 26 / 273, 16 / 273, 4 / 273],
            [1 / 273, 4 / 273, 7 / 273, 4 / 273, 1 / 273]
        ]
    },
    7: {
        identity: (() => { const m = Array(7).fill().map(() => Array(7).fill(0)); m[3][3] = 1; return m; })(),
        boxBlur: Array(7).fill().map(() => Array(7).fill(1 / 49))
    }
};

/* =========================================
   DOM Elements
   ========================================= */
const els = {
    gridSize: document.getElementById('gridSize'),
    kernelSizeSelect: document.getElementById('kernelSizeSelect'),
    modeSelect: document.getElementById('modeSelect'),
    fileUploadGroup: document.getElementById('fileUploadGroup'),
    imageUpload: document.getElementById('imageUpload'),
    rangeToggle: document.getElementById('rangeToggle'),
    csvUploadGroup: document.getElementById('csvUploadGroup'),
    csvUpload: document.getElementById('csvUpload'),

    // Kernel Controls
    kernelSelect: document.getElementById('kernelSelect'),
    dualKernelCheck: document.getElementById('dualKernelCheck'),
    dualKernelControls: document.getElementById('dualKernelControls'),
    kernelSelectB: document.getElementById('kernelSelectB'),
    mixModeSelect: document.getElementById('mixModeSelect'),

    paddingCheck: document.getElementById('paddingCheck'),
    refreshBtn: document.getElementById('refreshBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadGroup: document.getElementById('downloadGroup'),
    dlOriginalCheck: document.getElementById('dlOriginalCheck'),

    // Numerical Views
    inputGrid: document.getElementById('inputGrid'),
    outputGrid: document.getElementById('outputGrid'),

    // Image Views
    inputCanvas: document.getElementById('inputCanvas'),
    outputCanvas: document.getElementById('outputCanvas'),

    kernelGrid: document.getElementById('kernelGrid'),       // Grid A
    kernelWrapperB: document.getElementById('kernelWrapperB'),
    kernelGridB: document.getElementById('kernelGridB'),     // Grid B

    debugLog: document.getElementById('debugLog'),
    inputDims: document.getElementById('inputDims'),
    outputDims: document.getElementById('outputDims')
};

/* =========================================
   Logic Functions
   ========================================= */

function logDebug(message) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'debug-entry';
    entry.innerHTML = `<span class="debug-time">[${time}]</span> ${message}`;
    els.debugLog.prepend(entry); // Newest on top
    console.log(`[${time}] ${message}`);
}

function getRandomInt(max) {
    return Math.floor(Math.random() * (max + 1));
}

function generateInputMatrix() {
    // If not using CSV "custom" mode, force square based on slider
    // But here we just update using current state.gridWidth/Height
    // Note: If user touched the slider, we might want to reset to square.
    // For now, let's assume this is called when resetting or init.
    // We'll trust state.gridSize if we are "resetting".

    // To keep it simple: if this is called, we make a square matrix from state.gridSize
    // effectively "resetting" any CSV custom shape.
    state.gridWidth = state.gridSize;
    state.gridHeight = state.gridSize;

    logDebug(`Generating ${state.gridWidth}x${state.gridHeight} matrix with range 0-${state.maxVal}`);
    const matrix = [];
    for (let y = 0; y < state.gridHeight; y++) {
        const row = [];
        for (let x = 0; x < state.gridWidth; x++) {
            row.push(getRandomInt(state.maxVal));
        }
        matrix.push(row);
    }
    state.inputMatrix = matrix;
    renderGrid(els.inputGrid, state.inputMatrix, state.maxVal);
    els.inputDims.textContent = `${state.gridWidth}x${state.gridHeight}`;
}

function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const text = event.target.result;
        const matrix = [];
        const lines = text.split(/\r?\n/);

        let cols = 0;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed) {
                const parts = trimmed.split(',').map(v => parseFloat(v));
                // Filter out NaNs if any, or treat as 0? 
                // Let's treat as 0 if invalid
                const row = parts.map(v => isNaN(v) ? 0 : v);
                if (row.length > 0) {
                    matrix.push(row);
                    cols = Math.max(cols, row.length);
                }
            }
        });

        // Normalize rows to max cols
        matrix.forEach(row => {
            while (row.length < cols) row.push(0);
        });

        if (matrix.length > 0 && cols > 0) {
            state.inputMatrix = matrix;
            state.gridHeight = matrix.length;
            state.gridWidth = cols;
            // Note: We don't update state.gridSize (slider) because it assumes square.

            logDebug(`Loaded CSV: ${state.gridWidth}x${state.gridHeight}`);
            els.inputDims.textContent = `${state.gridWidth}x${state.gridHeight}`;
            renderGrid(els.inputGrid, state.inputMatrix, state.maxVal);
            applyConvolution();
        } else {
            logDebug("Error: Invalid CSV");
        }

        // Reset input
        e.target.value = '';
    };
    reader.readAsText(file);
}

function updateKernelOptions() {
    state.kernelSize = parseInt(els.kernelSizeSelect.value);
    const size = state.kernelSize;
    const available = KERNELS[size];

    // Clear existing
    els.kernelSelect.innerHTML = '';
    els.kernelSelectB.innerHTML = '';

    // Populate
    Object.keys(available).forEach(key => {
        const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

        // Opt A
        const optA = document.createElement('option');
        optA.value = key;
        optA.textContent = title;
        els.kernelSelect.appendChild(optA);

        // Opt B
        const optB = document.createElement('option');
        optB.value = key;
        optB.textContent = title;
        els.kernelSelectB.appendChild(optB);
    });

    // Set Defaults
    // A: Identity
    // B: Identity
    state.kernelName = Object.keys(available)[0];
    state.kernelNameB = Object.keys(available)[0];

    updateKernel();
    updateKernelB();
}

// Update Kernel A
function updateKernel() {
    state.kernelName = els.kernelSelect.value;
    if (KERNELS[state.kernelSize][state.kernelName]) {
        state.kernelMatrix = KERNELS[state.kernelSize][state.kernelName];
    } else if (state.kernelName !== 'custom') {
        state.kernelMatrix = KERNELS[state.kernelSize]['identity'];
    }

    renderKernel(els.kernelGrid, state.kernelMatrix, (y, x, val) => {
        state.kernelMatrix[y][x] = val;
        state.kernelName = "custom";
        els.kernelSelect.value = "";
        updateOutput();
    });

    updateOutput();
}

// Update Kernel B
function updateKernelB() {
    state.kernelNameB = els.kernelSelectB.value;
    if (KERNELS[state.kernelSize][state.kernelNameB]) {
        state.kernelMatrixB = KERNELS[state.kernelSize][state.kernelNameB];
    } else if (state.kernelNameB !== 'custom') {
        state.kernelMatrixB = KERNELS[state.kernelSize]['identity'];
    }

    renderKernel(els.kernelGridB, state.kernelMatrixB, (y, x, val) => {
        state.kernelMatrixB[y][x] = val;
        state.kernelNameB = "custom";
        els.kernelSelectB.value = "";
        updateOutput();
    });

    updateOutput();
}

function renderKernel(container, matrix, maxValCallback) {
    container.innerHTML = '';
    // Update Grid Columns
    container.style.gridTemplateColumns = `repeat(${state.kernelSize}, 1fr)`;

    matrix.forEach((row, y) => {
        row.forEach((val, x) => {
            const div = document.createElement('div');
            div.className = 'k-cell';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'k-input';
            input.value = Number.isInteger(val) ? val : val.toFixed(3);

            input.addEventListener('change', (e) => {
                const num = parseFloat(e.target.value);
                if (!isNaN(num)) {
                    maxValCallback(y, x, num);
                }
            });

            div.appendChild(input);
            container.appendChild(div);
        });
    });
}

function toggleMode() {
    const isImage = state.mode === 'image';

    // Toggle Visibility
    els.inputGrid.style.display = isImage ? 'none' : 'grid';
    els.outputGrid.style.display = isImage ? 'none' : 'grid';
    els.inputCanvas.style.display = isImage ? 'block' : 'none';
    els.outputCanvas.style.display = isImage ? 'block' : 'none';

    els.fileUploadGroup.style.display = isImage ? 'flex' : 'none';

    // Disable/Enable Inputs
    els.gridSize.disabled = isImage;
    els.rangeToggle.disabled = isImage;
    els.refreshBtn.disabled = isImage;

    // Download logic
    if (els.downloadGroup) {
        els.downloadGroup.style.display = isImage ? 'block' : 'none';
    }

    logDebug(`Switched to ${state.mode} mode.`);

    // Clear Logic
    if (isImage) {
        if (state.sourceImage) {
            drawSourceImage();
        } else {
            // Load a default placeholder or clear
            const ctx = els.inputCanvas.getContext('2d');
            ctx.clearRect(0, 0, els.inputCanvas.width, els.inputCanvas.height);
            els.inputDims.innerText = "No Image";
            els.outputDims.innerText = "";
        }
    } else {
        generateInputMatrix();
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            state.sourceImage = img;
            drawSourceImage();
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
}

function drawSourceImage() {
    if (!state.sourceImage) return;

    const img = state.sourceImage;
    const canvas = els.inputCanvas;
    const ctx = canvas.getContext('2d');

    // Limit max size for performance (e.g., 500px width)
    const MAX_WIDTH = 500;
    let width = img.width;
    let height = img.height;

    if (width > MAX_WIDTH) {
        height = Math.round(height * (MAX_WIDTH / width));
        width = MAX_WIDTH;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    els.inputDims.innerText = `${width}x${height}`;

    // Store ImageData for processing
    state.inputImageData = ctx.getImageData(0, 0, width, height);

    // Run Convolution
    applyImageConvolution();
}

// Helper: Pure Data Convolution
function convolveData(srcData, w, h, kernelA, kernelB, useDual, mixMode, kernelSize) {
    const output = new Uint8ClampedArray(w * h * 4);
    const K = kernelSize;
    const half = Math.floor(K / 2);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {

            let rA = 0, gA = 0, bA = 0;
            let rB = 0, gB = 0, bB = 0;

            for (let ky = 0; ky < K; ky++) {
                for (let kx = 0; kx < K; kx++) {
                    const iy = y + (ky - half);
                    const ix = x + (kx - half);

                    let idRay = 0, idGay = 0, idBay = 0;

                    if (iy >= 0 && iy < h && ix >= 0 && ix < w) {
                        const offset = (iy * w + ix) * 4;
                        idRay = srcData[offset];
                        idGay = srcData[offset + 1];
                        idBay = srcData[offset + 2];
                    }

                    const kValA = kernelA[ky][kx];
                    rA += idRay * kValA;
                    gA += idGay * kValA;
                    bA += idBay * kValA;

                    if (useDual) {
                        const kValB = kernelB[ky][kx];
                        rB += idRay * kValB;
                        gB += idGay * kValB;
                        bB += idBay * kValB;
                    }
                }
            }

            let finalR = rA;
            let finalG = gA;
            let finalB = bA;

            if (useDual) {
                if (mixMode === 'magnitude') {
                    finalR = Math.sqrt(rA * rA + rB * rB);
                    finalG = Math.sqrt(gA * gA + gB * gB);
                    finalB = Math.sqrt(bA * bA + bB * bB);
                } else if (mixMode === 'add') {
                    finalR = rA + rB;
                    finalG = gA + gB;
                    finalB = bA + bB;
                } else if (mixMode === 'sub') {
                    finalR = rA - rB;
                    finalG = gA - gB;
                    finalB = bA - bB;
                }
            }

            const dstOffset = (y * w + x) * 4;
            output[dstOffset] = Math.min(255, Math.max(0, finalR));
            output[dstOffset + 1] = Math.min(255, Math.max(0, finalG));
            output[dstOffset + 2] = Math.min(255, Math.max(0, finalB));
            output[dstOffset + 3] = 255;
        }
    }
    return output;
}

function applyImageConvolution() {
    if (state.mode !== 'image' || !state.inputImageData) return;

    const srcData = state.inputImageData.data;
    const w = state.inputImageData.width;
    const h = state.inputImageData.height;

    // Process Data
    const resultData = convolveData(
        srcData, w, h,
        state.kernelMatrix,
        state.kernelMatrixB,
        state.useDual,
        state.mixMode,
        state.kernelSize
    );

    // Draw to Canvas
    const outCanvas = els.outputCanvas;
    const outCtx = outCanvas.getContext('2d');
    outCanvas.width = w;
    outCanvas.height = h;

    const outputImgData = new ImageData(resultData, w, h);
    outCtx.putImageData(outputImgData, 0, 0);

    state.outputImageData = outputImgData;
    els.outputDims.innerText = `${w}x${h}`;
}

/**
 * The Core Convolution Logic
 */
function applyConvolution() {
    if (!state.inputMatrix.length) return;

    const input = state.inputMatrix;
    // Use stored width/height which might come from CSV
    const N_H = state.gridHeight;
    const N_W = state.gridWidth;

    const K = state.kernelSize;
    const pad = state.usePadding ? Math.floor(K / 2) : 0;

    // Params for Dual
    const useDual = state.useDual;
    const kernelA = state.kernelMatrix;
    const kernelB = state.kernelMatrixB;
    const mode = state.mixMode;

    // Calculate Output Size
    const outH = N_H - K + (2 * pad) + 1;
    const outW = N_W - K + (2 * pad) + 1;

    if (outH <= 0 || outW <= 0) {
        els.outputGrid.innerHTML = "<p>Grid too small</p>";
        return;
    }

    const output = [];

    // Loop over output grid coordinates
    for (let y = 0; y < outH; y++) {
        const row = [];
        for (let x = 0; x < outW; x++) {

            let sumA = 0;
            let sumB = 0;

            const startY = y - pad;
            const startX = x - pad;

            // Loop over Kernel
            for (let ky = 0; ky < K; ky++) {
                for (let kx = 0; kx < K; kx++) {
                    const inputY = startY + ky;
                    const inputX = startX + kx;

                    let val = 0;
                    if (inputY >= 0 && inputY < N_H && inputX >= 0 && inputX < N_W) {
                        val = input[inputY][inputX];
                    }

                    const kValA = kernelA[ky][kx];
                    sumA += val * kValA;

                    if (useDual) {
                        const kValB = kernelB[ky][kx];
                        sumB += val * kValB;
                    }
                }
            }

            let finalVal = sumA;
            if (useDual) {
                if (mode === 'magnitude') {
                    finalVal = Math.sqrt(sumA * sumA + sumB * sumB);
                } else if (mode === 'add') {
                    finalVal = sumA + sumB;
                } else if (mode === 'sub') {
                    finalVal = sumA - sumB;
                }
            }

            // Round to 2 decimals for cleaner display
            row.push(parseFloat(finalVal.toFixed(2)));
        }
        output.push(row);
    }

    els.outputDims.textContent = `${outW}x${outH}`;
    renderGrid(els.outputGrid, output, state.maxVal, true);
}


/* =========================================
   Rendering Functions
   ========================================= */

function renderGrid(container, matrix, maxScaleRef, isOutput = false) {
    container.innerHTML = '';
    const rows = matrix.length;
    if (rows === 0) return;
    const cols = matrix[0].length;

    // Padding Logic
    const K = state.kernelSize;
    const pVal = Math.floor(K / 2);
    // If we're rendering Output, no padding. If Input, show padding if enabled.
    const pad = (!isOutput && state.usePadding) ? pVal : 0;
    const visualRows = rows + (pad * 2);
    const visualCols = cols + (pad * 2);

    // Update CSS Grid Template
    container.style.gridTemplateColumns = `repeat(${visualCols}, 1fr)`;

    // Check if we need tiny text mode (for 16+ grids)
    const isTiny = visualRows > 15;

    // Loop through visual grid coordinates
    for (let vy = 0; vy < visualRows; vy++) {
        for (let vx = 0; vx < visualCols; vx++) {

            // Map visuals back to matrix coords
            const y = vy - pad;
            const x = vx - pad;

            const isPaddingCell = (y < 0 || y >= rows || x < 0 || x >= cols);

            const div = document.createElement('div');
            div.className = isTiny ? 'cell tiny-text' : 'cell';
            if (isPaddingCell) div.classList.add('padding');

            let val = 0;
            // Get value
            if (!isPaddingCell) {
                val = matrix[y][x];
            }

            // Visualization Logic for Colors
            let normalized = 0;
            let displayVal = val;

            if (isOutput) {
                // Output Logic (same as before)
                let clamped = Math.max(0, Math.min(255, Math.abs(val)));
                if (state.maxVal === 10) clamped = Math.min(255, clamped * 20);
                normalized = Math.round(clamped);
            } else if (isPaddingCell) {
                // Padding is 0, usually black/dark
                normalized = 0;
            } else {
                // Input Logic
                if (state.maxVal === 10) {
                    normalized = Math.round((val / 10) * 255);
                } else {
                    normalized = Math.round(val);
                }
            }

            div.style.backgroundColor = `rgb(${normalized}, ${normalized}, ${normalized})`;

            // Text / Input
            // If it's the Input Grid AND Not Padding -> Editable Input
            if (!isOutput && !isPaddingCell) {
                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'grid-input';
                input.value = val;

                // Color contrast for input text
                input.style.color = normalized > 128 ? 'black' : 'white';
                input.style.textShadow = normalized > 128 ? 'none' : '0 0 2px black';

                // Event Listener
                input.addEventListener('input', (e) => {
                    const newVal = parseFloat(e.target.value) || 0;
                    state.inputMatrix[y][x] = newVal;

                    // Update Background Color dynamically
                    let newNorm = 0;
                    if (state.maxVal === 10) {
                        newNorm = Math.round((newVal / 10) * 255);
                    } else {
                        newNorm = Math.round(newVal);
                    }
                    // Clamp for visuals
                    newNorm = Math.max(0, Math.min(255, newNorm));

                    div.style.backgroundColor = `rgb(${newNorm}, ${newNorm}, ${newNorm})`;
                    input.style.color = newNorm > 128 ? 'black' : 'white';
                    input.style.textShadow = newNorm > 128 ? 'none' : '0 0 2px black';

                    // Trigger Convolution
                    applyConvolution();
                });

                div.appendChild(input);
            } else {
                // Static text (Padding or Output)
                div.textContent = displayVal;
                div.title = displayVal;

                div.style.color = normalized > 128 ? 'black' : 'white';
                div.style.textShadow = normalized > 128 ? 'none' : '0 0 2px black';
            }

            // Click interaction for Output cells
            if (isOutput) {
                div.style.cursor = 'pointer';
                div.addEventListener('click', () => {
                    // Remove selected class from all other cells
                    const existing = container.querySelectorAll('.selected');
                    existing.forEach(e => e.classList.remove('selected'));
                    div.classList.add('selected');
                    showCalculation(y, x);
                });
            }

            container.appendChild(div);
        }
    }
}

function showCalculation(outY, outX) {
    const elCalcPanel = document.getElementById('calcBreakdown');
    const elCalcContent = document.getElementById('calcContent');

    elCalcPanel.style.display = 'block';

    // Clear previous input highlights
    const oldHighlights = els.inputGrid.querySelectorAll('.input-highlight');
    oldHighlights.forEach(el => el.classList.remove('input-highlight'));

    const K = state.kernelSize;
    const pad = state.usePadding ? Math.floor(K / 2) : 0;
    const startY = outY - pad;
    const startX = outX - pad;
    const N_W = state.gridWidth;
    const N_H = state.gridHeight;

    // Highlight Input Grid
    // We iterate the DOM cells directly. Since grid is row-major: index = y * width + x
    // BUT els.inputGrid contains cells. We need to handle padding cells if they exist visually.
    // However, padding cells are part of the visual grid.
    // Logic: 
    // visualY = inputY + pad (if state.usePadding)
    // visualX = inputX + pad
    // NO wait, renderGrid loops vy from 0 to visualRows.
    // The Input Grid DOM children maps directly to vy, vx.
    // visual row index = (startY + pad) + ky
    // visual col index = (startX + pad) + kx

    const visualWidth = N_W + (2 * pad);
    const visualHeight = N_H + (2 * pad);
    // visualWidth is different from visualHeight

    const cells = els.inputGrid.children; // Flat list of cells

    // Safety check just in case
    // Total cells = visualWidth * visualHeight
    if (cells.length === visualWidth * visualHeight) {
        for (let ky = 0; ky < K; ky++) {
            for (let kx = 0; kx < K; kx++) {
                const globalY = (startY + pad) + ky;
                const globalX = (startX + pad) + kx;

                // Check if within visual grid bounds (it should be, since output exists)
                if (globalY >= 0 && globalY < visualHeight && globalX >= 0 && globalX < visualWidth) {
                    const idx = globalY * visualWidth + globalX;
                    if (cells[idx]) {
                        cells[idx].classList.add('input-highlight');
                    }
                }
            }
        }
    }

    const gridStyle = `style="grid-template-columns: repeat(${K}, 1fr);"`;
    let inputHTML = `<div class="matrix-block"><h5>Input Patch</h5><div class="mini-grid" ${gridStyle}>`;
    let kernelHTML = `<div class="matrix-block"><h5>Kernel</h5><div class="mini-grid" ${gridStyle}>`;

    let parts = [];
    let sum = 0;

    for (let ky = 0; ky < K; ky++) {
        for (let kx = 0; kx < K; kx++) {
            const inputY = startY + ky;
            const inputX = startX + kx;

            let val = 0;
            let valDisplay = "0 (pad)";
            let classExtra = '';

            // In bounds check
            if (inputY >= 0 && inputY < N && inputX >= 0 && inputX < N) {
                val = state.inputMatrix[inputY][inputX];
                valDisplay = Number.isInteger(val) ? val : val.toFixed(1);
            } else {
                classExtra = ' style="opacity: 0.5; border: 1px dashed #666;" title="Padding"'; // Visual cue for padding
            }

            const kVal = state.kernelMatrix[ky][kx];
            sum += val * kVal;

            // Build Mini Grids
            inputHTML += `<div class="mini-cell"${classExtra}>${Number.isInteger(val) ? val : val.toFixed(1)}</div>`;
            kernelHTML += `<div class="mini-cell">${Number.isInteger(kVal) ? kVal : kVal.toFixed(2)}</div>`;

            // Build Text Parts (Old Style)
            if (kVal !== 0) {
                parts.push(`(${valDisplay} × ${Number.isInteger(kVal) ? kVal : kVal.toFixed(2)})`);
            }
        }
    }

    inputHTML += '</div></div>';
    kernelHTML += '</div></div>';

    // Finalize Text Calculation
    if (parts.length === 0) {
        parts.push("0 (All kernel values are 0)");
    }
    const calculationStr = parts.join(" + ") + ` = ${parseFloat(sum.toFixed(2))}`;

    const finalSum = parseFloat(sum.toFixed(2));

    const equationHTML = `
        <div class="visual-equation">
            ${inputHTML}
            <div class="symbol">×</div>
            ${kernelHTML}
            <div class="symbol">=</div>
            <div class="result-value">${finalSum}</div>
        </div>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
            <div style="margin-bottom: 5px; color:#aaa; font-size:0.9rem;">Step-by-step Calculation:</div>
            <div style="font-family: monospace; color: #e0e0e0; line-height: 1.5; word-break: break-all;">${calculationStr}</div>
        </div>
    `;

    elCalcContent.innerHTML = equationHTML;

    // Scroll to panel
    elCalcPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderKernel() {
    els.kernelGrid.innerHTML = '';
    // Update Grid Columns
    els.kernelGrid.style.gridTemplateColumns = `repeat(${state.kernelSize}, 1fr)`;

    state.kernelMatrix.forEach((row, y) => {
        row.forEach((val, x) => {
            const div = document.createElement('div');
            div.className = 'k-cell';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'k-input';
            input.value = Number.isInteger(val) ? val : val.toFixed(3); // More precision for 5x5/7x7

            input.addEventListener('change', (e) => {
                const num = parseFloat(e.target.value);
                if (!isNaN(num)) {
                    state.kernelMatrix[y][x] = num;
                    state.kernelName = "custom";
                    els.kernelSelect.value = "";
                    updateOutput();
                }
            });

            div.appendChild(input);
            els.kernelGrid.appendChild(div);
        });
    });
}

/**
 * Updates the output visualization based on current mode
 */
function updateOutput() {
    if (state.mode === 'numerical') {
        applyConvolution();
    } else {
        applyImageConvolution();
    }
}

/* =========================================
   Event Listeners
   ========================================= */

// Output Canvas Click for Analysis
// Output Canvas Click for Analysis
els.outputCanvas.addEventListener('click', (e) => {
    if (!state.outputImageData) return;

    const rect = els.outputCanvas.getBoundingClientRect();
    const scaleX = els.outputCanvas.width / rect.width;
    const scaleY = els.outputCanvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (x >= 0 && x < els.outputCanvas.width && y >= 0 && y < els.outputCanvas.height) {
        showImageCalculation(y, x);
    }
});

// CSV Listener
if (els.csvUpload) {
    els.csvUpload.addEventListener('change', handleCSVUpload);
}

function showImageCalculation(y, x) {
    const elCalcPanel = document.getElementById('calcBreakdown');
    const elCalcContent = document.getElementById('calcContent');
    elCalcPanel.style.display = 'block';

    const w = state.inputImageData.width;
    const h = state.inputImageData.height;
    const src = state.inputImageData.data;
    const kernel = state.kernelMatrix;
    const K = state.kernelSize;
    const half = Math.floor(K / 2);

    // Highlight Input (Draw a rectangle on input canvas)
    // We need to redraw clean image then rect
    const ctx = els.inputCanvas.getContext('2d');
    ctx.putImageData(state.inputImageData, 0, 0); // Reset
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.8)';
    ctx.lineWidth = 1;
    // Draw box roughly around the center pixel
    ctx.strokeRect(x - (half + 0.5), y - (half + 0.5), K, K);

    // Crosshair
    ctx.beginPath();
    ctx.moveTo(x, y - (half + 2)); ctx.lineTo(x, y + (half + 2));
    ctx.moveTo(x - (half + 2), y); ctx.lineTo(x + (half + 2), y);
    ctx.stroke();


    // Calculate Math (Focus on Red channel)
    let parts = [];
    let sum = 0;

    // Header
    const gridStyle = `style="grid-template-columns: repeat(${K}, 1fr);"`;
    let inputHTML = `<div class="matrix-block"><h5>Input Patch (R)</h5><div class="mini-grid" ${gridStyle}>`;
    let kernelHTML = `<div class="matrix-block"><h5>Kernel</h5><div class="mini-grid" ${gridStyle}>`;

    for (let ky = 0; ky < K; ky++) {
        for (let kx = 0; kx < K; kx++) {
            const iy = y + (ky - half);
            const ix = x + (kx - half);

            let val = 0;
            if (iy >= 0 && iy < h && ix >= 0 && ix < w) {
                const off = (iy * w + ix) * 4;
                val = src[off]; // Red channel
            } // else 0

            const kVal = kernel[ky][kx];
            sum += val * kVal;

            // Build Mini Grids
            inputHTML += `<div class="mini-cell">${val}</div>`;
            kernelHTML += `<div class="mini-cell">${Number.isInteger(kVal) ? kVal : kVal.toFixed(2)}</div>`;

            if (kVal !== 0) {
                parts.push(`(${val} × ${Number.isInteger(kVal) ? kVal : kVal.toFixed(2)})`);
            }
        }
    }

    inputHTML += '</div></div>';
    kernelHTML += '</div></div>';

    if (parts.length === 0) parts.push("0");
    const calculationStr = parts.join(" + ") + ` = ${sum.toFixed(2)}`;

    const equationHTML = `
        <div style="text-align:center; margin-bottom:10px; color:#aaa;">* Analyzing RED Channel only *</div>
        <div class="visual-equation">
            ${inputHTML}
            <div class="symbol">×</div>
            ${kernelHTML}
            <div class="symbol">=</div>
            <div class="result-value">${Math.max(0, Math.min(255, Math.round(sum)))}</div>
        </div>
        <div style="margin-top: 10px; font-family:monospace; color:#ccc; word-break: break-all;">${calculationStr}</div>
    `;

    elCalcContent.innerHTML = equationHTML;
    elCalcPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

els.refreshBtn.addEventListener('click', () => {
    generateInputMatrix();
    if (state.mode === 'numerical') applyConvolution();
});

els.modeSelect.addEventListener('change', (e) => {
    state.mode = e.target.value;
    toggleMode();
});

els.imageUpload.addEventListener('change', handleImageUpload);


els.gridSize.addEventListener('change', (e) => {
    let val = parseInt(e.target.value);
    // Clamp values
    if (val < 3) val = 3;
    if (val > 32) val = 32;
    e.target.value = val;
    state.gridSize = val;
    generateInputMatrix();
    applyConvolution();
});

els.rangeToggle.addEventListener('change', (e) => {
    state.maxVal = parseInt(e.target.value);
    generateInputMatrix();
    applyConvolution();
});


// Dual Kernel Logic Listeners
els.dualKernelCheck.addEventListener('change', (e) => {
    state.useDual = e.target.checked;

    if (state.useDual) {
        els.dualKernelControls.style.display = 'block';
        els.kernelWrapperB.style.display = 'block';
    } else {
        els.dualKernelControls.style.display = 'none';
        els.kernelWrapperB.style.display = 'none';
    }
    updateOutput();
});

els.kernelSelectB.addEventListener('change', updateKernelB);
els.mixModeSelect.addEventListener('change', (e) => {
    state.mixMode = e.target.value;
    updateOutput();
});

els.downloadBtn.addEventListener('click', () => {
    // Get options
    const format = document.querySelector('input[name="dlFormat"]:checked').value; // 'png' or 'jpeg'
    const useOriginal = els.dlOriginalCheck.checked;
    const mime = `image/${format}`;
    const filename = `convolution-result.${format === 'jpeg' ? 'jpg' : 'png'}`;

    if (!useOriginal) {
        // Simple: Download Canvas
        const link = document.createElement('a');
        link.download = filename;
        link.href = els.outputCanvas.toDataURL(mime, 0.9);
        link.click();
    } else {
        // Complex: Process Original Image
        if (!state.sourceImage) return;

        logDebug("Processing full resolution image...");
        setTimeout(() => { // Timeout to allow UI to show log
            const img = state.sourceImage;
            const w = img.naturalWidth;
            const h = img.naturalHeight;

            // Offscreen Canvas
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const rawData = ctx.getImageData(0, 0, w, h);

            const processedPoly = convolveData(
                rawData.data, w, h,
                state.kernelMatrix,
                state.kernelMatrixB,
                state.useDual,
                state.mixMode,
                state.kernelSize
            );

            const finalImageData = new ImageData(processedPoly, w, h);
            ctx.putImageData(finalImageData, 0, 0);

            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL(mime, 0.9);
            link.click();
            logDebug("Download started.");
        }, 100);
    }
});

els.kernelSelect.addEventListener('change', updateKernel);

els.kernelSizeSelect.addEventListener('change', updateKernelOptions);

els.paddingCheck.addEventListener('change', (e) => {
    state.usePadding = e.target.checked;
    logDebug(`Padding set to: ${state.usePadding}`);
    // Re-render the input grid to show/hide padding
    if (state.mode === 'numerical') {
        renderGrid(els.inputGrid, state.inputMatrix, state.maxVal, false);
    }
    updateOutput();
});

/* =========================================
   Init
   ========================================= */
function init() {
    logDebug("Initializing Tool...");
    generateInputMatrix(); // Generates input first
    updateKernelOptions(); // Sets kernels and triggers initial convolution
}

// Start
init();