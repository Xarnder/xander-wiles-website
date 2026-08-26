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

/**
 * Decide whether a Drive files.version change is a real concurrent edit.
 * Pinning revisions can bump `version` without changing markdown text.
 * @param {{
 *   expectedVersion?: string | number | null,
 *   remoteVersion?: string | number | null,
 *   snapshot: string,
 *   baseline: string,
 *   driveContent: string,
 * }} args
 * @returns {'proceed' | 'same-as-local' | 'conflict'}
 */
export function classifyRemoteContentChange({
    expectedVersion,
    remoteVersion,
    snapshot,
    baseline,
    driveContent,
}) {
    if (expectedVersion == null || expectedVersion === '') return 'proceed';
    if (remoteVersion == null || String(remoteVersion) === String(expectedVersion)) {
        return 'proceed';
    }
    if (textsEqual(driveContent, snapshot)) return 'same-as-local';
    if (textsEqual(driveContent, baseline)) return 'proceed';
    return 'conflict';
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
        /** @type {string | number | null} Drive files.version at last load/successful save */
        driveVersion: null,
        /** @type {string | null} */
        headRevisionId: null,
    };
}

export function applyLoadedContent(state, { fileId, fileName, mimeType, content, driveVersion = null, headRevisionId = null }) {
    state.fileId = fileId;
    state.fileName = fileName;
    state.mimeType = mimeType || 'text/markdown';
    const text = normalizeEditorText(content);
    state.originalContent = text;
    state.editorContent = text;
    state.dirty = false;
    state.status = 'idle';
    state.errorMessage = '';
    state.driveVersion = driveVersion != null && driveVersion !== '' ? driveVersion : null;
    state.headRevisionId = headRevisionId ? String(headRevisionId) : null;
}

/**
 * Record Drive version metadata after a successful write or conflict resolution.
 * @param {ReturnType<typeof createEditorState>} state
 * @param {{ version?: string | number | null, headRevisionId?: string | null }} meta
 */
export function applyDriveVersionMeta(state, meta = {}) {
    if ('version' in meta) {
        state.driveVersion =
            meta.version != null && meta.version !== '' ? meta.version : null;
    }
    if ('headRevisionId' in meta) {
        state.headRevisionId = meta.headRevisionId ? String(meta.headRevisionId) : null;
    }
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
    // Prefer idle over 'saved' so chrome does not toast "Saved" for format-only rebases.
    state.status = 'idle';
    state.errorMessage = '';
    if (state.fileId) clearDraft(state.fileId);
}

export function setEditorText(state, text) {
    const next = normalizeEditorText(text);
    state.editorContent = next;
    state.dirty = !textsEqual(next, state.originalContent);
    if (state.dirty) {
        state.status = 'dirty';
        if (state.fileId) {
            writeDraft(state.fileId, next, state.fileName);
        }
    } else {
        // Stay idle if we were idle; only announce "saved" after a real dirty/saving/error cycle.
        if (
            state.status === 'dirty' ||
            state.status === 'saving' ||
            state.status === 'error' ||
            state.status === 'conflict'
        ) {
            state.status = 'saved';
        } else if (state.status !== 'saved') {
            state.status = 'idle';
        }
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
