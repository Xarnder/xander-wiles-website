import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAiProposal } from './ai.js';
import { stampAiAuthorship, stripAiTags } from './ai-tags.js';
import { renderInline, renderMarkdown, extractMarkdownHeadings, splitMarkdownBlocks, joinMarkdownBlocks } from './markdown.js';
import { parseDocument, serializeDocument } from './lists.js';

test('add only stamps each new content line without touching original bytes, even duplicate text', () => {
    const original = '# Human\r\n\r\n- Same\r\n- Old AI {{ai}}\r\n';
    const result = applyAiProposal({ addOnly: true, original, additions: [{ afterLine: 2, text: '- Same\n  - New nested\n\nNew paragraph' }] });
    assert.equal(result.ok, true);
    assert.equal(result.markdown, '# Human\r\n\r\n- Same {{ai}}\r\n  - New nested {{ai}}\r\n\r\nNew paragraph {{ai}}\r\n- Same\r\n- Old AI {{ai}}\r\n');
    assert.equal(applyAiProposal({ addOnly: true, original, additions: [] }).markdown, original);
});

test('rewrites mark changed lines, retain existing provenance, and leave moved human lines alone', () => {
    const original = '# Human\nFirst\nOld AI {{ai}}\nRemove\nLast\n';
    const proposal = '# Human {{ai}}\nLast\nOld AI\nChanged\nFirst\n';
    const result = applyAiProposal({ task: 'revise', original, proposal });
    assert.equal(result.markdown, '# Human\nLast\nOld AI {{ai}}\nChanged {{ai}}\nFirst\n');
    assert.equal(stampAiAuthorship(result.markdown, result.markdown), result.markdown);
    assert.equal(stampAiAuthorship('First\nFirst\n', 'First\n'), 'First\nFirst {{ai}}\n');
});

test('empty notes, multiline text, headings, quotes and hard breaks keep their Markdown structure', () => {
    const original = '# Title #\n\nParagraph  \nSecond line\n\n> Quote\n>\n> More\n\nSetext\n==\n\n---\n\n{{date:2026-11-17}}\n';
    const stamped = stampAiAuthorship(original);
    assert.equal(stripAiTags(stamped), original);
    assert.match(stamped, /Paragraph \{\{ai\}\}  \n/);
    const html = renderMarkdown(stamped);
    assert.match(html, /<h1[^>]*>Title <span class="md-ai-tag"/);
    assert.match(html, /<blockquote\b/);
    assert.match(html, /<hr/);
    assert.doesNotMatch(html, /\{\{ai\}\}/);
    assert.equal((html.match(/class="md-ai-tag"/g) || []).length, 6);
});

test('normal lists retain tagged titles and every nested or continuation line through serialization', () => {
    const source = stampAiAuthorship('# List\n\n- Parent\n  continuation\n  - Child\n- Sibling\n');
    const blocks = splitMarkdownBlocks(source);
    assert.equal(blocks[0].title, 'List {{ai}}');
    const serialized = joinMarkdownBlocks(blocks);
    assert.equal((serialized.match(/\{\{ai\}\}/g) || []).length, 5);
    assert.deepEqual(extractMarkdownHeadings(source), extractMarkdownHeadings(stripAiTags(source)));
    assert.equal(extractMarkdownHeadings(source)[0].title, 'List');
    const doc = serializeDocument(parseDocument(source));
    assert.equal((doc.match(/\{\{ai\}\}/g) || []).length, 5);
    assert.equal(splitMarkdownBlocks('A sentence. {{ai}}\n\n- Item {{ai}}')[0].type, 'markdown');
});

test('tables keep their cell count and alignment; syntax-only separators are never tagged', () => {
    const source = '| Left | Right |\n| :--- | ---: |\n| A | B |\n';
    const stamped = stampAiAuthorship(source);
    assert.equal(stripAiTags(stamped), source);
    const html = renderMarkdown(stamped);
    assert.equal((html.match(/<th /g) || []).length, 2);
    assert.equal((html.match(/<td /g) || []).length, 2);
    assert.equal((html.match(/class="md-ai-tag"/g) || []).length, 2);
    assert.match(html, /text-align:right/);
});

test('code lines show badges without exposing tags or interpreting code as HTML', () => {
    const source = '```js\nconst x = "<img src=x onerror=alert(1)>";\n\nconsole.log(x);\n```\n';
    const stamped = stampAiAuthorship(source);
    assert.equal(stripAiTags(stamped), source);
    const html = renderMarkdown(stamped);
    assert.equal((html.match(/class="md-ai-tag"/g) || []).length, 2);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img|\{\{ai\}\}/);
});

test('custom-list JSON stays valid and only changed text fields receive provenance', () => {
    const list = { version: 1, id: 'list', title: 'Human title', items: [
        { id: 'a', text: 'Keep this', score: 2, tags: [] },
        { id: 'b', text: 'Old text', score: 1, tags: [] },
    ] };
    const markdown = value => '```mdlist\r\n' + JSON.stringify(value, null, 2).replace(/\n/g, '\r\n') + '\r\n```\r\n';
    const original = markdown(list);
    assert.equal(stampAiAuthorship(original, original), original);
    list.items[1].text = 'Changed\nAnother line';
    const result = applyAiProposal({ task: 'revise', original, proposal: markdown(list) });
    assert.equal(result.ok, true);
    const doc = parseDocument(result.markdown.replace(/\r\n/g, '\n'));
    assert.equal(doc.hasError, false);
    const saved = doc.segments.find(seg => seg.type === 'mdlist').list;
    assert.equal(saved.title, 'Human title');
    assert.equal(saved.items[0].text, 'Keep this');
    assert.equal(saved.items[1].text, 'Changed {{ai}}\nAnother line {{ai}}');
    assert.deepEqual(saved.items.map(item => item.id), ['a', 'b']);
});

test('AI badges coexist with date visibility, escape markup, and cannot enter link attributes', () => {
    for (const showDates of [false, true]) {
        const html = renderInline('Point {{date:2026-11-17}} {{ai}}', { showDates });
        assert.match(html, /class="md-ai-tag"/);
        assert.equal(html.includes('class="md-date-tag"'), showDates);
        assert.doesNotMatch(html, /\{\{(?:ai|date)/);
    }
    const html = renderInline('[Link](https://example.com/{{ai}}) <script> {{ai}}');
    assert.match(html, /href="https:\/\/example.com\/"/);
    assert.equal((html.match(/class="md-ai-tag"/g) || []).length, 1);
    assert.doesNotMatch(html, /<script>/);
});

test('custom-list fence whitespace and incomplete existing blocks never receive tags in JSON syntax', () => {
    const original = '``` mdlist\n{"version":1,"id":"a","items":[{"id":"b","text":"Old"}]}\n```\n';
    const stamped = stampAiAuthorship(original.replace('Old', 'New'), original);
    const doc = parseDocument(stamped);
    assert.equal(doc.hasError, false);
    assert.equal(doc.segments[0].list.items[0].text, 'New {{ai}}');
    assert.equal(stampAiAuthorship(original, original), original);
    const incomplete = '```mdlist\n{"id":"unfinished"}';
    assert.equal(stampAiAuthorship(incomplete, incomplete), incomplete);
});
