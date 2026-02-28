/**
 * ArkonhexDB — IndexedDB wrapper for persistent world storage.
 * 
 * Database: arconhex_worlds (v1)
 * Stores:
 *   - worlds:  keyPath "id"      — world metadata
 *   - chunks:  keyPath "key"     — chunk block data (RLE compressed)
 *   - player:  keyPath "worldId" — player state per world
 */

const DB_NAME = 'arconhex_worlds';
const DB_VERSION = 2;

let _dbPromise = null;

/**
 * Opens (or creates) the ArkonhexDB database.
 * Returns a cached promise so multiple callers share the same connection.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[ArkonhexDB] Failed to open database:', request.error);
            reject(request.error);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Worlds store — one entry per world
            if (!db.objectStoreNames.contains('worlds')) {
                db.createObjectStore('worlds', { keyPath: 'id' });
            }

            // Chunks store — one entry per modified chunk, keyed "worldId:cq:cr"
            if (!db.objectStoreNames.contains('chunks')) {
                const chunkStore = db.createObjectStore('chunks', { keyPath: 'key' });
                chunkStore.createIndex('worldId', 'worldId', { unique: false });
            }

            // Player store — one entry per world
            if (!db.objectStoreNames.contains('player')) {
                db.createObjectStore('player', { keyPath: 'worldId' });
            }

            // Waypoints store — per-world waypoint markers
            if (!db.objectStoreNames.contains('waypoints')) {
                const wpStore = db.createObjectStore('waypoints', { keyPath: 'id' });
                wpStore.createIndex('worldId', 'worldId', { unique: false });
            }
        };

        request.onsuccess = () => {
            console.log('[ArkonhexDB] Database opened successfully');
            resolve(request.result);
        };
    });

    return _dbPromise;
}

/**
 * Helper: wraps an IDBRequest in a Promise.
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
export function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Helper: wraps an IDBTransaction completion in a Promise.
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
export function promisifyTransaction(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
}
