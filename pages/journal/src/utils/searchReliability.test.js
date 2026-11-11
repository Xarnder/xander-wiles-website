import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearchEntry, filterSearchEntries, searchSnippet, highlightSearchText } from './journalSearch.js';
import { loadSearchIndex, SEARCH_BATCH_SIZE } from '../lib/searchIndex.js';

const doc = (id, data) => ({ id, data: () => data });
const snapshot = (docs, fromCache = false) => ({ docs, metadata: { fromCache } });
const normalize = (data, id = '2026-11-11') => normalizeSearchEntry(doc(id, data));
const noWait = async () => {};

test('exact phrase requires adjacent words in order; non-exact retains any-word matching', () => {
    const entries = [
        { content: 'The GOLDEN sunset was beautiful.' },
        { content: 'Sunset came after the golden afternoon.' },
        { title: 'Golden light' },
        { images: [{ caption: 'Sunset' }] },
        { title: 'Golden', subEntries: { extra: { content: 'sunset' } } },
        { content: 'No matching words here.' }
    ].map((data, index) => normalize(data, `2026-11-0${index + 1}`));
    const exact = filterSearchEntries(entries, 'golden sunset', 'phrase');
    assert.deepEqual(exact.map(({ id }) => id), ['2026-11-01']);
    assert.equal(filterSearchEntries(entries, 'golden sunset', 'any').length, 5);
    assert.equal(filterSearchEntries(entries, 'sunset golden golden', 'any').length, 5);
    const before = JSON.stringify(entries);
    for (let index = 0; index < 30; index += 1) {
        assert.equal(filterSearchEntries(entries, 'golden sunset', index % 2 ? 'any' : 'phrase').length, index % 2 ? 5 : 1);
    }
    assert.equal(JSON.stringify(entries), before);
});

test('phrase matching and highlighting agree across whitespace and visible Markdown', () => {
    for (const content of [
        'A long\nwalk by the sea', 'A long\r\nwalk by the sea', 'A long\t  walk by the sea',
        'A long\u00a0walk by the sea', 'A long **walk** by the sea', 'A **long** _walk_ by the sea',
        'A long [walk](https://example.test) by the sea', 'A long `walk` by the sea'
    ]) {
        const result = filterSearchEntries([normalize({ content })], '  LONG   walk  ', 'phrase');
        assert.equal(result.length, 1, content);
        const snippet = searchSnippet(result[0].matches[0].text, 'long walk', 'phrase');
        assert.deepEqual(highlightSearchText(snippet.text, 'long walk', 'phrase').filter(({ match }) => match)
            .map(({ text }) => text.toLowerCase()), ['long walk'], content);
    }
    for (const content of ['A long, walk', 'A long scenic walk', 'A walk long']) {
        assert.equal(filterSearchEntries([normalize({ content })], 'long walk', 'phrase').length, 0, content);
    }
});

test('normalization keeps punctuation literal and uses consistent Unicode matching and highlighting', () => {
    for (const [content, query] of [['Learning C++', 'c++'], ['Saved file_name', 'file_name'], ['Use #tag', '#tag'], ['A [test]', '[test]'], ['CAFÉ', 'cafe\u0301'], ['Cafe\u0301', 'CAFÉ'], ['İstanbul', 'İSTANBUL'], ['İstanbul', 'i']]) {
        const result = filterSearchEntries([normalize({ content })], query, 'phrase');
        assert.equal(result.length, 1, query);
        const preview = searchSnippet(content, query, 'phrase');
        const parts = highlightSearchText(preview.text, query, 'phrase');
        assert.ok(parts.some(({ match }) => match), query);
        assert.equal(parts.map(({ text }) => text).join(''), preview.text);
    }
    assert.equal(filterSearchEntries([normalize({ content: 'file_name C++ #tag' })], 'filename', 'phrase').length, 0);
    assert.equal(filterSearchEntries([normalize({ content: 'ordinary text' })], '.*', 'any').length, 0);
    assert.equal(filterSearchEntries([normalize({ content: 'ordinary text' })], '\n\t  ', 'any').length, 0);
});

test('normalized phrases still cannot span distinct fields and respect selected sources', () => {
    const entry = normalize({ title: 'long', content: 'walk', images: [{ caption: 'long' }, { caption: 'walk' }],
        subEntries: { one: { title: 'long', content: 'walk' }, two: { content: 'long\n**walk**' } } });
    assert.equal(filterSearchEntries([entry], 'long walk', 'phrase', { sources: ['captions', 'title', 'content', 'section-title'] }).length, 0);
    const result = filterSearchEntries([entry], 'long walk', 'phrase', { sources: ['section-content'] });
    assert.equal(result.length, 1);
    assert.equal(result[0].matches.length, 1);
    assert.equal(result[0].matches[0].key, 'section-content-two');
});

function largeJournal(count) {
    const body = 'A quiet afternoon walking along the river with a friend. '.repeat(80);
    return Array.from({ length: count }, (_, index) => doc(new Date(Date.UTC(2026, 10, 11 - index)).toISOString().slice(0, 10), {
        title: `Memory ${index}`, content: body,
        images: [{ caption: index === count - 1 ? 'A rare\n**silver** comet' : 'The evening sky' }],
        subEntries: { reflection: { title: 'Gratitude', content: 'Thinking about a good day.' } }
    }));
}

for (const count of [2501, 5000]) {
    test(`loads all ${count} entries, including the oldest match beyond multiple pages`, async (t) => {
        const docs = largeJournal(count);
        const indexById = new Map(docs.map((entry, index) => [entry.id, index]));
        let calls = 0;
        let state;
        const started = performance.now();
        await loadSearchIndex({
            readCache: async () => snapshot([]),
            readPage: async (cursor) => {
                calls += 1;
                const start = cursor ? indexById.get(cursor.id) + 1 : 0;
                return snapshot(docs.slice(start, start + SEARCH_BATCH_SIZE));
            }, isCurrent: () => true, yieldControl: noWait, onUpdate: (next) => { state = next; }
        });
        assert.equal(calls, Math.floor(count / SEARCH_BATCH_SIZE) + 1);
        assert.equal(state.status, 'ready');
        assert.equal(state.entries.length, count);
        assert.equal(new Set(state.entries.map(({ id }) => id)).size, count);
        const searchStarted = performance.now();
        assert.equal(filterSearchEntries(state.entries, 'river missingword', 'any').length, count);
        assert.equal(filterSearchEntries(state.entries, 'missingword river', 'phrase').length, 0);
        const oldest = filterSearchEntries(state.entries, 'rare silver comet', 'phrase', { sources: ['captions'] });
        assert.equal(oldest.length, 1);
        assert.equal(oldest[0].id, docs.at(-1).id);
        assert.equal(filterSearchEntries(state.entries, '', 'any', { startDate: docs.at(-1).id, endDate: docs.at(-1).id }).length, 1);
        t.diagnostic(`${count} entries: index ${Math.round(searchStarted - started)} ms; four searches ${Math.round(performance.now() - searchStarted)} ms on this host`);
    });
}

test('a failed later page keeps both fresh and older cached results, and retry keeps them visible', async () => {
    const docs = largeJournal(2501);
    const oldest = normalizeSearchEntry(docs.at(-1));
    let state;
    let calls = 0;
    await loadSearchIndex({
        readCache: async () => snapshot([docs.at(-1)]),
        readPage: async () => {
            if (calls === 4) throw new Error('Connection interrupted');
            return snapshot(docs.slice(calls++ * SEARCH_BATCH_SIZE, calls * SEARCH_BATCH_SIZE));
        }, isCurrent: () => true, yieldControl: noWait, onUpdate: (next) => { state = next; }
    });
    assert.equal(state.status, 'partial');
    assert.equal(state.entries.length, 4 * SEARCH_BATCH_SIZE + 1);
    assert.equal(filterSearchEntries(state.entries, 'rare silver comet', 'phrase')[0].id, oldest.id);
    const saved = state.entries;
    const updates = [];
    calls = 0;
    await loadSearchIndex({
        initialEntries: saved, readCache: async () => snapshot([]),
        readPage: async () => snapshot(docs.slice(calls++ * SEARCH_BATCH_SIZE, calls * SEARCH_BATCH_SIZE)),
        isCurrent: () => true, yieldControl: noWait, onUpdate: (next) => updates.push(next)
    });
    assert.ok(updates.every(({ entries }) => entries.length >= saved.length));
    assert.equal(updates.at(-1).status, 'ready');
    assert.equal(updates.at(-1).entries.length, docs.length);
});

test('repeated or cycling server pages stop with recoverable partial results', { timeout: 1000 }, async () => {
    const docs = largeJournal(2 * SEARCH_BATCH_SIZE);
    let calls = 0;
    let state;
    await loadSearchIndex({
        readCache: async () => snapshot([]),
        readPage: async () => snapshot(calls++ % 2 === 0 ? docs.slice(0, SEARCH_BATCH_SIZE) : docs.slice(SEARCH_BATCH_SIZE)),
        isCurrent: () => true, yieldControl: noWait, onUpdate: (next) => { state = next; }
    });
    assert.equal(calls, 3);
    assert.equal(state.status, 'partial');
    assert.equal(state.entries.length, 2 * SEARCH_BATCH_SIZE);
});

test('cancelling a stalled read exits promptly and never publishes a late error', { timeout: 1000 }, async () => {
    const controller = new AbortController();
    const updates = [];
    const loading = loadSearchIndex({
        readCache: () => new Promise(() => {}), readPage: async () => { throw new Error('Must not read after cancellation'); },
        signal: controller.signal, cacheTimeoutMs: 60000,
        isCurrent: () => true, onUpdate: (next) => updates.push(next)
    });
    controller.abort();
    await loading;
    assert.equal(updates.length, 1);
    assert.equal(updates[0].status, 'loading');
});

test('large cache normalization yields and cancels when navigation supersedes it', async () => {
    const docs = largeJournal(2501);
    let active = true;
    let yields = 0;
    let serverReads = 0;
    const updates = [];
    await loadSearchIndex({
        readCache: async () => snapshot(docs), readPage: async () => { serverReads += 1; return snapshot([]); },
        isCurrent: () => active,
        yieldControl: async () => { yields += 1; active = false; },
        onUpdate: (next) => updates.push(next)
    });
    assert.equal(yields, 1);
    assert.equal(serverReads, 0);
    assert.equal(updates.length, 1);
});
