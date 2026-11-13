import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForServerSnapshot } from '../lib/serverSnapshot.js';
import { loadSearchIndex, SEARCH_BATCH_SIZE } from '../lib/searchIndex.js';

const doc = (id, title = 'Memory') => ({ id, data: () => ({ title }) });
const snapshot = (docs, fromCache = false) => ({ docs, metadata: { fromCache } });

function listener() {
    let next;
    let error;
    let subscriptions = 0;
    let unsubscriptions = 0;
    return {
        subscribe(onNext, onError) {
            subscriptions += 1;
            next = onNext;
            error = onError;
            return () => { unsubscriptions += 1; };
        },
        next: (value) => next(value),
        error: (value) => error(value),
        get subscriptions() { return subscriptions; },
        get unsubscriptions() { return unsubscriptions; }
    };
}

test('cache events do not end an online read, including a metadata-only server confirmation', async () => {
    const transport = listener();
    const docs = [doc('2026-11-11')];
    let settled = false;
    const reading = waitForServerSnapshot(transport.subscribe).then((value) => { settled = true; return value; });
    transport.next(snapshot([], true));
    transport.next(snapshot(docs, true));
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(transport.unsubscriptions, 0);
    const confirmed = snapshot(docs);
    transport.next(confirmed);
    assert.equal(await reading, confirmed);
    assert.equal(transport.unsubscriptions, 1);
    transport.next(snapshot([]));
    assert.equal(transport.unsubscriptions, 1);
});

test('an empty server result is complete, even after a stale cache event', async () => {
    const transport = listener();
    const reading = waitForServerSnapshot(transport.subscribe);
    transport.next(snapshot([doc('2026-11-11')], true));
    transport.next(snapshot([]));
    assert.deepEqual((await reading).docs, []);
    assert.equal(transport.unsubscriptions, 1);
});

test('aborting a suspended listener detaches it and ignores late events', async () => {
    const controller = new AbortController();
    const transport = listener();
    const reading = waitForServerSnapshot(transport.subscribe, controller.signal);
    controller.abort();
    await assert.rejects(reading, /cancelled/);
    assert.equal(transport.unsubscriptions, 1);
    transport.next(snapshot([doc('2026-11-11')]));
    transport.error(new Error('Late error'));
    assert.equal(transport.unsubscriptions, 1);
    await assert.rejects(waitForServerSnapshot(transport.subscribe, controller.signal), /cancelled/);
    assert.equal(transport.subscriptions, 1);
});

test('listener errors retain their code and detach the listener', async () => {
    const transport = listener();
    const error = Object.assign(new Error('Access denied'), { code: 'permission-denied' });
    const reading = waitForServerSnapshot(transport.subscribe);
    transport.error(error);
    await assert.rejects(reading, (actual) => actual === error);
    assert.equal(transport.unsubscriptions, 1);
});

test('synchronous results and subscription failures settle cleanly', async () => {
    let unsubscriptions = 0;
    const expected = snapshot([]);
    assert.equal(await waitForServerSnapshot((next) => {
        next(expected);
        return () => { unsubscriptions += 1; };
    }), expected);
    assert.equal(unsubscriptions, 1);
    await assert.rejects(waitForServerSnapshot(() => { throw new Error('Failed to subscribe'); }), /Failed to subscribe/);
});

test('a timed-out server read detaches, preserves searchable cache, and a fresh attempt recovers', async () => {
    const transport = listener();
    const cached = doc('2020-01-01', 'Cached memory');
    const updates = [];
    const options = {
        readCache: async () => snapshot([cached], true),
        readPage: (_, signal) => waitForServerSnapshot(transport.subscribe, signal),
        timeoutMs: 10, isCurrent: () => true, onUpdate: (state) => updates.push(state)
    };
    await loadSearchIndex(options);
    assert.equal(transport.unsubscriptions, 1);
    assert.equal(updates.at(-1).status, 'partial');
    assert.equal(updates.at(-1).entries[0].id, cached.id);
    assert.match(updates.at(-1).message, /took too long/);
    const updateCount = updates.length;
    transport.next(snapshot([]));
    await Promise.resolve();
    assert.equal(updates.length, updateCount);

    await loadSearchIndex({ ...options, readPage: async () => snapshot([cached, doc('2026-11-11')]) });
    assert.equal(updates.at(-1).status, 'ready');
    assert.equal(updates.at(-1).entries.length, 2);
});

test('server confirmation, not the size of a cache page, controls pagination', async () => {
    const docs = Array.from({ length: SEARCH_BATCH_SIZE + 1 }, (_, index) =>
        doc(new Date(Date.UTC(2026, 10, 11 - index)).toISOString().slice(0, 10)));
    let reads = 0;
    let detached = 0;
    const updates = [];
    await loadSearchIndex({
        readCache: async () => snapshot([docs.at(-1)], true),
        readPage: (cursor, signal) => waitForServerSnapshot((next) => {
            reads += 1;
            next(snapshot([], true));
            queueMicrotask(() => next(snapshot(cursor ? [docs.at(-1)] : docs.slice(0, SEARCH_BATCH_SIZE))));
            return () => { detached += 1; };
        }, signal),
        isCurrent: () => true, onUpdate: (state) => updates.push(state)
    });
    assert.equal(reads, 2);
    assert.equal(detached, 2);
    assert.equal(updates.at(-1).status, 'ready');
    assert.equal(updates.at(-1).entries.length, docs.length);
    assert.ok(updates.every(({ status }) => status !== 'partial'));
});

test('access and service errors are not mislabeled as being offline', async () => {
    for (const [code, message] of [['permission-denied', /signing in again/], ['firestore/unauthenticated', /signing in again/], ['resource-exhausted', /temporarily busy/], ['unavailable', /could not be reached/]]) {
        let state;
        await loadSearchIndex({
            readCache: async () => snapshot([]),
            readPage: async () => { throw Object.assign(new Error('Request failed'), { code }); },
            isCurrent: () => true, onUpdate: (next) => { state = next; }
        });
        assert.equal(state.status, 'error');
        assert.match(state.message, message);
    }
});
