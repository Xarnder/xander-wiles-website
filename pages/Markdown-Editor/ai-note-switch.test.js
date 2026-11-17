import test from 'node:test';
import assert from 'node:assert/strict';
import { promptAiNoteSwitch } from './ai-note-switch.js';

class Control extends EventTarget {
    disabled = false;
    textContent = '';
    hidden = false;
    classList = { add() {}, remove() {} };
    setAttribute() {}
    focus() { this.focused = true; }
    click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

class Dialog extends EventTarget {
    open = false;
    returnValue = 'saved'; // A previous use must not accidentally approve the next note.
    controls = Object.fromEntries(['message', 'status', 'cancel', 'save'].map(key => [key, new Control()]));
    querySelector(selector) { return this.controls[selector.match(/data-ai-switch-(\w+)/)[1]]; }
    showModal() { this.open = true; }
    close(value) {
        if (value !== undefined) this.returnValue = value;
        this.open = false;
        this.dispatchEvent(new Event('close'));
    }
    escape() {
        if (this.dispatchEvent(new Event('cancel', { cancelable: true }))) this.close();
    }
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const names = { previousName: 'Previous.md', nextName: 'Next.md' };

test('Cancel and Escape abort switching without saving or discarding the existing session', async () => {
    const dialog = new Dialog();
    for (const cancel of [() => dialog.controls.cancel.click(), () => dialog.escape()]) {
        const decision = promptAiNoteSwitch(dialog, { ...names, onSave: () => assert.fail('must not save on cancel') });
        assert.ok(dialog.controls.message.textContent.includes('Previous.md'));
        assert.ok(dialog.controls.message.textContent.includes('Next.md'));
        assert.equal(dialog.controls.cancel.focused, true);
        cancel();
        assert.equal(await decision, false);
    }
});

test('the new note waits for verified Save; duplicate taps and Escape cannot interrupt saving', async () => {
    const dialog = new Dialog();
    let finish;
    let saves = 0;
    let allowed = false;
    const decision = promptAiNoteSwitch(dialog, {
        ...names,
        onSave: progress => {
            saves += 1;
            progress('Verifying AI history…');
            return new Promise(resolve => { finish = resolve; });
        },
    }).then(result => { allowed = result; return result; });
    dialog.controls.save.click();
    dialog.controls.save.dispatchEvent(new Event('click'));
    dialog.controls.cancel.click();
    dialog.escape();
    await tick();
    assert.equal(saves, 1);
    assert.equal(dialog.open, true);
    assert.equal(allowed, false);
    assert.equal(dialog.controls.status.textContent, 'Verifying AI history…');
    assert.equal(dialog.controls.save.disabled, true);
    assert.equal(dialog.controls.cancel.disabled, true);
    finish(true);
    assert.equal(await decision, true);
    assert.equal(dialog.open, false);
});

test('save failures stay in the modal with their reason and can be retried', async () => {
    const dialog = new Dialog();
    let saves = 0;
    const decision = promptAiNoteSwitch(dialog, { ...names, onSave: async () => {
        if (++saves === 1) throw new Error('Drive verification failed');
        return true;
    } });
    dialog.controls.save.click();
    await tick();
    assert.equal(dialog.open, true);
    assert.match(dialog.controls.status.textContent, /Drive verification failed/);
    assert.match(dialog.controls.status.textContent, /new note has not been opened/);
    assert.equal(dialog.controls.save.disabled, false);
    assert.equal(dialog.controls.cancel.disabled, false);
    dialog.controls.save.click();
    assert.equal(await decision, true);
    assert.equal(saves, 2);
});

test('an incomplete Save never approves a switch and Cancel remains available', async () => {
    const dialog = new Dialog();
    const decision = promptAiNoteSwitch(dialog, { ...names, onSave: async () => false });
    dialog.controls.save.click();
    await tick();
    assert.equal(dialog.open, true);
    assert.match(dialog.controls.status.textContent, /could not finish/);
    dialog.controls.cancel.click();
    assert.equal(await decision, false);
});

test('a missing or already active dialog fails closed instead of opening another note', async () => {
    assert.equal(await promptAiNoteSwitch(null, names), false);
    const dialog = new Dialog();
    dialog.open = true;
    assert.equal(await promptAiNoteSwitch(dialog, names), false);
});
