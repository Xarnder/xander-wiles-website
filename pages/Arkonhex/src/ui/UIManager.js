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

        this.dateElement = document.getElementById('system-date');
        this.timeElement = document.getElementById('in-game-time');

        if (this.dateElement) {
            this.dateElement.innerText = new Date().toISOString().split('T')[0];
        }

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

        const cloudShadowToggle = document.getElementById('cloud-shadows-toggle');
        if (cloudShadowToggle) {
            cloudShadowToggle.addEventListener('change', (e) => {
                const cloudSystem = this.engine.systems.find(s => s.cloudMeshes);
                if (cloudSystem) {
                    cloudSystem.castShadows = e.target.checked;
                    cloudSystem.cloudGroup.children.forEach(mesh => {
                        mesh.castShadow = e.target.checked;
                        mesh.receiveShadow = e.target.checked;
                    });
                }
            });
        }

        const aocSlider = document.getElementById('aoc-slider');
        const aocValDisplay = document.getElementById('aoc-val');
        if (aocSlider && aocValDisplay) {
            aocSlider.addEventListener('input', (e) => {
                aocValDisplay.innerText = e.target.value;
            });

            aocSlider.addEventListener('change', (e) => {
                const strength = parseFloat(e.target.value);
                // The blockSystem configures materials. We tell its builder to rebuild textures!
                if (this.blockSystem.chunkMeshBuilder && this.blockSystem.chunkMeshBuilder.rebuildTextures) {
                    this.blockSystem.chunkMeshBuilder.rebuildTextures(this.blockSystem, strength);
                }
            });
        }

        const gtaoSlider = document.getElementById('gtao-slider');
        const gtaoValDisplay = document.getElementById('gtao-val');
        if (gtaoSlider && gtaoValDisplay) {
            gtaoSlider.addEventListener('input', (e) => {
                gtaoValDisplay.innerText = e.target.value;
            });

            gtaoSlider.addEventListener('change', (e) => {
                const intensity = parseFloat(e.target.value);
                if (this.engine.renderer && this.engine.renderer.gtaoPass) {
                    this.engine.renderer.gtaoPass.blendIntensity = intensity;
                    this.engine.renderer.gtaoPass.enabled = intensity > 0; // Dynamically eliminate VRAM footprint when turned off
                }
            });

            // Initialize the GTAO pass state from the slider's initial HTML value
            const initialGtaoIntensity = parseFloat(gtaoSlider.value);
            if (this.engine.renderer && this.engine.renderer.gtaoPass) {
                this.engine.renderer.gtaoPass.blendIntensity = initialGtaoIntensity;
                this.engine.renderer.gtaoPass.enabled = initialGtaoIntensity > 0;
            }
        }

        const shadowResSelect = document.getElementById('shadow-res-select');
        if (shadowResSelect) {
            shadowResSelect.addEventListener('change', (e) => {
                const res = parseInt(e.target.value);
                if (this.engine.lightingManager && this.engine.lightingManager.sunLight) {
                    const shadow = this.engine.lightingManager.sunLight.shadow;
                    shadow.mapSize.width = res;
                    shadow.mapSize.height = res;

                    // Force the Three.js Graphics Engine to dynamically destroy the old VRAM buffer and rebuild the new one!
                    if (shadow.map) {
                        shadow.map.dispose();
                        shadow.map = null;
                    }
                }
            });
        }

        const blockOutlineToggle = document.getElementById('block-outline-toggle');
        if (blockOutlineToggle) {
            // Initial sync
            if (this.blockSystem) {
                this.blockSystem.showOutlines = blockOutlineToggle.checked;
            }

            blockOutlineToggle.addEventListener('change', (e) => {
                const showOutlines = e.target.checked;
                if (this.blockSystem) {
                    this.blockSystem.showOutlines = showOutlines;

                    // Force a total rebuild of all currently loaded chunks to apply/remove outlines
                    if (this.playerSystem.chunkSystem) {
                        this.playerSystem.chunkSystem.dirtyAllChunks();
                    }
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
                // The palette now stores the raw hex strings from the JSON
                const hexColor = this.blockSystem.palette.get(blockDef.topColor) || '#ffffff';
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

        // Debug info - In-Game Time
        if (this.timeElement && this.engine.lightingManager) {
            // timeOfDay is 0.0 to 1.0. Multiply by 24 to get total hours float.
            const totalHours = this.engine.lightingManager.timeOfDay * 24.0;
            const hours24 = Math.floor(totalHours);
            const minutes = Math.floor((totalHours - hours24) * 60);

            // Map 24H -> 12H (AM/PM)
            const ampm = hours24 >= 12 ? 'PM' : 'AM';
            let hours12 = hours24 % 12;
            hours12 = hours12 ? hours12 : 12; // Modulo returns 0 for 12, so set to 12

            // Format minutes to be two digits (e.g., '05' instead of '5')
            const minutesStr = minutes < 10 ? '0' + minutes : minutes;

            this.timeElement.innerText = `${hours12}:${minutesStr} ${ampm}`;
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
                this.engine.lightingManager.sunLight.shadow.camera.updateProjectionMatrix();
            }

            this.graphicsElement.innerText = `Graphics: ${this.highGraphics ? 'High' : 'Low'} (Press G to toggle)`;
        }
    }
}
