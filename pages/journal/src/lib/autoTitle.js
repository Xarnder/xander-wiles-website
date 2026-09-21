const AUTO_TITLE_KEY = 'journal-auto-title-from-entry';
const AUTO_TITLE_CHANGE_EVENT = 'journal-auto-title-from-entry-changed';

export function isAutoTitleEnabled() {
    try {
        return localStorage.getItem(AUTO_TITLE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setAutoTitleEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    try {
        localStorage.setItem(AUTO_TITLE_KEY, String(nextEnabled));
        window.dispatchEvent(new CustomEvent(AUTO_TITLE_CHANGE_EVENT, { detail: nextEnabled }));
    } catch {
        // Ignore storage failures and keep the in-memory preference.
    }
}

export function subscribeAutoTitle(callback) {
    const handler = (event) => callback(Boolean(event.detail));
    window.addEventListener(AUTO_TITLE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(AUTO_TITLE_CHANGE_EVENT, handler);
}
