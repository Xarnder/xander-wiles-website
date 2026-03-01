import { ChunkMeshBuilder } from '../rendering/ChunkMeshBuilder.js';
import { worldToAxial } from '../utils/HexUtils.js';
import { Chunk } from './Chunk.js';
import { saveChunk, loadChunk } from '../storage/ChunkStorage.js';

export class ChunkSystem {
    constructor(engine, worldGen, blockSystem) {
        this.engine = engine;
        this.worldGen = worldGen;
        this.blockSystem = blockSystem;
        this.meshBuilder = new ChunkMeshBuilder(this.blockSystem);

        this.chunks = new Map(); // string key "${cq},${cr}" -> Chunk
        this.chunkGenQueue = [];
        this.pendingChunks = new Set();
        this.isLoadingDB = false;

        // Generator state for time-slicing
        this.activeGenJob = null;
        this.activeMeshJob = null;

        this.renderDistance = 8; // Expanded for further view distance
        this.lodDistance = 4;    // Blocks past this chunk distance render flat to save geometry

        // Debounced save queue — collects modified chunks, flushes every 5 seconds
        this.saveQueue = new Set(); // Set of chunk keys that need saving
        this.saveInterval = null;
        this._startSaveLoop();

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
        const startTime = performance.now();

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

                    const isLOD = dist > this.lodDistance;

                    if (!this.chunks.has(key) && !this.pendingChunks.has(key)) {
                        this.pendingChunks.add(key);
                        // Push to queue, we sort by distance shortly
                        this.chunkGenQueue.push({ cq, cr, key, dist, isLOD });
                    } else if (this.chunks.has(key)) {
                        // Chunk is already loaded. Did its LOD state change?
                        const chunk = this.chunks.get(key);
                        if (chunk.isLOD !== isLOD) {
                            chunk.isLOD = isLOD;
                            chunk.isDirty = true; // Force mesh rebuild
                        }
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

        const timeTaken = performance.now() - startTime;
        if (timeTaken > 15) console.warn(`[PerfWarning] updateLoadedChunks took ${timeTaken.toFixed(1)}ms!`);
    }

    async loadChunk(cq, cr, isLOD = false) {
        const worldId = this.engine.activeWorldId;

        // Check IndexedDB first for saved chunk data
        if (worldId) {
            try {
                const savedData = await loadChunk(worldId, cq, cr);
                if (savedData && savedData.blocks) {
                    const chunk = new Chunk(cq, cr);
                    chunk.blocks = savedData.blocks;
                    if (savedData.light) {
                        chunk.light.set(savedData.light);
                    }
                    chunk.isDirty = true;
                    chunk.isModified = false; // It's already saved, not newly modified
                    chunk.isLOD = isLOD;
                    this.chunks.set(this.getChunkKey(cq, cr), chunk);

                    // Dirty neighbors
                    this._dirtyNeighbors(cq, cr);
                    return;
                }
            } catch (e) {
                console.warn('[ChunkSystem] Failed to load chunk from DB, generating fresh:', e);
            }
        }

        // Generate procedurally if not in DB (Start Generator)
        this.activeGenJob = {
            generator: this.worldGen.generateChunkGenerator(cq, cr, this.blockSystem),
            cq: cq,
            cr: cr,
            isLOD: isLOD
        };
    }

    _finishChunkLoad(chunk, cq, cr, isLOD) {
        chunk.isLOD = isLOD;
        this.chunks.set(this.getChunkKey(cq, cr), chunk);

        // Dirty neighbors to ensure they cull boundary faces correctly
        this._dirtyNeighbors(cq, cr);
    }

    _dirtyNeighbors(cq, cr) {
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
        if (!chunk) return;

        // Save modified chunks before unloading
        if (chunk.isModified && this.engine.activeWorldId) {
            this.saveQueue.add(key);
            this._flushSaveQueue(); // Flush immediately on unload
        }

        if (chunk.mesh) {
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

    /**
     * Mark a chunk as modified by player action (needs saving).
     */
    markChunkModified(cq, cr) {
        const key = this.getChunkKey(cq, cr);
        const chunk = this.chunks.get(key);
        if (chunk) {
            chunk.isModified = true;
            this.saveQueue.add(key);
        }
    }

    update(delta, time) {
        // Update water shader time uniform if it exists
        if (this.meshBuilder && this.meshBuilder.waterUniforms) {
            this.meshBuilder.waterUniforms.uTime.value = time;
        }

        const maxTimeMs = 12; // Leave some headroom for 16ms (60fps) target
        const startTime = performance.now();

        // 1. Process active generation job (if any)
        if (this.activeGenJob) {
            let genIterCount = 0;
            const genStartTime = performance.now();
            while (performance.now() - startTime < maxTimeMs) {
                genIterCount++;
                const result = this.activeGenJob.generator.next();
                if (result.done) {
                    this._finishChunkLoad(result.value, this.activeGenJob.cq, this.activeGenJob.cr, this.activeGenJob.isLOD);
                    this.activeGenJob = null;
                    break;
                }
            }
            const genTime = performance.now() - genStartTime;
            if (genTime > 20) console.warn(`[PerfWarning] ChunkGen hold took ${genTime.toFixed(1)}ms (${genIterCount} iters)`);
            if (performance.now() - startTime >= maxTimeMs) return; // Yield frame
        }

        // Priority 1: Pick a new chunk to generate
        if (!this.activeGenJob && !this.isLoadingDB && this.chunkGenQueue.length > 0) {
            this.isLoadingDB = true;
            const item = this.chunkGenQueue.shift();
            this.pendingChunks.delete(item.key);

            // This handles DB load sync/async, but procedural falls into activeGenJob
            const dbStartTime = performance.now();
            this.loadChunk(item.cq, item.cr, item.isLOD)
                .catch(e => console.error("Chunk load failed", e))
                .finally(() => {
                    this.isLoadingDB = false;
                    const dbTime = performance.now() - dbStartTime;
                    if (dbTime > 50) console.log(`[Perf] DB Load took ${dbTime.toFixed(1)}ms async`);
                });
            if (performance.now() - startTime >= maxTimeMs) return;
        }

        // 2. Process active meshing job (if any)
        if (this.activeMeshJob) {
            let meshIterCount = 0;
            const meshStartTime = performance.now();
            while (performance.now() - startTime < maxTimeMs) {
                meshIterCount++;
                const result = this.activeMeshJob.generator.next();
                if (result.done) {
                    this._finishChunkMesh(this.activeMeshJob.chunk, result.value);
                    this.activeMeshJob = null;
                    break;
                }
            }
            const meshTime = performance.now() - meshStartTime;
            if (meshTime > 20) console.warn(`[PerfWarning] ChunkMeshBuilder hold took ${meshTime.toFixed(1)}ms (${meshIterCount} iters)`);
            if (performance.now() - startTime >= maxTimeMs) return; // Yield frame
        }

        // Priority 2: Pick a new chunk to mesh
        if (!this.activeMeshJob && !this.activeGenJob) {
            for (const chunk of this.chunks.values()) {
                if (chunk.isDirty) {
                    this.rebuildChunkMesh(chunk);
                    break; // Just start one mesh job
                }
            }
            if (performance.now() - startTime > 10) console.warn(`[PerfWarning] Chunk dirty-scan took ${(performance.now() - startTime).toFixed(1)}ms!`);
        }
    }

    rebuildChunkMesh(chunk) {
        chunk.isDirty = false; // Mark clean so we don't pick it again while building

        this.activeMeshJob = {
            generator: this.meshBuilder.buildChunkMeshGenerator(chunk, this.blockSystem, this),
            chunk: chunk
        };
    }

    _finishChunkMesh(chunk, mesh) {
        if (chunk.mesh) {
            this.engine.scene.remove(chunk.mesh);
            chunk.mesh.traverse((child) => {
                if (child.isMesh) child.geometry.dispose();
            });
        }

        if (mesh) {
            chunk.mesh = mesh;
            this.engine.scene.add(mesh);
        }
    }

    dirtyAllChunks() {
        for (const chunk of this.chunks.values()) {
            chunk.isDirty = true;
        }
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

    getLightGlobal(globalQ, globalR, y) {
        if (y < 0 || y >= 64) return 0;

        const CHUNK_SIZE = 16;
        const cq = Math.floor(globalQ / CHUNK_SIZE);
        const cr = Math.floor(globalR / CHUNK_SIZE);

        const chunk = this.chunks.get(this.getChunkKey(cq, cr));
        if (!chunk) return 0;

        const lq = globalQ - (cq * CHUNK_SIZE);
        const lr = globalR - (cr * CHUNK_SIZE);

        return chunk.getLight(lq, lr, y);
    }

    setLightGlobal(globalQ, globalR, y, value) {
        if (y < 0 || y >= 64) return false;

        const CHUNK_SIZE = 16;
        const cq = Math.floor(globalQ / CHUNK_SIZE);
        const cr = Math.floor(globalR / CHUNK_SIZE);

        const chunk = this.chunks.get(this.getChunkKey(cq, cr));
        if (!chunk) return false;

        const lq = globalQ - (cq * CHUNK_SIZE);
        const lr = globalR - (cr * CHUNK_SIZE);

        if (chunk.setLight(lq, lr, y, value)) {
            // Update neighbors if on the edge
            if (lq === 0) this._dirtyChunk(cq - 1, cr);
            if (lq === CHUNK_SIZE - 1) this._dirtyChunk(cq + 1, cr);
            if (lr === 0) this._dirtyChunk(cq, cr - 1);
            if (lr === CHUNK_SIZE - 1) this._dirtyChunk(cq, cr + 1);
            return true;
        }
        return false;
    }

    _dirtyChunk(cq, cr) {
        const chunk = this.chunks.get(this.getChunkKey(cq, cr));
        if (chunk) chunk.isDirty = true;
    }

    // ─── Debounced Save System ───

    _startSaveLoop() {
        // Flush the save queue every 5 seconds
        this.saveInterval = setInterval(() => {
            this._flushSaveQueue();
        }, 5000);
    }

    async _flushSaveQueue() {
        if (this.saveQueue.size === 0) return;
        if (!this.engine.activeWorldId) return;

        const worldId = this.engine.activeWorldId;
        const keysToSave = [...this.saveQueue];
        this.saveQueue.clear();

        for (const key of keysToSave) {
            const chunk = this.chunks.get(key);
            if (chunk && chunk.isModified) {
                try {
                    await saveChunk(worldId, chunk.cq, chunk.cr, chunk);
                    chunk.isModified = false;
                } catch (e) {
                    console.error(`[ChunkSystem] Failed to save chunk ${key}:`, e);
                    // Re-add to queue for retry
                    this.saveQueue.add(key);
                }
            }
        }
    }

    /**
     * Force-save all modified chunks (called on world exit / page unload).
     */
    async saveAllModifiedChunks() {
        if (!this.engine.activeWorldId) return;

        for (const [key, chunk] of this.chunks.entries()) {
            if (chunk.isModified) {
                this.saveQueue.add(key);
            }
        }

        await this._flushSaveQueue();
    }

    dispose() {
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }
    }
}
