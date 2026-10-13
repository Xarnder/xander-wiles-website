/**
 * Run: node --test pages/Markdown-Editor/csv.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { detectCsvDelimiter, isCsvFile, parseCsv, pasteIntoRows, serializeCsv } from './csv.js';

test('detects csv files and leaves notes and pdfs alone', () => {
    assert.equal(isCsvFile({ mimeType: 'text/csv', name: 'data.bin' }), true);
    assert.equal(isCsvFile({ mimeType: 'application/octet-stream', name: 'Budget.CSV' }), true);
    assert.equal(isCsvFile({ name: 'notes.md.csv' }), true);
    assert.equal(isCsvFile({ name: 'notes.csv.md' }), false);
    assert.equal(isCsvFile({ mimeType: 'text/markdown', name: 'notes.md' }), false);
    assert.equal(isCsvFile({ mimeType: 'application/pdf', name: 'sheet.csv' }), false);
    assert.equal(isCsvFile({ mimeType: 'application/vnd.google-apps.folder', name: 'csv' }), false);
    assert.equal(
        isCsvFile({ mimeType: 'application/vnd.google-apps.spreadsheet', name: 'Budget.csv' }),
        false
    );
});

test('parses quoted commas, escaped quotes, and newlines', () => {
    const parsed = parseCsv('name,note\nAda,"say ""hi"", friend"\nBea,"line1\nline2"\n');
    assert.equal(parsed.delimiter, ',');
    assert.equal(parsed.trailingNewline, true);
    assert.deepEqual(parsed.rows, [
        ['name', 'note'],
        ['Ada', 'say "hi", friend'],
        ['Bea', 'line1\nline2'],
    ]);
    assert.equal(
        serializeCsv(parsed.rows, parsed.delimiter, { trailingNewline: true }),
        'name,note\nAda,"say ""hi"", friend"\nBea,"line1\nline2"\n'
    );
});

test('a trailing newline does not invent an extra row', () => {
    assert.equal(parseCsv('a,b\n').rows.length, 1);
    assert.deepEqual(parseCsv('a,b\n\n').rows, [
        ['a', 'b'],
        [''],
    ]);
});

test('uses semicolon or tab when that is the delimiter', () => {
    assert.equal(detectCsvDelimiter('a;b;c\n'), ';');
    assert.deepEqual(parseCsv('a;b;c').rows, [['a', 'b', 'c']]);
    assert.equal(detectCsvDelimiter('a\tb\tc'), '\t');
    assert.equal(serializeCsv([['a', 'b', 'c']], '\t'), 'a\tb\tc');
});

test('keeps a leading BOM when writing back', () => {
    const parsed = parseCsv('\uFEFFa,b\n');
    assert.equal(parsed.bom, true);
    assert.deepEqual(parsed.rows, [['a', 'b']]);
    assert.equal(serializeCsv(parsed.rows, ',', { bom: true, trailingNewline: true }), '\uFEFFa,b\n');
});

test('paste keeps a single value in one cell and spreads a block', () => {
    const single = pasteIntoRows(
        [
            ['a', 'b'],
            ['c', 'd'],
        ],
        0,
        1,
        'hello, world'
    );
    assert.deepEqual(single.rows, [
        ['a', 'hello, world'],
        ['c', 'd'],
    ]);

    const block = pasteIntoRows(
        [
            ['a', 'b'],
            ['c', 'd'],
        ],
        1,
        1,
        'x\ty\nz\tw'
    );
    assert.deepEqual(block.rows, [
        ['a', 'b'],
        ['c', 'x', 'y'],
        ['', 'z', 'w'],
    ]);
    assert.deepEqual([block.focusRow, block.focusCol], [2, 2]);
});

test('an empty file is one blank cell', () => {
    assert.deepEqual(parseCsv('').rows, [['']]);
    assert.equal(serializeCsv([['']]), '');
});
