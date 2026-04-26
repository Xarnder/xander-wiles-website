/**
 * image-transfer.js
 * A simple utility to transfer large images between pages using IndexedDB.
 */

const DB_NAME = 'ImageTransferDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Saves a blob to IndexedDB.
 * @param {Blob} blob 
 */
async function saveTransferImage(blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(blob, 'transferImage');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieves the transferred image blob from IndexedDB.
 * @returns {Promise<Blob|null>}
 */
async function getTransferImage() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get('transferImage');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clears the transferred image from IndexedDB.
 */
async function clearTransferImage() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete('transferImage');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Export functions to window for easy access in non-module scripts
window.ImageTransfer = {
    save: saveTransferImage,
    get: getTransferImage,
    clear: clearTransferImage
};
