import { SimplexNoise } from '../utils/SimplexNoise.js';
import { createPRNG } from '../utils/MathUtils.js';
import { axialToWorld } from '../utils/HexUtils.js';
import { Chunk } from './Chunk.js';
import { CaveGenerator } from './CaveGenerator.js';
import { CastleGenerator } from './CastleGenerator.js';

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;

export class WorldGen {
    constructor(engine, seed = null) {
        this.engine = engine;
        this.seed = seed || "arkonhex"; // Accept per-world seed
        this.noise = null;
        this.seaLevel = 16;
        this.caveGen = null;
        this.castleGen = null;
    }

    async init() {
        // Load settings (seaLevel, etc.) — seed comes from constructor now
        const settingsRes = await fetch('data/worldSettings.json');
        const settings = await settingsRes.json();

        // Only use JSON seed as fallback if none was provided
        if (this.seed === "arkonhex" && settings.seed) {
            this.seed = settings.seed;
        }
        this.seaLevel = settings.seaLevel || 16;

        // Initialize noise with seeded random
        const prng = createPRNG(this.seed);
        this.noise = new SimplexNoise(prng);

        // Setup additional noise sources for biomes and features
        const tempPrng = createPRNG(this.seed + "temp");
        this.tempNoise = new SimplexNoise(tempPrng);

        const stonePrng = createPRNG(this.seed + "stone");
        this.stoneNoise = new SimplexNoise(stonePrng);

        // Initialize cave generator
        this.caveGen = new CaveGenerator(this.seed, this.seaLevel);

        // Initialize castle generator
        this.castleGen = new CastleGenerator(this.seed);

        // DEBUG: Find and log a nearby castle so we can teleport/fly to it easily
        for (let rq = -2; rq <= 2; rq++) {
            for (let rr = -2; rr <= 2; rr++) {
                const regionSeed = `${this.seed}_castle_${rq}_${rr}`;
                const prng = createPRNG(regionSeed);
                if (prng() <= this.castleGen.CASTLE_CHANCE) {
                    const offsetCQ = Math.floor(prng() * this.castleGen.REGION_SIZE);
                    const offsetCR = Math.floor(prng() * this.castleGen.REGION_SIZE);
                    const CHUNK_SIZE = 16;
                    const castleQ = ((rq * this.castleGen.REGION_SIZE) + offsetCQ) * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
                    const castleR = ((rr * this.castleGen.REGION_SIZE) + offsetCR) * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
                    console.log(`[CastleGen] Found nearby Castle at axial (q:${castleQ}, r:${castleR})`);
                }
            }
        }
    }

    /**
     * Generator function that yields periodically to prevent blocking the main thread during heavy procedural generation.
     * @param {number} cq Chunk q coordinate
     * @param {number} cr Chunk r coordinate
     * @param {BlockSystem} blockSystem 
     * @returns {Generator<undefined, Chunk, unknown>} 
     */
    *generateChunkGenerator(cq, cr, blockSystem) {
        // --- TERRAIN GENERATION CONSTANTS ---
        // Modify these values to experiment with the world shape!

        // Base terrain scale. Lower = wider, smoother hills. Higher = noisy, chaotic terrain.
        const baseNoiseScale = 0.006;

        // Temperature/Biome scale. Extremely low because biomes should be huge.
        const tempNoiseScale = 0.001;

        // Bare stone patch scale. (Was 0.03, user requested 4x larger, so 0.03 / 4 = 0.0075)
        // Lower = larger stone patches. Higher = many tiny scattered patches.
        const stoneNoiseScale = 0.0075;

        // ------------------------------------

        const chunk = new Chunk(cq, cr);

        const qOffset = cq * CHUNK_SIZE;
        const rOffset = cr * CHUNK_SIZE;

        const grassId = blockSystem.getBlockId('grass');
        const dirtId = blockSystem.getBlockId('dirt');
        const stoneId = blockSystem.getBlockId('stone');
        const sandId = blockSystem.getBlockId('sand');
        const waterId = blockSystem.getBlockId('water');
        const bedrockId = blockSystem.getBlockId('bedrock');
        const woodId = blockSystem.getBlockId('wood');
        const leavesId = blockSystem.getBlockId('leaves');

        for (let lr = 0; lr < CHUNK_SIZE; lr++) {
            for (let lq = 0; lq < CHUNK_SIZE; lq++) {
                const globalQ = qOffset + lq;
                const globalR = rOffset + lr;

                const worldPos = axialToWorld(globalQ, globalR);

                // Get pre-calculated surface height
                let surfaceY = this.getSurfaceHeight(globalQ, globalR);

                const baseNoiseScale = 0.006;
                const tempNoiseScale = 0.001;
                const stoneNoiseScale = 0.0075;

                const nx = worldPos.x * baseNoiseScale;
                const nz = worldPos.z * baseNoiseScale;

                let tempValue = this.tempNoise.noise2D(worldPos.x * tempNoiseScale, worldPos.z * tempNoiseScale);
                tempValue = (tempValue + 1.0) / 2.0;

                let stoneValue = this.stoneNoise.noise2D(worldPos.x * stoneNoiseScale, worldPos.z * stoneNoiseScale);
                stoneValue = (stoneValue + 1.0) / 2.0;

                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    // Check castle generator first
                    const castleBlock = this.castleGen.getCastleBlock(globalQ, globalR, y, surfaceY, blockSystem);
                    if (castleBlock !== null) {
                        if (castleBlock !== -1) {
                            chunk.setBlock(lq, lr, y, castleBlock);
                        }
                        // If -1 (air) or a solid block, we skip the rest of natural generation
                        continue;
                    }

                    // Check cave carving for underground blocks
                    const isCave = y > 0 && y < surfaceY && this.caveGen.shouldCarve(worldPos.x, worldPos.z, y, surfaceY);

                    if (y === 0) {
                        chunk.setBlock(lq, lr, y, bedrockId);
                    } else if (isCave) {
                        // Cave — leave as air (block 0), skip placing any solid block
                        continue;
                    } else if (y < surfaceY - 3) {
                        chunk.setBlock(lq, lr, y, stoneId);
                    } else if (y < surfaceY) {
                        if (surfaceY <= this.seaLevel) {
                            chunk.setBlock(lq, lr, y, stoneId); // Completely underwater top-layers
                        } else if (y <= this.seaLevel) {
                            chunk.setBlock(lq, lr, y, sandId); // Wet sand below beaches
                        } else {
                            // Biome/Feature block selection for the 'dirt' layer (sub-surface)
                            let subSurfaceBlock = dirtId;

                            // If the surface is stone (mountain peak or stone patch), 
                            // make the sub-surface stone as well.
                            if ((tempValue > 0.6 && surfaceY > 38) || stoneValue > 0.8) {
                                subSurfaceBlock = stoneId;
                            }

                            chunk.setBlock(lq, lr, y, subSurfaceBlock);
                        }
                    } else if (y === surfaceY) {
                        // Shoreline logic
                        if (surfaceY < this.seaLevel) {
                            chunk.setBlock(lq, lr, y, stoneId); // Ocean floor is exposed stone
                        } else if (surfaceY === this.seaLevel) {
                            chunk.setBlock(lq, lr, y, sandId); // Beach level is sand
                        } else {
                            // Biome/Feature block selection
                            let surfaceBlock = grassId;

                            // High peaks become stone (spikey mountains)
                            // Increase the threshold slightly since we scaled height heavily
                            if (tempValue > 0.6 && surfaceY > 38) {
                                surfaceBlock = stoneId;
                            }
                            // Random bare stone patches in regular terrain
                            else if (stoneValue > 0.8) {
                                surfaceBlock = stoneId;
                            }

                            chunk.setBlock(lq, lr, y, surfaceBlock);

                            // Only generate trees on grass
                            if (surfaceBlock === grassId) {
                                // Pseudo-random hash for tree spawning
                                const n = Math.sin(globalQ * 12.9898 + globalR * 78.233) * 43758.5453;
                                const rand = n - Math.floor(n);

                                // Secondary noise map for procedural forest clusters (zoom out more so clumps are further apart)
                                let forestNoise = this.noise.noise2D(worldPos.x * 0.02 + 1000, worldPos.z * 0.02 + 1000);
                                forestNoise = (forestNoise + 1) / 2; // Normalize to [0, 1]

                                // Map tree chance based on forest noise concentration
                                if (forestNoise > 0.6) {
                                    // Cap the maximal density modifier much lower so they don't visually overlap perfectly inside clumps
                                    const treeChance = (forestNoise - 0.6) * 0.15;
                                    if (rand < treeChance && lq >= 3 && lq <= CHUNK_SIZE - 4 && lr >= 3 && lr <= CHUNK_SIZE - 4) {
                                        this.generateTree(chunk, lq, lr, y + 1, woodId, leavesId, rand);
                                    }
                                }
                            }
                        }
                    } else if (y <= this.seaLevel) {
                        // Water fill
                        chunk.setBlock(lq, lr, y, waterId);
                    }
                }
            }

            // Yield every 2 rows of the chunk to let the main thread render a frame
            if (lr % 2 === 0) {
                yield;
            }
        }

        return chunk;
    }

    /**
     * Extracts the raw procedural surface height for a given global coordinate.
     * This allows other generators (like CastleGen) to find the local floor level
     * without generating an entire chunk.
     */
    getSurfaceHeight(globalQ, globalR) {
        const baseNoiseScale = 0.006;
        const tempNoiseScale = 0.001;

        const worldPos = axialToWorld(globalQ, globalR);
        const nx = worldPos.x * baseNoiseScale;
        const nz = worldPos.z * baseNoiseScale;

        let tempValue = this.tempNoise.noise2D(worldPos.x * tempNoiseScale, worldPos.z * tempNoiseScale);
        tempValue = (tempValue + 1.0) / 2.0;

        let heightValue = this.noise.noise2D(nx, nz) * 0.6 +
            this.noise.noise2D(nx * 2, nz * 2) * 0.3 +
            this.noise.noise2D(nx * 4, nz * 4) * 0.1;
        heightValue = (heightValue + 1.0) / 2.0;

        let shapedHeight = Math.pow(heightValue, 1.8);

        if (tempValue > 0.6) {
            const spikeyFactor = (tempValue - 0.6) / 0.4;
            const spikeyHeight = Math.pow(heightValue, 5.0);
            shapedHeight = (shapedHeight * (1.0 - spikeyFactor)) + (spikeyHeight * spikeyFactor * 2.2);
        }

        shapedHeight *= 0.85;

        let surfaceY = Math.floor(shapedHeight * (CHUNK_HEIGHT - 20)) + 12;
        if (surfaceY >= CHUNK_HEIGHT) surfaceY = CHUNK_HEIGHT - 1;

        if (surfaceY <= this.seaLevel) {
            const waterThreshold = 0.32;
            if (heightValue < waterThreshold) {
                let depthRatio = 1.0 - (heightValue / waterThreshold);
                depthRatio = Math.pow(depthRatio, 2.0);
                let depthErosion = Math.floor(depthRatio * 14.0);
                surfaceY = this.seaLevel - depthErosion;
                if (surfaceY < 3) surfaceY = 3;
            } else {
                surfaceY = this.seaLevel;
            }
        }

        return surfaceY;
    }

    /**
     * Synchronous wrapper for fallback compatibility.
     * Fully consumes the generator in one go.
     */
    generateChunk(cq, cr, blockSystem) {
        const gen = this.generateChunkGenerator(cq, cr, blockSystem);
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        return result.value;
    }

    /**
     * Procedurally generates a tree structure within a chunk.
     */
    generateTree(chunk, lq, lr, startY, woodId, leavesId, randSeed) {
        // Vary taller trunk height between 5 and 11 blocks
        const trunkHeight = 5 + Math.floor(randSeed * 7);
        const topY = startY + trunkHeight;

        // Prevent trees from going out of world height bound
        if (topY >= CHUNK_HEIGHT - 2) return;

        // 1. Build Trunk
        for (let i = 0; i < trunkHeight; i++) {
            chunk.setBlock(lq, lr, startY + i, woodId);
        }

        // Helper to place leaf softly (dont override solid blocks)
        const placeLeaf = (q, r, y) => {
            if (Math.abs(q - lq) > CHUNK_SIZE / 2 || Math.abs(r - lr) > CHUNK_SIZE / 2) return; // Basic bound check if pushed outside local array
            if (chunk.getBlock(q, r, y) === 0) { // If air
                chunk.setBlock(q, r, y, leavesId);
            }
        };

        // 2. Build Lush Hexagonal Canopy
        // Thickest part of leaves are at topY - 2 and topY - 1
        for (let rOffset = -2; rOffset <= 2; rOffset++) {
            for (let qOffset = -2; qOffset <= 2; qOffset++) {
                // Calculate Axial Distance on Hex Grid
                const dist = (Math.abs(qOffset) + Math.abs(rOffset) + Math.abs(qOffset + rOffset)) / 2;

                if (dist <= 2) {
                    // Lower ring occasionally sparse on outer edge
                    if (dist < 2 || randSeed > 0.5) {
                        placeLeaf(lq + qOffset, lr + rOffset, topY - 2);
                    }
                    // Mid ring fully dense
                    placeLeaf(lq + qOffset, lr + rOffset, topY - 1);
                }

                if (dist <= 1) {
                    // Top ring
                    placeLeaf(lq + qOffset, lr + rOffset, topY);
                }
            }
        }

        // Very top tip
        placeLeaf(lq, lr, topY + 1);
    }
}
