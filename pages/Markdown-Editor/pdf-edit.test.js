/**
 * Run: node --test pages/Markdown-Editor/pdf-edit.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PDF_SIMPLE_UPLOAD_LIMIT,
    hexToRgbUnit,
    isPdfFile,
    pdfUploadKind,
    groupPdfTextLines,
    lineAtPoint,
    strokeCoversPoint,
    strokeToSvgPath,
    toWinAnsi,
} from './pdf-edit.js';

test('detects PDFs by mime type and extension', () => {
    assert.equal(isPdfFile({ mimeType: 'application/pdf', name: 'scan.bin' }), true);
    assert.equal(isPdfFile({ mimeType: 'application/octet-stream', name: 'Notes.PDF' }), true);
    assert.equal(isPdfFile({ mimeType: 'text/markdown', name: 'notes.md' }), false);
    assert.equal(isPdfFile({ mimeType: 'application/vnd.google-apps.folder', name: 'pdf' }), false);
    assert.equal(
        isPdfFile({ mimeType: 'application/vnd.google-apps.document', name: 'Brief.pdf' }),
        false
    );
    assert.equal(isPdfFile({ name: 'notes.pdf.md' }), false);
});

test('builds an SVG path measured from the top of the page', () => {
    const path = strokeToSvgPath(
        [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
        ],
        100
    );
    assert.equal(path, 'M 10 80 L 30 60');
});

test('a single tap becomes a short stroke', () => {
    const path = strokeToSvgPath([{ x: 5, y: 5 }], 50);
    assert.equal(path, 'M 5 45 L 5.35 45');
});

test('WinAnsi keeps Latin-1 and replaces other characters', () => {
    assert.equal(toWinAnsi('Café — hi'), 'Café ? hi');
    assert.equal(toWinAnsi('a\nb'), 'a\nb');
});

test('small PDFs use a simple upload and large ones use resumable', () => {
    assert.equal(pdfUploadKind(1000), 'media');
    assert.equal(pdfUploadKind(PDF_SIMPLE_UPLOAD_LIMIT), 'media');
    assert.equal(pdfUploadKind(PDF_SIMPLE_UPLOAD_LIMIT + 1), 'resumable');
});

test('hex colours become unit rgb', () => {
    const rgb = hexToRgbUnit('#ff0000');
    assert.equal(rgb.r, 1);
    assert.equal(rgb.g, 0);
    assert.equal(rgb.b, 0);
});

test('eraser reaches the edge of a wide highlight and misses past it', () => {
    const stroke = [
        { x: 10, y: 100 },
        { x: 200, y: 100 },
    ];
    assert.equal(strokeCoversPoint({ x: 80, y: 108 }, stroke, 16, 0), true);
    assert.equal(strokeCoversPoint({ x: 80, y: 100 }, stroke, 16, 0), true);
    assert.equal(strokeCoversPoint({ x: 80, y: 109 }, stroke, 16, 0), false);
    assert.equal(strokeCoversPoint({ x: 80, y: 114 }, stroke, 16, 6), true);
    assert.equal(strokeCoversPoint({ x: 80, y: 115 }, stroke, 16, 6), false);
});

test('a highlighter tap is a dot centered on the point', () => {
    const dot = [{ x: 40, y: 40 }];
    assert.equal(strokeCoversPoint({ x: 48, y: 40 }, dot, 16, 0), true);
    assert.equal(strokeCoversPoint({ x: 32, y: 40 }, dot, 16, 0), true);
    assert.equal(strokeCoversPoint({ x: 50, y: 40 }, dot, 16, 0), false);
});

test('pdf text items on one baseline become an editable line', () => {
    const lines = groupPdfTextLines([
        { str: 'Hello', transform: [18, 0, 0, 18, 40, 340], width: 48, height: 18 },
        { str: 'world', transform: [18, 0, 0, 18, 96, 340], width: 52, height: 18 },
        { str: 'Edit typography', transform: [16, 0, 0, 16, 40, 300], width: 110, height: 16 },
        { str: 'Notes', transform: [16, 0, 0, 16, 220, 300], width: 40, height: 16 },
        { str: 'Sideways', transform: [0, 16, -16, 0, 10, 10], width: 40, height: 16 },
    ]);
    assert.deepEqual(
        lines.map((line) => line.text),
        ['Hello world', 'Edit typography', 'Notes']
    );
    assert.equal(lines[1].x, 40);
    assert.equal(lines[1].y, 300);
    assert.equal(lines[1].size, 16);
});

test('text drawn later at the same origin replaces the line', () => {
    const lines = groupPdfTextLines([
        { str: 'Edit', transform: [16, 0, 0, 16, 40, 300], width: 32, height: 16 },
        { str: 'typography', transform: [16, 0, 0, 16, 80, 300], width: 80, height: 16 },
        { str: 'Changed line', transform: [16, 0, 0, 16, 40, 300], width: 96, height: 16 },
    ]);
    assert.deepEqual(
        lines.map((line) => line.text),
        ['Changed line']
    );
});

test('a tap hits the text line and misses the gap above it', () => {
    const lines = [{ text: 'Edit typography', x: 40, y: 300, width: 110, size: 16 }];
    assert.equal(lineAtPoint(lines, { x: 70, y: 300 }, 0)?.text, 'Edit typography');
    assert.equal(lineAtPoint(lines, { x: 70, y: 340 }, 0), null);
    assert.equal(lineAtPoint(lines, { x: 70, y: 320 }, 8)?.text, 'Edit typography');
});
