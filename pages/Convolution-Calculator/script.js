/* =========================================
   Configuration & State
   ========================================= */
const state = {
    mode: 'numerical', // 'numerical' or 'image'
    gridSize: 5,
    maxVal: 10,
    kernelName: 'identity',
    usePadding: false,
    inputMatrix: [],
    kernelMatrix: [],
    // Image Mode State
    sourceImage: null, // HTMLImageElement
    inputImageData: null, // ImageData
    outputImageData: null // ImageData
};

// Common 3x3 Kernels
const KERNELS = {
    identity: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0]
    ],
    shiftLeft: [
        [0, 0, 0],
        [0, 0, 1],
        [0, 0, 0]
    ],
    shiftRight: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 0]
    ],
    shiftUp: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 1, 0]
    ],
    shiftDown: [
        [0, 1, 0],
        [0, 0, 0],
        [0, 0, 0]
    ],
    edge1: [
        [1, 0, -1],
        [0, 0, 0],
        [-1, 0, 1]
    ],
    edge2: [
        [0, 1, 0],
        [1, -4, 1],
        [0, 1, 0]
    ],
    sharpen: [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ],
    boxBlur: [
        [1 / 9, 1 / 9, 1 / 9],
        [1 / 9, 1 / 9, 1 / 9],
        [1 / 9, 1 / 9, 1 / 9]
    ],
    gaussian: [
        [1 / 16, 2 / 16, 1 / 16],
        [2 / 16, 4 / 16, 2 / 16],
        [1 / 16, 2 / 16, 1 / 16]
    ]
};

/* =========================================
   DOM Elements
   ========================================= */
const els = {
    gridSize: document.getElementById('gridSize'),
    modeSelect: document.getElementById('modeSelect'),
    fileUploadGroup: document.getElementById('fileUploadGroup'),
    imageUpload: document.getElementById('imageUpload'),
    rangeToggle: document.getElementById('rangeToggle'),
    kernelSelect: document.getElementById('kernelSelect'),
    paddingCheck: document.getElementById('paddingCheck'),
    refreshBtn: document.getElementById('refreshBtn'),

    // Numerical Views
    inputGrid: document.getElementById('inputGrid'),
    outputGrid: document.getElementById('outputGrid'),

    // Image Views
    inputCanvas: document.getElementById('inputCanvas'),
    outputCanvas: document.getElementById('outputCanvas'),

    kernelGrid: document.getElementById('kernelGrid'),
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
    logDebug(`Generating ${state.gridSize}x${state.gridSize} matrix with range 0-${state.maxVal}`);
    const matrix = [];
    for (let y = 0; y < state.gridSize; y++) {
        const row = [];
        for (let x = 0; x < state.gridSize; x++) {
            row.push(getRandomInt(state.maxVal));
        }
        matrix.push(row);
    }
    state.inputMatrix = matrix;
    renderGrid(els.inputGrid, state.inputMatrix, state.maxVal);
    els.inputDims.textContent = `${state.gridSize}x${state.gridSize}`;
}

function updateKernel() {
    state.kernelName = els.kernelSelect.value;
    state.kernelMatrix = KERNELS[state.kernelName];
    logDebug(`Kernel changed to: ${state.kernelName}`);
    renderKernel();

    if (state.mode === 'numerical') {
        applyConvolution();
    } else {
        applyImageConvolution();
    }
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

function applyImageConvolution() {
    if (state.mode !== 'image' || !state.inputImageData) return;

    logDebug("Processing image convolution...");
    const srcData = state.inputImageData.data;
    const w = state.inputImageData.width;
    const h = state.inputImageData.height;
    const kernel = state.kernelMatrix;

    // Prepare Output Canvas
    const outCanvas = els.outputCanvas;
    const outCtx = outCanvas.getContext('2d');
    outCanvas.width = w;
    outCanvas.height = h;

    // Create new ImageData
    const outputImgData = outCtx.createImageData(w, h);
    const dstData = outputImgData.data;

    // Kernel Info
    const K = 3;
    const half = Math.floor(K / 2); // 1

    // Optimization: Pre-calculate kernel flat array
    // Not strictly needed for 3x3 but good practice.

    // Loop Pixels
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {

            let r = 0, g = 0, b = 0;

            // Convolution Loop
            for (let ky = 0; ky < K; ky++) {
                for (let kx = 0; kx < K; kx++) {

                    const iy = y + (ky - half);
                    const ix = x + (kx - half);

                    // Edge Handling (Zero Padding/Clamp)
                    // For image viewing, Clamp (extend edge) is usually better visually than zero padding black borders,
                    // but "Zero Padding" checkbox exists.
                    // Let's stick to explicit Zero Padding logic if checked, otherwise REPLICATE edge?
                    // Actually, simple standard is usually:
                    // If out of bounds -> 0 (Zero Padding)
                    // User tool has "Use Padding" checkbox which implies Output Size change in numerical mode.
                    // In Image Processing, we typically keep image size SAME (same padding).
                    // We will interpret "Use Padding" checkbox as "Zero Pad vs Skip/Clamp" but for simplicity
                    // we'll just always produce same-size output (using padding logic).

                    let idRay = 0, idGay = 0, idBay = 0;

                    if (iy >= 0 && iy < h && ix >= 0 && ix < w) {
                        const offset = (iy * w + ix) * 4;
                        idRay = srcData[offset];
                        idGay = srcData[offset + 1];
                        idBay = srcData[offset + 2];
                    }
                    // else { zero padding (0,0,0) }

                    const kVal = kernel[ky][kx];
                    r += idRay * kVal;
                    g += idGay * kVal;
                    b += idBay * kVal;
                }
            }

            // Clamp and Assign
            const dstOffset = (y * w + x) * 4;
            dstData[dstOffset] = Math.min(255, Math.max(0, r));
            dstData[dstOffset + 1] = Math.min(255, Math.max(0, g));
            dstData[dstOffset + 2] = Math.min(255, Math.max(0, b));
            dstData[dstOffset + 3] = 255; // Alpha
        }
    }

    outCtx.putImageData(outputImgData, 0, 0);
    state.outputImageData = outputImgData;
    els.outputDims.innerText = `${w}x${h}`;
    logDebug("Image processing complete.");
}

/**
 * The Core Convolution Logic
 */
function applyConvolution() {
    if (!state.inputMatrix.length) return;

    logDebug("Calculating convolution...");
    const input = state.inputMatrix;
    const kernel = state.kernelMatrix;
    const N = state.gridSize;
    const K = 3; // Kernel size is always 3 for this tool
    const pad = state.usePadding ? 1 : 0;

    // Calculate Output Size
    // Formula: Output = (Input - Kernel + 2*Padding) + 1
    // If Padding (1): (N - 3 + 2) + 1 = N (Same size)
    // If No Padding: (N - 3 + 0) + 1 = N - 2
    const outSize = N - K + (2 * pad) + 1;

    if (outSize <= 0) {
        logDebug("Error: Grid too small for 3x3 kernel without padding.");
        els.outputGrid.innerHTML = "<p>Grid too small</p>";
        return;
    }

    const output = [];

    // Loop over output grid coordinates
    for (let y = 0; y < outSize; y++) {
        const row = [];
        for (let x = 0; x < outSize; x++) {

            let sum = 0;

            // Map output coordinate back to input coordinate (top-left of the 3x3 window)
            // If No Padding: Output(0,0) corresponds to Input(0,0) as top-left of window
            // If Padding: Output(0,0) corresponds to Input(-1, -1) effectively
            const startY = y - pad;
            const startX = x - pad;

            // Loop over Kernel
            for (let ky = 0; ky < K; ky++) {
                for (let kx = 0; kx < K; kx++) {
                    const inputY = startY + ky;
                    const inputX = startX + kx;

                    // Get value or use 0 if out of bounds (Zero Padding logic)
                    let val = 0;
                    if (inputY >= 0 && inputY < N && inputX >= 0 && inputX < N) {
                        val = input[inputY][inputX];
                    }

                    const kVal = kernel[ky][kx];
                    sum += val * kVal;
                }
            }
            // Round to 2 decimals for cleaner display if floats
            row.push(parseFloat(sum.toFixed(2)));
        }
        output.push(row);
    }

    els.outputDims.textContent = `${outSize}x${outSize}`;
    logDebug(`Convolution complete. Output size: ${outSize}x${outSize}`);
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
    const pad = (!isOutput && state.usePadding) ? 1 : 0;
    const visualRows = rows + (pad * 2);
    const visualCols = cols + (pad * 2);

    // Update CSS Grid Template
    container.style.gridTemplateColumns = `repeat(${visualCols}, 1fr)`;

    // Check if we need tiny text mode (for 16+ grids)
    const isTiny = visualRows > 15;

    // Loop through visual grid coordinates
    // y goes from -pad to rows + pad - 1 (exclusive of end cap, so < rows + pad) which is wrong.
    // simpler: 0 to visualRows, then map back.

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

    const pad = state.usePadding ? 1 : 0;
    const startY = outY - pad;
    const startX = outX - pad;
    const K = 3;
    const N = state.gridSize;

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

    const visualWidth = N + (2 * pad);
    const cells = els.inputGrid.children; // Flat list of cells

    // Safety check just in case
    if (cells.length === visualWidth * visualWidth) {
        for (let ky = 0; ky < K; ky++) {
            for (let kx = 0; kx < K; kx++) {
                const globalY = (startY + pad) + ky;
                const globalX = (startX + pad) + kx;

                // Check if within visual grid bounds (it should be, since output exists)
                if (globalY >= 0 && globalY < visualWidth && globalX >= 0 && globalX < visualWidth) {
                    const idx = globalY * visualWidth + globalX;
                    if (cells[idx]) {
                        cells[idx].classList.add('input-highlight');
                    }
                }
            }
        }
    }

    let inputHTML = '<div class="matrix-block"><h5>Input Patch</h5><div class="mini-grid">';
    let kernelHTML = '<div class="matrix-block"><h5>Kernel</h5><div class="mini-grid">';

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
            <div style="font-family: monospace; color: #e0e0e0; line-height: 1.5;">${calculationStr}</div>
        </div>
    `;

    elCalcContent.innerHTML = equationHTML;

    // Scroll to panel
    elCalcPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderKernel() {
    els.kernelGrid.innerHTML = '';
    state.kernelMatrix.forEach((row, y) => {
        row.forEach((val, x) => {
            const div = document.createElement('div');
            div.className = 'k-cell';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'k-input';
            input.value = Number.isInteger(val) ? val : val.toFixed(2);

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

function showImageCalculation(y, x) {
    const elCalcPanel = document.getElementById('calcBreakdown');
    const elCalcContent = document.getElementById('calcContent');
    elCalcPanel.style.display = 'block';

    const w = state.inputImageData.width;
    const h = state.inputImageData.height;
    const src = state.inputImageData.data;
    const kernel = state.kernelMatrix;
    const K = 3;
    const half = 1;

    // Highlight Input (Draw a rectangle on input canvas)
    // We need to redraw clean image then rect
    const ctx = els.inputCanvas.getContext('2d');
    ctx.putImageData(state.inputImageData, 0, 0); // Reset
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.8)';
    ctx.lineWidth = 1;
    // Draw 3x3 box roughly around the center pixel
    // y is center. Top-left involved is y-1
    ctx.strokeRect(x - 1.5, y - 1.5, 3, 3);

    // To make it visible on large images, maybe draw a bigger indicator?
    // Let's draw a crosshair + box
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
    ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
    ctx.stroke();


    // Calculate Math (Focus on Red channel or Grayscale avg for display simplicity)
    // Let's show RED channel for demonstration or Average
    let parts = [];
    let sum = 0;

    // Header
    let inputHTML = '<div class="matrix-block"><h5>Input Patch (R)</h5><div class="mini-grid">';
    let kernelHTML = '<div class="matrix-block"><h5>Kernel</h5><div class="mini-grid">';

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
        <div style="margin-top: 10px; font-family:monospace; color:#ccc;">${calculationStr}</div>
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

els.kernelSelect.addEventListener('change', updateKernel);

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
    updateKernel(); // Sets initial kernel
    generateInputMatrix(); // Generates input and runs first conv
}

// Start
init();