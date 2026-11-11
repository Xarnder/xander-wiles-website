import { normalizeSearchEntry } from '../utils/journalSearch.js';

// Keep individual downloads small enough for a mobile connection to make progress.
export const SEARCH_BATCH_SIZE = 100;
const PARTIAL_MESSAGE = 'Only downloaded entries are searchable right now.';

function withTimeout(read, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        let settled = false;
        const onAbort = () => finish(reject, new Error('Search loading cancelled.'));
        const timer = setTimeout(() => finish(reject, Object.assign(new Error('Search loading timed out.'), { code: 'search/timeout' })), timeoutMs);
        function finish(settle, value) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            // End the actual Firestore listener, including when a deadline expires.
            controller.abort();
            settle(value);
        }
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) { onAbort(); return; }
        try {
            Promise.resolve(read(controller.signal)).then((value) => finish(resolve, value), (error) => finish(reject, error));
        } catch (error) {
            finish(reject, error);
        }
    });
}

function failureMessage(error) {
    switch (error?.code?.replace(/^firestore\//, '')) {
        case 'permission-denied':
        case 'unauthenticated':
            return 'Search could not access your journal. Try signing out and signing in again.';
        case 'resource-exhausted':
            return 'The journal service is temporarily busy. Please retry shortly.';
        case 'search/timeout':
        case 'deadline-exceeded':
            return 'Loading your full journal took too long. Please retry.';
        case 'unavailable':
            return 'The journal service could not be reached. Check your connection and retry.';
        default:
            return 'Your full journal could not be loaded. Please retry.';
    }
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
    timeoutMs = 30000, cacheTimeoutMs = 1500, yieldControl = yieldToBrowser
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
        const snapshot = await withTimeout(readCache, cacheTimeoutMs, signal);
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
            const snapshot = await withTimeout((pageSignal) => readPage(cursor, pageSignal), timeoutMs, signal);
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
                publish('partial', available.values(), `${PARTIAL_MESSAGE} Please retry to load the rest.`);
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
    } catch (error) {
        if (!current()) return;
        publish(available.size ? 'partial' : 'error', available.values(), available.size
            ? `${PARTIAL_MESSAGE} ${failureMessage(error)}`
            : failureMessage(error));
    }
}
