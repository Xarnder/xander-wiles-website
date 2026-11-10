import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './markdown-gemini.js';

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
