import * as THREE from 'three';
import { BlockSystem } from '../blocks/BlockSystem.js';
import { ChunkSystem } from '../world/ChunkSystem.js';
import { WorldGen } from '../world/WorldGen.js';
import { Renderer } from '../rendering/Renderer.js';
import { LightingManager } from '../rendering/LightingManager.js';
import { InputManager } from '../input/InputManager.js';
import { PhysicsSystem } from '../physics/PhysicsSystem.js';
import { PlayerSystem } from '../systems/PlayerSystem.js';
import { UIManager } from '../ui/UIManager.js';
import { CloudSystem } from '../rendering/CloudSystem.js';
import { WorldSelectMenu } from '../ui/WorldSelectMenu.js';
import { WaypointManager } from '../systems/WaypointManager.js';
import { AudioManager } from '../systems/AudioManager.js';
import { LightSystem } from '../systems/LightSystem.js';
import { loadWorld as loadWorldMeta, savePlayerState, loadPlayerState } from '../storage/WorldManager.js';

export class Engine {
    constructor() {
        this.container = document.getElementById('game-container');
        this.clock = new THREE.Clock();
        this.systems = []; // Ordered array of game systems to update
        this.isRunning = false;

        // Base Three.js setup
        this.scene = new THREE.Scene();

        // World save state
        this.activeWorldId = null;
        this.activeWorldMeta = null;
        this.chunksReady = false;
        this.initialChunkTotal = 0;
    }

    /**
     * Phase 1: Initialize core systems shared across all worlds.
     * This runs once on page load.
     */
    async initCore() {
        console.log("Arkonhex Engine Initializing...");

        const loadingText = document.getElementById('loading-text');
        const loadingFill = document.getElementById('loading-bar-fill');
        const loadingContainer = document.getElementById('loading-container');

        const setProgress = async (text, percent) => {
            if (loadingText) loadingText.innerText = text;
            if (loadingFill) loadingFill.style.width = `${percent}%`;
            console.log(`[Load] ${text}`);
            return new Promise(resolve => setTimeout(resolve, 300));
        };

        // 1. Core Data
        await setProgress('Loading Core Data...', 20);
        this.blockSystem = new BlockSystem();
        await this.blockSystem.init();

        // 2. Rendering Base
        await setProgress('Initializing Renderer...', 50);
        this.rendererSystem = new Renderer(this);
        this.lightingManager = new LightingManager(this);

        // 3. Input
        await setProgress('Initializing Input...', 70);
        this.inputManager = new InputManager(this);

        // 4. Audio
        this.audioManager = new AudioManager(this);

        await setProgress('Ready!', 100);

        // Hide the initial start/loading screen entirely
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.classList.add('hidden');

        // Show the world select screen
        const worldSelectScreen = document.getElementById('world-select-screen');
        if (worldSelectScreen) worldSelectScreen.classList.remove('hidden');

        // Initialize World Select Menu
        this.worldSelectMenu = new WorldSelectMenu((world) => {
            this.loadWorld(world.id);
        });
    }

    /**
     * Phase 2: Load a specific world by ID.
     * Creates world-specific systems (WorldGen, ChunkSystem, PlayerSystem, etc.)
     */
    async loadWorld(worldId) {
        console.log(`[Engine] Loading world: ${worldId}`);

        // If we already have a world loaded, tear it down
        if (this.activeWorldId) {
            await this._teardownWorld();
        }

        // Load world metadata and update lastPlayed
        const worldMeta = await loadWorldMeta(worldId);
        if (!worldMeta) {
            console.error('[Engine] World not found:', worldId);
            this.worldSelectMenu.show();
            return;
        }

        this.activeWorldId = worldId;
        this.activeWorldMeta = worldMeta;

        const loadingText = document.getElementById('loading-text');
        const loadingFill = document.getElementById('loading-bar-fill');
        const loadingContainer = document.getElementById('loading-container');

        const setProgress = async (text, percent) => {
            if (loadingText) loadingText.innerText = text;
            if (loadingFill) loadingFill.style.width = `${percent}%`;
            console.log(`[Load] ${text}`);
            return new Promise(resolve => setTimeout(resolve, 200));
        };

        // Show loading screen for world loading
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.classList.remove('hidden');
        if (loadingContainer) loadingContainer.style.display = '';

        // 1. World Generation (with per-world seed)
        await setProgress(`Loading "${worldMeta.name}"...`, 20);
        this.worldGen = new WorldGen(this, worldMeta.seed);
        await this.worldGen.init();

        // 2. Chunk Management
        await setProgress('Generating Initial Chunks...', 40);
        this.chunkSystem = new ChunkSystem(this, this.worldGen, this.blockSystem);
        await this.chunkSystem.init();

        this.lightSystem = new LightSystem(this, this.chunkSystem, this.blockSystem);

        // 3. Physics
        await setProgress('Initializing Physics...', 60);
        this.physicsSystem = new PhysicsSystem(this, this.chunkSystem);

        // 4. Player Controller
        await setProgress('Spawning Player...', 75);
        this.playerSystem = new PlayerSystem(this, this.inputManager, this.physicsSystem, this.chunkSystem);

        // 5. Restore player position if saved
        this._lastSavedPlayer = await loadPlayerState(worldId);
        const savedPlayer = this._lastSavedPlayer;
        if (savedPlayer && savedPlayer.position) {
            this.playerSystem.position.set(
                savedPlayer.position[0],
                savedPlayer.position[1],
                savedPlayer.position[2]
            );
            if (savedPlayer.rotation) {
                this.playerSystem.yawObject.rotation.y = savedPlayer.rotation[0] || 0;
                this.playerSystem.pitchObject.rotation.x = savedPlayer.rotation[1] || 0;
            }
            // Update chunks around restored position
            const { q, r } = this._worldToAxial(this.playerSystem.position.x, this.playerSystem.position.z);
            this.chunkSystem.updateLoadedChunks(q, r);

            // Restore time of day
            if (savedPlayer.timeOfDay !== undefined && this.lightingManager) {
                this.lightingManager.timeOfDay = savedPlayer.timeOfDay;
            }
            if (savedPlayer.cycleEnabled !== undefined && this.lightingManager) {
                this.lightingManager.cycleEnabled = savedPlayer.cycleEnabled;
            }
        }

        // 6. UI Overlay
        await setProgress('Setting up UI...', 90);
        this.uiManager = new UIManager(this, this.playerSystem, this.worldGen, this.blockSystem);

        // 7. Atmospheric Clouds
        await setProgress('Forming Clouds...', 100);
        this.cloudSystem = new CloudSystem(this);
        this.cloudSystem.init();

        // 8. Waypoints
        this.waypointManager = new WaypointManager(this);
        await this.waypointManager.loadWaypoints(worldId);

        // Keep loading screen visible — the game loop will hide it after initial chunks are built.
        // Track how many chunks must be generated + built for the initial load.
        this.chunksReady = false;
        this.initialChunkTotal = this.chunkSystem.chunkGenQueue.length + this.chunkSystem.chunks.size;
        if (this.initialChunkTotal === 0) this.initialChunkTotal = 1; // Prevent divide-by-zero

        // Update loading text
        if (loadingText) loadingText.innerText = 'Building Terrain...';
        if (loadingFill) loadingFill.style.width = '0%';

        // Start the game loop (chunks will build progressively)
        this.start();
    }

    /**
     * Teardown world-specific systems.
     */
    async _teardownWorld() {
        this.stop();

        // Save all modified chunks and player state
        await this._saveAndExit();

        // Remove beforeunload handler
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }

        // Dispose chunk system
        if (this.chunkSystem) {
            this.chunkSystem.dispose();
            // Unload all chunks
            for (const key of [...this.chunkSystem.chunks.keys()]) {
                this.chunkSystem.unloadChunk(key);
            }
        }

        // Clear world-specific references
        this.systems = [];
        this.worldGen = null;
        this.chunkSystem = null;
        this.lightSystem = null;
        this.physicsSystem = null;
        this.playerSystem = null;
        if (this.uiManager) {
            this.uiManager.dispose();
            this.uiManager = null;
        }
        this.cloudSystem = null;
        if (this.waypointManager) {
            this.waypointManager.clearAll();
            this.waypointManager = null;
        }
        this.activeWorldId = null;
        this.activeWorldMeta = null;
    }

    async _saveAndExit() {
        if (!this.activeWorldId) return;

        // Save all modified chunks
        if (this.chunkSystem) {
            await this.chunkSystem.saveAllModifiedChunks();
        }

        // Save player state
        if (this.playerSystem) {
            const pos = this.playerSystem.position;
            const yaw = this.playerSystem.yawObject.rotation.y;
            const pitch = this.playerSystem.pitchObject.rotation.x;
            const timeOfDay = this.lightingManager ? this.lightingManager.timeOfDay : 0.5;
            const cycleEnabled = this.lightingManager ? this.lightingManager.cycleEnabled : false;

            await savePlayerState(this.activeWorldId,
                [pos.x, pos.y, pos.z],
                [yaw, pitch],
                timeOfDay,
                cycleEnabled
            );
        }
    }

    _worldToAxial(x, z) {
        // Inline minimal axial conversion for bootstrapping
        const HEX_SIZE = 1.0;
        const q = Math.round((x * Math.sqrt(3) / 3 - z / 3) / HEX_SIZE);
        const r = Math.round((z * 2 / 3) / HEX_SIZE);
        return { q, r };
    }

    registerSystem(system) {
        if (!this.systems.includes(system)) {
            this.systems.push(system);
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.clock.start();
        this.loop();
    }

    stop() {
        this.isRunning = false;
    }

    loop() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.loop());

        const delta = Math.min(this.clock.getDelta(), 0.1); // Max delta 0.1s to prevent huge jumps
        const time = this.clock.getElapsedTime();

        // ── DYNAMIC CHUNK LOADING LOCK ──
        // If we suddenly queue a massive amount of chunks (e.g. changing render distance)
        // drop back into the loading state to prevent the game from freezing.
        const pendingGen = (this.chunkSystem ? this.chunkSystem.chunkGenQueue.length + this.chunkSystem.pendingChunks.size : 0);

        if (this.chunksReady && pendingGen > 50) {
            this.chunksReady = false;
            this.initialChunkTotal = this.chunkSystem.chunks.size + pendingGen;

            // Show loading UI again
            const loadingContainer = document.getElementById('loading-container');
            const startScreen = document.getElementById('start-screen');
            if (loadingContainer) loadingContainer.style.display = '';
            // We don't show the full start screen background again, just the overlay bar
            // so they can watch the world build in real time from the pause menu.
        }

        // ── INITIAL CHUNK LOADING GATE ──
        // While chunks are still being generated/built, only update ChunkSystem (to build chunks)
        // and show progress on the loading bar. Skip player, lighting, etc.
        if (!this.chunksReady) {
            // Let ChunkSystem generate/build chunks
            if (this.chunkSystem && this.chunkSystem.update) {
                this.chunkSystem.update(delta, time);
            }

            // Calculate progress: chunks with no pending generation AND no dirty meshes
            const totalChunks = this.chunkSystem.chunks.size;
            const pendingGen = this.chunkSystem.chunkGenQueue.length + this.chunkSystem.pendingChunks.size;
            let dirtyCount = 0;
            for (const chunk of this.chunkSystem.chunks.values()) {
                if (chunk.isDirty) dirtyCount++;
            }

            const doneCount = totalChunks - dirtyCount;
            const totalWork = totalChunks + pendingGen;
            const progress = totalWork > 0 ? Math.floor((doneCount / this.initialChunkTotal) * 100) : 0;

            const loadingFill = document.getElementById('loading-bar-fill');
            const loadingText = document.getElementById('loading-text');
            if (loadingFill) loadingFill.style.width = `${Math.min(progress, 100)}%`;
            if (loadingText) loadingText.innerText = `Building Terrain... ${Math.min(progress, 100)}%`;

            // Check if all initial chunks are generated AND all meshes are built
            if (pendingGen === 0 && dirtyCount === 0 && totalChunks > 0) {
                this.chunksReady = true;

                // Find safe spawn Y for the player
                const spawnQ = 0, spawnR = 0;
                let safeY = 40; // default fallback
                for (let y = 63; y >= 0; y--) {
                    const blockId = this.chunkSystem.getBlockGlobal(spawnQ, spawnR, y);
                    if (blockId !== 0) {
                        safeY = y + 2; // Stand on top of the highest block + buffer
                        break;
                    }
                }

                // Only set position if there's no saved position (fresh world)
                const savedPlayer = this._lastSavedPlayer;
                if (!savedPlayer || !savedPlayer.position) {
                    this.playerSystem.position.set(0, safeY, 0);
                }
                this.playerSystem.velocity.set(0, 0, 0); // Clear any accumulated fall velocity

                // Immediately sync the camera to the player's position
                // (normally this happens in update(), but update() requires pointer lock)
                this.playerSystem.yawObject.position.copy(this.playerSystem.position);
                this.playerSystem.yawObject.position.y += this.playerSystem.playerHeight;

                // Hide loading screen, show game UI
                const startScreen = document.getElementById('start-screen');
                const loadingContainer = document.getElementById('loading-container');
                const worldSelectScreen = document.getElementById('world-select-screen');
                const uiLayer = document.getElementById('ui-layer');

                if (startScreen) startScreen.classList.add('hidden');
                if (loadingContainer) loadingContainer.style.display = 'none';
                if (worldSelectScreen) worldSelectScreen.classList.add('hidden');
                if (uiLayer) uiLayer.classList.remove('ui-hidden');

                // Auto-save on page unload
                this._beforeUnloadHandler = () => this._saveAndExit();
                window.addEventListener('beforeunload', this._beforeUnloadHandler);
            }

            // Still render the scene so user can watch chunks load behind the overlay
            if (this.lightingManager && this.playerSystem) {
                this.lightingManager.update(this.playerSystem.position, delta, this.inputManager);
            }
            // Run only the renderer (not PlayerSystem) so the scene is visible
            if (this.rendererSystem && this.rendererSystem.update) {
                this.rendererSystem.update();
            }
            return; // Don't run PlayerSystem or other game systems while loading
        }

        // Specific system updates that aren't purely ECS
        if (this.lightingManager && this.playerSystem) {
            this.lightingManager.update(this.playerSystem.position, delta, this.inputManager);

            // Update LOD outline color dynamically based on sun angle relative to camera view
            if (this.blockSystem && this.blockSystem.chunkMeshBuilder && this.rendererSystem && this.rendererSystem.camera) {
                this.blockSystem.chunkMeshBuilder.updateOutlineColors(
                    this.rendererSystem.camera,
                    this.lightingManager.sunLight,
                    this.lightingManager.timeOfDay
                );
            }
        }

        // Update all registered systems
        for (const system of this.systems) {
            if (system.update) {
                system.update(delta, time);
            }
        }
    }
}

// Global bootstrap
document.addEventListener('DOMContentLoaded', () => {
    const engine = new Engine();
    engine.initCore().catch(console.error);
});
