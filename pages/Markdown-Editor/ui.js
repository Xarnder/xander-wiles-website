import { isFolder, isMarkdownCandidate, sortDriveEntries } from './drive.js';
import { ROOT_FOLDER_ID, ROOT_FOLDER_NAME } from './config.js';

const els = {};

export function bindUi() {
    els.app = document.getElementById('app');
    els.status = document.getElementById('status');
    els.viewTitle = document.getElementById('view-title');
    els.navBar = document.getElementById('nav-bar');
    els.navActions = document.getElementById('nav-actions');
    els.navActionsFinder = document.getElementById('nav-actions-finder');
    els.navActionsEditor = document.getElementById('nav-actions-editor');
    els.tabFinder = document.getElementById('tab-finder');
    els.tabEditor = document.getElementById('tab-editor');
    els.tabSettings = document.getElementById('tab-settings');
    els.btnUp = document.getElementById('btn-up');
    els.finderPathBar = document.getElementById('finder-path-bar');
    els.folderPath = document.getElementById('folder-path');
    els.btnSignIn = document.getElementById('btn-sign-in');
    els.btnSignOut = document.getElementById('btn-sign-out');
    els.btnSave = document.getElementById('btn-save');
    els.btnLoadMore = document.getElementById('btn-load-more');
    els.btnModeFolders = document.getElementById('btn-mode-folders');
    els.btnModeComputers = document.getElementById('btn-mode-computers');
    els.btnModeSearch = document.getElementById('btn-mode-search');
    els.btnNewNote = document.getElementById('btn-new-note');
    els.btnNewFolder = document.getElementById('btn-new-folder');
    els.btnRenameCurrent = document.getElementById('btn-rename-current');
    els.btnInsertList = document.getElementById('btn-insert-list');
    els.btnGoFinder = document.getElementById('btn-go-finder');
    els.createActions = document.getElementById('create-actions');
    els.searchForm = document.getElementById('search-form');
    els.searchInput = document.getElementById('search-input');
    els.configError = document.getElementById('config-error');
    els.viewLogin = document.getElementById('view-login');
    els.viewFinder = document.getElementById('view-finder');
    els.viewEditor = document.getElementById('view-editor');
    els.viewSettings = document.getElementById('view-settings');
    els.editorEmpty = document.getElementById('editor-empty');
    els.editorLoading = document.getElementById('editor-loading');
    els.loadingFileName = document.getElementById('loading-file-name');
    els.editorActive = document.getElementById('editor-active');
    els.prefMdOrderMobile = document.getElementById('pref-md-order-mobile');
    els.prefMdOrderDesktop = document.getElementById('pref-md-order-desktop');
    els.prefTheme = document.getElementById('pref-theme');
    els.fileList = document.getElementById('file-list');
    els.browseEmpty = document.getElementById('browse-empty');
    els.fileName = document.getElementById('file-name');
    els.dirtyLabel = document.getElementById('dirty-label');
    els.editor = document.getElementById('editor');
    els.viewModeBar = document.getElementById('view-mode-bar');
    els.modeList = document.getElementById('mode-list');
    els.modePreview = document.getElementById('mode-preview');
    els.modeRaw = document.getElementById('mode-raw');
    els.listsRoot = document.getElementById('lists-root');
    els.listsStatus = document.getElementById('lists-status');
    els.markdownPreview = document.getElementById('markdown-preview');
    els.draftDialog = document.getElementById('draft-dialog');
    els.unsavedDialog = document.getElementById('unsaved-dialog');
    els.itemActionsDialog = document.getElementById('item-actions-dialog');
    els.itemActionsTitle = document.getElementById('item-actions-title');
    els.itemActionsName = document.getElementById('item-actions-name');
    els.itemActionDownload = document.getElementById('item-action-download');
    els.moveDialog = document.getElementById('move-dialog');
    els.moveDialogTitle = document.getElementById('move-dialog-title');
    els.moveDialogHint = document.getElementById('move-dialog-hint');
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
    els.nameInput = document.getElementById('name-input');
    els.nameDialogConfirm = document.getElementById('name-dialog-confirm');
    els.deleteListDialog = document.getElementById('delete-list-dialog');
    els.deleteListDialogName = document.getElementById('delete-list-dialog-name');
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

function setActiveTab(mode) {
    const tabs = [
        [els.tabFinder, 'finder'],
        [els.tabEditor, 'editor'],
        [els.tabSettings, 'settings'],
    ];
    for (const [tab, name] of tabs) {
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
        const height = els.navBar.getBoundingClientRect().height;
        els.app.style.setProperty('--nav-offset', `${Math.ceil(height)}px`);

        const mobile = window.matchMedia('(max-width: 767.98px)').matches;
        const pathVisible = Boolean(els.finderPathBar && !els.finderPathBar.hidden);
        if (mobile && pathVisible) {
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
 * @param {'login' | 'finder' | 'editor' | 'settings'} mode
 * @param {{ hasOpenFile?: boolean }} [options]
 */
function syncNavActions(mode, options = {}) {
    const hasOpenFile = Boolean(options.hasOpenFile);
    const showFinder = mode === 'finder';
    const showEditor = mode === 'editor' && hasOpenFile;

    if (els.navActionsFinder) els.navActionsFinder.hidden = !showFinder;
    if (els.navActionsEditor) els.navActionsEditor.hidden = !showEditor;

    if (els.navActions) {
        els.navActions.hidden = !(showFinder || showEditor);
    }

    syncNavLayout();
}

/**
 * @param {'login' | 'finder' | 'editor' | 'settings'} name
 * @param {{ hasOpenFile?: boolean }} [options]
 */
export function showView(name, options = {}) {
    const hasOpenFile = Boolean(options.hasOpenFile);

    els.viewLogin.hidden = name !== 'login';
    els.viewFinder.hidden = name !== 'finder';
    els.viewEditor.hidden = name !== 'editor';
    els.viewSettings.hidden = name !== 'settings';

    if (name === 'login') {
        els.navBar.hidden = true;
        if (els.navActions) els.navActions.hidden = true;
        if (els.navActionsFinder) els.navActionsFinder.hidden = true;
        if (els.navActionsEditor) els.navActionsEditor.hidden = true;
        if (els.finderPathBar) els.finderPathBar.hidden = true;
        els.viewTitle.textContent = 'Markdown Editor';
        syncNavLayout();
        return;
    }

    els.navBar.hidden = false;
    setActiveTab(name);
    syncNavActions(name, { hasOpenFile });
    if (els.finderPathBar) els.finderPathBar.hidden = name !== 'finder';
    syncNavLayout();

    if (name === 'finder') {
        els.viewTitle.textContent = 'Finder';
    } else if (name === 'settings') {
        els.viewTitle.textContent = 'Settings';
        setStatus('');
    } else if (name === 'editor') {
        const loading = Boolean(options.loading);
        if (els.editorLoading) els.editorLoading.hidden = !loading;
        if (loading) {
            els.editorEmpty.hidden = true;
            els.editorActive.hidden = true;
            els.btnSave.hidden = true;
            if (els.btnInsertList) els.btnInsertList.hidden = true;
            els.viewTitle.textContent = 'Opening…';
        } else {
            els.editorEmpty.hidden = hasOpenFile;
            els.editorActive.hidden = !hasOpenFile;
            els.btnSave.hidden = !hasOpenFile;
            if (!hasOpenFile) {
                els.viewTitle.textContent = 'Edit';
                setStatus('Open a file from Finder');
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
        els.loadingFileName.textContent = fileName || '';
        els.loadingFileName.hidden = !fileName;
    }
    if (loading) {
        els.editorEmpty.hidden = true;
        els.editorActive.hidden = true;
        els.viewTitle.textContent = 'Opening…';
        if (els.btnSave) els.btnSave.hidden = true;
        if (els.btnInsertList) els.btnInsertList.hidden = true;
        if (els.btnRenameCurrent) els.btnRenameCurrent.hidden = true;
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
    if (mode === 'computers' && (!stack.length || (stack.length === 1 && stack[0].id === '__computers__'))) {
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

export function renderFileList(files, { onOpen, onMenu, recent = [], scrollToMarkdown = false }) {
    els.fileList.replaceChildren();
    const sorted = sortDriveEntries(files || []);
    const recentFiles = Array.isArray(recent) ? recent.slice(0, 5) : [];
    els.browseEmpty.hidden = sorted.length > 0 || recentFiles.length > 0;

    if (recentFiles.length) {
        els.fileList.appendChild(
            buildFileGroup({
                kind: 'recent',
                title: 'Recent',
                files: recentFiles,
                onOpen,
                onMenu,
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
            })
        );
    }

    applyFinderLayoutPrefs();
    if (scrollToMarkdown && notes.length) {
        scrollFinderToMarkdownSection();
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

function buildFileGroup({ kind, title, files, onOpen, onMenu }) {
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

        const name = document.createElement('span');
        name.className = 'file-row-name';
        name.textContent = file.name || '(unnamed)';

        openBtn.append(icon, name);
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
    els.btnLoadMore.hidden = !visible;
}

export function setUpEnabled(enabled) {
    if (!els.btnUp) return;
    els.btnUp.hidden = !enabled;
    els.btnUp.disabled = !enabled;
}

export function syncEditorChrome(state) {
    els.fileName.textContent = state.fileName || '';
    if (state.status === 'loading') {
        setEditorLoading(true, state.fileName || '');
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
            els.viewTitle.textContent = state.fileName || 'Editor';
            syncNavActions('editor', { hasOpenFile: true });
        }
        els.editorEmpty.hidden = true;
        els.editorActive.hidden = false;
        els.btnSave.hidden = false;
        if (els.btnInsertList) els.btnInsertList.hidden = false;
    } else if (els.btnInsertList) {
        els.btnInsertList.hidden = true;
    }
    els.dirtyLabel.hidden = !state.dirty;
    els.btnSave.disabled = state.status === 'saving' || !state.dirty;
    els.btnSave.classList.toggle('is-flashing', Boolean(state.dirty && state.fileId && state.status !== 'saving'));
    els.btnRenameCurrent.hidden = !state.fileId;
    els.btnRenameCurrent.disabled = state.status === 'saving';
    if (els.btnInsertList) els.btnInsertList.disabled = state.status === 'saving' || !state.fileId;

    if (els.tabEditor) {
        els.tabEditor.classList.toggle('has-dirty', Boolean(state.dirty && state.fileId));
        const label = els.tabEditor.querySelector('.nav-tab-label');
        if (label) label.textContent = state.dirty && state.fileId ? 'Edit •' : 'Edit';
    }

    if (els.editor.value !== state.editorContent) {
        els.editor.value = state.editorContent;
    }

    if (els.viewEditor.hidden) {
        return;
    }

    if (state.status === 'saving') {
        setStatus('Saving…');
    } else if (state.status === 'saved' && !state.dirty) {
        setStatus('Saved', 'ok');
    } else if (state.status === 'dirty') {
        setStatus('Unsaved changes', 'warn');
    } else if (state.status === 'error') {
        setStatus(state.errorMessage || 'Error', 'error');
    } else if (state.status === 'loading') {
        setStatus('Loading…');
    } else {
        setStatus('');
    }
}

export function setViewModeUi(mode) {
    if (!els.viewModeBar) return;
    const buttons = [
        [els.modeList, 'list'],
        [els.modePreview, 'preview'],
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
 * @param {'list' | 'preview' | 'raw'} mode
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

    const structured = mode === 'list' || mode === 'preview';
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

export function confirmLeaveUnsaved() {
    return window.confirm('You have unsaved changes. Discard them?');
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
 * Action sheet for a Finder row.
 * @param {object} file
 * @returns {Promise<'rename'|'move'|'download'|null>}
 */
export function promptItemActions(file) {
    const dialog = els.itemActionsDialog;
    if (!dialog) return Promise.resolve(null);

    const folder = isFolder(file);
    const canDownload = !folder && isMarkdownCandidate(file);
    if (els.itemActionsTitle) {
        els.itemActionsTitle.textContent = folder ? 'Folder actions' : 'Markdown actions';
    }
    if (els.itemActionsName) {
        els.itemActionsName.textContent = file.name || '(unnamed)';
        els.itemActionsName.hidden = !file.name;
    }
    if (els.itemActionDownload) els.itemActionDownload.hidden = !canDownload;

    return new Promise((resolve) => {
        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            const value = dialog.returnValue;
            if (value === 'rename' || value === 'move' || value === 'download') resolve(value);
            else resolve(null);
        };
        dialog.addEventListener('close', onClose);
        dialog.returnValue = 'cancel';
        dialog.showModal();
    });
}

/**
 * Folder picker for Move.
 * @param {{ item: object, currentParentId: string, listFolders: (parentId: string) => Promise<object[]> }} options
 * @returns {Promise<{ folderId: string, folderName: string }|null>}
 */
export function promptMoveDestination(options) {
    const { item, currentParentId, listFolders } = options;
    const dialog = els.moveDialog;
    if (!dialog || typeof listFolders !== 'function') return Promise.resolve(null);

    const movingFolder = isFolder(item);
    const stack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
    let loading = false;

    if (els.moveDialogTitle) {
        els.moveDialogTitle.textContent = `Move “${item.name || 'item'}”`;
    }
    if (els.moveDialogHint) {
        els.moveDialogHint.textContent = movingFolder
            ? 'Open a folder or choose Move here. You can’t move a folder into itself.'
            : 'Open a folder or choose Move here.';
    }

    const current = () => stack[stack.length - 1];

    const syncChrome = () => {
        const atRoot = stack.length <= 1;
        if (els.moveBtnUp) {
            els.moveBtnUp.hidden = atRoot;
            els.moveBtnUp.disabled = atRoot || loading;
        }
        if (els.moveFolderPath) {
            els.moveFolderPath.textContent = stack.map((f) => f.name).join(' / ');
        }
        const sameParent = current().id === currentParentId;
        if (els.moveBtnHere) {
            els.moveBtnHere.disabled = loading || sameParent;
            els.moveBtnHere.title = sameParent ? 'Already in this folder' : 'Move here';
        }
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
            const loadingRow = document.createElement('p');
            loadingRow.className = 'move-loading';
            loadingRow.textContent = 'Loading folders…';
            els.moveFolderList.appendChild(loadingRow);
        }
        if (els.moveEmpty) els.moveEmpty.hidden = true;
        try {
            const folders = await listFolders(current().id);
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

    return new Promise((resolve) => {
        const cleanup = () => {
            if (els.moveBtnCancel) els.moveBtnCancel.removeEventListener('click', onCancel);
            if (els.moveBtnHere) els.moveBtnHere.removeEventListener('click', onConfirm);
            if (els.moveBtnUp) els.moveBtnUp.removeEventListener('click', onUp);
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
            finish({ folderId: current().id, folderName: current().name });
        };

        const onUp = () => {
            if (stack.length <= 1 || loading) return;
            stack.pop();
            load();
        };

        if (els.moveBtnCancel) els.moveBtnCancel.addEventListener('click', onCancel);
        if (els.moveBtnHere) els.moveBtnHere.addEventListener('click', onConfirm);
        if (els.moveBtnUp) els.moveBtnUp.addEventListener('click', onUp);
        dialog.addEventListener('cancel', onCancel);

        dialog.showModal();
        load();
    });
}

/**
 * Prompt for a name. Returns trimmed string or null if cancelled.
 * @param {{ title: string, hint?: string, confirmLabel?: string, initialValue?: string, selectStem?: boolean }} options
 */
export function promptForName(options) {
    const {
        title,
        hint = '',
        confirmLabel = 'Save',
        initialValue = '',
        selectStem = false,
    } = options;

    return new Promise((resolve) => {
        els.nameDialogTitle.textContent = title;
        els.nameDialogHint.textContent = hint;
        els.nameDialogHint.hidden = !hint;
        els.nameDialogConfirm.textContent = confirmLabel;
        els.nameInput.value = initialValue;

        const onClose = () => {
            els.nameDialog.removeEventListener('close', onClose);
            if (els.nameDialog.returnValue === 'confirm') {
                const value = els.nameInput.value.trim();
                resolve(value || null);
            } else {
                resolve(null);
            }
        };

        els.nameDialog.addEventListener('close', onClose);
        els.nameDialog.returnValue = 'cancel';
        els.nameDialog.showModal();
        requestAnimationFrame(() => {
            els.nameInput.focus();
            if (selectStem && initialValue.toLowerCase().endsWith('.md')) {
                els.nameInput.setSelectionRange(0, initialValue.length - 3);
            } else {
                els.nameInput.select();
            }
        });
    });
}
