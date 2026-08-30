/**
 * Node test runner for cloud settings merge.
 * Run: node --test pages/Markdown-Editor/settings-merge.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    cloudHasPrefs,
    cloudSettingsScore,
    mergeFileTextBold,
    mergeFileTextColors,
    mergePinnedState,
    normalizePinnedItems,
    parseCloudSettingsText,
    pickRichestCloudSettings,
} from './settings-merge.js';

test('does not let an empty cloud pin list wipe local pins', () => {
    const local = [
        { id: 'a', name: 'Notes.md', mimeType: 'text/markdown', pinnedAt: 100 },
        { id: 'b', name: 'Projects', mimeType: 'application/vnd.google-apps.folder', pinnedAt: 90 },
    ];
    const merged = mergePinnedState({
        localItems: local,
        cloudItems: [],
        localTombs: {},
        cloudTombs: {},
    });
    assert.deepEqual(
        merged.items.map((item) => item.id),
        ['a', 'b']
    );
});

test('restores pins from cloud when local storage is empty', () => {
    const cloud = [{ id: 'c', name: 'Inbox.md', mimeType: 'text/markdown', pinnedAt: 50 }];
    const merged = mergePinnedState({
        localItems: [],
        cloudItems: cloud,
        localTombs: {},
        cloudTombs: {},
    });
    assert.equal(merged.items.length, 1);
    assert.equal(merged.items[0].id, 'c');
});

test('keeps an unpin when the other side still has the item', () => {
    const now = Date.now();
    const merged = mergePinnedState({
        localItems: [],
        localTombs: { gone: now },
        cloudItems: [{ id: 'gone', name: 'Old.md', mimeType: 'text/markdown', pinnedAt: now - 1000 }],
        cloudTombs: {},
        now,
    });
    assert.deepEqual(merged.items, []);
    assert.equal(merged.tombs.gone, now);
});

test('re-pin after unpin wins because pinnedAt is newer', () => {
    const merged = mergePinnedState({
        localItems: [{ id: 'n', name: 'Again.md', mimeType: 'text/markdown', pinnedAt: 300 }],
        localTombs: {},
        cloudItems: [],
        cloudTombs: { n: 200 },
    });
    assert.equal(merged.items.length, 1);
    assert.equal(merged.items[0].id, 'n');
    assert.equal(merged.tombs.n, undefined);
});

test('unions pins from both devices', () => {
    const merged = mergePinnedState({
        localItems: [{ id: 'a', name: 'A.md', mimeType: 'text/markdown', pinnedAt: 10 }],
        cloudItems: [{ id: 'b', name: 'B.md', mimeType: 'text/markdown', pinnedAt: 20 }],
    });
    assert.deepEqual(
        merged.items.map((item) => item.id),
        ['b', 'a']
    );
});

test('normalizePinnedItems drops junk and dedupes', () => {
    const items = normalizePinnedItems([
        null,
        { id: '' },
        { id: 'x', name: 'One.md', pinnedAt: 1 },
        { id: 'x', name: 'Two.md', pinnedAt: 5 },
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'Two.md');
});

test('newer colour timestamp wins, including clears', () => {
    const merged = mergeFileTextColors({
        localColors: { a: '#ff0000', b: '#00ff00' },
        localAt: { a: 10, b: 10 },
        cloudColors: { a: '#0000ff' },
        cloudAt: { a: 20, b: 30 },
    });
    assert.equal(merged.colors.a, '#0000ff');
    assert.equal(merged.colors.b, undefined);
    assert.equal(merged.at.b, 30);
});

test('legacy colour maps without timestamps keep both sides', () => {
    const merged = mergeFileTextColors({
        localColors: { a: '#ff6b6b' },
        cloudColors: { b: '#4dabf7' },
    });
    assert.equal(merged.colors.a, '#ff6b6b');
    assert.equal(merged.colors.b, '#4dabf7');
});

test('empty or default snapshots are not treated as real cloud prefs', () => {
    assert.equal(parseCloudSettingsText(''), null);
    assert.equal(parseCloudSettingsText('{}'), null);
    assert.equal(parseCloudSettingsText('not-json'), null);
    assert.equal(
        parseCloudSettingsText(JSON.stringify({ version: 1, updatedAt: Date.now(), pinnedItems: [] })),
        null
    );
    assert.equal(cloudHasPrefs({ version: 1, updatedAt: 1, pinnedItems: [] }), false);
});

test('parses theme, pins, tombs, and colours from cloud JSON', () => {
    const cloud = parseCloudSettingsText(
        JSON.stringify({
            theme: 'oled',
            pinnedItems: [{ id: 'n', name: 'Notes.md', pinnedAt: 10 }],
            pinnedTombs: { gone: 5 },
            fileTextColors: { n: '#ff6b6b' },
            updatedAt: 99,
        })
    );
    assert.equal(cloud.theme, 'oled');
    assert.equal(cloud.pinnedItems.length, 1);
    assert.equal(cloud.pinnedTombs.gone, 5);
    assert.equal(cloud.fileTextColors.n, '#ff6b6b');
    assert.equal(cloud.fileTextBold, undefined);
});

test('parses bold flags from cloud JSON', () => {
    const cloud = parseCloudSettingsText(
        JSON.stringify({
            fileTextBold: { n: true },
            fileTextBoldAt: { n: 12 },
        })
    );
    assert.equal(cloud.fileTextBold.n, true);
    assert.equal(cloud.fileTextBoldAt.n, 12);
});

test('legacy unpinnedAt maps into pinned tombs', () => {
    const cloud = parseCloudSettingsText(JSON.stringify({ unpinnedAt: { x: 42 } }));
    assert.equal(cloud.pinnedTombs.x, 42);
});

test('newer bold timestamp wins, including clears', () => {
    const merged = mergeFileTextBold({
        localBold: { a: true, b: true },
        localAt: { a: 10, b: 10 },
        cloudBold: { a: true },
        cloudAt: { a: 20, b: 30 },
    });
    assert.equal(merged.bold.a, true);
    assert.equal(merged.bold.b, undefined);
    assert.equal(merged.at.b, 30);
});

test('legacy bold maps without timestamps keep both sides', () => {
    const merged = mergeFileTextBold({
        localBold: { a: true },
        cloudBold: { b: true },
    });
    assert.equal(merged.bold.a, true);
    assert.equal(merged.bold.b, true);
});

test('picks the richest settings file, not merely the newest empty one', () => {
    const emptyNewest = {
        version: 1,
        updatedAt: 9_000,
        theme: 'blue',
        pinnedItems: [],
    };
    const olderRich = {
        version: 1,
        updatedAt: 100,
        theme: 'oled',
        pinnedItems: [
            { id: 'a', name: 'A.md', pinnedAt: 1 },
            { id: 'b', name: 'B.md', pinnedAt: 2 },
        ],
        fileTextColors: { a: '#ffffff' },
    };
    const picked = pickRichestCloudSettings([emptyNewest, olderRich]);
    assert.equal(picked, olderRich);
    assert.ok(cloudSettingsScore(olderRich) > cloudSettingsScore(emptyNewest));
});
