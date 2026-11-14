import assert from 'node:assert/strict';
import test from 'node:test';
import { captionTagKey, getGalleryCaptionTags, filterGalleryByCaptionTags } from './galleryCaptionFilters.js';

const tagged = (tags, extra = {}) => ({ url: 'photo.webp', taggedCaptions: tags.map((tag) => ({ tag, caption: 'Caption text' })), ...extra });
const entries = [
    { id: '2026-11-14', title: 'Meal in the title', tags: ['Meal'], images: [
        { url: 'normal.webp', caption: 'Meal: ordinary caption text' },
        tagged(['Meal', 'Place', 'meal'], { caption: 'Normal caption alongside tags' }),
        tagged(['Dessert'])
    ] },
    { id: '2026-11-13', images: [{ url: 'legacy.webp', caption: 'Pasta', captionTag: ' Meal ' }, tagged(['Book title'])] },
    { id: '2026-11-12', images: [{ url: 'uncaptioned.webp' }] }
];

test('available tags count each photo once, include custom and legacy tags, and ignore normal captions', () => {
    assert.deepEqual(getGalleryCaptionTags(entries), [
        { key: 'book title', label: 'Book title', count: 1 },
        { key: 'dessert', label: 'Dessert', count: 1 },
        { key: 'meal', label: 'Meal', count: 2 },
        { key: 'place', label: 'Place', count: 1 }
    ]);
});

test('no selection preserves every photo, including normal captions and uncaptioned images', () => {
    assert.equal(filterGalleryByCaptionTags(entries, []), entries);
    assert.equal(filterGalleryByCaptionTags(entries, ['', null, '  ']), entries);
});

test('filters individual images before grouping days, without changing saved entry data', () => {
    const before = JSON.stringify(entries);
    const result = filterGalleryByCaptionTags(entries, ['MEAL']);
    assert.deepEqual(result.map((entry) => [entry.id, entry.images.length]), [['2026-11-14', 1], ['2026-11-13', 1]]);
    assert.equal(result[0].images[0], entries[0].images[1]);
    assert.equal(result[0].images[0].caption, 'Normal caption alongside tags');
    assert.equal(result[1].images[0].caption, 'Pasta');
    assert.equal(JSON.stringify(entries), before);
});

test('multiple selected tags match any tag, with no duplicate photos or partial tag-name matches', () => {
    const result = filterGalleryByCaptionTags(entries, ['meal', 'place', 'dessert']);
    assert.deepEqual(result.map((entry) => entry.images.length), [2, 1]);
    assert.deepEqual(filterGalleryByCaptionTags(entries, ['Me']), []);
    assert.deepEqual(filterGalleryByCaptionTags(entries, ['no longer used']), []);
});

test('tag identity ignores case, spacing, and Unicode composition', () => {
    assert.equal(captionTagKey(' BOOK\n title '), 'book title');
    assert.equal(captionTagKey('CAFE\u0301'), 'café');
    const data = [{ id: '2026-11-14', images: [tagged(['Café', 'CAFE\u0301', ' Book  title '])] }];
    assert.equal(getGalleryCaptionTags(data).find(({ key }) => key === 'café').count, 1);
    assert.equal(filterGalleryByCaptionTags(data, ['cafe\u0301'])[0].images.length, 1);
    assert.equal(filterGalleryByCaptionTags(data, ['book title'])[0].images.length, 1);
});

test('malformed caption fields do not become filter options or crash filtering', () => {
    const data = [{ id: '2026-11-14', images: [null, { caption: {}, captionTag: 'Meal' }, { taggedCaptions: {} },
        { taggedCaptions: [null, { tag: 'Meal', caption: ' ' }, { tag: [], caption: 'invalid' }, { tag: 'Place', caption: 'Home' }] }] }];
    assert.deepEqual(getGalleryCaptionTags(data), [{ key: 'place', label: 'Place', count: 1 }]);
    assert.equal(filterGalleryByCaptionTags(data, ['Place'])[0].images.length, 1);
});

test('filtering includes older matching days beyond the first page in a large gallery', () => {
    const data = Array.from({ length: 2501 }, (_, index) => ({
        id: String(index), images: [tagged([index % 2 ? 'Place' : 'Meal']), { url: 'normal.webp', caption: 'Everyday photo' }]
    }));
    const filtered = filterGalleryByCaptionTags(data, ['Meal']);
    assert.equal(filtered.length, 1251);
    assert.equal(filtered.at(-1).id, '2500');
    assert.ok(filtered.every((entry) => entry.images.length === 1));
    assert.equal(getGalleryCaptionTags(data).find(({ key }) => key === 'meal').count, 1251);
});
