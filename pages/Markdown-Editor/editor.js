import { DRAFT_KEY_PREFIX } from './config.js';

function draftKey(fileId) {
    return `${DRAFT_KEY_PREFIX}${fileId}`;
}

/** Normalize line endings so Drive CRLF vs editor LF is not treated as an edit. */
export function normalizeEditorText(text) {
    return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function textsEqual(a, b) {
    return normalizeEditorText(a) === normalizeEditorText(b);
}

export function readDraft(fileId) {
    try {
        const raw = localStorage.getItem(draftKey(fileId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.text !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
}

export function writeDraft(fileId, text, fileName) {
    try {
        localStorage.setItem(
            draftKey(fileId),
            JSON.stringify({
                text,
                fileName: fileName || '',
                savedAt: Date.now(),
            })
        );
    } catch {
        // Quota / private mode — ignore
    }
}

export function clearDraft(fileId) {
    try {
        localStorage.removeItem(draftKey(fileId));
    } catch {
        // ignore
    }
}

export function createEditorState() {
    return {
        fileId: null,
        fileName: '',
        mimeType: 'text/markdown',
        originalContent: '',
        editorContent: '',
        dirty: false,
        status: 'idle',
        errorMessage: '',
    };
}

export function applyLoadedContent(state, { fileId, fileName, mimeType, content }) {
    state.fileId = fileId;
    state.fileName = fileName;
    state.mimeType = mimeType || 'text/markdown';
    const text = normalizeEditorText(content);
    state.originalContent = text;
    state.editorContent = text;
    state.dirty = false;
    state.status = 'idle';
    state.errorMessage = '';
}

/**
 * Quietly adopt `text` as both the buffer and the clean baseline.
 * Used after parse/serialize canonicalization so Preview/List flush is not a false edit.
 */
export function rebaseEditorBaseline(state, text) {
    const next = normalizeEditorText(text);
    state.originalContent = next;
    state.editorContent = next;
    state.dirty = false;
    state.status = 'saved';
    state.errorMessage = '';
    if (state.fileId) clearDraft(state.fileId);
}

export function setEditorText(state, text) {
    const next = String(text ?? '');
    state.editorContent = next;
    state.dirty = !textsEqual(next, state.originalContent);
    if (state.dirty) {
        state.status = 'dirty';
        if (state.fileId) {
            writeDraft(state.fileId, text, state.fileName);
        }
    } else {
        state.status = 'saved';
        if (state.fileId) clearDraft(state.fileId);
    }
}

export function markSaving(state) {
    state.status = 'saving';
    state.errorMessage = '';
}

export function markSaved(state) {
    state.originalContent = state.editorContent;
    state.dirty = false;
    state.status = 'saved';
    state.errorMessage = '';
    if (state.fileId) clearDraft(state.fileId);
}

/**
 * Apply a successfully uploaded baseline without clobbering newer local edits.
 * @param {ReturnType<typeof createEditorState>} state
 * @param {string} savedText — exact payload that was written to Drive
 */
export function applySavedBaseline(state, savedText) {
    const baseline = String(savedText ?? '');
    state.originalContent = baseline;
    state.dirty = !textsEqual(state.editorContent, baseline);
    state.status = state.dirty ? 'dirty' : 'saved';
    state.errorMessage = '';
    if (state.fileId) {
        if (state.dirty) writeDraft(state.fileId, state.editorContent, state.fileName);
        else clearDraft(state.fileId);
    }
}

export function markError(state, message) {
    state.status = 'error';
    state.errorMessage = message || 'Something went wrong';
}

/**
 * @returns {Promise<'restore'|'discard'|null>}
 */
export function promptRestoreDraft(dialogEl) {
    if (!dialogEl) {
        const ok = window.confirm('A local draft was found. Restore it?');
        return Promise.resolve(ok ? 'restore' : 'discard');
    }

    return new Promise((resolve) => {
        const onClose = () => {
            dialogEl.removeEventListener('close', onClose);
            resolve(dialogEl.returnValue === 'restore' ? 'restore' : 'discard');
        };
        dialogEl.addEventListener('close', onClose);
        dialogEl.returnValue = 'discard';
        dialogEl.showModal();
    });
}
