/**
 * Node test runner for destructive-edit heuristics.
 * Run: node --test pages/Markdown-Editor/destructive.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DESTRUCTIVE_MIN_DELETED_CHARS,
    isDestructiveChange,
} from './destructive.js';

test('normal typing does not trigger', () => {
    const prev = 'Hello world. This is a short note.';
    const next = `${prev} More text.`;
    assert.equal(isDestructiveChange(prev, next), false);
});

test('deleting one sentence does not trigger', () => {
    const prev = 'Alpha beta gamma. Second sentence here. Third stays.';
    const next = 'Alpha beta gamma. Third stays.';
    assert.equal(isDestructiveChange(prev, next), false);
});

test('deleting >500 characters triggers', () => {
    const prev = 'x'.repeat(DESTRUCTIVE_MIN_DELETED_CHARS + 20);
    const next = 'x'.repeat(10);
    assert.equal(isDestructiveChange(prev, next), true);
});

test('deleting >10% of a substantial document triggers', () => {
    const prev = 'abcdefghij'.repeat(50); // 500 chars
    const next = prev.slice(0, 400); // 20% deleted
    assert.equal(isDestructiveChange(prev, next), true);
});

test('clearing a substantial document triggers', () => {
    const prev = 'Keep this body around for a while so empty counts.'.repeat(3);
    assert.equal(isDestructiveChange(prev, ''), true);
});

test('clearing a tiny document does not trigger', () => {
    assert.equal(isDestructiveChange('hi', ''), false);
});

test('near-total replacement triggers', () => {
    const prev = 'old-'.repeat(150);
    const next = 'new-'.repeat(150);
    assert.equal(isDestructiveChange(prev, next), true);
});
