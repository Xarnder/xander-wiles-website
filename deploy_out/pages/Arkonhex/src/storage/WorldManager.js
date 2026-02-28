/**
 * WorldManager — CRUD operations for worlds, plus player state persistence.
 */

import { openDB, promisifyRequest } from './ArkonhexDB.js';
import { deleteWorldChunks } from './ChunkStorage.js';

/**
 * Generate a simple UUID v4.
 * @returns {string}
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate a random numeric seed.
 * @returns {number}
 */
function generateSeed() {
    return Math.floor(Math.random() * 2147483647);
}

// ─── World CRUD ───

/**
 * Create a new world and store its metadata.
 * @param {string} name — user-chosen world name
 * @param {string|number|null} seed — optional seed; random if omitted
 * @returns {Promise<Object>} The created world record
 */
export async function createWorld(name, seed = null) {
    const db = await openDB();
    const now = Date.now();

    const world = {
        id: generateUUID(),
        name: name || 'New World',
        seed: seed !== null && seed !== '' ? seed : generateSeed(),
        createdAt: now,
        lastPlayed: now
    };

    const tx = db.transaction('worlds', 'readwrite');
    tx.objectStore('worlds').put(world);

    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });

    console.log(`[WorldManager] Created world "${world.name}" (${world.id})`);
    return world;
}

/**
 * List all saved worlds, sorted by lastPlayed (most recent first).
 * @returns {Promise<Object[]>}
 */
export async function listWorlds() {
    const db = await openDB();
    const tx = db.transaction('worlds', 'readonly');
    const worlds = await promisifyRequest(tx.objectStore('worlds').getAll());
    worlds.sort((a, b) => b.lastPlayed - a.lastPlayed);
    return worlds;
}

/**
 * Load a world's metadata and update its lastPlayed timestamp.
 * @param {string} id — world UUID
 * @returns {Promise<Object|null>}
 */
export async function loadWorld(id) {
    const db = await openDB();

    // Read
    const txRead = db.transaction('worlds', 'readonly');
    const world = await promisifyRequest(txRead.objectStore('worlds').get(id));
    if (!world) return null;

    // Update lastPlayed
    world.lastPlayed = Date.now();
    const txWrite = db.transaction('worlds', 'readwrite');
    txWrite.objectStore('worlds').put(world);
    await new Promise((resolve, reject) => {
        txWrite.oncomplete = resolve;
        txWrite.onerror = () => reject(txWrite.error);
    });

    console.log(`[WorldManager] Loaded world "${world.name}"`);
    return world;
}

/**
 * Delete a world and all its associated data (chunks + player state).
 * @param {string} id — world UUID
 */
export async function deleteWorld(id) {
    const db = await openDB();

    // Delete world metadata
    const tx = db.transaction('worlds', 'readwrite');
    tx.objectStore('worlds').delete(id);
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });

    // Delete all chunks for this world
    await deleteWorldChunks(id);

    // Delete player state
    const txPlayer = db.transaction('player', 'readwrite');
    txPlayer.objectStore('player').delete(id);
    await new Promise((resolve, reject) => {
        txPlayer.oncomplete = resolve;
        txPlayer.onerror = () => reject(txPlayer.error);
    });

    // Delete all waypoints for this world
    try {
        const txWp = db.transaction('waypoints', 'readwrite');
        const wpIndex = txWp.objectStore('waypoints').index('worldId');
        const wpCursor = wpIndex.openCursor(IDBKeyRange.only(id));
        await new Promise((resolve, reject) => {
            wpCursor.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            wpCursor.onerror = () => reject(wpCursor.error);
        });
    } catch (e) {
        console.warn('[WorldManager] Could not delete waypoints (store may not exist):', e);
    }

    console.log(`[WorldManager] Deleted world ${id}`);
}

/**
 * Rename a world.
 * @param {string} id — world UUID
 * @param {string} newName — new display name
 */
export async function renameWorld(id, newName) {
    const db = await openDB();

    const txRead = db.transaction('worlds', 'readonly');
    const world = await promisifyRequest(txRead.objectStore('worlds').get(id));
    if (!world) return;

    world.name = newName.trim() || world.name;
    const txWrite = db.transaction('worlds', 'readwrite');
    txWrite.objectStore('worlds').put(world);
    await new Promise((resolve, reject) => {
        txWrite.oncomplete = resolve;
        txWrite.onerror = () => reject(txWrite.error);
    });
    console.log(`[WorldManager] Renamed world ${id} to "${world.name}"`);
}

// ─── Player State ───

/**
 * Save player state for a world.
 * @param {string} worldId
 * @param {number[]} position — [x, y, z]
 * @param {number[]} rotation — [yaw, pitch]
 */
export async function savePlayerState(worldId, position, rotation) {
    const db = await openDB();
    const tx = db.transaction('player', 'readwrite');
    tx.objectStore('player').put({
        worldId,
        position,
        rotation
    });

    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Load player state for a world.
 * @param {string} worldId
 * @returns {Promise<{position: number[], rotation: number[]}|null>}
 */
export async function loadPlayerState(worldId) {
    const db = await openDB();
    const tx = db.transaction('player', 'readonly');
    const state = await promisifyRequest(tx.objectStore('player').get(worldId));
    return state || null;
}
