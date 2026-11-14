import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCaptionTagOptions, captionTagsFromImages, captionTagsFromSnapshot } from './captionTagOptions.js';

test('dropdown options normalize, sort and deduplicate tag names without changing the first spelling', () => {
    assert.deepEqual(mergeCaptionTagOptions(['Meal'], [' meal ', 'MEAL', ' Book\n title ', 'Place', null, {}], ['Café', 'CAFE\u0301']),
        ['Book title', 'Café', 'Meal', 'Place']);
    assert.equal(mergeCaptionTagOptions(['a'.repeat(80)])[0].length, 40);
});

test('dropdown options include legacy and multiple tags, but exclude blank or malformed caption rows', () => {
    assert.deepEqual(captionTagsFromImages([
        null, { caption: 'Meal: plain text' }, { caption: 'Pasta', captionTag: 'Meal' },
        { taggedCaptions: [{ tag: 'Place', caption: 'Home' }, { tag: 'Meal', caption: 'Rice' }, { tag: 'Empty', caption: '' }, null] }
    ]), ['Meal', 'Place']);
});

test('saved tag discovery includes other journal days and tolerates missing image fields', () => {
    const data = [null, {}, { images: 'bad' }, { images: [{ caption: 'The Hobbit', captionTag: 'Book' }] },
        { imageMetadata: { url: 'old-photo', caption: 'Home', captionTag: 'Place' } },
        { images: [{ taggedCaptions: [{ tag: 'Dessert', caption: 'Apple pie' }] }] }];
    assert.deepEqual(captionTagsFromSnapshot({ docs: data.map((entry) => ({ data: () => entry })) }), ['Book', 'Dessert', 'Place']);
});
