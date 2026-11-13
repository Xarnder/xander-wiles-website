import test from 'node:test';
import assert from 'node:assert/strict';
import { revealAiError } from './ui.js';
import { applyAiProposal } from './ai.js';

test('an AI error opens collapsed help and scrolls the message into view', () => {
    const help = { open: false };
    const debug = { closest: selector => selector === 'details' ? help : null };
    let scrolled = false;
    revealAiError({ closest: () => debug, scrollIntoView: () => { scrolled = true; } });
    assert.equal(help.open, true);
    assert.equal(scrolled, true);
});

test('a proposal can populate a blank note', () => {
    const result = applyAiProposal({ task: 'revise', original: '', proposal: '# New note\n\nHello.' });
    assert.equal(result.ok, true);
    assert.equal(result.markdown, '# New note\n\nHello.\n');
});

import { assertAiSaveConfirmed } from './editor.js';

test('AI save confirms the correct Drive baseline, including an autosaved edit', () => {
    assert.doesNotThrow(() => assertAiSaveConfirmed({ fileId: 'note', status: 'saved', dirty: false, originalContent: '# AI edit\r\n' }, 'note', '# AI edit\n'));
});

test('AI save rejects swallowed failures, conflicts, dirty buffers and wrong files', () => {
    const saved = { fileId: 'note', status: 'saved', dirty: false, originalContent: '# AI edit' };
    for (const changed of [
        { status: 'error', errorMessage: 'Drive offline' },
        { status: 'conflict' },
        { dirty: true },
        { originalContent: '# Old text' },
        { fileId: 'other' },
    ]) {
        assert.throws(() => assertAiSaveConfirmed({ ...saved, ...changed }, 'note', '# AI edit'));
    }
});
