export class UIManager {
    constructor(engine, playerSystem, worldGen, blockSystem) {
        this.engine = engine;
        this.playerSystem = playerSystem;
        this.worldGen = worldGen;
        this.blockSystem = blockSystem;

        this.fpsElement = document.getElementById('fps-counter');
        this.seedElement = document.getElementById('seed-display');
        this.selectedBlockElement = document.getElementById('selected-block-info');
        this.hotbarElement = document.getElementById('hotbar');

        this.frameCount = 0;
        this.frameCount = 0;
        this.lastFpsTime = 0;

        this.highGraphics = false; // default off as per user request

        // Add graphics state element
        this.graphicsElement = document.createElement('div');
        this.graphicsElement.innerText = "Graphics: Low (Press G to toggle)";
        document.getElementById('debug-overlay').appendChild(this.graphicsElement);

        // Add fly mode state element
        this.flyElement = document.createElement('div');
        this.flyElement.style.color = '#00ffcc'; // Special color for flying
        document.getElementById('debug-overlay').appendChild(this.flyElement);

        this.initHotbar();

        this.seedElement.innerText = `Seed: ${this.worldGen.seed}`;

        this.initPauseMenu();

        this.engine.registerSystem(this);
    }

    initPauseMenu() {
        const slider = document.getElementById('rd-slider');
        const valDisplay = document.getElementById('rd-val');

        if (slider && valDisplay) {
            // Set initial from settings
            slider.value = this.playerSystem.chunkSystem.renderDistance;
            valDisplay.innerText = slider.value;

            slider.addEventListener('input', (e) => {
                valDisplay.innerText = e.target.value;
            });

            slider.addEventListener('change', (e) => {
                const newDist = parseInt(e.target.value);
                this.playerSystem.chunkSystem.renderDistance = newDist;

                // Force an update to clear far chunks and load new ones
                const pos = this.playerSystem.position;
                const axial = this.playerSystem.chunkSystem.worldToAxial ?
                    this.playerSystem.chunkSystem.worldToAxial(pos.x, pos.z) :
                    { q: Math.round(pos.x / 16), r: Math.round(pos.z / 16) }; // rough fallback

                // Forcing the update mechanism through the player system loop
                this.playerSystem.chunkSystem.updateLoadedChunks(axial.q, axial.r);
            });
        }

        const fovSlider = document.getElementById('fov-slider');
        const fovValDisplay = document.getElementById('fov-val');

        if (fovSlider && fovValDisplay) {
            fovSlider.value = this.playerSystem.baseFov || 75;
            fovValDisplay.innerText = fovSlider.value;

            fovSlider.addEventListener('input', (e) => {
                fovValDisplay.innerText = e.target.value;
                if (this.playerSystem) {
                    this.playerSystem.baseFov = parseInt(e.target.value);
                }
            });
        }

        // Tab logic
        const tabs = document.querySelectorAll('.pause-tab');
        const contents = document.querySelectorAll('.tab-content');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Prevent click bubbling up and unpausing immediately
                e.stopPropagation();

                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const targetId = tab.getAttribute('data-tab');
                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.add('active');
            });
        });

        // Prevent settings panel clicks from unpausing
        const settingsPanels = document.querySelectorAll('.settings-panel');
        settingsPanels.forEach(p => {
            p.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    initHotbar() {
        // Create 9 slots
        for (let i = 1; i <= 9; i++) {
            const slot = document.createElement('div');
            slot.className = 'hotbar-slot' + (i === 1 ? ' active' : '');

            const inner = document.createElement('div');
            inner.className = 'hotbar-slot-inner';

            // Map 1-9 to first 9 blocks in our palette
            const blockDef = this.blockSystem.getBlockDef(i);
            if (blockDef) {
                const colors = this.blockSystem.getColor(blockDef.topColor);
                // Convert linear back to sRGB hex for DOM
                const toHex = c => Math.round(Math.pow(c, 1 / 2.2) * 255).toString(16).padStart(2, '0');
                const hexColor = `#${toHex(colors[0])}${toHex(colors[1])}${toHex(colors[2])}`;
                inner.style.backgroundColor = hexColor;
            } else {
                inner.style.backgroundColor = 'transparent';
            }

            slot.appendChild(inner);
            this.hotbarElement.appendChild(slot);
        }
    }

    update(delta, time) {
        // FPS Counter
        this.frameCount++;
        if (time - this.lastFpsTime >= 1.0) {
            this.fpsElement.innerText = `FPS: ${this.frameCount}`;
            this.frameCount = 0;
            this.lastFpsTime = time;
        }

        // Debug info - Selected Block
        if (this.playerSystem.selectedBlock) {
            const sb = this.playerSystem.selectedBlock;
            const blockId = this.playerSystem.physics.getBlockAt(sb.q, sb.y, sb.r); // physics uses world coords, wait getBlockAt takes x,y,z!

            // Actually playerSystem.selectedBlock gives q, r, y in grid coords.
            // Let's get the global block ID from chunk system directly.
            const CHUNK_SIZE = 16;
            const cq = Math.floor(sb.q / CHUNK_SIZE);
            const cr = Math.floor(sb.r / CHUNK_SIZE);
            const chunk = this.playerSystem.chunkSystem.chunks.get(`${cq},${cr}`);

            let bName = "Unknown";
            if (chunk) {
                const lq = sb.q - cq * CHUNK_SIZE;
                const lr = sb.r - cr * CHUNK_SIZE;
                const id = chunk.getBlock(lq, lr, sb.y);
                const def = this.blockSystem.getBlockDef(id);
                if (def) bName = def.name;
            }

            this.selectedBlockElement.innerText = `Target: ${bName} (q:${sb.q}, r:${sb.r}, y:${sb.y})`;
        } else {
            this.selectedBlockElement.innerText = "Target: None";
        }

        // Fly Mode Info
        if (this.playerSystem.isFlying) {
            this.flyElement.innerText = "[ FLY MODE ENABLED - Space: Up, Shift: Down ]";
        } else {
            this.flyElement.innerText = "";
        }

        // Handle Graphics Toggle
        if (this.engine.inputManager && this.engine.inputManager.consumeKey('KeyG')) {
            this.highGraphics = !this.highGraphics;

            // Toggle Renderer Settings
            if (this.engine.systems.find(s => s.renderer)) {
                this.engine.systems.find(s => s.renderer).setHighGraphics(this.highGraphics);
            }

            // Toggle Light Shadows
            if (this.engine.lightingManager) {
                this.engine.lightingManager.sunLight.castShadow = this.highGraphics;
            }

            this.graphicsElement.innerText = `Graphics: ${this.highGraphics ? 'High' : 'Low'} (Press G to toggle)`;
        }
    }
}
