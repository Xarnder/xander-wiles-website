import { worldToAxial, HEX_SIZE, HEX_WIDTH, getSeededBlockHeight } from '../utils/HexUtils.js';

export class PhysicsSystem {
    constructor(engine, chunkSystem) {
        this.engine = engine;
        this.chunkSystem = chunkSystem;
        this.gravity = -30;
    }

    /**
     * Get the exact height of a block at a given world position
     */
    getBlockHeightAt(x, y, z) {
        const blockId = this.getBlockAt(x, y, z);
        if (blockId === 0) return 0;

        const { q, r } = worldToAxial(x, z);

        // We need the world seed from the engine/worldgen
        // The seed exists on engine.worldSystem.worldGen.seed or similar, but let's grab it safely
        const seed = this.engine.worldSystem?.currentWorld?.seed || "arkonhex";

        const blockAboveId = this.getBlockAt(x, y + 1, z);

        const isSolidFn = (id) => this.isSolid(id);

        return getSeededBlockHeight(q, r, Math.floor(y), seed, blockAboveId, isSolidFn);
    }
    getBlockAt(x, y, z) {
        if (y < 0 || y >= 64) return 0;

        const { q, r } = worldToAxial(x, z);

        const CHUNK_SIZE = 16;
        const cq = Math.floor(q / CHUNK_SIZE);
        const cr = Math.floor(r / CHUNK_SIZE);

        const chunkKey = this.chunkSystem.getChunkKey(cq, cr);
        const chunk = this.chunkSystem.chunks.get(chunkKey);

        if (!chunk) return 0;

        let lq = q - (cq * CHUNK_SIZE);
        let lr = r - (cr * CHUNK_SIZE);

        return chunk.getBlock(lq, lr, Math.floor(y));
    }

    /**
     * Basic cylinder-hex collision detection.
     */
    resolveCollision(position, velocity, radius, height, delta) {
        // Apply gravity
        velocity.y += this.gravity * delta;

        // Apply horizontal velocity
        let nextX = position.x + velocity.x * delta;
        let nextY = position.y + velocity.y * delta;
        let nextZ = position.z + velocity.z * delta;

        let onGround = false;

        // 1. Vertical Collision (Floor/Ceiling)
        // Check block below feet
        const blockBelow = this.getBlockAt(position.x, nextY, position.z);
        if (blockBelow !== 0 && this.isSolid(blockBelow)) {
            if (velocity.y < 0) {
                // Landed on floor
                nextY = Math.floor(nextY) + 1;
                velocity.y = 0;
                onGround = true;
            }
        }

        // Wait, for vertical collision, we should test the player's bounding cylinder volume against blocks.
        // For simplicity, just checking center point + radius points
        const checkPoints = [
            { x: position.x, z: position.z }, // Center
            { x: position.x + radius, z: position.z },
            { x: position.x - radius, z: position.z },
            { x: position.x, z: position.z + radius },
            { x: position.x, z: position.z - radius }
        ];

        // Refined Vertical Check
        for (let pt of checkPoints) {
            const blockFloorY = Math.floor(nextY);
            const blockFloor = this.getBlockAt(pt.x, blockFloorY, pt.z);

            if (blockFloor !== 0 && this.isSolid(blockFloor)) {
                // Determine exact physical height of this specific floor block
                const floorHeight = this.getBlockHeightAt(pt.x, blockFloorY, pt.z);
                const exactFloorY = blockFloorY + floorHeight;

                if (velocity.y < 0 && nextY <= exactFloorY && position.y >= exactFloorY - 0.5) {
                    nextY = exactFloorY;
                    velocity.y = 0;
                    onGround = true;
                    break;
                }
            }

            // Check Head
            const blockCeilY = Math.floor(nextY + height);
            const blockCeil = this.getBlockAt(pt.x, blockCeilY, pt.z);
            if (blockCeil !== 0 && this.isSolid(blockCeil)) {
                // If there's a ceiling block, we collide with its bottom (which is an integer)
                if (velocity.y > 0) {
                    nextY = blockCeilY - height; // Stop going up
                    velocity.y = 0;
                    break;
                }
            }
        }

        // 2. Horizontal Collision (X axis) with auto-stepper for organic height variations
        for (let pt of checkPoints) {
            // Check from bottom to top of player
            // But skip the very bottom 0.6 units to automatically step over variable heights
            const stepHeight = 0.61; // Auto-step over any bump up to 0.61 blocks high
            const playerBaseY = nextY + stepHeight;
            const playerTopY = nextY + height - 0.1;

            if (playerBaseY > playerTopY) continue; // Safety check

            // We test the grid cells encompassing the player's height
            const startGridY = Math.floor(playerBaseY);
            const endGridY = Math.floor(playerTopY);

            for (let y = startGridY; y <= endGridY; y++) {
                // X collision
                const blockX = this.getBlockAt(pt.x + velocity.x * delta, y, pt.z);
                if (blockX !== 0 && this.isSolid(blockX)) {
                    // We only collide horizontally if the physical geometry exists at this height
                    let physicalThreshold = y; // Bottom of block

                    // If we are checking the top-most block the player hits, we need to respect its exact height
                    if (y === endGridY || y === startGridY) {
                        const exactHeight = this.getBlockHeightAt(pt.x + velocity.x * delta, y, pt.z);
                        // If the player is above the precise top geometry of this block, let them slide over
                        if (playerBaseY > y + exactHeight) {
                            continue;
                        }
                    }

                    velocity.x = 0;
                    nextX = position.x;
                    break;
                }
            }
        }

        // 3. Horizontal Collision (Z axis)
        for (let pt of checkPoints) {
            const stepHeight = 0.61;
            const playerBaseY = nextY + stepHeight;
            const playerTopY = nextY + height - 0.1;

            if (playerBaseY > playerTopY) continue;

            const startGridY = Math.floor(playerBaseY);
            const endGridY = Math.floor(playerTopY);

            for (let y = startGridY; y <= endGridY; y++) {
                // Z collision
                const blockZ = this.getBlockAt(nextX, y, pt.z + velocity.z * delta);
                if (blockZ !== 0 && this.isSolid(blockZ)) {
                    // Exact height precision for Z axis collisions too
                    if (y === endGridY || y === startGridY) {
                        const exactHeight = this.getBlockHeightAt(nextX, y, pt.z + velocity.z * delta);
                        if (playerBaseY > y + exactHeight) {
                            continue;
                        }
                    }

                    velocity.z = 0;
                    nextZ = position.z;
                    break;
                }
            }
        }

        position.set(nextX, nextY, nextZ);

        return { onGround };
    }

    isSolid(blockId) {
        if (blockId === 0) return false;
        const def = this.chunkSystem.blockSystem.getBlockDef(blockId);
        // Assuming water/air are non-solid unless hardness is defined to block
        return def && def.hardness > 0;
    }
}
