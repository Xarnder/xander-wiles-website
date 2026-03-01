export class UIManager {
    constructor(engine, playerSystem, worldGen, blockSystem) {
        this.engine = engine;
        this.playerSystem = playerSystem;
        this.worldGen = worldGen;
        this.blockSystem = blockSystem;
        this.abortController = new AbortController();

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
            }, { signal: this.abortController.signal });

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

        const lodSlider = document.getElementById('lod-slider');
        const lodValDisplay = document.getElementById('lod-val');

        if (lodSlider && lodValDisplay) {
            lodSlider.value = this.playerSystem.chunkSystem.lodDistance;
            lodValDisplay.innerText = lodSlider.value;

            lodSlider.addEventListener('input', (e) => {
                lodValDisplay.innerText = e.target.value;
            }, { signal: this.abortController.signal });

            lodSlider.addEventListener('change', (e) => {
                const newLodDist = parseInt(e.target.value);
                this.playerSystem.chunkSystem.lodDistance = newLodDist;

                // Force a rebuild of all currently rendered chunks to apply LOD states
                const pos = this.playerSystem.position;
                const axial = this.playerSystem.chunkSystem.worldToAxial ?
                    this.playerSystem.chunkSystem.worldToAxial(pos.x, pos.z) :
                    { q: Math.round(pos.x / 16), r: Math.round(pos.z / 16) };

                this.playerSystem.chunkSystem.updateLoadedChunks(axial.q, axial.r);
            });
        }

        const lodEnableToggle = document.getElementById('lod-enable-toggle');
        if (lodEnableToggle) {
            lodEnableToggle.checked = this.playerSystem.chunkSystem.enableLOD;
            lodEnableToggle.addEventListener('change', (e) => {
                this.playerSystem.chunkSystem.enableLOD = e.target.checked;

                // Force a rebuild of chunks to apply/remove LOD states
                if (this.playerSystem.chunkSystem) {
                    const pos = this.playerSystem.position;
                    const axial = this.playerSystem.chunkSystem.worldToAxial ?
                        this.playerSystem.chunkSystem.worldToAxial(pos.x, pos.z) :
                        { q: Math.round(pos.x / 16), r: Math.round(pos.z / 16) };

                    this.playerSystem.chunkSystem.updateLoadedChunks(axial.q, axial.r);
                }
            }, { signal: this.abortController.signal });
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
            }, { signal: this.abortController.signal });
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
            }, { signal: this.abortController.signal });
        }

        const aocSlider = document.getElementById('aoc-slider');
        const aocValDisplay = document.getElementById('aoc-val');
        if (aocSlider && aocValDisplay) {
            aocSlider.addEventListener('input', (e) => {
                aocValDisplay.innerText = e.target.value;
            }, { signal: this.abortController.signal });

            aocSlider.addEventListener('change', (e) => {
                const strength = parseFloat(e.target.value);
                // The blockSystem configures materials. We tell its builder to rebuild textures!
                if (this.playerSystem && this.playerSystem.chunkSystem && this.playerSystem.chunkSystem.meshBuilder && this.playerSystem.chunkSystem.meshBuilder.rebuildTextures) {
                    this.playerSystem.chunkSystem.meshBuilder.rebuildTextures(this.blockSystem, strength);
                }
            });
        }

        const gtaoSlider = document.getElementById('gtao-slider');
        const gtaoValDisplay = document.getElementById('gtao-val');
        if (gtaoSlider && gtaoValDisplay) {
            gtaoSlider.addEventListener('input', (e) => {
                gtaoValDisplay.innerText = e.target.value;
            }, { signal: this.abortController.signal });

            gtaoSlider.addEventListener('change', (e) => {
                const intensity = parseFloat(e.target.value);
                if (this.engine.rendererSystem && this.engine.rendererSystem.gtaoPass) {
                    this.engine.rendererSystem.gtaoPass.blendIntensity = intensity;
                    this.engine.rendererSystem.gtaoPass.enabled = intensity > 0; // Dynamically eliminate VRAM footprint when turned off
                }
            }, { signal: this.abortController.signal });

            // Initialize the GTAO pass state from the slider's initial HTML value
            const initialGtaoIntensity = parseFloat(gtaoSlider.value);
            if (this.engine.rendererSystem && this.engine.rendererSystem.gtaoPass) {
                this.engine.rendererSystem.gtaoPass.blendIntensity = initialGtaoIntensity;
                this.engine.rendererSystem.gtaoPass.enabled = initialGtaoIntensity > 0;
            }
        }

        const ambientSlider = document.getElementById('ambient-slider');
        const ambientValDisplay = document.getElementById('ambient-val');
        if (ambientSlider && ambientValDisplay) {
            ambientSlider.addEventListener('input', (e) => {
                ambientValDisplay.innerText = e.target.value;
                if (this.engine.lightingManager) {
                    this.engine.lightingManager.ambientStrength = parseFloat(e.target.value);
                }
            }, { signal: this.abortController.signal });
        }

        const dayNightToggle = document.getElementById('day-night-toggle');
        if (dayNightToggle) {
            dayNightToggle.checked = this.engine.lightingManager ? this.engine.lightingManager.cycleEnabled : false;
            dayNightToggle.addEventListener('change', (e) => {
                if (this.engine.lightingManager) {
                    this.engine.lightingManager.cycleEnabled = e.target.checked;
                }
            }, { signal: this.abortController.signal });
        }

        // Audio Toggle Listeners
        const muteAllToggle = document.getElementById('mute-all-toggle');
        if (muteAllToggle) {
            muteAllToggle.addEventListener('change', (e) => {
                this.engine.audioManager.toggleMuteAll(e.target.checked);
            }, { signal: this.abortController.signal });
        }

        const muteSFXToggle = document.getElementById('mute-sfx-toggle');
        if (muteSFXToggle) {
            muteSFXToggle.addEventListener('change', (e) => {
                this.engine.audioManager.toggleMuteSFX(e.target.checked);
            }, { signal: this.abortController.signal });
        }

        const muteAmbienceToggle = document.getElementById('mute-ambience-toggle');
        if (muteAmbienceToggle) {
            muteAmbienceToggle.addEventListener('change', (e) => {
                this.engine.audioManager.toggleMuteAmbience(e.target.checked);
            }, { signal: this.abortController.signal });
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
            }, { signal: this.abortController.signal });
        }

        // Initial hold delay slider (how long before 2nd action fires)
        const initDelaySlider = document.getElementById('init-delay-slider');
        const initDelayVal = document.getElementById('init-delay-val');
        if (initDelaySlider && initDelayVal) {
            initDelaySlider.value = Math.round(this.playerSystem.blockInitialDelay * 1000);
            initDelayVal.innerText = initDelaySlider.value;
            initDelaySlider.addEventListener('input', (e) => {
                initDelayVal.innerText = e.target.value;
                this.playerSystem.blockInitialDelay = parseInt(e.target.value) / 1000;
            }, { signal: this.abortController.signal });
        }

        // Repeat delay slider (cadence after 2nd action)
        const repeatDelaySlider = document.getElementById('repeat-delay-slider');
        const repeatDelayVal = document.getElementById('repeat-delay-val');
        if (repeatDelaySlider && repeatDelayVal) {
            repeatDelaySlider.value = Math.round(this.playerSystem.blockRepeatDelay * 1000);
            repeatDelayVal.innerText = repeatDelaySlider.value;
            repeatDelaySlider.addEventListener('input', (e) => {
                repeatDelayVal.innerText = e.target.value;
                this.playerSystem.blockRepeatDelay = parseInt(e.target.value) / 1000;
            }, { signal: this.abortController.signal });
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
            }, { signal: this.abortController.signal });
        }

        // Main Tab logic
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

                // Refresh waypoint list when switching to that tab
                if (targetId === 'waypoints-tab') {
                    this.refreshWaypointList();
                }
            }, { signal: this.abortController.signal });
        });

        // Sub-tab logic (for settings)
        const subTabs = document.querySelectorAll('.sub-tab');
        const subContents = document.querySelectorAll('.sub-tab-content');
        subTabs.forEach(subTab => {
            subTab.addEventListener('click', (e) => {
                e.stopPropagation();
                subTabs.forEach(st => st.classList.remove('active'));
                subContents.forEach(sc => sc.classList.remove('active'));

                subTab.classList.add('active');
                const targetSubId = subTab.getAttribute('data-sub-tab');
                const targetSubContent = document.getElementById(targetSubId);
                if (targetSubContent) targetSubContent.classList.add('active');
            }, { signal: this.abortController.signal });
        });

        this.initPaletteMenu();

        // Prevent settings panel clicks from unpausing
        const settingsPanels = document.querySelectorAll('.settings-panel');
        settingsPanels.forEach(p => {
            p.addEventListener('click', (e) => {
                e.stopPropagation();
            }, { signal: this.abortController.signal });
        });

        // Exit to World Menu button
        const exitToMenuBtn = document.getElementById('exit-to-menu-btn');
        if (exitToMenuBtn) {
            exitToMenuBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                // Exit pointer lock so cursor is accessible
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }

                // Save world state before exiting
                await this.engine._saveAndExit();

                // Restart the whole page to avoid UI duplication and mouse lock issues
                window.location.reload();
            }, { signal: this.abortController.signal });
        }
    }

    initPaletteMenu() {
        const container = document.getElementById('palette-colors-container');
        if (!container || !this.blockSystem || !this.blockSystem.palette) return;

        // Clear existing just in case
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h3 style="margin-top:0; margin-bottom: 5px;">Block Color Palette</h3>
                <p style="font-size:0.85em; color: #aaaaaa; margin-top:0;">Tweak colors and click Apply to see changes in-game.</p>
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    <button id="apply-palette-btn" style="padding: 8px 16px; background: #00b894; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Apply New Colors</button>
                    <button id="copy-palette-btn" style="padding: 8px 16px; background: #6c5ce7; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Copy JSON</button>
                </div>
            </div>
            <div id="palette-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; max-width: 100%; overflow: hidden;"></div>
        `;

        const grid = document.getElementById('palette-grid');

        document.getElementById('apply-palette-btn').addEventListener('click', () => {
            // Apply all currently selected values in the inputs to the palette
            const inputs = document.querySelectorAll('#palette-grid input[type="color"]');
            inputs.forEach(input => {
                const colorName = input.getAttribute('data-color-name');
                if (colorName) {
                    this.blockSystem.palette.set(colorName, input.value);
                }
            });

            // Apply opacity values
            const opacityInputs = document.querySelectorAll('#palette-grid input[type="range"].opacity-slider');
            opacityInputs.forEach(input => {
                const colorName = input.getAttribute('data-opacity-name');
                if (colorName) {
                    this.blockSystem.paletteOpacity.set(colorName, parseFloat(input.value));
                }
            });

            // Trigger an update visually
            if (this.playerSystem && this.playerSystem.chunkSystem) {
                if (this.playerSystem.chunkSystem.meshBuilder && this.playerSystem.chunkSystem.meshBuilder.rebuildTextures) {
                    this.playerSystem.chunkSystem.meshBuilder.rebuildTextures(this.blockSystem);
                }

                this.playerSystem.chunkSystem.dirtyAllChunks();
            }

            // Update hotbar visuals
            const slots = this.hotbarElement.querySelectorAll('.hotbar-slot-inner');
            slots.forEach((inner, i) => {
                const blockDef = this.blockSystem.getBlockDef(i + 1);
                if (blockDef && blockDef.topColor) {
                    const latestColor = this.blockSystem.palette.get(blockDef.topColor);
                    if (latestColor) inner.style.backgroundColor = latestColor;
                }
            });
        }, { signal: this.abortController.signal });

        // Helper to copy text without navigator.clipboard for unsafe contexts
        const fallbackCopyTextToClipboard = (text) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;

            // Avoid scrolling to bottom
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.position = "fixed";

            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                document.execCommand('copy');
            } catch (err) {
                console.error('Fallback: Oops, unable to copy', err);
                throw err;
            }

            document.body.removeChild(textArea);
        };

        document.getElementById('copy-palette-btn').addEventListener('click', async (e) => {
            const btn = e.target;
            try {
                // Fetch the original json to keep opacities
                const response = await fetch('data/palette.json');
                const originalPalette = await response.json();

                // Override with our new hex values and opacities
                for (const [key, val] of Object.entries(originalPalette)) {
                    if (this.blockSystem.palette.has(key)) {
                        const newColor = this.blockSystem.palette.get(key);
                        const newOpacity = this.blockSystem.paletteOpacity.get(key) ?? 0.8;

                        if (typeof val === 'object') {
                            val.color = newColor;
                            val.opacity = newOpacity;
                        } else {
                            originalPalette[key] = {
                                color: newColor,
                                opacity: newOpacity
                            };
                        }
                    }
                }

                const jsonStr = JSON.stringify(originalPalette, null, 4);

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(jsonStr);
                } else {
                    fallbackCopyTextToClipboard(jsonStr);
                }

                btn.innerText = "COPIED!";
                setTimeout(() => btn.innerText = "Copy JSON", 2000);
            } catch (err) {
                console.error("Failed to copy palette:", err);
                btn.innerText = "Error";
                setTimeout(() => btn.innerText = "Copy JSON", 2000);
            }
        }, { signal: this.abortController.signal });

        this.blockSystem.palette.forEach((hexColor, colorName) => {
            const row = document.createElement('div');
            row.className = 'setting-row';
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '8px';
            row.style.paddingBottom = '10px';
            row.style.marginBottom = '10px';
            row.style.borderBottom = '1px solid #444';

            // TOP ROW - Color
            const topRow = document.createElement('div');
            topRow.style.display = 'flex';
            topRow.style.justifyContent = 'space-between';
            topRow.style.alignItems = 'center';

            const labelContainer = document.createElement('div');

            const colorDot = document.createElement('span');
            colorDot.style.display = 'inline-block';
            colorDot.style.width = '12px';
            colorDot.style.height = '12px';
            colorDot.style.borderRadius = '50%';
            colorDot.style.marginRight = '8px';
            colorDot.style.backgroundColor = hexColor;

            const label = document.createElement('label');
            label.innerText = colorName;
            label.style.textTransform = 'capitalize';
            label.style.cursor = 'pointer';
            label.style.margin = '0';

            labelContainer.appendChild(colorDot);
            labelContainer.appendChild(label);

            const colorInputContainer = document.createElement('div');
            colorInputContainer.style.display = 'flex';
            colorInputContainer.style.gap = '10px';
            colorInputContainer.style.alignItems = 'center';

            const hexDisplay = document.createElement('span');
            // Check for both short (#FFF) and ARGB (#FF000000) formats
            const cleanHex = hexColor.length > 7 ? hexColor.substring(0, 7) : hexColor;
            hexDisplay.innerText = cleanHex.toUpperCase();
            hexDisplay.style.fontFamily = 'monospace';
            hexDisplay.style.fontSize = '0.85em';
            hexDisplay.style.color = '#888';
            hexDisplay.style.cursor = 'pointer';
            hexDisplay.title = 'Click to Copy';

            const input = document.createElement('input');
            input.type = 'color';
            input.value = cleanHex;
            input.style.cursor = 'pointer';
            input.setAttribute('data-color-name', colorName);

            input.addEventListener('input', (e) => {
                const newColor = e.target.value;
                hexDisplay.innerText = newColor.toUpperCase();
                colorDot.style.backgroundColor = newColor;
            });

            // To make text selectable easily
            hexDisplay.addEventListener('click', () => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(input.value).catch(() => { });
                } else {
                    fallbackCopyTextToClipboard(input.value);
                }
                const originalHex = hexDisplay.innerText;
                hexDisplay.innerText = 'COPIED!';
                setTimeout(() => hexDisplay.innerText = originalHex, 1000);
            });

            colorInputContainer.appendChild(hexDisplay);
            colorInputContainer.appendChild(input);

            topRow.appendChild(labelContainer);
            topRow.appendChild(colorInputContainer);

            // BOTTOM ROW - Opacity
            const bottomRow = document.createElement('div');
            bottomRow.style.display = 'flex';
            bottomRow.style.justifyContent = 'space-between';
            bottomRow.style.alignItems = 'center';

            const opacityLabel = document.createElement('span');
            opacityLabel.innerText = "Overlay Opacity";
            opacityLabel.style.fontSize = '0.85em';
            opacityLabel.style.color = '#ccc';
            opacityLabel.style.marginLeft = '20px';

            const opacityInputContainer = document.createElement('div');
            opacityInputContainer.style.display = 'flex';
            opacityInputContainer.style.gap = '10px';
            opacityInputContainer.style.alignItems = 'center';

            const opacityValueDisplay = document.createElement('span');
            const currentOpacity = this.blockSystem.paletteOpacity.has(colorName) ? this.blockSystem.paletteOpacity.get(colorName) : 0.8;
            opacityValueDisplay.innerText = currentOpacity.toFixed(2);
            opacityValueDisplay.style.fontFamily = 'monospace';
            opacityValueDisplay.style.fontSize = '0.85em';
            opacityValueDisplay.style.color = '#888';
            opacityValueDisplay.style.width = '30px';

            const opacityInput = document.createElement('input');
            opacityInput.type = 'range';
            opacityInput.min = '0';
            opacityInput.max = '1';
            opacityInput.step = '0.01';
            opacityInput.value = currentOpacity;
            opacityInput.className = 'opacity-slider';
            opacityInput.style.cursor = 'pointer';
            opacityInput.style.width = '80px';
            opacityInput.setAttribute('data-opacity-name', colorName);

            opacityInput.addEventListener('input', (e) => {
                opacityValueDisplay.innerText = parseFloat(e.target.value).toFixed(2);
            });

            opacityInputContainer.appendChild(opacityInput);
            opacityInputContainer.appendChild(opacityValueDisplay);

            bottomRow.appendChild(opacityLabel);
            bottomRow.appendChild(opacityInputContainer);

            row.appendChild(topRow);
            row.appendChild(bottomRow);
            grid.appendChild(row);
        });
    }

    initHotbar() {
        // Create 10 slots
        for (let i = 1; i <= 10; i++) {
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

    /**
     * Update highlighted hotbar slot when player presses a number key.
     * @param {number} slotIndex — 0-indexed
     */
    updateHotbarSelection(slotIndex) {
        const slots = this.hotbarElement.querySelectorAll('.hotbar-slot');
        slots.forEach((slot, i) => {
            slot.classList.toggle('active', i === slotIndex);
        });
    }

    /**
     * Refresh the Waypoints tab with current waypoint data.
     */
    refreshWaypointList() {
        const listEl = document.getElementById('waypoint-list');
        if (!listEl) return;

        const wm = this.engine.waypointManager;
        if (!wm) {
            listEl.innerHTML = '<p style="opacity:0.5">No world loaded.</p>';
            return;
        }

        if (wm.waypoints.length === 0) {
            listEl.innerHTML = '<p style="opacity:0.5">No waypoints yet. Press <strong>P</strong> in-game to place one.</p>';
            return;
        }

        listEl.innerHTML = '';

        for (const wp of wm.waypoints) {
            const entry = document.createElement('div');
            entry.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 10px; margin-bottom:6px; background:rgba(255,255,255,0.05); border-radius:6px; border:1px solid rgba(255,255,255,0.08);';

            // Color dot
            const dot = document.createElement('span');
            dot.style.cssText = `width:10px; height:10px; border-radius:50%; flex-shrink:0; background:#${wp.color.toString(16).padStart(6, '0')};`;
            entry.appendChild(dot);

            // Name + coords
            const info = document.createElement('div');
            info.style.cssText = 'flex:1; min-width:0;';
            info.innerHTML = `<div style="font-weight:600; font-size:0.9rem;">${wp.name}</div><div style="font-size:0.75rem; opacity:0.5;">X:${Math.round(wp.x)} Y:${Math.round(wp.y)} Z:${Math.round(wp.z)}</div>`;
            entry.appendChild(info);

            // Rename button
            const renameBtn = document.createElement('button');
            renameBtn.textContent = '✏';
            renameBtn.title = 'Rename';
            renameBtn.style.cssText = 'background:none; border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:0.85rem;';
            renameBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newName = prompt('Rename waypoint:', wp.name);
                if (newName !== null && newName.trim()) {
                    await wm.renameWaypoint(wp.id, newName);
                    this.refreshWaypointList();
                }
            });
            entry.appendChild(renameBtn);

            // Toggle visibility button
            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = wp.visible ? '👁' : '👁‍🗨';
            toggleBtn.title = wp.visible ? 'Hide' : 'Show';
            toggleBtn.style.cssText = 'background:none; border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:0.85rem;';
            toggleBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await wm.toggleWaypoint(wp.id);
                this.refreshWaypointList();
            });
            entry.appendChild(toggleBtn);

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑';
            deleteBtn.title = 'Delete';
            deleteBtn.style.cssText = 'background:none; border:1px solid rgba(255,100,100,0.3); color:#ff6b6b; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:0.85rem;';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await wm.deleteWaypoint(wp.id);
                this.refreshWaypointList();
            });
            entry.appendChild(deleteBtn);

            listEl.appendChild(entry);
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

    initWaypointMenu() {
        const pTag = document.querySelector('#waypoints-tab p strong');
        if (pTag) {
            // For example, if we wanted to add a listener here, we'd use the signal
        }
    }

    dispose() {
        // 1. Clear added debug elements
        if (this.graphicsElement && this.graphicsElement.parentNode) {
            this.graphicsElement.parentNode.removeChild(this.graphicsElement);
        }
        if (this.flyElement && this.flyElement.parentNode) {
            this.flyElement.parentNode.removeChild(this.flyElement);
        }

        // 2. Clear hotbar slots
        if (this.hotbarElement) {
            this.hotbarElement.innerHTML = '';
        }

        // 3. Abort all attached event listeners
        this.abortController.abort();
    }
}
