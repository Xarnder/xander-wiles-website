import test from 'node:test';
import assert from 'node:assert/strict';
import { insertionLines, insertAdditions, parseInsertions } from './ai-insertions.js';
import { applyAiProposal, stampAiDateTags } from './ai.js';

test('positions refer to the original snapshot, with stable duplicate-position order', () => {
    assert.equal(insertAdditions('A\nB\nC', [
        { afterLine: 3, text: 'End' }, { afterLine: 1, text: 'First' },
        { afterLine: 0, text: 'Start' }, { afterLine: 1, text: 'Second' },
    ]), 'Start\nA\nFirst\nSecond\nB\nC\nEnd\n');
});

test('existing bytes, blank lines, duplicate lines and CRLF survive unchanged', () => {
    const original = 'A\r\n\r\nA\r\n';
    assert.equal(insertAdditions(original, [{ afterLine: 2, text: 'New' }]), 'A\r\n\r\nNew\r\nA\r\n');
    assert.equal(insertAdditions(original, []), original);
    assert.equal(insertAdditions('', [{ afterLine: 0, text: '# New' }]), '# New\n');
    assert.equal(insertionLines('A\n').length, 1);
    assert.equal(insertionLines('\n').length, 1);
});

test('invalid output cannot become a rewrite or an invalid insertion', () => {
    for (const value of [
        {}, { markdown: 'Replace it' }, { additions: [{ afterLine: -1, text: 'X' }] },
        { additions: [{ afterLine: 2, text: 'X' }] }, { additions: [{ afterLine: 0.5, text: 'X' }] },
        { additions: [{ afterLine: '1', text: 'X' }] }, { additions: [{ afterLine: 0, text: '' }] },
        { additions: [{ afterLine: 0, text: 'X', deleteLines: 1 }] },
        { additions: [{ afterLine: 0, text: 'X'.repeat(100001) }] },
        { additions: Array.from({ length: 51 }, () => ({ afterLine: 0, text: 'X' })) },
    ]) assert.throws(() => parseInsertions('A', JSON.stringify(value)));
    assert.throws(() => parseInsertions('A', '# Entire replacement'));
    assert.deepEqual(parseInsertions('', '```json\n{"additions":[]}\n```'), []);
});

test('insertions inside fenced blocks are rejected but after the block is allowed', () => {
    const original = '```mdlist\n{"id":"keep"}\n```\n';
    for (const afterLine of [1, 2]) assert.throws(() => insertAdditions(original, [{ afterLine, text: 'X' }]));
    assert.equal(insertAdditions(original, [{ afterLine: 3, text: 'X' }]), original + 'X\n');
});

test('preview and save stamp only new dates and never alter original tags', () => {
    const input = { task: 'revise', addOnly: true, original: '{{date:2000-01-01}}', additions: [{ afterLine: 1, text: 'New {{date:1999-01-01}}' }] };
    const result = applyAiProposal(input);
    assert.equal(result.ok, true);
    assert.equal(result.markdown, '{{date:2000-01-01}}\nNew ' + stampAiDateTags('{{date}}') + '\n');
    assert.deepEqual(applyAiProposal(input), result);
    assert.equal(applyAiProposal({ ...input, additions: undefined, proposal: 'Replacement' }).ok, false);
});
