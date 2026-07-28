import { DRAFT_KEY_PREFIX } from './config.js';

function draftKey(fileId) {
    return `${DRAFT_KEY_PREFIX}${fileId}`;
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
    state.originalContent = content;
    state.editorContent = content;
    state.dirty = false;
    state.status = 'idle';
    state.errorMessage = '';
}

export function setEditorText(state, text) {
    state.editorContent = text;
    state.dirty = text !== state.originalContent;
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
