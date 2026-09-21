const MISSING_TITLE_REMINDER_KEY = 'journal-missing-title-reminder';
const MISSING_TITLE_REMINDER_CHANGE_EVENT = 'journal-missing-title-reminder-changed';

export function isMissingTitleReminderEnabled() {
    try {
        const stored = localStorage.getItem(MISSING_TITLE_REMINDER_KEY);
        // By default, this reminder popup is enabled
        return stored !== 'false';
    } catch {
        return true;
    }
}

export function setMissingTitleReminderEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    try {
        localStorage.setItem(MISSING_TITLE_REMINDER_KEY, String(nextEnabled));
        window.dispatchEvent(new CustomEvent(MISSING_TITLE_REMINDER_CHANGE_EVENT, { detail: nextEnabled }));
    } catch {
        // Ignore storage failures and keep the in-memory preference.
    }
}

export function subscribeMissingTitleReminder(callback) {
    const handler = (event) => callback(Boolean(event.detail));
    window.addEventListener(MISSING_TITLE_REMINDER_CHANGE_EVENT, handler);
    return () => window.removeEventListener(MISSING_TITLE_REMINDER_CHANGE_EVENT, handler);
}
