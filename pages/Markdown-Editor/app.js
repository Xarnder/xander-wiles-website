import {
    isConfigured,
    LAST_FOLDER_KEY,
    LARGE_FILE_BYTES,
    ROOT_FOLDER_ID,
    ROOT_FOLDER_NAME,
} from './config.js';
import {
    clearToken,
    isSignedIn,
    requestAccessToken,
} from './auth.js';
import {
    createFolder,
    createMarkdownFile,
    getFileContent,
    getFileMetadata,
    isFolder,
    listComputerRootFolders,
    listFolder,
    renameDriveItem,
    searchMarkdownFiles,
    updateFileContent,
} from './drive.js';
import {
    applyLoadedContent,
    clearDraft,
    createEditorState,
    markError,
    markSaved,
    markSaving,
    promptRestoreDraft,
    readDraft,
    setEditorText,
} from './editor.js';
import {
    bindUi,
    confirmLeaveUnsaved,
    getEls,
    promptForName,
    renderFileList,
    renderFolderPath,
    setBrowseEmptyMessage,
    setBrowseModeUi,
    setConfigError,
    setCreateActionsVisible,
    setLoadMoreVisible,
    setStatus,
    setUpEnabled,
    showView,
    syncEditorChrome,
    syncNavLayout,
} from './ui.js';

const COMPUTERS_ROOT = { id: '__computers__', name: 'Computers' };

const state = {
    browseMode: 'folder', // 'folder' | 'search' | 'computers'
    searchQuery: '',
    folderStack: [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }],
    files: [],
    nextPageToken: null,
    loadingFolder: false,
    editor: createEditorState(),
};

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

function renderCurrentFileList() {
    renderFileList(state.files, {
        onOpen: handleOpenEntry,
        onRename: handleRenameEntry,
    });
}

async function loadBrowse(reset = true) {
    const folder = currentFolder();
    state.loadingFolder = true;
    setBrowseModeUi('folder');
    setStatus('Loading folder…');
    setUpEnabled(state.folderStack.length > 1);
    renderFolderPath(state.folderStack, 'folder');
    rememberFolder(folder.id);
    updateCreateActions();
    setBrowseEmptyMessage(
        'No folders or markdown files here yet. Tap + Note or + Folder to create one.'
    );

    try {
        const pageToken = reset ? null : state.nextPageToken;
        const result = await listFolder(folder.id, pageToken);
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList();
        setLoadMoreVisible(Boolean(state.nextPageToken));
        setStatus(state.files.length ? '' : 'This folder is empty — create a note or folder.');
    } catch (err) {
        setStatus(err.message || 'Failed to list folder', 'error');
    } finally {
        state.loadingFolder = false;
    }
}

async function loadSearch(reset = true) {
    state.loadingFolder = true;
    setBrowseModeUi('search');
    setUpEnabled(false);
    updateCreateActions();
    renderFolderPath([], 'search', state.searchQuery);
    setStatus('Searching Drive for markdown…');
    setBrowseEmptyMessage(
        'No markdown files found for this Google account. Check you signed in with the same account as Google Drive for Desktop, and that .md files finished uploading to the cloud.'
    );

    try {
        const pageToken = reset ? null : state.nextPageToken;
        const result = await searchMarkdownFiles(state.searchQuery, pageToken);
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList();
        setLoadMoreVisible(Boolean(state.nextPageToken));
        setStatus(
            state.files.length
                ? `Found ${state.files.length}${state.nextPageToken ? '+' : ''} markdown file(s).`
                : 'No markdown files found.'
        );
    } catch (err) {
        setStatus(err.message || 'Search failed', 'error');
    } finally {
        state.loadingFolder = false;
    }
}

async function loadComputers(reset = true) {
    state.loadingFolder = true;
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
            renderFolderPath(state.folderStack, 'computers');
            setStatus('Looking for Computers folders…');
            const computers = await listComputerRootFolders();
            state.files = computers;
            state.nextPageToken = null;
            renderCurrentFileList();
            setLoadMoreVisible(false);
            setStatus(
                computers.length
                    ? `Found ${computers.length} possible computer folder(s). Open one to browse.`
                    : 'Could not list Computers via API.'
            );
            return;
        }

        const folder = currentFolder();
        setUpEnabled(true);
        renderFolderPath(state.folderStack, 'computers');
        setStatus('Loading folder…');
        const pageToken = reset ? null : state.nextPageToken;
        const result = await listFolder(folder.id, pageToken);
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList();
        setLoadMoreVisible(Boolean(state.nextPageToken));
        setStatus(state.files.length ? '' : 'No folders or markdown files here.');
    } catch (err) {
        setStatus(err.message || 'Failed to load Computers', 'error');
    } finally {
        state.loadingFolder = false;
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

async function handleRenameEntry(file) {
    const folder = isFolder(file);
    const name = await promptForName({
        title: folder ? 'Rename folder' : 'Rename note',
        hint: folder ? 'Folder name' : 'We’ll keep the .md ending for notes.',
        confirmLabel: 'Rename',
        initialValue: file.name || '',
        selectStem: !folder,
    });
    if (!name || name === file.name) return;

    setStatus('Renaming…');
    try {
        const updated = await renameDriveItem(file.id, name, { isMarkdown: !folder });
        const idx = state.files.findIndex((f) => f.id === file.id);
        if (idx >= 0) {
            state.files[idx] = { ...state.files[idx], name: updated.name };
            renderCurrentFileList();
        }
        if (state.editor.fileId === file.id) {
            state.editor.fileName = updated.name;
            syncEditorChrome(state.editor);
        }
        // Keep folder stack labels in sync if renaming current path folder
        for (const frame of state.folderStack) {
            if (frame.id === file.id) frame.name = updated.name;
        }
        if (state.browseMode !== 'search') {
            renderFolderPath(
                state.folderStack,
                state.browseMode === 'computers' ? 'computers' : 'folder',
                state.searchQuery
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
        hint: 'Name your markdown file. .md is added automatically if missing.',
        confirmLabel: 'Create',
        initialValue: 'Untitled.md',
        selectStem: true,
    });
    if (!name) return;

    setStatus('Creating note…');
    try {
        const created = await createMarkdownFile(parent.id, name, `# ${name.replace(/\.md$/i, '')}\n\n`);
        setStatus(`Created ${created.name}`, 'ok');
        await openMarkdownFile(created);
    } catch (err) {
        setStatus(err.message || 'Could not create note', 'error');
    }
}

async function handleCreateFolder() {
    if (!canCreateInCurrentLocation()) return;
    const parent = currentFolder();
    const name = await promptForName({
        title: 'New folder',
        hint: 'Created inside the folder you’re viewing now.',
        confirmLabel: 'Create',
        initialValue: 'New folder',
    });
    if (!name) return;

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

function hasOpenFile() {
    return Boolean(state.editor.fileId);
}

function showAppView(name) {
    showView(name, { hasOpenFile: hasOpenFile() });
}

async function openMarkdownFile(file) {
    const els = getEls();
    showAppView('editor');
    state.editor.status = 'loading';
    syncEditorChrome(state.editor);
    setStatus('Opening file…');

    try {
        const meta = await getFileMetadata(file.id);
        const size = Number(meta.size || 0);
        if (size > LARGE_FILE_BYTES) {
            const ok = window.confirm(
                `This file is about ${Math.round(size / 1024 / 1024)} MB. Opening large files may be slow on iPhone. Continue?`
            );
            if (!ok) {
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
        });

        const draft = readDraft(meta.id);
        if (draft && draft.text !== content) {
            const choice = await promptRestoreDraft(els.draftDialog);
            if (choice === 'restore') {
                setEditorText(state.editor, draft.text);
            } else {
                clearDraft(meta.id);
            }
        }

        els.editor.value = state.editor.editorContent;
        showAppView('editor');
        syncEditorChrome(state.editor);
        els.editor.focus();
    } catch (err) {
        markError(state.editor, err.message || 'Failed to open file');
        syncEditorChrome(state.editor);
        setStatus(state.editor.errorMessage, 'error');
    }
}

async function saveCurrentFile() {
    const ed = state.editor;
    if (!ed.fileId || !ed.dirty) return;

    markSaving(ed);
    syncEditorChrome(ed);

    try {
        await updateFileContent(ed.fileId, ed.editorContent, ed.mimeType || 'text/markdown');
        markSaved(ed);
        syncEditorChrome(ed);
    } catch (err) {
        markError(ed, err.message || 'Save failed');
        ed.dirty = ed.editorContent !== ed.originalContent;
        if (ed.dirty) ed.status = 'error';
        syncEditorChrome(ed);
        setStatus(ed.errorMessage, 'error');
    }
}

/**
 * Switch app mode tabs. Open files stay in memory across Finder / Edit / Settings.
 * @param {'finder' | 'editor' | 'settings'} mode
 */
async function switchAppMode(mode) {
    if (mode === 'editor') {
        showAppView('editor');
        if (hasOpenFile()) syncEditorChrome(state.editor);
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

function signOut() {
    if (state.editor.dirty && !confirmLeaveUnsaved()) return;
    clearToken();
    state.editor = createEditorState();
    state.files = [];
    state.browseMode = 'folder';
    state.searchQuery = '';
    state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
    showView('login');
    setStatus('Signed out');
}

async function afterSignedIn() {
    showAppView('finder');
    setStatus('');
    state.browseMode = 'folder';

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

    els.tabFinder.addEventListener('click', () => {
        switchAppMode('finder');
    });
    els.tabEditor.addEventListener('click', () => {
        switchAppMode('editor');
    });
    els.tabSettings.addEventListener('click', () => {
        switchAppMode('settings');
    });
    els.btnGoFinder.addEventListener('click', () => {
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
    els.btnRenameCurrent.addEventListener('click', () => {
        handleRenameCurrentFile();
    });
    els.searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        state.browseMode = 'search';
        state.searchQuery = els.searchInput.value || '';
        loadSearch(true);
    });
    els.nameForm.addEventListener('submit', (event) => {
        // Let method="dialog" close; block empty confirm
        const submitter = event.submitter;
        if (submitter && submitter.value === 'confirm' && !els.nameInput.value.trim()) {
            event.preventDefault();
            els.nameInput.focus();
        }
    });

    els.editor.addEventListener('input', () => {
        setEditorText(state.editor, els.editor.value);
        syncEditorChrome(state.editor);
    });

    window.addEventListener('beforeunload', (event) => {
        if (state.editor.dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && state.editor.dirty && state.editor.fileId) {
            setEditorText(state.editor, els.editor.value);
        }
    });

    window.addEventListener('resize', () => {
        syncNavLayout();
    });
}

async function boot() {
    bindUi();
    wireEvents();
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
    setStatus('Sign in to continue');
}

boot();
