/**
 * ChunkStorage — Persists modified chunk data to IndexedDB with RLE compression.
 */

import { openDB, promisifyRequest } from './ArkonhexDB.js';
import { rleEncode, rleDecode } from './RLECodec.js';

const CHUNK_VOLUME = 16 * 16 * 64; // 16,384 blocks per chunk

/**
 * Build the composite key for a chunk.
 * @param {string} worldId
 * @param {number} cq
 * @param {number} cr
 * @returns {string}
 */
function chunkKey(worldId, cq, cr) {
    return `${worldId}:${cq}:${cr}`;
}

/**
 * Save a chunk's block data to IndexedDB (RLE compressed).
 * @param {string} worldId
 * @param {number} cq
 * @param {number} cr
 * @param {Uint8Array} blocks — raw block array (16,384 bytes)
 */
export async function saveChunk(worldId, cq, cr, blocks) {
    const db = await openDB();
    const compressed = rleEncode(blocks);

    const record = {
        key: chunkKey(worldId, cq, cr),
        worldId,
        cq,
        cr,
        data: compressed
    };

    const tx = db.transaction('chunks', 'readwrite');
    tx.objectStore('chunks').put(record);
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Load a chunk's block data from IndexedDB.
 * @param {string} worldId
 * @param {number} cq
 * @param {number} cr
 * @returns {Promise<Uint8Array|null>} Decompressed block array, or null if not saved
 */
export async function loadChunk(worldId, cq, cr) {
    const db = await openDB();
    const tx = db.transaction('chunks', 'readonly');
    const record = await promisifyRequest(
        tx.objectStore('chunks').get(chunkKey(worldId, cq, cr))
    );

    if (!record || !record.data) return null;

    return rleDecode(new Uint8Array(record.data), CHUNK_VOLUME);
}

/**
 * Delete all chunks belonging to a world.
 * @param {string} worldId
 */
export async function deleteWorldChunks(worldId) {
    const db = await openDB();
    const tx = db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    const index = store.index('worldId');

    const keys = await promisifyRequest(index.getAllKeys(worldId));
    for (const key of keys) {
        store.delete(key);
    }

    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Estimate the compressed storage size of all chunks for a world (in bytes).
 * @param {string} worldId
 * @returns {Promise<number>} Total bytes used
 */
export async function getWorldStorageSize(worldId) {
    const db = await openDB();
    const tx = db.transaction('chunks', 'readonly');
    const index = tx.objectStore('chunks').index('worldId');
    const records = await promisifyRequest(index.getAll(worldId));

    let totalBytes = 0;
    for (const record of records) {
        if (record.data) {
            totalBytes += record.data.byteLength || record.data.length || 0;
        }
    }
    return totalBytes;
}
