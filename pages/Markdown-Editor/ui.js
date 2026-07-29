import { isFolder, sortDriveEntries } from './drive.js';

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
    els.editorActive = document.getElementById('editor-active');
    els.folderPath = document.getElementById('folder-path');
    els.fileList = document.getElementById('file-list');
    els.browseEmpty = document.getElementById('browse-empty');
    els.fileName = document.getElementById('file-name');
    els.dirtyLabel = document.getElementById('dirty-label');
    els.editor = document.getElementById('editor');
    els.draftDialog = document.getElementById('draft-dialog');
    els.nameDialog = document.getElementById('name-dialog');
    els.nameForm = document.getElementById('name-form');
    els.nameDialogTitle = document.getElementById('name-dialog-title');
    els.nameDialogHint = document.getElementById('name-dialog-hint');
    els.nameInput = document.getElementById('name-input');
    els.nameDialogConfirm = document.getElementById('name-dialog-confirm');
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
    if (!els.navBar || els.navBar.hidden) {
        els.app.style.removeProperty('--nav-offset');
        els.app.classList.remove('nav-has-actions');
        return;
    }
    const hasActions = Boolean(els.navActions && !els.navActions.hidden);
    els.app.classList.toggle('nav-has-actions', hasActions);
    // Measure after paint so hidden→shown height is accurate.
    requestAnimationFrame(() => {
        const height = els.navBar.getBoundingClientRect().height;
        els.app.style.setProperty('--nav-offset', `${Math.ceil(height)}px`);
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
        els.viewTitle.textContent = 'Markdown Editor';
        syncNavLayout();
        return;
    }

    els.navBar.hidden = false;
    setActiveTab(name);
    syncNavActions(name, { hasOpenFile });

    if (name === 'finder') {
        els.viewTitle.textContent = 'Finder';
    } else if (name === 'settings') {
        els.viewTitle.textContent = 'Settings';
        setStatus('');
    } else if (name === 'editor') {
        els.editorEmpty.hidden = hasOpenFile;
        els.editorActive.hidden = !hasOpenFile;
        els.btnSave.hidden = !hasOpenFile;
        if (!hasOpenFile) {
            els.viewTitle.textContent = 'Edit';
            setStatus('Open a file from Finder');
        }
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

export function renderFolderPath(stack, mode = 'folder', searchQuery = '') {
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
    els.folderPath.textContent = stack.map((f) => f.name).join(' / ');
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

export function renderFileList(files, { onOpen, onRename }) {
    els.fileList.replaceChildren();
    const sorted = sortDriveEntries(files || []);
    els.browseEmpty.hidden = sorted.length > 0;

    for (const file of sorted) {
        const folder = isFolder(file);
        const row = document.createElement('div');
        row.className = folder ? 'file-row file-row--folder' : 'file-row file-row--markdown';
        row.setAttribute('role', 'listitem');

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'file-row-main';
        openBtn.setAttribute('aria-label', folder ? `Open folder ${file.name || ''}` : `Open ${file.name || ''}`);

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

        const meta = document.createElement('span');
        meta.className = 'file-row-meta';
        meta.textContent = folder ? 'Folder' : 'Markdown';

        openBtn.append(icon, name, meta);
        openBtn.addEventListener('click', () => onOpen(file));

        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'btn btn-ghost btn-small file-row-rename';
        renameBtn.textContent = 'Rename';
        renameBtn.setAttribute('aria-label', `Rename ${file.name || 'item'}`);
        renameBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (typeof onRename === 'function') onRename(file);
        });

        row.append(openBtn, renameBtn);
        els.fileList.appendChild(row);
    }
}

export function setLoadMoreVisible(visible) {
    els.btnLoadMore.hidden = !visible;
}

export function setUpEnabled(enabled) {
    els.btnUp.hidden = !enabled;
    els.btnUp.disabled = !enabled;
    syncNavLayout();
}

export function syncEditorChrome(state) {
    els.fileName.textContent = state.fileName || '';
    if (state.fileId) {
        if (!els.viewEditor.hidden) {
            els.viewTitle.textContent = state.fileName || 'Editor';
            syncNavActions('editor', { hasOpenFile: true });
        }
        els.editorEmpty.hidden = true;
        els.editorActive.hidden = false;
        els.btnSave.hidden = false;
    }
    els.dirtyLabel.hidden = !state.dirty;
    els.btnSave.disabled = state.status === 'saving' || !state.dirty;
    els.btnRenameCurrent.hidden = !state.fileId;
    els.btnRenameCurrent.disabled = state.status === 'saving';

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

export function confirmLeaveUnsaved() {
    return window.confirm('You have unsaved changes. Discard them?');
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
