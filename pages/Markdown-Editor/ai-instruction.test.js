import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAiInstruction } from './ai-panel.js';

test('Send Again prioritizes a new draft over the previous sent message', () => {
    assert.equal(chooseAiInstruction('  Add a different paragraph.  ', 'Old instruction'), 'Add a different paragraph.');
    assert.equal(chooseAiInstruction('New\nmultiline draft', 'Old instruction'), 'New\nmultiline draft');
});

test('only an empty draft resends the previous instruction', () => {
    assert.equal(chooseAiInstruction('', 'Previous instruction'), 'Previous instruction');
    assert.equal(chooseAiInstruction(' \n\t ', 'Previous instruction'), 'Previous instruction');
    assert.equal(chooseAiInstruction('', ''), '');
});
