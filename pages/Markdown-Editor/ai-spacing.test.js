import test from 'node:test';
import assert from 'node:assert/strict';
import { compactAiBulletSpacing } from './ai-spacing.js';
import { applyAiProposal } from './ai.js';
import { stripAiTags } from './ai-tags.js';

test('removes whitespace-only gaps between bullet, numbered, task and nested items', () => {
    const source = '- One\n\n \t\n* Two\n\u00a0\n+ Three\n\n  - Child\n\n    - Grandchild\n\n- [ ] Todo\n\n- [x] Done\n\n1. First\n\n2) Second\n';
    const expected = '- One\n* Two\n+ Three\n  - Child\n    - Grandchild\n- [ ] Todo\n- [x] Done\n1. First\n2) Second\n';
    assert.equal(compactAiBulletSpacing(source), expected);
    assert.equal(compactAiBulletSpacing(expected), expected);
    assert.equal(compactAiBulletSpacing('- A\n\u200B \u200B\n- B'), '- A\n- B');
});

test('preserves prose, heading, rule and paragraph spacing while removing gaps after wrapped bullets', () => {
    const source = '---\n\nIntro.\n\n- First\n  continuation\n\n- Second\n\n  A second paragraph inside the item.\n\n- Third\n\n# Heading\n\n- Fourth\n\n---\n\nEnding.\n';
    const expected = source.replace('continuation\n\n-', 'continuation\n-')
        .replace('inside the item.\n\n-', 'inside the item.\n-');
    assert.equal(compactAiBulletSpacing(source), expected);
    assert.equal(compactAiBulletSpacing('---\n\n- A\n\n- B\n'), '---\n\n- A\n- B\n');
});

test('preserves fenced code, custom-list JSON, HTML comments and indented code', () => {
    for (const fence of ['```', '~~~~']) {
        const protectedText = `${fence}text\n- Code one\n\n- Code two\n${fence}\n`;
        assert.equal(compactAiBulletSpacing(protectedText + '\n- Real one\n\n- Real two\n'),
            protectedText + '\n- Real one\n- Real two\n');
    }
    const source = '```mdlist\n{"items":[]}\n\n```\n\n<!--\n- Comment\n\n- More comment\n-->\n\n    - Code\n\n    - More code\n\n- Item\n\n      - Nested code\n\n      - More nested code\n';
    assert.equal(compactAiBulletSpacing(source), source);
    const frontMatter = '---\ntags:\n- one\n\n- two\n---\n';
    assert.equal(compactAiBulletSpacing(frontMatter + '\n- A\n\n- B\n'), frontMatter + '\n- A\n- B\n');
});

test('compacts lists within blockquotes but keeps separate quotes and quoted code separate', () => {
    const source = '> - A\n>\n> - B\n\n> - C\n>\n> ```\n> - Code A\n>\n> - Code B\n> ```\n';
    assert.equal(compactAiBulletSpacing(source), source.replace('> - A\n>\n> - B', '> - A\n> - B'));
});

test('keeps date/AI tags, task checkboxes, content and original newline styles', () => {
    const source = '- A {{date:2026-11-17}} {{ai}}\r\n \t\r\n- [x] B {{ai}}\r\n';
    assert.equal(compactAiBulletSpacing(source), source.replace(' \t\r\n', ''));
    assert.equal(compactAiBulletSpacing('- A\r\r- B\r'), '- A\r- B\r');
});

test('add only removes AI blanks inside and at insertion boundaries without removing original lines', () => {
    const original = '- Original A\r\n\r\n- Original B\r\n- Original C';
    const result = applyAiProposal({ addOnly: true, original, additions: [
        { afterLine: 3, text: '\n- Added A\n\n' },
        { afterLine: 3, text: '\n- Added B\n\n' },
        { afterLine: 1, text: '\n- Added before original gap\n\n' },
    ] });
    assert.equal(result.ok, true);
    assert.equal(stripAiTags(result.markdown), '- Original A\r\n- Added before original gap\r\n\r\n- Original B\r\n- Added A\r\n- Added B\r\n- Original C');
    assert.equal(applyAiProposal({ addOnly: true, original, additions: [] }).markdown, original);
});

test('disabling the preference preserves AI gaps in both add-only and rewrite modes', () => {
    const proposal = '- New A\n\n  \n- New B\n';
    for (const addOnly of [true, false]) {
        const input = { addOnly, task: 'revise', original: '', proposal, additions: [{ afterLine: 0, text: proposal }] };
        const enabled = applyAiProposal(input);
        const disabled = applyAiProposal({ ...input, compactBullets: false });
        assert.equal(enabled.ok, true);
        assert.equal(disabled.ok, true);
        assert.equal(stripAiTags(enabled.markdown), '- New A\n- New B\n');
        assert.equal(stripAiTags(disabled.markdown), proposal);
    }
});

test('invisible empty AI lines are removed before they can become visible provenance badges', () => {
    const result = applyAiProposal({ addOnly: true, original: '- Existing\n', additions: [
        { afterLine: 1, text: '\u200B \u200B\n- New\n\u200B\n- More' },
    ] });
    assert.equal(result.ok, true);
    assert.equal(result.markdown, '- Existing\n- New {{ai}}\n- More {{ai}}\n');
});
