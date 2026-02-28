import { ChunkMeshBuilder } from '../rendering/ChunkMeshBuilder.js';
import { worldToAxial } from '../utils/HexUtils.js';

export class ChunkSystem {
    constructor(engine, worldGen, blockSystem) {
        this.engine = engine;
        this.worldGen = worldGen;
        this.blockSystem = blockSystem;
        this.meshBuilder = new ChunkMeshBuilder();

        this.chunks = new Map(); // string key "${cq},${cr}" -> Chunk
        this.chunkGenQueue = [];
        this.pendingChunks = new Set();

        this.renderDistance = 8; // Expanded for further view distance

        this.engine.registerSystem(this);
    }

    async init() {
        const settingsRes = await fetch('data/worldSettings.json');
        const settings = await settingsRes.json();
        this.renderDistance = settings.renderDistance || 8;

        // Setup initial chunks at 0,0
        this.updateLoadedChunks(0, 0);
    }

    getChunkKey(cq, cr) {
        return `${cq},${cr}`;
    }

    updateLoadedChunks(playerQ, playerR) {
        // Player is at q, r. Which chunk are they in?
        const CHUNK_SIZE = 16;
        const playerCQ = Math.floor(playerQ / CHUNK_SIZE);
        const playerCR = Math.floor(playerR / CHUNK_SIZE);

        const neededChunks = new Set();

        // Simple square boundary of chunks around player chunk
        for (let cr = playerCR - this.renderDistance; cr <= playerCR + this.renderDistance; cr++) {
            for (let cq = playerCQ - this.renderDistance; cq <= playerCQ + this.renderDistance; cq++) {

                // Use hexagonal distance for a circular load radius
                const dq = cq - playerCQ;
                const dr = cr - playerCR;
                const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;

                if (dist <= this.renderDistance) {
                    const key = this.getChunkKey(cq, cr);
                    neededChunks.add(key);

                    if (!this.chunks.has(key) && !this.pendingChunks.has(key)) {
                        this.pendingChunks.add(key);
                        // Push to queue, we sort by distance shortly
                        this.chunkGenQueue.push({ cq, cr, key, dist });
                    }
                }
            }
        }

        // Sort generation queue by distance to player so close chunks load first
        this.chunkGenQueue.sort((a, b) => a.dist - b.dist);

        // Unload far chunks immediately
        for (const [key, chunk] of this.chunks.entries()) {
            if (!neededChunks.has(key)) {
                this.unloadChunk(key);
            }
        }
    }

    loadChunk(cq, cr) {
        const chunk = this.worldGen.generateChunk(cq, cr, this.blockSystem);
        this.chunks.set(this.getChunkKey(cq, cr), chunk);

        // Dirty neighbors to ensure they cull boundary faces correctly
        for (let dcq = -1; dcq <= 1; dcq++) {
            for (let dcr = -1; dcr <= 1; dcr++) {
                if (dcq === 0 && dcr === 0) continue;
                const neighbor = this.chunks.get(this.getChunkKey(cq + dcq, cr + dcr));
                if (neighbor) neighbor.isDirty = true;
            }
        }
    }

    unloadChunk(key) {
        const chunk = this.chunks.get(key);
        if (chunk && chunk.mesh) {
            this.engine.scene.remove(chunk.mesh);
            // Must traverse and dispose geometries/materials to prevent memory leak
            chunk.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                }
            });
        }
        this.chunks.delete(key);
        this.pendingChunks.delete(key);
        // Remove from queue if it was pending
        this.chunkGenQueue = this.chunkGenQueue.filter(item => item.key !== key);
    }

    update(delta, time) {
        // Priority 1: Generate 1 chunk's raw block data per frame
        if (this.chunkGenQueue.length > 0) {
            const item = this.chunkGenQueue.shift();
            this.pendingChunks.delete(item.key);

            this.loadChunk(item.cq, item.cr);
            return; // Give frame back to avoid stutter
        }

        // Priority 2: Build 1 chunk mesh per frame
        for (const chunk of this.chunks.values()) {
            if (chunk.isDirty) {
                this.rebuildChunkMesh(chunk);
                break; // Only build ONE mesh per frame!
            }
        }
    }

    rebuildChunkMesh(chunk) {
        if (chunk.mesh) {
            this.engine.scene.remove(chunk.mesh);
            chunk.mesh.traverse((child) => {
                if (child.isMesh) child.geometry.dispose();
            });
            chunk.mesh = null;
        }

        const mesh = this.meshBuilder.buildChunkMesh(chunk, this.blockSystem, this);
        if (mesh) {
            chunk.mesh = mesh;
            this.engine.scene.add(mesh);
        }

        chunk.isDirty = false;
    }

    getBlockGlobal(globalQ, globalR, y) {
        if (y < 0 || y >= 64) return 0; // 64 is CHUNK_HEIGHT

        const CHUNK_SIZE = 16;
        const cq = Math.floor(globalQ / CHUNK_SIZE);
        const cr = Math.floor(globalR / CHUNK_SIZE);

        const chunk = this.chunks.get(this.getChunkKey(cq, cr));
        if (!chunk) return 0; // Unloaded chunks act as air

        const lq = globalQ - (cq * CHUNK_SIZE);
        const lr = globalR - (cr * CHUNK_SIZE);

        return chunk.getBlock(lq, lr, y);
    }
}
