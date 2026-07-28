import { isFolder, sortDriveEntries } from './drive.js';

const els = {};

export function bindUi() {
    els.app = document.getElementById('app');
    els.status = document.getElementById('status');
    els.viewTitle = document.getElementById('view-title');
    els.btnBack = document.getElementById('btn-back');
    els.btnUp = document.getElementById('btn-up');
    els.btnSignIn = document.getElementById('btn-sign-in');
    els.btnSignOut = document.getElementById('btn-sign-out');
    els.btnSave = document.getElementById('btn-save');
    els.btnLoadMore = document.getElementById('btn-load-more');
    els.btnModeFolders = document.getElementById('btn-mode-folders');
    els.btnModeComputers = document.getElementById('btn-mode-computers');
    els.btnModeSearch = document.getElementById('btn-mode-search');
    els.searchForm = document.getElementById('search-form');
    els.searchInput = document.getElementById('search-input');
    els.configError = document.getElementById('config-error');
    els.viewLogin = document.getElementById('view-login');
    els.viewBrowse = document.getElementById('view-browse');
    els.viewEditor = document.getElementById('view-editor');
    els.folderPath = document.getElementById('folder-path');
    els.fileList = document.getElementById('file-list');
    els.browseEmpty = document.getElementById('browse-empty');
    els.fileName = document.getElementById('file-name');
    els.dirtyLabel = document.getElementById('dirty-label');
    els.editor = document.getElementById('editor');
    els.draftDialog = document.getElementById('draft-dialog');
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

export function showView(name) {
    els.viewLogin.hidden = name !== 'login';
    els.viewBrowse.hidden = name !== 'browse';
    els.viewEditor.hidden = name !== 'editor';

    els.btnSignOut.hidden = name === 'login';
    els.btnSave.hidden = name !== 'editor';
    els.btnBack.hidden = name !== 'editor';
    if (name !== 'browse') {
        els.btnUp.hidden = true;
    }

    if (name === 'login') {
        els.viewTitle.textContent = 'Markdown Editor';
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
    els.btnModeSearch.classList.toggle('is-active', isSearch);
    els.searchForm.hidden = !isSearch;
}

export function setBrowseEmptyMessage(message) {
    els.browseEmpty.textContent = message;
}

export function renderFileList(files, { onOpen }) {
    els.fileList.replaceChildren();
    const sorted = sortDriveEntries(files || []);
    els.browseEmpty.hidden = sorted.length > 0;

    for (const file of sorted) {
        const folder = isFolder(file);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = folder ? 'file-row file-row--folder' : 'file-row file-row--markdown';
        btn.setAttribute('role', 'listitem');

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

        btn.append(icon, name, meta);
        btn.addEventListener('click', () => onOpen(file));
        els.fileList.appendChild(btn);
    }
}

export function setLoadMoreVisible(visible) {
    els.btnLoadMore.hidden = !visible;
}

export function setUpEnabled(enabled) {
    els.btnUp.hidden = !enabled;
    els.btnUp.disabled = !enabled;
}

export function syncEditorChrome(state) {
    els.fileName.textContent = state.fileName || '';
    els.viewTitle.textContent = state.fileName || 'Editor';
    els.dirtyLabel.hidden = !state.dirty;
    els.btnSave.disabled = state.status === 'saving' || !state.dirty;

    if (els.editor.value !== state.editorContent) {
        els.editor.value = state.editorContent;
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
