/** A modal gate: cancel leaves the session untouched; failures allow retry without opening the new note. */
export function promptAiNoteSwitch(dialog, { previousName, nextName, onSave }) {
    if (!dialog || dialog.open) return Promise.resolve(false);
    const message = dialog.querySelector('[data-ai-switch-message]');
    const status = dialog.querySelector('[data-ai-switch-status]');
    const cancel = dialog.querySelector('[data-ai-switch-cancel]');
    const save = dialog.querySelector('[data-ai-switch-save]');
    message.textContent = `Save the previous AI edits and history for “${previousName || 'the current note'}”, then reset before opening “${nextName || 'another note'}”?`;
    status.hidden = true;
    status.textContent = '';
    status.classList.remove('is-error');
    cancel.disabled = false;
    save.disabled = false;
    save.textContent = 'Save and reset';
    dialog.returnValue = '';

    return new Promise(resolve => {
        let saving = false;
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            dialog.removeEventListener('cancel', onCancelKey);
            cancel.removeEventListener('click', onCancel);
            save.removeEventListener('click', onConfirm);
            resolve(dialog.returnValue === 'saved');
        };
        const onCancelKey = event => { if (saving) event.preventDefault(); };
        const onCancel = () => { if (!saving) dialog.close('cancel'); };
        const onConfirm = async () => {
            if (saving) return;
            saving = true;
            cancel.disabled = true;
            save.disabled = true;
            save.textContent = 'Saving…';
            save.setAttribute('aria-busy', 'true');
            status.hidden = false;
            status.classList.remove('is-error');
            status.textContent = 'Saving and verifying…';
            try {
                const saved = await onSave(message => { status.textContent = message; });
                if (!saved) throw new Error('Saving could not finish. Your AI session has been kept.');
                dialog.close('saved');
            } catch (err) {
                status.textContent = `${err?.message || 'Could not save.'} The new note has not been opened. Retry Save and reset, or Cancel to keep the current session.`;
                status.classList.add('is-error');
            } finally {
                saving = false;
                cancel.disabled = false;
                save.disabled = false;
                save.textContent = 'Save and reset';
                save.setAttribute('aria-busy', 'false');
            }
        };
        dialog.addEventListener('close', onClose);
        dialog.addEventListener('cancel', onCancelKey);
        cancel.addEventListener('click', onCancel);
        save.addEventListener('click', onConfirm);
        dialog.showModal();
        cancel.focus();
    });
}
