import { normalizeSearchEntry } from '../utils/journalSearch.js';

export const SEARCH_BATCH_SIZE = 500;
const PARTIAL_MESSAGE = 'Only downloaded entries are searchable right now. Reconnect and retry to search your whole journal.';

function withTimeout(promise, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
        const onAbort = () => finish(reject, new Error('Search loading cancelled.'));
        const timer = setTimeout(() => finish(reject, new Error('Search loading timed out.')), timeoutMs);
        function finish(settle, value) {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            settle(value);
        }
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
        Promise.resolve(promise).then((value) => finish(resolve, value), (error) => finish(reject, error));
    });
}

const sorted = (entries) => [...entries].sort((a, b) => b.id.localeCompare(a.id));
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mapDocs(docs, isCurrent, yieldControl) {
    const entries = [];
    for (let index = 0; index < docs.length; index += 1) {
        if (!isCurrent()) return null;
        const entry = normalizeSearchEntry(docs[index]);
        if (entry) entries.push(entry);
        // Large cached journals must leave time for input, painting and navigation.
        if ((index + 1) % 100 === 0 && index + 1 < docs.length) await yieldControl();
    }
    return isCurrent() ? entries : null;
}

// Transport-independent so timeout, pagination and interrupted refreshes can be tested.
export async function loadSearchIndex({
    readCache, readPage, onUpdate, isCurrent, signal, initialEntries = [],
    timeoutMs = 12000, cacheTimeoutMs = 1500, yieldControl = yieldToBrowser
}) {
    const current = () => isCurrent() && !signal?.aborted;
    const available = new Map(initialEntries.map((entry) => [entry.id, entry]));
    const downloaded = new Map();
    const publish = (status, entries, message = '') => {
        if (current()) onUpdate({ status, entries: sorted(entries), message });
    };
    if (!current()) return;
    publish('loading', available.values());

    try {
        const snapshot = await withTimeout(readCache(), cacheTimeoutMs, signal);
        if (!current()) return;
        const cached = await mapDocs(snapshot.docs, current, yieldControl);
        if (!cached) return;
        for (const entry of cached) {
            if (!available.has(entry.id)) available.set(entry.id, entry);
        }
        publish('loading', available.values());
    } catch {
        // Missing or unavailable cache must never prevent the server request.
        if (!current()) return;
    }

    try {
        let cursor = null;
        while (current()) {
            const snapshot = await withTimeout(readPage(cursor), timeoutMs, signal);
            if (!current()) return;
            const nextCursor = snapshot.docs.at(-1);
            if (nextCursor && (typeof nextCursor.id !== 'string' || (cursor && nextCursor.id >= cursor.id))) {
                throw new Error('Search pagination did not advance.');
            }
            const batch = await mapDocs(snapshot.docs, current, yieldControl);
            if (!batch) return;
            for (const entry of batch) {
                downloaded.set(entry.id, entry);
                available.set(entry.id, entry);
            }
            if (snapshot.metadata?.fromCache) {
                publish('partial', available.values(), PARTIAL_MESSAGE);
                return;
            }
            if (snapshot.docs.length < SEARCH_BATCH_SIZE) {
                // Only a completed server read can remove stale/deleted cached entries.
                publish('ready', downloaded.values());
                return;
            }
            cursor = nextCursor;
            publish('loading', available.values());
        }
    } catch {
        if (!current()) return;
        publish(available.size ? 'partial' : 'error', available.values(), available.size
            ? PARTIAL_MESSAGE
            : 'Your journal could not be loaded for search. Check your connection and try again.');
    }
}
