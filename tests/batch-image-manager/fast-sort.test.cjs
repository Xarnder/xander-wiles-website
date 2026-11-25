const test = require('node:test');
const assert = require('node:assert/strict');
const { Session, KEYS, shortcutIndex, uniquePath, validateFolderName } = require('../../pages/Batch_Image_Manger/fast-sort.js');

function batch(folders = ['(Root)', '(Root)', 'Keep']) {
    const session = new Session();
    session.sync({ files: folders.map((_, i) => ({ name: `${i}.png` })), folders, availableFolders: ['(Root)', 'Keep', 'Reject'] });
    session.started = true;
    return session;
}

test('shortcuts follow the number row and then each QWERTY row', () => {
    assert.equal(KEYS, '1234567890qwertyuiopasdfghjklzxcvbnm');
    assert.equal(new Set(KEYS).size, 36);
    assert.equal(shortcutIndex({ code: 'Digit1', key: '1' }), 0);
    assert.equal(shortcutIndex({ code: 'Digit0', key: '0' }), 9);
    assert.equal(shortcutIndex({ code: 'KeyQ', key: 'q' }), 10);
    assert.equal(shortcutIndex({ code: 'KeyA', key: 'a' }), 20);
    assert.equal(shortcutIndex({ code: 'KeyZ', key: 'z' }), 29);
    assert.equal(shortcutIndex({ code: 'KeyM', key: 'm' }), 35);
    for (const modifier of ['repeat', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing']) {
        assert.equal(shortcutIndex({ key: '1', [modifier]: true }), -1);
    }
    assert.equal(shortcutIndex({ key: 'ArrowRight' }), -1);
});

test('assignment advances once, skipping preserves folders, completion does not wrap', () => {
    const session = batch();
    session.advance('Reject');
    assert.deepEqual(session.folders, ['Reject', '(Root)', 'Keep']);
    assert.equal(session.cursor, 1);
    session.advance();
    assert.equal(session.folders[1], '(Root)');
    session.advance('Reject');
    assert.equal(session.complete, true);
    assert.equal(session.advance('Keep'), false);
    assert.equal(session.cursor, 3);
    session.undo();
    assert.equal(session.complete, false);
    assert.equal(session.cursor, 2);
    assert.equal(session.folders[2], 'Keep');
    session.undo();
    assert.equal(session.cursor, 1);
    session.undo();
    assert.equal(session.folders[0], '(Root)');
    assert.equal(session.undo(), false);
});

test('setup and invalid destinations cannot sort an image', () => {
    const session = batch();
    session.started = false;
    assert.equal(session.advance('Keep'), false);
    session.started = true;
    assert.equal(session.advance('Missing'), false);
    assert.equal(session.cursor, 0);
});

test('rename keeps shortcut positions and updates prior assignments and undo history', () => {
    const session = batch(['Keep', '(Root)', 'Keep']);
    session.advance('Reject');
    session.renameFolder('Keep', 'Z favourites');
    assert.deepEqual(session.destinations, ['Z favourites', 'Reject']);
    assert.equal(session.folders[2], 'Z favourites');
    session.undo();
    assert.equal(session.folders[0], 'Z favourites');
    session.addFolder('A new folder');
    assert.deepEqual(session.destinations, ['Z favourites', 'Reject', 'A new folder']);
});

test('renaming a parent also renames nested folders and preserves their keys', () => {
    const session = batch(['Keep', 'Keep/Portraits', 'Keep/Portraits/Best']);
    const oldKeys = [...session.destinations];
    session.renameFolder('Keep', 'Selected');
    assert.deepEqual(session.folders, ['Selected', 'Selected/Portraits', 'Selected/Portraits/Best']);
    assert.deepEqual(session.destinations, oldKeys.map(name => name.replace(/^Keep/, 'Selected')));
});

test('folder validation and rename collisions leave the session unchanged', () => {
    const session = batch();
    for (const name of ['', '../out', '/out', 'a//b', 'a/../b', '(Root)', 'a/(root)', 'a\\b', 'a:b', 'nul', 'a.', 'a/ b']) {
        assert.throws(() => session.addFolder(name), name);
    }
    assert.equal(validateFolderName('  Holidays/Paris  '), 'Holidays/Paris');
    assert.throws(() => session.addFolder('keep'));
    assert.throws(() => session.renameFolder('Keep', 'reject'));
    assert.throws(() => session.renameFolder('Keep', 'Keep/Nested'));
    session.addFolder('Photos/Portraits');
    assert.throws(() => session.renameFolder('Keep', 'Photos'));
    assert.equal(session.destinations[0], 'Keep');
    session.renameFolder('Keep', 'KEEP');
    assert.equal(session.destinations[0], 'KEEP');
});

test('closing and reopening retains progress and keys despite dropdown alphabetical order', () => {
    const session = batch();
    session.advance('Keep');
    session.renameFolder('Keep', 'Zebra');
    session.sync({ files: session.files, folders: session.folders, availableFolders: ['(Root)', 'Reject', 'Zebra'] });
    assert.equal(session.cursor, 1);
    assert.equal(session.started, true);
    assert.deepEqual(session.destinations, ['Zebra', 'Reject']);
    session.undo();
    assert.equal(session.folders[0], '(Root)');
});

test('new uploads, reorder, and external folder changes reset stale undo state', () => {
    const session = batch();
    session.advance('Keep');
    session.sync({ files: [...session.files].reverse(), folders: [...session.folders].reverse(), availableFolders: ['(Root)', 'Keep'] });
    assert.equal(session.cursor, 0);
    assert.equal(session.history.length, 0);
    assert.equal(session.started, false);
    session.started = true;
    session.advance('Keep');
    session.sync({ files: session.files, folders: ['Reject', ...session.folders.slice(1)], availableFolders: session.availableFolders });
    assert.equal(session.history.length, 0);
});

test('duplicate ZIP paths are numbered without overwriting any file', () => {
    const paths = new Set();
    assert.equal(uniquePath('Keep', 'photo.png', paths), 'Keep/photo.png');
    assert.equal(uniquePath('Keep', 'photo.png', paths), 'Keep/photo (2).png');
    assert.equal(uniquePath('Keep', 'PHOTO.PNG', paths), 'Keep/PHOTO (3).PNG');
    assert.equal(uniquePath('Keep', 'photo (2).png', paths), 'Keep/photo (2) (2).png');
    assert.equal(uniquePath('Reject', 'photo.png', paths), 'Reject/photo.png');
    assert.equal(uniquePath('(Root)', 'photo.png', paths), 'photo.png');
    assert.equal(uniquePath('(Root)', 'photo.png', paths), 'photo (2).png');
    assert.equal(paths.size, 7);
});
