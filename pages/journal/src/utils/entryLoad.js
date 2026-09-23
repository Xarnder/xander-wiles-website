export const ENTRY_LOAD_TIMEOUT_MS = 12000;
export const ENTRY_LOAD_TIMEOUT_CODE = 'journal/entry-load-timeout';

export function isIOSFirestoreClient(userAgent = '', { platform = '', maxTouchPoints = 0 } = {}) {
    return /iPad|iPhone|iPod/.test(userAgent)
        || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/**
 * A cached "this day does not exist" snapshot is not proof the entry is empty.
 * Firestore can emit that before the server answers, and treating it as a new
 * entry can overwrite a real journal. A later cached copy is also ignored once
 * the entry is already on screen.
 */
export function isUsableEntrySnapshot(snapshot, { alreadyApplied = false } = {}) {
    if (!snapshot || typeof snapshot.exists !== 'function') return false;

    const fromCache = Boolean(snapshot.metadata?.fromCache);
    if (!snapshot.exists() && fromCache) return false;
    if (alreadyApplied && fromCache) return false;
    return true;
}

export function entryLoadErrorMessage(error) {
    if (error?.code === ENTRY_LOAD_TIMEOUT_CODE) {
        return 'This entry took too long to load. iOS may have paused the connection. Try again.';
    }
    return 'This entry could not be loaded. Check your connection and try again.';
}
