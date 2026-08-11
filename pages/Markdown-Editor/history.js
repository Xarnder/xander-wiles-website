/**
 * Document edit history that survives Drive autosave / manual save.
 * Autocomplete-style typing is coalesced into one undo step.
 */

const MAX_STACK = 100;
const COALESCE_MS = 800;

/**
 * @typedef {{ text: string, selectionStart: number, selectionEnd: number }} HistoryEntry
 */

export function createEditHistory() {
    /** @type {HistoryEntry[]} */
    let undoStack = [];
    /** @type {HistoryEntry[]} */
    let redoStack = [];
    let groupOpen = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let coalesceTimer = null;
    let suspended = 0;
    /** Last known buffer — used when `input` fires without `beforeinput`. */
    let lastKnownText = '';

    function clearCoalesceTimer() {
        if (coalesceTimer != null) {
            clearTimeout(coalesceTimer);
            coalesceTimer = null;
        }
    }

    function armCoalesceClose() {
        clearCoalesceTimer();
        coalesceTimer = setTimeout(() => {
            groupOpen = false;
            coalesceTimer = null;
        }, COALESCE_MS);
    }

    /**
     * @param {HistoryEntry[]} stack
     * @param {HistoryEntry} entry
     */
    function pushCapped(stack, entry) {
        stack.push(entry);
        while (stack.length > MAX_STACK) stack.shift();
    }

    /**
     * @param {string} text
     * @param {{ selectionStart?: number, selectionEnd?: number }} [selection]
     * @returns {HistoryEntry}
     */
    function entryFrom(text, selection = {}) {
        const value = String(text ?? '');
        const start = Number(selection.selectionStart);
        const end = Number(selection.selectionEnd);
        return {
            text: value,
            selectionStart: Number.isFinite(start) ? start : 0,
            selectionEnd: Number.isFinite(end) ? end : Number.isFinite(start) ? start : 0,
        };
    }

    return {
        /** @param {string} [text] */
        reset(text = '') {
            undoStack = [];
            redoStack = [];
            groupOpen = false;
            clearCoalesceTimer();
            lastKnownText = String(text ?? '');
        },

        /** @param {string} text */
        syncMirror(text) {
            lastKnownText = String(text ?? '');
        },

        getMirror() {
            return lastKnownText;
        },

        suspend() {
            suspended += 1;
        },

        resume() {
            suspended = Math.max(0, suspended - 1);
        },

        /**
         * Checkpoint the buffer *before* a user edit lands.
         * Rapid follow-up edits in the coalesce window share one undo step.
         * @param {string} text
         * @param {{ selectionStart?: number, selectionEnd?: number }} [selection]
         */
        beforeEdit(text, selection = {}) {
            if (suspended) return;
            if (groupOpen) {
                armCoalesceClose();
                return;
            }
            const entry = entryFrom(text, selection);
            const last = undoStack[undoStack.length - 1];
            if (!last || last.text !== entry.text) {
                pushCapped(undoStack, entry);
            }
            redoStack = [];
            groupOpen = true;
            armCoalesceClose();
        },

        /**
         * Fallback when only `input` fired: checkpoint from the pre-edit mirror.
         * @param {string} newText
         * @param {{ selectionStart?: number, selectionEnd?: number }} [selection]
         */
        beforeEditFromMirror(newText, selection = {}) {
            if (suspended) return;
            if (groupOpen) {
                armCoalesceClose();
                lastKnownText = String(newText ?? '');
                return;
            }
            if (lastKnownText === String(newText ?? '')) return;
            this.beforeEdit(lastKnownText, selection);
            lastKnownText = String(newText ?? '');
        },

        /** Keep the coalesce window open while typing continues. */
        touch(newText) {
            if (suspended) return;
            if (newText != null) lastKnownText = String(newText);
            if (!groupOpen) return;
            armCoalesceClose();
        },

        /** End the current typing group (e.g. before undo or leaving the field). */
        closeGroup() {
            clearCoalesceTimer();
            groupOpen = false;
        },

        canUndo() {
            return undoStack.length > 0;
        },

        canRedo() {
            return redoStack.length > 0;
        },

        /**
         * @param {string} currentText
         * @param {{ selectionStart?: number, selectionEnd?: number }} [selection]
         * @returns {HistoryEntry | null}
         */
        undo(currentText, selection = {}) {
            if (!undoStack.length) return null;
            this.closeGroup();
            const current = entryFrom(currentText, selection);
            const prev = undoStack.pop();
            if (!prev) return null;
            if (prev.text === current.text) {
                // Stack had a duplicate checkpoint — try one more.
                if (!undoStack.length) {
                    undoStack.push(prev);
                    return null;
                }
                pushCapped(redoStack, current);
                return undoStack.pop() || null;
            }
            pushCapped(redoStack, current);
            lastKnownText = prev.text;
            return prev;
        },

        /**
         * @param {string} currentText
         * @param {{ selectionStart?: number, selectionEnd?: number }} [selection]
         * @returns {HistoryEntry | null}
         */
        redo(currentText, selection = {}) {
            if (!redoStack.length) return null;
            this.closeGroup();
            const current = entryFrom(currentText, selection);
            const next = redoStack.pop();
            if (!next) return null;
            pushCapped(undoStack, current);
            lastKnownText = next.text;
            return next;
        },
    };
}
