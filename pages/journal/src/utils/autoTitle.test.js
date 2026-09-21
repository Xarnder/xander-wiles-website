import test from 'node:test';
import assert from 'node:assert/strict';

// Set up mock window and localStorage for Node testing environment
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

// Import autoTitle functions
const {
    isAutoTitleEnabled,
    setAutoTitleEnabled,
    subscribeAutoTitle
} = await import('../lib/autoTitle.js');

test('isAutoTitleEnabled returns false by default when not set', () => {
    localStorage.clear();
    assert.equal(isAutoTitleEnabled(), false);
});

test('setAutoTitleEnabled sets preference in localStorage and isAutoTitleEnabled reflects it', () => {
    localStorage.clear();
    setAutoTitleEnabled(true);
    assert.equal(isAutoTitleEnabled(), true);

    setAutoTitleEnabled(false);
    assert.equal(isAutoTitleEnabled(), false);
});

test('subscribeAutoTitle receives events when preference changes and unsubscribes cleanly', () => {
    localStorage.clear();
    const notifications = [];
    const unsubscribe = subscribeAutoTitle((enabled) => {
        notifications.push(enabled);
    });

    setAutoTitleEnabled(true);
    setAutoTitleEnabled(false);

    assert.deepEqual(notifications, [true, false]);

    unsubscribe();
    setAutoTitleEnabled(true);
    // Notification list should not have received the third update
    assert.deepEqual(notifications, [true, false]);
});
