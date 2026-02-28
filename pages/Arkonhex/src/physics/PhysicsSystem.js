import { worldToAxial, HEX_SIZE, HEX_WIDTH } from '../utils/HexUtils.js';

export class PhysicsSystem {
    constructor(engine, chunkSystem) {
        this.engine = engine;
        this.chunkSystem = chunkSystem;
        this.gravity = -30;
    }

    /**
     * Get the block ID at a specific world coordinate.
     */
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
            const blockFloor = this.getBlockAt(pt.x, nextY, pt.z);
            if (blockFloor !== 0 && this.isSolid(blockFloor)) {
                if (velocity.y < 0) {
                    nextY = Math.floor(nextY) + 1;
                    velocity.y = 0;
                    onGround = true;
                    break;
                }
            }

            // Check Head
            const blockCeil = this.getBlockAt(pt.x, nextY + height, pt.z);
            if (blockCeil !== 0 && this.isSolid(blockCeil)) {
                if (velocity.y > 0) {
                    nextY = Math.floor(nextY + height) - height; // Stop going up
                    velocity.y = 0;
                    break;
                }
            }
        }

        // 2. Horizontal Collision (X axis)
        for (let pt of checkPoints) {
            // Check from bottom to top of player
            const playerBaseY = nextY;
            const playerTopY = nextY + height - 0.1;

            for (let y = playerBaseY; y <= playerTopY; y += 1) {
                // X collision
                const blockX = this.getBlockAt(pt.x + velocity.x * delta, y, pt.z);
                if (blockX !== 0 && this.isSolid(blockX)) {
                    velocity.x = 0;
                    nextX = position.x;
                    break;
                }
            }
        }

        // 3. Horizontal Collision (Z axis)
        for (let pt of checkPoints) {
            const playerBaseY = nextY;
            const playerTopY = nextY + height - 0.1;

            for (let y = playerBaseY; y <= playerTopY; y += 1) {
                // Z collision
                const blockZ = this.getBlockAt(nextX, y, pt.z + velocity.z * delta);
                if (blockZ !== 0 && this.isSolid(blockZ)) {
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
