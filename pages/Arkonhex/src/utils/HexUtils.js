/**
 * Hexagonal Math Utilities for Pointy-Topped Hexagons using Axial Coordinates (q, r)
 * Axial coordinates (q, r) map directly to cube coordinates (q, r, s) where q + r + s = 0.
 */

export const HEX_SIZE = 1.0; // Radius (center to corner)

// For pointy-topped hexagons:
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// Axial directions for neighbors (q, r)
export const HEX_DIRECTIONS = [
    [1, 0], [1, -1], [0, -1],
    [-1, 0], [-1, 1], [0, 1]
];

/**
 * Convert axial coordinates (q, r) to 3D world space (x, y, z)
 * 3D Y is up (elevation), so 3D Z corresponds to the hex 2D Y.
 */
export function axialToWorld(q, r, y = 0) {
    const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
    const z = HEX_SIZE * 3 / 2 * r;
    return { x, y, z };
}

/**
 * Convert 3D world space (x, z) to fractional axial coordinates
 */
export function worldToAxialRaw(x, z) {
    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * z) / HEX_SIZE;
    const r = (2 / 3 * z) / HEX_SIZE;
    return { q, r };
}

/**
 * Convert 3D world space (x, z) to nearest integer axial coordinates (q, r)
 */
export function worldToAxial(x, z) {
    const raw = worldToAxialRaw(x, z);
    return axialRound(raw.q, raw.r);
}

/**
 * Round fractional axial coordinates to nearest integer axial coordinates
 */
export function axialRound(fracQ, fracR) {
    let fracS = -fracQ - fracR;

    let q = Math.round(fracQ);
    let r = Math.round(fracR);
    let s = Math.round(fracS);

    const qDiff = Math.abs(q - fracQ);
    const rDiff = Math.abs(r - fracR);
    const sDiff = Math.abs(s - fracS);

    if (qDiff > rDiff && qDiff > sDiff) {
        q = -r - s;
    } else if (rDiff > sDiff) {
        r = -q - s;
    }

    return { q, r };
}

/**
 * Get the neighboring axial coordinate in a given direction index (0-5)
 */
export function getNeighbor(q, r, direction) {
    const dir = HEX_DIRECTIONS[direction];
    return { q: q + dir[0], r: r + dir[1] };
}

/**
 * Calculate hex distance between two axial coordinates
 */
export function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}
