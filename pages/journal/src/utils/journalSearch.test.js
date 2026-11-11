import assert from 'node:assert/strict';
import test from 'node:test';
import {
    normalizeSearchEntry, filterSearchEntries, cleanSearchTitle, searchSnippet,
    ALL_SEARCH_SOURCES, readSearchFilters, searchFilterErrors, highlightSearchText, searchResultTitle
} from './journalSearch.js';
import { loadSearchIndex, SEARCH_BATCH_SIZE } from '../lib/searchIndex.js';

const entryDoc = (id, data = {}) => ({ id, data: () => data });
const snapshot = (docs, fromCache = false) => ({ docs, metadata: { fromCache } });
const never = () => new Promise(() => {});

test('normalizes malformed fields and trusts the document date, not a stored id', () => {
    const entry = normalizeSearchEntry(entryDoc('2026-11-11', {
        id: 'wrong', title: {}, content: [], subEntries: { a: { title: 42, content: { broken: true } }, b: null }
    }));
    assert.equal(entry.id, '2026-11-11');
    assert.equal(entry.content, '');
    assert.equal(cleanSearchTitle(entry.title), 'Untitled');
    for (const id of ['oops', '2026-02-30', '2026-13-01', '2026-1-01']) {
        assert.equal(normalizeSearchEntry(entryDoc(id)), null);
    }
});

test('searches titles and subentries with any-word, trimmed phrase and year filters', () => {
    const entries = [
        normalizeSearchEntry(entryDoc('2026-11-11', { title: 'Coast', subEntries: { a: { title: 'Morning', content: 'A long walk' } } })),
        normalizeSearchEntry(entryDoc('2025-01-01', { content: 'A walk in town' }))
    ];
    assert.equal(filterSearchEntries(entries, 'coast town').length, 2);
    assert.equal(filterSearchEntries(entries, '  LONG walk  ', 'phrase').length, 1);
    assert.equal(filterSearchEntries(entries, 'walk', 'any', { startDate: '2025-01-01', endDate: '2025-12-31' })[0].id, '2025-01-01');
    assert.equal(filterSearchEntries(entries, 'walk long', 'phrase').length, 0);
    assert.deepEqual(filterSearchEntries(entries, '   '), []);
    assert.match(searchSnippet(entries[0].fields.find((field) => field.source === 'section-content').text, 'long walk', 'phrase').text, /long walk/);
});

const searchableEntries = [
    normalizeSearchEntry(entryDoc('2026-11-11', {
        title: 'Mountain holiday', content: 'We walked by the river.',
        images: [{ caption: 'Golden sunset over the lake', url: 'private-image-url' }, { caption: 'Another golden sunset' }],
        subEntries: { gratitude: { title: 'A kind friend', content: 'Grateful for a shared meal.' }, dreams: { title: 'Flying', content: 'I saw an emerald dragon.' } }
    })),
    normalizeSearchEntry(entryDoc('2025-01-01', { title: 'Golden sunset', content: 'Mountain weather', images: [{ caption: 'River walk' }] }))
];

test('default search includes image captions and every sub-journal title and text', () => {
    for (const query of ['lake', 'kind friend', 'shared meal', 'emerald dragon']) {
        assert.equal(filterSearchEntries(searchableEntries, query, 'phrase')[0].id, '2026-11-11');
    }
    assert.deepEqual(filterSearchEntries(searchableEntries, 'private-image-url'), []);
});

test('caption-only and title-only searches exclude matches in unselected areas', () => {
    const captions = filterSearchEntries(searchableEntries, 'golden sunset', 'phrase', { sources: ['captions'] });
    assert.equal(captions.length, 1);
    assert.equal(captions[0].id, '2026-11-11');
    assert.deepEqual(captions[0].matches.map((match) => match.label), ['Image caption 1', 'Image caption 2']);
    assert.match(searchSnippet(captions[0].matches[0].text, 'golden sunset', 'phrase').text, /Golden sunset/);
    assert.equal(filterSearchEntries(searchableEntries, 'golden sunset', 'phrase', { sources: ['title', 'section-title'] })[0].id, '2025-01-01');
    assert.equal(filterSearchEntries(searchableEntries, 'kind friend', 'phrase', { sources: ['title', 'section-title'] }).length, 1);
    assert.deepEqual(filterSearchEntries(searchableEntries, 'kind friend', 'phrase', { sources: ['title'] }), []);
    assert.deepEqual(filterSearchEntries(searchableEntries, 'river', 'any', { sources: ['title', 'section-title'] }), []);
});

test('custom source combinations and source-only browsing remain restricted', () => {
    const filters = { sources: ['captions', 'section-content'] };
    assert.equal(filterSearchEntries(searchableEntries, 'lake emerald', 'any', filters)[0].matches.length, 2);
    assert.deepEqual(filterSearchEntries(searchableEntries, 'holiday', 'any', filters), []);
    assert.equal(filterSearchEntries(searchableEntries, '', 'any', { sources: ['section-content'] }).length, 1);
    assert.deepEqual(filterSearchEntries(searchableEntries, 'sunset', 'any', { sources: [] }), []);
    assert.deepEqual(filterSearchEntries(searchableEntries, 'sunset', 'any', { sources: ['unknown'] }), []);
});

test('date ranges include both boundary days and work with no words or one boundary', () => {
    const entries = ['2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02'].map((id) => normalizeSearchEntry(entryDoc(id, { content: 'Leap year' })));
    const range = { startDate: '2024-02-29', endDate: '2024-03-01' };
    assert.deepEqual(filterSearchEntries(entries, '', 'any', range).map((entry) => entry.id), ['2024-02-29', '2024-03-01']);
    assert.equal(filterSearchEntries(entries, 'leap', 'any', { startDate: '2024-03-01' }).length, 2);
    assert.equal(filterSearchEntries(entries, 'leap', 'any', { endDate: '2024-02-29' }).length, 2);
    assert.equal(filterSearchEntries(entries, '', 'any', { startDate: '2024-02-29', endDate: '2024-02-29' }).length, 1);
    const photoOnly = normalizeSearchEntry(entryDoc('2024-02-29', { images: [{ url: 'image-without-caption' }] }));
    assert.equal(filterSearchEntries([photoOnly], '', 'any', range).length, 1);
    assert.equal(filterSearchEntries([photoOnly], '', 'any', { ...range, sources: ['captions'] }).length, 0);
});

test('invalid and reversed date ranges report errors instead of searching all dates', () => {
    for (const range of [
        { startDate: '2026-02-29' }, { endDate: 'invalid' }, { startDate: '2026-11-12', endDate: '2026-11-11' }
    ]) {
        assert.ok(searchFilterErrors(range).dates);
        assert.deepEqual(filterSearchEntries(searchableEntries, 'sunset', 'any', range), []);
    }
    assert.equal(searchFilterErrors({ startDate: '2024-02-29', endDate: '2024-02-29' }).dates, '');
    assert.match(searchFilterErrors({ sources: [] }).sources, /at least one/);
});

test('date and field restrictions apply together', () => {
    const result = filterSearchEntries(searchableEntries, 'river', 'any', {
        sources: ['captions'], startDate: '2025-01-01', endDate: '2025-01-01'
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, '2025-01-01');
    assert.equal(filterSearchEntries(searchableEntries, 'river', 'any', { sources: ['captions'], startDate: '2026-01-01' }).length, 0);
});

test('exact phrases cannot cross between image captions, titles, or sub-journal sections', () => {
    const entry = normalizeSearchEntry(entryDoc('2026-11-11', {
        title: 'red', content: 'balloon', images: [{ caption: 'green' }, { caption: 'kite' }],
        subEntries: { one: { title: 'blue', content: 'bird' }, two: { content: 'song' } }
    }));
    for (const phrase of ['red balloon', 'green kite', 'blue bird', 'bird song']) {
        assert.deepEqual(filterSearchEntries([entry], phrase, 'phrase'), []);
    }
});

test('malformed captions and sub-journals do not crash indexing or create matches', () => {
    for (const images of [null, {}, [null, 'url', { caption: {} }, { caption: 32 }, { caption: 'Valid caption' }]]) {
        const entry = normalizeSearchEntry(entryDoc('2026-11-11', {
            images, subEntries: { bad: null, weird: { title: [], content: {} }, good: { content: 'Safe section' } }
        }));
        assert.equal(filterSearchEntries([entry], 'Safe section', 'phrase').length, 1);
        assert.equal(filterSearchEntries([entry], '[object Object]', 'phrase').length, 0);
    }
});

test('URL filters preserve scoped searches, empty selections, open ranges and legacy years', () => {
    assert.deepEqual(readSearchFilters(new URLSearchParams()), { startDate: '', endDate: '', sources: ALL_SEARCH_SOURCES });
    const saved = readSearchFilters(new URLSearchParams('from=2025-01-01&in=captions,section-content'));
    assert.deepEqual(saved, { startDate: '2025-01-01', endDate: '', sources: ['captions', 'section-content'] });
    assert.deepEqual(readSearchFilters(new URLSearchParams('in=none')).sources, []);
    assert.deepEqual(readSearchFilters(new URLSearchParams('in=unknown')).sources, []);
    assert.deepEqual(readSearchFilters(new URLSearchParams('in=title,unknown,title')).sources, ['title']);
    assert.equal(readSearchFilters(new URLSearchParams('year=2025')).endDate, '2025-12-31');
    assert.equal(readSearchFilters(new URLSearchParams('year=2025&from=2026-01-01')).endDate, '');
});

test('highlights every visible occurrence with original casing and whole longer query terms', () => {
    const parts = highlightSearchText('Walking past a WALK, then walking home.', 'walk walking WALK', 'any');
    assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ['Walking', 'WALK', 'walking']);
    assert.equal(parts.map((part) => part.text).join(''), 'Walking past a WALK, then walking home.');
    assert.deepEqual(highlightSearchText('CAFÉ by the sea', 'café', 'any')[0], { text: 'CAFÉ', match: true });
});

test('highlighting treats punctuation as literal text and exact phrases as a single match', () => {
    const parts = highlightSearchText('C++ [notes] (hello) a.b a*b $5 <tag>', 'C++ [notes] (hello) a.b a*b $5 <tag>', 'any');
    assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ['C++', '[notes]', '(hello)', 'a.b', 'a*b', '$5', '<tag>']);
    assert.deepEqual(highlightSearchText('A Golden sunset and another golden SUNSET.', 'golden sunset', 'phrase')
        .filter((part) => part.match).map((part) => part.text), ['Golden sunset', 'golden SUNSET']);
    assert.deepEqual(highlightSearchText('A quiet day', '   ', 'any'), [{ text: 'A quiet day', match: false }]);
});

test('snippets show the earliest matching word even when it is not the first query term', () => {
    const content = `River ${'ordinary day '.repeat(80)}lantern`;
    const snippet = searchSnippet(content, 'lantern river', 'any');
    assert.ok(snippet.text.startsWith('River'));
    assert.equal(highlightSearchText(snippet.text, 'lantern river', 'any').filter((part) => part.match)[0].text, 'River');
});

test('snippets retain complete matches near the end of long text and long exact phrases', () => {
    const phrase = 'a wonderful walk with the people who made this afternoon so memorable';
    const snippet = searchSnippet(`${'Before this moment. '.repeat(60)}${phrase}.`, phrase, 'phrase');
    assert.ok(snippet.text.startsWith('…'));
    assert.ok(snippet.text.includes(phrase));
    assert.deepEqual(highlightSearchText(snippet.text, phrase, 'phrase').filter((part) => part.match), [{ text: phrase, match: true }]);
    const longPhrase = 'memorable '.repeat(30).trim();
    assert.ok(searchSnippet(`Before. ${longPhrase} Afterwards.`, longPhrase, 'phrase').text.includes(longPhrase));
});

test('Markdown cleanup cannot erase the literal word that matched the entry', () => {
    for (const query of ['#tag', 'file_name', '`code`', 'https://example.test/memory', 'two  spaces']) {
        const content = `Saved ${query === 'https://example.test/memory' ? `[a memory](${query})` : query} yesterday.`;
        const snippet = searchSnippet(content, query, 'phrase');
        assert.ok(snippet.text.includes(query.replace(/\s+/g, ' ')), query);
        assert.ok(highlightSearchText(snippet.text, query, 'phrase').some((part) => part.match), query);
    }
    assert.equal(searchSnippet('A **golden** sunset', 'golden', 'any').text, 'A golden sunset');
});

test('title previews retain highlighted text removed by legacy title cleanup', () => {
    for (const [title, query] of [['Birthday: a quiet evening', 'Birthday'], ['Learning C++', 'C++'], ['#memories', '#memories']]) {
        const preview = searchResultTitle(title, query, 'any');
        assert.ok(preview.includes(query));
        assert.ok(highlightSearchText(preview, query, 'any').some((part) => part.match));
    }
    const preview = searchResultTitle(`${'A long title '.repeat(40)}Lantern festival`, 'lantern', 'any');
    assert.ok(preview.startsWith('…'));
    assert.ok(preview.includes('Lantern'));
    assert.equal(searchResultTitle('', '', 'any'), 'Untitled');
});

test('publishes immutable batches, retains older cache during refresh, and removes deleted cache only on completion', async () => {
    const docs = Array.from({ length: SEARCH_BATCH_SIZE }, (_, index) => {
        const date = new Date(Date.UTC(2026, 10, 11 - index)).toISOString().slice(0, 10);
        return entryDoc(date, { title: `Memory ${index}` });
    });
    const updates = [];
    const cursors = [];
    const older = entryDoc('2020-01-01', { title: 'Older memory' });
    await loadSearchIndex({
        readCache: async () => snapshot([older, entryDoc('2010-01-01', { title: 'Deleted' })]),
        readPage: async (cursor) => {
            cursors.push(cursor?.id);
            return snapshot(cursor ? [older] : docs);
        },
        isCurrent: () => true,
        onUpdate: (update) => updates.push(update)
    });
    assert.deepEqual(cursors, [undefined, docs.at(-1).id]);
    assert.equal(updates[1].entries.length, 2);
    assert.equal(updates[2].entries.length, SEARCH_BATCH_SIZE + 2);
    assert.equal(updates.at(-1).status, 'ready');
    assert.equal(updates.at(-1).entries.length, SEARCH_BATCH_SIZE + 1);
    assert.equal(updates.at(-1).entries.at(-1).id, '2020-01-01');
});

test('a stalled request leaves cached entries searchable with a retry message', async () => {
    const updates = [];
    await loadSearchIndex({
        readCache: async () => snapshot([entryDoc('2026-11-11', { title: 'Cached' })]),
        readPage: never, timeoutMs: 10,
        isCurrent: () => true, onUpdate: (update) => updates.push(update)
    });
    assert.equal(updates.at(-1).status, 'partial');
    assert.equal(updates.at(-1).entries.length, 1);
    assert.match(updates.at(-1).message, /retry/);
});

test('cache timeouts do not block the server and empty offline snapshots are not marked complete', async () => {
    const updates = [];
    await loadSearchIndex({
        readCache: never, cacheTimeoutMs: 10,
        readPage: async () => snapshot([], true),
        isCurrent: () => true, onUpdate: (update) => updates.push(update)
    });
    assert.equal(updates.at(-1).status, 'partial');
    assert.match(updates.at(-1).message, /retry/);
});

test('failure without cache is recoverable and a fresh attempt can succeed', async () => {
    const updates = [];
    const options = { readCache: async () => snapshot([]), isCurrent: () => true, onUpdate: (update) => updates.push(update) };
    await loadSearchIndex({ ...options, readPage: async () => { throw new Error('Unavailable'); } });
    assert.equal(updates.at(-1).status, 'error');
    await loadSearchIndex({ ...options, readPage: async () => snapshot([entryDoc('2026-11-11')]) });
    assert.equal(updates.at(-1).status, 'ready');
});

test('late results after navigation or an account change cannot publish', async () => {
    let active = true;
    const updates = [];
    await loadSearchIndex({
        readCache: async () => snapshot([]),
        readPage: async () => { active = false; return snapshot([entryDoc('2026-11-11')]); },
        isCurrent: () => active, onUpdate: (update) => updates.push(update)
    });
    assert.equal(updates.length, 2);
    assert.ok(updates.every((update) => update.entries.length === 0));
});
