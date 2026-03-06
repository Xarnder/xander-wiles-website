import { SimplexNoise } from '../utils/SimplexNoise.js';
import { createPRNG } from '../utils/MathUtils.js';
import { axialToWorld } from '../utils/HexUtils.js';
import { Chunk } from './Chunk.js';

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;

export class WorldGen {
    constructor(engine, seed = null) {
        this.engine = engine;
        this.seed = seed || "arkonhex"; // Accept per-world seed
        this.noise = null;
        this.seaLevel = 16;
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

                // Get accurate world position for seamless noise mapping
                const worldPos = axialToWorld(globalQ, globalR);
                // Lower noise scale makes features much wider/larger
                const nx = worldPos.x * baseNoiseScale;
                const nz = worldPos.z * baseNoiseScale;

                // Extra noise for biomes and details
                // Temperature noise: mapped across large distances
                let tempValue = this.tempNoise.noise2D(worldPos.x * tempNoiseScale, worldPos.z * tempNoiseScale);
                tempValue = (tempValue + 1.0) / 2.0;

                // Stone patch noise: small, tight clusters
                let stoneValue = this.stoneNoise.noise2D(worldPos.x * stoneNoiseScale, worldPos.z * stoneNoiseScale);
                stoneValue = (stoneValue + 1.0) / 2.0;

                // Layered noise (Octaves) - smoother weights
                let heightValue = this.noise.noise2D(nx, nz) * 0.6 +
                    this.noise.noise2D(nx * 2, nz * 2) * 0.3 +
                    this.noise.noise2D(nx * 4, nz * 4) * 0.1;

                // Normalize to [0, 1] then scale to height
                heightValue = (heightValue + 1.0) / 2.0;

                // Exponent terrain shaping. A lower exponent (1.8) makes beaches steeper and less wide
                // We add an inverse slope so fields are consistently flat around 'sea level'.
                let shapedHeight = Math.pow(heightValue, 1.8);

                // Biome Blending - Spikey Mountains in high temperature
                if (tempValue > 0.6) {
                    // Blend from normal (0.6) to spikey (1.0)
                    const spikeyFactor = (tempValue - 0.6) / 0.4;
                    // Spikey terrain has sharper peaks (higher exponent on base noise)
                    // Increased exponent from 3.0 to 5.0 for sharper peaks
                    const spikeyHeight = Math.pow(heightValue, 5.0);

                    // Blend between normal shaped height and the spikey one
                    // Increased scale from 1.5 to 2.2 for taller mountains
                    shapedHeight = (shapedHeight * (1.0 - spikeyFactor)) + (spikeyHeight * spikeyFactor * 2.2);
                }

                // Extra flat scaling multiplier
                shapedHeight *= 0.85;

                // Elevated baseline height (+12) so more of the terrain natively dips below sea level
                let surfaceY = Math.floor(shapedHeight * (CHUNK_HEIGHT - 20)) + 12;
                if (surfaceY >= CHUNK_HEIGHT) surfaceY = CHUNK_HEIGHT - 1;

                // Deep Ocean Trenching:
                // Smooth gradient downward based on the pre-shaped raw height to prevent sheer cliffs
                if (surfaceY <= this.seaLevel) {
                    // 'heightValue' lands roughly around 0.32 when 'surfaceY' naturally resolves to 16 with the new constants
                    const waterThreshold = 0.32;
                    if (heightValue < waterThreshold) {
                        // Ratio goes from 0.0 at the shoreline to 1.0 at the deepest depths
                        let depthRatio = 1.0 - (heightValue / waterThreshold);

                        // Apply a quadratic curve so the dropoff starts very gentle near the beach
                        depthRatio = Math.pow(depthRatio, 2.0);

                        // Scale maximum ocean depth down 14 blocks
                        let depthErosion = Math.floor(depthRatio * 14.0);
                        surfaceY = this.seaLevel - depthErosion;

                        if (surfaceY < 3) surfaceY = 3; // Keep above bedrock level
                    } else {
                        // Smoothly flatten the transition zone exactly onto the shoreline
                        surfaceY = this.seaLevel;
                    }
                }

                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    if (y === 0) {
                        chunk.setBlock(lq, lr, y, bedrockId);
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
