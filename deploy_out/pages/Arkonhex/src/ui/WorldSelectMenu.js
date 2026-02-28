/**
 * WorldSelectMenu — Full-screen world selection UI.
 *
 * Shows a list of saved worlds with Play/Delete/Rename buttons and storage size.
 * Includes a "Create New World" form.
 */

import { listWorlds, createWorld, deleteWorld, renameWorld } from '../storage/WorldManager.js';
import { getWorldStorageSize } from '../storage/ChunkStorage.js';

export class WorldSelectMenu {
    /**
     * @param {Function} onWorldSelected — callback(worldRecord) when a world is chosen
     */
    constructor(onWorldSelected) {
        this.onWorldSelected = onWorldSelected;
        this.container = document.getElementById('world-select-screen');
        this.worldListEl = document.getElementById('world-list');
        this.createForm = document.getElementById('create-world-form');
        this.createBtn = document.getElementById('create-world-btn');
        this.showCreateBtn = document.getElementById('show-create-form-btn');

        if (!this.container) {
            console.error('[WorldSelectMenu] #world-select-screen not found');
            return;
        }

        this._bindEvents();
        this.refresh();
    }

    _bindEvents() {
        // Show/hide create form
        if (this.showCreateBtn) {
            this.showCreateBtn.addEventListener('click', () => {
                this.createForm.classList.toggle('hidden');
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

            // Fetch storage size asynchronously
            const bytes = await getWorldStorageSize(world.id);
            const sizeStr = this._formatBytes(bytes);

            entry.innerHTML = `
                <div class="world-info">
                    <div class="world-name">${this._escapeHTML(world.name)}</div>
                    <div class="world-meta">
                        Seed: ${world.seed} &bull; Last played: ${lastPlayed} &bull; Size: ${sizeStr}
                    </div>
                </div>
                <div class="world-actions">
                    <button class="world-play-btn">Play</button>
                    <button class="world-rename-btn" title="Rename world">✏</button>
                    <button class="world-delete-btn" title="Delete world">🗑</button>
                </div>
            `;

            // Play button
            entry.querySelector('.world-play-btn').addEventListener('click', () => {
                this.hide();
                this.onWorldSelected(world);
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
