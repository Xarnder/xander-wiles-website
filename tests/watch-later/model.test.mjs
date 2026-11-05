import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isOwner,
    recommendationPayload,
    youtubeId,
    safeImageUrl,
    filterRecommendations,
} from '../../pages/Watch-Later/recommendations-model.mjs';

const input = {
    title: ' Example ',
    type: 'movie',
    tier: 'S',
    rank: 2,
    note: ' Great ',
    genre: 'Drama',
    year: '2020',
};
test('only the exact verified owner has publishing controls', () => {
    assert.equal(isOwner(null), false);
    assert.equal(
        isOwner({ email: 'xanderwiles@gmail.com', emailVerified: true }),
        true,
    );
    for (const user of [
        { email: 'xanderwiles@gmail.com', emailVerified: false },
        { email: 'xander.wiles@gmail.com', emailVerified: true },
        { email: 'visitor@example.com', emailVerified: true },
    ])
        assert.equal(isOwner(user), false);
});
test('public projection strips every private field and canonicalizes trailers', () => {
    const result = recommendationPayload({
        ...input,
        uid: 'private',
        watchWith: 'Private person',
        watched: true,
        watchStatus: 'rewatch',
        timestamp: 123,
        trailerUrl: 'https://youtu.be/abcdefghijk?si=tracking',
    });
    assert.deepEqual(
        Object.keys(result).sort(),
        [
            'title',
            'type',
            'tier',
            'note',
            'genre',
            'year',
            'rank',
            'imageUrl',
            'trailerUrl',
        ].sort(),
    );
    assert.equal(result.title, 'Example');
    assert.equal(
        result.trailerUrl,
        'https://www.youtube.com/watch?v=abcdefghijk',
    );
});
test('rejects unsafe links, bad types and malformed ranks', () => {
    for (const change of [
        { title: ' ' },
        { tier: 'private' },
        { type: 'person' },
        { rank: -1 },
        { rank: 1.5 },
        { rank: 10000 },
        { year: '20' },
        { note: 'x'.repeat(1001) },
        { imageUrl: 'javascript:alert(1)' },
        { trailerUrl: 'https://youtube.com.evil.example/watch?v=abcdefghijk' },
    ])
        assert.throws(() => recommendationPayload({ ...input, ...change }));
    assert.equal(safeImageUrl('http://example.com/x.png'), '');
    assert.equal(safeImageUrl('https://user:password@example.com/x.png'), '');
    assert.equal(
        youtubeId('https://www.youtube.com/shorts/abcdefghijk'),
        'abcdefghijk',
    );
});
test('filters combined title/genre/year and keeps stable per-tier order', () => {
    const items = [
        {
            id: 'b',
            title: 'Zebra',
            type: 'tv',
            rank: 1,
            genre: 'Drama',
            year: '2020',
        },
        {
            id: 'a',
            title: 'Alpha',
            type: 'tv',
            rank: 1,
            genre: 'Drama',
            year: '2021',
        },
        {
            id: 'c',
            title: 'Film',
            type: 'movie',
            rank: 0,
            genre: 'Drama',
            year: '2020',
        },
    ];
    assert.deepEqual(
        filterRecommendations(items, { type: 'tv', search: ' drama ' }).map(
            (i) => i.id,
        ),
        ['a', 'b'],
    );
    assert.equal(filterRecommendations(items, { search: '2020' }).length, 2);
    assert.equal(filterRecommendations(items, { search: 'missing' }).length, 0);
    assert.equal(items[0].id, 'b');
});
