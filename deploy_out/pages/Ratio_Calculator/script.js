/* -------------------------------------------------------------------------- */
/*                               STATE VARIABLES                              */
/* -------------------------------------------------------------------------- */
const state = {
    lines: [],         
    currentLine: null, 
    isDrawing: false,
    image: null,       
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
    const reader = new FileReader();
    reader.onload = function(event) {
        state.image = new Image();
        state.image.onload = function() {
            debug(`Image loaded. Native: ${state.image.naturalWidth}x${state.image.naturalHeight}`);
            state.lines = []; 
            emptyState.style.display = 'none';
            
            // 1. Set Internal Resolution
            canvas.width = state.image.naturalWidth;
            canvas.height = state.image.naturalHeight;
            
            // 2. Set Magnifier Internal Resolution
            magCanvas.width = state.magSize;
            magCanvas.height = state.magSize;

            // 3. Fit to screen
            fitImageToScreen();

            updateUI();
        }
        state.image.src = event.target.result;
    }
    if(e.target.files && e.target.files[0]) {
        reader.readAsDataURL(e.target.files[0]);
    }
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
        x: xVisual * scaleX,  
        y: yVisual * scaleY,  
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
}

function updateMagnifier(pos) {
    // UPDATED: Only check if enabled, ignore isDrawing state
    if(!state.magnifyEnabled) {
        magDiv.style.display = 'none';
        return;
    }

    magDiv.style.display = 'block';

    const offset = 100; 
    let top = pos.visualY - offset;
    let left = pos.visualX - offset;

    // Keep inside bounds visually
    if(top < -50) top = pos.visualY + 80; 
    if(left < -50) left = pos.visualX + 80;

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

// Mouse
canvas.addEventListener('mousedown', startLogic);
canvas.addEventListener('mousemove', handleMouseMove); // UPDATED handler
canvas.addEventListener('mouseup', endLogic);
canvas.addEventListener('mouseleave', () => { 
    if(state.isDrawing) endLogic(); 
    magDiv.style.display = 'none'; // Hide mag when leaving canvas
});

// Touch
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startLogic(e); }, {passive: false});
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleMouseMove(e); }, {passive: false});
canvas.addEventListener('touchend', (e) => { e.preventDefault(); endLogic(); });

function handleMouseMove(e) {
    if (!state.image) return;

    const pos = getMapCoordinates(e);

    // 1. ALWAYS update magnifier if moving over canvas
    updateMagnifier(pos);

    // 2. Only update line if actively drawing
    if (state.isDrawing) {
        state.currentLine.x2 = pos.x;
        state.currentLine.y2 = pos.y;
        
        draw(); 
        calculateRatio(); 
    }
}

function startLogic(e) {
    if (!state.image) return;
    if (state.lines.length >= 2) return;

    const pos = getMapCoordinates(e);
    
    state.isDrawing = true;
    state.currentLine = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    
    draw(); 
    // updateMagnifier(pos); -> Now handled by handleMouseMove implicitly or next move event
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

resetBtn.addEventListener('click', () => {
    state.lines = [];
    state.currentLine = null;
    state.isDrawing = false;
    state.referenceIndex = 0;
    refLineName.textContent = NAMES[0];
    refLineName.className = "value blue-text";
    ratioDisplay.textContent = "--";
    draw();
    updateUI();
});

function updateUI() {
    swapBtn.disabled = (state.lines.length !== 2);
}

magValue.textContent = state.zoomLevel + 'x';
magZoomInput.value = state.zoomLevel;

debug("Ready.");