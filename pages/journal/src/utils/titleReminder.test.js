import test from 'node:test';
import assert from 'node:assert/strict';

// Mock window and localStorage for Node test environment
const store = new Map();
globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
        store.set(key, String(value));
    },
    removeItem: (key) => {
        store.delete(key);
    },
    clear: () => {
        store.clear();
    }
};

const listeners = new Map();
globalThis.window = {
    dispatchEvent: (event) => {
        const set = listeners.get(event.type);
        if (set) {
            for (const fn of set) {
                fn(event);
            }
        }
        return true;
    },
    addEventListener: (type, listener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
    },
    removeEventListener: (type, listener) => {
        if (listeners.has(type)) {
            listeners.get(type).delete(listener);
        }
    }
};

if (!globalThis.CustomEvent) {
    globalThis.CustomEvent = class CustomEvent {
        constructor(type, eventInitDict = {}) {
            this.type = type;
            this.detail = eventInitDict.detail;
        }
    };
}

const {
    isMissingTitleReminderEnabled,
    setMissingTitleReminderEnabled,
    subscribeMissingTitleReminder
} = await import('../lib/titleReminder.js');

test('isMissingTitleReminderEnabled returns true by default when not set', () => {
    localStorage.clear();
    assert.equal(isMissingTitleReminderEnabled(), true);
});

test('setMissingTitleReminderEnabled updates preference in localStorage', () => {
    localStorage.clear();
    setMissingTitleReminderEnabled(false);
    assert.equal(isMissingTitleReminderEnabled(), false);

    setMissingTitleReminderEnabled(true);
    assert.equal(isMissingTitleReminderEnabled(), true);
});

test('subscribeMissingTitleReminder notifies subscribers of changes and unsubscribes cleanly', () => {
    localStorage.clear();
    const notifications = [];
    const unsubscribe = subscribeMissingTitleReminder((enabled) => {
        notifications.push(enabled);
    });

    setMissingTitleReminderEnabled(false);
    setMissingTitleReminderEnabled(true);

    assert.deepEqual(notifications, [false, true]);

    unsubscribe();
    setMissingTitleReminderEnabled(false);
    assert.deepEqual(notifications, [false, true]);
});
