/**
 * Run: node --test pages/Markdown-Editor/ai.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    annotateDiff,
    applyAiProposal,
    diffLines,
    formatDiffCounts,
    formatGeminiCost,
    previewGeminiCost,
    stripWrappingFence,
} from './ai.js';

const LIST = [
    '<!-- For LLMs / coding agents: keep the mdlist JSON. -->',
    '```mdlist',
    '{',
    '  "version": 1,',
    '  "id": "ideas",',
    '  "title": "Ideas",',
    '  "items": [',
    '    { "id": "i1", "text": "Ship it", "score": 8, "tags": [] }',
    '  ]',
    '}',
    '```',
].join('\n');

const NOTE = `# Ideas\n\n{{date:2026-08-03}}\n\nShip the editor.\n\n${LIST}\n`;

test('stripWrappingFence removes one outer markdown fence', () => {
    assert.equal(stripWrappingFence('```markdown\n# Hi\n```'), '# Hi');
    assert.equal(stripWrappingFence('# Hi'), '# Hi');
});

test('expand splices the passage and leaves the custom list in place', () => {
    const result = applyAiProposal({
        task: 'expand',
        original: NOTE,
        selection: 'Ship the editor.',
        proposal: 'Ship the editor with an AI tab.',
    });
    assert.equal(result.ok, true);
    assert.match(result.markdown, /Ship the editor with an AI tab\./);
    assert.match(result.markdown, /"id": "ideas"/);
    assert.match(result.markdown, /"id": "i1"/);
});

test('expand rejects a passage that appears twice', () => {
    const result = applyAiProposal({
        task: 'expand',
        original: 'Same.\n\nSame.\n',
        selection: 'Same.',
        proposal: 'Different.',
    });
    assert.equal(result.ok, false);
});

test('header replaces the opening block and keeps the list', () => {
    const result = applyAiProposal({
        task: 'header',
        original: NOTE,
        proposal: '# Notes\n\n{{date:2026-10-01}}\n\nA short brief.',
    });
    assert.equal(result.ok, true);
    assert.match(result.markdown, /^# Notes/);
    assert.doesNotMatch(result.markdown, /Ship the editor\./);
    assert.match(result.markdown, /```mdlist/);
});

test('summarize inserts a section without rewriting the list', () => {
    const result = applyAiProposal({
        task: 'summarize',
        original: NOTE,
        proposal: '## Summary\n\n- One decision',
    });
    assert.equal(result.ok, true);
    assert.match(result.markdown, /## Summary/);
    assert.match(result.markdown, /Ship the editor\./);
    assert.match(result.markdown, /"id": "i1"/);
});

test('diffLines marks an inserted and a removed line', () => {
    const ops = diffLines('alpha\nbeta\ngamma\n', 'alpha\nBETA\ngamma\nextra\n');
    assert.deepEqual(
        ops.map((op) => `${op.type}:${op.text}`),
        ['equal:alpha', 'del:beta', 'add:BETA', 'equal:gamma', 'add:extra']
    );
});

test('diffLines is empty of changes when the text matches', () => {
    const ops = diffLines('same\n', 'same\n');
    assert.deepEqual(ops, [{ type: 'equal', text: 'same' }]);
});

test('annotateDiff counts lines, sections, and preview line numbers', () => {
    const summary = annotateDiff('alpha\nbeta\ngamma\n', 'alpha\nBETA\ngamma\nextra\n');
    assert.equal(summary.removedLines, 1);
    assert.equal(summary.addedLines, 2);
    assert.equal(summary.removedSections, 1);
    assert.equal(summary.addedSections, 2);
    assert.equal(
        formatDiffCounts(summary),
        'Removed 1 line in 1 section · Added 2 lines in 2 sections'
    );
    assert.deepEqual(
        summary.changes.map((change) => `${change.type}:${change.line}:${change.text}`),
        ['del:2:beta', 'add:2:BETA', 'add:4:extra']
    );
    assert.deepEqual(
        summary.ops.filter((op) => op.type === 'equal').map((op) => [op.text, op.beforeLine, op.afterLine]),
        [
            ['alpha', 1, 1],
            ['gamma', 3, 3],
        ]
    );
});

test('annotateDiff keeps neighbouring edits in one section and separates later ones', () => {
    const summary = annotateDiff('a\nb\nc\nd\ne\n', 'a\nc\ne\n');
    assert.equal(summary.removedLines, 2);
    assert.equal(summary.removedSections, 2);
    assert.equal(summary.addedLines, 0);
    assert.equal(formatDiffCounts(summary), 'Removed 2 lines in 2 sections');
    assert.deepEqual(
        summary.changes.map((change) => change.line),
        [2, 4]
    );
});

test('annotateDiff line numbers diverge after an insertion', () => {
    const summary = annotateDiff('a\nb\nc\n', 'a\nX\nb\nc\n');
    const equals = summary.ops.filter((op) => op.type === 'equal');
    assert.deepEqual(
        equals.map((op) => [op.text, op.beforeLine, op.afterLine]),
        [
            ['a', 1, 1],
            ['b', 2, 3],
            ['c', 3, 4],
        ]
    );
    assert.equal(summary.changes[0].line, 2);
    assert.equal(summary.addedSections, 1);
});

test('formatGeminiCost bills thinking tokens at the output rate', () => {
    assert.equal(
        formatGeminiCost({ inputTokens: 3000, outputTokens: 3000, thoughtTokens: 0 }),
        'This reply $0.0053 (3,000 in, 3,000 out).'
    );
    assert.equal(
        formatGeminiCost({ inputTokens: 1000, outputTokens: 100, thoughtTokens: 400 }),
        'This reply $0.0010 (1,000 in, 100 out, 400 thinking).'
    );
    assert.equal(formatGeminiCost(null), '');
});

test('previewGeminiCost is higher for a full rewrite than a question', () => {
    const note = '# Ideas\n\n'.padEnd(4000, 'Ship the editor. ');
    const rewrite = previewGeminiCost({ task: 'revise', markdown: note, instruction: 'Tighten it.' });
    const question = previewGeminiCost({
        task: 'context',
        instruction: 'What is this about?',
        contextFiles: [{ name: 'Ideas.md', markdown: note }],
    });
    assert.match(rewrite, /^About \$/);
    assert.match(rewrite, /before sending\.$/);
    assert.match(question, /before sending\.$/);
    const amount = (text) => Number(text.match(/\$(\d+(?:\.\d+)?)/)[1]);
    assert.ok(amount(rewrite) > amount(question));
    assert.equal(previewGeminiCost({ task: 'revise' }), '');
});

test('revise refuses a dropped custom list', () => {
    const result = applyAiProposal({
        task: 'revise',
        original: NOTE,
        proposal: '# Ideas\n\nNo list here.\n',
    });
    assert.equal(result.ok, false);
});
