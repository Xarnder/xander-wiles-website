import test from 'node:test';
import assert from 'node:assert/strict';
import { hasImageCaption, imageCaptionText, readImageCaptions, updateImageCaptions } from './imageCaption.js';
import { formatImageList, imagesForSave } from './imageTakenAt.js';
import { normalizeSearchEntry, filterSearchEntries, highlightSearchText, searchSnippet } from './journalSearch.js';

const photo = { url: 'https://example.test/photo.webp', path: 'users/u/photo.webp', size: 1024, caption: 'Dinner with friends', takenAt: '2026-11-11T12:00:00' };
const tags = [{ tag: 'Meal', caption: 'Chicken curry' }, { tag: 'Place', caption: 'Café in Paris' }];
const searchable = (images, id = '2026-11-11') => normalizeSearchEntry({ id, data: () => ({ images }) });

test('normal and multiple tagged captions survive save, backup, reload and photo reordering', () => {
    const original = structuredClone(photo);
    const combined = updateImageCaptions(photo, ' Dinner with friends ', [
        { tag: ' Meal ', caption: ' Chicken curry ', id: 'editor-only' },
        { tag: 'Place', caption: 'Café in Paris' }
    ]);
    const saved = JSON.parse(JSON.stringify(imagesForSave([combined, photo])));
    assert.deepEqual(saved[0], { ...photo, taggedCaptions: tags });
    assert.deepEqual(saved[1], original);
    assert.deepEqual(photo, original, 'editing must not mutate the saved entry snapshot');
    assert.deepEqual(imagesForSave(saved), saved);
    assert.deepEqual(imagesForSave([saved[1], saved[0]])[1].taggedCaptions, tags);
    assert.equal(imageCaptionText(saved[0]), 'Dinner with friends — Meal: Chicken curry — Place: Café in Paris');
    assert.match(formatImageList(saved, '2026-11-11'), /12:00 PM — Dinner with friends — Meal: Chicken curry — Place: Café in Paris/);
    assert.match(formatImageList(saved, '2026-11-11', 'markdown'), /\*Dinner with friends — Meal: Chicken curry — Place: Café in Paris\*/);
});

test('legacy single tags migrate without duplication, loss or turning the meal into a normal caption', () => {
    const legacy = { ...photo, caption: 'Chicken curry', captionTag: 'Meal' };
    const read = readImageCaptions(legacy);
    assert.deepEqual(read, { caption: '', taggedCaptions: [tags[0]] });
    const combined = updateImageCaptions(legacy, 'Dinner with friends', read.taggedCaptions);
    assert.deepEqual(combined, { ...photo, taggedCaptions: [tags[0]] });
    assert.equal(combined.captionTag, undefined);
    assert.deepEqual(readImageCaptions({ ...legacy, taggedCaptions: tags }), { caption: '', taggedCaptions: tags });
    const stored = imagesForSave([legacy])[0];
    assert.deepEqual(readImageCaptions(stored), read);
    assert.deepEqual(imagesForSave([stored])[0], stored);
    assert.deepEqual(updateImageCaptions(legacy, '', []), { ...photo, caption: '' });
    assert.equal(legacy.captionTag, 'Meal');
});

test('removing one caption preserves the others, including captions with the same tag', () => {
    const combined = updateImageCaptions(photo, photo.caption, tags);
    assert.deepEqual(updateImageCaptions(combined, photo.caption, tags.slice(1)), { ...photo, taggedCaptions: [tags[1]] });
    assert.deepEqual(updateImageCaptions(combined, '', tags), { ...photo, caption: '', taggedCaptions: tags });
    assert.deepEqual(updateImageCaptions(combined, photo.caption), photo);
    assert.equal(hasImageCaption(updateImageCaptions(combined, '', tags)), true);
    assert.equal(hasImageCaption(updateImageCaptions(combined, '')), false);
    assert.deepEqual(readImageCaptions(photo), { caption: photo.caption, taggedCaptions: [] });
    assert.deepEqual(readImageCaptions({ taggedCaptions: [tags[0], { tag: 'Meal', caption: 'Apple pie' }] }).taggedCaptions,
        [tags[0], { tag: 'Meal', caption: 'Apple pie' }]);
});

test('malformed caption data cannot break display, storage or search', () => {
    for (const value of [null, undefined, 5, [], { caption: {} }, { caption: false, captionTag: 'Meal' }, { taggedCaptions: {} }]) {
        assert.deepEqual(readImageCaptions(value), { caption: '', taggedCaptions: [] });
        assert.equal(imageCaptionText(value), '');
        assert.equal(hasImageCaption(value), false);
    }
    const malformed = { ...photo, captionTag: { broken: true }, taggedCaptions: [null, 'bad', {}, { tag: 'Meal', caption: 42 }, { tag: [], caption: 'Bad tag' }, { tag: 'Meal', caption: '  ' }, { tag: ' Book\n  title ', caption: 'The Hobbit' }] };
    assert.deepEqual(readImageCaptions(malformed), { caption: photo.caption, taggedCaptions: [{ tag: 'Book title', caption: 'The Hobbit' }] });
    assert.equal(readImageCaptions({ caption: 'Name', captionTag: 'a'.repeat(100) }).taggedCaptions[0].tag.length, 40);
    assert.equal(imagesForSave([{ ...photo, taggedCaptions: [{ tag: 'Meal', caption: '' }] }])[0].taggedCaptions, undefined);
    assert.equal(imageCaptionText({ caption: '  Original caption  ' }), 'Original caption');
    assert.doesNotThrow(() => searchable([malformed]));
});

test('search and highlighting find each caption independently without phrases crossing caption boundaries', () => {
    const entries = [searchable([
        updateImageCaptions(photo, photo.caption, [{ tag: 'Meal', caption: 'Chicken\n curry with rice' }, tags[1]]),
        { ...photo, caption: 'Golden sunset', captionTag: 'Memory' },
        { ...photo, caption: 'Legacy normal caption' }
    ])];
    const captionsOnly = { sources: ['captions'] };
    for (const query of ['Dinner with friends', 'CHICKEN curry', 'Meal', 'Place', 'cafe\u0301 in paris', 'Golden sunset', 'Legacy normal caption']) {
        assert.equal(filterSearchEntries(entries, query, 'phrase', captionsOnly).length, 1, query);
    }
    for (const query of ['curry chicken', 'friends Meal', 'friends Meal: Chicken', 'rice Place: Café', 'Paris Memory: Golden']) {
        assert.equal(filterSearchEntries(entries, query, 'phrase', captionsOnly).length, 0, query);
    }
    assert.equal(filterSearchEntries(entries, 'missing curry', 'any', captionsOnly).length, 1);
    assert.equal(filterSearchEntries(entries, 'Chicken', 'any', { sources: ['title'] }).length, 0);
    const exact = filterSearchEntries(entries, 'CHICKEN curry', 'phrase', captionsOnly)[0];
    assert.equal(exact.matches.length, 1);
    assert.equal(exact.matches[0].label, 'Image caption 1 · Meal');
    const snippet = searchSnippet(exact.matches[0].text, 'chicken curry', 'phrase');
    assert.deepEqual(highlightSearchText(snippet.text, 'chicken curry', 'phrase').filter((part) => part.match).map((part) => part.text), ['Chicken curry']);
    const keys = entries[0].fields.map((field) => field.key);
    assert.equal(new Set(keys).size, keys.length);
});

test('caption-only search finds a second tagged caption in a journal with 2501 entries', () => {
    const entries = Array.from({ length: 2501 }, (_, index) => searchable([
        updateImageCaptions(photo, 'Everyday photo', [{ tag: 'Meal', caption: 'Lunch' }, { tag: 'Dessert', caption: index === 2500 ? 'Pistachio cheesecake' : 'Fruit' }])
    ], new Date(Date.UTC(2026, 10, 11 - index)).toISOString().slice(0, 10)));
    const results = filterSearchEntries(entries, 'pistachio cheesecake', 'phrase', { sources: ['captions'] });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, entries.at(-1).id);
    assert.equal(results[0].matches[0].label, 'Image caption 1 · Dessert');
});
