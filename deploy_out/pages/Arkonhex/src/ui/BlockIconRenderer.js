/**
 * BlockIconRenderer.js
 * Renders a 2D isometric block icon to a canvas element using the block's palette colors.
 */

/**
 * Lighten or darken a hex color by a factor.
 * factor > 1 = lighten, factor < 1 = darken
 */
function adjustColor(hex, factor) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.max(0, Math.round(r * factor)));
    g = Math.min(255, Math.max(0, Math.round(g * factor)));
    b = Math.min(255, Math.max(0, Math.round(b * factor)));
    return `rgb(${r},${g},${b})`;
}

/**
 * Draw an isometric cube icon of a given size to an offscreen canvas.
 * Returns the canvas element.
 */
export function renderBlockIcon(blockDef, palette, size = 56) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Resolve colors from palette
    const topHex = palette.get(blockDef.topColor) || '#888888';
    const baseHex = palette.get(blockDef.baseColor) || '#666666';

    const topColor = adjustColor(topHex, 1.15);  // slightly bright top
    const leftColor = adjustColor(baseHex, 0.65);  // dark left side (shadow)
    const rightColor = adjustColor(baseHex, 0.85);  // mid-dark right side

    // Isometric cube proportions
    // We'll draw a cube where:
    //   - The cube has width = size * 0.85, height = size * 0.85
    //   - Top face: rhombus at the top
    //   - Left & right side faces: parallelograms below
    const w = size * 0.85;      // full width of the iso projection
    const h = size * 0.85;      // full height of iso projection
    const offX = (size - w) / 2;
    const offY = (size - h) / 2;

    // Key points for the 3-faced isometric cube:
    //   Top:    TL, TC, TR, MC (middle-center top)
    //   Left:   MC, BL, BC
    //   Right:  MC, TR, BR, BC

    const TL = { x: offX, y: offY + h * 0.25 };  // top-left
    const TC = { x: offX + w * 0.5, y: offY };             // top-center (apex)
    const TR = { x: offX + w, y: offY + h * 0.25 };  // top-right
    const MC = { x: offX + w * 0.5, y: offY + h * 0.5 };  // mid-center (waist)
    const BL = { x: offX, y: offY + h * 0.75 };  // bottom-left
    const BR = { x: offX + w, y: offY + h * 0.75 };  // bottom-right
    const BC = { x: offX + w * 0.5, y: offY + h };         // bottom-center

    // Draw left face (darker)
    ctx.beginPath();
    ctx.moveTo(TL.x, TL.y);
    ctx.lineTo(MC.x, MC.y);
    ctx.lineTo(BC.x, BC.y);
    ctx.lineTo(BL.x, BL.y);
    ctx.closePath();
    ctx.fillStyle = leftColor;
    ctx.fill();

    // Draw right face (medium dark)
    ctx.beginPath();
    ctx.moveTo(TR.x, TR.y);
    ctx.lineTo(MC.x, MC.y);
    ctx.lineTo(BC.x, BC.y);
    ctx.lineTo(BR.x, BR.y);
    ctx.closePath();
    ctx.fillStyle = rightColor;
    ctx.fill();

    // Draw top face (brightest)
    ctx.beginPath();
    ctx.moveTo(TC.x, TC.y);
    ctx.lineTo(TR.x, TR.y);
    ctx.lineTo(MC.x, MC.y);
    ctx.lineTo(TL.x, TL.y);
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();

    // Subtle edge lines for definition
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.8;

    // Spine lines
    ctx.beginPath();
    ctx.moveTo(TC.x, TC.y); ctx.lineTo(MC.x, MC.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(MC.x, MC.y); ctx.lineTo(BC.x, BC.y); ctx.stroke();

    // Outer silhouette
    ctx.beginPath();
    ctx.moveTo(TC.x, TC.y);
    ctx.lineTo(TR.x, TR.y);
    ctx.lineTo(BR.x, BR.y);
    ctx.lineTo(BC.x, BC.y);
    ctx.lineTo(BL.x, BL.y);
    ctx.lineTo(TL.x, TL.y);
    ctx.closePath();
    ctx.stroke();

    return canvas;
}
