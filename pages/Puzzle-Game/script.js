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
    binWidth: 0,
    isWon: false,
    isRomanceMode: false // Default to Normal Mode
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
const audioNormal = document.getElementById('normal-music'); // New Normal Music
const sfxPickup = document.getElementById('sfx-pickup');
const sfxDrop = document.getElementById('sfx-drop');
const sfxSnap = document.getElementById('sfx-snap');
const overlay = document.getElementById('ambient-overlay');
const modal = document.getElementById('modal-overlay');
const uiControls = document.getElementById('game-controls');
const sliderHandle = document.getElementById('slider-handle');
const toggleRomance = document.getElementById('romance-toggle'); // New Toggle
const labelRomance = document.getElementById('romance-label'); // Label
const previewCanvas = document.getElementById('preview-canvas');
const pCtx = previewCanvas.getContext('2d');

// --- Image Loading ---
const img = new Image();

img.onload = () => {
    console.log("Image loaded successfully:", img.width, "x", img.height);
    // Initialize preview canvas size once to prevent lag
    initPreviewCanvas();
    drawPreview();
};
img.onerror = () => {
    console.error("Error loading image. Check if puzzle.webp exists in root.");
    alert("Debug: puzzle.webp not found!");
};

img.src = CONFIG.imageSrc;

// Safety check for cached images
if (img.complete) {
    initPreviewCanvas();
    drawPreview();
}
img.onerror = () => {
    console.error("Error loading image. Check if puzzle.webp exists in root.");
    alert("Debug: puzzle.webp not found!");
};

// --- Preview Initialization ---
function initPreviewCanvas() {
    if (!img.complete || img.naturalWidth === 0) return;

    const aspectRatio = img.height / img.width;
    const maxWidth = 800;
    const height = maxWidth * aspectRatio;

    // Only set dimensions if they differ to avoid partial clears/resets
    if (previewCanvas.width !== maxWidth || previewCanvas.height !== height) {
        previewCanvas.width = maxWidth;
        previewCanvas.height = height;
    }
}

// --- Initialization ---
let isPreviewUpdating = false;
rangeDifficulty.addEventListener('input', (e) => {
    valDifficulty.innerText = e.target.value;
    if (!isPreviewUpdating) {
        requestAnimationFrame(() => {
            drawPreview();
            isPreviewUpdating = false;
        });
        isPreviewUpdating = true;
    }
});

function drawPreview() {
    if (!img.complete || img.naturalWidth === 0) return;

    // Clear previous drawing instead of resizing (which causes lag)
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    const cols = 18 - parseInt(rangeDifficulty.value);
    const aspectRatio = img.height / img.width;
    let rows = Math.round(cols * aspectRatio);
    if (rows < 2) rows = 2;

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
        audioNormal.volume = 0;

        // Try playing both silently to unlock? Or just the active one?
        // Let's just set the context flag. The updateAtmosphere loop will handle playing the correct track.
        // But we need a user interaction to start audio usually.
        // Let's try to start the one that matches the state.
        const currentAudio = state.isRomanceMode ? audio : audioNormal;

        currentAudio.play().then(() => {
            console.log("Audio started silently");
            state.audioContextStarted = true;
            updateAtmosphere(true); // Trigger audio logic immediately
        }).catch(e => console.log("Audio play failed (will retry on interact)", e));
    }

    // UI Update
    document.querySelector('.controls-col').classList.add('hidden');
    // document.getElementById('title-text').classList.add('hidden'); // Keep title visible? Or hide? 
    // User said "make it just say puzzle game always".
    // If I hide it here, it won't say anything.
    // Let's keep it visible.
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
    // Re-calculate scale to fit image into the right 75%
    // Note: We use the maxAvailable dimensions to determine SCALE, but then we shrink the canvas to match result
    const maxAvailableW = maxWidth * CONFIG.boardRatio;
    const maxAvailableH = maxHeight; // 65vh constraint

    const finalScale = Math.min(maxAvailableW / renderWidth, maxAvailableH / renderHeight);

    state.scaleRatio = finalScale;
    state.pieceWidth = (renderWidth / state.gridCols) * finalScale;
    state.pieceHeight = (renderHeight / state.gridRows) * finalScale;

    // Calculate ACTUAL dimensions required
    const actualBoardWidth = renderWidth * finalScale;
    const actualBoardHeight = renderHeight * finalScale;

    // Bin Width is fixed based on screen width? Or proportional?
    // Let's keep it proportional to the *Screen* so dragging area feels generous, 
    // OR proportional to the board? 
    // Let's stick to the screen ratio for the bin size calculation to ensure touchable UI
    state.binWidth = maxWidth * CONFIG.binRatio;

    // Resize Canvas to FIT
    canvas.width = state.binWidth + actualBoardWidth;
    canvas.height = actualBoardHeight;

    // ensure min height for bin if puzzle is very flat?
    if (canvas.height < 300) canvas.height = 300;

    // Board Offset is now simply the bin width (flush right)
    state.boardOffsetX = state.binWidth;

    // Vertical centering of board if we forced min height
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
// --- Drawing Helper ---
// Draws the puzzle shape path. used for both clipping image and stroking outline
function drawPuzzlePiecePath(ctx, piece, x, y, sizeMultiplier = 1) {
    const w = piece.width * sizeMultiplier;
    const h = piece.height * sizeMultiplier;
    const s = Math.min(w, h);

    // Config for shapes
    const tabSize = s * CONFIG.tabSizePct;
    const neck = tabSize * 0.8;
    const cornerRadius = s * 0.1; // Round main corners (10% of size)
    const fillet = tabSize * 0.2; // Fillet radius for tab connections

    // Helper to draw a tab (horizontal or vertical)
    // side: 'top', 'right', 'bottom', 'left'
    // type: 1 (out), -1 (in), 0 (flat)

    ctx.beginPath();

    // Start at Top-Left (after corner radius)
    ctx.moveTo(x + cornerRadius, y);

    // --- TOP EDGE ---
    if (piece.shape.top !== 0) {
        const cx = x + w / 2;
        const dir = -piece.shape.top; // Up is negative

        // Line to start of neck fillet
        ctx.lineTo(cx - neck - fillet, y);
        // Fillet into neck
        ctx.quadraticCurveTo(cx - neck, y, cx - neck, y + (dir * fillet));

        // Tab Curve
        // We use cubic bezier to create the bulb
        // Start: cx - neck, y + fillet
        // Control 1: cx - neck - (tabSize*0.2), y + (dir * tabSize * 1.3)
        // Control 2: cx + neck + (tabSize*0.2), y + (dir * tabSize * 1.3)
        // End: cx + neck, y + (dir * fillet)

        ctx.bezierCurveTo(
            cx - neck - (tabSize * 0.2), y + (dir * tabSize * 1.2),
            cx + neck + (tabSize * 0.2), y + (dir * tabSize * 1.2),
            cx + neck, y + (dir * fillet)
        );

        // Fillet out of neck
        ctx.quadraticCurveTo(cx + neck, y, cx + neck + fillet, y);
    }
    // Line to Top-Right Corner
    ctx.lineTo(x + w - cornerRadius, y);
    // Draw Top-Right Corner
    ctx.quadraticCurveTo(x + w, y, x + w, y + cornerRadius);

    // --- RIGHT EDGE ---
    if (piece.shape.right !== 0) {
        const cy = y + h / 2;
        const dir = piece.shape.right;

        ctx.lineTo(x + w, cy - neck - fillet);
        ctx.quadraticCurveTo(x + w, cy - neck, x + w + (dir * fillet), cy - neck);

        ctx.bezierCurveTo(
            x + w + (dir * tabSize * 1.2), cy - neck - (tabSize * 0.2),
            x + w + (dir * tabSize * 1.2), cy + neck + (tabSize * 0.2),
            x + w + (dir * fillet), cy + neck
        );

        ctx.quadraticCurveTo(x + w, cy + neck, x + w, cy + neck + fillet);
    }
    // Line to Bottom-Right Corner
    ctx.lineTo(x + w, y + h - cornerRadius);
    // Draw Bottom-Right Corner
    ctx.quadraticCurveTo(x + w, y + h, x + w - cornerRadius, y + h);

    // --- BOTTOM EDGE ---
    if (piece.shape.bottom !== 0) {
        const cx = x + w / 2;
        const dir = piece.shape.bottom;

        ctx.lineTo(cx + neck + fillet, y + h);
        ctx.quadraticCurveTo(cx + neck, y + h, cx + neck, y + h + (dir * fillet));

        ctx.bezierCurveTo(
            cx + neck + (tabSize * 0.2), y + h + (dir * tabSize * 1.2),
            cx - neck - (tabSize * 0.2), y + h + (dir * tabSize * 1.2),
            cx - neck, y + h + (dir * fillet)
        );

        ctx.quadraticCurveTo(cx - neck, y + h, cx - neck - fillet, y + h);
    }
    // Line to Bottom-Left Corner
    ctx.lineTo(x + cornerRadius, y + h);
    // Draw Bottom-Left Corner
    ctx.quadraticCurveTo(x, y + h, x, y + h - cornerRadius);

    // --- LEFT EDGE ---
    if (piece.shape.left !== 0) {
        const cy = y + h / 2;
        const dir = -piece.shape.left;

        ctx.lineTo(x, cy + neck + fillet);
        ctx.quadraticCurveTo(x, cy + neck, x + (dir * fillet), cy + neck);

        ctx.bezierCurveTo(
            x + (dir * tabSize * 1.2), cy + neck + (tabSize * 0.2),
            x + (dir * tabSize * 1.2), cy - neck - (tabSize * 0.2),
            x + (dir * fillet), cy - neck
        );

        ctx.quadraticCurveTo(x, cy - neck, x, cy - neck - fillet);
    }
    // Line to Top-Left Corner start (close path)
    ctx.lineTo(x, y + cornerRadius);
    ctx.quadraticCurveTo(x, y, x + cornerRadius, y);

    ctx.closePath();
}

// --- Gap Filler: Fills gaps between locked pieces caused by rounded corners ---
function drawGapFillers() {
    // At every grid junction point (where up to 4 pieces meet),
    // check if adjacent pieces are locked. If so, draw a small image patch
    // to fill the gap left by rounded corners.
    const s = Math.min(state.pieceWidth, state.pieceHeight);
    const cornerRadius = s * 0.1; // Must match the cornerRadius in drawPuzzlePiecePath
    const patchSize = cornerRadius * 2; // Cover the full rounded area

    // Iterate over all interior junction points (where pieces meet)
    // Junctions exist at grid intersections: col from 0..gridCols, row from 0..gridRows
    for (let jRow = 0; jRow <= state.gridRows; jRow++) {
        for (let jCol = 0; jCol <= state.gridCols; jCol++) {
            // The 4 pieces that could surround this junction:
            // Top-Left: (jCol-1, jRow-1), Top-Right: (jCol, jRow-1)
            // Bottom-Left: (jCol-1, jRow), Bottom-Right: (jCol, jRow)
            const tl = getPieceAt(jCol - 1, jRow - 1);
            const tr = getPieceAt(jCol, jRow - 1);
            const bl = getPieceAt(jCol - 1, jRow);
            const br = getPieceAt(jCol, jRow);

            // Only fill when ALL pieces around this junction are locked.
            // For interior junctions that's 4 pieces, for edges 2-3, for corners 2.
            const surrounding = [tl, tr, bl, br].filter(p => p !== null);
            const lockedCount = surrounding.filter(p => p.locked).length;

            // Skip if any surrounding piece is not yet locked
            if (lockedCount < surrounding.length) continue;

            // Junction position in canvas coords
            const jx = state.boardOffsetX + jCol * state.pieceWidth;
            const jy = (state.boardOffsetY || 0) + jRow * state.pieceHeight;

            // Draw a small image patch centered on the junction point
            const patchX = jx - patchSize / 2;
            const patchY = jy - patchSize / 2;

            ctx.save();

            // Clip to just the patch area
            ctx.beginPath();
            ctx.rect(patchX, patchY, patchSize, patchSize);
            ctx.clip();

            // Draw the full image translated so the correct region aligns
            ctx.drawImage(img,
                0, 0, img.width, img.height,
                state.boardOffsetX, (state.boardOffsetY || 0),
                img.width * state.scaleRatio, img.height * state.scaleRatio
            );

            ctx.restore();
        }
    }
}

function getPieceAt(col, row) {
    if (col < 0 || col >= state.gridCols || row < 0 || row >= state.gridRows) return null;
    // Pieces are stored in row-major order (row * cols + col)
    return state.pieces[row * state.gridCols + col] || null;
}

// --- Main Render Loop ---
function gameLoop() {
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update Styles based on progress
    updateAtmosphere();

    // Draw UI Areas
    // 0. Draw Backgrounds for Bin and Board (Only if not won)
    if (!state.isWon) {
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
        // Rounded rect for board too?
        ctx.beginPath();
        ctx.roundRect(state.boardOffsetX, state.boardOffsetY, totalBoardW, totalBoardH, 10);
        ctx.stroke();
    }

    // 1. Draw "Locked" pieces (Background layer essentially)
    // 2. Draw gap fillers between locked pieces
    // 3. Draw "Loose" pieces on top
    // 4. Draw dragging piece on VERY top

    // Sort pieces: Locked first, then loose, then highlighted, then dragged
    const sorted = getSortedPieces();

    // Draw locked pieces first
    sorted.filter(p => p.locked).forEach(p => drawPiece(p));

    // Fill gaps between locked pieces (drawn on top of locked pieces)
    drawGapFillers();

    // Draw loose/dragging pieces on top
    sorted.filter(p => !p.locked).forEach(p => drawPiece(p));

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
    const isDragging = (p === state.selectedPiece);
    const isLocked = p.locked;

    // 1. Draw Shadow (Behind the piece geometry)
    ctx.save();

    // Define Shadow Style
    if (isDragging) {
        // Lifted: Large, soft shadow, offset downwards
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 25;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 20;
    } else if (!isLocked) {
        // Resting loose: Small shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
    } else {
        // Locked: Very subtle or no shadow (since it's 'inserted')
        // Maybe a tiny inner shadow effect? 
        // For performance, and 'flat' look when done, let's skip shadow for locked.
        ctx.shadowColor = "transparent";
    }

    // Draw Shape for Shadow casting (and background fill)
    drawPuzzlePiecePath(ctx, p, p.currentX, p.currentY);
    ctx.fillStyle = "rgba(30,30,30,1)"; // Opaque backing avoids transparency issues
    if (!isLocked) ctx.fill(); // Only fill if not locked to prevent double-draw over background if we want transparency effects? 
    // Actually, we need to fill it to cast the shadow and provide backing for the image.
    else ctx.fillStyle = "rgba(0,0,0,0.5)"; // Darker backing for locked bits

    if (isLocked) {
        // No shadow for locked, but we want the backing
        ctx.fill();
    }

    ctx.restore();

    // 2. Draw Image (Clipped)
    ctx.save();
    drawPuzzlePiecePath(ctx, p, p.currentX, p.currentY);
    ctx.clip();

    // Draw the image segment
    // Source coords (unscaled), Destination coords (scaled)
    // We map the image part to the puzzle shape
    // const srcX = (p.col * (img.width / state.gridCols));
    // const srcY = (p.row * (img.height / state.gridRows));

    // Draw Whole Image Translated
    ctx.drawImage(img,
        0, 0, img.width, img.height, // Source
        p.currentX - (p.col * state.pieceWidth), p.currentY - (p.row * state.pieceHeight),
        (img.width * state.scaleRatio), (img.height * state.scaleRatio) // Destination size matches the scaled puzzle size
    );

    ctx.restore();

    // 3. Highlight / Stroke
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

    // Optional: Subtle white highlight on top/left edges for 3D effect?
    // Let's keep it clean for now.
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

// --- Toggle Logic ---
toggleRomance.addEventListener('change', (e) => {
    state.isRomanceMode = e.target.checked;
    labelRomance.innerText = state.isRomanceMode ? "Romance Mode: On" : "Romance Mode: Off";
    updateAtmosphere(true); // Force update
});

// --- Atmosphere & Surprise Logic ---
function updateAtmosphere(force = false) {
    const pct = state.solvedCount / state.totalPieces;

    // Audio Control
    if (state.audioContextStarted) {
        if (state.isRomanceMode) {
            // Play Romance, Pause Normal
            if (audio.paused) audio.play().catch(() => { });
            audioNormal.pause();
            audioNormal.currentTime = 0; // Reset normal music

            // Ensure audible if at least one piece is solved
            let volume = pct * CONFIG.maxVolume;
            if (state.solvedCount > 0 && volume < 0.1) volume = 0.1;

            audio.volume = Math.min(volume, 1);
        } else {
            // Play Normal, Pause Romance
            if (audioNormal.paused) audioNormal.play().catch(() => { });
            audio.pause();
            audio.currentTime = 0;

            let volume = pct * CONFIG.maxVolume;
            if (state.solvedCount > 0 && volume < 0.1) volume = 0.1;

            audioNormal.volume = Math.min(volume, 1);
        }
    }

    // Visuals
    // pct * 0.8 is max opacity.
    overlay.style.opacity = pct * 0.8;

    // Attribution Control
    const attrRomance = document.getElementById('attribution-romance');
    const attrNormal = document.getElementById('attribution-normal');

    if (state.isRomanceMode) {
        // Pink / Romance Theme
        overlay.classList.remove('blue-mode');

        // Attribution
        if (attrRomance) attrRomance.style.display = 'block';
        if (attrNormal) attrNormal.style.display = 'none';

        // Only spawn hearts if NOT WON
        if (!state.isWon && pct > 0.1 && Math.random() < (pct * 0.05)) {
            createHeart();
        }

        if (!document.body.classList.contains('in-love')) {
            document.body.classList.add('in-love');
        }

        // Title Text Logic: Only hide on win, do NOT change text
        const title = document.getElementById('title-text');
        if (state.isWon) {
            title.classList.add('hidden'); // Hide on win
        } else {
            title.classList.remove('hidden');
        }

    } else {
        // Normal / Blue Theme
        overlay.classList.add('blue-mode');
        document.body.classList.remove('in-love');

        // Attribution
        if (attrRomance) attrRomance.style.display = 'none';
        if (attrNormal) attrNormal.style.display = 'block';

        const title = document.getElementById('title-text');
        if (state.isWon) {
            title.classList.add('hidden'); // Hide on win
        } else {
            title.classList.remove('hidden');
        }
    }
}

function createHeart() {
    const heart = document.createElement('img');
    heart.src = 'heart.svg'; // User provided SVG
    heart.classList.add('heart');
    // Ensure full width usage
    heart.style.left = Math.random() * 100 + 'vw';
    heart.style.bottom = '-20px'; // Start slightly below

    // Randomize size slightly (smaller base size handled in CSS)
    const scale = 0.8 + (Math.random() * 0.5);
    heart.style.transform = `scale(${scale})`;

    document.getElementById('hearts-container').appendChild(heart);

    // Cleanup
    setTimeout(() => {
        heart.remove();
    }, 4000);
}

function triggerWin() {
    state.isWon = true; // Set win flag

    // Hide controls BUT keep Reset visible
    // uiControls.classList.add('hidden'); // OLD

    // Hide specific buttons instead
    document.getElementById('btn-help').classList.add('hidden');
    // We keep btn-reset visible.

    // Force update atmosphere to apply win state logic (hide title, stop hearts)
    updateAtmosphere(true);

    // Center the Puzzle
    // Center the Puzzle
    // Calculate new centered offset
    const totalBoardW = state.gridCols * state.pieceWidth;
    // const totalBoardH = state.gridRows * state.pieceHeight;

    const newOffsetX = (canvas.width - totalBoardW) / 2;
    const deltaX = newOffsetX - state.boardOffsetX;

    // Apply shift to all pieces
    state.pieces.forEach(p => {
        p.currentX += deltaX;
        p.correctX += deltaX;
    });

    state.boardOffsetX = newOffsetX; // Update state offset

    // Burst of hearts ONLY in Romance Mode
    if (state.isRomanceMode) {
        for (let i = 0; i < 25; i++) {
            setTimeout(createHeart, i * 100);
        }
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

// Cache track element
let sliderTrack = null;

function startSlide(e) {
    isSliding = true;
    sliderTrack = document.querySelector('.slider-confirm-track');
}

window.addEventListener('mousemove', moveSlide);
window.addEventListener('touchmove', (e) => moveSlide(e.touches[0]));

function moveSlide(e) {
    if (!isSliding || !sliderTrack) return;
    const rect = sliderTrack.getBoundingClientRect();
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
    state.isWon = false; // Reset win flag
    modal.classList.add('hidden');
    sliderHandle.style.left = '0px';
    document.body.classList.remove('in-love');
    overlay.style.opacity = 0;
    audio.pause();
    audio.currentTime = 0;
    audioNormal.pause();
    audioNormal.currentTime = 0;

    // Return to Start Screen
    document.querySelector('.controls-col').classList.remove('hidden');
    document.getElementById('title-text').classList.remove('hidden');
    document.getElementById('title-text').innerText = "Puzzle Game"; // Reset Text to static
    uiControls.classList.add('hidden'); // Hide IN-GAME buttons (Help/Reset) until start

    // Restore buttons visibility inside uiControls
    document.getElementById('btn-help').classList.remove('hidden');
    uiControls.classList.add('hidden');
    canvas.classList.add('hidden'); // Hide Puzzle Canvas

    // We don't call startGame() immediately. User must press Initialize.
    // But we might want to clear the canvas or show the preview again?
    // Drawing the preview is a good idea.
    if (img.complete) drawPreview();
}