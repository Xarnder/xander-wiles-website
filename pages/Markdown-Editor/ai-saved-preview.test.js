import test from 'node:test';
import assert from 'node:assert/strict';
import { firstAiChangeOffset } from './ai.js';
import { parseDocument, previewAnchorFromOffset, serializeDocument } from './lists.js';

test('first change points to its new line for additions, replacements and deletions', () => {
    for (const [before, after, expected] of [
        ['', '# New note', 0],
        ['# Title\nOld text\n', '# Title\nNew text\n', 8],
        ['A\nB\n', 'A\nNew\nB\nLater\n', 2],
        ['A\nDelete\nKeep\n', 'A\nKeep\n', 2],
        ['A\nDelete\n', 'A\n', 2],
        ['Delete everything', '', 0],
        ['A\r\nB\r\n', 'A\nNew\nB\n', 2],
        ['Same\r\n', 'Same\n', null],
    ]) assert.equal(firstAiChangeOffset(before, after), expected);
});

test('a later prose chunk is located after normal lists and normalized custom-list JSON', () => {
    const custom = '```mdlist\n{"version":1,"id":"custom","items":[]}\n```';
    const before = `# Note\n\n${custom}\n\n- First\n- Second\n\nOld paragraph\n`;
    const after = before.replace('Old paragraph', 'New paragraph');
    const doc = parseDocument(after);
    const normalized = serializeDocument(doc);
    const offset = firstAiChangeOffset(serializeDocument(parseDocument(before)), normalized);
    const anchor = previewAnchorFromOffset(doc, offset);
    assert.equal(anchor.segIndex, 2);
    assert.equal(anchor.localLine, 5);
    assert.equal(anchor.needle, 'New');
});

test('an edited custom-list item is anchored by its ID instead of the start of the list', () => {
    const list = { version: 1, id: 'test-list', items: Array.from({ length: 40 }, (_, index) => ({
        id: `item-${index}`, text: `Original item ${index}`, score: 40 - index, tags: [],
    })) };
    const markdown = value => `# Header\n\n\`\`\`mdlist\n${JSON.stringify(value)}\n\`\`\`\n\nEnd\n`;
    const before = serializeDocument(parseDocument(markdown(list)));
    list.items[30].text = 'New item text';
    const doc = parseDocument(markdown(list));
    const offset = firstAiChangeOffset(before, serializeDocument(doc));
    const anchor = previewAnchorFromOffset(doc, offset);
    assert.equal(anchor.segIndex, 1);
    assert.equal(anchor.itemId, 'item-30');
});
