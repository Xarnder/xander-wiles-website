const STICKY_HEADER_KEY = 'journal-sticky-writing-header';
const STICKY_HEADER_CHANGE_EVENT = 'journal-sticky-writing-header-changed';
const STICKY_SAVE_KEY = 'journal-sticky-save-button';
const STICKY_SAVE_CHANGE_EVENT = 'journal-sticky-save-button-changed';

function readEnabledFlag(key) {
    try {
        return localStorage.getItem(key) === 'true';
    } catch {
        return false;
    }
}

function writeEnabledFlag(key, eventName, enabled) {
    const nextEnabled = Boolean(enabled);
    try {
        localStorage.setItem(key, String(nextEnabled));
        window.dispatchEvent(new CustomEvent(eventName, { detail: nextEnabled }));
    } catch {
        // Ignore storage failures and keep the in-memory preference.
    }
}

function subscribeEnabledFlag(eventName, callback) {
    const handler = (event) => callback(Boolean(event.detail));
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
}

export function isStickyWritingHeaderEnabled() {
    return readEnabledFlag(STICKY_HEADER_KEY);
}

export function setStickyWritingHeaderEnabled(enabled) {
    writeEnabledFlag(STICKY_HEADER_KEY, STICKY_HEADER_CHANGE_EVENT, enabled);
}

export function subscribeStickyWritingHeader(callback) {
    return subscribeEnabledFlag(STICKY_HEADER_CHANGE_EVENT, callback);
}

export function isStickySaveButtonEnabled() {
    return readEnabledFlag(STICKY_SAVE_KEY);
}

export function setStickySaveButtonEnabled(enabled) {
    writeEnabledFlag(STICKY_SAVE_KEY, STICKY_SAVE_CHANGE_EVENT, enabled);
}

export function subscribeStickySaveButton(callback) {
    return subscribeEnabledFlag(STICKY_SAVE_CHANGE_EVENT, callback);
}
