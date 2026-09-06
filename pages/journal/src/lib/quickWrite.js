const FILL_OLDEST_EMPTY_KEY = 'journal-quick-write-fill-oldest-empty';
const FILL_OLDEST_EMPTY_CHANGE_EVENT = 'journal-quick-write-fill-oldest-empty-changed';

export function isQuickWriteFillOldestEmptyEnabled() {
    try {
        return localStorage.getItem(FILL_OLDEST_EMPTY_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setQuickWriteFillOldestEmptyEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    try {
        localStorage.setItem(FILL_OLDEST_EMPTY_KEY, String(nextEnabled));
        window.dispatchEvent(new CustomEvent(FILL_OLDEST_EMPTY_CHANGE_EVENT, { detail: nextEnabled }));
    } catch {
        // Ignore storage failures and keep the in-memory preference.
    }
}

export function subscribeQuickWriteFillOldestEmpty(callback) {
    const handler = (event) => callback(Boolean(event.detail));
    window.addEventListener(FILL_OLDEST_EMPTY_CHANGE_EVENT, handler);
    return () => window.removeEventListener(FILL_OLDEST_EMPTY_CHANGE_EVENT, handler);
}
