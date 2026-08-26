/**
 * Node test runner for revision helpers.
 * Run: node --test pages/Markdown-Editor/revisions.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldProtectPreviousHead } from './revisions.js';

test('does not pin a missing previous head', () => {
    assert.equal(shouldProtectPreviousHead(null, 'rev-2'), false);
    assert.equal(shouldProtectPreviousHead('', 'rev-2'), false);
});

test('does not pin the live head (Drive rejects keepForever on current)', () => {
    assert.equal(shouldProtectPreviousHead('rev-1', 'rev-1'), false);
});

test('pins the retired head after a new upload', () => {
    assert.equal(shouldProtectPreviousHead('rev-1', 'rev-2'), true);
});
