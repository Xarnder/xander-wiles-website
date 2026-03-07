import { createPRNG } from '../utils/MathUtils.js';
import { hexDistance } from '../utils/HexUtils.js';

/**
 * CastleGenerator — deterministically places large castles in the world.
 * Castles are spawned based on a regional grid (e.g. 1 castle per 64x64 chunk area).
 */
export class CastleGenerator {
    constructor(seed) {
        this.seed = seed;

        // Size of a region in chunks
        this.REGION_SIZE = 64;

        // Base chance for a region to contain a castle (0.0 to 1.0)
        this.CASTLE_CHANCE = 0.20;

        // Dimensions
        this.OUTER_RADIUS = 12; // Radius of the entire castle area
        this.WALL_RADIUS = 11;
        this.COURTYARD_RADIUS = 10;
        this.TOWER_WALL_RADIUS = 3;
        this.STAIR_RADIUS = 2;
        this.PILLAR_RADIUS = 1;

        this.TOWER_HEIGHT = 60; // Max Y is 63, so tower goes very high
        this.WALL_HEIGHT = 8;
    }

    /**
     * Get the deterministically generated castle center for a given global axial coordinate.
     * Returns null if no castle is nearby.
     */
    getNearbyCastleCenter(globalQ, globalR) {
        // Find region coordinates (in chunks)
        const CHUNK_SIZE = 16;
        const cq = Math.floor(globalQ / CHUNK_SIZE);
        const cr = Math.floor(globalR / CHUNK_SIZE);

        const centerRq = Math.floor(cq / this.REGION_SIZE);
        const centerRr = Math.floor(cr / this.REGION_SIZE);

        // Check a 3x3 region grid to prevent "half-castles" on chunk/region borders.
        // A castle has radius 12 chunks, which easily bleeds into neighboring regions.
        for (let rq = centerRq - 1; rq <= centerRq + 1; rq++) {
            for (let rr = centerRr - 1; rr <= centerRr + 1; rr++) {

                let castleQ, castleR, hasCastle = false;

                // Check if this is the spawn region (0, 0)
                if (rq === 0 && rr === 0) {
                    hasCastle = true;
                    castleQ = 75;
                    castleR = 0;
                } else {
                    // Use region coords to seed the PRNG
                    const regionSeed = `${this.seed}_castle_${rq}_${rr}`;
                    const prng = createPRNG(regionSeed);

                    // Roll for presence
                    if (prng() <= this.CASTLE_CHANCE) {
                        hasCastle = true;
                        const offsetCQ = Math.floor(prng() * this.REGION_SIZE);
                        const offsetCR = Math.floor(prng() * this.REGION_SIZE);

                        // Select center block of that chunk
                        castleQ = ((rq * this.REGION_SIZE) + offsetCQ) * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
                        castleR = ((rr * this.REGION_SIZE) + offsetCR) * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
                    }
                }

                if (hasCastle) {
                    // Check if the given query block is within influence radius of this castle
                    const dist = hexDistance(globalQ, globalR, castleQ, castleR);
                    if (dist <= this.OUTER_RADIUS) {
                        return { q: castleQ, r: castleR, dist: dist };
                    }
                }
            }
        }

        // No nearby castle influences this block
        return null;
    }

    /**
     * Finds the absolute closest castle to the given global coordinates
     * by scanning a radius of regions deterministically.
     * @param {number} globalQ 
     * @param {number} globalR 
     * @param {number} searchRadiusRegions How many regions out to search (default 2)
     * @returns {Object|null} {q, r, dist} or null if search radius yielded no castles
     */
    findClosestCastle(globalQ, globalR, searchRadiusRegions = 10) {
        const CHUNK_SIZE = 16;
        const cq = Math.floor(globalQ / CHUNK_SIZE);
        const cr = Math.floor(globalR / CHUNK_SIZE);

        const centerRq = Math.floor(cq / this.REGION_SIZE);
        const centerRr = Math.floor(cr / this.REGION_SIZE);

        let closestCastle = null;
        let minDistance = Infinity;

        // Scan surrounding regions
        for (let rq = centerRq - searchRadiusRegions; rq <= centerRq + searchRadiusRegions; rq++) {
            for (let rr = centerRr - searchRadiusRegions; rr <= centerRr + searchRadiusRegions; rr++) {

                let castleQ, castleR, hasCastle = false;

                if (rq === 0 && rr === 0) {
                    hasCastle = true;
                    castleQ = 75;
                    castleR = 0;
                } else {
                    const regionSeed = `${this.seed}_castle_${rq}_${rr}`;
                    const prng = createPRNG(regionSeed);

                    if (prng() <= this.CASTLE_CHANCE) {
                        hasCastle = true;
                        const offsetCQ = Math.floor(prng() * this.REGION_SIZE);
                        const offsetCR = Math.floor(prng() * this.REGION_SIZE);

                        castleQ = ((rq * this.REGION_SIZE) + offsetCQ) * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
                        castleR = ((rr * this.REGION_SIZE) + offsetCR) * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
                    }
                }

                if (hasCastle) {
                    const dist = hexDistance(globalQ, globalR, castleQ, castleR);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestCastle = { q: castleQ, r: castleR, dist: dist };
                    }
                }
            }
        }

        return closestCastle;
    }

    /**
     * Determines what block should be at a specific coordinate for the castle.
     * @returns {number|null} -1 for AIR (clear space), specific ID for block, null to leave natural terrain
     */
    getCastleBlock(globalQ, globalR, y, terrainY, blockSystem) {
        const castleInfo = this.getNearbyCastleCenter(globalQ, globalR);
        if (!castleInfo) return null;

        const dist = castleInfo.dist;

        // The floor of the castle is fixed to the natural terrain height at the EXACT center of the castle.
        // We assume WorldGen passes this in (it will pre-calculate the center height).
        const baseY = terrainY;

        const stoneId = blockSystem.getBlockId('stone');
        const woodId = blockSystem.getBlockId('wood');
        const airId = -1; // Special flag we'll use in WorldGen to force air (0)

        // 1. Foundation: Solid stone below the floor
        if (y < baseY && dist <= this.OUTER_RADIUS) {
            return stoneId;
        }

        // 2. Floor layer: Solid stone
        if (y === baseY && dist <= this.OUTER_RADIUS) {
            return stoneId;
        }

        // 3. Above floor structural rules
        if (y > baseY) {

            // Outer Wall
            if (dist === this.WALL_RADIUS) {
                // Entrance Archway (East Side)
                const dq = globalQ - castleInfo.q;
                const dr = globalR - castleInfo.r;
                // An opening of width ~2 on the positive Q side, up to height 3
                if (dq > 0 && Math.abs(dr) <= 1 && y <= baseY + 3) {
                    return airId;
                }

                if (y <= baseY + this.WALL_HEIGHT) {
                    return stoneId;
                }
                // Battlements (crenellations) at the very top of the wall
                if (y === baseY + this.WALL_HEIGHT + 1) {
                    // Alternating pattern based on coordinates around the ring
                    const ringPos = (globalQ * 3 + globalR * 7) % 2;
                    if (ringPos === 0) return stoneId;
                }
                return airId; // Above the wall
            }

            // Courtyard (clear air between wall and tower)
            if (dist > this.TOWER_WALL_RADIUS && dist < this.WALL_RADIUS) {
                return airId;
            }

            // Central Tower Wall
            if (dist === this.TOWER_WALL_RADIUS) {
                // Tower entrance door (matching outer wall alignment)
                const dq = globalQ - castleInfo.q;
                const dr = globalR - castleInfo.r;
                if (dq > 0 && Math.abs(dr) <= 0 && y <= baseY + 3) {
                    return airId;
                }

                if (y <= this.TOWER_HEIGHT) {
                    // Simple windows occasionally
                    if (y > baseY + 5 && y % 8 === 0 && (globalQ % 2 === 0)) {
                        return airId;
                    }
                    return stoneId;
                }
                // Top battlements
                if (y === this.TOWER_HEIGHT + 1) {
                    const ringPos = (globalQ * 5 + globalR * 2) % 2;
                    if (ringPos === 0) return stoneId;
                }
                return airId;
            }

            // Inside the tower (distance 0, 1, 2)
            if (dist <= this.STAIR_RADIUS) {
                if (y > this.TOWER_HEIGHT) return airId;

                // Central Pillar
                if (dist <= this.PILLAR_RADIUS) {
                    // Solid core support pillar
                    return stoneId;
                }

                // Spiral Staircase (radius 2)
                if (dist === this.STAIR_RADIUS) {
                    // To make a spiral, we map the (Q, R) offset to an angle/index around the hex
                    const dq = globalQ - castleInfo.q;
                    const dr = globalR - castleInfo.r;

                    // Angle in radians
                    const angle = Math.atan2(Math.sqrt(3) * (dq + dr / 2), 1.5 * dr);
                    // Normalize to 0..1
                    let normalizedAngle = (angle + Math.PI) / (2 * Math.PI);

                    // Hex ring of radius 2 has 12 blocks. We want to ascend 6 blocks per full loop.
                    // Meaning every 1 block of height takes 2 step blocks.
                    // Stair logic: (y - baseY) should relate to angle.

                    const heightOffset = y - baseY;
                    const loopHeight = 6;

                    // Expected fractional loop based on angle (0.0 to 1.0)
                    // We map the continuous angle to a stepping 6-height spiral
                    const expectedSpiralY = (normalizedAngle * loopHeight) % loopHeight;

                    // Calculate relative height within the 6-block repeating cycle
                    const localY = heightOffset % loopHeight;

                    // Compute EXACT target stair height for this specific hex coordinate
                    const targetLocalY = Math.round(expectedSpiralY) % loopHeight;

                    if (localY === targetLocalY) {
                        return woodId; // Wooden stairs, exactly 1 block thick
                    }

                    return airId; // Empty space inside tower
                }
            }

            // Beyond outer wall (dist == 12) just clear things out above the floor 
            // to make a clean moat/border area
            if (dist === this.OUTER_RADIUS) {
                return airId;
            }
        }

        return null;
    }
}
