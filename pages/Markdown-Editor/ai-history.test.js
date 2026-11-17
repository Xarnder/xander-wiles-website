import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addAiHistoryTurn, commitAiSession, createAiHistorySession, createAiHistoryStore,
    createAiSaveAttempt, parseAiHistory,
} from './ai-history.js';

function fixture(markdown = '# Saved\n- New item') {
    const session = createAiHistorySession();
    const turn = addAiHistoryTurn(session, { instruction: 'Add an item', provider: 'gemini', addOnly: true, markdown: '' },
        [{ id: 'note-1', name: 'Note.md', role: 'add', markdown: '' }]);
    turn.response = { additions: [{ afterLine: 0, markdown }] };
    turn.proposedMarkdown = markdown;
    turn.outcome = 'proposal';
    return createAiSaveAttempt(session, { id: 'note-1', name: 'Note.md', markdown });
}

function driveFixture() {
    const files = new Map();
    const events = [];
    let loseCreateResponse = false;
    let failUpdate = false;
    let failReadAfterUpdate = false;
    let failNextRead = false;
    const io = {
        async list(name) {
            return [...files.values()].filter(file => !name || name === file.name).map(({ id, name }) => ({ id, name }));
        },
        async read(id) {
            events.push('read-history');
            if (failNextRead) { failNextRead = false; throw new Error('Network lost during read-back'); }
            return files.get(id).content;
        },
        async create(name, content) {
            events.push('create-history');
            const file = { id: `history-${files.size}`, name, content };
            files.set(file.id, file);
            if (loseCreateResponse) { loseCreateResponse = false; throw new Error('Create response lost'); }
            return { id: file.id, name };
        },
        async update(id, content) {
            events.push('complete-history');
            if (failUpdate) throw new Error('History upload failed');
            files.get(id).content = content;
            if (failReadAfterUpdate) { failReadAfterUpdate = false; failNextRead = true; }
        },
    };
    return {
        store: createAiHistoryStore(io), files, events,
        loseCreateResponse: () => { loseCreateResponse = true; },
        failUpdate: value => { failUpdate = value; },
        failReadAfterUpdate: () => { failReadAfterUpdate = true; },
    };
}

test('save archives a recovery snapshot, verifies the note, verifies history, and only then resets', async () => {
    const drive = driveFixture();
    const attempt = fixture();
    await commitAiSession(attempt, {
        history: drive.store,
        async saveNote(note) {
            drive.events.push('save-and-verify-note');
            const recovery = await drive.store.read(attempt.file);
            assert.equal(recovery.status, 'pending');
            assert.equal(recovery.turns[0].files[0].markdown, '', 'empty original notes are preserved');
            return note;
        },
        reset() {
            drive.events.push('reset');
            assert.equal(JSON.parse(drive.files.get(attempt.file.id).content).status, 'saved');
        },
    });
    assert.deepEqual(drive.events, ['create-history', 'read-history', 'save-and-verify-note', 'read-history', 'read-history', 'complete-history', 'read-history', 'reset']);
});

test('failed note save keeps a readable recovery record and does not reset', async () => {
    const drive = driveFixture();
    const attempt = fixture();
    await assert.rejects(commitAiSession(attempt, {
        history: drive.store,
        saveNote: async () => { throw new Error('Drive quota exceeded'); },
        reset: () => assert.fail('must not reset'),
    }), /quota exceeded/);
    const recovery = await drive.store.read(attempt.file);
    assert.equal(recovery.status, 'pending');
    assert.equal(recovery.note.markdown, attempt.record.note.markdown);
    assert.equal(attempt.receipt, null);
    assert.ok(!drive.events.includes('complete-history'));
});

test('no note write happens if recovery history cannot be saved', async () => {
    await assert.rejects(commitAiSession(fixture(), {
        history: { prepare: async () => { throw new Error('Permission denied'); } },
        saveNote: () => assert.fail('must not change note'),
        reset: () => assert.fail('must not reset'),
    }), /Permission denied/);
});

test('history read-back mismatch blocks the note write and reset', async () => {
    const attempt = fixture();
    const history = createAiHistoryStore({
        list: async () => [],
        create: async () => ({ id: 'history' }),
        read: async () => JSON.stringify({ ...attempt.record, note: { ...attempt.record.note, markdown: 'Truncated' } }),
    });
    await assert.rejects(commitAiSession(attempt, {
        history, saveNote: () => assert.fail('must not save'), reset: () => assert.fail('must not reset'),
    }), /verification failed/);
});

test('mismatched note verification never completes history or resets', async () => {
    for (const receipt of [undefined, { id: 'another-note', markdown: '# Saved\n- New item' }, { id: 'note-1', markdown: 'old' }]) {
        const drive = driveFixture();
        const attempt = fixture();
        await assert.rejects(commitAiSession(attempt, {
            history: drive.store, saveNote: async () => receipt,
            reset: () => assert.fail('must not reset'),
        }), /did not match/);
        assert.equal(attempt.receipt, null);
        assert.equal((await drive.store.read(attempt.file)).status, 'pending');
    }
});

for (const failure of ['upload', 'read-back']) {
    test(`retry after history ${failure} failure does not save or apply the note twice`, async () => {
        const drive = driveFixture();
        const attempt = fixture();
        let noteSaves = 0;
        let resets = 0;
        if (failure === 'upload') drive.failUpdate(true);
        else drive.failReadAfterUpdate();
        const callbacks = {
            history: drive.store,
            saveNote: async note => { noteSaves += 1; return note; },
            reset: () => { resets += 1; },
        };
        await assert.rejects(commitAiSession(attempt, callbacks), /failed|lost/);
        assert.equal(resets, 0);
        assert.equal(noteSaves, 1);
        drive.failUpdate(false);
        await commitAiSession(attempt, callbacks);
        assert.equal(resets, 1);
        assert.equal(noteSaves, 1);
        assert.equal(drive.files.size, 1);
        assert.equal((await drive.store.read(attempt.file)).status, 'saved');
    });
}

test('lost create response reuses the same session file when Save is retried', async () => {
    const drive = driveFixture();
    drive.loseCreateResponse();
    const attempt = fixture();
    const callbacks = { history: drive.store, saveNote: async note => note, reset() {} };
    await assert.rejects(commitAiSession(attempt, callbacks), /Create response lost/);
    assert.equal(attempt.file, null);
    assert.equal(drive.files.size, 1);
    await commitAiSession(attempt, callbacks);
    assert.equal(drive.files.size, 1);
});

test('context-only sessions archive and reset without saving any open document', async () => {
    const drive = driveFixture();
    const attempt = fixture();
    attempt.record.note = null;
    let resets = 0;
    await commitAiSession(attempt, {
        history: drive.store,
        saveNote: () => assert.fail('context must never save an unrelated note'),
        reset: () => { resets += 1; },
    });
    assert.equal(resets, 1);
    assert.equal((await drive.store.read(attempt.file)).note, null);
});

test('all sent turns retain independent original note snapshots and the Save snapshot is immutable', () => {
    const session = createAiHistorySession();
    const files = [{ id: 'note', name: 'Original.md', markdown: '', role: 'add' }];
    const request = { instruction: 'Original message', provider: 'gemini' };
    addAiHistoryTurn(session, request, files);
    request.instruction = 'Edited message';
    files[0].markdown = 'Changed later';
    addAiHistoryTurn(session, request, files);
    const attempt = createAiSaveAttempt(session);
    session.turns[0].request.instruction = 'Changed after Save';
    assert.equal(attempt.record.turns[0].request.instruction, 'Original message');
    assert.equal(attempt.record.turns[0].files[0].markdown, '');
    assert.equal(attempt.record.turns[1].request.instruction, 'Edited message');
    assert.equal(attempt.record.turns[1].files[0].markdown, 'Changed later');
});

test('simultaneous sessions use separate files and do not overwrite one another', async () => {
    const drive = driveFixture();
    const one = fixture('First result');
    const two = fixture('Second result');
    await Promise.all([one, two].map(attempt => commitAiSession(attempt, {
        history: drive.store, saveNote: async note => note, reset() {},
    })));
    assert.equal((await drive.store.list()).length, 2);
    assert.equal((await drive.store.read(one.file)).note.markdown, 'First result');
    assert.equal((await drive.store.read(two.file)).note.markdown, 'Second result');
});

test('a conflicting existing history record is never overwritten', async () => {
    const drive = driveFixture();
    const attempt = fixture();
    const file = await drive.store.prepare(attempt.record);
    const original = drive.files.get(file.id).content;
    attempt.record.note.markdown = 'Unexpected different snapshot';
    await assert.rejects(drive.store.prepare(attempt.record), /does not match/);
    assert.equal(drive.files.get(file.id).content, original);
});

test('damaged or future-format history fails visibly instead of being treated as saved', () => {
    for (const text of ['{broken', '{}', JSON.stringify({ ...fixture().record, version: 2 }), JSON.stringify({ ...fixture().record, note: {} })]) {
        assert.throws(() => parseAiHistory(text));
    }
    const record = fixture('').record;
    assert.deepEqual(parseAiHistory(JSON.stringify(record)), record);
});
