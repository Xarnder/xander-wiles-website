import {
    isConfigured,
    LAST_FOLDER_KEY,
    LARGE_FILE_BYTES,
    ROOT_FOLDER_ID,
    ROOT_FOLDER_NAME,
    COMPUTERS_FOLDER_ID,
    COMPUTERS_FOLDER_NAME,
    VIEW_MODE_KEY_PREFIX,
    FINDER_MD_ORDER_MOBILE_KEY,
    FINDER_MD_ORDER_DESKTOP_KEY,
    FINDER_MD_ORDER_MOBILE_DEFAULT,
    FINDER_MD_ORDER_DESKTOP_DEFAULT,
    FINDER_SORT_KEY,
    FINDER_SORT_DEFAULT,
    FINDER_SORT_VALUES,
    FINDER_SORT_OPTIONS,
    THEME_KEY,
    THEME_DEFAULT,
    THEME_VALUES,
    THEME_META_COLORS,
    PWA_TOP_GAP_KEY,
    PWA_TOP_GAP_MIGRATED_KEY,
    PWA_TOP_GAP_DEFAULT,
    PWA_TOP_GAP_MIN,
    PWA_TOP_GAP_MAX,
    PWA_BOTTOM_OFFSET_KEY,
    PWA_BOTTOM_OFFSET_MIGRATED_KEY,
    PWA_BOTTOM_OFFSET_DEFAULT,
    PWA_BOTTOM_OFFSET_MIN,
    PWA_BOTTOM_OFFSET_MAX,
    PREVIEW_FONT_SCALE_KEY,
    PREVIEW_FONT_SCALE_DEFAULT,
    PREVIEW_FONT_SCALE_MIN,
    PREVIEW_FONT_SCALE_MAX,
    LIST_STRIPE_KEY,
    LIST_STRIPE_DEFAULT,
    LIST_STRIPE_VALUES,
    LIST_LAYOUT_KEY,
    LIST_LAYOUT_DEFAULT,
    LIST_LAYOUT_VALUES,
    DEFAULT_EDIT_VIEW_KEY,
    DEFAULT_EDIT_VIEW_DEFAULT,
    DEFAULT_EDIT_VIEW_VALUES,
    DEFAULT_EDIT_VIEW_OPTIONS,
    DOUBLE_TAP_COPY_KEY,
    SHOW_DATES_KEY,
    PREVIEW_TOC_OPEN_KEY,
    PREVIEW_TOC_STICKY_KEY,
    RECENT_FILES_KEY,
    RECENT_FILES_MAX,
    OPENED_FILES_KEY,
    OPENED_FILES_MAX,
    OPENED_FILES_WEEK_MS,
    PINNED_ITEMS_KEY,
    PINNED_ITEMS_MAX,
} from './config.js';
import {
    clearToken,
    isSignedIn,
    requestAccessToken,
    tryRestoreSession,
} from './auth.js';
import {
    copyDriveFile,
    createFolder,
    createMarkdownFile,
    findItemsByNameInFolder,
    getFileContent,
    getFileMetadata,
    isFolder,
    isMarkdownCandidate,
    listChildFolders,
    listComputerRootFolders,
    listFolder,
    fetchVisiblePage,
    moveDriveItem,
    normalizeMarkdownFileName,
    renameDriveItem,
    searchMarkdownFiles,
    sortDriveEntries,
    suggestCopyFileName,
    updateFileContent,
} from './drive.js';
import {
    applyLoadedContent,
    clearDraft,
    createEditorState,
    markError,
    markSaved,
    applySavedBaseline,
    applyDriveVersionMeta,
    markSaving,
    promptRestoreDraft,
    readDraft,
    rebaseEditorBaseline,
    setEditorText,
    textsEqual,
    normalizeEditorText,
    writeDraft,
} from './editor.js';
import {
    addItem,
    appendEmptyList,
    countItemsMissingDates,
    fillMissingListDates,
    offsetFromPreviewAnchor,
    parseDocument,
    previewAnchorFromOffset,
    serializeDocument,
    stripMdlistAgentNotes,
} from './lists.js';
import { parseXanderListJson, xanderListToMdlist } from './list-import.js';
import {
    buildDateTag,
    buildDateTagFromCreatedTime,
    formatDateTagLabel,
    insertDateTagAt,
    readShowDatesEnabled,
    resolveDateTagInput,
    writeShowDatesEnabled,
} from './dates.js';
import { applyEditingLists, applyEditingPlainLists, applyReorderingLists, applyReorderingPlainLists, applyTagFilters, readDoubleTapCopyEnabled, readPreviewTocOpen, readPreviewTocSticky, renderListsUi, writeDoubleTapCopyEnabled } from './lists-ui.js';
import {
    flushCloudSettingsSave,
    pullCloudSettings,
    resetCloudSettingsState,
    scheduleCloudSettingsSave,
    withCloudApplyGuard,
} from './settings-sync.js';
import {
    extractMarkdownHeadings,
    getTextareaViewportOffset,
    getVisiblePreviewBlock,
    scrollListsRootToAnchor,
    scrollTextareaToLine,
    scrollTextareaToOffset,
    splitMarkdownBlocks,
} from './markdown.js';
import { createEditorSearch } from './search.js';
import { createEditHistory } from './history.js';
import { getRevisionContent, listAllRevisions, protectRevision } from './revisions.js';
import {
    DESTRUCTIVE_AUTOSAVE_DEFER_MS,
    isDestructiveChange,
} from './destructive.js';
import {
    enrichRevisionsWithMeta,
    pruneSafetyRevisions,
    upsertRevisionMeta,
} from './revision-meta.js';
import {
    applyEditorDisplayMode,
    applyFinderLayoutPrefs,
    applyTheme,
    bindUi,
    closeHistoryDialog,
    closeHistoryPreviewDialog,
    formatRevisionTime,
    getEls,
    openHistoryDialog,
    openHistoryPreviewDialog,
    promptConflictDialog,
    promptConflictReview,
    promptForName,
    promptItemActions,
    promptEditorMoreMenu,
    promptFillListDates,
    fillEditorMoreStats,
    promptFinderSort,
    promptMoveDestination,
    promptNameVersion,
    promptPinnedShortcutIssue,
    promptRestoreRevision,
    promptUnsavedChanges,
    renderFileList,
    renderPinnedList,
    renderFolderPath,
    renderVersionHistoryList,
    scrollFinderToMarkdownSection,
    setBrowseEmptyMessage,
    setFinderLoading,
    setBrowseModeUi,
    setConfigError,
    setCreateActionsVisible,
    setEditorLoading,
    setHistoryPreviewStatus,
    setHistoryStatus,
    setListsStatus,
    setLoadMoreVisible,
    setLoadMoreBusy,
    setStatus,
    showAppToast,
    showEditorToast,
    setUpEnabled,
    showView,
    syncEditorChrome as syncEditorChromeUi,
    syncFinderLayoutControls,
    syncNavLayout,
    syncThemeControl,
    applyPwaTopGap,
    syncPwaTopGapControl,
    applyPwaBottomOffset,
    syncPwaBottomOffsetControl,
    applyPreviewFontScale,
    syncPreviewFontScaleControl,
    applyListStripe,
    syncListStripeControl,
    applyListLayout,
    syncListLayoutControl,
    syncDefaultEditViewControl,
    syncDoubleTapCopyControl,
    syncEditorMoreShowDates,
    syncFinderSortControl,
    syncUndoRedoButtons,
} from './ui.js';

const COMPUTERS_ROOT = { id: COMPUTERS_FOLDER_ID, name: COMPUTERS_FOLDER_NAME };
const VIEW_MODES = new Set(['list', 'preview', 'contents', 'raw']);
const LEGACY_VIEW_MODES = {
    custom: 'list',
    mixed: 'preview',
    standard: 'raw',
};
/** Idle time after last edit before Drive autosave. */
const AUTOSAVE_IDLE_MS = 10_000;
/** Cap listed Drive revisions in the History UI. */
const HISTORY_MAX_REVISIONS = 100;

const editHistory = createEditHistory();

const state = {
    browseMode: 'folder', // 'folder' | 'search' | 'computers'
    searchQuery: '',
    /** Client-side name filter for the current folder list (not Drive-wide). */
    folderFilter: '',
    folderStack: [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }],
    files: [],
    nextPageToken: null,
    loadingFolder: false,
    editor: createEditorState(),
    viewMode: 'raw', // 'list' | 'preview' | 'contents' | 'raw'
    documentModel: null,
    tagFilters: {},
    editingListIds: {},
    editingPlainLists: {},
    reorderingListIds: {},
    reorderingPlainLists: {},
    placingList: false,
    /** @type {object | null} */
    pendingImportList: null,
    clickEdit: false,
    parseWarnings: [],
};

/** @type {ReturnType<typeof createEditorSearch> | null} */
let editorSearch = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let autosaveTimer = null;
/** @type {number | null} */
let autosaveRaf = null;
let autosaveStartedAt = 0;
let autosaveInFlight = false;
/** Blocks autosave while a History restore upload is running. */
let restoreInFlight = false;
/** Serializes Drive content writes (save / restore / conflict overwrite). */
let driveWriteChain = Promise.resolve();
/** @type {Promise<void> | null} */
let conflictResolveInFlight = null;
/** @type {import('./revisions.js').DocumentRevision | null} */
let historyPreviewRevision = null;
/** @type {string} */
let historyPreviewContent = '';
/** Soft-defer autosave until this timestamp after a destructive edit. */
let destructiveAutosaveDeferUntil = 0;
/** Fingerprint we already toasted a large-change warning for. */
let destructiveWarnedFingerprint = null;
/**
 * Pending remote conflict payloads (preserved until resolved).
 * @type {{ localContent: string, driveContent: string, driveVersion: string | number | null, headRevisionId: string | null, fileId: string } | null}
 */
let pendingConflict = null;
/** Content fingerprint used to detect real edits vs chrome-only syncs. */
let autosaveContentFingerprint = null;
/** Timestamp of last local content change (ms). */
let lastEditorEditAt = 0;
/** Session flag — off via burger menu; always re-enabled when opening a markdown file. */
let autosaveEnabled = true;

function isDriveWriteBusy() {
    return autosaveInFlight || restoreInFlight;
}

/**
 * Run exclusive Drive content mutations in order.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function enqueueDriveWrite(fn) {
    const run = driveWriteChain.then(fn, fn);
    driveWriteChain = run.then(
        () => undefined,
        () => undefined
    );
    return run;
}

async function waitForDriveWritesIdle() {
    stopAutosaveCountdown();
    const started = Date.now();
    while (isDriveWriteBusy() && Date.now() - started < 45_000) {
        await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await driveWriteChain.catch(() => undefined);
}

function syncEditorChrome(ed = state.editor, options = {}) {
    syncEditorChromeUi(ed, options);
    const els = getEls();
    if (
        els.btnSave &&
        isDriveWriteBusy() &&
        !els.app?.classList.contains('is-action-locked')
    ) {
        els.btnSave.disabled = true;
    }
    if (!options.quiet) syncAutosaveFromEditorState();
    else if (options.syncAutosave) syncAutosaveFromEditorState();
    syncEditHistoryButtons(ed);
}

function syncEditHistoryButtons(ed = state.editor) {
    const forceDisabled =
        ed.status === 'saving' ||
        ed.status === 'loading' ||
        !ed.fileId ||
        isDriveWriteBusy();
    syncUndoRedoButtons({
        canUndo: editHistory.canUndo(),
        canRedo: editHistory.canRedo(),
        forceDisabled,
    });
}

function readEditorSelection() {
    const els = getEls();
    if (state.viewMode === 'raw' && els.editor) {
        return {
            selectionStart: Number(els.editor.selectionStart) || 0,
            selectionEnd: Number(els.editor.selectionEnd) || 0,
        };
    }
    return { selectionStart: 0, selectionEnd: 0 };
}

function getEditorBufferText() {
    const els = getEls();
    if (state.viewMode === 'raw' && els.editor) return els.editor.value;
    return state.editor.editorContent;
}

/**
 * Checkpoint before a user-driven buffer change. Safe to call often — coalesces.
 * @param {string} [text]
 */
function noteUserEditBoundary(text) {
    const value = text != null ? String(text) : getEditorBufferText();
    editHistory.beforeEdit(value, readEditorSelection());
}

/**
 * Apply an undo/redo snapshot into the open editor without recording history.
 * @param {{ text: string, selectionStart?: number, selectionEnd?: number }} entry
 */
function applyHistorySnapshot(entry) {
    if (!entry || !state.editor.fileId) return;
    const text = String(entry.text ?? '');
    const els = getEls();
    editHistory.suspend();
    try {
        setEditorText(state.editor, text);
        if (els.editor) {
            els.editor.value = text;
            if (state.viewMode === 'raw') {
                const start = Math.max(0, Math.min(Number(entry.selectionStart) || 0, text.length));
                const end = Math.max(
                    start,
                    Math.min(Number(entry.selectionEnd) || start, text.length)
                );
                try {
                    els.editor.focus();
                    els.editor.setSelectionRange(start, end);
                } catch {
                    // ignore
                }
            }
        }
        editHistory.syncMirror(text);
        if (state.viewMode !== 'raw') {
            refreshDocumentModelFromText(text);
            applyTagFilters(state.documentModel, state.tagFilters);
            applyEditingLists(state.documentModel, state.editingListIds);
            applyEditingPlainLists(state.documentModel, state.editingPlainLists);
            applyReorderingLists(state.documentModel, state.reorderingListIds);
            applyReorderingPlainLists(state.documentModel, state.reorderingPlainLists);
            showParseWarnings();
            renderStructuredEditor();
        }
        syncEditorChrome(state.editor);
    } finally {
        editHistory.resume();
    }
}

function performEditorUndo() {
    if (!state.editor.fileId) return false;
    flushCurrentEditorContent();
    const current = state.editor.editorContent;
    const entry = editHistory.undo(current, readEditorSelection());
    if (!entry) {
        syncEditHistoryButtons();
        return false;
    }
    applyHistorySnapshot(entry);
    return true;
}

function performEditorRedo() {
    if (!state.editor.fileId) return false;
    flushCurrentEditorContent();
    const current = state.editor.editorContent;
    const entry = editHistory.redo(current, readEditorSelection());
    if (!entry) {
        syncEditHistoryButtons();
        return false;
    }
    applyHistorySnapshot(entry);
    return true;
}

function noteEditorContentEdited() {
    lastEditorEditAt = Date.now();
    const ed = state.editor;
    if (!ed?.fileId) return;
    if (pendingConflict) {
        // Keep conflict local payload fresh so Keep-mine doesn't wipe later typing.
        pendingConflict = {
            ...pendingConflict,
            localContent: ed.editorContent,
            fileId: ed.fileId,
        };
        writeDraft(ed.fileId, ed.editorContent, ed.fileName);
    }
    if (isDestructiveChange(ed.originalContent, ed.editorContent)) {
        const fp = ed.editorContent;
        destructiveAutosaveDeferUntil = Date.now() + DESTRUCTIVE_AUTOSAVE_DEFER_MS;
        if (destructiveWarnedFingerprint !== fp) {
            destructiveWarnedFingerprint = fp;
            showEditorToast('Large change — Undo available · autosave delayed', 'warn', {
                key: 'destructive-defer',
                durationMs: 2800,
            });
        }
    } else {
        destructiveAutosaveDeferUntil = 0;
        destructiveWarnedFingerprint = null;
    }
}

function msUntilAutosaveAllowed() {
    const sinceEdit = Date.now() - lastEditorEditAt;
    const idleLeft = Math.max(0, AUTOSAVE_IDLE_MS - sinceEdit);
    const deferLeft = Math.max(0, destructiveAutosaveDeferUntil - Date.now());
    return Math.max(idleLeft, deferLeft);
}

/**
 * True when the user is mid-edit in a text field (Raw textarea or list inputs).
 * Autosave should stay in the background and must not rebuild that DOM.
 */
function isEditorTextFieldFocused() {
    const els = getEls();
    if (!els.viewEditor || els.viewEditor.hidden) return false;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (active === els.editor) return true;
    if (els.listsRoot?.contains(active)) {
        const tag = active.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return true;
        if (active.isContentEditable) return true;
    }
    return false;
}

function stopAutosaveCountdown() {
    if (autosaveTimer != null) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    if (autosaveRaf != null) {
        cancelAnimationFrame(autosaveRaf);
        autosaveRaf = null;
    }
    autosaveStartedAt = 0;
    const els = getEls();
    const bar = els.autosaveBar;
    const fill = els.autosaveBarFill;
    if (bar) {
        bar.hidden = true;
        bar.setAttribute('aria-hidden', 'true');
        bar.setAttribute('aria-valuenow', '0');
    }
    if (fill) fill.style.transform = 'scaleX(0)';
}

function paintAutosaveBar(remainingRatio, idleMs = AUTOSAVE_IDLE_MS) {
    const els = getEls();
    const bar = els.autosaveBar;
    const fill = els.autosaveBarFill;
    if (!bar || !fill) return;
    const ratio = Math.max(0, Math.min(1, Number(remainingRatio) || 0));
    const secsLeft = Math.ceil((ratio * idleMs) / 1000);
    bar.hidden = false;
    bar.setAttribute('aria-hidden', 'false');
    bar.setAttribute('aria-valuenow', String(secsLeft));
    bar.setAttribute(
        'aria-valuetext',
        `${secsLeft} second${secsLeft === 1 ? '' : 's'} until autosave`
    );
    fill.style.transform = `scaleX(${ratio})`;
}

function tickAutosaveBar() {
    autosaveRaf = null;
    if (!autosaveStartedAt || autosaveTimer == null) return;
    const delayLeft = msUntilAutosaveAllowed();
    const idleMs = Math.max(delayLeft, AUTOSAVE_IDLE_MS, 1);
    const remaining = Math.max(0, delayLeft / idleMs);
    paintAutosaveBar(remaining, idleMs);
    if (delayLeft > 0) {
        autosaveRaf = requestAnimationFrame(tickAutosaveBar);
    }
}

function startAutosaveCountdown() {
    if (!autosaveEnabled) {
        stopAutosaveCountdown();
        return;
    }
    if (autosaveTimer != null) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    if (autosaveRaf != null) {
        cancelAnimationFrame(autosaveRaf);
        autosaveRaf = null;
    }
    const delayMs = Math.max(50, msUntilAutosaveAllowed());
    const idleMs = Math.max(delayMs, AUTOSAVE_IDLE_MS);
    autosaveStartedAt = Date.now() - (idleMs - delayMs);
    paintAutosaveBar(delayMs / idleMs, idleMs);
    autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        runAutosave();
    }, delayMs);
    autosaveRaf = requestAnimationFrame(tickAutosaveBar);
}

function syncAutosaveFromEditorState() {
    const ed = state.editor;
    const els = getEls();
    const editorVisible = Boolean(els.viewEditor && !els.viewEditor.hidden);

    if (
        !autosaveEnabled ||
        !ed?.fileId ||
        !ed.dirty ||
        ed.status === 'saving' ||
        ed.status === 'loading' ||
        ed.status === 'conflict' ||
        pendingConflict ||
        autosaveInFlight ||
        restoreInFlight ||
        !editorVisible
    ) {
        if (!ed?.dirty || ed?.status === 'saving' || ed?.status === 'loading' || !ed?.fileId) {
            autosaveContentFingerprint = ed?.editorContent ?? null;
        }
        stopAutosaveCountdown();
        return;
    }

    const fingerprint = ed.editorContent;
    if (fingerprint !== autosaveContentFingerprint) {
        autosaveContentFingerprint = fingerprint;
        noteEditorContentEdited();
        startAutosaveCountdown();
        return;
    }

    if (autosaveTimer == null && !autosaveInFlight) {
        startAutosaveCountdown();
    }
}

async function runAutosave() {
    const ed = state.editor;
    if (!autosaveEnabled || autosaveInFlight || restoreInFlight || pendingConflict) return;
    const els = getEls();
    const editorVisible = Boolean(els.viewEditor && !els.viewEditor.hidden);
    if (
        !ed?.fileId ||
        !ed.dirty ||
        ed.status === 'saving' ||
        ed.status === 'conflict' ||
        !editorVisible
    ) {
        stopAutosaveCountdown();
        return;
    }

    // Still typing / just typed / destructive defer — wait.
    if (msUntilAutosaveAllowed() > 0) {
        startAutosaveCountdown();
        return;
    }

    if (els.autosaveBar) {
        els.autosaveBar.setAttribute('aria-valuetext', 'Autosaving');
    }
    if (els.autosaveBarFill) {
        els.autosaveBarFill.style.transform = 'scaleX(0)';
    }

    autosaveInFlight = true;
    try {
        await saveCurrentFile({ autosave: true });
    } finally {
        autosaveInFlight = false;
        syncAutosaveFromEditorState();
    }
}

function currentFolder() {
    return state.folderStack[state.folderStack.length - 1];
}

function rememberFolder(folderId) {
    try {
        localStorage.setItem(LAST_FOLDER_KEY, folderId);
    } catch {
        // ignore
    }
}

function readRememberedFolder() {
    try {
        return localStorage.getItem(LAST_FOLDER_KEY);
    } catch {
        return null;
    }
}

function viewModeKey(fileId) {
    return `${VIEW_MODE_KEY_PREFIX}${fileId}`;
}

function readViewMode(fileId) {
    if (!fileId) return null;
    try {
        const raw = localStorage.getItem(viewModeKey(fileId));
        if (!raw) return null;
        if (VIEW_MODES.has(raw)) return raw;
        if (LEGACY_VIEW_MODES[raw]) return LEGACY_VIEW_MODES[raw];
    } catch {
        // ignore
    }
    return null;
}

function readFinderLayoutPrefs() {
    const read = (key, fallback) => {
        try {
            const raw = localStorage.getItem(key);
            if (raw === 'top' || raw === 'bottom') return raw;
        } catch {
            // ignore
        }
        return fallback;
    };
    return {
        mobile: read(FINDER_MD_ORDER_MOBILE_KEY, FINDER_MD_ORDER_MOBILE_DEFAULT),
        desktop: read(FINDER_MD_ORDER_DESKTOP_KEY, FINDER_MD_ORDER_DESKTOP_DEFAULT),
    };
}

function writeFinderLayoutPrefs(prefs) {
    try {
        if (prefs.mobile === 'top' || prefs.mobile === 'bottom') {
            localStorage.setItem(FINDER_MD_ORDER_MOBILE_KEY, prefs.mobile);
        }
        if (prefs.desktop === 'top' || prefs.desktop === 'bottom') {
            localStorage.setItem(FINDER_MD_ORDER_DESKTOP_KEY, prefs.desktop);
        }
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
}

function applySavedFinderLayout() {
    const prefs = readFinderLayoutPrefs();
    applyFinderLayoutPrefs(prefs);
    syncFinderLayoutControls(prefs);
}

function readFinderSort() {
    try {
        const raw = localStorage.getItem(FINDER_SORT_KEY);
        if (FINDER_SORT_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return FINDER_SORT_DEFAULT;
}

function writeFinderSort(mode) {
    const next = FINDER_SORT_VALUES.has(mode) ? mode : FINDER_SORT_DEFAULT;
    try {
        localStorage.setItem(FINDER_SORT_KEY, next);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return next;
}

function applySavedFinderSort() {
    syncFinderSortControl(readFinderSort());
}

function readTheme() {
    try {
        const raw = localStorage.getItem(THEME_KEY);
        if (THEME_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return THEME_DEFAULT;
}

function writeTheme(theme) {
    if (!THEME_VALUES.has(theme)) return;
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
}

function applySavedTheme() {
    const theme = readTheme();
    applyTheme(theme, { metaColor: THEME_META_COLORS[theme] || THEME_META_COLORS.blue });
    syncThemeControl(theme);
}

function clampPwaTopGap(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return PWA_TOP_GAP_DEFAULT;
    return Math.max(PWA_TOP_GAP_MIN, Math.min(PWA_TOP_GAP_MAX, n));
}

function measureSafeTopPx() {
    try {
        const probe = document.createElement('div');
        probe.style.cssText =
            'position:absolute;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);';
        document.documentElement.appendChild(probe);
        const px = Math.round(parseFloat(getComputedStyle(probe).paddingTop) || 0);
        probe.remove();
        return Math.max(0, px);
    } catch {
        return 0;
    }
}

function readPwaTopGap() {
    try {
        const raw = localStorage.getItem(PWA_TOP_GAP_KEY);
        const migrated = localStorage.getItem(PWA_TOP_GAP_MIGRATED_KEY) === '1';
        if (!migrated) {
            const safe = measureSafeTopPx();
            const total =
                raw == null || raw === ''
                    ? clampPwaTopGap(PWA_TOP_GAP_DEFAULT)
                    : clampPwaTopGap(Number(raw) + safe);
            try {
                localStorage.setItem(PWA_TOP_GAP_KEY, String(total));
                localStorage.setItem(PWA_TOP_GAP_MIGRATED_KEY, '1');
            } catch {
                // ignore
            }
            return total;
        }
        if (raw == null || raw === '') {
            return clampPwaTopGap(PWA_TOP_GAP_DEFAULT);
        }
        return clampPwaTopGap(raw);
    } catch {
        return PWA_TOP_GAP_DEFAULT;
    }
}

function writePwaTopGap(gapPx) {
    const n = clampPwaTopGap(gapPx);
    try {
        localStorage.setItem(PWA_TOP_GAP_KEY, String(n));
        localStorage.setItem(PWA_TOP_GAP_MIGRATED_KEY, '1');
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return n;
}

function applySavedPwaTopGap() {
    syncPwaTopGapControl(readPwaTopGap());
}

function clampPwaBottomOffset(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return PWA_BOTTOM_OFFSET_DEFAULT;
    return Math.max(PWA_BOTTOM_OFFSET_MIN, Math.min(PWA_BOTTOM_OFFSET_MAX, n));
}

function measureSafeBottomPx() {
    try {
        const probe = document.createElement('div');
        probe.style.cssText =
            'position:absolute;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px);';
        document.documentElement.appendChild(probe);
        const px = Math.round(parseFloat(getComputedStyle(probe).paddingBottom) || 0);
        probe.remove();
        return Math.max(0, px);
    } catch {
        return 0;
    }
}

function readPwaBottomOffset() {
    try {
        const raw = localStorage.getItem(PWA_BOTTOM_OFFSET_KEY);
        const migrated = localStorage.getItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY) === '1';
        if (!migrated) {
            const safe = measureSafeBottomPx();
            const pull = raw == null || raw === '' ? null : Number(raw);
            // Old values pulled the nav down; convert to remaining bottom inset.
            const inset = clampPwaBottomOffset(
                pull == null || !Number.isFinite(pull)
                    ? PWA_BOTTOM_OFFSET_DEFAULT
                    : Math.max(0, safe - pull)
            );
            try {
                localStorage.setItem(PWA_BOTTOM_OFFSET_KEY, String(inset));
                localStorage.setItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY, '1');
            } catch {
                // ignore
            }
            return inset;
        }
        if (raw == null || raw === '') {
            return clampPwaBottomOffset(PWA_BOTTOM_OFFSET_DEFAULT);
        }
        return clampPwaBottomOffset(raw);
    } catch {
        return PWA_BOTTOM_OFFSET_DEFAULT;
    }
}

function writePwaBottomOffset(offsetPx) {
    const n = clampPwaBottomOffset(offsetPx);
    try {
        localStorage.setItem(PWA_BOTTOM_OFFSET_KEY, String(n));
        localStorage.setItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY, '1');
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return n;
}

function applySavedPwaBottomOffset() {
    syncPwaBottomOffsetControl(readPwaBottomOffset());
}

function clampPreviewFontScale(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return PREVIEW_FONT_SCALE_DEFAULT;
    return Math.max(PREVIEW_FONT_SCALE_MIN, Math.min(PREVIEW_FONT_SCALE_MAX, n));
}

function readPreviewFontScale() {
    try {
        const raw = localStorage.getItem(PREVIEW_FONT_SCALE_KEY);
        if (raw == null || raw === '') return PREVIEW_FONT_SCALE_DEFAULT;
        return clampPreviewFontScale(raw);
    } catch {
        return PREVIEW_FONT_SCALE_DEFAULT;
    }
}

function writePreviewFontScale(percent) {
    const n = clampPreviewFontScale(percent);
    try {
        localStorage.setItem(PREVIEW_FONT_SCALE_KEY, String(n));
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return n;
}

function applySavedPreviewFontScale() {
    syncPreviewFontScaleControl(readPreviewFontScale());
}

function readListStripe() {
    try {
        const raw = localStorage.getItem(LIST_STRIPE_KEY);
        if (LIST_STRIPE_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return LIST_STRIPE_DEFAULT;
}

function writeListStripe(mode) {
    const next = LIST_STRIPE_VALUES.has(mode) ? mode : LIST_STRIPE_DEFAULT;
    try {
        localStorage.setItem(LIST_STRIPE_KEY, next);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return next;
}

function applySavedListStripe() {
    syncListStripeControl(readListStripe());
}

function readListLayout() {
    try {
        const raw = localStorage.getItem(LIST_LAYOUT_KEY);
        if (LIST_LAYOUT_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return LIST_LAYOUT_DEFAULT;
}

function writeListLayout(layout) {
    const next = LIST_LAYOUT_VALUES.has(layout) ? layout : LIST_LAYOUT_DEFAULT;
    try {
        localStorage.setItem(LIST_LAYOUT_KEY, next);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return next;
}

function applySavedListLayout() {
    syncListLayoutControl(readListLayout());
}

function readDefaultEditView() {
    try {
        const raw = localStorage.getItem(DEFAULT_EDIT_VIEW_KEY);
        if (DEFAULT_EDIT_VIEW_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return DEFAULT_EDIT_VIEW_DEFAULT;
}

function writeDefaultEditView(mode) {
    const next = DEFAULT_EDIT_VIEW_VALUES.has(mode) ? mode : DEFAULT_EDIT_VIEW_DEFAULT;
    try {
        localStorage.setItem(DEFAULT_EDIT_VIEW_KEY, next);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return next;
}

function applySavedDefaultEditView() {
    syncDefaultEditViewControl(readDefaultEditView());
}

function applySavedDoubleTapCopy() {
    syncDoubleTapCopyControl(readDoubleTapCopyEnabled());
}

function buildSettingsSnapshot() {
    return {
        theme: readTheme(),
        previewTocSticky: readPreviewTocSticky(),
        previewTocOpen: readPreviewTocOpen(),
        pwaTopGap: readPwaTopGap(),
        pwaBottomOffset: readPwaBottomOffset(),
        previewFontScale: readPreviewFontScale(),
        listStripe: readListStripe(),
        listLayout: readListLayout(),
        defaultEditView: readDefaultEditView(),
        doubleTapCopy: readDoubleTapCopyEnabled(),
        showDates: readShowDatesEnabled(),
        finderMdOrder: readFinderLayoutPrefs(),
        finderSort: readFinderSort(),
        pinnedItems: readPinnedItems(),
        openedFiles: openedFilesSnapshot(),
    };
}

function queueSettingsCloudSync() {
    if (!isSignedIn()) return;
    scheduleCloudSettingsSave(buildSettingsSnapshot, {
        onError: (err) => {
            console.warn('[md-editor] settings cloud save failed', err);
        },
    });
}

/**
 * Apply a cloud settings blob to localStorage + live UI (without re-pushing).
 * @param {import('./settings-sync.js').CloudSettings | object} cloud
 */
function applyCloudSettings(cloud) {
    if (!cloud || typeof cloud !== 'object') return;

    withCloudApplyGuard(() => {
        if (THEME_VALUES.has(cloud.theme)) {
            try {
                localStorage.setItem(THEME_KEY, cloud.theme);
            } catch {
                // ignore
            }
            applyTheme(cloud.theme, {
                metaColor: THEME_META_COLORS[cloud.theme] || THEME_META_COLORS.blue,
            });
            syncThemeControl(cloud.theme);
        }

        if (typeof cloud.previewTocSticky === 'boolean') {
            try {
                localStorage.setItem(PREVIEW_TOC_STICKY_KEY, cloud.previewTocSticky ? '1' : '0');
            } catch {
                // ignore
            }
        }

        if (typeof cloud.previewTocOpen === 'boolean') {
            try {
                localStorage.setItem(PREVIEW_TOC_OPEN_KEY, cloud.previewTocOpen ? '1' : '0');
            } catch {
                // ignore
            }
        }

        if (cloud.pwaTopGap != null) {
            let n = clampPwaTopGap(cloud.pwaTopGap);
            const alreadyTotal = localStorage.getItem(PWA_TOP_GAP_MIGRATED_KEY) === '1';
            if (!alreadyTotal) {
                const safe = measureSafeTopPx();
                // Pre-migration cloud values were EXTRA on top of safe-area.
                if (n < safe) n = clampPwaTopGap(n + safe);
            }
            try {
                localStorage.setItem(PWA_TOP_GAP_KEY, String(n));
                localStorage.setItem(PWA_TOP_GAP_MIGRATED_KEY, '1');
            } catch {
                // ignore
            }
            syncPwaTopGapControl(n);
        }

        if (cloud.pwaBottomOffset != null) {
            let n = clampPwaBottomOffset(cloud.pwaBottomOffset);
            const alreadyInset = localStorage.getItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY) === '1';
            if (!alreadyInset) {
                const safe = measureSafeBottomPx();
                // Pre-migration cloud values were "pull down" amounts.
                n = clampPwaBottomOffset(Math.max(0, safe - n));
            }
            try {
                localStorage.setItem(PWA_BOTTOM_OFFSET_KEY, String(n));
                localStorage.setItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY, '1');
            } catch {
                // ignore
            }
            syncPwaBottomOffsetControl(n);
        }

        if (cloud.previewFontScale != null) {
            const n = clampPreviewFontScale(cloud.previewFontScale);
            try {
                localStorage.setItem(PREVIEW_FONT_SCALE_KEY, String(n));
            } catch {
                // ignore
            }
            syncPreviewFontScaleControl(n);
        }

        if (LIST_STRIPE_VALUES.has(cloud.listStripe)) {
            try {
                localStorage.setItem(LIST_STRIPE_KEY, cloud.listStripe);
            } catch {
                // ignore
            }
            syncListStripeControl(cloud.listStripe);
        }

        if (LIST_LAYOUT_VALUES.has(cloud.listLayout)) {
            try {
                localStorage.setItem(LIST_LAYOUT_KEY, cloud.listLayout);
            } catch {
                // ignore
            }
            syncListLayoutControl(cloud.listLayout);
        }

        if (DEFAULT_EDIT_VIEW_VALUES.has(cloud.defaultEditView)) {
            try {
                localStorage.setItem(DEFAULT_EDIT_VIEW_KEY, cloud.defaultEditView);
            } catch {
                // ignore
            }
            syncDefaultEditViewControl(cloud.defaultEditView);
        }

        if (typeof cloud.doubleTapCopy === 'boolean') {
            try {
                localStorage.setItem(DOUBLE_TAP_COPY_KEY, cloud.doubleTapCopy ? '1' : '0');
            } catch {
                // ignore
            }
            syncDoubleTapCopyControl(cloud.doubleTapCopy);
        }

        if (typeof cloud.showDates === 'boolean') {
            try {
                localStorage.setItem(SHOW_DATES_KEY, cloud.showDates ? '1' : '0');
            } catch {
                // ignore
            }
            syncEditorMoreShowDates(cloud.showDates);
            if (state.editor.fileId && state.viewMode !== 'raw') {
                renderStructuredEditor();
            }
        }

        if (cloud.finderMdOrder && typeof cloud.finderMdOrder === 'object') {
            const next = {
                mobile:
                    cloud.finderMdOrder.mobile === 'top' || cloud.finderMdOrder.mobile === 'bottom'
                        ? cloud.finderMdOrder.mobile
                        : readFinderLayoutPrefs().mobile,
                desktop:
                    cloud.finderMdOrder.desktop === 'top' || cloud.finderMdOrder.desktop === 'bottom'
                        ? cloud.finderMdOrder.desktop
                        : readFinderLayoutPrefs().desktop,
            };
            try {
                localStorage.setItem(FINDER_MD_ORDER_MOBILE_KEY, next.mobile);
                localStorage.setItem(FINDER_MD_ORDER_DESKTOP_KEY, next.desktop);
            } catch {
                // ignore
            }
            applyFinderLayoutPrefs(next);
            syncFinderLayoutControls(next);
        }

        if (FINDER_SORT_VALUES.has(cloud.finderSort)) {
            try {
                localStorage.setItem(FINDER_SORT_KEY, cloud.finderSort);
            } catch {
                // ignore
            }
            syncFinderSortControl(cloud.finderSort);
        }

        if (Array.isArray(cloud.pinnedItems)) {
            const normalized = cloud.pinnedItems
                .filter((entry) => entry && typeof entry.id === 'string' && entry.id)
                .map((entry) => ({
                    id: entry.id,
                    name: entry.name || 'Untitled.md',
                    mimeType: entry.mimeType || 'text/markdown',
                    parentId: typeof entry.parentId === 'string' ? entry.parentId : '',
                    pinnedAt: Number(entry.pinnedAt) || 0,
                }))
                .sort((a, b) => b.pinnedAt - a.pinnedAt)
                .slice(0, PINNED_ITEMS_MAX);
            try {
                localStorage.setItem(PINNED_ITEMS_KEY, JSON.stringify(normalized));
            } catch {
                // ignore
            }
        }

        if (
            cloud.openedFiles &&
            typeof cloud.openedFiles === 'object' &&
            !Array.isArray(cloud.openedFiles)
        ) {
            const cutoff = Date.now() - OPENED_FILES_WEEK_MS;
            const merged = readOpenedFilesMap();
            for (const [id, openedAt] of Object.entries(cloud.openedFiles)) {
                if (!id) continue;
                const ts = Number(openedAt) || 0;
                if (ts < cutoff) continue;
                const prev = merged.get(String(id)) || 0;
                if (ts > prev) merged.set(String(id), ts);
            }
            writeOpenedFilesMap(merged);
        }
    });
}

async function syncSettingsFromCloud() {
    if (!isSignedIn()) return;
    try {
        const { settings, created } = await pullCloudSettings(buildSettingsSnapshot);
        if (!created) {
            applyCloudSettings(settings);
        }
        // Push so local-only fields (e.g. openedFiles) join an existing cloud blob.
        queueSettingsCloudSync();
    } catch (err) {
        console.warn('[md-editor] settings cloud load failed', err);
    }
}

function readRecentFiles() {
    try {
        const raw = localStorage.getItem(RECENT_FILES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry) => entry && typeof entry.id === 'string' && entry.id)
            .map((entry) => ({
                id: entry.id,
                name: entry.name || 'Untitled.md',
                mimeType: entry.mimeType || 'text/markdown',
                openedAt: Number(entry.openedAt) || 0,
            }))
            .sort((a, b) => b.openedAt - a.openedAt)
            .slice(0, RECENT_FILES_MAX);
    } catch {
        return [];
    }
}

function writeRecentFiles(entries) {
    try {
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(entries.slice(0, RECENT_FILES_MAX)));
    } catch {
        // ignore
    }
}

/**
 * Map of file id → last openedAt (ms) for opens within the past week.
 * @returns {Map<string, number>}
 */
function readOpenedFilesMap() {
    const map = new Map();
    const cutoff = Date.now() - OPENED_FILES_WEEK_MS;
    try {
        const raw = localStorage.getItem(OPENED_FILES_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [id, openedAt] of Object.entries(parsed)) {
                    const ts = Number(openedAt) || 0;
                    if (!id || ts < cutoff) continue;
                    map.set(String(id), ts);
                }
            }
        }
    } catch {
        // ignore
    }
    // Include the short Recent list so existing opens still show dots.
    for (const entry of readRecentFiles()) {
        if (!entry?.id) continue;
        const ts = Number(entry.openedAt) || 0;
        if (ts < cutoff) continue;
        const prev = map.get(entry.id) || 0;
        if (ts > prev) map.set(entry.id, ts);
    }
    return map;
}

function writeOpenedFilesMap(map) {
    const cutoff = Date.now() - OPENED_FILES_WEEK_MS;
    const entries = [...map.entries()]
        .filter(([, openedAt]) => openedAt >= cutoff)
        .sort((a, b) => b[1] - a[1])
        .slice(0, OPENED_FILES_MAX);
    const obj = {};
    for (const [id, openedAt] of entries) obj[id] = openedAt;
    try {
        localStorage.setItem(OPENED_FILES_KEY, JSON.stringify(obj));
    } catch {
        // ignore
    }
}

/** Plain object for settings cloud snapshot (id → openedAt). */
function openedFilesSnapshot() {
    const obj = {};
    for (const [id, openedAt] of readOpenedFilesMap()) obj[id] = openedAt;
    return obj;
}

function rememberOpenedFile(fileId) {
    if (!fileId) return;
    const map = readOpenedFilesMap();
    map.set(String(fileId), Date.now());
    writeOpenedFilesMap(map);
    queueSettingsCloudSync();
}

function rememberRecentFile(file) {
    if (!file?.id) return;
    rememberOpenedFile(file.id);
    const next = [
        {
            id: file.id,
            name: file.name || 'Untitled.md',
            mimeType: file.mimeType || 'text/markdown',
            openedAt: Date.now(),
        },
        ...readRecentFiles().filter((entry) => entry.id !== file.id),
    ].slice(0, RECENT_FILES_MAX);
    writeRecentFiles(next);
}

function updateRecentFileName(fileId, name) {
    if (!fileId || !name) return;
    const entries = readRecentFiles();
    let changed = false;
    for (const entry of entries) {
        if (entry.id === fileId) {
            entry.name = name;
            changed = true;
        }
    }
    if (changed) writeRecentFiles(entries);
}

function normalizeParentId(parents) {
    if (Array.isArray(parents) && parents[0]) return String(parents[0]);
    return '';
}

function readPinnedItems() {
    try {
        const raw = localStorage.getItem(PINNED_ITEMS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry) => entry && typeof entry.id === 'string' && entry.id)
            .map((entry) => ({
                id: entry.id,
                name: entry.name || (isFolder(entry) ? 'Folder' : 'Untitled.md'),
                mimeType: entry.mimeType || 'text/markdown',
                parentId: typeof entry.parentId === 'string' ? entry.parentId : '',
                pinnedAt: Number(entry.pinnedAt) || 0,
            }))
            .sort((a, b) => b.pinnedAt - a.pinnedAt)
            .slice(0, PINNED_ITEMS_MAX);
    } catch {
        return [];
    }
}

function writePinnedItems(entries) {
    try {
        localStorage.setItem(PINNED_ITEMS_KEY, JSON.stringify(entries.slice(0, PINNED_ITEMS_MAX)));
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
}

function isPinned(fileId) {
    if (!fileId) return false;
    return readPinnedItems().some((entry) => entry.id === fileId);
}

function pinItem(file) {
    if (!file?.id) return;
    const parentId = normalizeParentId(file.parents);
    const next = [
        {
            id: file.id,
            name: file.name || (isFolder(file) ? 'Folder' : 'Untitled.md'),
            mimeType: file.mimeType || 'text/markdown',
            parentId,
            pinnedAt: Date.now(),
        },
        ...readPinnedItems().filter((entry) => entry.id !== file.id),
    ].slice(0, PINNED_ITEMS_MAX);
    writePinnedItems(next);
    const name = file.name || (isFolder(file) ? 'folder' : 'note');
    const kindLabel = isFolder(file) ? 'directory' : 'markdown';
    setStatus('');
    showAppToast(`Pinned ${kindLabel} “${name}”`, 'ok', { key: `pin:${file.id}` });
}

/** @type {Map<string, object>} */
const pinnedMetaCache = new Map();

function unpinItem(fileId, { refresh = true } = {}) {
    if (!fileId) return;
    const next = readPinnedItems().filter((entry) => entry.id !== fileId);
    writePinnedItems(next);
    pinnedMetaCache.delete(fileId);
    if (refresh) renderPinnedView();
}

function updatePinnedItem(fileId, patch = {}) {
    if (!fileId) return;
    const entries = readPinnedItems();
    let changed = false;
    for (const entry of entries) {
        if (entry.id !== fileId) continue;
        if (patch.name != null) entry.name = patch.name;
        if (patch.mimeType != null) entry.mimeType = patch.mimeType;
        if (patch.parentId != null) entry.parentId = patch.parentId;
        changed = true;
    }
    if (changed) writePinnedItems(entries);
    pinnedMetaCache.delete(fileId);
}

/**
 * Merge live Drive metadata so pinned sort matches Finder (dates/size).
 * @param {object[]} items
 * @returns {Promise<object[]>}
 */
async function enrichPinnedItemsForSort(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];

    return Promise.all(
        list.map(async (entry) => {
            let meta = pinnedMetaCache.get(entry.id);
            if (!meta && isSignedIn()) {
                try {
                    meta = await getFileMetadata(entry.id);
                    if (meta?.id) pinnedMetaCache.set(entry.id, meta);
                } catch {
                    meta = null;
                }
            }
            const pinIso = entry.pinnedAt ? new Date(entry.pinnedAt).toISOString() : '';
            return {
                ...entry,
                name: meta?.name || entry.name,
                mimeType: meta?.mimeType || entry.mimeType,
                modifiedTime: meta?.modifiedTime || pinIso,
                createdTime: meta?.createdTime || pinIso,
                size: meta?.size ?? 0,
            };
        })
    );
}

async function renderPinnedView() {
    const items = readPinnedItems();
    const handlers = {
        onOpen: handleOpenPinnedEntry,
        onMenu: handlePinnedItemMenu,
    };
    const sortMode = readFinderSort();
    // Instant pass using pin time / name, then refine with Drive metadata.
    const localPrepared = items.map((entry) => ({
        ...entry,
        modifiedTime: entry.pinnedAt || 0,
        createdTime: entry.pinnedAt || 0,
        size: 0,
    }));
    renderPinnedList(sortDriveEntries(localPrepared, sortMode), handlers);

    const enriched = await enrichPinnedItemsForSort(items);
    const elsNow = getEls();
    if (elsNow.viewPinned?.hidden) return;
    renderPinnedList(sortDriveEntries(enriched, readFinderSort()), handlers);
}

function showPinnedView() {
    showAppView('pinned');
    renderPinnedView().catch(() => {});
    setStatus(readPinnedItems().length ? '' : 'Pin notes or folders from Finder');
}

function writeViewMode(fileId, mode) {
    if (!fileId || !VIEW_MODES.has(mode)) return;
    try {
        localStorage.setItem(viewModeKey(fileId), mode);
    } catch {
        // ignore
    }
}

function resolveInitialViewMode(fileId, { freshlyCreated = false } = {}) {
    // Brand-new notes from Finder open in Raw so the user can start typing.
    // That choice is not persisted — the next open uses the usual default.
    if (freshlyCreated) return 'raw';
    const saved = readViewMode(fileId);
    if (saved) return saved;
    return readDefaultEditView();
}

function refreshDocumentModelFromText(text) {
    const parsed = parseDocument(text);
    applyTagFilters(parsed, state.tagFilters);
    applyEditingLists(parsed, state.editingListIds);
    applyEditingPlainLists(parsed, state.editingPlainLists);
    applyReorderingLists(parsed, state.reorderingListIds);
    applyReorderingPlainLists(parsed, state.reorderingPlainLists);
    state.documentModel = parsed;
    state.parseWarnings = parsed.warnings || [];
    return parsed;
}

function showParseWarnings() {
    const parts = [];
    if (state.parseWarnings.length) {
        parts.push(state.parseWarnings.slice(0, 3).join(' · '));
    }
    const doc = state.documentModel;
    if (doc?.hasError) {
        parts.push('Some mdlist blocks are invalid — use Raw to fix the markdown/JSON.');
    }
    setListsStatus(parts.join(' ') || '', parts.length ? 'warn' : '');
}

function flushCurrentEditorContent() {
    const els = getEls();
    if (!state.editor.fileId) return;
    if (state.viewMode === 'raw') {
        adoptEditorBuffer(els.editor.value, { userEdit: true });
    } else if (
        state.viewMode === 'list' ||
        state.viewMode === 'preview' ||
        state.viewMode === 'contents'
    ) {
        if (state.documentModel) {
            const serialized = serializeDocument(state.documentModel);
            // Structured flush often only changes JSON/whitespace formatting.
            // If the file was clean, rebase instead of faking an unsaved edit.
            adoptEditorBuffer(serialized, { userEdit: state.editor.dirty });
            els.editor.value = state.editor.editorContent;
        }
    }
}

/**
 * Apply buffer text without false "Unsaved" from parse→serialize drift.
 * @param {string} text
 * @param {{ userEdit?: boolean }} [options]
 * @returns {boolean} true when editorContent changed
 */
function adoptEditorBuffer(text, options = {}) {
    const userEdit = Boolean(options.userEdit);
    const next = normalizeEditorText(text);
    if (textsEqual(next, state.editor.editorContent)) {
        return false;
    }
    if (userEdit) {
        setEditorText(state.editor, next);
        return true;
    }
    // Non-user flush (mode switch / chrome): format-only drift while clean → rebase.
    if (!state.editor.dirty) {
        rebaseEditorBaseline(state.editor, next);
        return true;
    }
    setEditorText(state.editor, next);
    return true;
}

function renderStructuredEditor(extra = {}) {
    const els = getEls();
    if (!state.documentModel || !els.listsRoot) return;
    const structuredMode =
        state.viewMode === 'list'
            ? 'list'
            : state.viewMode === 'contents'
              ? 'contents'
              : 'preview';
    renderListsUi(els.listsRoot, {
        mode: structuredMode,
        doc: state.documentModel,
        focusItemId: extra.focusItemId || null,
        focusPlainItemId: extra.focusPlainItemId || null,
        openMiniPlainItemId: extra.openMiniPlainItemId || null,
        focusTocId: extra.focusTocId || null,
        placingList: state.viewMode === 'preview' && state.placingList,
        pendingImportList: state.viewMode === 'preview' && state.placingList ? state.pendingImportList : null,
        clickEdit: state.viewMode === 'preview' && state.clickEdit,
        onEditSpot: (payload) => jumpToRawAtPreviewSpot(payload),
        onContentsSelect: (tocId) => {
            applyViewMode('preview', { persist: true, focusTocId: tocId });
        },
        onStatus: (msg, kind) => setStatus(msg, kind),
        onChange: (doc, opts = {}) => {
            if (typeof opts.placingList === 'boolean') {
                state.placingList = opts.placingList;
                if (opts.placingList) state.clickEdit = false;
                if (!opts.placingList) state.pendingImportList = null;
            }
            if (Object.prototype.hasOwnProperty.call(opts, 'pendingImportList')) {
                state.pendingImportList = opts.pendingImportList || null;
            }
            if (opts.statusMessage) {
                setStatus(opts.statusMessage, opts.statusKind || 'ok');
            }
            if (opts.tagFilters) state.tagFilters = opts.tagFilters;
            if (opts.editingListIds) state.editingListIds = opts.editingListIds;
            if (opts.editingPlainLists) state.editingPlainLists = opts.editingPlainLists;
            if (opts.reorderingListIds) state.reorderingListIds = opts.reorderingListIds;
            if (opts.reorderingPlainLists) state.reorderingPlainLists = opts.reorderingPlainLists;
            if (opts.focusItemId) {
                for (const seg of doc.segments || []) {
                    if (
                        seg.type === 'mdlist' &&
                        seg.list &&
                        (seg.list.items || []).some((item) => item.id === opts.focusItemId)
                    ) {
                        state.editingListIds = { ...state.editingListIds, [seg.list.id]: true };
                        state.reorderingListIds = { ...state.reorderingListIds, [seg.list.id]: false };
                        seg._editing = true;
                        seg._reordering = false;
                        break;
                    }
                }
            }
            applyTagFilters(doc, state.tagFilters);
            applyEditingLists(doc, state.editingListIds);
            applyEditingPlainLists(doc, state.editingPlainLists);
            applyReorderingLists(doc, state.reorderingListIds);
            applyReorderingPlainLists(doc, state.reorderingPlainLists);
            state.documentModel = doc;
            if (opts.soft) {
                if (opts.persist) {
                    const serialized = serializeDocument(doc);
                    if (!textsEqual(serialized, state.editor.editorContent)) {
                        noteUserEditBoundary(state.editor.editorContent);
                        setEditorText(state.editor, serialized);
                        els.editor.value = serialized;
                        editHistory.touch(serialized);
                        syncEditorChrome(state.editor);
                    }
                }
                renderStructuredEditor({
                    focusItemId: opts.focusItemId,
                    focusPlainItemId: opts.focusPlainItemId,
                    openMiniPlainItemId: opts.openMiniPlainItemId,
                });
                return;
            }
            const serialized = serializeDocument(doc);
            if (!textsEqual(serialized, state.editor.editorContent)) {
                noteUserEditBoundary(state.editor.editorContent);
                setEditorText(state.editor, serialized);
                els.editor.value = serialized;
                editHistory.touch(serialized);
                syncEditorChrome(state.editor);
            }
            // Identical serialize → do not setEditorText/sync (avoids Saved/Unsaved toast spam).
            if (opts.skipRender) {
                return;
            }
            refreshDocumentModelFromText(serialized);
            applyTagFilters(state.documentModel, state.tagFilters);
            applyEditingLists(state.documentModel, state.editingListIds);
            applyEditingPlainLists(state.documentModel, state.editingPlainLists);
            applyReorderingLists(state.documentModel, state.reorderingListIds);
            applyReorderingPlainLists(state.documentModel, state.reorderingPlainLists);
            showParseWarnings();
            renderStructuredEditor({
                focusItemId: opts.focusItemId,
                focusPlainItemId: opts.focusPlainItemId,
                openMiniPlainItemId: opts.openMiniPlainItemId,
            });
        },
    });
    syncInsertListButton();
    syncImportListButton();
    syncClickEditButton();
    // Re-apply find highlights after the Preview/List DOM is rebuilt
    if (editorSearch?.isOpen()) {
        requestAnimationFrame(() => editorSearch?.refresh());
    }
}

function getEditorActionMode() {
    if (state.viewMode !== 'preview') return null;
    if (state.clickEdit) return 'click-edit';
    if (state.placingList && state.pendingImportList) return 'import-list';
    if (state.placingList) return 'insert-list';
    return null;
}

/** Grey out / disable sibling actions while one cancelable mode is active. */
function syncEditorActionLocks() {
    const els = getEls();
    const mode = getEditorActionMode();
    const locked = Boolean(mode);
    const saving = state.editor.status === 'saving';
    const hasFile = Boolean(state.editor.fileId);
    const baseDisabled = saving || !hasFile;

    if (els.navActionsEditor) {
        els.navActionsEditor.classList.toggle('is-action-locked', locked);
    }
    if (els.app) {
        if (mode) els.app.dataset.activeEditorAction = mode;
        else delete els.app.dataset.activeEditorAction;
        els.app.classList.toggle('is-action-locked', locked);
    }

    const entries = [
        [els.btnUndo, 'undo'],
        [els.btnRedo, 'redo'],
        [els.btnEditorSearch, 'search'],
        [els.btnClickEdit, 'click-edit'],
        [els.btnInsertList, 'insert-list'],
        [els.btnEditorMore, 'import-list'],
        [els.btnSave, 'save'],
    ];

    for (const [btn, key] of entries) {
        if (!btn) continue;
        const isActive = mode === key;
        btn.classList.toggle('is-active-action', isActive);
        if (locked) {
            btn.disabled = !isActive;
        } else if (key === 'save') {
            btn.disabled = baseDisabled || !state.editor.dirty;
        } else if (key === 'undo') {
            btn.disabled = baseDisabled || !editHistory.canUndo();
        } else if (key === 'redo') {
            btn.disabled = baseDisabled || !editHistory.canRedo();
        } else {
            btn.disabled = baseDisabled;
        }
    }
}

function syncInsertListButton() {
    const els = getEls();
    if (!els.btnInsertList) return;
    const placing = state.viewMode === 'preview' && state.placingList && !state.pendingImportList;
    els.btnInsertList.title = placing ? 'Cancel' : 'Add list';
    els.btnInsertList.setAttribute(
        'aria-label',
        placing ? 'Cancel placing list' : 'Add ranked list'
    );
    els.btnInsertList.classList.toggle('btn-insert-list--cancel', placing);
    syncEditorActionLocks();
}

function syncImportListButton() {
    const els = getEls();
    if (!els.btnEditorMore) return;
    const placingImport = state.viewMode === 'preview' && state.placingList && Boolean(state.pendingImportList);
    els.btnEditorMore.title = placingImport ? 'Cancel' : 'More';
    els.btnEditorMore.setAttribute(
        'aria-label',
        placingImport ? 'Cancel importing list' : 'More file actions'
    );
    els.btnEditorMore.classList.toggle('btn-editor-more--cancel', placingImport);
    els.btnEditorMore.hidden = !state.editor.fileId;

    const icon = els.btnEditorMore.querySelector('.nav-action-icon');
    if (icon) {
        icon.classList.toggle('nav-action-icon--menu', !placingImport);
        icon.classList.toggle('nav-action-icon--cross', placingImport);
    }

    syncEditorActionLocks();
}

function syncClickEditButton() {
    const els = getEls();
    if (!els.btnClickEdit) return;
    const picking = state.viewMode === 'preview' && state.clickEdit;
    els.btnClickEdit.title = picking ? 'Cancel' : 'Edit here';
    els.btnClickEdit.setAttribute(
        'aria-label',
        picking ? 'Cancel click-to-edit' : 'Click text in Preview to edit in Raw'
    );
    els.btnClickEdit.classList.toggle('btn-click-edit--active', picking);
    els.btnClickEdit.hidden = !state.editor.fileId;

    const icon = els.btnClickEdit.querySelector('.nav-action-icon');
    if (icon) {
        icon.classList.toggle('nav-action-icon--edit', !picking);
        icon.classList.toggle('nav-action-icon--cross', picking);
    }

    syncEditorActionLocks();
}

/**
 * Jump from a Preview click-edit target into Raw at the matching source offset.
 * @param {{
 *   segIndex: number,
 *   localLine: number,
 *   nextLocalLine?: number,
 *   prefix?: string,
 *   word?: string,
 *   blockText?: string
 * }} payload
 */
function jumpToRawAtPreviewSpot(payload) {
    if (!state.documentModel || !state.editor.fileId) return;
    state.clickEdit = false;
    state.placingList = false;
    state.pendingImportList = null;

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    const offset = offsetFromPreviewAnchor(
        state.documentModel,
        payload.segIndex,
        payload.localLine,
        payload
    );
    const serialized = serializeDocument(state.documentModel);
    setEditorText(state.editor, serialized);
    const els = getEls();
    els.editor.value = serialized;

    applyViewMode('raw', {
        persist: true,
        focusOffset: offset,
        selectWord: true,
        focusEditor: true,
    });
    setStatus('Editing in Raw', 'ok');
}

function applyViewMode(mode, {
    persist = true,
    reparseFromTextarea = false,
    focusOffset = null,
    focusLine: focusLineOpt = null,
    selectWord = false,
    focusEditor = false,
    focusTocId = null,
} = {}) {
    if (!VIEW_MODES.has(mode)) mode = 'raw';
    const els = getEls();
    const previousMode = state.viewMode;

    let focusLine = focusLineOpt;
    let rawFocusOffset = focusOffset;
    /** @type {{ segIndex: number, localLine: number, needle: string } | null} */
    let previewAnchor = null;
    let pendingPreviewOffset = null;

    if (rawFocusOffset == null && focusLine == null && previewAnchor == null) {
        if (previousMode === 'raw' && (mode === 'preview' || mode === 'list') && els.editor) {
            // Capture wrapped viewport offset now; map after the document is refreshed.
            pendingPreviewOffset = getTextareaViewportOffset(els.editor);
        } else if (
            (previousMode === 'preview' || previousMode === 'list') &&
            mode === 'raw' &&
            els.listsRoot &&
            state.documentModel
        ) {
            const block = getVisiblePreviewBlock(els.listsRoot);
            if (block) {
                const preview = block.closest('.md-preview--segment');
                const segIndex = Number(
                    preview?.dataset?.segIndex ?? block.dataset.previewSegIndex
                );
                const localLine = Number(block.getAttribute('data-md-line')) || 1;
                if (Number.isFinite(segIndex)) {
                    const blocks = preview
                        ? [...preview.querySelectorAll(':scope > [data-md-line]')]
                        : [];
                    const blockIndex = blocks.indexOf(block);
                    const nextBlock =
                        blockIndex >= 0 ? blocks[blockIndex + 1] : null;
                    rawFocusOffset = offsetFromPreviewAnchor(
                        state.documentModel,
                        segIndex,
                        localLine,
                        {
                            blockText: block.textContent || '',
                            nextLocalLine: nextBlock
                                ? Number(nextBlock.getAttribute('data-md-line')) || undefined
                                : undefined,
                        }
                    );
                } else {
                    focusLine = localLine;
                }
            }
        }
    }

    // Leaving editable surfaces: flush first
    if (state.viewMode === 'raw' || reparseFromTextarea) {
        adoptEditorBuffer(els.editor.value, { userEdit: true });
    } else if (
        state.viewMode === 'list' ||
        state.viewMode === 'preview' ||
        state.viewMode === 'contents'
    ) {
        if (state.documentModel) {
            const serialized = serializeDocument(state.documentModel);
            adoptEditorBuffer(serialized, { userEdit: state.editor.dirty });
            els.editor.value = state.editor.editorContent;
        }
    }

    if (mode === 'list' || mode === 'preview' || mode === 'contents') {
        refreshDocumentModelFromText(state.editor.editorContent);
        if (pendingPreviewOffset != null && state.documentModel) {
            previewAnchor = previewAnchorFromOffset(state.documentModel, pendingPreviewOffset);
        }
    }

    state.viewMode = mode;
    if (mode !== 'preview') {
        state.placingList = false;
        state.pendingImportList = null;
        state.clickEdit = false;
    }
    if (persist && state.editor.fileId) writeViewMode(state.editor.fileId, mode);

    applyEditorDisplayMode(mode, { hasFile: Boolean(state.editor.fileId) });
    if (mode === 'list' || mode === 'preview') showParseWarnings();
    else setListsStatus('');

    if (mode === 'raw') {
        els.editor.value = state.editor.editorContent;
        syncNavLayout();
        syncInsertListButton();
        syncImportListButton();
        syncClickEditButton();
        const go = () => {
            const searchOpen = Boolean(editorSearch?.isOpen());
            const shouldFocus =
                !searchOpen && (focusEditor || selectWord || rawFocusOffset != null || focusLine != null);
            if (rawFocusOffset != null) {
                scrollTextareaToOffset(els.editor, rawFocusOffset, {
                    selectWord: Boolean(selectWord),
                    focus: shouldFocus,
                });
            } else if (focusLine != null) {
                scrollTextareaToLine(els.editor, focusLine, { focus: shouldFocus });
            }
        };
        requestAnimationFrame(() => {
            requestAnimationFrame(go);
        });
        if (editorSearch?.isOpen()) {
            requestAnimationFrame(() => editorSearch?.revealCurrent());
        }
        return;
    }

    renderStructuredEditor({ focusTocId: focusTocId || null });
    syncNavLayout();
    syncImportListButton();
    syncClickEditButton();
    if (previewAnchor && els.listsRoot && !focusTocId) {
        // After lists-ui restoreScroll rAF, place the matching Preview block in view.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollListsRootToAnchor(els.listsRoot, previewAnchor);
            });
        });
    }
    if (editorSearch?.isOpen()) {
        requestAnimationFrame(() => editorSearch?.revealCurrent());
    }
}

function setupEditorForOpenFile(options = {}) {
    const els = getEls();
    const freshlyCreated = Boolean(options.freshlyCreated);
    autosaveEnabled = true;
    state.tagFilters = {};
    state.editingListIds = {};
    state.editingPlainLists = {};
    state.reorderingListIds = {};
    state.reorderingPlainLists = {};
    state.placingList = false;
    state.pendingImportList = null;
    state.clickEdit = false;
    editorSearch?.close({ restoreFocus: false });
    refreshDocumentModelFromText(state.editor.editorContent);

    const repaired = (state.documentModel.segments || []).some((s) => s.repaired);
    const serialized = serializeDocument(state.documentModel);
    if (repaired) {
        // Real structural fixes — mark dirty so the user can save them.
        setEditorText(state.editor, serialized);
        els.editor.value = serialized;
        refreshDocumentModelFromText(serialized);
    } else if (
        !state.editor.dirty &&
        !textsEqual(serialized, state.editor.originalContent)
    ) {
        // Parse→serialize often changes whitespace/JSON formatting without a user edit.
        // Rebase the clean baseline so Preview/List flush does not look "unsaved".
        // Skip when already dirty (e.g. restored draft) so we don't clear real edits.
        rebaseEditorBaseline(state.editor, serialized);
        els.editor.value = serialized;
        refreshDocumentModelFromText(serialized);
    } else if (
        state.editor.dirty &&
        !textsEqual(serialized, state.editor.editorContent)
    ) {
        setEditorText(state.editor, serialized);
        els.editor.value = serialized;
        refreshDocumentModelFromText(serialized);
    }

    // Fresh undo stack for this file — never cleared by autosave / Save.
    editHistory.reset(state.editor.editorContent);

    state.viewMode = resolveInitialViewMode(state.editor.fileId, { freshlyCreated });

    applyEditorDisplayMode(state.viewMode, { hasFile: true });
    if (state.viewMode === 'list' || state.viewMode === 'preview') showParseWarnings();
    else setListsStatus('');
    if (state.viewMode === 'raw') {
        els.editor.value = state.editor.editorContent;
        els.editor.focus();
    } else {
        renderStructuredEditor();
    }
    syncEditorChrome(state.editor, { quiet: true });
    setStatus('');
    if (repaired) {
        showEditorToast('Repaired list data — Save to persist fixes.', 'warn', {
            key: 'repaired',
            durationMs: 3200,
        });
    } else if (freshlyCreated) {
        showEditorToast('Opened in Raw', 'ok', {
            key: 'opened-new-raw',
            durationMs: 2200,
        });
    } else if (!readViewMode(state.editor.fileId)) {
        const label =
            DEFAULT_EDIT_VIEW_OPTIONS.find((o) => o.value === state.viewMode)?.label ||
            state.viewMode;
        showEditorToast(`Opened in ${label}`, 'ok', {
            key: 'opened-default-view',
            durationMs: 2200,
        });
    }
}

async function refreshBrowse(reset = true) {
    if (state.browseMode === 'search') {
        await loadSearch(reset);
    } else if (state.browseMode === 'computers') {
        await loadComputers(reset);
    } else {
        await loadBrowse(reset);
    }
}

function canCreateInCurrentLocation() {
    if (state.browseMode === 'search') return false;
    if (state.browseMode === 'computers') {
        // Virtual Computers root is not a real parent id.
        return !(state.folderStack.length === 1 && state.folderStack[0].id === COMPUTERS_ROOT.id);
    }
    return state.browseMode === 'folder';
}

function updateCreateActions() {
    setCreateActionsVisible(canCreateInCurrentLocation());
}

function clearFolderFilter() {
    state.folderFilter = '';
    const els = getEls();
    if (els.folderFilterInput) els.folderFilterInput.value = '';
}

function renderCurrentFileList({ scrollToMarkdown = false } = {}) {
    const query = String(state.folderFilter || '').trim();
    const filtering =
        Boolean(query) && (state.browseMode === 'folder' || state.browseMode === 'computers');
    const needle = query.toLowerCase();
    const files = filtering
        ? state.files.filter((file) => String(file?.name || '').toLowerCase().includes(needle))
        : state.files;

    if (filtering) {
        setBrowseEmptyMessage(
            state.nextPageToken
                ? `No matches for “${query}” in loaded items — try Load more.`
                : `No matches for “${query}” in this folder.`
        );
    }

    renderFileList(files, {
        onOpen: handleOpenEntry,
        onMenu: handleItemMenu,
        // Hide global Recent while filtering so results stay folder-scoped.
        recent: filtering ? [] : readRecentFiles(),
        scrollToMarkdown: filtering ? false : scrollToMarkdown,
        sortMode: readFinderSort(),
        openedAtById: readOpenedFilesMap(),
    });
}

async function jumpToFolderCrumb(index) {
    if (index < 0 || index >= state.folderStack.length - 1) return;
    state.folderStack = state.folderStack.slice(0, index + 1);
    await refreshBrowse(true);
}

async function loadBrowse(reset = true) {
    const folder = currentFolder();
    state.loadingFolder = true;
    if (reset) clearFolderFilter();
    setFinderLoading(false);
    setBrowseModeUi('folder');
    setStatus(reset ? 'Loading folder…' : 'Loading more…');
    setUpEnabled(state.folderStack.length > 1);
    renderFolderPath(state.folderStack, 'folder', '', jumpToFolderCrumb);
    rememberFolder(folder.id);
    updateCreateActions();
    setBrowseEmptyMessage(
        'No folders or markdown files here yet. Tap + Note or + Folder to create one.'
    );
    if (reset) setLoadMoreVisible(false);
    else setLoadMoreBusy(true);

    try {
        const pageToken = reset ? null : state.nextPageToken;
        if (!reset && !pageToken) {
            setLoadMoreVisible(false);
            setStatus('');
            return;
        }
        const result = await fetchVisiblePage(
            (token) => listFolder(folder.id, token, { sortMode: readFinderSort() }),
            pageToken
        );
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList({ scrollToMarkdown: reset });
        setLoadMoreVisible(Boolean(state.nextPageToken));
        if (!reset && !result.files.length && !state.nextPageToken) {
            setStatus('No more items to load.');
        } else {
            setStatus(state.files.length ? '' : 'This folder is empty — create a note or folder.');
        }
    } catch (err) {
        setStatus(err.message || 'Failed to list folder', 'error');
        setLoadMoreVisible(Boolean(state.nextPageToken));
    } finally {
        state.loadingFolder = false;
        setLoadMoreBusy(false);
    }
}

async function loadSearch(reset = true) {
    state.loadingFolder = true;
    if (reset) clearFolderFilter();
    setFinderLoading(false);
    setBrowseModeUi('search');
    setUpEnabled(false);
    updateCreateActions();
    renderFolderPath([], 'search', state.searchQuery);
    setStatus(reset ? 'Searching Drive for markdown…' : 'Loading more…');
    setBrowseEmptyMessage(
        'No markdown files found for this Google account. Check you signed in with the same account as Google Drive for Desktop, and that .md files finished uploading to the cloud.'
    );
    if (reset) setLoadMoreVisible(false);
    else setLoadMoreBusy(true);

    try {
        const pageToken = reset ? null : state.nextPageToken;
        if (!reset && !pageToken) {
            setLoadMoreVisible(false);
            return;
        }
        const result = await fetchVisiblePage(
            (token) => searchMarkdownFiles(state.searchQuery, token, { sortMode: readFinderSort() }),
            pageToken
        );
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList({ scrollToMarkdown: reset });
        setLoadMoreVisible(Boolean(state.nextPageToken));
        setStatus(
            state.files.length
                ? `Found ${state.files.length}${state.nextPageToken ? '+' : ''} markdown file(s).`
                : 'No markdown files found.'
        );
    } catch (err) {
        setStatus(err.message || 'Search failed', 'error');
        setLoadMoreVisible(Boolean(state.nextPageToken));
    } finally {
        state.loadingFolder = false;
        setLoadMoreBusy(false);
    }
}

async function loadComputers(reset = true) {
    state.loadingFolder = true;
    if (reset) clearFolderFilter();
    setBrowseModeUi('computers');
    setBrowseEmptyMessage(
        'No Computers folders found via the API (Google limits this). Reliable fix: in drive.google.com → Computers → move your notes folder into My Drive, then use My Drive here.'
    );

    const atComputersRoot =
        state.folderStack.length === 1 && state.folderStack[0].id === COMPUTERS_ROOT.id;
    updateCreateActions();

    try {
        if (atComputersRoot) {
            setUpEnabled(false);
            renderFolderPath(state.folderStack, 'computers', '', jumpToFolderCrumb);
            setLoadMoreVisible(false);
            setStatus('Looking for Computers folders…');
            setFinderLoading(true, 'Looking for Computers in Google Drive…');
            const computers = await listComputerRootFolders();
            // User may have switched away while the slow Computers scan ran.
            if (state.browseMode !== 'computers') return;
            state.files = computers;
            state.nextPageToken = null;
            setFinderLoading(false);
            renderCurrentFileList({ scrollToMarkdown: true });
            setLoadMoreVisible(false);
            setStatus(
                computers.length
                    ? `Found ${computers.length} possible computer folder(s). Open one to browse.`
                    : 'Could not list Computers via API.'
            );
            return;
        }

        setFinderLoading(false);
        const folder = currentFolder();
        setUpEnabled(true);
        renderFolderPath(state.folderStack, 'computers', '', jumpToFolderCrumb);
        setStatus(reset ? 'Loading folder…' : 'Loading more…');
        if (reset) setLoadMoreVisible(false);
        else setLoadMoreBusy(true);
        const pageToken = reset ? null : state.nextPageToken;
        if (!reset && !pageToken) {
            setLoadMoreVisible(false);
            return;
        }
        const result = await fetchVisiblePage(
            (token) => listFolder(folder.id, token, { sortMode: readFinderSort() }),
            pageToken
        );
        if (state.browseMode !== 'computers') return;
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList({ scrollToMarkdown: reset });
        setLoadMoreVisible(Boolean(state.nextPageToken));
        setStatus(state.files.length ? '' : 'No folders or markdown files here.');
    } catch (err) {
        setFinderLoading(false);
        setStatus(err.message || 'Failed to load Computers', 'error');
        setLoadMoreVisible(Boolean(state.nextPageToken));
    } finally {
        state.loadingFolder = false;
        setLoadMoreBusy(false);
        if (state.browseMode !== 'computers') setFinderLoading(false);
    }
}

async function enterFolder(folder) {
    if (state.browseMode === 'computers' && state.folderStack[0]?.id === COMPUTERS_ROOT.id) {
        state.folderStack.push({ id: folder.id, name: folder.name || 'Folder' });
        await loadComputers(true);
        return;
    }
    state.browseMode = 'folder';
    state.folderStack.push({ id: folder.id, name: folder.name || 'Folder' });
    await loadBrowse(true);
}

async function goUp() {
    if (state.browseMode === 'computers') {
        if (state.folderStack.length <= 1) return;
        state.folderStack.pop();
        await loadComputers(true);
        return;
    }
    if (state.browseMode !== 'folder') return;
    if (state.folderStack.length <= 1) return;
    state.folderStack.pop();
    await loadBrowse(true);
}

async function switchToFolderMode() {
    state.browseMode = 'folder';
    state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
    showAppView('finder');
    await loadBrowse(true);
}

async function switchToComputersMode() {
    state.browseMode = 'computers';
    state.folderStack = [{ ...COMPUTERS_ROOT }];
    showAppView('finder');
    await loadComputers(true);
}

async function switchToSearchMode() {
    state.browseMode = 'search';
    const els = getEls();
    if (els.searchInput && !state.searchQuery) {
        els.searchInput.value = '';
    }
    showAppView('finder');
    await loadSearch(true);
}

async function handleOpenEntry(file) {
    if (isFolder(file)) {
        await enterFolder(file);
        return;
    }
    await openMarkdownFile(file);
}

async function handleItemMenu(file) {
    const action = await promptItemActions(file, { isPinned: isPinned(file.id) });
    if (action === 'pin') {
        // Prefer fresh parent metadata when available
        let toPin = file;
        if (!Array.isArray(file.parents) || !file.parents[0]) {
            try {
                toPin = await getFileMetadata(file.id);
            } catch {
                // keep local file snapshot
            }
        }
        pinItem(toPin);
        return;
    }
    if (action === 'unpin') {
        unpinItem(file.id, { refresh: false });
        setStatus('');
        showAppToast(`Unpinned “${file.name || 'item'}”`, 'ok', { key: `unpin:${file.id}` });
        return;
    }
    if (action === 'rename') {
        await handleRenameEntry(file);
        return;
    }
    if (action === 'copy') {
        await handleCopyEntry(file);
        return;
    }
    if (action === 'move') {
        await handleMoveEntry(file);
        return;
    }
    if (action === 'download') {
        await handleDownloadEntry(file);
    }
}

async function handlePinnedItemMenu(file) {
    const action = await promptItemActions(file, { isPinned: true });
    if (action === 'unpin' || action === 'pin') {
        // From Pinned tab the control is Unpin
        unpinItem(file.id);
        setStatus(`Unpinned ${file.name || 'item'}`, 'ok');
        return;
    }
    if (action === 'rename') {
        await handleRenameEntry(file);
        renderPinnedView();
        return;
    }
    if (action === 'copy') {
        await handleCopyEntry(file);
        return;
    }
    if (action === 'move') {
        await handleMoveEntry(file);
        renderPinnedView();
        return;
    }
    if (action === 'download') {
        await handleDownloadEntry(file);
    }
}

/**
 * Resolve a pinned shortcut; warn if missing, renamed, or moved.
 * @returns {Promise<object|null>} live Drive metadata, or null if shortcut removed / cancelled
 */
async function resolvePinnedEntry(pinned) {
    if (!pinned?.id) return null;
    setStatus('Checking pinned item…');
    try {
        const meta = await getFileMetadata(pinned.id);
        const liveParent = normalizeParentId(meta.parents);
        const renamed = Boolean(pinned.name) && meta.name !== pinned.name;
        const moved = Boolean(pinned.parentId) && liveParent && pinned.parentId !== liveParent;

        if (renamed || moved) {
            const parts = [];
            if (renamed) {
                parts.push(`Renamed from “${pinned.name}” to “${meta.name}”.`);
            }
            if (moved) {
                parts.push('It was moved to a different folder in Google Drive.');
            }
            const choice = await promptPinnedShortcutIssue({
                title: renamed && moved ? 'Moved and renamed' : renamed ? 'Renamed' : 'Moved',
                message: `${parts.join(' ')} Keep this pinned shortcut?`,
                name: meta.name || pinned.name,
            });
            if (choice === 'delete') {
                unpinItem(pinned.id);
                setStatus('Pinned shortcut removed', 'ok');
                return null;
            }
            updatePinnedItem(pinned.id, {
                name: meta.name,
                mimeType: meta.mimeType,
                parentId: liveParent,
            });
            renderPinnedView();
        } else {
            // Refresh stored snapshot quietly
            updatePinnedItem(pinned.id, {
                name: meta.name,
                mimeType: meta.mimeType,
                parentId: liveParent || pinned.parentId || '',
            });
        }
        setStatus('');
        return meta;
    } catch (err) {
        const missing = Number(err?.status) === 404;
        const choice = await promptPinnedShortcutIssue({
            title: missing ? 'Pinned item missing' : 'Pinned item unavailable',
            message: missing
                ? 'This pinned file or folder was moved, deleted, or is no longer accessible. Delete the shortcut or keep it for later?'
                : `${err.message || 'Could not open this pinned item.'} Delete the shortcut or keep it?`,
            name: pinned.name,
        });
        if (choice === 'delete') {
            unpinItem(pinned.id);
            setStatus('Pinned shortcut removed', 'ok');
        } else {
            setStatus(err.message || 'Pinned item unavailable', 'warn');
        }
        return null;
    }
}

async function handleOpenPinnedEntry(pinned) {
    const meta = await resolvePinnedEntry(pinned);
    if (!meta) return;

    if (isFolder(meta)) {
        state.browseMode = 'folder';
        state.folderStack = [
            { id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME },
            { id: meta.id, name: meta.name || 'Folder' },
        ];
        // If parent is known and not root, still open the pinned folder directly
        showAppView('finder');
        await loadBrowse(true);
        setStatus(`Opened pinned folder ${meta.name || ''}`, 'ok');
        return;
    }

    await openMarkdownFile(meta);
}

async function resolveCurrentParentId(file) {
    if (Array.isArray(file.parents) && file.parents[0]) return file.parents[0];
    if (
        state.browseMode === 'folder' ||
        (state.browseMode === 'computers' &&
            !(state.folderStack.length === 1 && state.folderStack[0].id === COMPUTERS_ROOT.id))
    ) {
        const folder = currentFolder();
        if (folder?.id && folder.id !== COMPUTERS_ROOT.id) return folder.id;
    }
    const meta = await getFileMetadata(file.id);
    if (Array.isArray(meta.parents) && meta.parents[0]) return meta.parents[0];
    throw new Error('Could not determine the current folder for this item');
}

async function handleMoveEntry(file) {
    setStatus('Preparing move…');
    let currentParentId;
    try {
        currentParentId = await resolveCurrentParentId(file);
    } catch (err) {
        setStatus(err.message || 'Could not prepare move', 'error');
        return;
    }

    const destination = await promptMoveDestination({
        item: file,
        currentParentId,
        initialMode: state.browseMode === 'computers' ? 'computers' : 'folder',
        initialStack:
            state.browseMode === 'computers' || state.browseMode === 'folder'
                ? state.folderStack.map((frame) => ({
                      id: frame.id,
                      name: frame.name || 'Folder',
                  }))
                : undefined,
        listFolders: async (parentId) => {
            const result = await listChildFolders(parentId);
            return result.folders || [];
        },
        listComputerRoots: () => listComputerRootFolders(),
    });
    if (!destination) {
        setStatus('');
        return;
    }
    if (destination.folderId === COMPUTERS_FOLDER_ID) {
        setStatus('Open a computer folder before moving here', 'warn');
        return;
    }
    if (destination.folderId === currentParentId) {
        setStatus('Already in that folder', 'warn');
        return;
    }
    if (isFolder(file) && destination.folderId === file.id) {
        setStatus('Cannot move a folder into itself', 'error');
        return;
    }

    setStatus('Moving…');
    try {
        await moveDriveItem(file.id, {
            addParentId: destination.folderId,
            removeParentId: currentParentId,
        });
        state.files = state.files.filter((f) => f.id !== file.id);
        renderCurrentFileList();
        updatePinnedItem(file.id, { parentId: destination.folderId });
        // If we moved a folder that is in the path stack, truncate path to before it
        const pathIndex = state.folderStack.findIndex((frame) => frame.id === file.id);
        if (pathIndex >= 0) {
            state.folderStack = state.folderStack.slice(0, pathIndex);
            if (!state.folderStack.length) {
                state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
            }
            await refreshBrowse(true);
        }
        setStatus(`Moved to ${destination.folderName}`, 'ok');
    } catch (err) {
        setStatus(err.message || 'Move failed', 'error');
    }
}

async function handleDownloadEntry(file) {
    if (isFolder(file)) return;
    setStatus('Downloading…');
    try {
        const text = await getFileContent(file.id);
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name || 'note.md';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus(`Downloaded ${file.name || 'file'}`, 'ok');
    } catch (err) {
        setStatus(err.message || 'Download failed', 'error');
    }
}

/**
 * Collect sibling names in a folder (local list + Drive exact-name lookups as needed).
 * @param {string} parentId
 * @returns {Promise<string[]>}
 */
async function collectSiblingNames(parentId) {
    const names = [];
    const folder = currentFolder();
    if (folder?.id && folder.id === parentId && Array.isArray(state.files)) {
        for (const entry of state.files) {
            if (entry?.name) names.push(entry.name);
        }
    }
    return names;
}

/**
 * True when another item in `parentId` already uses this name.
 * @param {string} parentId
 * @param {string} name
 * @param {{ ignoreId?: string, isMarkdown?: boolean, localOnly?: boolean }} [options]
 */
async function nameConflictsInFolder(parentId, name, options = {}) {
    const ignoreId = options.ignoreId || '';
    const isMarkdown = Boolean(options.isMarkdown);
    const localOnly = Boolean(options.localOnly);
    const candidate = isMarkdown
        ? normalizeMarkdownFileName(name)
        : String(name || '').trim().toLowerCase();
    if (!candidate) return { conflict: true, displayName: name };

    // Fast path: current Finder listing
    if (Array.isArray(state.files)) {
        const folder = currentFolder();
        if (folder?.id === parentId) {
            for (const entry of state.files) {
                if (!entry?.id || entry.id === ignoreId) continue;
                const entryName = isMarkdown
                    ? normalizeMarkdownFileName(entry.name || '')
                    : String(entry.name || '').trim().toLowerCase();
                if (entryName && entryName === candidate) {
                    return { conflict: true, displayName: entry.name || name };
                }
            }
        }
    }

    if (localOnly) return { conflict: false, displayName: name };

    // Drive truth (catches unloaded pages / other clients)
    const trimmed = String(name || '').trim();
    const exactName = isMarkdown
        ? trimmed.toLowerCase().endsWith('.md') || trimmed.toLowerCase().endsWith('.markdown')
            ? trimmed
            : `${trimmed}.md`
        : trimmed;

    try {
        const matches = await findItemsByNameInFolder(parentId, exactName);
        const hit = matches.find((item) => item.id && item.id !== ignoreId);
        if (hit) return { conflict: true, displayName: hit.name || exactName };

        // Markdown may be stored with/without checking alternate extension spelling
        if (isMarkdown) {
            const alt =
                exactName.toLowerCase().endsWith('.markdown')
                    ? `${exactName.slice(0, -9)}.md`
                    : exactName.toLowerCase().endsWith('.md')
                      ? `${exactName.slice(0, -3)}.markdown`
                      : null;
            if (alt && alt !== exactName) {
                const altMatches = await findItemsByNameInFolder(parentId, alt);
                const altHit = altMatches.find((item) => item.id && item.id !== ignoreId);
                if (altHit) return { conflict: true, displayName: altHit.name || alt };
            }
        }
    } catch {
        // If lookup fails, still block when local list says conflict; otherwise allow.
    }

    return { conflict: false, displayName: exactName };
}

/**
 * @param {string} parentId
 * @param {{ ignoreId?: string, isMarkdown?: boolean }} [options]
 * @returns {(rawName: string, opts?: { localOnly?: boolean }) => Promise<string | null>}
 */
function makeUniqueNameValidator(parentId, options = {}) {
    const isMarkdown = Boolean(options.isMarkdown);
    return async (rawName, opts = {}) => {
        const trimmed = String(rawName || '').trim();
        if (!trimmed) return 'Name cannot be empty.';
        const result = await nameConflictsInFolder(parentId, trimmed, {
            ...options,
            localOnly: Boolean(opts.localOnly),
        });
        if (result.conflict) {
            const kind = isMarkdown ? 'markdown file' : 'item';
            return `A ${kind} named “${result.displayName}” already exists in this folder. Choose a different name.`;
        }
        return null;
    };
}

async function handleCopyEntry(file) {
    if (isFolder(file) || !isMarkdownCandidate(file)) return;

    setStatus('Preparing copy…');
    let parentId = normalizeParentId(file.parents);
    let source = file;
    try {
        if (!parentId) {
            const meta = await getFileMetadata(file.id);
            source = { ...file, ...meta };
            parentId = normalizeParentId(meta.parents);
        }
        if (!parentId) {
            const folder = currentFolder();
            if (folder?.id && folder.id !== COMPUTERS_ROOT?.id) parentId = folder.id;
        }
        if (!parentId) {
            setStatus('Could not find a folder to place the copy', 'error');
            return;
        }

        const localNames = await collectSiblingNames(parentId);
        const suggested = suggestCopyFileName(source.name || 'Untitled.md', localNames);

        // Ensure suggested name isn’t already taken on Drive either
        let copyName = suggested;
        {
            let guard = 0;
            while (guard < 50) {
                const check = await nameConflictsInFolder(parentId, copyName, { isMarkdown: true });
                if (!check.conflict) break;
                localNames.push(copyName);
                copyName = suggestCopyFileName(source.name || 'Untitled.md', localNames);
                guard += 1;
            }
        }

        setStatus('Copying…');
        const copied = await copyDriveFile(source.id, { name: copyName, parentId });

        const viewingSameFolder = currentFolder()?.id === parentId;
        if (viewingSameFolder) {
            state.files = [copied, ...state.files.filter((f) => f.id !== copied.id)];
            state.files = sortDriveEntries(state.files, readFinderSort());
            renderCurrentFileList();
        }

        setStatus('');
        const name = await promptForName({
            title: 'Name copy',
            hint: 'Every file in this folder needs a unique name.',
            confirmLabel: 'Save copy',
            initialValue: copied.name || copyName,
            selectStem: true,
            validate: makeUniqueNameValidator(parentId, {
                ignoreId: copied.id,
                isMarkdown: true,
            }),
        });

        if (!name) {
            setStatus(`Copied as ${copied.name}`, 'ok');
            showAppToast(`Copied “${copied.name}”`, 'ok', { key: `copy:${copied.id}` });
            if (!viewingSameFolder) await refreshBrowse(true);
            return;
        }

        const normalizedTarget = normalizeMarkdownFileName(name);
        const normalizedCurrent = normalizeMarkdownFileName(copied.name || '');
        if (normalizedTarget === normalizedCurrent) {
            setStatus(`Copied as ${copied.name}`, 'ok');
            showAppToast(`Copied “${copied.name}”`, 'ok', { key: `copy:${copied.id}` });
            if (!viewingSameFolder) await refreshBrowse(true);
            return;
        }

        setStatus('Renaming copy…');
        const updated = await renameDriveItem(copied.id, name, { isMarkdown: true });
        const idx = state.files.findIndex((f) => f.id === copied.id);
        if (idx >= 0) {
            state.files[idx] = { ...state.files[idx], name: updated.name };
            state.files = sortDriveEntries(state.files, readFinderSort());
            renderCurrentFileList();
        } else if (!viewingSameFolder) {
            await refreshBrowse(true);
        }
        setStatus(`Copied as ${updated.name}`, 'ok');
        showAppToast(`Copied “${updated.name}”`, 'ok', { key: `copy:${updated.id}` });
    } catch (err) {
        setStatus(err.message || 'Copy failed', 'error');
    }
}

async function handleRenameEntry(file) {
    const folder = isFolder(file);
    let parentId = normalizeParentId(file.parents) || currentFolder()?.id || '';
    if (!parentId) {
        try {
            const meta = await getFileMetadata(file.id);
            parentId = normalizeParentId(meta.parents);
        } catch {
            // keep empty — validation will be best-effort via local list only
        }
    }

    const name = await promptForName({
        title: folder ? 'Rename folder' : 'Rename note',
        hint: folder
            ? 'Folder names in this location must be unique.'
            : 'We’ll keep the .md ending for notes. Names must be unique in this folder.',
        confirmLabel: 'Rename',
        initialValue: file.name || '',
        selectStem: !folder,
        validate: parentId
            ? makeUniqueNameValidator(parentId, {
                  ignoreId: file.id,
                  isMarkdown: !folder,
              })
            : async (raw) => {
                  const trimmed = String(raw || '').trim();
                  if (!trimmed) return 'Name cannot be empty.';
                  return null;
              },
    });
    if (!name || name === file.name) return;

    // Extra guard before Drive call
    if (parentId) {
        const conflict = await nameConflictsInFolder(parentId, name, {
            ignoreId: file.id,
            isMarkdown: !folder,
        });
        if (conflict.conflict) {
            setStatus(
                `A file named “${conflict.displayName}” already exists. Choose a different name.`,
                'error'
            );
            return;
        }
    }

    setStatus('Renaming…');
    try {
        const updated = await renameDriveItem(file.id, name, { isMarkdown: !folder });
        const idx = state.files.findIndex((f) => f.id === file.id);
        if (idx >= 0) {
            state.files[idx] = { ...state.files[idx], name: updated.name };
        }
        if (state.editor.fileId === file.id) {
            state.editor.fileName = updated.name;
            syncEditorChrome(state.editor);
        }
        if (!folder) updateRecentFileName(file.id, updated.name);
        updatePinnedItem(file.id, { name: updated.name });
        if (idx >= 0 || !folder) {
            renderCurrentFileList();
        }
        // Keep folder stack labels in sync if renaming current path folder
        for (const frame of state.folderStack) {
            if (frame.id === file.id) frame.name = updated.name;
        }
        if (state.browseMode !== 'search') {
            renderFolderPath(
                state.folderStack,
                state.browseMode === 'computers' ? 'computers' : 'folder',
                state.searchQuery,
                jumpToFolderCrumb
            );
        }
        setStatus(`Renamed to ${updated.name}`, 'ok');
    } catch (err) {
        setStatus(err.message || 'Rename failed', 'error');
    }
}

async function handleCreateNote() {
    if (!canCreateInCurrentLocation()) return;
    const parent = currentFolder();
    const name = await promptForName({
        title: 'New note',
        hint: 'Name your markdown file. Names must be unique; .md is added if missing.',
        confirmLabel: 'Create',
        initialValue: 'Untitled.md',
        selectStem: true,
        validate: makeUniqueNameValidator(parent.id, { isMarkdown: true }),
    });
    if (!name) return;

    const conflict = await nameConflictsInFolder(parent.id, name, { isMarkdown: true });
    if (conflict.conflict) {
        setStatus(
            `A file named “${conflict.displayName}” already exists. Choose a different name.`,
            'error'
        );
        return;
    }

    setStatus('Creating note…');
    try {
        const created = await createMarkdownFile(parent.id, name, `# ${name.replace(/\.md$/i, '')}\n\n`);
        setStatus(`Created ${created.name}`, 'ok');
        await openMarkdownFile(created, { freshlyCreated: true });
    } catch (err) {
        setStatus(err.message || 'Could not create note', 'error');
    }
}

async function handleCreateFolder() {
    if (!canCreateInCurrentLocation()) return;
    const parent = currentFolder();
    const name = await promptForName({
        title: 'New folder',
        hint: 'Created inside the folder you’re viewing now. Names must be unique.',
        confirmLabel: 'Create',
        initialValue: 'New folder',
        validate: makeUniqueNameValidator(parent.id, { isMarkdown: false }),
    });
    if (!name) return;

    const conflict = await nameConflictsInFolder(parent.id, name, { isMarkdown: false });
    if (conflict.conflict) {
        setStatus(
            `A folder named “${conflict.displayName}” already exists. Choose a different name.`,
            'error'
        );
        return;
    }

    setStatus('Creating folder…');
    try {
        const created = await createFolder(parent.id, name);
        setStatus(`Created folder ${created.name}`, 'ok');
        await refreshBrowse(true);
    } catch (err) {
        setStatus(err.message || 'Could not create folder', 'error');
    }
}

async function handleRenameCurrentFile() {
    if (!state.editor.fileId) return;
    await handleRenameEntry({
        id: state.editor.fileId,
        name: state.editor.fileName,
        mimeType: state.editor.mimeType || 'text/markdown',
    });
}

function handlePinCurrentFile() {
    if (!state.editor.fileId) return;
    const folder = currentFolder();
    const file = {
        id: state.editor.fileId,
        name: state.editor.fileName,
        mimeType: state.editor.mimeType || 'text/markdown',
        parents: folder?.id && folder.id !== COMPUTERS_ROOT.id ? [folder.id] : undefined,
    };
    if (isPinned(file.id)) {
        unpinItem(file.id, { refresh: false });
        setStatus('');
        showAppToast(`Unpinned “${file.name || 'file'}”`, 'ok', { key: `unpin:${file.id}` });
    } else {
        pinItem(file);
    }
}

async function handleEditorMoreMenu() {
    if (!state.editor.fileId) return;
    if (state.viewMode === 'preview' && state.placingList && state.pendingImportList) {
        cancelListPlacement();
        return;
    }

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    const metaPromise = getFileMetadata(state.editor.fileId)
        .then((meta) => ({
            createdTime: meta?.createdTime || null,
            modifiedTime: meta?.modifiedTime || null,
            size: meta?.size != null ? Number(meta.size) : null,
        }))
        .catch(() => null);

    metaPromise.then((meta) => {
        const elsNow = getEls();
        if (!meta || !elsNow.editorMoreDialog?.open) return;
        fillEditorMoreStats(buildEditorFileStatRows({ meta }));
    });

    const action = await promptEditorMoreMenu({
        fileName: state.editor.fileName,
        isPinned: isPinned(state.editor.fileId),
        stats: buildEditorFileStatRows({ metaPending: true }),
        showDates: readShowDatesEnabled(),
        autosaveEnabled,
    });
    if (!action) return;

    if (action === 'rename') {
        await handleRenameCurrentFile();
        return;
    }
    if (action === 'pin' || action === 'unpin') {
        handlePinCurrentFile();
    }
}

/**
 * Wait until Drive writes settle (History restore must not race them).
 */
async function waitForAutosaveIdle() {
    await waitForDriveWritesIdle();
}

function revisionMetaLine(rev) {
    const parts = [formatRevisionTime(rev?.modifiedTime)];
    if (rev?.isCurrent) parts.push('Current');
    else if (rev?.keepForever) parts.push('Protected');
    const size = Number(rev?.size);
    if (Number.isFinite(size) && size >= 0) {
        if (size < 1024) parts.push(`${size} B`);
        else if (size < 1024 * 1024) parts.push(`${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`);
        else parts.push(`${(size / (1024 * 1024)).toFixed(1)} MB`);
    }
    return parts.filter(Boolean).join(' · ');
}

async function refreshVersionHistoryList() {
    const fileId = state.editor.fileId;
    if (!fileId) return;

    setHistoryStatus('Loading revisions…');
    renderVersionHistoryList([]);

    try {
        const { revisions, truncated } = await listAllRevisions(fileId, {
            maxRevisions: HISTORY_MAX_REVISIONS,
        });
        try {
            await enrichRevisionsWithMeta(fileId, revisions);
        } catch (metaErr) {
            console.warn('[md-editor] revision meta enrich failed', metaErr);
        }
        setHistoryStatus(
            revisions.length
                ? `${revisions.length} revision${revisions.length === 1 ? '' : 's'}`
                : ''
        );
        renderVersionHistoryList(revisions, {
            truncated,
            onPreview: (rev) => {
                previewDriveRevision(rev);
            },
            onRestore: (rev) => {
                restoreDriveRevision(rev);
            },
        });
    } catch (err) {
        setHistoryStatus(err.message || 'Could not load version history', 'error');
        renderVersionHistoryList([]);
    }
}

async function openVersionHistory() {
    if (!state.editor.fileId) {
        setStatus('Open a markdown file first', 'warn');
        return;
    }
    openHistoryDialog();
    await refreshVersionHistoryList();
}

async function nameCurrentVersion() {
    const ed = state.editor;
    if (!ed.fileId) {
        setStatus('Open a markdown file first', 'warn');
        return;
    }

    if (ed.dirty) {
        flushCurrentEditorContent();
        await saveCurrentFile();
        if (ed.dirty) {
            setStatus('Save the file before naming a version', 'warn');
            return;
        }
    }

    const label = await promptNameVersion();
    if (!label) return;

    setStatus('Naming version…');
    try {
        // Always refresh head from Drive — cached headRevisionId can be stale.
        const meta = await getFileMetadata(ed.fileId);
        const headId = meta?.headRevisionId ? String(meta.headRevisionId) : null;
        applyDriveVersionMeta(ed, {
            version: meta?.version,
            headRevisionId: headId,
        });
        if (!headId) {
            throw new Error('Could not find the current Drive revision');
        }

        await protectRevision(ed.fileId, headId);
        await upsertRevisionMeta({
            fileId: ed.fileId,
            revisionId: headId,
            type: 'named',
            label,
            createdAt: new Date().toISOString(),
        });

        // Best-effort retention for automatic safety pins (never touches named).
        pruneSafetyRevisions(ed.fileId).catch((err) => {
            console.warn('[md-editor] safety prune failed', err);
        });

        setStatus(`Named version “${label}”`, 'ok');
        showEditorToast(`Named “${label}”`, 'ok', { key: 'named-version', durationMs: 2400 });
    } catch (err) {
        setStatus(err.message || 'Could not name version', 'error');
    }
}

/**
 * @param {import('./revisions.js').DocumentRevision} rev
 */
async function previewDriveRevision(rev) {
    if (!state.editor.fileId || !rev?.id) return;

    historyPreviewRevision = rev;
    historyPreviewContent = '';
    openHistoryPreviewDialog({
        title: rev.isCurrent ? 'Current version' : 'Version preview',
        meta: revisionMetaLine(rev),
        content: '',
        busy: true,
        canRestore: !rev.isCurrent,
    });

    try {
        if (!rev.isCurrent && !rev.keepForever) {
            setHistoryPreviewStatus('Protecting revision so Drive can download it…');
        }
        const result = await getRevisionContent(state.editor.fileId, rev.id, {
            isCurrent: Boolean(rev.isCurrent),
            keepForever: Boolean(rev.keepForever),
        });
        historyPreviewContent = result.content;
        if (result.protected) {
            rev.keepForever = true;
            if (!rev.isCurrent) rev.type = 'safety';
        }
        openHistoryPreviewDialog({
            title: rev.isCurrent ? 'Current version' : 'Version preview',
            meta: revisionMetaLine(rev),
            content: result.content,
            busy: false,
            canRestore: !rev.isCurrent,
        });
    } catch (err) {
        openHistoryPreviewDialog({
            title: 'Version preview',
            meta: revisionMetaLine(rev),
            content: '',
            busy: false,
            canRestore: !rev.isCurrent,
            error: err.message || 'Could not load this revision',
        });
    }
}

/**
 * @param {import('./revisions.js').DocumentRevision} rev
 * @param {{ content?: string }} [options]
 */
async function restoreDriveRevision(rev, options = {}) {
    const ed = state.editor;
    if (!ed.fileId || !rev?.id) return;
    if (rev.isCurrent) {
        showEditorToast('Already the current version', 'ok', {
            key: 'history-current',
            durationMs: 1800,
        });
        return;
    }

    flushCurrentEditorContent();
    const meta = revisionMetaLine(rev);
    const dirtyNote = ed.dirty ? ' Unsaved local edits in the editor will be replaced.' : '';
    const ok = await promptRestoreRevision(`${meta}.${dirtyNote}`);
    if (!ok) return;

    await waitForDriveWritesIdle();
    if (isDriveWriteBusy()) {
        setStatus('Wait for the current save to finish, then try Restore again', 'warn');
        return;
    }

    const fileId = ed.fileId;
    const mimeType = ed.mimeType || 'text/markdown';

    await enqueueDriveWrite(async () => {
        if (state.editor.fileId !== fileId) return;
        restoreInFlight = true;
        stopAutosaveCountdown();
        markSaving(ed);
        syncEditorChrome(ed);
        setStatus('Restoring version…');
        setHistoryStatus('Restoring…');

        try {
            let content = options.content;
            if (typeof content !== 'string') {
                const result = await getRevisionContent(fileId, rev.id, {
                    isCurrent: false,
                    keepForever: Boolean(rev.keepForever),
                });
                content = result.content;
                if (result.protected) {
                    rev.keepForever = true;
                    rev.type = 'safety';
                }
            }

            if (state.editor.fileId !== fileId) return;

            // Pin the pre-restore head so the previous current version remains downloadable.
            try {
                const metaNow = await getFileMetadata(fileId);
                const headId = metaNow?.headRevisionId ? String(metaNow.headRevisionId) : '';
                if (headId && headId !== rev.id) {
                    await protectRevision(fileId, headId);
                    await upsertRevisionMeta({
                        fileId,
                        revisionId: headId,
                        type: 'safety',
                        label: 'Before restore',
                        createdAt: new Date().toISOString(),
                    });
                }
            } catch (pinErr) {
                console.warn('[md-editor] could not protect current head before restore', pinErr);
            }

            if (state.editor.fileId !== fileId) return;

            const savedMeta = await updateFileContent(fileId, content, mimeType);
            if (state.editor.fileId !== fileId) return;

            const els = getEls();
            applyLoadedContent(ed, {
                fileId,
                fileName: ed.fileName,
                mimeType,
                content,
                driveVersion: savedMeta?.version ?? null,
                headRevisionId: savedMeta?.headRevisionId
                    ? String(savedMeta.headRevisionId)
                    : null,
            });
            ed.status = 'saved';
            if (els.editor) els.editor.value = ed.editorContent;
            editHistory.reset(ed.editorContent);
            clearDraft(fileId);
            autosaveContentFingerprint = ed.editorContent;
            pendingConflict = null;

            refreshDocumentModelFromText(ed.editorContent);
            applyTagFilters(state.documentModel, state.tagFilters);
            applyEditingLists(state.documentModel, state.editingListIds);
            applyEditingPlainLists(state.documentModel, state.editingPlainLists);

            closeHistoryPreviewDialog();
            syncEditorChrome(ed);
            if (state.viewMode !== 'raw') {
                renderStructuredEditor();
            }

            setStatus('Restored earlier version', 'ok');
            showEditorToast('Restored earlier version', 'ok', {
                key: 'history-restored',
                durationMs: 2400,
            });

            if (getEls().historyDialog?.open) {
                await refreshVersionHistoryList();
            }
        } catch (err) {
            if (state.editor.fileId !== fileId) return;
            markError(ed, err.message || 'Restore failed');
            ed.dirty = !textsEqual(ed.editorContent, ed.originalContent);
            if (ed.dirty) ed.status = 'error';
            syncEditorChrome(ed);
            setStatus(ed.errorMessage || 'Restore failed', 'error');
            setHistoryStatus(ed.errorMessage || 'Restore failed', 'error');
        } finally {
            restoreInFlight = false;
            syncAutosaveFromEditorState();
        }
    });
}

function formatStatNumber(n) {
    return Number(n || 0).toLocaleString();
}

function formatStatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStatDate(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    try {
        return date.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return date.toLocaleString();
    }
}

function countWordsInText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
}

/**
 * @param {{ meta?: { createdTime?: string|null, modifiedTime?: string|null, size?: number|null } | null, metaPending?: boolean }} [options]
 * @returns {Array<{ label: string, value: string, pending?: boolean }>}
 */
function buildEditorFileStatRows(options = {}) {
    const text = String(state.editor.editorContent || '');
    const doc = state.documentModel;
    const meta = options.meta || null;
    const metaPending = Boolean(options.metaPending) && !meta;

    const characters = text.length;
    const charactersNoSpace = text.replace(/\s/g, '').length;
    const words = countWordsInText(text);
    const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
    const contentBytes = new TextEncoder().encode(text).length;

    let customLists = 0;
    let customItems = 0;
    let plainLists = 0;
    let plainItems = 0;
    let headings = 0;

    for (const seg of doc?.segments || []) {
        if (seg.type === 'mdlist' && seg.list) {
            customLists += 1;
            customItems += (seg.list.items || []).length;
            continue;
        }
        if (seg.type !== 'markdown') continue;
        const source = stripMdlistAgentNotes(seg.text || '');
        headings += extractMarkdownHeadings(source).length;
        for (const block of splitMarkdownBlocks(source)) {
            if (block.type !== 'plainlist') continue;
            plainLists += 1;
            plainItems += (block.items || []).length;
        }
    }

    const totalLists = customLists + plainLists;
    const totalItems = customItems + plainItems;
    const readingMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));

    return [
        { label: 'Characters', value: formatStatNumber(characters) },
        { label: 'Characters (no spaces)', value: formatStatNumber(charactersNoSpace) },
        { label: 'Words', value: formatStatNumber(words) },
        { label: 'Lines', value: formatStatNumber(lines) },
        { label: 'Reading time', value: words === 0 ? '—' : `~${readingMinutes} min` },
        { label: 'Headings', value: formatStatNumber(headings) },
        {
            label: 'Lists',
            value:
                totalLists === 0
                    ? '0'
                    : `${formatStatNumber(totalLists)} (${formatStatNumber(customLists)} custom · ${formatStatNumber(plainLists)} normal)`,
        },
        { label: 'List items', value: formatStatNumber(totalItems) },
        { label: 'Content size', value: formatStatBytes(contentBytes) },
        {
            label: 'Drive size',
            value: metaPending ? 'Loading…' : formatStatBytes(meta?.size),
            pending: metaPending,
        },
        {
            label: 'Created',
            value: metaPending ? 'Loading…' : formatStatDate(meta?.createdTime),
            pending: metaPending,
        },
        {
            label: 'Last edited',
            value: metaPending ? 'Loading…' : formatStatDate(meta?.modifiedTime),
            pending: metaPending,
        },
        {
            label: 'Unsaved changes',
            value: state.editor.dirty ? 'Yes' : 'No',
        },
    ];
}

function importXanderListFromText(text) {
    if (!state.editor.fileId) {
        setStatus('Open a markdown file first', 'warn');
        return;
    }
    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    const payload = parseXanderListJson(text);
    const mdlist = xanderListToMdlist(payload);
    state.clickEdit = false;
    state.pendingImportList = mdlist;
    state.placingList = true;

    if (state.viewMode !== 'preview') {
        applyViewMode('preview', { persist: true });
        // applyViewMode clears placing when leaving other modes — re-enable place mode
        state.pendingImportList = mdlist;
        state.placingList = true;
        renderStructuredEditor();
    } else {
        renderStructuredEditor();
    }
    syncInsertListButton();
    syncImportListButton();
    setStatus(
        `Tap where to place “${mdlist.title}” (${mdlist.items.length} item${
            mdlist.items.length === 1 ? '' : 's'
        }), then Above or Below — or Cancel`,
        'ok'
    );
}

async function handleImportListFile(file) {
    if (!file) return;
    try {
        const text = await file.text();
        importXanderListFromText(text);
    } catch (err) {
        setStatus(err.message || 'Could not import list JSON', 'error');
    }
}

function cancelListPlacement() {
    state.placingList = false;
    state.pendingImportList = null;
    renderStructuredEditor();
    syncInsertListButton();
    syncImportListButton();
    setStatus('Cancelled list placement');
}

function insertRankedList() {
    if (!state.editor.fileId) return;

    if (state.viewMode === 'preview' && state.placingList) {
        cancelListPlacement();
        return;
    }

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    if (state.viewMode === 'preview') {
        state.clickEdit = false;
        state.pendingImportList = null;
        state.placingList = true;
        applyEditingLists(state.documentModel, state.editingListIds);
        applyTagFilters(state.documentModel, state.tagFilters);
        renderStructuredEditor();
        syncImportListButton();
        setStatus('Tap content to place the list, or Cancel', 'ok');
        return;
    }

    const list = appendEmptyList(state.documentModel);
    const item = addItem(list, '');
    state.editingListIds = { ...state.editingListIds, [list.id]: true };
    state.placingList = false;
    state.pendingImportList = null;
    state.clickEdit = false;
    applyEditingLists(state.documentModel, state.editingListIds);
    const serialized = serializeDocument(state.documentModel);
    setEditorText(state.editor, serialized);
    const els = getEls();
    els.editor.value = serialized;
    applyViewMode('list', { persist: true });
    renderStructuredEditor({ focusItemId: item.id });
    syncEditorChrome(state.editor);
    setStatus('Added ranked list', 'ok');
}

function toggleClickEdit() {
    if (!state.editor.fileId) return;

    if (state.viewMode === 'preview' && state.clickEdit) {
        state.clickEdit = false;
        renderStructuredEditor();
        setStatus('Cancelled');
        return;
    }

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);
    state.placingList = false;
    state.pendingImportList = null;
    state.clickEdit = true;

    if (state.viewMode !== 'preview') {
        applyViewMode('preview', { persist: true });
    } else {
        renderStructuredEditor();
    }
    syncClickEditButton();
    setStatus('Tap text to edit in Raw, or Cancel', 'ok');
}

function toggleShowDates() {
    const next = writeShowDatesEnabled(!readShowDatesEnabled());
    syncEditorMoreShowDates(next);
    queueSettingsCloudSync();
    if (state.editor.fileId && state.viewMode !== 'raw') {
        renderStructuredEditor();
    }
    setStatus(next ? 'Dates visible in Preview' : 'Dates hidden in Preview', 'ok');
}

function insertDateTagIntoEditor() {
    if (!state.editor.fileId) {
        setStatus('Open a markdown file first', 'warn');
        return;
    }

    flushCurrentEditorContent();
    const els = getEls();
    const tag = buildDateTag();

    if (state.viewMode === 'raw' && els.editor) {
        const start = Number(els.editor.selectionStart) || 0;
        const end = Number(els.editor.selectionEnd) || start;
        noteUserEditBoundary(els.editor.value);
        const { text, caret } = insertDateTagAt(els.editor.value, start, end, tag);
        setEditorText(state.editor, text);
        els.editor.value = text;
        editHistory.touch(text);
        try {
            els.editor.focus();
            els.editor.setSelectionRange(caret, caret);
        } catch {
            // ignore
        }
        syncEditorChrome(state.editor);
        setStatus('Inserted date tag', 'ok');
        return;
    }

    refreshDocumentModelFromText(state.editor.editorContent);
    const current = state.editor.editorContent || '';
    const needsNl = current.length > 0 && !current.endsWith('\n');
    const next = `${current}${needsNl ? '\n' : ''}${tag}\n`;
    noteUserEditBoundary(current);
    setEditorText(state.editor, next);
    els.editor.value = next;
    editHistory.touch(next);
    refreshDocumentModelFromText(next);
    if (state.viewMode === 'list' || state.viewMode === 'preview' || state.viewMode === 'contents') {
        applyEditingLists(state.documentModel, state.editingListIds);
        applyTagFilters(state.documentModel, state.tagFilters);
        renderStructuredEditor();
    }
    syncEditorChrome(state.editor);
    setStatus('Inserted date tag (end of file)', 'ok');
}

async function fillMissingListDatesFromMenu() {
    if (!state.editor.fileId) {
        setStatus('Open a markdown file first', 'warn');
        return;
    }

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    const counts = countItemsMissingDates(state.documentModel);
    if (!counts.missing) {
        setStatus('All list items already have date tags', 'ok');
        showEditorToast('All list items already have dates', 'ok', {
            key: 'fill-dates-none',
            durationMs: 2200,
        });
        return;
    }

    let createdTime = null;
    try {
        const meta = await getFileMetadata(state.editor.fileId);
        createdTime = meta?.createdTime || null;
    } catch {
        createdTime = null;
    }

    const createdTag = buildDateTagFromCreatedTime(createdTime);
    const createdLabel = createdTag
        ? `${formatDateTagLabel(createdTag) || createdTag} (${createdTag})`
        : '';

    const tag = await promptFillListDates({
        missing: counts.missing,
        total: counts.total,
        createdTag,
        createdLabel,
        defaultCustom: buildDateTag().replace(/^\{\{\s*date\s*:\s*/i, '').replace(/\s*\}\}$/, ''),
        resolveTag: resolveDateTagInput,
    });
    if (!tag) return;

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    const result = fillMissingListDates(state.documentModel, tag);
    if (!result.filled) {
        setStatus('No list items needed a date tag', 'ok');
        return;
    }

    const serialized = serializeDocument(state.documentModel);
    const els = getEls();
    noteUserEditBoundary(state.editor.editorContent);
    setEditorText(state.editor, serialized);
    els.editor.value = serialized;
    editHistory.touch(serialized);
    refreshDocumentModelFromText(serialized);
    applyEditingLists(state.documentModel, state.editingListIds);
    applyEditingPlainLists(state.documentModel, state.editingPlainLists);
    applyReorderingLists(state.documentModel, state.reorderingListIds);
    applyReorderingPlainLists(state.documentModel, state.reorderingPlainLists);
    applyTagFilters(state.documentModel, state.tagFilters);

    if (state.viewMode === 'raw') {
        // textarea already updated
    } else if (
        state.viewMode === 'list' ||
        state.viewMode === 'preview' ||
        state.viewMode === 'contents'
    ) {
        renderStructuredEditor();
    }

    syncEditorChrome(state.editor);
    const msg = `Added dates to ${result.filled} item${result.filled === 1 ? '' : 's'}`;
    setStatus(msg, 'ok');
    showEditorToast(msg, 'ok', { key: 'fill-dates-done', durationMs: 2600 });
}

function hasOpenFile() {
    return Boolean(state.editor.fileId);
}

function showAppView(name, extra = {}) {
    showView(name, { hasOpenFile: hasOpenFile(), ...extra });
    if (name === 'editor' && hasOpenFile() && !extra.loading) {
        applyEditorDisplayMode(state.viewMode, { hasFile: true });
        if (
            state.viewMode === 'list' ||
            state.viewMode === 'preview' ||
            state.viewMode === 'contents'
        ) {
            renderStructuredEditor();
        }
        syncNavLayout();
    }
}

async function openMarkdownFile(file, options = {}) {
    const els = getEls();
    // Finish any in-flight Drive write before switching file identity.
    if (state.editor.fileId && state.editor.fileId !== file.id) {
        await waitForDriveWritesIdle();
    }
    // Only flush when we might need to warn — flushing Preview/List through
    // serialize used to mark clean files dirty (format drift vs Drive text).
    if (
        state.editor.fileId &&
        state.editor.fileId !== file.id
    ) {
        flushCurrentEditorContent();
        if (state.editor.dirty) {
            const choice = await promptUnsavedChanges(els.unsavedDialog);
            if (choice === 'cancel') return;
            if (choice === 'save') {
                await saveCurrentFile();
                if (state.editor.dirty) return;
            }
        }
    }

    state.editor.status = 'loading';
    showAppView('editor', { loading: true });
    setEditorLoading(true, file.name || 'Markdown file');
    setStatus('Opening file…');

    try {
        const meta = await getFileMetadata(file.id);
        const size = Number(meta.size || 0);
        if (size > LARGE_FILE_BYTES) {
            const ok = window.confirm(
                `This file is about ${Math.round(size / 1024 / 1024)} MB. Opening large files may be slow on iPhone. Continue?`
            );
            if (!ok) {
                setEditorLoading(false);
                state.editor.status = state.editor.dirty ? 'dirty' : 'idle';
                showAppView('finder');
                setStatus('');
                return;
            }
        }

        const content = await getFileContent(file.id);
        applyLoadedContent(state.editor, {
            fileId: meta.id,
            fileName: meta.name,
            mimeType: meta.mimeType,
            content,
            driveVersion: meta.version ?? null,
            headRevisionId: meta.headRevisionId ? String(meta.headRevisionId) : null,
        });
        pendingConflict = null;
        destructiveAutosaveDeferUntil = 0;
        destructiveWarnedFingerprint = null;
        rememberRecentFile({
            id: meta.id,
            name: meta.name,
            mimeType: meta.mimeType,
        });

        const draft = readDraft(meta.id);
        if (draft && !textsEqual(draft.text, content)) {
            const choice = await promptRestoreDraft(els.draftDialog);
            if (choice === 'restore') {
                setEditorText(state.editor, draft.text);
            } else {
                clearDraft(meta.id);
            }
        }

        setEditorLoading(false);
        showAppView('editor');
        syncEditorChrome(state.editor);
        setupEditorForOpenFile({ freshlyCreated: Boolean(options.freshlyCreated) });
    } catch (err) {
        setEditorLoading(false);
        markError(state.editor, err.message || 'Failed to open file');
        showAppView('editor');
        syncEditorChrome(state.editor);
        if (hasOpenFile()) {
            applyEditorDisplayMode(state.viewMode, { hasFile: true });
        }
        setStatus(state.editor.errorMessage, 'error');
    }
}

async function saveCurrentFile(options = {}) {
    const autosave = Boolean(options.autosave);
    const skipConflictCheck = Boolean(options.skipConflictCheck);

    if (!autosave && pendingConflict && !skipConflictCheck) {
        await resolvePendingConflict();
        return;
    }

    await enqueueDriveWrite(() => saveCurrentFileExclusive(options));

    // Conflict detected during exclusive save — resolve outside the write lock.
    if (!autosave && pendingConflict && !skipConflictCheck) {
        await resolvePendingConflict();
    }
}

/**
 * Exclusive Drive save body — always entered via enqueueDriveWrite.
 * @param {{ autosave?: boolean, skipConflictCheck?: boolean, force?: boolean }} [options]
 */
async function saveCurrentFileExclusive(options = {}) {
    const autosave = Boolean(options.autosave);
    const skipConflictCheck = Boolean(options.skipConflictCheck);
    const ed = state.editor;
    if (!ed.fileId) return;
    if (restoreInFlight) return;

    // Snapshot identity + bytes so a later file switch cannot redirect this write.
    flushCurrentEditorContent();
    const fileId = ed.fileId;
    const mimeType = ed.mimeType || 'text/markdown';
    const snapshot = ed.editorContent;
    const baselineAtStart = ed.originalContent;
    let expectedVersion = ed.driveVersion;

    if (!ed.dirty && !options.force) {
        if (!autosave) {
            showEditorToast('Already saved', 'ok', {
                key: 'already-saved',
                durationMs: 1600,
            });
        }
        stopAutosaveCountdown();
        return;
    }

    stopAutosaveCountdown();
    editHistory.closeGroup();

    if (!autosave) {
        markSaving(ed);
        syncEditorChrome(ed);
    }

    const stillSameFile = () => state.editor.fileId === fileId;

    try {
        if (!skipConflictCheck && expectedVersion != null && expectedVersion !== '') {
            const remoteMeta = await getFileMetadata(fileId);
            if (!stillSameFile()) return;
            const remoteVersion =
                remoteMeta?.version != null && remoteMeta.version !== ''
                    ? remoteMeta.version
                    : null;
            if (
                remoteVersion != null &&
                String(remoteVersion) !== String(expectedVersion)
            ) {
                const driveContent = await getFileContent(fileId);
                if (!stillSameFile()) return;
                if (!textsEqual(driveContent, snapshot)) {
                    pendingConflict = {
                        fileId,
                        localContent: stillSameFile()
                            ? state.editor.editorContent || snapshot
                            : snapshot,
                        driveContent,
                        driveVersion: remoteVersion,
                        headRevisionId: remoteMeta?.headRevisionId
                            ? String(remoteMeta.headRevisionId)
                            : null,
                    };
                    writeDraft(fileId, pendingConflict.localContent, ed.fileName);
                    if (stillSameFile()) {
                        ed.status = 'conflict';
                        ed.errorMessage = 'Changed elsewhere';
                    }
                    if (autosave) {
                        showEditorToast('Changed elsewhere — tap Save to resolve', 'warn', {
                            key: 'conflict',
                            durationMs: 4000,
                        });
                        if (stillSameFile()) {
                            syncEditorChrome(ed, { quiet: true, syncAutosave: true });
                        }
                        setStatus('Changed elsewhere', 'warn');
                        return;
                    }
                    if (stillSameFile()) syncEditorChrome(ed);
                    // resolvePendingConflict runs outside this exclusive lock via saveCurrentFile.
                    return;
                }
                // Same text — adopt remote version and continue.
                expectedVersion = remoteVersion;
                if (stillSameFile()) {
                    applyDriveVersionMeta(ed, {
                        version: remoteVersion,
                        headRevisionId: remoteMeta?.headRevisionId || null,
                    });
                }
            }
        }

        // Before uploading a destructive edit, pin the current Drive head.
        if (isDestructiveChange(baselineAtStart, snapshot)) {
            let headId = stillSameFile() ? ed.headRevisionId : null;
            try {
                const meta = await getFileMetadata(fileId);
                if (!stillSameFile()) return;
                headId = meta?.headRevisionId ? String(meta.headRevisionId) : headId;
                expectedVersion =
                    meta?.version != null && meta.version !== ''
                        ? meta.version
                        : expectedVersion;
                if (stillSameFile()) {
                    applyDriveVersionMeta(ed, {
                        version: meta?.version,
                        headRevisionId: headId,
                    });
                }
            } catch {
                // keep cached head if any
            }

            if (headId) {
                try {
                    await protectRevision(fileId, headId);
                    await upsertRevisionMeta({
                        fileId,
                        revisionId: headId,
                        type: 'safety',
                        label: 'Before large change',
                        createdAt: new Date().toISOString(),
                    });
                    pruneSafetyRevisions(fileId).catch((err) => {
                        console.warn('[md-editor] safety prune failed', err);
                    });
                } catch (pinErr) {
                    console.warn('[md-editor] safety pin before destructive save failed', pinErr);
                    if (autosave) {
                        if (stillSameFile()) {
                            ed.status = 'dirty';
                            syncEditorChrome(ed, { quiet: true, syncAutosave: true });
                        }
                        showEditorToast(
                            'Autosave blocked — could not protect previous version. Tap Save.',
                            'warn',
                            { key: 'destructive-pin-fail', durationMs: 4000 }
                        );
                        return;
                    }
                    const proceed = window.confirm(
                        'Could not protect the previous version on Drive before saving this large change. Save anyway?'
                    );
                    if (!proceed) {
                        if (stillSameFile()) {
                            ed.status = 'dirty';
                            syncEditorChrome(ed);
                        }
                        return;
                    }
                }
            }
        }

        // Final version recheck immediately before upload (shrinks TOCTOU window).
        if (!skipConflictCheck && expectedVersion != null && expectedVersion !== '') {
            const preMeta = await getFileMetadata(fileId);
            if (!stillSameFile()) return;
            const preVersion =
                preMeta?.version != null && preMeta.version !== '' ? preMeta.version : null;
            if (preVersion != null && String(preVersion) !== String(expectedVersion)) {
                const driveContent = await getFileContent(fileId);
                if (!stillSameFile()) return;
                if (!textsEqual(driveContent, snapshot)) {
                    pendingConflict = {
                        fileId,
                        localContent: state.editor.editorContent || snapshot,
                        driveContent,
                        driveVersion: preVersion,
                        headRevisionId: preMeta?.headRevisionId
                            ? String(preMeta.headRevisionId)
                            : null,
                    };
                    writeDraft(fileId, pendingConflict.localContent, ed.fileName);
                    if (stillSameFile()) {
                        ed.status = 'conflict';
                        ed.errorMessage = 'Changed elsewhere';
                        syncEditorChrome(ed);
                    }
                    if (!autosave) {
                        if (stillSameFile()) syncEditorChrome(ed);
                        // Outer saveCurrentFile will call resolvePendingConflict.
                        return;
                    }
                    showEditorToast('Changed elsewhere — tap Save to resolve', 'warn', {
                        key: 'conflict',
                        durationMs: 4000,
                    });
                    return;
                }
                expectedVersion = preVersion;
                if (stillSameFile()) {
                    applyDriveVersionMeta(ed, {
                        version: preVersion,
                        headRevisionId: preMeta?.headRevisionId || null,
                    });
                }
            }
        }

        if (!stillSameFile()) return;

        const savedMeta = await updateFileContent(fileId, snapshot, mimeType);
        if (!stillSameFile()) return;

        applySavedBaseline(ed, snapshot);
        let nextVersion = savedMeta?.version;
        let nextHead = savedMeta?.headRevisionId ? String(savedMeta.headRevisionId) : null;
        if (nextVersion == null || nextVersion === '' || !nextHead) {
            try {
                const refreshed = await getFileMetadata(fileId);
                if (stillSameFile()) {
                    if (nextVersion == null || nextVersion === '') nextVersion = refreshed?.version;
                    if (!nextHead && refreshed?.headRevisionId) {
                        nextHead = String(refreshed.headRevisionId);
                    }
                }
            } catch {
                // keep whatever upload returned
            }
        }
        if (stillSameFile()) {
            applyDriveVersionMeta(ed, {
                version: nextVersion,
                headRevisionId: nextHead,
            });
            // Align baseline to canonical serialize so Preview/List flush stays clean.
            try {
                refreshDocumentModelFromText(ed.editorContent);
                if (state.documentModel) {
                    const canonical = serializeDocument(state.documentModel);
                    if (
                        !ed.dirty &&
                        !textsEqual(canonical, ed.originalContent)
                    ) {
                        rebaseEditorBaseline(ed, canonical);
                        const elsCanon = getEls();
                        if (elsCanon.editor) elsCanon.editor.value = canonical;
                    }
                }
            } catch {
                // ignore canonicalize failures
            }
        }
        autosaveContentFingerprint = ed.editorContent;
        destructiveAutosaveDeferUntil = 0;
        destructiveWarnedFingerprint = null;
        if (pendingConflict?.fileId === fileId) pendingConflict = null;

        if (autosave) {
            syncEditorChrome(ed, { quiet: true, syncAutosave: true });
            return;
        }

        syncEditorChrome(ed);
        refreshDocumentModelFromText(ed.editorContent);
        applyTagFilters(state.documentModel, state.tagFilters);
        applyEditingLists(state.documentModel, state.editingListIds);
        if (state.viewMode !== 'raw' && !isEditorTextFieldFocused()) {
            renderStructuredEditor();
        }
    } catch (err) {
        if (!stillSameFile()) return;
        markError(ed, err.message || 'Save failed');
        ed.dirty = !textsEqual(ed.editorContent, ed.originalContent);
        if (ed.dirty) ed.status = 'error';
        if (autosave) {
            showEditorToast(ed.errorMessage || 'Autosave failed', 'error', {
                key: 'autosave-error',
                durationMs: 3600,
            });
            syncEditorChrome(ed, { quiet: true, syncAutosave: true });
        } else {
            syncEditorChrome(ed);
        }
    }
}

/**
 * @returns {Promise<void>}
 */
async function resolvePendingConflict() {
    if (conflictResolveInFlight) return conflictResolveInFlight;
    conflictResolveInFlight = (async () => {
        const conflict = pendingConflict;
        const ed = state.editor;
        if (!conflict || !ed.fileId || conflict.fileId !== ed.fileId) return;

        flushCurrentEditorContent();
        const liveLocal = ed.editorContent || conflict.localContent;

        let choice = await promptConflictDialog();
        if (choice === 'review') {
            choice = await promptConflictReview({
                localText: liveLocal,
                driveText: conflict.driveContent,
            });
        }
        if (!choice) {
            ed.status = 'conflict';
            syncEditorChrome(ed);
            setStatus('Conflict unresolved — your edits are kept locally', 'warn');
            return;
        }

        if (choice === 'use-drive') {
            const els = getEls();
            applyLoadedContent(ed, {
                fileId: ed.fileId,
                fileName: ed.fileName,
                mimeType: ed.mimeType || 'text/markdown',
                content: conflict.driveContent,
                driveVersion: conflict.driveVersion,
                headRevisionId: conflict.headRevisionId,
            });
            if (els.editor) els.editor.value = ed.editorContent;
            editHistory.reset(ed.editorContent);
            clearDraft(ed.fileId);
            pendingConflict = null;
            autosaveContentFingerprint = ed.editorContent;
            refreshDocumentModelFromText(ed.editorContent);
            syncEditorChrome(ed);
            if (state.viewMode !== 'raw') renderStructuredEditor();
            setStatus('Loaded Drive version', 'ok');
            showEditorToast('Using Drive version', 'ok', {
                key: 'conflict-drive',
                durationMs: 2200,
            });
            return;
        }

        // keep-mine: upload live local text after adopting remote version token.
        applyDriveVersionMeta(ed, {
            version: conflict.driveVersion,
            headRevisionId: conflict.headRevisionId,
        });
        setEditorText(ed, liveLocal);
        const els = getEls();
        if (els.editor) els.editor.value = liveLocal;
        writeDraft(ed.fileId, liveLocal, ed.fileName);

        try {
            await saveCurrentFile({ skipConflictCheck: true, force: true });
            if (state.editor.fileId === conflict.fileId && state.editor.status !== 'error') {
                pendingConflict = null;
                setStatus('Kept your version on Drive', 'ok');
                showEditorToast('Kept your version', 'ok', {
                    key: 'conflict-mine',
                    durationMs: 2200,
                });
            } else if (state.editor.fileId === conflict.fileId) {
                ed.status = 'conflict';
                setStatus('Could not keep your version — try Save again', 'error');
            }
        } catch {
            ed.status = 'conflict';
            setStatus('Could not keep your version — try Save again', 'error');
        }
    })().finally(() => {
        conflictResolveInFlight = null;
    });
    return conflictResolveInFlight;
}

/**
 * Switch app mode tabs. Open files stay in memory across Pinned / Finder / Edit / Settings.
 * @param {'pinned' | 'finder' | 'editor' | 'settings'} mode
 */
async function switchAppMode(mode) {
    if (mode === 'editor') {
        showAppView('editor');
        if (hasOpenFile()) {
            syncEditorChrome(state.editor);
            applyViewMode(state.viewMode, { persist: false });
        }
        return;
    }

    const els = getEls();
    const leavingEditor = els.viewEditor && !els.viewEditor.hidden;
    if (leavingEditor && hasOpenFile()) {
        flushCurrentEditorContent();
        // Format-only drift should have been rebased by flush; only warn on real edits.
        if (state.editor.dirty) {
            const choice = await promptUnsavedChanges(els.unsavedDialog);
            if (choice === 'cancel') return;
            if (choice === 'save') {
                await saveCurrentFile();
                if (state.editor.dirty) return;
            }
        }
    }

    if (leavingEditor) {
        state.placingList = false;
        state.pendingImportList = null;
        state.clickEdit = false;
        stopAutosaveCountdown();
    }

    if (mode === 'pinned') {
        showPinnedView();
        return;
    }

    if (mode === 'finder') {
        showAppView('finder');
        await refreshBrowse(true);
        return;
    }

    if (mode === 'settings') {
        showAppView('settings');
    }
}

async function signIn() {
    setConfigError('');
    setStatus('Waiting for Google…');
    try {
        await requestAccessToken();
        await afterSignedIn();
    } catch (err) {
        setStatus(err.message || 'Sign-in cancelled or failed', 'error');
    }
}

async function signOut() {
    if (state.editor.fileId) {
        flushCurrentEditorContent();
    }
    if (state.editor.dirty) {
        const choice = await promptUnsavedChanges(getEls().unsavedDialog);
        if (choice === 'cancel') return;
        if (choice === 'save') {
            await saveCurrentFile();
            if (state.editor.dirty) return;
        }
    }
    try {
        await flushCloudSettingsSave(buildSettingsSnapshot);
    } catch {
        // ignore
    }
    resetCloudSettingsState();
    pinnedMetaCache.clear();
    clearToken({ revoke: true, forget: true });
    state.editor = createEditorState();
    state.files = [];
    state.browseMode = 'folder';
    state.searchQuery = '';
    state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
    state.documentModel = null;
    state.tagFilters = {};
    state.editingListIds = {};
    state.editingPlainLists = {};
    state.reorderingListIds = {};
    state.reorderingPlainLists = {};
    state.placingList = false;
    state.pendingImportList = null;
    state.clickEdit = false;
    state.viewMode = 'raw';
    state.parseWarnings = [];
    editorSearch?.close({ restoreFocus: false });
    showView('login');
    setStatus('');
}

async function afterSignedIn() {
    setStatus('');
    state.browseMode = 'folder';

    await syncSettingsFromCloud();

    const remembered = readRememberedFolder();
    if (remembered && remembered !== ROOT_FOLDER_ID) {
        state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
        try {
            const meta = await getFileMetadata(remembered);
            if (isFolder(meta)) {
                state.folderStack.push({ id: meta.id, name: meta.name || 'Folder' });
            }
        } catch {
            state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
        }
    }

    // Prefer Pinned when the user has shortcuts; Finder stays one tap away.
    if (readPinnedItems().length) {
        showPinnedView();
        // Warm Finder listing in the background for when they switch tabs
        loadBrowse(true).catch(() => {});
        return;
    }

    showAppView('finder');
    await loadBrowse(true);
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('SW registration failed', err);
        });
    });
}

function wireEvents() {
    const els = getEls();

    editorSearch = createEditorSearch({
        getEls,
        getText: () => {
            flushCurrentEditorContent();
            return getEls().editor?.value ?? state.editor.editorContent ?? '';
        },
        getViewMode: () => state.viewMode,
        getHighlightRoot: () => getEls().listsRoot,
        isActive: () => {
            const nodes = getEls();
            return Boolean(state.editor.fileId && nodes.viewEditor && !nodes.viewEditor.hidden);
        },
        onStatus: setStatus,
        onLayout: () => {
            // Find bar lives in the bottom nav — remeasure padding when it opens/closes.
            requestAnimationFrame(() => syncNavLayout());
        },
    });
    editorSearch.bind();

    els.tabPinned?.addEventListener('click', () => {
        editorSearch?.close({ restoreFocus: false });
        switchAppMode('pinned');
    });
    els.tabFinder.addEventListener('click', () => {
        editorSearch?.close({ restoreFocus: false });
        switchAppMode('finder');
    });
    els.tabEditor.addEventListener('click', () => {
        switchAppMode('editor');
    });
    els.tabSettings.addEventListener('click', () => {
        editorSearch?.close({ restoreFocus: false });
        switchAppMode('settings');
    });
    els.btnGoFinder.addEventListener('click', () => {
        editorSearch?.close({ restoreFocus: false });
        switchAppMode('finder');
    });

    els.btnSignIn.addEventListener('click', () => {
        signIn();
    });
    els.btnSignOut.addEventListener('click', () => {
        signOut();
    });
    els.btnSave.addEventListener('click', () => {
        saveCurrentFile();
    });
    els.btnUp.addEventListener('click', () => {
        goUp();
    });
    els.btnLoadMore.addEventListener('click', () => {
        if (!state.loadingFolder && state.nextPageToken) {
            refreshBrowse(false);
        }
    });
    els.btnModeFolders.addEventListener('click', () => {
        switchToFolderMode();
    });
    els.btnModeComputers.addEventListener('click', () => {
        switchToComputersMode();
    });
    els.btnModeSearch.addEventListener('click', async () => {
        await switchToSearchMode();
    });
    els.btnNewNote.addEventListener('click', () => {
        handleCreateNote();
    });
    els.btnNewFolder.addEventListener('click', () => {
        handleCreateFolder();
    });
    if (els.btnFinderSort) {
        els.btnFinderSort.addEventListener('click', async () => {
            const current = readFinderSort();
            const next = await promptFinderSort(current);
            if (!next || next === current) return;
            const mode = writeFinderSort(next);
            syncFinderSortControl(mode);
            const label =
                FINDER_SORT_OPTIONS.find((o) => o.value === mode)?.label || mode;
            setStatus(`Sorted by ${label}`, 'ok');
            const elsNow = getEls();
            if (elsNow.viewPinned && !elsNow.viewPinned.hidden) {
                await renderPinnedView();
            } else {
                await refreshBrowse(true);
            }
        });
    }
    if (els.btnEditorMore) {
        els.btnEditorMore.addEventListener('click', () => {
            handleEditorMoreMenu();
        });
    }
    if (els.editorMoreImport && els.importListFile) {
        // Keep file-picker open in the same user gesture as the menu tap.
        els.editorMoreImport.addEventListener('click', () => {
            const dialog = els.editorMoreDialog;
            if (dialog?.open) dialog.close('cancel');
            if (!hasOpenFile()) {
                setStatus('Open a markdown file first', 'warn');
                return;
            }
            els.importListFile.value = '';
            els.importListFile.click();
        });
    }
    if (els.editorMoreInsertDate) {
        els.editorMoreInsertDate.addEventListener('click', () => {
            const dialog = els.editorMoreDialog;
            if (dialog?.open) dialog.close('cancel');
            insertDateTagIntoEditor();
        });
    }
    if (els.editorMoreFillDates) {
        els.editorMoreFillDates.addEventListener('click', () => {
            const dialog = els.editorMoreDialog;
            if (dialog?.open) dialog.close('cancel');
            fillMissingListDatesFromMenu();
        });
    }
    if (els.editorMoreShowDates) {
        els.editorMoreShowDates.addEventListener('click', () => {
            toggleShowDates();
        });
    }
    if (els.editorMoreAutosaveOff) {
        els.editorMoreAutosaveOff.addEventListener('click', () => {
            if (!autosaveEnabled || els.editorMoreAutosaveOff.disabled) return;
            const dialog = els.editorMoreDialog;
            if (dialog?.open) dialog.close('cancel');
            autosaveEnabled = false;
            stopAutosaveCountdown();
            showEditorToast('Autosave off — tap Save when ready. Reopen the file to turn it back on.', 'warn', {
                key: 'autosave-off',
                durationMs: 3200,
            });
        });
    }
    if (els.editorMoreHistory) {
        els.editorMoreHistory.addEventListener('click', () => {
            const dialog = els.editorMoreDialog;
            if (dialog?.open) dialog.close('cancel');
            openVersionHistory();
        });
    }
    if (els.editorMoreNameVersion) {
        els.editorMoreNameVersion.addEventListener('click', () => {
            const dialog = els.editorMoreDialog;
            if (dialog?.open) dialog.close('cancel');
            nameCurrentVersion();
        });
    }
    if (els.historyClose) {
        els.historyClose.addEventListener('click', () => {
            closeHistoryDialog();
        });
    }
    if (els.historyPreviewClose) {
        els.historyPreviewClose.addEventListener('click', () => {
            closeHistoryPreviewDialog();
        });
    }
    if (els.historyPreviewCopy) {
        els.historyPreviewCopy.addEventListener('click', async () => {
            const text = historyPreviewContent || els.historyPreviewText?.textContent || '';
            if (!text) {
                setHistoryPreviewStatus('Nothing to copy yet', 'error');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                setHistoryPreviewStatus('Copied to clipboard');
            } catch {
                setHistoryPreviewStatus('Could not copy — select text manually', 'error');
            }
        });
    }
    if (els.historyPreviewRestore) {
        els.historyPreviewRestore.addEventListener('click', () => {
            if (!historyPreviewRevision || historyPreviewRevision.isCurrent) return;
            restoreDriveRevision(historyPreviewRevision, {
                content: historyPreviewContent || undefined,
            });
        });
    }
    if (els.btnInsertList) {
        els.btnInsertList.addEventListener('click', () => {
            insertRankedList();
        });
    }
    if (els.importListFile) {
        els.importListFile.addEventListener('change', () => {
            const file = els.importListFile.files?.[0];
            handleImportListFile(file);
            els.importListFile.value = '';
        });
    }
    if (els.btnClickEdit) {
        els.btnClickEdit.addEventListener('click', () => {
            toggleClickEdit();
        });
    }

    const prefs = readFinderLayoutPrefs();
    applyFinderLayoutPrefs(prefs);
    syncFinderLayoutControls(prefs);
    applySavedTheme();
    applySavedPwaTopGap();
    applySavedPwaBottomOffset();
    applySavedPreviewFontScale();
    applySavedListStripe();
    applySavedListLayout();
    applySavedDefaultEditView();
    applySavedDoubleTapCopy();
    applySavedFinderSort();
    if (els.prefTheme) {
        els.prefTheme.addEventListener('change', () => {
            const theme = THEME_VALUES.has(els.prefTheme.value) ? els.prefTheme.value : THEME_DEFAULT;
            writeTheme(theme);
            applyTheme(theme, { metaColor: THEME_META_COLORS[theme] || THEME_META_COLORS.blue });
            setStatus('Theme saved', 'ok');
        });
    }
    if (els.prefPwaTopGap) {
        const onGapInput = () => {
            const n = writePwaTopGap(els.prefPwaTopGap.value);
            applyPwaTopGap(n);
        };
        els.prefPwaTopGap.addEventListener('input', onGapInput);
        els.prefPwaTopGap.addEventListener('change', () => {
            const n = writePwaTopGap(els.prefPwaTopGap.value);
            applyPwaTopGap(n);
            setStatus(`Status bar spacing set to ${n}px`, 'ok');
        });
    }
    if (els.prefPwaBottomOffset) {
        const onBottomInput = () => {
            const n = writePwaBottomOffset(els.prefPwaBottomOffset.value);
            applyPwaBottomOffset(n);
        };
        els.prefPwaBottomOffset.addEventListener('input', onBottomInput);
        els.prefPwaBottomOffset.addEventListener('change', () => {
            const n = writePwaBottomOffset(els.prefPwaBottomOffset.value);
            applyPwaBottomOffset(n);
            setStatus(`Bottom edge set to ${n}px`, 'ok');
        });
    }
    if (els.prefPreviewFontScale) {
        const onScaleInput = () => {
            const n = writePreviewFontScale(els.prefPreviewFontScale.value);
            applyPreviewFontScale(n);
        };
        els.prefPreviewFontScale.addEventListener('input', onScaleInput);
        els.prefPreviewFontScale.addEventListener('change', () => {
            const n = writePreviewFontScale(els.prefPreviewFontScale.value);
            applyPreviewFontScale(n);
            setStatus(`Preview text size set to ${n}%`, 'ok');
        });
    }
    if (els.prefListStripe) {
        els.prefListStripe.addEventListener('change', () => {
            const mode = writeListStripe(els.prefListStripe.value);
            applyListStripe(mode);
            const label =
                mode === 'zebra'
                    ? 'Alternating grey list stripes'
                    : mode === 'spectrum'
                      ? '16-colour list stripes'
                      : 'Normal list styling';
            setStatus(`${label} saved`, 'ok');
        });
    }
    if (els.prefListLayoutSegmented) {
        els.prefListLayoutSegmented.addEventListener('change', () => {
            const layout = writeListLayout(
                els.prefListLayoutSegmented.checked ? 'segmented' : 'continuous'
            );
            applyListLayout(layout);
            if (
                hasOpenFile() &&
                (state.viewMode === 'list' ||
                    state.viewMode === 'preview' ||
                    state.viewMode === 'contents')
            ) {
                renderStructuredEditor();
            }
            setStatus(
                layout === 'segmented'
                    ? 'Segmented list containers on'
                    : 'Continuous list with text colour stripes',
                'ok'
            );
        });
    }
    if (els.prefDefaultEditView) {
        els.prefDefaultEditView.addEventListener('change', () => {
            const mode = writeDefaultEditView(els.prefDefaultEditView.value);
            syncDefaultEditViewControl(mode);
            const label =
                DEFAULT_EDIT_VIEW_OPTIONS.find((o) => o.value === mode)?.label || mode;
            setStatus(`Default edit view: ${label}`, 'ok');
        });
    }
    if (els.prefDoubleTapCopy) {
        els.prefDoubleTapCopy.addEventListener('change', () => {
            const enabled = writeDoubleTapCopyEnabled(els.prefDoubleTapCopy.checked);
            syncDoubleTapCopyControl(enabled);
            setStatus(
                enabled ? 'Double-tap copy on' : 'Double-tap copy off',
                'ok'
            );
        });
    }
    if (els.prefMdOrderMobile) {
        els.prefMdOrderMobile.addEventListener('change', () => {
            const next = {
                ...readFinderLayoutPrefs(),
                mobile: els.prefMdOrderMobile.value === 'top' ? 'top' : 'bottom',
            };
            writeFinderLayoutPrefs(next);
            applyFinderLayoutPrefs(next);
            scrollFinderToMarkdownSection();
            setStatus('Mobile Finder layout saved', 'ok');
        });
    }
    if (els.prefMdOrderDesktop) {
        els.prefMdOrderDesktop.addEventListener('change', () => {
            const next = {
                ...readFinderLayoutPrefs(),
                desktop: els.prefMdOrderDesktop.value === 'top' ? 'top' : 'bottom',
            };
            writeFinderLayoutPrefs(next);
            applyFinderLayoutPrefs(next);
            scrollFinderToMarkdownSection();
            setStatus('Desktop Finder layout saved', 'ok');
        });
    }

    els.searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        state.browseMode = 'search';
        state.searchQuery = els.searchInput.value || '';
        loadSearch(true);
    });
    if (els.folderFilterForm) {
        els.folderFilterForm.addEventListener('submit', (event) => {
            event.preventDefault();
            els.folderFilterInput?.blur();
        });
    }
    if (els.folderFilterInput) {
        els.folderFilterInput.addEventListener('input', () => {
            if (state.browseMode === 'search') return;
            state.folderFilter = els.folderFilterInput.value || '';
            renderCurrentFileList();
        });
    }
    els.nameForm.addEventListener('submit', (event) => {
        // Let method="dialog" close; block empty confirm
        const submitter = event.submitter;
        if (submitter && submitter.value === 'confirm' && !els.nameInput.value.trim()) {
            event.preventDefault();
            els.nameInput.focus();
        }
    });

    els.editor.addEventListener('beforeinput', () => {
        if (!state.editor.fileId) return;
        noteUserEditBoundary(els.editor.value);
    });

    els.editor.addEventListener('input', () => {
        // Fallback when beforeinput did not fire (some mobile keyboards).
        editHistory.beforeEditFromMirror(els.editor.value, {
            selectionStart: Number(els.editor.selectionStart) || 0,
            selectionEnd: Number(els.editor.selectionEnd) || 0,
        });
        setEditorText(state.editor, els.editor.value);
        editHistory.touch(els.editor.value);
        syncEditorChrome(state.editor);
    });

    if (els.btnUndo) {
        els.btnUndo.addEventListener('click', () => {
            performEditorUndo();
        });
    }
    if (els.btnRedo) {
        els.btnRedo.addEventListener('click', () => {
            performEditorRedo();
        });
    }

    const modeButtons = [els.modeList, els.modePreview, els.modeContents, els.modeRaw];
    for (const btn of modeButtons) {
        if (!btn) continue;
        btn.addEventListener('click', () => {
            if (!hasOpenFile()) return;
            const next = btn.dataset.viewMode;
            applyViewMode(next, {
                persist: true,
                reparseFromTextarea: state.viewMode === 'raw',
            });
        });
    }

    window.addEventListener('keydown', (event) => {
        const key = event.key?.toLowerCase();
        if ((event.metaKey || event.ctrlKey) && key === 's') {
            event.preventDefault();
            if (hasOpenFile()) saveCurrentFile();
            return;
        }
        if ((event.metaKey || event.ctrlKey) && key === 'z') {
            // Own the undo stack so autosave cannot strand the user without recovery.
            const target = event.target;
            const inAppEditor = hasOpenFile() && els.viewEditor && !els.viewEditor.hidden;
            if (!inAppEditor) return;
            // Let native undo work inside list mini-inputs; document undo for Raw / chrome.
            if (
                target instanceof HTMLElement &&
                els.listsRoot?.contains(target) &&
                (target.tagName === 'TEXTAREA' ||
                    target.tagName === 'INPUT' ||
                    target.isContentEditable)
            ) {
                return;
            }
            event.preventDefault();
            if (event.shiftKey) performEditorRedo();
            else performEditorUndo();
            return;
        }
        if ((event.metaKey || event.ctrlKey) && key === 'y') {
            const inAppEditor = hasOpenFile() && els.viewEditor && !els.viewEditor.hidden;
            if (!inAppEditor) return;
            const target = event.target;
            if (
                target instanceof HTMLElement &&
                els.listsRoot?.contains(target) &&
                (target.tagName === 'TEXTAREA' ||
                    target.tagName === 'INPUT' ||
                    target.isContentEditable)
            ) {
                return;
            }
            event.preventDefault();
            performEditorRedo();
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (state.editor.dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && state.editor.fileId) {
            // Persist buffer/draft; don't invent dirty from format-only serialize.
            flushCurrentEditorContent();
        }
    });

    window.addEventListener('resize', () => {
        syncNavLayout();
    });

    window.addEventListener('md-editor:settings-changed', () => {
        queueSettingsCloudSync();
    });
}

async function boot() {
    bindUi();
    wireEvents();
    applySavedFinderLayout();
    applySavedTheme();
    applySavedListStripe();
    applySavedListLayout();
    applySavedDefaultEditView();
    applySavedDoubleTapCopy();
    applySavedFinderSort();
    registerServiceWorker();

    if (!isConfigured()) {
        showView('login');
        setConfigError(
            'Client ID not configured. Add PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID to .env.local, then run npm run build && npm run preview (or set the var on Vercel). See README.md.'
        );
        setStatus('Configuration needed', 'warn');
        return;
    }

    if (isSignedIn()) {
        await afterSignedIn();
        return;
    }

    showView('login');
    setStatus('Restoring session…');
    const restored = await tryRestoreSession();
    if (restored) {
        await afterSignedIn();
        return;
    }

    setStatus('');
}

boot();
