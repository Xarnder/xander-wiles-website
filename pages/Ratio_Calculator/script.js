/* -------------------------------------------------------------------------- */
/*                               STATE VARIABLES                              */
/* -------------------------------------------------------------------------- */
const state = {
    lines: [],         
    currentLine: null, 
    isDrawing: false,
    image: null,
    edgeMap: null,
    edgeOverlay: null,
    snapPreview: null,
    referenceIndex: 0,
    
    // Magnifier State
    magnifyEnabled: true,
    zoomLevel: 2, 
    magSize: 150 
};

const COLORS = ['#4faeff', '#ff6b6b']; 
const NAMES = ['Blue Line', 'Red Line'];

/* -------------------------------------------------------------------------- */
/*                               DOM ELEMENTS                                 */
/* -------------------------------------------------------------------------- */
const canvasContainer = document.querySelector('.canvas-container'); 
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');
const magDiv = document.getElementById('magnifier');
const magCanvas = document.getElementById('magCanvas');
const magCtx = magCanvas.getContext('2d');

// Controls
const imageLoader = document.getElementById('imageLoader');
const swapBtn = document.getElementById('swapBtn');
const resetBtn = document.getElementById('resetBtn');
const ratioDisplay = document.getElementById('ratioDisplay');
const refLineName = document.getElementById('refLineName');
const emptyState = document.getElementById('empty-state');
const debugLog = document.getElementById('debug-log');

// Magnifier Controls
const magToggle = document.getElementById('magToggle');
const magZoomInput = document.getElementById('magZoom');
const axisSnap = document.getElementById('axisSnap');
const edgeSnap = document.getElementById('edgeSnap');
const showEdges = document.getElementById('showEdges');
const snapRadius = document.getElementById('snapRadius');
const edgeSensitivity = document.getElementById('edgeSensitivity');
const edgeStatus = document.getElementById('edgeStatus');
let edgeWorker = null;
let sensitivityTimer;
let uploadVersion = 0;

function invalidateEdges() {
    clearTimeout(sensitivityTimer);
    if (edgeWorker) edgeWorker.terminate();
    edgeWorker = null;
    state.edgeMap = null;
    state.edgeOverlay = null;
    state.snapPreview = null;
}

function prepareEdges() {
    invalidateEdges();
    if (!state.image || (!edgeSnap.checked && !showEdges.checked)) return;
    edgeStatus.textContent = 'Finding Canny edges… You can keep drawing while processing.';
    try {
        const scale = Math.min(1, 2048 / Math.max(canvas.width, canvas.height));
        const source = document.createElement('canvas');
        source.width = Math.max(1, Math.round(canvas.width * scale));
        source.height = Math.max(1, Math.round(canvas.height * scale));
        const sourceCtx = source.getContext('2d', { willReadFrequently: true });
        sourceCtx.drawImage(state.image, 0, 0, source.width, source.height);
        const pixels = sourceCtx.getImageData(0, 0, source.width, source.height);
        const worker = new Worker('edge-worker.js');
        edgeWorker = worker;
        const fail = () => {
            if (edgeWorker !== worker) return;
            invalidateEdges();
            edgeStatus.textContent = 'Edge detection failed. Toggle Edge snap or Show Canny edges to retry. Free drawing and axis snap still work.';
            draw();
        };
        worker.onerror = fail;
        worker.onmessage = ({ data }) => {
            if (edgeWorker !== worker) return;
            if (data.error) { fail(); return; }
            state.edgeMap = data;
            const overlay = document.createElement('canvas');
            overlay.width = data.width; overlay.height = data.height;
            const overlayCtx = overlay.getContext('2d');
            const rgba = overlayCtx.createImageData(data.width, data.height);
            for (let i = 0; i < data.edges.length; i++) if (data.edges[i]) {
                rgba.data.set([0, 235, 230, 230], i * 4);
            }
            overlayCtx.putImageData(rgba, 0, 0);
            state.edgeOverlay = overlay;
            edgeStatus.textContent = data.count
                ? `Edges ready · ${data.width} × ${data.height} analysis. Higher sensitivity includes fainter edges.`
                : 'No edges found. Try increasing sensitivity or use an image with more contrast.';
            worker.terminate(); edgeWorker = null;
            draw();
        };
        worker.postMessage({ pixels: pixels.data.buffer, width: source.width, height: source.height, sensitivity: Number(edgeSensitivity.value) }, [pixels.data.buffer]);
    } catch (error) {
        invalidateEdges();
        edgeStatus.textContent = 'Edge detection unavailable. Free drawing and axis snap still work.';
    }
}

function snappedPosition(pos, start = null) {
    const snapped = RatioEdges.snapPoint(pos, start, axisSnap.checked,
        edgeSnap.checked ? state.edgeMap : null, Number(snapRadius.value) * pos.scaleFactor, canvas.width, canvas.height);
    state.snapPreview = snapped;
    return { ...pos, ...snapped };
}

for (const toggle of [edgeSnap, showEdges]) toggle.addEventListener('change', () => {
    if ((edgeSnap.checked || showEdges.checked) && !state.edgeMap && !edgeWorker) prepareEdges();
    state.snapPreview = null;
    draw();
});
axisSnap.addEventListener('change', () => { state.snapPreview = null; draw(); });
snapRadius.addEventListener('input', () => {
    document.getElementById('snapRadiusValue').textContent = `${snapRadius.value} px`;
});
edgeSensitivity.addEventListener('input', () => {
    document.getElementById('edgeSensitivityValue').textContent = edgeSensitivity.value;
    invalidateEdges();
    draw();
    if (state.image && (edgeSnap.checked || showEdges.checked)) {
        edgeStatus.textContent = 'Updating Canny edges…';
        sensitivityTimer = setTimeout(prepareEdges, 200);
    }
});

const magValue = document.getElementById('magValue');

/* -------------------------------------------------------------------------- */
/*                                DEBUGGING                                   */
/* -------------------------------------------------------------------------- */
function debug(message, isError = false) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.color = isError ? '#ff6b6b' : 'inherit';
    entry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    debugLog.prepend(entry);
    if(isError) console.error(message);
}

/* -------------------------------------------------------------------------- */
/*                             IMAGE HANDLING                                 */
/* -------------------------------------------------------------------------- */
imageLoader.addEventListener('change', handleImageUpload);
window.addEventListener('resize', fitImageToScreen); 

function handleImageUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const version = ++uploadVersion;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
        URL.revokeObjectURL(url);
        if (version !== uploadVersion) return;
        invalidateEdges();
        state.image = image;
        resetLines();
        emptyState.style.display = 'none';
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        magCanvas.width = magCanvas.height = state.magSize;
        fitImageToScreen();
        edgeStatus.textContent = 'Enable Edge snap or Show Canny edges to analyze this image.';
        prepareEdges();
        debug(`Image loaded. Native: ${canvas.width}x${canvas.height}`);
    };
    image.onerror = () => {
        URL.revokeObjectURL(url);
        if (version === uploadVersion) debug('Could not load that image. Please choose another image file.', true);
    };
    image.src = url;
    e.target.value = '';
}

function fitImageToScreen() {
    if(!state.image) return;

    const contW = canvasContainer.clientWidth;
    const contH = canvasContainer.clientHeight;
    
    const imgW = state.image.naturalWidth;
    const imgH = state.image.naturalHeight;
    const imgRatio = imgW / imgH;

    let finalW = contW;
    let finalH = finalW / imgRatio;

    if(finalH > contH) {
        finalH = contH;
        finalW = finalH * imgRatio;
    }

    canvas.style.width = finalW + 'px';
    canvas.style.height = finalH + 'px';

    draw();
}

/* -------------------------------------------------------------------------- */
/*                       MOUSE / COORDINATE MATH                              */
/* -------------------------------------------------------------------------- */

function getMapCoordinates(evt) {
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if(evt.touches && evt.touches.length > 0) {
        clientX = evt.touches[0].clientX;
        clientY = evt.touches[0].clientY;
    } else {
        clientX = evt.clientX;
        clientY = evt.clientY;
    }

    const xVisual = clientX - rect.left;
    const yVisual = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: Math.max(0, Math.min(canvas.width, xVisual * scaleX)),
        y: Math.max(0, Math.min(canvas.height, yVisual * scaleY)),
        visualX: xVisual,     
        visualY: yVisual,     
        scaleFactor: scaleX   
    };
}

/* -------------------------------------------------------------------------- */
/*                            DRAWING LOGIC                                   */
/* -------------------------------------------------------------------------- */
function draw() {
    if (!state.image) return;

    // 1. Clear & Draw Image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.image, 0, 0);

    if (showEdges.checked && state.edgeOverlay) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(state.edgeOverlay, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    // 2. Draw Lines
    const allLinesToDraw = [...state.lines];
    if(state.currentLine) {
        allLinesToDraw.push(state.currentLine);
    }

    allLinesToDraw.forEach((line, index) => {
        if (!line) return;
        
        let colorStr = 'white';
        if(state.lines.includes(line)) {
            const idx = state.lines.indexOf(line);
            colorStr = COLORS[idx] || 'white';
        } else {
            colorStr = COLORS[state.lines.length] || 'white';
        }

        ctx.beginPath();
        ctx.strokeStyle = colorStr;
        
        const thickness = Math.max(3, canvas.width * 0.0025);
        ctx.lineWidth = thickness;
        
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = thickness;

        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();

        ctx.shadowBlur = 0; 

        // Draw endpoints
        const r = thickness * 2;
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(line.x1, line.y1, r, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(line.x2, line.y2, r, 0, Math.PI*2); ctx.fill();
    });
    if (state.snapPreview && state.snapPreview.edge) {
        const scale = canvas.width / canvas.getBoundingClientRect().width;
        ctx.beginPath();
        ctx.strokeStyle = '#7dff90'; ctx.lineWidth = 2 * scale;
        ctx.arc(state.snapPreview.x, state.snapPreview.y, 7 * scale, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function updateMagnifier(pos) {
    // UPDATED: Only check if enabled, ignore isDrawing state
    if(!state.magnifyEnabled) {
        magDiv.style.display = 'none';
        return;
    }

    magDiv.style.display = 'block';

    const offset = 100; 
    const rect = canvas.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();
    const visualX = rect.left - containerRect.left + pos.x / pos.scaleFactor;
    const visualY = rect.top - containerRect.top + pos.y / pos.scaleFactor;
    let top = visualY - offset;
    let left = visualX - offset;

    // Keep inside bounds visually
    if(top < -50) top = visualY + 80;
    if(left < -50) left = visualX + 80;

    magDiv.style.top = top + 'px';
    magDiv.style.left = left + 'px';

    const visualViewSize = state.magSize / state.zoomLevel; 
    const sourceSize = visualViewSize * pos.scaleFactor; 

    const srcX = pos.x - (sourceSize / 2);
    const srcY = pos.y - (sourceSize / 2);

    magCtx.clearRect(0, 0, state.magSize, state.magSize);

    magCtx.drawImage(
        canvas, 
        srcX, srcY, sourceSize, sourceSize, 
        0, 0, state.magSize, state.magSize
    );
}

/* -------------------------------------------------------------------------- */
/*                             INTERACTION                                    */
/* -------------------------------------------------------------------------- */

let activePointer = null;
canvas.addEventListener('pointerdown', (e) => {
    if (activePointer !== null || e.button !== 0 || !state.image || state.lines.length >= 2) return;
    e.preventDefault();
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    startLogic(e);
});
canvas.addEventListener('pointermove', (e) => {
    if (activePointer !== null && activePointer !== e.pointerId) return;
    handleMouseMove(e);
});
canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointer) return;
    handleMouseMove(e);
    endLogic();
    activePointer = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (e.pointerType !== 'mouse') magDiv.style.display = 'none';
});
function cancelDrawing() {
    activePointer = null;
    state.isDrawing = false; state.currentLine = null; state.snapPreview = null;
    magDiv.style.display = 'none';
    draw(); calculateRatio();
}
canvas.addEventListener('pointercancel', cancelDrawing);
canvas.addEventListener('lostpointercapture', () => { if (state.isDrawing) cancelDrawing(); });
canvas.addEventListener('pointerleave', () => {
    if (!state.isDrawing) { state.snapPreview = null; draw(); magDiv.style.display = 'none'; }
});

function handleMouseMove(e) {
    if (!state.image) return;
    const start = state.isDrawing ? { x: state.currentLine.x1, y: state.currentLine.y1 } : null;
    const pos = snappedPosition(getMapCoordinates(e), start);
    if (state.isDrawing) {
        state.currentLine.x2 = pos.x;
        state.currentLine.y2 = pos.y;
        calculateRatio();
    }
    draw();
    updateMagnifier(pos);
}

function startLogic(e) {
    const pos = snappedPosition(getMapCoordinates(e));
    state.isDrawing = true;
    state.currentLine = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    draw();
    updateMagnifier(pos);
}

function endLogic() {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    
    // We do NOT hide magnifier here anymore, so it persists after letting go 
    // until you leave the canvas area.
    
    const dist = Math.hypot(state.currentLine.x2 - state.currentLine.x1, state.currentLine.y2 - state.currentLine.y1);
    const minLen = 10 * (canvas.width / canvas.offsetWidth); 

    if (dist > minLen) {
        state.lines.push(state.currentLine);
        debug(`Line added.`);
    } else {
        debug("Line too short - ignored.");
    }

    state.currentLine = null;
    draw();
    calculateRatio();
    updateUI();
}

/* -------------------------------------------------------------------------- */
/*                             CALCULATIONS                                   */
/* -------------------------------------------------------------------------- */
function calculateRatio() {
    const activeLines = [...state.lines];
    if(state.currentLine && state.isDrawing) {
        activeLines.push(state.currentLine);
    }

    if (activeLines.length < 2) {
        ratioDisplay.textContent = "--";
        return;
    }

    const l1 = activeLines[0];
    const l2 = activeLines[1];
    
    const len1 = Math.hypot(l1.x2 - l1.x1, l1.y2 - l1.y1);
    const len2 = Math.hypot(l2.x2 - l2.x1, l2.y2 - l2.y1);

    if(len1 === 0 || len2 === 0) return;

    let ratio = (state.referenceIndex === 0) ? (len2 / len1) : (len1 / len2);
    ratioDisplay.textContent = ratio.toFixed(4);
}

/* -------------------------------------------------------------------------- */
/*                             CONTROLS                                       */
/* -------------------------------------------------------------------------- */
magToggle.addEventListener('change', (e) => {
    state.magnifyEnabled = e.target.checked;
    if(!state.magnifyEnabled) magDiv.style.display = 'none';
});

magZoomInput.addEventListener('input', (e) => {
    state.zoomLevel = parseFloat(e.target.value);
    magValue.textContent = state.zoomLevel + 'x';
});

swapBtn.addEventListener('click', () => {
    state.referenceIndex = state.referenceIndex === 0 ? 1 : 0;
    const name = state.referenceIndex === 0 ? NAMES[0] : NAMES[1];
    refLineName.textContent = name;
    refLineName.className = state.referenceIndex === 0 ? "value blue-text" : "value red-text";
    calculateRatio();
});

resetBtn.addEventListener('click', resetLines);
function resetLines() {
    cancelDrawing();
    state.lines = [];
    state.currentLine = null;
    state.isDrawing = false;
    state.referenceIndex = 0;
    refLineName.textContent = NAMES[0];
    refLineName.className = "value blue-text";
    ratioDisplay.textContent = "--";
    draw();
    updateUI();
}

function updateUI() {
    swapBtn.disabled = (state.lines.length !== 2);
}

magValue.textContent = state.zoomLevel + 'x';
magZoomInput.value = state.zoomLevel;

debug("Ready.");