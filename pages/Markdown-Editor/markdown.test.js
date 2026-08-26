/**
 * Node test runner for plain-list indent/reorder helpers.
 * Run: node --test pages/Markdown-Editor/markdown.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    movePlainListItemAmongSiblings,
    plainListIndentForDepth,
    plainListSiblingMoveTarget,
} from './markdown.js';

function item(id, depth) {
    return {
        id,
        text: id,
        marker: '-',
        indent: plainListIndentForDepth(depth),
        checked: null,
    };
}

function ids(items) {
    return items.map((it) => it.id);
}

/** A / a1, a2(+a2x,a2y), a3 / B / b1 */
function sampleTree() {
    return [
        item('A', 0),
        item('a1', 1),
        item('a2', 1),
        item('a2x', 2),
        item('a2y', 2),
        item('a3', 1),
        item('B', 0),
        item('b1', 1),
    ];
}

test('nested item moves down among siblings and keeps its children', () => {
    const items = sampleTree();
    const a2 = items.findIndex((it) => it.id === 'a2');
    assert.equal(plainListSiblingMoveTarget(items, a2, 1), items.findIndex((it) => it.id === 'a3'));
    const next = movePlainListItemAmongSiblings(items, a2, 1);
    assert.deepEqual(ids(next), ['A', 'a1', 'a3', 'a2', 'a2x', 'a2y', 'B', 'b1']);
    assert.deepEqual(ids(items), ['A', 'a1', 'a2', 'a2x', 'a2y', 'a3', 'B', 'b1']);
});

test('nested item moves up among siblings and keeps its children', () => {
    const items = sampleTree();
    const a2 = items.findIndex((it) => it.id === 'a2');
    const next = movePlainListItemAmongSiblings(items, a2, -1);
    assert.deepEqual(ids(next), ['A', 'a2', 'a2x', 'a2y', 'a1', 'a3', 'B', 'b1']);
});

test('does not move a nested item into another parent', () => {
    const items = sampleTree();
    const a3 = items.findIndex((it) => it.id === 'a3');
    const b1 = items.findIndex((it) => it.id === 'b1');
    assert.equal(plainListSiblingMoveTarget(items, a3, 1), -1);
    assert.equal(plainListSiblingMoveTarget(items, b1, -1), -1);
    assert.deepEqual(ids(movePlainListItemAmongSiblings(items, a3, 1)), ids(items));
    assert.deepEqual(ids(movePlainListItemAmongSiblings(items, b1, -1)), ids(items));
});

test('depth-2 siblings only swap with each other', () => {
    const items = sampleTree();
    const a2x = items.findIndex((it) => it.id === 'a2x');
    const a2y = items.findIndex((it) => it.id === 'a2y');
    assert.equal(plainListSiblingMoveTarget(items, a2x, 1), a2y);
    assert.equal(plainListSiblingMoveTarget(items, a2x, -1), -1);
    assert.deepEqual(ids(movePlainListItemAmongSiblings(items, a2x, 1)), [
        'A',
        'a1',
        'a2',
        'a2y',
        'a2x',
        'a3',
        'B',
        'b1',
    ]);
});

test('first sibling cannot move up; last cannot move down', () => {
    const items = sampleTree();
    const a1 = items.findIndex((it) => it.id === 'a1');
    assert.equal(plainListSiblingMoveTarget(items, a1, -1), -1);
    assert.deepEqual(ids(movePlainListItemAmongSiblings(items, a1, -1)), ids(items));
});

test('top-level items move among top-level siblings with nested children attached', () => {
    const items = sampleTree();
    const a = items.findIndex((it) => it.id === 'A');
    const next = movePlainListItemAmongSiblings(items, a, 1);
    assert.deepEqual(ids(next), ['B', 'b1', 'A', 'a1', 'a2', 'a2x', 'a2y', 'a3']);
});
