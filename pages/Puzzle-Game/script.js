/* =========================================
   Valentine's Puzzle Script
   ========================================= */

// --- Configuration & State ---
const CONFIG = {
    imageSrc: 'puzzle.webp', // Ensure this file exists
    snapDistance: 20, // Distance to lock pieces
    tabSizePct: 0.3, // Size of puzzle tabs relative to piece (Increased slightly for better circular shape)
    maxVolume: 0.8,
    binRatio: 0.25, // 25% for the bin (left)
    boardRatio: 0.75 // 75% for the board (right)
};

let state = {
    pieces: [],
    gridCols: 4,
    gridRows: 4,
    pieceWidth: 0,
    pieceHeight: 0,
    isDragging: false,
    selectedPiece: null,
    offsetX: 0,
    offsetY: 0,
    solvedCount: 0,
    totalPieces: 0,
    scaleRatio: 1, // Canvas pixel to display ratio
    audioContextStarted: false,
    boardOffsetX: 0,
    binWidth: 0
};

// --- DOM Elements ---
const canvas = document.getElementById('puzzle-canvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');
const btnHelp = document.getElementById('btn-help');
const btnReset = document.getElementById('btn-reset');
const btnCancel = document.getElementById('btn-cancel');
const rangeDifficulty = document.getElementById('difficulty');
const valDifficulty = document.getElementById('difficulty-val');
const audio = document.getElementById('bg-music');
const sfxPickup = document.getElementById('sfx-pickup');
const sfxDrop = document.getElementById('sfx-drop');
const sfxSnap = document.getElementById('sfx-snap');
const overlay = document.getElementById('ambient-overlay');
const modal = document.getElementById('modal-overlay');
const uiControls = document.getElementById('game-controls');
const sliderHandle = document.getElementById('slider-handle');
const previewCanvas = document.getElementById('preview-canvas');
const pCtx = previewCanvas.getContext('2d');

// --- Image Loading ---
const img = new Image();

img.onload = () => {
    console.log("Image loaded successfully:", img.width, "x", img.height);
    // Draw initial preview
    drawPreview();
};
img.onerror = () => {
    console.error("Error loading image. Check if puzzle.webp exists in root.");
    alert("Debug: puzzle.webp not found!");
};

img.src = CONFIG.imageSrc;

// Safety check for cached images
if (img.complete) drawPreview();
img.onerror = () => {
    console.error("Error loading image. Check if puzzle.webp exists in root.");
    alert("Debug: puzzle.webp not found!");
};

// --- Initialization ---
rangeDifficulty.addEventListener('input', (e) => {
    valDifficulty.innerText = e.target.value;
    drawPreview();
});

function drawPreview() {
    if (!img.complete || img.naturalWidth === 0) return;

    const cols = 18 - parseInt(rangeDifficulty.value);
    const aspectRatio = img.height / img.width;
    let rows = Math.round(cols * aspectRatio);
    if (rows < 2) rows = 2;

    // Scale canvas to match aspect ratio
    const maxWidth = 600; // 3x larger (was 200)
    const height = maxWidth * aspectRatio;
    previewCanvas.width = maxWidth;
    previewCanvas.height = height;

    // Draw Image
    pCtx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);

    // Draw Grid
    pCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    pCtx.lineWidth = 1;

    const cellW = previewCanvas.width / cols;
    const cellH = previewCanvas.height / rows;

    pCtx.beginPath();
    // Vertical lines
    for (let c = 1; c < cols; c++) {
        pCtx.moveTo(c * cellW, 0);
        pCtx.lineTo(c * cellW, previewCanvas.height);
    }
    // Horizontal lines
    for (let r = 1; r < rows; r++) {
        pCtx.moveTo(0, r * cellH);
        pCtx.lineTo(previewCanvas.width, r * cellH);
    }
    pCtx.stroke();

    // Highlight one piece size?
    // Maybe just the grid is enough to show "Scale"
    // Let's add a small red box for "This Size"? 
    // No, the grid is clearer.
}

btnStart.addEventListener('click', startGame);

function startGame() {
    console.log("Starting game...");

    // Audio Context Handling
    if (!state.audioContextStarted) {
        audio.volume = 0;
        audio.play().then(() => {
            console.log("Audio started silently");
            state.audioContextStarted = true;
        }).catch(e => console.log("Audio play failed (will retry on interact)", e));
    }

    // UI Update
    document.querySelector('.controls-col').classList.add('hidden');
    document.getElementById('title-text').classList.add('hidden'); // Hide Title
    uiControls.classList.remove('hidden');
    canvas.classList.remove('hidden'); // Show Puzzle Canvas

    // Inverted Logic: Larger Number = Larger Pieces = Fewer Cols
    // Slider Range: 3 to 15.
    // Map 3 -> 15 (Smallest Pieces)
    // Map 15 -> 3 (Largest Pieces)
    // Formula: (Max + Min) - Val => (15 + 3) - Val = 18 - Val
    state.gridCols = 18 - parseInt(rangeDifficulty.value);

    // Calculate rows to maintain aspect ratio, approx square pieces
    const aspectRatio = img.height / img.width;
    state.gridRows = Math.round(state.gridCols * aspectRatio);

    // Fallback if rows < 2
    if (state.gridRows < 2) state.gridRows = 2;

    initCanvas();
    createPieces();
    scramblePieces();

    // Start Loop
    requestAnimationFrame(gameLoop);
    console.log(`Game initialized: ${state.gridCols}x${state.gridRows}`);
}

// --- Canvas Setup ---
function initCanvas() {
    // Responsive Sizing
    // We need to fit within the container, accounting for the controls bar
    const container = document.getElementById('game-container');
    const controlsHeight = uiControls.classList.contains('hidden') ? 0 : uiControls.clientHeight;

    // Use container dimensions
    const maxWidth = container.clientWidth;
    // container height is calc(100vh - 80px), minus the controls bar
    const maxHeight = container.clientHeight - controlsHeight;

    let renderWidth = img.width;
    let renderHeight = img.height;

    // The puzzle board will occupy the RIGHT side (CONFIG.boardRatio)
    // So we need to scale the image such that it fits within (maxWidth * CONFIG.boardRatio) x maxHeight
    const availableBoardWidth = maxWidth * CONFIG.boardRatio;
    const availableBoardHeight = maxHeight;

    // Scale to fit the BOARD area
    const scale = Math.min(availableBoardWidth / renderWidth, availableBoardHeight / renderHeight);

    // Canvas needs to be wider to include the BIN
    // If the board takes up boardRatio, then Total Width = BoardWidth / boardRatio
    // But we actually just want: Bin Width + Board Width
    // Let's say we reserve fixed ratio.

    // We want the board execution to be exact. 
    // realBoardWidth = renderWidth * scale;
    // realBoardHeight = renderHeight * scale;
    // totalCanvasWidth = realBoardWidth / CONFIG.boardRatio;

    // However, to fill the screen better, let's just use the window width
    canvas.width = maxWidth;
    canvas.height = maxHeight; // distinct from board height

    // Re-calculate scale to fit image into the right 75%
    const maxBoardW = canvas.width * CONFIG.boardRatio;
    const maxBoardH = canvas.height;

    const finalScale = Math.min(maxBoardW / renderWidth, maxBoardH / renderHeight);

    state.scaleRatio = finalScale;
    state.pieceWidth = (renderWidth / state.gridCols) * finalScale;
    state.pieceHeight = (renderHeight / state.gridRows) * finalScale;

    // Calculate Offsets
    // Center the board in the Right 75% area? Or just align left of that area?
    // Let's simple-align: Bin is 0 to (width * binRatio). Board is rest.
    state.binWidth = canvas.width * CONFIG.binRatio;

    // Center the board within the remaining space
    const boardAreaWidth = canvas.width - state.binWidth;
    const actualBoardWidth = renderWidth * finalScale;
    const actualBoardHeight = renderHeight * finalScale;

    // Center horizontally in the board area
    state.boardOffsetX = state.binWidth + (boardAreaWidth - actualBoardWidth) / 2;
    state.boardOffsetY = (canvas.height - actualBoardHeight) / 2;
}

// --- Puzzle Logic ---

function createPieces() {
    state.pieces = [];
    state.solvedCount = 0;
    state.totalPieces = state.gridCols * state.gridRows;

    for (let row = 0; row < state.gridRows; row++) {
        for (let col = 0; col < state.gridCols; col++) {
            // Determine Tab Shapes: 1 = Out, -1 = In, 0 = Flat (Edge)
            const right = (col === state.gridCols - 1) ? 0 : (Math.random() > 0.5 ? 1 : -1);
            const bottom = (row === state.gridRows - 1) ? 0 : (Math.random() > 0.5 ? 1 : -1);
            const left = (col === 0) ? 0 : -state.pieces[state.pieces.length - 1].shape.right;
            const top = (row === 0) ? 0 : -state.pieces[state.pieces.length - state.gridCols].shape.bottom;

            state.pieces.push({
                row, col,
                // Correct position is relative to the board offset
                correctX: state.boardOffsetX + (col * state.pieceWidth),
                correctY: state.boardOffsetY + (row * state.pieceHeight),
                currentX: 0,
                currentY: 0,
                width: state.pieceWidth,
                height: state.pieceHeight,
                shape: { top, right, bottom, left },
                locked: false,
                highlight: false,
                group: null // Reference to group array if connected
            });
        }
    }
}

function scramblePieces() {
    state.pieces.forEach(p => {
        // Random position within BIN bounds (Left side)
        // Pad with 10px so pieces don't spawn half-offscreen
        const maxX = state.binWidth - p.width;
        const maxY = canvas.height - p.height;

        p.currentX = Math.random() * (maxX > 0 ? maxX : 0);
        p.currentY = Math.random() * (maxY > 0 ? maxY : 0);

        p.group = null; // Reset groups
        p.locked = false;
    });
}

// --- Drawing Helper ---
// Draws the puzzle shape path. used for both clipping image and stroking outline
// Draws the puzzle shape path. used for both clipping image and stroking outline
function drawPuzzlePiecePath(ctx, piece, x, y, sizeMultiplier = 1) {
    const w = piece.width * sizeMultiplier;
    const h = piece.height * sizeMultiplier;
    const s = Math.min(w, h);
    const tab = s * CONFIG.tabSizePct; // Tab Size (Radius-ish)

    // Neck width: logic to make it look like a circle.
    // If we want a circle of radius 'tab', the neck is narrower.
    // Let's use neck = tab * 0.8 or something consistent.
    // Actually, to make it circular, we should center the tab on the edge.
    // Edge center is w/2 or h/2.
    // We want the tab to extend from (center - neck/2) to (center + neck/2).

    const neck = tab * 0.8;

    ctx.beginPath();
    ctx.moveTo(x, y);

    // Top
    if (piece.shape.top !== 0) {
        const cx = x + w / 2;
        ctx.lineTo(cx - neck, y);
        // Cubic bezier for a circle-ish tab
        // Control points need to go Up (negative Y) for tab -1 (Out? Wait. Code says -1 is In... let's check config)
        // Original code: -1 = In, 1 = Out ? No.
        // Let's re-read: left = -...right.
        // Let's assume 1 is Out, -1 is In.
        // If Top is 1 (Out): y goes negative.

        const dir = -piece.shape.top; // Up is negative Y
        const tabH = tab * 1.0;

        ctx.bezierCurveTo(
            cx - neck, y + (dir * tabH),
            cx + neck, y + (dir * tabH),
            cx + neck, y
        );
    }
    ctx.lineTo(x + w, y);

    // Right
    if (piece.shape.right !== 0) {
        const cy = y + h / 2;
        ctx.lineTo(x + w, cy - neck);

        const dir = piece.shape.right; // Right is positive X
        const tabH = tab * 1.0;

        ctx.bezierCurveTo(
            x + w + (dir * tabH), cy - neck,
            x + w + (dir * tabH), cy + neck,
            x + w, cy + neck
        );
    }
    ctx.lineTo(x + w, y + h);

    // Bottom
    if (piece.shape.bottom !== 0) {
        const cx = x + w / 2;
        ctx.lineTo(cx + neck, y + h);

        const dir = piece.shape.bottom; // Down is positive Y
        const tabH = tab * 1.0;

        ctx.bezierCurveTo(
            cx + neck, y + h + (dir * tabH),
            cx - neck, y + h + (dir * tabH),
            cx - neck, y + h
        );
    }
    ctx.lineTo(x, y + h);

    // Left
    if (piece.shape.left !== 0) {
        const cy = y + h / 2;
        ctx.lineTo(x, cy + neck);

        const dir = -piece.shape.left; // Left is negative X
        const tabH = tab * 1.0;

        ctx.bezierCurveTo(
            x + (dir * tabH), cy + neck,
            x + (dir * tabH), cy - neck,
            x, cy - neck
        );
    }
    ctx.lineTo(x, y);
    ctx.closePath();
}

// --- Main Render Loop ---
function gameLoop() {
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update Styles based on progress
    updateAtmosphere();

    // Draw UI Areas
    // 0. Draw Backgrounds for Bin and Board

    // Bin Area (Left)
    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    ctx.fillRect(0, 0, state.binWidth, canvas.height);

    // Board Area (Right) - Constrain to ACTUAL Puzzle Size
    const totalBoardW = state.gridCols * state.pieceWidth;
    const totalBoardH = state.gridRows * state.pieceHeight;

    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    // Use the calculated offsets and dimensions, not the full remaining canvas
    ctx.fillRect(state.boardOffsetX, state.boardOffsetY, totalBoardW, totalBoardH);

    // Draw "Board" outline/placeholder
    // We know where the puzzle SHOULD be:
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    ctx.strokeRect(state.boardOffsetX, state.boardOffsetY, totalBoardW, totalBoardH);

    // 1. Draw "Locked" pieces (Background layer essentially)
    // 2. Draw "Loose" pieces on top
    // 3. Draw dragging piece on VERY top

    // Sort pieces: Locked first, then loose, then highlighted, then dragged
    // Sort pieces: Locked first, then loose, then highlighted, then dragged
    const sorted = getSortedPieces();

    sorted.forEach(p => drawPiece(p));

    requestAnimationFrame(gameLoop);
}

function getSortedPieces() {
    return [...state.pieces].sort((a, b) => {
        if (a === state.selectedPiece) return 1;
        if (b === state.selectedPiece) return -1;

        // Highlighted pieces should be strictly on top of non-selected pieces
        if (a.highlight && !b.highlight) return 1;
        if (!a.highlight && b.highlight) return -1;

        if (a.locked && !b.locked) return -1;
        if (!a.locked && b.locked) return 1;
        return 0;
    });
}

function drawPiece(p) {
    ctx.save();

    // Logic to clip the image
    drawPuzzlePiecePath(ctx, p, p.currentX, p.currentY);
    ctx.clip();

    // Draw the image segment
    // Source coords (unscaled), Destination coords (scaled)
    // We map the image part to the puzzle shape
    const srcX = (p.col * (img.width / state.gridCols));
    const srcY = (p.row * (img.height / state.gridRows));
    const srcW = img.width / state.gridCols;
    const srcH = img.height / state.gridRows;

    // Need to account for tabs in the source image grab or it looks cut off
    // However, simplest way is to draw the Whole Image translated

    const scaledImgW = canvas.width;
    const scaledImgH = canvas.height;

    ctx.drawImage(img,
        0, 0, img.width, img.height, // Source
        p.currentX - (p.col * state.pieceWidth), p.currentY - (p.row * state.pieceHeight),
        (img.width * state.scaleRatio), (img.height * state.scaleRatio) // Destination size matches the scaled puzzle size
    );

    ctx.restore();

    // Stroke / Outline
    // User requested removal of border outline
    // We only keep the highlight if active
    if (!p.locked && p.highlight) {
        ctx.save();
        drawPuzzlePiecePath(ctx, p, p.currentX, p.currentY);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#FFFF00"; // Bright Yellow helper
        ctx.shadowBlur = 10;
        ctx.shadowColor = "white";
        ctx.stroke();
        ctx.restore();
    }
}

// --- Interaction (Mouse & Touch) ---
canvas.addEventListener('mousedown', handleInputDown);
canvas.addEventListener('mousemove', handleInputMove);
canvas.addEventListener('mouseup', handleInputUp);
canvas.addEventListener('touchstart', (e) => handleInputDown(e.touches[0]));
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleInputMove(e.touches[0]); });
canvas.addEventListener('touchend', handleInputUp);

function handleInputDown(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check click on pieces (reverse order of DRAWING to get top one)
    // We must use the same sort order as drawing to ensure we click what we see on top
    const sorted = getSortedPieces();

    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        if (x > p.currentX && x < p.currentX + p.width &&
            y > p.currentY && y < p.currentY + p.height &&
            !p.locked) {

            state.isDragging = true;
            state.selectedPiece = p;

            // Play Pickup Sound
            playSound(sfxPickup);

            // Clear highlight if interacting with it (Help system persistence)
            if (p.highlight) p.highlight = false;

            state.offsetX = x - p.currentX;
            state.offsetY = y - p.currentY;
            break;
        }
    }
}

function playSound(el) {
    if (el) {
        el.currentTime = 0;
        el.play().catch(e => { /* Ignore auto-play blocks */ });
    }
}

function handleInputMove(e) {
    if (!state.isDragging || !state.selectedPiece) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Move current piece
    const dx = x - state.offsetX - state.selectedPiece.currentX;
    const dy = y - state.offsetY - state.selectedPiece.currentY;

    state.selectedPiece.currentX += dx;
    state.selectedPiece.currentY += dy;

    // If it's part of a group, move the group too? 
    // Simplified: No groups for this snippet to keep it robust. 
    // Just individual snapping to grid or neighbor.
}

function handleInputUp() {
    if (state.selectedPiece) {
        const snapped = checkSnap(state.selectedPiece);
        // If not snapped, play drop sound
        if (!snapped) {
            playSound(sfxDrop);
        }
        state.selectedPiece = null;
    }
    state.isDragging = false;
}

function checkSnap(p) {
    // 1. Check if near correct slot
    const dist = Math.hypot(p.currentX - p.correctX, p.currentY - p.correctY);

    if (dist < CONFIG.snapDistance) {
        snapToGrid(p);
        return true;
    }

    // 2. Check Neighbor snapping (Advanced - omitted for code size, just Snap to Grid is usually sufficient for Web Puzzles of this scale)
    // However, if we implemented neighbor locking, we'd check it here.
    // For now, let's keep it simple as requested or just rely on grid snap.
    // Neighbors code block below was doing neighbor snap:

    let snappedToNeighbor = false;
    const neighbors = [
        { dx: -1, dy: 0, side: 'left' },
        { dx: 1, dy: 0, side: 'right' },
        { dx: 0, dy: -1, side: 'top' },
        { dx: 0, dy: 1, side: 'bottom' }
    ];

    neighbors.forEach(n => {
        if (snappedToNeighbor) return;

        const neighborCol = p.col + n.dx;
        const neighborRow = p.row + n.dy;
        const neighbor = state.pieces.find(pc => pc.col === neighborCol && pc.row === neighborRow);

        if (neighbor && neighbor.locked) {
            // Check distance to neighbor
            const targetX = neighbor.currentX - (n.dx * state.pieceWidth);
            const targetY = neighbor.currentY - (n.dy * state.pieceHeight);

            if (Math.hypot(p.currentX - targetX, p.currentY - targetY) < CONFIG.snapDistance) {
                snapToGrid(p);
                snappedToNeighbor = true;
            }
        }
    });

    return snappedToNeighbor;
}

function snapToGrid(p) {
    p.currentX = p.correctX;
    p.currentY = p.correctY;
    p.locked = true;
    p.highlight = false;

    // Play snap sound (optional)
    playSound(sfxSnap);

    // check win condition
    const lockedCount = state.pieces.filter(x => x.locked).length;
    state.solvedCount = lockedCount;

    // Debug
    console.log(`Progress: ${lockedCount}/${state.totalPieces}`);

    // If Complete
    if (lockedCount === state.totalPieces) {
        triggerWin();
    }
}

// --- Helpers: Hint System ---
btnHelp.addEventListener('click', () => {
    // Find two unlocked neighbors
    for (let p of state.pieces) {
        if (p.locked) continue;

        // Check Right neighbor
        const neighbor = state.pieces.find(n => n.col === p.col + 1 && n.row === p.row && !n.locked);
        if (neighbor) {
            // Highlight them
            p.highlight = true;
            neighbor.highlight = true;
            // Removed timeout so they stay encouraged/on top until selected
            return;
        }
    }
    console.log("No simple matches found to hint.");
});

// --- Atmosphere & Surprise Logic ---
function updateAtmosphere() {
    const pct = state.solvedCount / state.totalPieces;

    // Audio Volume Ramp
    if (state.audioContextStarted) {
        audio.volume = Math.min(pct * CONFIG.maxVolume, 1);
    }

    // Visuals
    overlay.style.opacity = pct * 0.8; // Pink overlay gets stronger

    // Spawn Hearts randomly based on progress
    // Spawn Hearts randomly based on progress
    // Only spawn if progress is > 50%
    if (pct > 0.5 && Math.random() < (pct * 0.05)) {
        createHeart();
    }

    // Change Theme at 50%
    if (pct > 0.5 && !document.body.classList.contains('in-love')) {
        document.body.classList.add('in-love');
        document.getElementById('title-text').innerText = "System ... Feeling?";
    }
}

function createHeart() {
    const heart = document.createElement('img');
    heart.src = 'heart.svg'; // User provided SVG
    heart.classList.add('heart');
    heart.style.left = Math.random() * 100 + 'vw';
    heart.style.bottom = '-50px';
    // Randomize size slightly
    const scale = 0.5 + Math.random();
    heart.style.transform = `scale(${scale})`;

    document.getElementById('hearts-container').appendChild(heart);

    // Cleanup
    setTimeout(() => {
        heart.remove();
    }, 4000);
}

function triggerWin() {
    document.getElementById('title-text').innerText = "I Love You"; // Or custom message
    uiControls.classList.add('hidden');
    // Burst of hearts
    for (let i = 0; i < 50; i++) {
        setTimeout(createHeart, i * 50);
    }
}

// --- Reset Slider Logic ---
btnReset.addEventListener('click', () => {
    modal.classList.remove('hidden');
});

btnCancel.addEventListener('click', () => {
    modal.classList.add('hidden');
    sliderHandle.style.left = '0px';
});

let isSliding = false;
sliderHandle.addEventListener('mousedown', startSlide);
sliderHandle.addEventListener('touchstart', startSlide);

function startSlide(e) {
    isSliding = true;
}

window.addEventListener('mousemove', moveSlide);
window.addEventListener('touchmove', (e) => moveSlide(e.touches[0]));

function moveSlide(e) {
    if (!isSliding) return;
    const track = document.querySelector('.slider-confirm-track');
    const rect = track.getBoundingClientRect();
    let x = (e.clientX || e.pageX) - rect.left - 25; // 25 is half handle width

    const max = rect.width - 50;
    if (x < 0) x = 0;
    if (x > max) x = max;

    sliderHandle.style.left = x + 'px';

    if (x >= max - 5) {
        // Trigger Reset
        isSliding = false;
        resetGame();
    }
}

window.addEventListener('mouseup', endSlide);
window.addEventListener('touchend', endSlide);

function endSlide() {
    if (!isSliding) return;
    isSliding = false;
    // Snap back
    sliderHandle.style.transition = 'left 0.3s';
    sliderHandle.style.left = '0px';
    setTimeout(() => sliderHandle.style.transition = 'none', 300);
}

function resetGame() {
    modal.classList.add('hidden');
    sliderHandle.style.left = '0px';
    document.body.classList.remove('in-love');
    overlay.style.opacity = 0;
    audio.pause();
    audio.currentTime = 0;

    // Return to Start Screen
    document.querySelector('.controls-col').classList.remove('hidden');
    document.getElementById('title-text').classList.remove('hidden');
    document.getElementById('title-text').innerText = "Select puzzle piece size"; // Reset Text
    uiControls.classList.add('hidden');
    canvas.classList.add('hidden'); // Hide Puzzle Canvas

    // We don't call startGame() immediately. User must press Initialize.
    // But we might want to clear the canvas or show the preview again?
    // Drawing the preview is a good idea.
    if (img.complete) drawPreview();
}