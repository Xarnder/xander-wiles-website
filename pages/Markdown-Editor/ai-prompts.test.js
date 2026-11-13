import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiProviderRequest } from './ai-prompts.js';

test('full preview includes numbered note, instruction, context, system prompt and model settings', () => {
    const body = { provider: 'gemini', task: 'revise', addOnly: true, instruction: 'Add a conclusion', markdown: '# Note\nOriginal', contextFiles: [{ name: 'Reference.md', markdown: 'Reference text' }] };
    const request = buildAiProviderRequest(body);
    const input = JSON.parse(request.input);
    assert.equal(input.instruction, body.instruction);
    assert.deepEqual(input.readOnlyNote, [{ line: 1, text: '# Note' }, { line: 2, text: 'Original' }]);
    assert.deepEqual(input.contextFiles, body.contextFiles);
    assert.match(request.system_instruction, /ONLY new text/);
    assert.match(request.system_instruction, /special date tags/);
    assert.equal(request.store, false);
    assert.deepEqual(request.generation_config, { thinking_level: 'minimal' });
});

test('OpenAI preview respects independent preference toggles and uses provider field names', () => {
    const request = buildAiProviderRequest({ provider: 'openai', task: 'header', markdown: 'Original', instruction: 'New title', compactBullets: false, includeDateTags: false });
    assert.equal(request.model, 'gpt-4.1-mini');
    assert.match(request.instructions, /Do not add new date tags/);
    assert.doesNotMatch(request.instructions, /no blank lines or extra gaps/);
    assert.doesNotMatch(request.input, /one \{\{date/);
    assert.match(request.input, /Original/);
    assert.match(request.input, /New title/);
    assert.equal(request.system_instruction, undefined);
});
