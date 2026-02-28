/**
 * Math utilities and seeded random number generation.
 */

// Simple seeded PRNG (Mulberry32)
export function createPRNG(seed = '') {
    // Generate a numeric seed from a string
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    }

    // Mulberry32 generator
    return function () {
        let t = h += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

/**
 * Linear interpolation
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Clamp a value between min and max
 */
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
