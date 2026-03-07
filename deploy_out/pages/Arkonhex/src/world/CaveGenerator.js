import { SimplexNoise } from '../utils/SimplexNoise.js';
import { createPRNG } from '../utils/MathUtils.js';

/**
 * CaveGenerator — Produces a connected underground cave network using
 * 3D simplex noise worm carving.  Two noise channels are intersected to
 * create worm-like tunnels, and a third channel produces larger caverns.
 *
 * Smart rules:
 *  • Never carves within 4 blocks of the terrain surface
 *  • Never carves bedrock (y <= 1)
 *  • Never carves under ocean columns (avoids flooding)
 *  • Density peaks at mid-depths, fading near surface and bedrock
 */
export class CaveGenerator {
    /**
     * @param {string} seed  World seed string
     * @param {number} seaLevel  World sea level Y value
     */
    constructor(seed, seaLevel) {
        this.seaLevel = seaLevel;

        // --- Dedicated noise instances for each cave channel ---
        // Using unique salt strings ensures cave noise is independent of terrain noise.
        const worm1Prng = createPRNG(seed + '_cave_worm1');
        this.wormNoise1 = new SimplexNoise(worm1Prng);

        const worm2Prng = createPRNG(seed + '_cave_worm2');
        this.wormNoise2 = new SimplexNoise(worm2Prng);

        const cavernPrng = createPRNG(seed + '_cave_cavern');
        this.cavernNoise = new SimplexNoise(cavernPrng);

        // --- Tuning constants ---

        // Worm tunnel noise scale — LOWER = wider, smoother tunnels
        this.wormScale = 0.018;
        // Worm threshold — both channels must be within ±threshold to carve
        // HIGHER = thicker tunnels
        this.wormThreshold = 0.19;

        // Large cavern noise scale — LOWER = bigger chambers
        this.cavernScale = 0.008;
        // Cavern carve-threshold — LOWER = more cavern volume
        this.cavernThreshold = 0.45;

        // Surface protection depth (caves within this many blocks of surface are suppressed)
        // Set to 1 so many caves intersect and open onto the surface
        this.surfaceBuffer = 1;

        // Y range for caverns — extends nearly the full world depth
        this.cavernMinY = 2;
        this.cavernMaxY = 55;
    }

    /**
     * Determine whether the block at a given 3D position should be carved
     * out as part of the cave system.
     *
     * @param {number} worldX   World-space X (from axialToWorld)
     * @param {number} worldZ   World-space Z (from axialToWorld)
     * @param {number} y        Block Y (elevation layer, 0 = bottom)
     * @param {number} surfaceY The terrain surface height at this column
     * @returns {boolean} true if this block should be air (carved)
     */
    shouldCarve(worldX, worldZ, y, surfaceY) {
        // ---- Smart protection rules ----

        // Never carve bedrock layer
        if (y <= 1) return false;

        // Never carve near the surface (prevents ugly surface holes)
        if (y >= surfaceY - this.surfaceBuffer) return false;

        // Never carve under ocean columns (prevents underwater flooding)
        if (surfaceY <= this.seaLevel) return false;

        // ---- Depth-based density falloff ----
        // Caves are sparser near the very bottom and near the surface.
        // densityMod goes from 0 at extremes to 1 at the sweet spot mid-range.
        const normalizedY = (y - 2) / (surfaceY - this.surfaceBuffer - 2);  // 0..1
        // Bell-curve: strongest at ~0.4 (mid-depth), fading at extremes
        const densityMod = Math.sin(normalizedY * Math.PI);

        // ---- Worm Tunnel Pass ----
        // Sample two independent 3D noise fields. A block is tunnel-carved when
        // BOTH fields are close to zero (their absolute values < threshold).
        // The intersection of two near-zero isosurfaces naturally forms
        // connected worm-shaped corridors.
        const w1 = this.wormNoise1.noise3D(
            worldX * this.wormScale,
            y * this.wormScale,
            worldZ * this.wormScale
        );
        const w2 = this.wormNoise2.noise3D(
            worldX * this.wormScale,
            y * this.wormScale,
            worldZ * this.wormScale
        );

        // Scale threshold by density modifier so tunnels thin out near edges
        const adjustedThreshold = this.wormThreshold * (0.5 + 0.5 * densityMod);

        if (Math.abs(w1) < adjustedThreshold && Math.abs(w2) < adjustedThreshold) {
            return true;
        }

        // ---- Large Cavern Pass ----
        // Single noise field sampled at smaller scale for open chambers.
        // Only active in the mid-depth sweet-spot.
        if (y >= this.cavernMinY && y <= this.cavernMaxY) {
            const c = this.cavernNoise.noise3D(
                worldX * this.cavernScale,
                y * this.cavernScale * 0.7, // Vertically squashed for wider chambers
                worldZ * this.cavernScale
            );

            // Cavern threshold adjusted by density — only opens in strongest areas
            const cavernDensity = densityMod * 0.85;
            if (c > this.cavernThreshold - cavernDensity * 0.15) {
                return true;
            }
        }

        return false;
    }
}
