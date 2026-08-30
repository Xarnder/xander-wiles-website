const DB_NAME = 'md-editor-settings';
const STORE = 'cache';
const KEY = 'lastGood';
const DB_VERSION = 1;

function openDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB unavailable'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

export async function saveLastGoodSettings(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    let db;
    try {
        db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore(STORE).put({ ...snapshot, cachedAt: Date.now() }, KEY);
        });
    } catch (err) {
        console.warn('[md-editor] settings cache write failed', err);
    } finally {
        try {
            db?.close();
        } catch {
            // ignore
        }
    }
}

export async function loadLastGoodSettings() {
    let db;
    try {
        db = await openDb();
        const value = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const request = tx.objectStore(STORE).get(KEY);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        return value && typeof value === 'object' ? value : null;
    } catch (err) {
        console.warn('[md-editor] settings cache read failed', err);
        return null;
    } finally {
        try {
            db?.close();
        } catch {
            // ignore
        }
    }
}
