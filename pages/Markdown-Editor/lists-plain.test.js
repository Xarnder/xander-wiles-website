/**
 * Node test runner for inserting and converting normal markdown lists.
 * Run: node --test pages/Markdown-Editor/lists-plain.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { splitMarkdownBlocks } from './markdown.js';
import {
    appendPlainMarkdownList,
    convertPlainListToCustom,
    locateLastPlainList,
    parseDocument,
    serializeDocument,
} from './lists.js';

function plainListsIn(text) {
    return splitMarkdownBlocks(text).filter((block) => block.type === 'plainlist');
}

test('append creates one dated bullet on an empty document', () => {
    const doc = parseDocument('');
    appendPlainMarkdownList(doc);
    const text = serializeDocument(doc);
    const lists = plainListsIn(text);
    assert.equal(lists.length, 1);
    assert.equal(lists[0].items.length, 1);
    assert.match(lists[0].items[0].text, /\{\{date:\d{4}-\d{2}-\d{2}\}\}/);
    assert.equal(lists[0].ordered, false);
});

test('append does not merge into a list already at the end', () => {
    const doc = parseDocument('- Existing item\n');
    appendPlainMarkdownList(doc);
    const lists = plainListsIn(serializeDocument(doc));
    assert.equal(lists.length, 2);
    assert.match(lists[0].items[0].text, /Existing item/);
    assert.equal(lists[1].items.length, 1);
    assert.match(lists[1].items[0].text, /\{\{date:/);
});

test('append after a custom list stays after that list', () => {
    const doc = parseDocument(
        'Hello\n\n```mdlist\n{"version":1,"id":"l1","title":"Ideas","items":[]}\n```\n'
    );
    appendPlainMarkdownList(doc);
    const again = parseDocument(serializeDocument(doc));
    const types = again.segments.map((seg) => seg.type);
    assert.deepEqual(types.at(-2), 'mdlist');
    assert.equal(types.at(-1), 'markdown');
    const located = locateLastPlainList(again);
    assert.ok(located);
    assert.equal(located.segIndex, again.segments.length - 1);
    assert.equal(located.listIndex, 0);
});

test('locateLastPlainList points at the list just appended', () => {
    const doc = parseDocument('Intro\n\n- Old\n');
    appendPlainMarkdownList(doc);
    const again = parseDocument(serializeDocument(doc));
    const located = locateLastPlainList(again);
    assert.ok(located);
    const block = located.blocks.filter((b) => b.type === 'plainlist')[located.listIndex];
    assert.equal(block.items[0].id, located.itemId);
    assert.match(block.items[0].text, /\{\{date:/);
    assert.doesNotMatch(block.items[0].text, /Old/);
});

test('convert replaces a bullet list and keeps surrounding prose', () => {
    const doc = parseDocument('Intro paragraph.\n\n- Milk\n- Bread\n\nOutro.\n');
    const list = convertPlainListToCustom(doc, 0, 0);
    assert.ok(list);
    const text = serializeDocument(doc);
    assert.match(text, /Intro paragraph\./);
    assert.match(text, /Outro\./);
    assert.match(text, /```mdlist/);
    assert.doesNotMatch(text, /^- Milk/m);
    assert.doesNotMatch(text, /^- Bread/m);

    const again = parseDocument(text);
    const custom = again.segments.find((seg) => seg.type === 'mdlist' && seg.list);
    assert.ok(custom);
    const items = [...custom.list.items].sort((a, b) => b.score - a.score);
    assert.equal(items.length, 2);
    assert.match(items[0].text, /Milk/);
    assert.match(items[1].text, /Bread/);
    assert.ok(items[0].score > items[1].score);
});

test('convert uses a heading title and drops it from the prose', () => {
    const doc = parseDocument('# Shopping\n\n- Eggs\n');
    const list = convertPlainListToCustom(doc, 0, 0);
    assert.equal(list.title, 'Shopping');
    const text = serializeDocument(doc);
    assert.match(text, /"title": "Shopping"/);
    assert.doesNotMatch(text, /^# Shopping/m);
});

test('convert keeps a later plain list when converting an earlier one', () => {
    const doc = parseDocument('- A\n\n- B\n');
    convertPlainListToCustom(doc, 0, 0);
    const text = serializeDocument(doc);
    const lists = plainListsIn(text);
    assert.equal(lists.length, 1);
    assert.match(lists[0].items[0].text, /^B/);
    assert.match(text, /```mdlist/);
});

test('convert keeps task checkboxes in the custom item text', () => {
    const doc = parseDocument('- [x] Done\n- [ ] Next\n');
    const list = convertPlainListToCustom(doc, 0, 0);
    const items = [...list.items].sort((a, b) => b.score - a.score);
    assert.match(items[0].text, /^\[x\] Done/);
    assert.match(items[1].text, /^\[ \] Next/);
});
