import { isFolder, isMarkdownCandidate, sortDriveEntries } from './drive.js';
import {
    ROOT_FOLDER_ID,
    ROOT_FOLDER_NAME,
    COMPUTERS_FOLDER_ID,
    COMPUTERS_FOLDER_NAME,
    FINDER_SORT_DEFAULT,
    FINDER_SORT_OPTIONS,
    FINDER_SORT_VALUES,
    OPENED_FILES_DAY_MS,
    OPENED_FILES_WEEK_MS,
} from './config.js';
import {
    buildDateTag,
    buildDateTagFromIsoDate,
    dateTagToIsoDate,
    resolveDateTagInput,
} from './dates.js';

const els = {};

export function bindUi() {
    els.app = document.getElementById('app');
    els.status = document.getElementById('status');
    els.viewTitle = document.getElementById('view-title');
    els.editorFileTitle = document.getElementById('editor-file-title');
    els.navBar = document.getElementById('nav-bar');
    els.navActions = document.getElementById('nav-actions');
    els.navActionsFinder = document.getElementById('nav-actions-finder');
    els.navActionsEditor = document.getElementById('nav-actions-editor');
    els.tabPinned = document.getElementById('tab-pinned');
    els.tabFinder = document.getElementById('tab-finder');
    els.tabEditor = document.getElementById('tab-editor');
    els.tabSettings = document.getElementById('tab-settings');
    els.btnUp = document.getElementById('btn-up');
    els.finderPathBar = document.getElementById('finder-path-bar');
    els.folderPath = document.getElementById('folder-path');
    els.btnSignIn = document.getElementById('btn-sign-in');
    els.btnSignOut = document.getElementById('btn-sign-out');
    els.btnSave = document.getElementById('btn-save');
    els.btnUndo = document.getElementById('btn-undo');
    els.btnRedo = document.getElementById('btn-redo');
    els.btnLoadMore = document.getElementById('btn-load-more');
    els.btnModeFolders = document.getElementById('btn-mode-folders');
    els.btnModeComputers = document.getElementById('btn-mode-computers');
    els.btnModeSearch = document.getElementById('btn-mode-search');
    els.btnNewNote = document.getElementById('btn-new-note');
    els.btnNewFolder = document.getElementById('btn-new-folder');
    els.btnFinderSort = document.getElementById('btn-finder-sort');
    els.btnFinderSortLabel = els.btnFinderSort?.querySelector('.btn-finder-sort-label') || null;
    els.finderSortDialog = document.getElementById('finder-sort-dialog');
    els.finderSortOptions = document.getElementById('finder-sort-options');
    els.btnEditorMore = document.getElementById('btn-editor-more');
    els.btnInsertList = document.getElementById('btn-insert-list');
    els.importListFile = document.getElementById('import-list-file');
    els.editorMoreDialog = document.getElementById('editor-more-dialog');
    els.editorMoreName = document.getElementById('editor-more-name');
    els.editorMoreStats = document.getElementById('editor-more-stats');
    els.editorMorePin = document.getElementById('editor-more-pin');
    els.editorMoreImport = document.getElementById('editor-more-import');
    els.editorMoreInsertDate = document.getElementById('editor-more-insert-date');
    els.editorMoreFillDates = document.getElementById('editor-more-fill-dates');
    els.editorMoreShowDates = document.getElementById('editor-more-show-dates');
    els.editorMoreAutosaveOff = document.getElementById('editor-more-autosave-off');
    els.editorMoreHistory = document.getElementById('editor-more-history');
    els.editorMoreNameVersion = document.getElementById('editor-more-name-version');
    els.editorMoreRename = document.getElementById('editor-more-rename');
    els.historyDialog = document.getElementById('history-dialog');
    els.historyStatus = document.getElementById('history-status');
    els.historyList = document.getElementById('history-list');
    els.historyClose = document.getElementById('history-close');
    els.historyPreviewDialog = document.getElementById('history-preview-dialog');
    els.historyPreviewTitle = document.getElementById('history-preview-title');
    els.historyPreviewMeta = document.getElementById('history-preview-meta');
    els.historyPreviewStatus = document.getElementById('history-preview-status');
    els.historyPreviewText = document.getElementById('history-preview-text');
    els.historyPreviewCopy = document.getElementById('history-preview-copy');
    els.historyPreviewRestore = document.getElementById('history-preview-restore');
    els.historyPreviewClose = document.getElementById('history-preview-close');
    els.historyRestoreDialog = document.getElementById('history-restore-dialog');
    els.historyRestoreMeta = document.getElementById('history-restore-meta');
    els.conflictDialog = document.getElementById('conflict-dialog');
    els.conflictReviewDialog = document.getElementById('conflict-review-dialog');
    els.conflictReviewLocal = document.getElementById('conflict-review-local');
    els.conflictReviewDrive = document.getElementById('conflict-review-drive');
    els.conflictReviewKeepMine = document.getElementById('conflict-review-keep-mine');
    els.conflictReviewUseDrive = document.getElementById('conflict-review-use-drive');
    els.conflictReviewClose = document.getElementById('conflict-review-close');
    els.nameVersionDialog = document.getElementById('name-version-dialog');
    els.nameVersionForm = document.getElementById('name-version-form');
    els.nameVersionInput = document.getElementById('name-version-input');
    els.fillDatesDialog = document.getElementById('fill-dates-dialog');
    els.fillDatesSummary = document.getElementById('fill-dates-summary');
    els.fillDatesSourceCreated = document.getElementById('fill-dates-source-created');
    els.fillDatesSourceCustom = document.getElementById('fill-dates-source-custom');
    els.fillDatesCreatedLabel = document.getElementById('fill-dates-created-label');
    els.fillDatesCustom = document.getElementById('fill-dates-custom');
    els.fillDatesPreview = document.getElementById('fill-dates-preview');
    els.fillDatesError = document.getElementById('fill-dates-error');
    els.fillDatesCancel = document.getElementById('fill-dates-cancel');
    els.fillDatesApply = document.getElementById('fill-dates-apply');
    els.btnClickEdit = document.getElementById('btn-click-edit');
    els.btnGoFinder = document.getElementById('btn-go-finder');
    els.createActions = document.getElementById('create-actions');
    els.folderFilterForm = document.getElementById('folder-filter-form');
    els.folderFilterInput = document.getElementById('folder-filter-input');
    els.searchForm = document.getElementById('search-form');
    els.searchInput = document.getElementById('search-input');
    els.configError = document.getElementById('config-error');
    els.viewLogin = document.getElementById('view-login');
    els.viewPinned = document.getElementById('view-pinned');
    els.viewFinder = document.getElementById('view-finder');
    els.viewEditor = document.getElementById('view-editor');
    els.viewSettings = document.getElementById('view-settings');
    els.pinnedList = document.getElementById('pinned-list');
    els.pinnedEmpty = document.getElementById('pinned-empty');
    els.editorEmpty = document.getElementById('editor-empty');
    els.editorLoading = document.getElementById('editor-loading');
    els.loadingFileName = document.getElementById('loading-file-name');
    els.editorActive = document.getElementById('editor-active');
    els.btnEditorSearch = document.getElementById('btn-editor-search');
    els.editorSearchBar = document.getElementById('editor-search-bar');
    els.editorSearchInput = document.getElementById('editor-search-input');
    els.editorSearchCount = document.getElementById('editor-search-count');
    els.editorSearchCase = document.getElementById('editor-search-case');
    els.editorSearchWord = document.getElementById('editor-search-word');
    els.editorSearchPrev = document.getElementById('editor-search-prev');
    els.editorSearchNext = document.getElementById('editor-search-next');
    els.editorSearchClose = document.getElementById('editor-search-close');
    els.prefMdOrderMobile = document.getElementById('pref-md-order-mobile');
    els.prefMdOrderDesktop = document.getElementById('pref-md-order-desktop');
    els.prefTheme = document.getElementById('pref-theme');
    els.prefTocSticky = document.getElementById('pref-toc-sticky');
    els.prefPwaTopGap = document.getElementById('pref-pwa-top-gap');
    els.prefPwaTopGapValue = document.getElementById('pref-pwa-top-gap-value');
    els.prefPwaBottomOffset = document.getElementById('pref-pwa-bottom-offset');
    els.prefPwaBottomOffsetValue = document.getElementById('pref-pwa-bottom-offset-value');
    els.prefPreviewFontScale = document.getElementById('pref-preview-font-scale');
    els.prefPreviewFontScaleValue = document.getElementById('pref-preview-font-scale-value');
    els.prefListStripe = document.getElementById('pref-list-stripe');
    els.prefListLayoutSegmented = document.getElementById('pref-list-layout-segmented');
    els.prefDefaultEditView = document.getElementById('pref-default-edit-view');
    els.prefDoubleTapCopy = document.getElementById('pref-double-tap-copy');
    els.fileList = document.getElementById('file-list');
    els.browseEmpty = document.getElementById('browse-empty');
    els.finderLoading = document.getElementById('finder-loading');
    els.finderLoadingTitle = document.getElementById('finder-loading-title');
    els.editor = document.getElementById('editor');
    els.viewModeBar = document.getElementById('view-mode-bar');
    els.modeList = document.getElementById('mode-list');
    els.modePreview = document.getElementById('mode-preview');
    els.modeContents = document.getElementById('mode-contents');
    els.modeRaw = document.getElementById('mode-raw');
    els.appToast = document.getElementById('app-toast');
    els.autosaveBar = document.getElementById('autosave-bar');
    els.autosaveBarFill = document.getElementById('autosave-bar-fill');
    els.listsRoot = document.getElementById('lists-root');
    els.listsStatus = document.getElementById('lists-status');
    els.markdownPreview = document.getElementById('markdown-preview');
    els.draftDialog = document.getElementById('draft-dialog');
    els.unsavedDialog = document.getElementById('unsaved-dialog');
    els.itemActionsDialog = document.getElementById('item-actions-dialog');
    els.itemActionsTitle = document.getElementById('item-actions-title');
    els.itemActionsName = document.getElementById('item-actions-name');
    els.itemActionPin = document.getElementById('item-action-pin');
    els.itemActionCopy = document.getElementById('item-action-copy');
    els.itemActionDownload = document.getElementById('item-action-download');
    els.pinnedMissingDialog = document.getElementById('pinned-missing-dialog');
    els.pinnedMissingTitle = document.getElementById('pinned-missing-title');
    els.pinnedMissingMessage = document.getElementById('pinned-missing-message');
    els.pinnedMissingName = document.getElementById('pinned-missing-name');
    els.moveDialog = document.getElementById('move-dialog');
    els.moveDialogTitle = document.getElementById('move-dialog-title');
    els.moveDialogHint = document.getElementById('move-dialog-hint');
    els.moveModeDrive = document.getElementById('move-mode-drive');
    els.moveModeComputers = document.getElementById('move-mode-computers');
    els.moveBtnUp = document.getElementById('move-btn-up');
    els.moveFolderPath = document.getElementById('move-folder-path');
    els.moveFolderList = document.getElementById('move-folder-list');
    els.moveEmpty = document.getElementById('move-empty');
    els.moveBtnCancel = document.getElementById('move-btn-cancel');
    els.moveBtnHere = document.getElementById('move-btn-here');
    els.nameDialog = document.getElementById('name-dialog');
    els.nameForm = document.getElementById('name-form');
    els.nameDialogTitle = document.getElementById('name-dialog-title');
    els.nameDialogHint = document.getElementById('name-dialog-hint');
    els.nameDialogWarning = document.getElementById('name-dialog-warning');
    els.nameInput = document.getElementById('name-input');
    els.nameDialogConfirm = document.getElementById('name-dialog-confirm');
    els.deleteListDialog = document.getElementById('delete-list-dialog');
    els.deleteListDialogName = document.getElementById('delete-list-dialog-name');
    els.deleteListItemDialog = document.getElementById('delete-list-item-dialog');
    els.deleteListItemDialogName = document.getElementById('delete-list-item-dialog-name');
    els.editItemDateDialog = document.getElementById('edit-item-date-dialog');
    els.editItemDateForm = document.getElementById('edit-item-date-form');
    els.editItemDateInput = document.getElementById('edit-item-date-input');
    els.editItemDateError = document.getElementById('edit-item-date-error');
    els.editItemDateApply = document.getElementById('edit-item-date-apply');
    return els;
}

export function getEls() {
    return els;
}

export function setStatus(message, kind = '') {
    els.status.textContent = message || '';
    els.status.classList.remove('is-error', 'is-ok', 'is-warn');
    if (kind === 'error') els.status.classList.add('is-error');
    if (kind === 'ok') els.status.classList.add('is-ok');
    if (kind === 'warn') els.status.classList.add('is-warn');
}

/** @type {ReturnType<typeof setTimeout> | null} */
let toastTimer = null;
/** @type {string} */
let toastKey = '';
/** Guards against stale rAF show animations after hide/replace. */
let toastShowToken = 0;
/** Last save-state toast key announced (avoids re-showing after auto-hide). */
let editorSaveToastKey = '';

/**
 * Resolve the single overlay toast host (always out of document flow).
 * @returns {HTMLElement | null}
 */
function resolveToastEl() {
    if (els.appToast?.isConnected) return els.appToast;
    const el = document.getElementById('app-toast');
    if (el) els.appToast = el;
    return el;
}

/**
 * App-wide overlay toast. Never shifts layout; works in Finder, Edit, and Settings.
 * @param {string} message
 * @param {'' | 'ok' | 'warn' | 'error'} [kind]
 * @param {{ sticky?: boolean, key?: string, durationMs?: number }} [options]
 */
export function showToast(message, kind = '', options = {}) {
    const el = resolveToastEl();
    if (!el) return;

    const key = options.key ?? message;
    const sticky = Boolean(options.sticky);
    const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : 2200;
    const text = String(message || '');

    if (!text) {
        hideToast();
        return;
    }

    // Same sticky/key already showing — just refresh the auto-hide timer.
    if (key && key === toastKey && el.classList.contains('is-visible') && !el.hidden) {
        if (sticky) return;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => hideToast(), durationMs);
        return;
    }

    toastKey = key;
    const token = ++toastShowToken;
    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }

    el.textContent = text;
    el.classList.remove('is-ok', 'is-warn', 'is-error', 'is-visible');
    if (kind === 'ok') el.classList.add('is-ok');
    if (kind === 'warn') el.classList.add('is-warn');
    if (kind === 'error') el.classList.add('is-error');

    el.hidden = false;
    // Restart enter transition even when replacing an already-visible toast.
    void el.offsetWidth;
    requestAnimationFrame(() => {
        if (token !== toastShowToken) return;
        if (el.hidden) return;
        el.classList.add('is-visible');
    });

    if (!sticky) {
        toastTimer = setTimeout(() => {
            if (token !== toastShowToken) return;
            hideToast();
        }, durationMs);
    }
}

export function hideToast() {
    toastShowToken += 1;
    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }
    toastKey = '';
    const el = resolveToastEl();
    if (!el) return;
    el.classList.remove('is-visible', 'is-ok', 'is-warn', 'is-error');
    el.hidden = true;
    el.textContent = '';
}

/** @deprecated Prefer {@link showToast}; kept as an alias for existing call sites. */
export function showEditorToast(message, kind = '', options = {}) {
    showToast(message, kind, options);
}

/** @deprecated Prefer {@link showToast}; kept as an alias for existing call sites. */
export function showAppToast(message, kind = '', options = {}) {
    showToast(message, kind, options);
}

export function hideEditorToast() {
    hideToast();
}

export function hideAppToast() {
    hideToast();
}

/**
 * Announce editor save/dirty state once per transition.
 * @param {string} key
 * @param {string} message
 * @param {'' | 'ok' | 'warn' | 'error'} [kind]
 * @param {{ sticky?: boolean, durationMs?: number }} [options]
 */
function announceEditorSaveToast(key, message, kind = '', options = {}) {
    setStatus('');
    if (key === editorSaveToastKey) {
        if (options.sticky && toastKey === key) return;
        if (!options.sticky) return;
    }
    editorSaveToastKey = key;
    showToast(message, kind, { ...options, key });
}

function resetEditorSaveToast() {
    editorSaveToastKey = '';
    hideToast();
}

function setActiveTab(mode) {
    const tabs = [
        [els.tabPinned, 'pinned'],
        [els.tabFinder, 'finder'],
        [els.tabEditor, 'editor'],
        [els.tabSettings, 'settings'],
    ];
    for (const [tab, name] of tabs) {
        if (!tab) continue;
        const active = name === mode;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
}

/** Keep content clear of the fixed bottom nav (tabs + optional action section). */
export function syncNavLayout() {
    if (!els.app) return;
    if (!els.navBar || els.navBar.hidden) {
        els.app.style.removeProperty('--nav-offset');
        els.app.style.setProperty('--path-dock-offset', '0px');
        els.app.classList.remove('nav-has-actions', 'has-path-dock');
        return;
    }
    const hasActions = Boolean(els.navActions && !els.navActions.hidden);
    els.app.classList.toggle('nav-has-actions', hasActions);
    // Measure after paint so hidden→shown height is accurate.
    requestAnimationFrame(() => {
        const desktop = window.matchMedia('(min-width: 768px)').matches;
        // Wide layout keeps nav/path chrome in normal flow at the top.
        if (desktop) {
            els.app.style.setProperty('--nav-offset', '0px');
            els.app.style.setProperty('--path-dock-offset', '0px');
            els.app.classList.remove('has-path-dock');
            return;
        }

        const height = els.navBar.getBoundingClientRect().height;
        els.app.style.setProperty('--nav-offset', `${Math.ceil(height)}px`);

        const pathVisible = Boolean(els.finderPathBar && !els.finderPathBar.hidden);
        if (pathVisible) {
            const pathHeight = Math.ceil(els.finderPathBar.getBoundingClientRect().height) + 12;
            els.app.style.setProperty('--path-dock-offset', `${Math.max(pathHeight, 52)}px`);
            els.app.classList.add('has-path-dock');
        } else {
            els.app.style.setProperty('--path-dock-offset', '0px');
            els.app.classList.remove('has-path-dock');
        }
    });
}

/**
 * Show the contextual action strip above mode tabs when the current view has buttons.
 * @param {'login' | 'pinned' | 'finder' | 'editor' | 'settings'} mode
 * @param {{ hasOpenFile?: boolean }} [options]
 */
function syncNavActions(mode, options = {}) {
    const hasOpenFile = Boolean(options.hasOpenFile);
    const showFinder = mode === 'finder';
    const showPinned = mode === 'pinned';
    const showFinderChrome = showFinder || showPinned;
    const showEditor = mode === 'editor' && hasOpenFile;

    if (els.navActionsFinder) {
        els.navActionsFinder.hidden = !showFinderChrome;
        els.navActionsFinder.classList.toggle('is-pinned-only', showPinned);
    }
    if (els.navActionsEditor) els.navActionsEditor.hidden = !showEditor;

    if (els.navActions) {
        els.navActions.hidden = !(showFinderChrome || showEditor);
    }

    syncNavLayout();
}

/**
 * @param {'login' | 'pinned' | 'finder' | 'editor' | 'settings'} name
 * @param {{ hasOpenFile?: boolean, loading?: boolean }} [options]
 */
export function showView(name, options = {}) {
    const hasOpenFile = Boolean(options.hasOpenFile);

    els.viewLogin.hidden = name !== 'login';
    if (els.viewPinned) els.viewPinned.hidden = name !== 'pinned';
    els.viewFinder.hidden = name !== 'finder';
    els.viewEditor.hidden = name !== 'editor';
    els.viewSettings.hidden = name !== 'settings';

    if (name === 'login') {
        els.navBar.hidden = true;
        if (els.navActions) els.navActions.hidden = true;
        if (els.navActionsFinder) {
            els.navActionsFinder.hidden = true;
            els.navActionsFinder.classList.remove('is-pinned-only');
        }
        if (els.navActionsEditor) els.navActionsEditor.hidden = true;
        if (els.finderPathBar) els.finderPathBar.hidden = true;
        els.viewTitle.textContent = '';
        setStatus('');
        if (els.app) {
            els.app.classList.add('is-login');
            els.app.classList.remove('is-editing-doc');
        }
        syncNavLayout();
        return;
    }

    if (els.app) els.app.classList.remove('is-login');
    els.navBar.hidden = false;
    setActiveTab(name);
    syncNavActions(name, { hasOpenFile });
    if (els.finderPathBar) els.finderPathBar.hidden = name !== 'finder';
    syncNavLayout();

    if (name !== 'editor' && els.app) {
        els.app.classList.remove('is-editing-doc');
    }

    if (name === 'pinned') {
        els.viewTitle.textContent = 'Pinned';
        els.viewTitle.classList.remove('view-title--doc');
        els.viewTitle.removeAttribute('title');
    } else if (name === 'finder') {
        els.viewTitle.textContent = 'Finder';
        els.viewTitle.classList.remove('view-title--doc');
        els.viewTitle.removeAttribute('title');
    } else if (name === 'settings') {
        els.viewTitle.textContent = 'Settings';
        els.viewTitle.classList.remove('view-title--doc');
        els.viewTitle.removeAttribute('title');
        setStatus('');
    } else if (name === 'editor') {
        const loading = Boolean(options.loading);
        if (els.editorLoading) els.editorLoading.hidden = !loading;
        if (loading) {
            els.editorEmpty.hidden = true;
            els.editorActive.hidden = true;
            els.btnSave.hidden = true;
            if (els.btnUndo) els.btnUndo.hidden = true;
            if (els.btnRedo) els.btnRedo.hidden = true;
            if (els.btnInsertList) els.btnInsertList.hidden = true;
            if (els.btnClickEdit) els.btnClickEdit.hidden = true;
            if (els.btnEditorMore) els.btnEditorMore.hidden = true;
            if (els.btnEditorSearch) els.btnEditorSearch.hidden = true;
            if (els.editorSearchBar) els.editorSearchBar.hidden = true;
            els.viewTitle.textContent = 'Opening…';
            if (els.app) els.app.classList.remove('is-editing-doc');
        } else {
            els.editorEmpty.hidden = hasOpenFile;
            els.editorActive.hidden = !hasOpenFile;
            els.btnSave.hidden = !hasOpenFile;
            if (els.btnUndo) els.btnUndo.hidden = !hasOpenFile;
            if (els.btnRedo) els.btnRedo.hidden = !hasOpenFile;
            if (!hasOpenFile) {
                els.viewTitle.textContent = 'Edit';
                if (els.app) els.app.classList.remove('is-editing-doc');
                setStatus('Open a file from Pinned or Finder');
            }
        }
    }
}

/**
 * Show / hide the file-open loading panel (spinner + progress bar).
 * @param {boolean} loading
 * @param {string} [fileName]
 */
export function setEditorLoading(loading, fileName = '') {
    if (!els.editorLoading) return;
    els.editorLoading.hidden = !loading;
    if (els.loadingFileName) {
        const label = displayNoteTitle(fileName);
        els.loadingFileName.textContent = fileName ? label : '';
        els.loadingFileName.hidden = !fileName;
        if (fileName) els.loadingFileName.title = fileName;
        else els.loadingFileName.removeAttribute('title');
    }
    if (loading) {
        els.editorEmpty.hidden = true;
        els.editorActive.hidden = true;
        els.viewTitle.textContent = 'Opening…';
        els.viewTitle.classList.remove('view-title--doc');
        els.viewTitle.removeAttribute('title');
        if (els.btnSave) els.btnSave.hidden = true;
        if (els.btnUndo) els.btnUndo.hidden = true;
        if (els.btnRedo) els.btnRedo.hidden = true;
        if (els.btnInsertList) els.btnInsertList.hidden = true;
        if (els.btnClickEdit) els.btnClickEdit.hidden = true;
        if (els.btnEditorMore) els.btnEditorMore.hidden = true;
        if (els.btnEditorSearch) els.btnEditorSearch.hidden = true;
        if (els.editorSearchBar) els.editorSearchBar.hidden = true;
    }
}

export function setConfigError(message) {
    if (!message) {
        els.configError.hidden = true;
        els.configError.textContent = '';
        return;
    }
    els.configError.hidden = false;
    els.configError.textContent = message;
}

export function renderFolderPath(stack, mode = 'folder', searchQuery = '', onCrumb = null) {
    if (!els.folderPath) return;
    els.folderPath.replaceChildren();
    els.folderPath.classList.toggle(
        'folder-path--crumbs',
        typeof onCrumb === 'function' && mode !== 'search'
    );
    els.folderPath.classList.toggle('folder-path--plain', mode === 'search' || typeof onCrumb !== 'function');

    if (mode === 'search') {
        els.folderPath.textContent = searchQuery.trim()
            ? `Search results for “${searchQuery.trim()}”`
            : 'All markdown files in this Google account';
        return;
    }
    if (mode === 'computers' && (!stack.length || (stack.length === 1 && stack[0].id === COMPUTERS_FOLDER_ID))) {
        els.folderPath.textContent = 'Computers (best-effort API list)';
        return;
    }
    if (!stack.length) {
        els.folderPath.textContent = 'My Drive';
        return;
    }

    if (typeof onCrumb !== 'function') {
        els.folderPath.textContent = stack.map((f) => f.name).join(' / ');
        return;
    }

    stack.forEach((frame, index) => {
        if (index > 0) {
            const sep = document.createElement('span');
            sep.className = 'folder-path-sep';
            sep.textContent = '/';
            sep.setAttribute('aria-hidden', 'true');
            els.folderPath.appendChild(sep);
        }
        const isLast = index === stack.length - 1;
        if (isLast) {
            const current = document.createElement('span');
            current.className = 'folder-path-current';
            current.textContent = frame.name || 'Folder';
            els.folderPath.appendChild(current);
            return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'folder-path-crumb';
        btn.textContent = frame.name || 'Folder';
        btn.addEventListener('click', () => onCrumb(index));
        els.folderPath.appendChild(btn);
    });
}

export function setBrowseModeUi(mode) {
    const isSearch = mode === 'search';
    const isComputers = mode === 'computers';
    els.btnModeFolders.classList.toggle('is-active', mode === 'folder');
    els.btnModeComputers.classList.toggle('is-active', isComputers);
    els.searchForm.hidden = !isSearch;
    if (els.folderFilterForm) els.folderFilterForm.hidden = isSearch;
    // My Drive / Computers toggles stay visible; search is entered from Settings.
    els.btnModeFolders.hidden = false;
    els.btnModeComputers.hidden = false;
    if (isSearch) {
        els.btnModeFolders.classList.remove('is-active');
        els.btnModeComputers.classList.remove('is-active');
    }
}

/** Show + Note / + Folder when browsing a real Drive folder. */
export function setCreateActionsVisible(visible) {
    els.createActions.hidden = !visible;
    syncNavLayout();
}

export function setBrowseEmptyMessage(message) {
    els.browseEmpty.textContent = message;
}

/**
 * Show/hide the Finder loading panel (animated bar). Hides the file list while busy.
 * @param {boolean} visible
 * @param {string} [message]
 */
export function setFinderLoading(visible, message = 'Loading…') {
    const show = Boolean(visible);
    if (els.finderLoadingTitle && message) {
        els.finderLoadingTitle.textContent = message;
    }
    if (els.finderLoading) {
        els.finderLoading.hidden = !show;
        els.finderLoading.setAttribute('aria-busy', show ? 'true' : 'false');
        const bar = els.finderLoading.querySelector('.loading-bar');
        if (bar) {
            bar.setAttribute('aria-label', message || 'Loading');
            bar.setAttribute('aria-valuetext', message || 'Loading');
        }
    }
    if (els.fileList) els.fileList.classList.toggle('is-loading-hidden', show);
    if (els.btnLoadMore) els.btnLoadMore.classList.toggle('is-loading-hidden', show);
    if (els.browseEmpty) {
        els.browseEmpty.classList.toggle('is-loading-hidden', show);
        if (show) els.browseEmpty.hidden = true;
    }
    if (show && els.fileList) els.fileList.replaceChildren();
}

export function renderFileList(
    files,
    {
        onOpen,
        onMenu,
        recent = [],
        scrollToMarkdown = false,
        sortMode = FINDER_SORT_DEFAULT,
        openedAtById = null,
    } = {}
) {
    els.fileList.replaceChildren();
    const mode = FINDER_SORT_VALUES.has(sortMode) ? sortMode : FINDER_SORT_DEFAULT;
    const sorted = sortDriveEntries(files || [], mode);
    const recentFiles = Array.isArray(recent) ? recent.slice(0, 5) : [];
    els.browseEmpty.hidden = sorted.length > 0 || recentFiles.length > 0;
    const openedMap =
        openedAtById instanceof Map
            ? openedAtById
            : openedAtById && typeof openedAtById === 'object'
              ? new Map(Object.entries(openedAtById).map(([id, ts]) => [id, Number(ts) || 0]))
              : new Map();

    if (recentFiles.length) {
        els.fileList.appendChild(
            buildFileGroup({
                kind: 'recent',
                title: 'Recent',
                files: recentFiles,
                onOpen,
                onMenu,
                openedAtById: openedMap,
            })
        );
    }

    const folders = sorted.filter((f) => isFolder(f));
    const notes = sorted.filter((f) => !isFolder(f));

    if (folders.length) {
        els.fileList.appendChild(
            buildFileGroup({
                kind: 'folders',
                title: 'Folders',
                files: folders,
                onOpen,
                onMenu,
                openedAtById: openedMap,
            })
        );
    }

    if (notes.length) {
        els.fileList.appendChild(
            buildFileGroup({
                kind: 'markdown',
                title: 'Markdown',
                files: notes,
                onOpen,
                onMenu,
                openedAtById: openedMap,
            })
        );
    }

    applyFinderLayoutPrefs();
    if (scrollToMarkdown && notes.length) {
        scrollFinderToMarkdownSection();
    }
}

/**
 * Render the Pinned tab list (folders + markdown shortcuts).
 * @param {Array<object>} items
 * @param {{ onOpen: Function, onMenu: Function }} handlers
 */
export function renderPinnedList(items, { onOpen, onMenu }) {
    if (!els.pinnedList) return;
    els.pinnedList.replaceChildren();
    const list = Array.isArray(items) ? items : [];
    if (els.pinnedEmpty) els.pinnedEmpty.hidden = list.length > 0;

    if (!list.length) return;

    const folders = list.filter((f) => isFolder(f));
    const notes = list.filter((f) => !isFolder(f));

    if (folders.length) {
        els.pinnedList.appendChild(
            buildFileGroup({
                kind: 'pinned-folders',
                title: 'Folders',
                files: folders,
                onOpen,
                onMenu,
            })
        );
    }
    if (notes.length) {
        els.pinnedList.appendChild(
            buildFileGroup({
                kind: 'pinned-markdown',
                title: 'Markdown',
                files: notes,
                onOpen,
                onMenu,
            })
        );
    }
}

/** Scroll the Finder list so the Markdown section is in view (works with flex order prefs). */
export function scrollFinderToMarkdownSection() {
    const list = els.fileList;
    if (!list) return;
    const markdown = list.querySelector('.file-group--markdown');
    if (!markdown) return;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const listRect = list.getBoundingClientRect();
            const mdRect = markdown.getBoundingClientRect();
            const nextTop = mdRect.top - listRect.top + list.scrollTop - 8;
            list.scrollTo({
                top: Math.max(0, Math.round(nextTop)),
                behavior: 'smooth',
            });
        });
    });
}

/**
 * Apply saved mobile/desktop markdown section order to the Finder list.
 * @param {{ mobile?: 'top'|'bottom', desktop?: 'top'|'bottom' }} [prefs]
 */
export function applyFinderLayoutPrefs(prefs) {
    if (!els.fileList) return;
    const mobile = prefs?.mobile || els.fileList.dataset.mdMobile || 'bottom';
    const desktop = prefs?.desktop || els.fileList.dataset.mdDesktop || 'top';
    els.fileList.dataset.mdMobile = mobile === 'top' ? 'top' : 'bottom';
    els.fileList.dataset.mdDesktop = desktop === 'top' ? 'top' : 'bottom';
}

export function syncFinderLayoutControls(prefs) {
    if (els.prefMdOrderMobile && prefs?.mobile) {
        els.prefMdOrderMobile.value = prefs.mobile;
    }
    if (els.prefMdOrderDesktop && prefs?.desktop) {
        els.prefMdOrderDesktop.value = prefs.desktop;
    }
}

/**
 * Apply theme to <html data-theme> and optional theme-color meta.
 * @param {'blue'|'oled'|'light'} theme
 * @param {{ metaColor?: string }} [options]
 */
export function applyTheme(theme, options = {}) {
    const next = theme === 'oled' || theme === 'light' || theme === 'blue' ? theme : 'blue';
    document.documentElement.setAttribute('data-theme', next);
    const meta = document.getElementById('meta-theme-color');
    if (meta && options.metaColor) {
        meta.setAttribute('content', options.metaColor);
    }
}

export function syncThemeControl(theme) {
    if (els.prefTheme && theme) {
        els.prefTheme.value = theme;
    }
}

export function syncTocStickyControl(sticky) {
    if (els.prefTocSticky) {
        els.prefTocSticky.checked = Boolean(sticky);
    }
}

/**
 * Apply Home Screen status-bar clearance (total top inset) and sync the control.
 * @param {number} gapPx
 */
export function applyPwaTopGap(gapPx) {
    const n = Math.max(0, Math.min(80, Math.round(Number(gapPx) || 0)));
    document.documentElement.style.setProperty('--pwa-top-gap', `${n}px`);
    if (els.prefPwaTopGap) {
        els.prefPwaTopGap.value = String(n);
        els.prefPwaTopGap.setAttribute('aria-valuenow', String(n));
    }
    if (els.prefPwaTopGapValue) {
        els.prefPwaTopGapValue.textContent = `${n}px`;
    }
}

export function syncPwaTopGapControl(gapPx) {
    applyPwaTopGap(gapPx);
}

/**
 * Set tab bar bottom edge (px from screen bottom; negative pushes further down).
 * @param {number} offsetPx
 */
export function applyPwaBottomOffset(offsetPx) {
    const n = Math.max(-80, Math.min(80, Math.round(Number(offsetPx) || 0)));
    document.documentElement.style.setProperty('--pwa-bottom-offset', `${n}px`);
    if (els.prefPwaBottomOffset) {
        els.prefPwaBottomOffset.value = String(n);
        els.prefPwaBottomOffset.setAttribute('aria-valuenow', String(n));
    }
    if (els.prefPwaBottomOffsetValue) {
        els.prefPwaBottomOffsetValue.textContent = `${n}px`;
    }
    syncNavLayout();
}

export function syncPwaBottomOffsetControl(offsetPx) {
    applyPwaBottomOffset(offsetPx);
}

/**
 * Apply Preview/List body text scale (percent of default) and sync the control.
 * @param {number} percent
 */
export function applyPreviewFontScale(percent) {
    const n = Math.max(75, Math.min(150, Math.round(Number(percent) || 100)));
    document.documentElement.style.setProperty('--preview-font-scale', String(n / 100));
    if (els.prefPreviewFontScale) {
        els.prefPreviewFontScale.value = String(n);
        els.prefPreviewFontScale.setAttribute('aria-valuenow', String(n));
    }
    if (els.prefPreviewFontScaleValue) {
        els.prefPreviewFontScaleValue.textContent = `${n}%`;
    }
}

export function syncPreviewFontScaleControl(percent) {
    applyPreviewFontScale(percent);
}

/**
 * Apply list item stripe mode for custom + normal lists.
 * @param {'normal' | 'zebra' | 'spectrum' | string} mode
 */
export function applyListStripe(mode) {
    const next = mode === 'zebra' || mode === 'spectrum' ? mode : 'normal';
    document.documentElement.setAttribute('data-list-stripe', next);
    if (els.prefListStripe) {
        els.prefListStripe.value = next;
    }
}

export function syncListStripeControl(mode) {
    applyListStripe(mode);
}

/**
 * Apply list layout: segmented containers (uniform or striped) vs continuous flowing list.
 * @param {'segmented' | 'continuous' | string} layout
 */
export function applyListLayout(layout) {
    const next = layout === 'continuous' ? 'continuous' : 'segmented';
    document.documentElement.setAttribute('data-list-layout', next);
    if (els.prefListLayoutSegmented) {
        els.prefListLayoutSegmented.checked = next === 'segmented';
    }
}

export function syncListLayoutControl(layout) {
    applyListLayout(layout);
}

/**
 * @param {string} mode
 */
export function syncDefaultEditViewControl(mode) {
    if (els.prefDefaultEditView && mode) {
        els.prefDefaultEditView.value = mode;
    }
}

/**
 * @param {boolean} enabled
 */
export function syncDoubleTapCopyControl(enabled) {
    if (els.prefDoubleTapCopy) {
        els.prefDoubleTapCopy.checked = Boolean(enabled);
    }
}

/**
 * @param {number} openedAt
 * @returns {'day' | 'week' | null}
 */
function openedRecencyTier(openedAt) {
    const ts = Number(openedAt) || 0;
    if (!ts) return null;
    const age = Date.now() - ts;
    if (age <= OPENED_FILES_DAY_MS) return 'day';
    if (age <= OPENED_FILES_WEEK_MS) return 'week';
    return null;
}

function buildFileGroup({ kind, title, files, onOpen, onMenu, openedAtById = null }) {
    const section = document.createElement('section');
    section.className = `file-group file-group--${kind}`;
    section.setAttribute('aria-label', title);

    const heading = document.createElement('h2');
    heading.className = 'file-group-title';
    heading.textContent = title;
    section.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'file-group-list';
    list.setAttribute('role', 'list');

    const openedMap = openedAtById instanceof Map ? openedAtById : null;

    for (const file of files) {
        const folder = isFolder(file);
        const row = document.createElement('div');
        row.className = folder ? 'file-row file-row--folder' : 'file-row file-row--markdown';
        row.setAttribute('role', 'listitem');

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'file-row-main';
        openBtn.setAttribute(
            'aria-label',
            folder ? `Open folder ${file.name || ''}` : `Open ${file.name || ''}`
        );

        const icon = document.createElement('span');
        icon.className = 'file-row-icon';
        icon.setAttribute('aria-hidden', 'true');

        const img = document.createElement('img');
        img.src = folder
            ? 'Assets/SVGs/open-folder-outline-icon.svg'
            : 'Assets/SVGs/markdown-icon.svg';
        img.alt = '';
        img.width = 28;
        img.height = 28;
        img.decoding = 'async';
        icon.appendChild(img);

        const label = document.createElement('span');
        label.className = 'file-row-label';

        const name = document.createElement('span');
        name.className = 'file-row-name';
        name.textContent = file.name || '(unnamed)';
        label.appendChild(name);

        if (!folder && file?.id && openedMap) {
            const openedAt = openedMap.get(file.id) || file.openedAt || 0;
            const tier = openedRecencyTier(openedAt);
            if (tier) {
                const dot = document.createElement('span');
                dot.className = `file-row-opened-dot file-row-opened-dot--${tier}`;
                dot.title = tier === 'day' ? 'Opened in the last 24 hours' : 'Opened in the last week';
                dot.setAttribute(
                    'aria-label',
                    tier === 'day' ? 'Opened in the last 24 hours' : 'Opened in the last week'
                );
                label.appendChild(dot);
            }
        }

        openBtn.append(icon, label);
        openBtn.addEventListener('click', () => onOpen(file));

        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'file-row-menu';
        menuBtn.setAttribute('aria-label', `More actions for ${file.name || 'item'}`);
        menuBtn.title = 'More actions';
        menuBtn.innerHTML =
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
        menuBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (typeof onMenu === 'function') onMenu(file);
        });

        row.append(openBtn, menuBtn);
        list.appendChild(row);
    }

    section.appendChild(list);
    return section;
}

export function setLoadMoreVisible(visible) {
    if (!els.btnLoadMore) return;
    const show = Boolean(visible);
    els.btnLoadMore.hidden = !show;
    if (!show) {
        els.btnLoadMore.disabled = false;
        els.btnLoadMore.textContent = 'Load more';
    }
}

export function setLoadMoreBusy(busy) {
    if (!els.btnLoadMore || els.btnLoadMore.hidden) return;
    els.btnLoadMore.disabled = Boolean(busy);
    els.btnLoadMore.textContent = busy ? 'Loading…' : 'Load more';
}

export function setUpEnabled(enabled) {
    if (!els.btnUp) return;
    els.btnUp.hidden = !enabled;
    els.btnUp.disabled = !enabled;
}

/**
 * Display title for a markdown file: strip trailing .md / .markdown.
 * @param {string} [name]
 */
export function displayNoteTitle(name) {
    const raw = String(name ?? '').trim();
    if (!raw) return 'Untitled';
    return raw.replace(/\.(md|markdown)$/i, '') || 'Untitled';
}

export function syncEditorChrome(state, options = {}) {
    const quiet = Boolean(options.quiet);
    const title = displayNoteTitle(state.fileName);
    const fullName = state.fileName || '';
    const editingDoc = Boolean(state.fileId && els.viewEditor && !els.viewEditor.hidden);

    if (els.app) {
        els.app.classList.toggle('is-editing-doc', editingDoc && state.status !== 'loading');
    }

    if (state.status === 'loading') {
        setEditorLoading(true, fullName);
        if (els.btnSave) els.btnSave.classList.remove('is-flashing');
        if (els.tabEditor) {
            els.tabEditor.classList.toggle('has-dirty', false);
            const label = els.tabEditor.querySelector('.nav-tab-label');
            if (label) label.textContent = 'Edit';
        }
        return;
    }

    setEditorLoading(false);

    if (state.fileId) {
        if (!els.viewEditor.hidden) {
            // Top strip stays compact; file name lives under the mode selector.
            els.viewTitle.textContent = 'Edit';
            els.viewTitle.classList.remove('view-title--doc');
            els.viewTitle.removeAttribute('title');
            if (els.editorFileTitle) {
                els.editorFileTitle.textContent = title;
                els.editorFileTitle.title = fullName || title;
            }
            syncNavActions('editor', { hasOpenFile: true });
        }
        els.editorEmpty.hidden = true;
        els.editorActive.hidden = false;
        els.btnSave.hidden = false;
        if (els.btnUndo) els.btnUndo.hidden = false;
        if (els.btnRedo) els.btnRedo.hidden = false;
        if (els.btnInsertList) els.btnInsertList.hidden = false;
        if (els.btnClickEdit) els.btnClickEdit.hidden = false;
        if (els.btnEditorMore) els.btnEditorMore.hidden = false;
        if (els.btnEditorSearch) els.btnEditorSearch.hidden = false;
    } else {
        els.viewTitle.classList.remove('view-title--doc');
        els.viewTitle.removeAttribute('title');
        if (els.editorFileTitle) {
            els.editorFileTitle.textContent = '';
            els.editorFileTitle.removeAttribute('title');
        }
        if (els.btnUndo) els.btnUndo.hidden = true;
        if (els.btnRedo) els.btnRedo.hidden = true;
        if (els.btnInsertList) els.btnInsertList.hidden = true;
        if (els.btnClickEdit) els.btnClickEdit.hidden = true;
        if (els.btnEditorMore) els.btnEditorMore.hidden = true;
        if (els.btnEditorSearch) els.btnEditorSearch.hidden = true;
        if (els.editorSearchBar) {
            els.editorSearchBar.hidden = true;
            els.editorSearchBar.setAttribute('aria-hidden', 'true');
        }
        if (els.btnEditorSearch) els.btnEditorSearch.setAttribute('aria-expanded', 'false');
    }
    els.btnSave.classList.toggle('is-flashing', Boolean(state.dirty && state.fileId && state.status !== 'saving'));
    if (els.btnEditorMore) els.btnEditorMore.hidden = !state.fileId;
    // Disabled state is owned by syncEditorActionLocks in app.js when a
    // cancelable Edit action is active; otherwise apply the base rules here.
    const actionLocked = Boolean(els.app?.classList.contains('is-action-locked'));
    const activeAction = els.app?.dataset.activeEditorAction || '';
    const baseDisabled = state.status === 'saving' || !state.fileId;
    const setActionDisabled = (btn, key, fallbackDisabled) => {
        if (!btn) return;
        if (actionLocked) {
            btn.disabled = key !== activeAction;
            return;
        }
        btn.disabled = fallbackDisabled;
    };
    setActionDisabled(els.btnSave, 'save', baseDisabled || !state.dirty);
    setActionDisabled(els.btnEditorMore, 'import-list', baseDisabled);
    setActionDisabled(els.btnInsertList, 'insert-list', baseDisabled);
    setActionDisabled(els.btnClickEdit, 'click-edit', baseDisabled);
    setActionDisabled(els.btnEditorSearch, 'search', baseDisabled);
    // Undo/redo enabled state is owned by syncUndoRedoButtons in app.js
    // (needs history stack); only force-disable while action-locked / saving.
    if (actionLocked || baseDisabled) {
        setActionDisabled(els.btnUndo, 'undo', true);
        setActionDisabled(els.btnRedo, 'redo', true);
    }

    if (els.tabEditor) {
        els.tabEditor.classList.toggle('has-dirty', Boolean(state.dirty && state.fileId));
        const label = els.tabEditor.querySelector('.nav-tab-label');
        if (label) label.textContent = state.dirty && state.fileId ? 'Edit •' : 'Edit';
    }

    // Quiet autosave must not stomp the raw textarea (resets caret) or toast loudly.
    if (!quiet && els.editor && els.editor.value !== state.editorContent) {
        els.editor.value = state.editorContent;
    }

    const editorHidden = Boolean(els.viewEditor?.hidden);
    // Keep the global save toast in sync even after leaving Edit (otherwise
    // "Saving…" sticks on Pinned/Finder until the user comes back).
    if (editorHidden) {
        if (quiet) {
            if (state.status === 'saved' && !state.dirty) {
                announceEditorSaveToast('autosaved', 'Autosaved', 'ok', { durationMs: 1400 });
            } else if (editorSaveToastKey === 'saving') {
                resetEditorSaveToast();
            }
            return;
        }
        if (state.status === 'saving') {
            announceEditorSaveToast('saving', 'Saving…', '', { sticky: true });
        } else if (state.status === 'saved' && !state.dirty) {
            announceEditorSaveToast('saved', 'Saved', 'ok', { durationMs: 2000 });
        } else if (state.status === 'error') {
            announceEditorSaveToast(
                `error:${state.errorMessage || 'Error'}`,
                state.errorMessage || 'Error',
                'error',
                { durationMs: 3600 }
            );
        } else if (editorSaveToastKey === 'saving' || editorSaveToastKey === 'dirty') {
            resetEditorSaveToast();
        }
        return;
    }

    if (quiet) {
        if (state.status === 'saved' && !state.dirty) {
            announceEditorSaveToast('autosaved', 'Autosaved', 'ok', { durationMs: 1400 });
        }
        return;
    }

    // Keep the top strip clear while editing; save/dirty feedback uses the overlay toast.
    if (state.status === 'saving') {
        announceEditorSaveToast('saving', 'Saving…', '', { sticky: true });
    } else if (state.status === 'saved' && !state.dirty) {
        announceEditorSaveToast('saved', 'Saved', 'ok', { durationMs: 2000 });
    } else if (state.status === 'dirty') {
        announceEditorSaveToast('dirty', 'Unsaved', 'warn', { durationMs: 2200 });
    } else if (state.status === 'conflict') {
        announceEditorSaveToast('conflict', 'Changed elsewhere', 'warn', { durationMs: 3600 });
    } else if (state.status === 'error') {
        announceEditorSaveToast(`error:${state.errorMessage || 'Error'}`, state.errorMessage || 'Error', 'error', {
            durationMs: 3600,
        });
    } else if (state.status === 'loading') {
        setStatus('');
        resetEditorSaveToast();
    } else {
        setStatus('');
        if (editorSaveToastKey === 'saving' || editorSaveToastKey === 'dirty') {
            resetEditorSaveToast();
        }
    }
}

/**
 * Enable/disable Undo & Redo from the edit-history stack.
 * @param {{ canUndo?: boolean, canRedo?: boolean, forceDisabled?: boolean }} [options]
 */
export function syncUndoRedoButtons(options = {}) {
    const actionLocked = Boolean(els.app?.classList.contains('is-action-locked'));
    const forceDisabled = Boolean(options.forceDisabled) || actionLocked;
    if (els.btnUndo) {
        els.btnUndo.disabled = forceDisabled || !options.canUndo;
    }
    if (els.btnRedo) {
        els.btnRedo.disabled = forceDisabled || !options.canRedo;
    }
}

export function setViewModeUi(mode) {
    if (!els.viewModeBar) return;
    const buttons = [
        [els.modeList, 'list'],
        [els.modePreview, 'preview'],
        [els.modeContents, 'contents'],
        [els.modeRaw, 'raw'],
    ];
    for (const [btn, name] of buttons) {
        if (!btn) continue;
        const active = name === mode;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
    }
}

/**
 * @param {'list' | 'preview' | 'contents' | 'raw'} mode
 * @param {{ hasFile?: boolean }} [options]
 */
export function applyEditorDisplayMode(mode, options = {}) {
    const hasFile = options.hasFile !== false;
    if (!els.editorActive) return;

    if (!hasFile) {
        if (els.viewModeBar) els.viewModeBar.hidden = true;
        if (els.listsRoot) els.listsRoot.hidden = true;
        if (els.listsStatus) els.listsStatus.hidden = true;
        if (els.markdownPreview) els.markdownPreview.hidden = true;
        els.editor.hidden = false;
        return;
    }

    if (els.viewModeBar) els.viewModeBar.hidden = false;
    setViewModeUi(mode);

    const structured = mode === 'list' || mode === 'preview' || mode === 'contents';
    if (els.listsRoot) els.listsRoot.hidden = !structured;
    if (els.markdownPreview) els.markdownPreview.hidden = true;
    els.editor.hidden = mode !== 'raw';
}

export function setListsStatus(message, kind = 'warn') {
    if (!els.listsStatus) return;
    if (!message) {
        els.listsStatus.hidden = true;
        els.listsStatus.textContent = '';
        return;
    }
    els.listsStatus.hidden = false;
    els.listsStatus.textContent = message;
    els.listsStatus.classList.toggle('is-error', kind === 'error');
    els.listsStatus.classList.toggle('is-warn', kind === 'warn');
}

/**
 * Confirm deleting an entire ranked list.
 * @param {string} [listTitle]
 * @returns {Promise<boolean>}
 */
export function confirmDeleteList(listTitle) {
    const dialog = els.deleteListDialog;
    const nameEl = els.deleteListDialogName;
    const title = String(listTitle || '').trim() || 'Untitled list';

    if (!dialog) {
        return Promise.resolve(window.confirm(`Delete list “${title}”? This cannot be undone.`));
    }

    if (nameEl) {
        nameEl.hidden = false;
        nameEl.textContent = title;
    }

    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            resolve(dialog.returnValue === 'delete');
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();
    });
}

/**
 * Confirm deleting a single list item (custom or plain).
 * @param {string} [itemText]
 * @returns {Promise<boolean>}
 */
export function confirmDeleteListItem(itemText) {
    const dialog = els.deleteListItemDialog;
    const nameEl = els.deleteListItemDialogName;
    const label = String(itemText || '').trim();

    if (!dialog) {
        return Promise.resolve(window.confirm('Delete this list item?'));
    }

    if (nameEl) {
        if (label) {
            nameEl.hidden = false;
            nameEl.textContent = label.length > 120 ? `${label.slice(0, 117)}…` : label;
        } else {
            nameEl.hidden = true;
            nameEl.textContent = '';
        }
    }

    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            resolve(dialog.returnValue === 'delete');
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();
    });
}

/**
 * Prompt to change a list item’s `{{date:…}}` tag via a native date picker.
 * Returns the new canonical tag, or null if cancelled / invalid.
 * @param {string | null | undefined} currentTag
 * @returns {Promise<string | null>}
 */
export function promptEditItemDate(currentTag) {
    const dialog = els.editItemDateDialog;
    const input = els.editItemDateInput;
    const errorEl = els.editItemDateError;

    const fallbackPrompt = () => {
        const initial =
            dateTagToIsoDate(currentTag) ||
            dateTagToIsoDate(buildDateTag()) ||
            '';
        const raw = window.prompt('Date (YYYY-MM-DD)', initial);
        if (raw == null) return Promise.resolve(null);
        return Promise.resolve(buildDateTagFromIsoDate(raw) || resolveDateTagInput(raw));
    };

    if (!dialog || !input) return fallbackPrompt();

    const initial =
        dateTagToIsoDate(currentTag) ||
        dateTagToIsoDate(buildDateTag()) ||
        '';
    input.value = initial;
    if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
    }

    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            input.removeEventListener('invalid', onInvalid);

            if (dialog.returnValue !== 'apply') {
                resolve(null);
                return;
            }

            const tag = buildDateTagFromIsoDate(input.value);
            if (!tag) {
                resolve(null);
                return;
            }
            resolve(tag);
        };

        const onInvalid = (event) => {
            event.preventDefault();
            if (errorEl) {
                errorEl.hidden = false;
                errorEl.textContent = 'Enter a valid date.';
            }
        };

        input.addEventListener('invalid', onInvalid);
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();

        // Open the OS date UI when supported (keeps the gesture chain on mobile).
        requestAnimationFrame(() => {
            try {
                input.focus({ preventScroll: true });
            } catch {
                try {
                    input.focus();
                } catch {
                    // ignore
                }
            }
            try {
                if (typeof input.showPicker === 'function') {
                    input.showPicker();
                }
            } catch {
                // Not available or blocked — user can tap the field.
            }
        });
    });
}

/**
 * Prompt when leaving Edit with unsaved changes.
 * @returns {Promise<'save'|'discard'|'cancel'>}
 */
export function promptUnsavedChanges(dialogEl) {
    if (!dialogEl) {
        const save = window.confirm('You haven’t saved this file. Save now?');
        if (save) return Promise.resolve('save');
        const leave = window.confirm('Leave without saving?');
        return Promise.resolve(leave ? 'discard' : 'cancel');
    }

    return new Promise((resolve) => {
        const onClose = () => {
            dialogEl.removeEventListener('close', onClose);
            const value = dialogEl.returnValue;
            if (value === 'save' || value === 'discard') resolve(value);
            else resolve('cancel');
        };
        dialogEl.addEventListener('close', onClose);
        dialogEl.returnValue = 'cancel';
        dialogEl.showModal();
    });
}

/**
 * Update the Finder Sort button label to match the active mode.
 * @param {string} sortMode
 */
export function syncFinderSortControl(sortMode) {
    const mode = FINDER_SORT_VALUES.has(sortMode) ? sortMode : FINDER_SORT_DEFAULT;
    const option = FINDER_SORT_OPTIONS.find((o) => o.value === mode);
    const label = option?.label || 'Sort';
    if (els.btnFinderSortLabel) els.btnFinderSortLabel.textContent = label;
    if (els.btnFinderSort) {
        els.btnFinderSort.title = `Sort: ${label}`;
        els.btnFinderSort.setAttribute('aria-label', `Sort files: ${label}`);
    }
}

/**
 * Prompt for Finder sort order.
 * @param {string} [current]
 * @returns {Promise<string|null>} selected sort mode, or null if cancelled
 */
export function promptFinderSort(current = FINDER_SORT_DEFAULT) {
    const dialog = els.finderSortDialog;
    const list = els.finderSortOptions;
    if (!dialog || !list) return Promise.resolve(null);

    const active = FINDER_SORT_VALUES.has(current) ? current : FINDER_SORT_DEFAULT;
    list.replaceChildren();
    for (const option of FINDER_SORT_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.value = option.value;
        btn.className = 'btn btn-ghost btn-block item-action-btn';
        if (option.value === active) {
            btn.classList.add('is-selected');
            btn.setAttribute('aria-current', 'true');
        }
        btn.textContent = option.label;
        list.appendChild(btn);
    }

    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            const value = dialog.returnValue;
            if (FINDER_SORT_VALUES.has(value)) resolve(value);
            else resolve(null);
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();
    });
}

/**
 * Render key/value stats in the Edit burger menu.
 * @param {Array<{ label: string, value: string, pending?: boolean }> | null | undefined} rows
 */
export function fillEditorMoreStats(rows) {
    const root = els.editorMoreStats;
    if (!root) return;
    root.replaceChildren();
    if (!Array.isArray(rows) || !rows.length) {
        root.hidden = true;
        return;
    }
    root.hidden = false;
    for (const row of rows) {
        if (!row?.label) continue;
        const label = document.createElement('span');
        label.className = 'editor-more-stats-label';
        label.textContent = row.label;
        const value = document.createElement('span');
        value.className = 'editor-more-stats-value';
        if (row.pending) value.classList.add('is-pending');
        value.textContent = row.value == null || row.value === '' ? '—' : String(row.value);
        root.append(label, value);
    }
}

/**
 * Action sheet for the Edit toolbar burger menu.
 * @param {{ fileName?: string, isPinned?: boolean, stats?: Array<{ label: string, value: string, pending?: boolean }>, showDates?: boolean, autosaveEnabled?: boolean }} [options]
 * @returns {Promise<'rename'|'pin'|'unpin'|null>}
 */
export function promptEditorMoreMenu(options = {}) {
    const dialog = els.editorMoreDialog;
    if (!dialog) return Promise.resolve(null);

    const pinned = Boolean(options.isPinned);
    const name = String(options.fileName || '').trim();
    if (els.editorMoreName) {
        if (name) {
            els.editorMoreName.hidden = false;
            els.editorMoreName.textContent = name;
        } else {
            els.editorMoreName.hidden = true;
            els.editorMoreName.textContent = '';
        }
    }
    fillEditorMoreStats(options.stats);
    if (els.editorMorePin) {
        els.editorMorePin.value = pinned ? 'unpin' : 'pin';
        els.editorMorePin.textContent = pinned ? 'Unpin' : 'Pin';
    }
    syncEditorMoreShowDates(Boolean(options.showDates));
    syncEditorMoreAutosaveOff(options.autosaveEnabled !== false);

    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            const value = dialog.returnValue;
            if (value === 'rename' || value === 'pin' || value === 'unpin') {
                resolve(value);
            } else resolve(null);
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();
    });
}

/**
 * @param {boolean} enabled
 */
export function syncEditorMoreShowDates(enabled) {
    const btn = els.editorMoreShowDates;
    if (!btn) return;
    const on = Boolean(enabled);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('is-selected', on);
    btn.textContent = on ? 'Hide dates' : 'Show dates';
}

/**
 * Reflect whether session autosave is still on (off until the file is reopened).
 * @param {boolean} enabled
 */
export function syncEditorMoreAutosaveOff(enabled) {
    const btn = els.editorMoreAutosaveOff;
    if (!btn) return;
    const on = Boolean(enabled);
    btn.disabled = !on;
    btn.textContent = on ? 'Turn off autosave' : 'Autosave off';
    btn.setAttribute('aria-disabled', on ? 'false' : 'true');
}

/**
 * Choose a date tag to stamp onto undated list items.
 * @param {{
 *   missing: number,
 *   total: number,
 *   createdTag?: string | null,
 *   createdLabel?: string,
 *   defaultCustom?: string,
 *   resolveTag: (raw: string) => string | null,
 * }} options
 * @returns {Promise<string | null>} canonical `{{date:…}}` or null if cancelled
 */
export function promptFillListDates(options) {
    const dialog = els.fillDatesDialog;
    if (!dialog) return Promise.resolve(null);

    const missing = Math.max(0, Number(options.missing) || 0);
    const total = Math.max(0, Number(options.total) || 0);
    const createdTag = options.createdTag || null;
    const createdLabel = String(options.createdLabel || '').trim();
    const resolveTag =
        typeof options.resolveTag === 'function' ? options.resolveTag : () => null;
    const defaultCustom = String(options.defaultCustom || '').trim();

    if (els.fillDatesSummary) {
        els.fillDatesSummary.textContent =
            missing > 0
                ? `${missing} of ${total} list item${total === 1 ? '' : 's'} need a date tag. Items that already have one won’t change.`
                : 'Every list item already has a date tag.';
    }

    const createdRadio = els.fillDatesSourceCreated;
    const customRadio = els.fillDatesSourceCustom;
    const customInput = els.fillDatesCustom;
    const createdMeta = els.fillDatesCreatedLabel;
    const preview = els.fillDatesPreview;
    const errorEl = els.fillDatesError;
    const applyBtn = els.fillDatesApply;

    if (createdMeta) {
        createdMeta.textContent = createdTag
            ? createdLabel || createdTag
            : 'Created date unavailable — use a custom date';
    }
    if (createdRadio) {
        createdRadio.disabled = !createdTag;
        createdRadio.checked = Boolean(createdTag);
    }
    if (customRadio) {
        customRadio.checked = !createdTag;
    }
    if (customInput) {
        customInput.value = defaultCustom;
        customInput.disabled = Boolean(createdTag) && !(customRadio && customRadio.checked);
    }
    if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
    }
    if (applyBtn) applyBtn.disabled = missing <= 0;

    const selectedSource = () =>
        customRadio?.checked || !createdTag ? 'custom' : 'created';

    const syncCustomEnabled = () => {
        const custom = selectedSource() === 'custom';
        if (customInput) customInput.disabled = !custom;
        if (custom && customInput && dialog.open) {
            requestAnimationFrame(() => customInput.focus());
        }
    };

    const syncPreview = () => {
        if (!preview) return;
        let tag = null;
        if (selectedSource() === 'created') {
            tag = createdTag;
        } else {
            tag = resolveTag(customInput?.value || '');
        }
        if (tag) {
            preview.textContent = `Will use ${tag}`;
            preview.hidden = false;
            if (errorEl && errorEl.dataset.kind === 'parse') {
                errorEl.hidden = true;
                errorEl.textContent = '';
                delete errorEl.dataset.kind;
            }
        } else {
            preview.textContent = selectedSource() === 'custom'
                ? 'Enter a valid date to continue'
                : '';
            preview.hidden = !preview.textContent;
        }
        return tag;
    };

    syncCustomEnabled();
    syncPreview();

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (dialog.open) dialog.close();
            resolve(value);
        };

        const onSourceChange = () => {
            syncCustomEnabled();
            syncPreview();
        };

        const onCustomInput = () => {
            syncPreview();
        };

        const onCancel = () => finish(null);

        const onApply = () => {
            if (missing <= 0) {
                finish(null);
                return;
            }
            let tag = null;
            if (selectedSource() === 'created') {
                tag = createdTag;
                if (!tag) {
                    if (errorEl) {
                        errorEl.hidden = false;
                        errorEl.dataset.kind = 'parse';
                        errorEl.textContent = 'File created date is unavailable. Enter a custom date.';
                    }
                    if (customRadio) customRadio.checked = true;
                    syncCustomEnabled();
                    return;
                }
            } else {
                tag = resolveTag(customInput?.value || '');
                if (!tag) {
                    if (errorEl) {
                        errorEl.hidden = false;
                        errorEl.dataset.kind = 'parse';
                        errorEl.textContent =
                            'Couldn’t parse that date. Try YYYY-MM-DD, 3 Aug 2026, or today.';
                    }
                    customInput?.focus();
                    return;
                }
            }
            finish(tag);
        };

        const onDialogCancel = (event) => {
            event.preventDefault();
            finish(null);
        };

        const cleanup = () => {
            createdRadio?.removeEventListener('change', onSourceChange);
            customRadio?.removeEventListener('change', onSourceChange);
            customInput?.removeEventListener('input', onCustomInput);
            els.fillDatesCancel?.removeEventListener('click', onCancel);
            applyBtn?.removeEventListener('click', onApply);
            dialog.removeEventListener('cancel', onDialogCancel);
        };

        createdRadio?.addEventListener('change', onSourceChange);
        customRadio?.addEventListener('change', onSourceChange);
        customInput?.addEventListener('input', onCustomInput);
        els.fillDatesCancel?.addEventListener('click', onCancel);
        applyBtn?.addEventListener('click', onApply);
        dialog.addEventListener('cancel', onDialogCancel);

        dialog.showModal();
        syncCustomEnabled();
    });
}

/**
 * Action sheet for a Finder / Pinned row.
 * @param {object} file
 * @param {{ isPinned?: boolean }} [options]
 * @returns {Promise<'pin'|'unpin'|'copy'|'rename'|'move'|'download'|null>}
 */
export function promptItemActions(file, options = {}) {
    const dialog = els.itemActionsDialog;
    if (!dialog) return Promise.resolve(null);

    const folder = isFolder(file);
    const pinned = Boolean(options.isPinned);
    const canDownload = !folder && isMarkdownCandidate(file);
    const canCopy = !folder && isMarkdownCandidate(file);
    if (els.itemActionsTitle) {
        els.itemActionsTitle.textContent = folder ? 'Folder actions' : 'Markdown actions';
    }
    if (els.itemActionsName) {
        els.itemActionsName.textContent = file.name || '(unnamed)';
        els.itemActionsName.hidden = !file.name;
    }
    if (els.itemActionPin) {
        els.itemActionPin.hidden = false;
        els.itemActionPin.value = pinned ? 'unpin' : 'pin';
        els.itemActionPin.textContent = pinned ? 'Unpin' : 'Pin';
    }
    if (els.itemActionCopy) els.itemActionCopy.hidden = !canCopy;
    if (els.itemActionDownload) els.itemActionDownload.hidden = !canDownload;

    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            const value = dialog.returnValue;
            if (
                value === 'pin' ||
                value === 'unpin' ||
                value === 'copy' ||
                value === 'rename' ||
                value === 'move' ||
                value === 'download'
            ) {
                resolve(value);
            } else resolve(null);
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();
    });
}

/**
 * Warn when a pinned shortcut looks moved, renamed, or missing.
 * @param {{ title?: string, message: string, name?: string }} opts
 * @returns {Promise<'keep'|'delete'>}
 */
export function promptPinnedShortcutIssue(opts) {
    const dialog = els.pinnedMissingDialog;
    const title = opts?.title || 'Pinned item changed';
    const message =
        opts?.message ||
        'This pinned shortcut may have been moved or renamed in Google Drive.';
    const name = String(opts?.name || '').trim();

    if (!dialog) {
        const keep = window.confirm(`${message}\n\nKeep this shortcut?`);
        return Promise.resolve(keep ? 'keep' : 'delete');
    }

    if (els.pinnedMissingTitle) els.pinnedMissingTitle.textContent = title;
    if (els.pinnedMissingMessage) els.pinnedMissingMessage.textContent = message;
    if (els.pinnedMissingName) {
        if (name) {
            els.pinnedMissingName.hidden = false;
            els.pinnedMissingName.textContent = name;
        } else {
            els.pinnedMissingName.hidden = true;
            els.pinnedMissingName.textContent = '';
        }
    }

    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            resolve(dialog.returnValue === 'delete' ? 'delete' : 'keep');
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'keep';
        dialog.showModal();
    });
}

/**
 * Folder picker for Move (My Drive + Computers).
 * @param {{
 *   item: object,
 *   currentParentId: string,
 *   listFolders: (parentId: string) => Promise<object[]>,
 *   listComputerRoots?: () => Promise<object[]>,
 *   initialMode?: 'folder' | 'computers',
 *   initialStack?: Array<{ id: string, name: string }>,
 * }} options
 * @returns {Promise<{ folderId: string, folderName: string }|null>}
 */
export function promptMoveDestination(options) {
    const { item, currentParentId, listFolders, listComputerRoots, initialMode, initialStack } =
        options;
    const dialog = els.moveDialog;
    if (!dialog || typeof listFolders !== 'function') return Promise.resolve(null);

    const movingFolder = isFolder(item);
    const hasComputers = typeof listComputerRoots === 'function';
    let mode = initialMode === 'computers' && hasComputers ? 'computers' : 'folder';

    const driveRoot = () => [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
    const computersRoot = () => [{ id: COMPUTERS_FOLDER_ID, name: COMPUTERS_FOLDER_NAME }];

    const normalizeStack = (frames, forMode) => {
        const list = Array.isArray(frames)
            ? frames
                  .filter((f) => f && f.id)
                  .map((f) => ({ id: String(f.id), name: String(f.name || 'Folder') }))
            : [];
        if (forMode === 'computers') {
            if (!list.length || list[0].id !== COMPUTERS_FOLDER_ID) {
                return computersRoot();
            }
            return list;
        }
        if (!list.length || list[0].id === COMPUTERS_FOLDER_ID) {
            return driveRoot();
        }
        return list;
    };

    let stack = normalizeStack(initialStack, mode);
    let loading = false;

    if (els.moveDialogTitle) {
        els.moveDialogTitle.textContent = `Move “${item.name || 'item'}”`;
    }
    if (els.moveDialogHint) {
        els.moveDialogHint.textContent = movingFolder
            ? 'Open a folder or choose Move here. You can’t move a folder into itself.'
            : 'Open a folder or choose Move here.';
    }
    if (els.moveModeDrive) els.moveModeDrive.hidden = false;
    if (els.moveModeComputers) els.moveModeComputers.hidden = !hasComputers;

    const current = () => stack[stack.length - 1];
    const atVirtualComputersRoot = () =>
        mode === 'computers' && stack.length === 1 && current().id === COMPUTERS_FOLDER_ID;

    const syncModeButtons = () => {
        if (els.moveModeDrive) {
            els.moveModeDrive.classList.toggle('is-active', mode === 'folder');
            els.moveModeDrive.setAttribute('aria-pressed', mode === 'folder' ? 'true' : 'false');
        }
        if (els.moveModeComputers) {
            els.moveModeComputers.classList.toggle('is-active', mode === 'computers');
            els.moveModeComputers.setAttribute(
                'aria-pressed',
                mode === 'computers' ? 'true' : 'false'
            );
        }
    };

    const syncChrome = () => {
        const atSectionRoot = stack.length <= 1;
        if (els.moveBtnUp) {
            els.moveBtnUp.hidden = atSectionRoot;
            els.moveBtnUp.disabled = atSectionRoot || loading;
        }
        if (els.moveFolderPath) {
            els.moveFolderPath.textContent = stack.map((f) => f.name).join(' / ');
        }
        const sameParent = current().id === currentParentId;
        const cannotPlaceHere = atVirtualComputersRoot();
        if (els.moveBtnHere) {
            els.moveBtnHere.disabled = loading || sameParent || cannotPlaceHere;
            if (cannotPlaceHere) {
                els.moveBtnHere.title = 'Open a computer folder first';
            } else if (sameParent) {
                els.moveBtnHere.title = 'Already in this folder';
            } else {
                els.moveBtnHere.title = 'Move here';
            }
        }
        if (els.moveEmpty) {
            els.moveEmpty.textContent = atVirtualComputersRoot()
                ? 'No computer folders found.'
                : 'No subfolders here.';
        }
        syncModeButtons();
    };

    const renderFolders = (folders) => {
        if (!els.moveFolderList) return;
        els.moveFolderList.replaceChildren();
        const visible = (folders || []).filter((f) => !(movingFolder && f.id === item.id));
        if (els.moveEmpty) els.moveEmpty.hidden = visible.length > 0;
        for (const folder of visible) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'move-folder-row';
            btn.setAttribute('role', 'listitem');
            btn.innerHTML =
                `<span class="file-row-icon" aria-hidden="true"><img src="Assets/SVGs/open-folder-outline-icon.svg" alt="" width="24" height="24"></span>` +
                `<span class="move-folder-name"></span>`;
            btn.querySelector('.move-folder-name').textContent = folder.name || 'Folder';
            btn.addEventListener('click', () => {
                stack.push({ id: folder.id, name: folder.name || 'Folder' });
                load();
            });
            els.moveFolderList.appendChild(btn);
        }
    };

    const load = async () => {
        loading = true;
        syncChrome();
        if (els.moveFolderList) {
            els.moveFolderList.replaceChildren();
            const loadingRow = document.createElement('div');
            loadingRow.className = 'move-loading';
            loadingRow.setAttribute('aria-live', 'polite');
            loadingRow.setAttribute('aria-busy', 'true');
            const label = document.createElement('p');
            label.className = 'move-loading-label';
            label.textContent = atVirtualComputersRoot()
                ? 'Looking for Computers in Google Drive…'
                : 'Loading folders…';
            const bar = document.createElement('div');
            bar.className = 'loading-bar';
            bar.setAttribute('role', 'progressbar');
            bar.setAttribute('aria-label', label.textContent);
            bar.setAttribute('aria-valuetext', label.textContent);
            const fill = document.createElement('div');
            fill.className = 'loading-bar-fill';
            bar.appendChild(fill);
            loadingRow.append(label, bar);
            els.moveFolderList.appendChild(loadingRow);
        }
        if (els.moveEmpty) els.moveEmpty.hidden = true;
        try {
            let folders;
            if (atVirtualComputersRoot()) {
                folders = await listComputerRoots();
            } else {
                folders = await listFolders(current().id);
            }
            renderFolders(folders);
        } catch (err) {
            if (els.moveFolderList) {
                els.moveFolderList.replaceChildren();
                const error = document.createElement('p');
                error.className = 'error-text';
                error.textContent = err.message || 'Failed to list folders';
                els.moveFolderList.appendChild(error);
            }
        } finally {
            loading = false;
            syncChrome();
        }
    };

    const switchMode = (nextMode) => {
        if (!hasComputers && nextMode === 'computers') return;
        if (nextMode !== 'folder' && nextMode !== 'computers') return;
        if (nextMode === mode || loading) return;
        mode = nextMode;
        stack = nextMode === 'computers' ? computersRoot() : driveRoot();
        load();
    };

    return new Promise((resolve) => {
        const cleanup = () => {
            if (els.moveBtnCancel) els.moveBtnCancel.removeEventListener('click', onCancel);
            if (els.moveBtnHere) els.moveBtnHere.removeEventListener('click', onConfirm);
            if (els.moveBtnUp) els.moveBtnUp.removeEventListener('click', onUp);
            if (els.moveModeDrive) els.moveModeDrive.removeEventListener('click', onModeDrive);
            if (els.moveModeComputers) {
                els.moveModeComputers.removeEventListener('click', onModeComputers);
            }
            dialog.removeEventListener('cancel', onCancel);
        };

        const finish = (value) => {
            cleanup();
            if (dialog.open) dialog.close();
            resolve(value);
        };

        const onCancel = (event) => {
            event?.preventDefault?.();
            finish(null);
        };

        const onConfirm = () => {
            if (els.moveBtnHere?.disabled) return;
            if (atVirtualComputersRoot()) return;
            finish({ folderId: current().id, folderName: current().name });
        };

        const onUp = () => {
            if (stack.length <= 1 || loading) return;
            stack.pop();
            load();
        };

        const onModeDrive = () => switchMode('folder');
        const onModeComputers = () => switchMode('computers');

        if (els.moveBtnCancel) els.moveBtnCancel.addEventListener('click', onCancel);
        if (els.moveBtnHere) els.moveBtnHere.addEventListener('click', onConfirm);
        if (els.moveBtnUp) els.moveBtnUp.addEventListener('click', onUp);
        if (els.moveModeDrive) els.moveModeDrive.addEventListener('click', onModeDrive);
        if (els.moveModeComputers) {
            els.moveModeComputers.addEventListener('click', onModeComputers);
        }
        dialog.addEventListener('cancel', onCancel);

        dialog.showModal();
        load();
    });
}

/**
 * Prompt for a name. Returns trimmed string or null if cancelled.
 * @param {{
 *   title: string,
 *   hint?: string,
 *   confirmLabel?: string,
 *   initialValue?: string,
 *   selectStem?: boolean,
 *   validate?: (name: string, opts?: { localOnly?: boolean }) => string | null | undefined | Promise<string | null | undefined>,
 * }} options
 */
export function promptForName(options) {
    const {
        title,
        hint = '',
        confirmLabel = 'Save',
        initialValue = '',
        selectStem = false,
        validate = null,
    } = options;

    return new Promise((resolve) => {
        const dialog = els.nameDialog;
        const form = els.nameForm;
        const input = els.nameInput;
        const warning = els.nameDialogWarning;
        const confirmBtn = els.nameDialogConfirm;

        els.nameDialogTitle.textContent = title;
        els.nameDialogHint.textContent = hint;
        els.nameDialogHint.hidden = !hint;
        if (confirmBtn) confirmBtn.textContent = confirmLabel;
        input.value = initialValue;
        if (warning) {
            warning.hidden = true;
            warning.textContent = '';
        }
        if (confirmBtn) confirmBtn.disabled = false;

        let validating = false;
        /** @type {ReturnType<typeof setTimeout> | null} */
        let inputTimer = null;
        let inputToken = 0;

        const setWarning = (message) => {
            if (!warning) return;
            const text = String(message || '').trim();
            if (text) {
                warning.hidden = false;
                warning.textContent = text;
            } else {
                warning.hidden = true;
                warning.textContent = '';
            }
        };

        const runValidate = async ({ localOnly = false } = {}) => {
            if (typeof validate !== 'function') {
                setWarning('');
                if (confirmBtn) confirmBtn.disabled = false;
                return null;
            }
            const value = input.value.trim();
            if (!value) {
                setWarning('');
                if (confirmBtn) confirmBtn.disabled = true;
                return 'Name cannot be empty.';
            }
            validating = true;
            try {
                const message = await validate(value, { localOnly });
                const err = message ? String(message) : '';
                setWarning(err);
                if (confirmBtn) confirmBtn.disabled = Boolean(err);
                return err || null;
            } catch (err) {
                const message = err?.message || 'Could not validate name.';
                setWarning(message);
                if (confirmBtn) confirmBtn.disabled = true;
                return message;
            } finally {
                validating = false;
            }
        };

        const onInput = () => {
            // Instant local feedback, then a debounced full check.
            runValidate({ localOnly: true });
            if (typeof validate !== 'function') return;
            inputToken += 1;
            const token = inputToken;
            if (inputTimer) clearTimeout(inputTimer);
            inputTimer = setTimeout(() => {
                if (token !== inputToken) return;
                runValidate({ localOnly: false });
            }, 300);
        };

        const onSubmit = async (event) => {
            const submitter = event.submitter;
            const intent =
                (submitter && 'value' in submitter && submitter.value) || dialog.returnValue;

            if (intent !== 'confirm') return;

            event.preventDefault();
            if (validating) return;
            if (inputTimer) {
                clearTimeout(inputTimer);
                inputTimer = null;
            }
            const err = await runValidate({ localOnly: false });
            if (err) {
                try {
                    input.focus({ preventScroll: true });
                } catch {
                    input.focus();
                }
                return;
            }
            dialog.returnValue = 'confirm';
            dialog.close();
        };

        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            form?.removeEventListener('submit', onSubmit);
            input.removeEventListener('input', onInput);
            if (inputTimer) clearTimeout(inputTimer);
            if (dialog.returnValue === 'confirm') {
                const value = input.value.trim();
                resolve(value || null);
            } else {
                resolve(null);
            }
        };

        form?.addEventListener('submit', onSubmit);
        input.addEventListener('input', onInput);
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();
        requestAnimationFrame(() => {
            input.focus();
            if (selectStem && initialValue.toLowerCase().endsWith('.md')) {
                input.setSelectionRange(0, initialValue.length - 3);
            } else if (selectStem && initialValue.toLowerCase().endsWith('.markdown')) {
                input.setSelectionRange(0, initialValue.length - 9);
            } else {
                input.select();
            }
            runValidate({ localOnly: true });
        });
    });
}

/**
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatRevisionTime(iso) {
    if (!iso) return 'Unknown time';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    try {
        return date.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return date.toLocaleString();
    }
}

/**
 * @param {number | undefined} bytes
 * @returns {string}
 */
function formatRevisionBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {string} message
 * @param {'info' | 'error'} [kind]
 */
export function setHistoryStatus(message, kind = 'info') {
    const el = els.historyStatus;
    if (!el) return;
    if (!message) {
        el.hidden = true;
        el.textContent = '';
        el.classList.remove('is-error');
        return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('is-error', kind === 'error');
}

/**
 * @param {string} message
 * @param {'info' | 'error'} [kind]
 */
export function setHistoryPreviewStatus(message, kind = 'info') {
    const el = els.historyPreviewStatus;
    if (!el) return;
    if (!message) {
        el.hidden = true;
        el.textContent = '';
        el.classList.remove('is-error');
        return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('is-error', kind === 'error');
}

/**
 * @param {import('./revisions.js').DocumentRevision[]} revisions
 * @param {{ onPreview?: (rev: import('./revisions.js').DocumentRevision) => void, onRestore?: (rev: import('./revisions.js').DocumentRevision) => void, truncated?: boolean }} [options]
 */
export function renderVersionHistoryList(revisions, options = {}) {
    const root = els.historyList;
    if (!root) return;
    root.replaceChildren();

    const list = Array.isArray(revisions) ? revisions : [];
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = 'No revisions found for this file yet. Edit and save once to create history.';
        root.append(empty);
        return;
    }

    for (const rev of list) {
        const item = document.createElement('article');
        item.className = 'history-item';
        item.setAttribute('role', 'listitem');
        if (rev.isCurrent) item.classList.add('is-current');
        item.dataset.revisionId = rev.id;

        const top = document.createElement('div');
        top.className = 'history-item-top';

        const time = document.createElement('div');
        time.className = 'history-item-time';
        time.textContent = formatRevisionTime(rev.modifiedTime);

        const badges = document.createElement('div');
        badges.className = 'history-item-badges';
        if (rev.isCurrent) {
            const badge = document.createElement('span');
            badge.className = 'history-badge history-badge--current';
            badge.textContent = 'Current';
            badges.append(badge);
        }
        if (rev.type === 'named') {
            const badge = document.createElement('span');
            badge.className = 'history-badge history-badge--named';
            badge.textContent = 'Named';
            badges.append(badge);
        } else if (rev.keepForever && !rev.isCurrent) {
            const badge = document.createElement('span');
            badge.className = 'history-badge history-badge--protected';
            badge.textContent = rev.type === 'safety' ? 'Safety' : 'Protected';
            badges.append(badge);
        } else if (!rev.isCurrent) {
            const badge = document.createElement('span');
            badge.className = 'history-badge';
            badge.textContent = 'Automatic';
            badges.append(badge);
        }

        top.append(time, badges);

        const metaParts = [];
        if (rev.label) metaParts.push(rev.label);
        const sizeLabel = formatRevisionBytes(rev.size);
        if (sizeLabel) metaParts.push(sizeLabel);
        const meta = document.createElement('p');
        meta.className = 'history-item-meta';
        meta.textContent = metaParts.length ? metaParts.join(' · ') : `Revision ${rev.id}`;

        const actions = document.createElement('div');
        actions.className = 'history-item-actions';

        const previewBtn = document.createElement('button');
        previewBtn.type = 'button';
        previewBtn.className = 'btn btn-ghost';
        previewBtn.textContent = 'Preview';
        previewBtn.addEventListener('click', () => options.onPreview?.(rev));

        actions.append(previewBtn);

        if (!rev.isCurrent) {
            const restoreBtn = document.createElement('button');
            restoreBtn.type = 'button';
            restoreBtn.className = 'btn btn-primary';
            restoreBtn.textContent = 'Restore…';
            restoreBtn.addEventListener('click', () => options.onRestore?.(rev));
            actions.append(restoreBtn);
        }

        item.append(top, meta, actions);
        root.append(item);
    }

    if (options.truncated) {
        const note = document.createElement('p');
        note.className = 'history-item-meta';
        note.style.padding = '4px 8px';
        note.textContent = 'Showing the most recent revisions. Older ones may still exist on Drive.';
        root.append(note);
    }
}

/**
 * Open the version history dialog (caller fills list / status).
 */
export function openHistoryDialog() {
    const dialog = els.historyDialog;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
}

export function closeHistoryDialog() {
    const dialog = els.historyDialog;
    if (dialog?.open) dialog.close();
}

/**
 * @param {{ title?: string, meta?: string, content?: string, busy?: boolean, error?: string, canRestore?: boolean }} [options]
 */
export function openHistoryPreviewDialog(options = {}) {
    const dialog = els.historyPreviewDialog;
    if (!dialog) return;

    if (els.historyPreviewTitle) {
        els.historyPreviewTitle.textContent = options.title || 'Version preview';
    }
    if (els.historyPreviewMeta) {
        els.historyPreviewMeta.textContent = options.meta || '';
    }
    if (els.historyPreviewText) {
        els.historyPreviewText.textContent =
            options.content == null ? '' : String(options.content);
    }
    setHistoryPreviewStatus(
        options.error || (options.busy ? 'Loading…' : ''),
        options.error ? 'error' : 'info'
    );
    const canRestore = options.canRestore !== false;
    if (els.historyPreviewCopy) els.historyPreviewCopy.disabled = Boolean(options.busy);
    if (els.historyPreviewRestore) {
        els.historyPreviewRestore.disabled = Boolean(options.busy) || !canRestore;
        els.historyPreviewRestore.hidden = options.canRestore === false;
    }

    if (!dialog.open) dialog.showModal();
}

export function closeHistoryPreviewDialog() {
    const dialog = els.historyPreviewDialog;
    if (dialog?.open) dialog.close();
}

/**
 * @param {string} [meta]
 * @returns {Promise<boolean>}
 */
export function promptRestoreRevision(meta = '') {
    const dialog = els.historyRestoreDialog;
    if (!dialog) {
        return Promise.resolve(window.confirm('Restore this version?'));
    }
    if (els.historyRestoreMeta) {
        els.historyRestoreMeta.textContent = meta || '';
        els.historyRestoreMeta.hidden = !meta;
    }
    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            resolve(dialog.returnValue === 'restore');
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();
    });
}

/** @type {Promise<'keep-mine'|'use-drive'|'review'|null> | null} */
let conflictDialogInFlight = null;
/** @type {Promise<'keep-mine'|'use-drive'|null> | null} */
let conflictReviewInFlight = null;
/** @type {Promise<string|null> | null} */
let nameVersionInFlight = null;

/**
 * @returns {Promise<'keep-mine'|'use-drive'|'review'|null>}
 */
export function promptConflictDialog() {
    if (conflictDialogInFlight) return conflictDialogInFlight;
    const dialog = els.conflictDialog;
    if (!dialog) {
        const keep = window.confirm(
            'This document changed elsewhere. OK = keep your version, Cancel = use Drive.'
        );
        return Promise.resolve(keep ? 'keep-mine' : 'use-drive');
    }
    if (dialog.open) {
        try {
            dialog.close('cancel');
        } catch {
            // ignore
        }
    }
    conflictDialogInFlight = new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            conflictDialogInFlight = null;
            const value = dialog.returnValue;
            if (value === 'keep-mine' || value === 'use-drive' || value === 'review') {
                resolve(value);
            } else resolve(null);
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        try {
            dialog.showModal();
        } catch (err) {
            dialog.removeEventListener('close', onClose);
            conflictDialogInFlight = null;
            resolve(null);
        }
    });
    return conflictDialogInFlight;
}

/**
 * @param {{ localText: string, driveText: string }} options
 * @returns {Promise<'keep-mine'|'use-drive'|null>}
 */
export function promptConflictReview(options) {
    if (conflictReviewInFlight) return conflictReviewInFlight;
    const dialog = els.conflictReviewDialog;
    if (!dialog) return Promise.resolve(null);

    if (els.conflictReviewLocal) els.conflictReviewLocal.textContent = options.localText || '';
    if (els.conflictReviewDrive) els.conflictReviewDrive.textContent = options.driveText || '';

    if (dialog.open) {
        try {
            dialog.close();
        } catch {
            // ignore
        }
    }

    conflictReviewInFlight = new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            cleanup();
            conflictReviewInFlight = null;
            if (dialog.open) {
                try {
                    dialog.close();
                } catch {
                    // ignore
                }
            }
            resolve(value);
        };
        const onKeep = () => finish('keep-mine');
        const onDrive = () => finish('use-drive');
        const onCloseBtn = () => finish(null);
        const onDialogClose = () => finish(null);
        const cleanup = () => {
            els.conflictReviewKeepMine?.removeEventListener('click', onKeep);
            els.conflictReviewUseDrive?.removeEventListener('click', onDrive);
            els.conflictReviewClose?.removeEventListener('click', onCloseBtn);
            dialog.removeEventListener('close', onDialogClose);
        };
        els.conflictReviewKeepMine?.addEventListener('click', onKeep);
        els.conflictReviewUseDrive?.addEventListener('click', onDrive);
        els.conflictReviewClose?.addEventListener('click', onCloseBtn);
        dialog.addEventListener('close', onDialogClose);
        try {
            dialog.showModal();
        } catch {
            cleanup();
            conflictReviewInFlight = null;
            resolve(null);
        }
    });
    return conflictReviewInFlight;
}

/**
 * @returns {Promise<string|null>}
 */
export function promptNameVersion() {
    if (nameVersionInFlight) return nameVersionInFlight;
    const dialog = els.nameVersionDialog;
    const form = els.nameVersionForm;
    const input = els.nameVersionInput;
    if (!dialog || !input) {
        const name = window.prompt('Name this version');
        return Promise.resolve(name && name.trim() ? name.trim() : null);
    }

    if (dialog.open) {
        try {
            dialog.close('cancel');
        } catch {
            // ignore
        }
    }

    input.value = '';
    nameVersionInFlight = new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            form?.removeEventListener('submit', onSubmit);
            nameVersionInFlight = null;
            if (dialog.returnValue === 'confirm') {
                const value = input.value.trim();
                resolve(value || null);
            } else resolve(null);
        };
        const onSubmit = (event) => {
            if (event.submitter?.value === 'cancel') return;
            if (!input.value.trim()) {
                event.preventDefault();
                input.focus();
            }
        };
        form?.addEventListener('submit', onSubmit);
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        try {
            dialog.showModal();
            requestAnimationFrame(() => input.focus());
        } catch {
            form?.removeEventListener('submit', onSubmit);
            dialog.removeEventListener('close', onClose);
            nameVersionInFlight = null;
            resolve(null);
        }
    });
    return nameVersionInFlight;
}
