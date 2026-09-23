import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ENTRY_LOAD_TIMEOUT_CODE,
    entryLoadErrorMessage,
    isIOSFirestoreClient,
    isUsableEntrySnapshot
} from './entryLoad.js';

function snapshot({ exists = true, fromCache = false } = {}) {
    return {
        exists: () => exists,
        metadata: { fromCache }
    };
}

test('cached missing documents are not treated as empty entries', () => {
    assert.equal(isUsableEntrySnapshot(snapshot({ exists: false, fromCache: true })), false);
});

test('a cached existing document can paint before the server answers', () => {
    assert.equal(isUsableEntrySnapshot(snapshot({ exists: true, fromCache: true })), true);
});

test('a second cached snapshot does not replace the entry already on screen', () => {
    assert.equal(
        isUsableEntrySnapshot(snapshot({ exists: true, fromCache: true }), { alreadyApplied: true }),
        false
    );
});

test('a server snapshot can confirm an empty day or refresh an open entry', () => {
    assert.equal(isUsableEntrySnapshot(snapshot({ exists: false, fromCache: false })), true);
    assert.equal(
        isUsableEntrySnapshot(snapshot({ exists: true, fromCache: false }), { alreadyApplied: true }),
        true
    );
});

test('iOS home-screen devices are detected, including iPad desktop mode', () => {
    assert.equal(isIOSFirestoreClient('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), true);
    assert.equal(isIOSFirestoreClient('Mozilla/5.0 (Macintosh)', { platform: 'MacIntel', maxTouchPoints: 5 }), true);
    assert.equal(isIOSFirestoreClient('Mozilla/5.0 (Macintosh)', { platform: 'MacIntel', maxTouchPoints: 0 }), false);
});

test('timeouts get the iOS recovery message', () => {
    assert.match(entryLoadErrorMessage({ code: ENTRY_LOAD_TIMEOUT_CODE }), /too long to load/);
    assert.match(entryLoadErrorMessage({ code: 'permission-denied' }), /could not be loaded/);
});
