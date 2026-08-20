const SHOW_IMAGE_COUNTS_KEY = 'journal-show-calendar-image-counts';
const IMAGE_COUNTS_CHANGE_EVENT = 'journal-show-calendar-image-counts-changed';
const SHOW_TAG_DOTS_KEY = 'journal-show-calendar-tag-dots';
const TAG_DOTS_CHANGE_EVENT = 'journal-show-calendar-tag-dots-changed';

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

export function areCalendarImageCountsEnabled() {
    return readEnabledFlag(SHOW_IMAGE_COUNTS_KEY);
}

export function setCalendarImageCountsEnabled(enabled) {
    writeEnabledFlag(SHOW_IMAGE_COUNTS_KEY, IMAGE_COUNTS_CHANGE_EVENT, enabled);
}

export function subscribeCalendarImageCounts(callback) {
    return subscribeEnabledFlag(IMAGE_COUNTS_CHANGE_EVENT, callback);
}

export function areCalendarTagDotsEnabled() {
    return readEnabledFlag(SHOW_TAG_DOTS_KEY);
}

export function setCalendarTagDotsEnabled(enabled) {
    writeEnabledFlag(SHOW_TAG_DOTS_KEY, TAG_DOTS_CHANGE_EVENT, enabled);
}

export function subscribeCalendarTagDots(callback) {
    return subscribeEnabledFlag(TAG_DOTS_CHANGE_EVENT, callback);
}
