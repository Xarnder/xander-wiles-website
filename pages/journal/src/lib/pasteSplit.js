const PASTE_SPLIT_KEY = 'journal-paste-title-split';
const PASTE_SPLIT_CHANGE_EVENT = 'journal-paste-title-split-changed';

export function isPasteSplitEnabled() {
    try {
        return localStorage.getItem(PASTE_SPLIT_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setPasteSplitEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    try {
        localStorage.setItem(PASTE_SPLIT_KEY, String(nextEnabled));
        window.dispatchEvent(new CustomEvent(PASTE_SPLIT_CHANGE_EVENT, { detail: nextEnabled }));
    } catch {
        // Ignore storage failures and keep the in-memory preference.
    }
}

export function subscribePasteSplit(callback) {
    const handler = (event) => callback(Boolean(event.detail));
    window.addEventListener(PASTE_SPLIT_CHANGE_EVENT, handler);
    return () => window.removeEventListener(PASTE_SPLIT_CHANGE_EVENT, handler);
}

// Split once: subsequent hyphens and line breaks belong to the entry body.
export function splitPastedEntry(text) {
    const separator = text.indexOf('-');
    if (separator < 0) return null;
    const title = text.slice(0, separator).trim();
    const content = text.slice(separator + 1).trim();
    return title && content ? { title, content } : null;
}
