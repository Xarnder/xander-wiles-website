/**
 * Node test runner for list drag insert-index helpers.
 * Run: node --test pages/Markdown-Editor/list-drag.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { insertIndexFromRects } from './list-drag.js';

test('inserts before the first row whose midpoint is below the pointer', () => {
    const rects = [
        { top: 0, height: 50 },
        { top: 60, height: 50 },
        { top: 120, height: 50 },
    ];
    assert.equal(insertIndexFromRects(-10, rects), 0);
    assert.equal(insertIndexFromRects(24, rects), 0);
    assert.equal(insertIndexFromRects(25, rects), 1);
    assert.equal(insertIndexFromRects(84, rects), 1);
    assert.equal(insertIndexFromRects(85, rects), 2);
    assert.equal(insertIndexFromRects(144, rects), 2);
    assert.equal(insertIndexFromRects(145, rects), 3);
    assert.equal(insertIndexFromRects(400, rects), 3);
});

test('empty list appends at 0', () => {
    assert.equal(insertIndexFromRects(10, []), 0);
});

test('single remaining row: above mid is 0, below mid is 1', () => {
    const rects = [{ top: 100, height: 40 }];
    assert.equal(insertIndexFromRects(119, rects), 0);
    assert.equal(insertIndexFromRects(120, rects), 1);
});

test('uneven heights still use each row’s own midpoint', () => {
    const rects = [
        { top: 0, height: 20 },
        { top: 30, height: 80 },
    ];
    assert.equal(insertIndexFromRects(9, rects), 0);
    assert.equal(insertIndexFromRects(10, rects), 1);
    assert.equal(insertIndexFromRects(69, rects), 1);
    assert.equal(insertIndexFromRects(70, rects), 2);
});
