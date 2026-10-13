/**
 * Run: node --test pages/Markdown-Editor/text-files.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureFileExtension, isTextCandidate, sortDriveEntries } from './drive.js';

test('detects plain text files and leaves notes, CSVs, and Google files alone', () => {
    assert.equal(isTextCandidate({ mimeType: 'text/plain', name: 'todo.txt' }), true);
    assert.equal(isTextCandidate({ mimeType: 'text/plain', name: 'README' }), true);
    assert.equal(isTextCandidate({ name: 'log.TXT' }), true);
    assert.equal(isTextCandidate({ mimeType: 'application/octet-stream', name: 'a.txt' }), true);
    assert.equal(isTextCandidate({ mimeType: 'text/plain', name: 'notes.md' }), false);
    assert.equal(isTextCandidate({ mimeType: 'text/plain', name: 'data.csv' }), false);
    assert.equal(isTextCandidate({ mimeType: 'text/markdown', name: 'x.txt' }), false);
    assert.equal(isTextCandidate({ mimeType: 'image/png', name: 'pic.txt' }), false);
    assert.equal(isTextCandidate({ mimeType: 'application/vnd.google-apps.document', name: 'a.txt' }), false);
    assert.equal(isTextCandidate({ mimeType: 'application/vnd.google-apps.folder', name: 'txt' }), false);
});

test('adds an extension only when missing', () => {
    assert.equal(ensureFileExtension('todo', '.txt'), 'todo.txt');
    assert.equal(ensureFileExtension('todo.TXT', '.txt'), 'todo.TXT');
    assert.equal(ensureFileExtension('  ', '.csv'), 'Untitled.csv');
});

test('sorts text files after markdown and before CSVs', () => {
    const sorted = sortDriveEntries([
        { name: 'b.csv', mimeType: 'text/csv' },
        { name: 'a.txt', mimeType: 'text/plain' },
        { name: 'c.md', mimeType: 'text/markdown' },
    ]);
    assert.deepEqual(sorted.map((f) => f.name), ['c.md', 'a.txt', 'b.csv']);
});
