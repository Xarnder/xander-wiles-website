/**
 * Run: node --test pages/Markdown-Editor/ai.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAiProposal, diffLines, formatGeminiCost, stripWrappingFence } from './ai.js';

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

test('formatGeminiCost bills thinking tokens at the output rate', () => {
    assert.equal(
        formatGeminiCost({ inputTokens: 3000, outputTokens: 3000, thoughtTokens: 0 }),
        'Estimated cost $0.0053 (3,000 in, 3,000 out).'
    );
    assert.equal(
        formatGeminiCost({ inputTokens: 1000, outputTokens: 100, thoughtTokens: 400 }),
        'Estimated cost $0.0010 (1,000 in, 100 out, 400 thinking).'
    );
    assert.equal(formatGeminiCost(null), '');
});

test('revise refuses a dropped custom list', () => {
    const result = applyAiProposal({
        task: 'revise',
        original: NOTE,
        proposal: '# Ideas\n\nNo list here.\n',
    });
    assert.equal(result.ok, false);
});
