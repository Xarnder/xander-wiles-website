import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { aiSystemPrompt } from './markdown-gemini.js';

for (const provider of ['gemini', 'openai']) {
    test(`${provider}: revise creates content in an empty note`, async (t) => {
        const key = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
        const previous = process.env[key];
        process.env[key] = 'test-key';
        t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
        let sent;
        t.mock.method(globalThis, 'fetch', async (url, options) => {
            if (url.includes('drive/v3/about')) return Response.json({ user: { emailAddress: 'xanderwiles@gmail.com' } });
            sent = JSON.parse(options.body);
            return Response.json(provider === 'gemini'
                ? { status: 'completed', output_text: '# New note\n\nHello.' }
                : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '# New note\n\nHello.' }] }] });
        });
        const response = await handler(new Request('http://localhost/api/markdown-gemini', {
            method: 'POST', headers: { Authorization: 'Bearer regression-test-token-with-enough-characters', 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, task: 'revise', markdown: '', instruction: 'Write a greeting.' }),
        }));
        assert.equal(response.status, 200);
        assert.equal((await response.json()).markdown, '# New note\n\nHello.');
        assert.match(sent.input, /Write a greeting/);
        assert.match(sent.system_instruction || sent.instructions, /note is empty/);
    });
}

for (const provider of ['gemini', 'openai']) {
    test(`${provider}: add only sends numbered context and returns insertions without regeneration`, async (t) => {
        const key = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
        const previous = process.env[key];
        process.env[key] = 'test-key';
        t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
        let calls = 0;
        let output = '{"additions":[{"afterLine":1,"text":"New text"}]}';
        t.mock.method(globalThis, 'fetch', async (url, options) => {
            if (url.includes('drive/v3/about')) return Response.json({ user: { emailAddress: 'xanderwiles@gmail.com' } });
            calls += 1;
            const sent = JSON.parse(options.body);
            assert.deepEqual(JSON.parse(sent.input).readOnlyNote, [{ line: 1, text: 'Original' }]);
            assert.match(sent.system_instruction || sent.instructions, /ONLY new text/);
            return Response.json(provider === 'gemini' ? { status: 'completed', output_text: output }
                : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }] });
        });
        const request = () => new Request('http://localhost/api/markdown-gemini', {
            method: 'POST', headers: { Authorization: 'Bearer fixture' },
            body: JSON.stringify({ provider, task: 'revise', addOnly: true, markdown: 'Original', instruction: 'Add a paragraph' }),
        });
        const good = await handler(request());
        assert.equal(good.status, 200);
        assert.deepEqual((await good.json()).additions, [{ afterLine: 1, text: 'New text' }]);
        assert.equal(calls, 1);
        output = 'Here is a full rewrite';
        const bad = await handler(request());
        assert.equal(bad.status, 502);
        assert.match((await bad.json()).error, /invalid insertion JSON/);
        assert.equal(calls, 2, 'invalid output must not trigger automatic regeneration');
    });
}


test('compact bullet instructions are on by default and can be disabled in every mode', () => {
    for (const [task, addOnly] of [['context', false], ['revise', true], ['revise', false], ['summarize', false]]) {
        assert.match(aiSystemPrompt(task, addOnly), /no blank lines or extra gaps/);
        assert.doesNotMatch(aiSystemPrompt(task, addOnly, false), /no blank lines or extra gaps/);
    }
});


test('date tag instructions default on with an example and can be disabled independently', () => {
    for (const [task, addOnly] of [['context', false], ['revise', true], ['header', false]]) {
        assert.match(aiSystemPrompt(task, addOnly), /Example:.*\{\{date:\d{4}-\d{2}-\d{2}\}\}/);
        const off = aiSystemPrompt(task, addOnly, true, false);
        assert.doesNotMatch(off, /Example:|one \{\{date/);
        assert.match(off, /Do not add new date tags/);
        assert.match(off, /no blank lines/);
    }
    assert.match(aiSystemPrompt('revise', true, false, true), /Include our special date tags/);
});
