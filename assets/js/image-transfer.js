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
 * Saves multiple blobs to IndexedDB.
 * @param {Object} blobMap - Map of keys to blobs
 */
async function saveTransferImages(blobMap) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        // Clear previous transfers first
        store.clear();

        for (const [key, blob] of Object.entries(blobMap)) {
            store.put(blob, key);
        }
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Retrieves all transferred images from IndexedDB.
 * @returns {Promise<Object>} - Map of keys to blobs
 */
async function getTransferImages() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        const keysRequest = store.getAllKeys();
        
        tx.oncomplete = () => {
            const results = {};
            keysRequest.result.forEach((key, i) => {
                results[key] = request.result[i];
            });
            resolve(results);
        };
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Saves a single blob to IndexedDB (legacy support/convenience).
 */
async function saveTransferImage(blob) {
    return saveTransferImages({ 'transferImage': blob });
}

/**
 * Retrieves a single transferred image blob from IndexedDB (legacy support).
 */
async function getTransferImage() {
    const images = await getTransferImages();
    return images['transferImage'] || null;
}

/**
 * Clears all transferred images from IndexedDB.
 */
async function clearTransferImages() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Export functions to window for easy access in non-module scripts
window.ImageTransfer = {
    save: saveTransferImage,
    saveMultiple: saveTransferImages,
    get: getTransferImage,
    getAll: getTransferImages,
    clear: clearTransferImages
};
