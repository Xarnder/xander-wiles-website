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

export class Engine {
    constructor() {
        this.container = document.getElementById('game-container');
        this.clock = new THREE.Clock();
        this.systems = []; // Ordered array of game systems to update
        this.isRunning = false;

        // Base Three.js setup
        this.scene = new THREE.Scene();
        // SkyDome will be constructed in LightingManager to replace static background
    }

    async init() {
        console.log("Arkonhex Engine Initializing...");

        const loadingText = document.getElementById('loading-text');
        const loadingFill = document.getElementById('loading-bar-fill');
        const loadingContainer = document.getElementById('loading-container');
        const startHint = document.getElementById('start-hint');

        const setProgress = async (text, percent) => {
            if (loadingText) loadingText.innerText = text;
            if (loadingFill) loadingFill.style.width = `${percent}%`;
            console.log(`[Load] ${text}`);

            // Artificial delay to let the user see the loading process
            return new Promise(resolve => setTimeout(resolve, 300));
        };

        // 1. Core Data
        await setProgress('Loading Core Data...', 10);
        this.blockSystem = new BlockSystem();
        await this.blockSystem.init();

        // 2. Rendering Base
        await setProgress('Initializing Renderer...', 30);
        this.rendererSystem = new Renderer(this);
        this.lightingManager = new LightingManager(this);

        // 3. World Generation
        await setProgress('Loading World Settings...', 50);
        this.worldGen = new WorldGen(this);
        await this.worldGen.init();

        // 4. Chunk Management
        await setProgress('Generating Initial Chunks...', 70);
        this.chunkSystem = new ChunkSystem(this, this.worldGen, this.blockSystem);
        await this.chunkSystem.init();

        // 5. Physics & Input
        await setProgress('Initializing Physics & Input...', 85);
        this.physicsSystem = new PhysicsSystem(this, this.chunkSystem);
        this.inputManager = new InputManager(this);

        // 6. Player Controller
        await setProgress('Spawning Player...', 95);
        this.playerSystem = new PlayerSystem(this, this.inputManager, this.physicsSystem, this.chunkSystem);

        // 7. UI Overlay
        await setProgress('Setting up UI...', 98);
        this.uiManager = new UIManager(this, this.playerSystem, this.worldGen, this.blockSystem);

        // 8. Atmospheric Clouds
        await setProgress('Forming Clouds...', 100);
        this.cloudSystem = new CloudSystem(this);
        this.cloudSystem.init();

        // Finish Loading
        if (loadingContainer) loadingContainer.style.display = 'none';
        if (startHint) startHint.style.display = 'block';

        // Wait for player to click start
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.addEventListener('click', () => {
                this.start();
                startScreen.classList.add('hidden');
            }, { once: true });
        }
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

        // Specific system updates that aren't purely ECS
        if (this.lightingManager && this.playerSystem) {
            this.lightingManager.update(this.playerSystem.position, delta, this.inputManager);
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
// Global bootstrap
document.addEventListener('DOMContentLoaded', () => {
    const engine = new Engine();

    engine.init().catch(console.error);
});
