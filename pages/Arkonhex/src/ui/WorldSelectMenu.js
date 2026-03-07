/**
 * WorldSelectMenu — Full-screen world selection UI.
 *
 * Shows a list of saved worlds with Play/Delete/Rename buttons and storage size.
 * Includes a "Create New World" form.
 */

import { listWorlds, createWorld, deleteWorld, renameWorld } from '../storage/WorldManager.js';
import { getWorldStorageSize } from '../storage/ChunkStorage.js';
import { exportWorld, importWorld } from '../storage/WorldExporter.js';

export class WorldSelectMenu {
    /**
     * @param {Function} onWorldSelected — callback(worldRecord) when a world is chosen
     */
    constructor(onWorldSelected) {
        this.onWorldSelected = onWorldSelected;
        this.container = document.getElementById('world-select-screen');
        this.worldListEl = document.getElementById('world-list');

        // Menus
        this.mainMenu = document.getElementById('ws-main-menu');
        this.createMenu = document.getElementById('ws-create-menu');
        this.listMenu = document.getElementById('ws-list-menu');

        // Main Menu Buttons
        this.playNowBtn = document.getElementById('play-now-btn');
        this.navCreateBtn = document.getElementById('nav-create-world-btn');
        this.navExistingBtn = document.getElementById('nav-existing-world-btn');

        // Create Menu
        this.createForm = document.getElementById('create-world-form');
        this.createBtn = document.getElementById('create-world-btn');

        // Back Buttons
        this.backBtns = document.querySelectorAll('.ws-back-btn');

        if (!this.container) {
            console.error('[WorldSelectMenu] #world-select-screen not found');
            return;
        }

        this._bindEvents();
        this.refresh();
    }

    _bindEvents() {
        // Navigation Functions
        const showMenu = (menuToShow) => {
            if (this.mainMenu) this.mainMenu.classList.add('hidden');
            if (this.createMenu) this.createMenu.classList.add('hidden');
            if (this.listMenu) this.listMenu.classList.add('hidden');

            if (menuToShow) menuToShow.classList.remove('hidden');
        };

        // Navigation Buttons
        if (this.navCreateBtn) {
            this.navCreateBtn.addEventListener('click', () => showMenu(this.createMenu));
        }

        if (this.navExistingBtn) {
            this.navExistingBtn.addEventListener('click', () => {
                this.refresh();
                showMenu(this.listMenu);
            });
        }

        if (this.backBtns) {
            this.backBtns.forEach(btn => {
                btn.addEventListener('click', () => showMenu(this.mainMenu));
            });
        }

        // Play Now button - load or create "Default World"
        if (this.playNowBtn) {
            this.playNowBtn.addEventListener('click', async () => {
                const worlds = await listWorlds();
                let defaultWorld = worlds.find(w => w.name === 'Default World');

                if (!defaultWorld) {
                    defaultWorld = await createWorld('Default World', null); // Use random seed
                }

                this.hide();
                this.onWorldSelected(defaultWorld);
            });
        }

        // Create world form submit
        if (this.createBtn) {
            this.createBtn.addEventListener('click', async () => {
                const nameInput = document.getElementById('world-name-input');
                const seedInput = document.getElementById('world-seed-input');
                const name = nameInput ? nameInput.value.trim() : '';
                const seed = seedInput ? seedInput.value.trim() : '';

                const world = await createWorld(name || 'New World', seed || null);

                // Reset inputs
                if (nameInput) nameInput.value = '';
                if (seedInput) seedInput.value = '';
                this.createForm.classList.add('hidden');

                // Auto-play the newly created world
                this.hide();
                this.onWorldSelected(world);
            });
        }

        // Import world file input
        const importInput = document.getElementById('world-import-input');
        if (importInput) {
            importInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    await importWorld(file);
                    this.refresh();
                    // Switch to the list menu to show the imported world
                    if (this.mainMenu) this.mainMenu.classList.add('hidden');
                    if (this.createMenu) this.createMenu.classList.add('hidden');
                    if (this.listMenu) this.listMenu.classList.remove('hidden');
                } catch (err) {
                    alert('Failed to import world: ' + err.message);
                    console.error('[WorldSelectMenu] Import failed:', err);
                }

                // Reset file input so re-selecting same file works
                importInput.value = '';
            });
        }

        // Import World button triggers the hidden file input
        const importBtn = document.getElementById('import-world-btn');
        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => {
                importInput.click();
            });
        }
    }

    /**
     * Refresh the world list from IndexedDB.
     */
    async refresh() {
        if (!this.worldListEl) return;

        const worlds = await listWorlds();
        this.worldListEl.innerHTML = '';

        if (worlds.length === 0) {
            this.worldListEl.innerHTML = '<p style="opacity:0.5; text-align:center;">No worlds yet. Create one!</p>';
            return;
        }

        for (const world of worlds) {
            const entry = document.createElement('div');
            entry.className = 'world-entry';

            const lastPlayed = new Date(world.lastPlayed).toLocaleDateString();
            const createdAt = new Date(world.createdAt).toLocaleDateString();

            // Fetch storage size asynchronously
            const bytes = await getWorldStorageSize(world.id);
            const sizeStr = this._formatBytes(bytes);

            entry.innerHTML = `
                <div class="world-info">
                    <div class="world-name">${this._escapeHTML(world.name)}</div>
                    <div class="world-meta">
                        Created: ${createdAt} &bull; Played: ${lastPlayed} &bull; Seed: ${world.seed} &bull; Size: ${sizeStr}
                    </div>
                </div>
                <div class="world-actions" style="align-items: center;">
                    <button class="world-play-btn btn-pill btn-primary" style="padding: 6px 18px; font-size: 0.85rem;">Play</button>
                    <button class="world-download-btn btn-icon btn-outline-blue" title="Download world">⬇</button>
                    <button class="world-rename-btn btn-icon btn-outline" title="Rename world">✏</button>
                    <button class="world-delete-btn btn-icon btn-outline-red" title="Delete world">🗑</button>
                </div>
            `;

            // Play button
            entry.querySelector('.world-play-btn').addEventListener('click', () => {
                this.hide();
                this.onWorldSelected(world);
            });

            // Download button
            entry.querySelector('.world-download-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                const prevText = btn.textContent;
                btn.textContent = '⏳';
                btn.disabled = true;
                try {
                    await exportWorld(world.id);
                    btn.textContent = '✅';
                    setTimeout(() => { btn.textContent = prevText; btn.disabled = false; }, 2000);
                } catch (err) {
                    alert('Export failed: ' + err.message);
                    btn.textContent = prevText;
                    btn.disabled = false;
                }
            });

            // Rename button
            entry.querySelector('.world-rename-btn').addEventListener('click', async () => {
                const newName = prompt(`Rename "${world.name}" to:`, world.name);
                if (newName !== null && newName.trim() !== '') {
                    await renameWorld(world.id, newName.trim());
                    this.refresh();
                }
            });

            // Delete button
            entry.querySelector('.world-delete-btn').addEventListener('click', async () => {
                if (confirm(`Delete world "${world.name}"? This cannot be undone.`)) {
                    await deleteWorld(world.id);
                    this.refresh();
                }
            });

            this.worldListEl.appendChild(entry);
        }
    }

    show() {
        if (this.container) this.container.classList.remove('hidden');
    }

    hide() {
        if (this.container) this.container.classList.add('hidden');
    }

    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _formatBytes(bytes) {
        if (bytes === 0) return 'Empty';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
}
