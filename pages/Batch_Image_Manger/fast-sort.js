(function (root) {
    'use strict';

    const KEYS = '1234567890qwertyuiopasdfghjklzxcvbnm';
    const ROOT = '(Root)';
    const sameList = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
    const folderKey = name => name.toLowerCase();

    function validateFolderName(value) {
        const name = value.trim();
        if (!name || name.length > 200 || name.split('/').some(part =>
            !part || part !== part.trim() || part === '.' || part === '..' ||
            part.toLowerCase() === ROOT.toLowerCase() || /[\\<>:"|?*\x00-\x1f]/.test(part) ||
            /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) {
            throw new Error('Enter a valid folder name. Use / for subfolders; avoid empty segments, . or .., reserved names, and characters such as \\ : ? * .');
        }
        return name;
    }

    // ZIP entries with the same path otherwise silently replace one another.
    function uniquePath(folder, filename, usedPaths) {
        const prefix = folder && folder !== ROOT ? `${folder}/` : '';
        const dot = filename.lastIndexOf('.');
        const stem = dot > 0 ? filename.slice(0, dot) : filename;
        const extension = dot > 0 ? filename.slice(dot) : '';
        let path = prefix + filename;
        let suffix = 2;
        while (usedPaths.has(path.toLowerCase())) {
            path = `${prefix}${stem} (${suffix++})${extension}`;
        }
        usedPaths.add(path.toLowerCase());
        return path;
    }

    function shortcutIndex(event) {
        if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return -1;
        const physical = /^(Digit[0-9]|Key[A-Z])$/.test(event.code || '')
            ? event.code.replace(/^(Digit|Key)/, '').toLowerCase()
            : (event.key || '').toLowerCase();
        return physical.length === 1 ? KEYS.indexOf(physical) : -1;
    }

    class Session {
        constructor() {
            this.files = [];
            this.folders = [];
            this.availableFolders = [ROOT];
            this.destinations = [];
            this.restart();
        }

        sync({ files, folders, availableFolders }) {
            if (!sameList(files, this.files) || !sameList(folders, this.folders)) {
                this.restart();
            }
            if (!sameList(files, this.files)) this.destinations = [];
            this.files = [...files];
            this.folders = [...folders];
            this.availableFolders = [...new Set([ROOT, ...availableFolders, ...folders])];
            // Retain the key order across renaming, alphabetic dropdown sorting, and reopening.
            this.destinations = this.destinations.filter(name => this.availableFolders.includes(name));
            for (const name of this.availableFolders) {
                if (name !== ROOT && !this.destinations.includes(name)) this.destinations.push(name);
            }
        }

        restart() {
            this.cursor = 0;
            this.history = [];
            this.started = false;
        }

        get complete() { return this.cursor >= this.files.length; }

        addFolder(value) {
            const name = validateFolderName(value);
            if (this.availableFolders.some(folder => folderKey(folder) === folderKey(name))) {
                throw new Error('A folder with that name already exists. Choose another name.');
            }
            this.availableFolders.push(name);
            this.destinations.push(name);
            return name;
        }

        renameFolder(oldName, value) {
            const name = validateFolderName(value);
            if (oldName === ROOT || !this.availableFolders.includes(oldName)) throw new Error('Choose a subfolder to rename.');
            if (name === oldName) return name;
            if (folderKey(name).startsWith(`${folderKey(oldName)}/`)) throw new Error('A folder cannot be moved inside itself.');
            const remap = folder => folder === oldName ? name : folder.startsWith(`${oldName}/`) ? name + folder.slice(oldName.length) : folder;
            const renamed = this.availableFolders.map(remap);
            // Include implicit parent paths when checking for an accidental merge.
            const occupied = new Set();
            this.availableFolders.filter(folder => remap(folder) === folder).forEach(folder => {
                const parts = folder.split('/');
                for (let i = 1; i <= parts.length; i++) occupied.add(folderKey(parts.slice(0, i).join('/')));
            });
            if (occupied.has(folderKey(name)) || new Set(renamed.map(folderKey)).size !== renamed.length) {
                throw new Error('That destination already exists. Choose another name to keep folders separate.');
            }
            this.availableFolders = renamed;
            this.destinations = this.destinations.map(remap);
            this.folders = this.folders.map(remap);
            this.history.forEach(action => { action.previousFolder = remap(action.previousFolder); });
            return name;
        }

        advance(folder) {
            if (!this.started || this.complete) return false;
            if (folder !== undefined && !this.destinations.includes(folder)) return false;
            this.history.push({ index: this.cursor, previousFolder: this.folders[this.cursor], skipped: folder === undefined });
            if (folder !== undefined) this.folders[this.cursor] = folder;
            this.cursor++;
            return true;
        }

        undo() {
            const action = this.history.pop();
            if (!action) return false;
            this.cursor = action.index;
            this.folders[action.index] = action.previousFolder;
            return true;
        }
    }

    function mount({ getState, onChange, onClose, preparePreview, download }) {
        const get = id => document.getElementById(id);
        const popup = get('sort-popup');
        const card = popup.querySelector('[role="dialog"]');
        const session = new Session();
        const photo = get('sort-image');
        const message = get('sort-image-message');
        const input = get('sort-folder-name');
        let editing = true;
        let renaming = null;
        let ready = false;
        let busy = false;
        let previewToken = 0;
        let previewURL = null;
        let returnFocus = null;
        let backgroundElements = [];

        const isOpen = () => !popup.classList.contains('hidden');
        const notify = () => onChange({ folders: [...session.folders], availableFolders: [...session.availableFolders] });
        const canSort = () => session.started && !session.complete && !editing && !busy && ready;

        function status(text = '', error = false) {
            const element = get('sort-status');
            element.textContent = text;
            element.classList.toggle('hidden', !text);
            element.classList.toggle('sort-error', error);
        }

        function resetForm() {
            renaming = null;
            input.value = '';
            get('sort-folder-label').textContent = 'New subfolder';
            get('sort-save-folder-btn').textContent = 'Add folder';
            get('sort-cancel-rename-btn').classList.add('hidden');
        }

        function renderFolders() {
            const list = get('sort-destinations');
            list.replaceChildren();
            const counts = new Map();
            session.folders.forEach(folder => counts.set(folder, (counts.get(folder) || 0) + 1));
            session.destinations.forEach((folder, index) => {
                const item = document.createElement('div');
                item.className = 'sort-destination';
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'sort-folder-btn';
                button.disabled = !canSort();
                button.title = folder;
                const key = document.createElement('kbd');
                key.textContent = KEYS[index]?.toUpperCase() || 'Click';
                const name = document.createElement('span');
                name.className = 'sort-folder-title';
                name.textContent = folder;
                const count = document.createElement('span');
                count.className = 'sort-folder-count';
                count.textContent = String(counts.get(folder) || 0);
                button.append(key, name, count);
                button.addEventListener('click', () => assign(folder));
                item.append(button);
                if (editing) {
                    const rename = document.createElement('button');
                    rename.type = 'button';
                    rename.className = 'sort-rename-btn';
                    rename.textContent = 'Rename';
                    rename.setAttribute('aria-label', `Rename ${folder}`);
                    rename.disabled = busy;
                    rename.addEventListener('click', () => {
                        renaming = folder;
                        input.value = folder;
                        get('sort-folder-label').textContent = `Rename ${folder}`;
                        get('sort-save-folder-btn').textContent = 'Save name';
                        get('sort-cancel-rename-btn').classList.remove('hidden');
                        status();
                        input.focus();
                        input.select();
                    });
                    item.append(rename);
                }
                list.append(item);
            });
            if (!session.destinations.length) {
                const empty = document.createElement('p');
                empty.className = 'sort-help';
                empty.textContent = 'Add at least one destination folder to start.';
                list.append(empty);
            }
        }

        function render() {
            const sorted = session.history.filter(action => !action.skipped).length;
            const skipped = session.history.length - sorted;
            get('sort-progress').textContent = session.complete
                ? `All ${session.files.length} images reviewed · ${sorted} sorted · ${skipped} skipped`
                : `Image ${session.cursor + 1} of ${session.files.length} · ${sorted} sorted · ${skipped} skipped`;
            get('sort-folder-panel').classList.toggle('hidden', !editing);
            get('sort-manage-btn').classList.toggle('hidden', editing);
            get('sort-manage-btn').disabled = busy;
            get('sort-start-btn').textContent = session.started ? 'Resume sorting' : 'Start sorting';
            get('sort-start-btn').disabled = !session.destinations.length || busy;
            get('sort-save-folder-btn').disabled = busy;
            input.disabled = busy;
            get('sort-undo-btn').disabled = !session.history.length || editing || busy;
            get('sort-skip-btn').disabled = !session.started || session.complete || editing || busy;
            get('sort-restart-btn').classList.toggle('hidden', !session.complete);
            get('sort-restart-btn').disabled = editing || busy;
            get('sort-download-btn').disabled = busy;
            get('sort-download-btn').textContent = busy ? 'Preparing download…' : session.files.length === 1 ? 'Download file' : 'Download sorted ZIP';
            get('sort-done-btn').disabled = busy;
            popup.querySelector('.popup-close-btn').disabled = busy;
            get('sort-filename').textContent = session.files[session.cursor]?.name || '';
            get('sort-current-folder').textContent = session.complete ? '' : `Current folder: ${session.folders[session.cursor]}`;
            renderFolders();
        }

        function clearPreview() {
            previewToken++;
            ready = false;
            photo.onload = null;
            photo.onerror = null;
            photo.classList.add('hidden');
            photo.removeAttribute('src');
            if (previewURL) URL.revokeObjectURL(previewURL);
            previewURL = null;
        }

        async function loadPreview() {
            clearPreview();
            const token = previewToken;
            message.classList.remove('hidden');
            if (session.complete) {
                message.textContent = `All done. Download your ${session.files.length === 1 ? 'file' : 'sorted ZIP'}, undo the last action, or review again.`;
                render();
                return;
            }
            message.textContent = 'Loading image…';
            render();
            try {
                const file = await preparePreview(session.files[session.cursor]);
                if (token !== previewToken || !isOpen()) return;
                previewURL = URL.createObjectURL(file);
                photo.alt = session.files[session.cursor].name;
                photo.onload = () => {
                    if (token !== previewToken) return;
                    ready = true;
                    message.classList.add('hidden');
                    photo.classList.remove('hidden');
                    render();
                };
                photo.onerror = () => {
                    if (token !== previewToken) return;
                    message.textContent = 'This image cannot be previewed. Skip it to continue; its file will still be included in the download.';
                    render();
                };
                photo.src = previewURL;
            } catch (error) {
                if (token !== previewToken) return;
                message.textContent = 'This image cannot be previewed. Skip it to continue.';
                status(error.message, true);
            }
        }

        function assign(folder) {
            if (!canSort()) return;
            const filename = session.files[session.cursor].name;
            if (!session.advance(folder)) return;
            notify();
            status(`${filename} → ${folder}`);
            card.focus({ preventScroll: true });
            loadPreview();
        }

        function skip() {
            if (!session.started || session.complete || editing || busy) return;
            session.advance();
            status('Skipped. The image keeps its current folder.');
            card.focus({ preventScroll: true });
            loadPreview();
        }

        function undo() {
            if (editing || busy || !session.undo()) return;
            notify();
            status('Last action undone.');
            card.focus({ preventScroll: true });
            loadPreview();
        }

        function close() {
            if (busy) return;
            popup.classList.add('hidden');
            document.body.classList.remove('popup-open');
            backgroundElements.forEach(([element, inert]) => { element.inert = inert; });
            backgroundElements = [];
            clearPreview();
            onClose();
            returnFocus?.focus({ preventScroll: true });
        }

        get('open-sort-modal-btn').addEventListener('click', () => {
            const state = getState();
            if (!state.files.length) return;
            session.sync(state);
            returnFocus = document.activeElement;
            editing = !session.started;
            resetForm();
            status();
            popup.classList.remove('hidden');
            document.body.classList.add('popup-open');
            backgroundElements = [...document.body.children]
                .filter(element => element !== popup && !['SCRIPT', 'STYLE'].includes(element.tagName))
                .map(element => [element, element.inert]);
            backgroundElements.forEach(([element]) => { element.inert = true; });
            loadPreview();
            card.focus();
        });
        popup.querySelector('.popup-close-btn').addEventListener('click', close);
        get('sort-done-btn').addEventListener('click', close);
        popup.addEventListener('click', event => { if (event.target === popup) close(); });
        get('sort-folder-form').addEventListener('submit', event => {
            event.preventDefault();
            if (busy) return;
            try {
                const wasRename = renaming !== null;
                const name = wasRename ? session.renameFolder(renaming, input.value) : session.addFolder(input.value);
                notify();
                resetForm();
                status(`${wasRename ? 'Renamed to' : 'Added'} ${name}.`);
                render();
                input.focus();
            } catch (error) {
                status(error.message, true);
                input.focus();
            }
        });
        get('sort-cancel-rename-btn').addEventListener('click', () => { resetForm(); input.focus(); });
        get('sort-start-btn').addEventListener('click', () => {
            if (!session.destinations.length || busy) return;
            if (input.value.trim()) {
                status('Save or clear the folder name before starting.', true);
                input.focus();
                return;
            }
            session.started = true;
            editing = false;
            resetForm();
            status();
            render();
            card.focus();
        });
        get('sort-manage-btn').addEventListener('click', () => {
            editing = true;
            resetForm();
            status();
            render();
            input.focus();
        });
        get('sort-skip-btn').addEventListener('click', skip);
        get('sort-undo-btn').addEventListener('click', undo);
        get('sort-restart-btn').addEventListener('click', () => {
            session.restart();
            session.started = true;
            status();
            card.focus();
            loadPreview();
        });
        get('sort-download-btn').addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            render();
            status('Preparing download…');
            try {
                await download({ files: [...session.files], folders: [...session.folders], availableFolders: [...session.availableFolders] });
                status(session.files.length === 1 ? 'File download started.' : 'Sorted ZIP download started.');
            } catch (error) {
                status(`Download failed: ${error.message}`, true);
            } finally {
                busy = false;
                render();
                card.focus({ preventScroll: true });
            }
        });

        document.addEventListener('keydown', event => {
            if (!isOpen()) return;
            event.stopImmediatePropagation();
            if (event.key === 'Tab') {
                const controls = [...card.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')]
                    .filter(element => element.getClientRects().length);
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === card)) {
                    event.preventDefault();
                    first?.focus();
                }
                return;
            }
            if (event.key === 'Escape') { event.preventDefault(); close(); return; }
            if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
                editing || busy || event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
            if (event.key === 'Backspace') { event.preventDefault(); undo(); return; }
            if (event.key === 'ArrowRight' || (event.key === ' ' && event.target.tagName !== 'BUTTON')) {
                event.preventDefault();
                skip();
                return;
            }
            const index = shortcutIndex(event);
            if (index >= 0 && session.destinations[index]) {
                event.preventDefault();
                assign(session.destinations[index]);
            }
        });
        return { isOpen };
    }

    const api = { KEYS, Session, uniquePath, shortcutIndex, validateFolderName, mount };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.BatchImageSort = api;
})(typeof window !== 'undefined' ? window : globalThis);
