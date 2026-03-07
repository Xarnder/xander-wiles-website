/**
 * WorldExporter — Export and Import full world data as .arkonhex files.
 * 
 * File format: JSON with Base64-encoded binary arrays.
 * Contains: world metadata, player state, waypoints, and all modified chunks.
 */

import { openDB, promisifyRequest } from './ArkonhexDB.js';

const EXPORT_VERSION = 1;

/**
 * Convert a Uint8Array (or ArrayBuffer) to a Base64 string.
 */
function uint8ToBase64(uint8) {
    const bytes = uint8 instanceof Uint8Array ? uint8 : new Uint8Array(uint8);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Convert a Base64 string back to a Uint8Array.
 */
function base64ToUint8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Generate a simple UUID v4.
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Export a world and all its data as a downloadable .arkonhex file.
 * @param {string} worldId — the UUID of the world to export
 */
export async function exportWorld(worldId) {
    const db = await openDB();

    // 1. Read world metadata
    const txWorld = db.transaction('worlds', 'readonly');
    const world = await promisifyRequest(txWorld.objectStore('worlds').get(worldId));
    if (!world) {
        throw new Error(`World ${worldId} not found`);
    }

    // 2. Read player state
    const txPlayer = db.transaction('player', 'readonly');
    const player = await promisifyRequest(txPlayer.objectStore('player').get(worldId));

    // 3. Read all waypoints for this world
    let waypoints = [];
    try {
        const txWp = db.transaction('waypoints', 'readonly');
        const wpIndex = txWp.objectStore('waypoints').index('worldId');
        waypoints = await promisifyRequest(wpIndex.getAll(worldId));
    } catch (e) {
        console.warn('[WorldExporter] Could not read waypoints:', e);
    }

    // 4. Read all chunks for this world
    const txChunks = db.transaction('chunks', 'readonly');
    const chunkIndex = txChunks.objectStore('chunks').index('worldId');
    const chunkRecords = await promisifyRequest(chunkIndex.getAll(worldId));

    // Convert chunk binary data to Base64 for JSON serialization
    const serializedChunks = chunkRecords.map(record => ({
        cq: record.cq,
        cr: record.cr,
        data: record.data ? uint8ToBase64(record.data) : null,
        lightData: record.lightData ? uint8ToBase64(record.lightData) : null,
        heightData: record.heightData ? uint8ToBase64(record.heightData) : null
    }));

    // 5. Assemble the export object
    const exportData = {
        version: EXPORT_VERSION,
        exportedAt: Date.now(),
        world: {
            name: world.name,
            seed: world.seed,
            createdAt: world.createdAt,
            lastPlayed: world.lastPlayed
        },
        player: player ? {
            position: player.position,
            rotation: player.rotation,
            timeOfDay: player.timeOfDay,
            cycleEnabled: player.cycleEnabled
        } : null,
        waypoints: waypoints.map(wp => ({
            name: wp.name,
            x: wp.x,
            y: wp.y,
            z: wp.z,
            color: wp.color,
            visible: wp.visible
        })),
        chunks: serializedChunks
    };

    // 6. Create Blob and trigger download
    const jsonStr = JSON.stringify(exportData);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${world.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.arkonhex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`[WorldExporter] Exported world "${world.name}" (${serializedChunks.length} chunks, ${waypoints.length} waypoints)`);
}

/**
 * Import a world from a .arkonhex file.
 * @param {File} file — the uploaded .arkonhex file
 * @returns {Promise<Object>} — the newly created world record
 */
export async function importWorld(file) {
    // 1. Read file contents
    const text = await file.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error('Invalid .arkonhex file: could not parse JSON');
    }

    if (!data.version || !data.world) {
        throw new Error('Invalid .arkonhex file: missing version or world data');
    }

    const db = await openDB();

    // 2. Generate a new UUID to avoid collisions
    const newWorldId = generateUUID();
    const now = Date.now();

    const worldRecord = {
        id: newWorldId,
        name: data.world.name + ' (Imported)',
        seed: data.world.seed,
        createdAt: data.world.createdAt || now,
        lastPlayed: now
    };

    // 3. Insert world metadata
    const txWorld = db.transaction('worlds', 'readwrite');
    txWorld.objectStore('worlds').put(worldRecord);
    await new Promise((resolve, reject) => {
        txWorld.oncomplete = resolve;
        txWorld.onerror = () => reject(txWorld.error);
    });

    // 4. Insert player state (if present)
    if (data.player) {
        const txPlayer = db.transaction('player', 'readwrite');
        txPlayer.objectStore('player').put({
            worldId: newWorldId,
            position: data.player.position,
            rotation: data.player.rotation,
            timeOfDay: data.player.timeOfDay,
            cycleEnabled: data.player.cycleEnabled
        });
        await new Promise((resolve, reject) => {
            txPlayer.oncomplete = resolve;
            txPlayer.onerror = () => reject(txPlayer.error);
        });
    }

    // 5. Insert waypoints (if present)
    if (data.waypoints && data.waypoints.length > 0) {
        const txWp = db.transaction('waypoints', 'readwrite');
        const wpStore = txWp.objectStore('waypoints');
        for (const wp of data.waypoints) {
            wpStore.put({
                id: generateUUID(),
                worldId: newWorldId,
                name: wp.name,
                x: wp.x,
                y: wp.y,
                z: wp.z,
                color: wp.color,
                visible: wp.visible !== undefined ? wp.visible : true
            });
        }
        await new Promise((resolve, reject) => {
            txWp.oncomplete = resolve;
            txWp.onerror = () => reject(txWp.error);
        });
    }

    // 6. Insert chunks (decode Base64 back to binary)
    if (data.chunks && data.chunks.length > 0) {
        // Insert in batches to avoid huge transactions
        const BATCH_SIZE = 100;
        for (let i = 0; i < data.chunks.length; i += BATCH_SIZE) {
            const batch = data.chunks.slice(i, i + BATCH_SIZE);
            const txChunks = db.transaction('chunks', 'readwrite');
            const chunkStore = txChunks.objectStore('chunks');

            for (const chunk of batch) {
                const key = `${newWorldId}:${chunk.cq}:${chunk.cr}`;
                chunkStore.put({
                    key: key,
                    worldId: newWorldId,
                    cq: chunk.cq,
                    cr: chunk.cr,
                    data: chunk.data ? base64ToUint8(chunk.data) : null,
                    lightData: chunk.lightData ? base64ToUint8(chunk.lightData) : null,
                    heightData: chunk.heightData ? base64ToUint8(chunk.heightData) : null
                });
            }

            await new Promise((resolve, reject) => {
                txChunks.oncomplete = resolve;
                txChunks.onerror = () => reject(txChunks.error);
            });
        }
    }

    console.log(`[WorldExporter] Imported world "${worldRecord.name}" with ${data.chunks?.length || 0} chunks`);
    return worldRecord;
}
