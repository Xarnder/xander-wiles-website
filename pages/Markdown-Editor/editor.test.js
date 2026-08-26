/**
 * Node test runner for editor save-conflict helpers.
 * Run: node --test pages/Markdown-Editor/editor.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRemoteContentChange } from './editor.js';

test('matching Drive version is not a conflict', () => {
    assert.equal(
        classifyRemoteContentChange({
            expectedVersion: '5',
            remoteVersion: 5,
            snapshot: 'new',
            baseline: 'old',
            driveContent: 'other',
        }),
        'proceed'
    );
});

test('same local snapshot as Drive is already saved', () => {
    assert.equal(
        classifyRemoteContentChange({
            expectedVersion: '5',
            remoteVersion: '6',
            snapshot: 'hello',
            baseline: 'old',
            driveContent: 'hello',
        }),
        'same-as-local'
    );
});

test('version bump with unchanged markdown is not a conflict', () => {
    assert.equal(
        classifyRemoteContentChange({
            expectedVersion: '5',
            remoteVersion: '6',
            snapshot: 'my new edit',
            baseline: 'old text',
            driveContent: 'old text',
        }),
        'proceed'
    );
});

test('different Drive text is a real conflict', () => {
    assert.equal(
        classifyRemoteContentChange({
            expectedVersion: '5',
            remoteVersion: '6',
            snapshot: 'mine',
            baseline: 'old',
            driveContent: 'from another device',
        }),
        'conflict'
    );
});
