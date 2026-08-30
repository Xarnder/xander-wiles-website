/**
 * Node test runner for Finder / Pinned display names.
 * Run: node --test pages/Markdown-Editor/file-names.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { displayFileListName, normalizeHexColor } from './ui.js';

test('hides .md and .markdown by default', () => {
    assert.equal(displayFileListName('notes.md'), 'notes');
    assert.equal(displayFileListName('Journal.MD'), 'Journal');
    assert.equal(displayFileListName('readme.markdown'), 'readme');
});

test('keeps the full name when showExtension is on', () => {
    assert.equal(displayFileListName('notes.md', { showExtension: true }), 'notes.md');
});

test('never strips folder names', () => {
    assert.equal(displayFileListName('archive.md', { isFolder: true }), 'archive.md');
});

test('leaves names without a markdown suffix unchanged', () => {
    assert.equal(displayFileListName('shopping list'), 'shopping list');
    assert.equal(displayFileListName('notes.md.bak'), 'notes.md.bak');
});

test('uses a fallback for empty names', () => {
    assert.equal(displayFileListName(''), '(unnamed)');
    assert.equal(displayFileListName('   '), '(unnamed)');
});

test('normalizes hex colours and rejects junk', () => {
    assert.equal(normalizeHexColor('#FF6B6B'), '#ff6b6b');
    assert.equal(normalizeHexColor('4dabf7'), '#4dabf7');
    assert.equal(normalizeHexColor('#fff'), '');
    assert.equal(normalizeHexColor('red'), '');
});
