(() => {
    const MANIFEST_NAME = 'idea-images.json';
    const DB_NAME = 'at-home-image-manager';
    const STORE_NAME = 'handles';
    const HANDLE_KEY = 'project-directory';

    const managerState = {
        open: false,
        dirHandle: null,
        sourceFile: null,
        webpBlob: null,
        previewUrl: '',
        selectedRow: null,
        ideaQuery: '',
        status: '',
        busy: false
    };

    const el = {};

    function clean(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function canUseFileSystem() {
        return typeof window.showDirectoryPicker === 'function';
    }

    function getAtHome() {
        return window.AtHome || null;
    }

    function setStatus(message, isError = false) {
        managerState.status = message;
        if (!el.managerStatus) return;
        el.managerStatus.textContent = message;
        el.managerStatus.classList.toggle('is-error', isError);
    }

    function setBusy(busy) {
        managerState.busy = busy;
        if (el.managerAttach) el.managerAttach.disabled = busy;
        if (el.managerConnect) el.managerConnect.disabled = busy;
        if (el.managerFileInput) el.managerFileInput.disabled = busy;
        el.managerAttached?.querySelectorAll('button').forEach((button) => {
            button.disabled = busy;
        });
    }

    function revokePreview() {
        if (managerState.previewUrl) {
            URL.revokeObjectURL(managerState.previewUrl);
            managerState.previewUrl = '';
        }
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                    request.result.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveDirectoryHandle(handle) {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    async function loadDirectoryHandle() {
        const db = await openDb();
        const handle = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return handle || null;
    }

    async function verifyDirectoryHandle(handle) {
        try {
            await handle.getFileHandle(MANIFEST_NAME);
            return true;
        } catch {
            return false;
        }
    }

    async function ensureDirectoryPermission(handle, mode = 'readwrite') {
        if (!handle) return false;
        const options = { mode };
        if ((await handle.queryPermission(options)) === 'granted') return true;
        if ((await handle.requestPermission(options)) === 'granted') return true;
        return false;
    }

    async function connectProjectDirectory({ forcePicker = false } = {}) {
        if (!canUseFileSystem()) {
            setStatus('This browser cannot write files directly. Use Chrome or Edge on localhost.', true);
            return null;
        }

        if (!forcePicker) {
            const saved = await loadDirectoryHandle();
            if (saved && await verifyDirectoryHandle(saved) && await ensureDirectoryPermission(saved)) {
                managerState.dirHandle = saved;
                setStatus(`Connected to “${saved.name}”.`);
                updateConnectButton();
                return saved;
            }
        }

        try {
            const handle = await window.showDirectoryPicker({
                id: 'at-home-design-folder',
                mode: 'readwrite',
                startIn: 'documents'
            });

            if (!await verifyDirectoryHandle(handle)) {
                setStatus(`Choose the folder that contains ${MANIFEST_NAME}.`, true);
                return null;
            }

            if (!await ensureDirectoryPermission(handle)) {
                setStatus('Folder permission was not granted.', true);
                return null;
            }

            managerState.dirHandle = handle;
            await saveDirectoryHandle(handle);
            setStatus(`Connected to “${handle.name}”.`);
            updateConnectButton();
            return handle;
        } catch (error) {
            if (error?.name !== 'AbortError') {
                setStatus(error?.message || 'Could not open project folder.', true);
            }
            return null;
        }
    }

    async function getDirectoryHandle(subPathParts) {
        let current = managerState.dirHandle;
        for (const part of subPathParts) {
            current = await current.getDirectoryHandle(part, { create: true });
        }
        return current;
    }

    async function writeBlobToProject(relativePath, blob) {
        const parts = relativePath.split('/').filter(Boolean);
        const fileName = parts.pop();
        const dir = await getDirectoryHandle(parts);
        const fileHandle = await dir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    }

    async function deleteFileFromProject(relativePath) {
        const parts = relativePath.split('/').filter(Boolean);
        const fileName = parts.pop();
        let dir = managerState.dirHandle;

        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part);
        }

        await dir.removeEntry(fileName);
    }

    async function writeTextToProject(relativePath, text) {
        await writeBlobToProject(relativePath, new Blob([text], { type: 'text/plain' }));
    }

    async function readManifestRaw() {
        const fileHandle = await managerState.dirHandle.getFileHandle(MANIFEST_NAME);
        const file = await fileHandle.getFile();
        const data = JSON.parse(await file.text());
        const manifest = {};

        Object.entries(data).forEach(([key, value]) => {
            if (key.startsWith('_')) return;
            manifest[key] = Array.isArray(value) ? value.map(clean).filter(Boolean) : String(value || '').split('|').map(clean).filter(Boolean);
        });

        return { raw: data, manifest };
    }

    async function readManifestFromProject() {
        const atHome = getAtHome();
        const { raw, manifest } = await readManifestRaw();

        if (atHome?.setImageManifest) {
            atHome.setImageManifest(manifest);
        }

        return { raw, manifest };
    }

    async function writeManifestToProject(manifest, rawTemplate = {}) {
        const output = {};

        Object.keys(rawTemplate).forEach((key) => {
            if (key.startsWith('_')) output[key] = rawTemplate[key];
        });

        if (!output._howTo) {
            output._howTo = 'Map idea_id values from Home Design Bullets.csv to image paths. Paths are relative to this folder.';
        }

        Object.entries(manifest).forEach(([key, images]) => {
            if (!images?.length) return;
            output[key] = images;
        });

        const json = `${JSON.stringify(output, null, 2)}\n`;
        await writeBlobToProject(MANIFEST_NAME, new Blob([json], { type: 'application/json' }));
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function supportsWebpEncoding() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    }

    async function convertFileToWebp(file) {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        bitmap.close();

        const mime = supportsWebpEncoding() ? 'image/webp' : 'image/jpeg';
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((result) => {
                if (result) resolve(result);
                else reject(new Error('Image conversion failed.'));
            }, mime, 0.86);
        });

        return {
            blob,
            extension: mime === 'image/webp' ? 'webp' : 'jpg'
        };
    }

    function buildImagePath(row, extension) {
        const atHome = getAtHome();
        const sectionSlug = atHome?.slugify ? atHome.slugify(row.section) : 'idea';
        const fileSlug = row.ideaId || (atHome?.slugify ? atHome.slugify(row.title) : 'image');
        return `images/${sectionSlug}/${fileSlug}.${extension}`;
    }

    function applyManifestEntry(manifest, row, imagePath) {
        const nextManifest = { ...manifest };
        nextManifest[row.ideaId] = [...(nextManifest[row.ideaId] || []), imagePath];
        if (row.ideaKey && row.ideaKey !== row.ideaId) {
            delete nextManifest[row.ideaKey];
        }
        return nextManifest;
    }

    function removeManifestEntry(manifest, row, imagePath) {
        const nextManifest = { ...manifest };
        const filtered = (nextManifest[row.ideaId] || []).filter((path) => path !== imagePath);
        if (filtered.length) nextManifest[row.ideaId] = filtered;
        else delete nextManifest[row.ideaId];
        if (row.ideaKey && row.ideaKey !== row.ideaId) {
            delete nextManifest[row.ideaKey];
        }
        return nextManifest;
    }

    function uniqueImagePath(basePath, manifest, ideaId) {
        const existing = new Set(manifest[ideaId] || []);
        if (!existing.has(basePath)) return basePath;

        const dot = basePath.lastIndexOf('.');
        const stem = basePath.slice(0, dot);
        const ext = basePath.slice(dot);

        let index = 2;
        while (existing.has(`${stem}-${index}${ext}`)) index += 1;
        return `${stem}-${index}${ext}`;
    }

    function ideaSearchText(row) {
        return `${row.section} ${row.subsection || ''} ${row.title} ${row.description || ''} ${row.parentItem || ''} ${row.ideaId || ''}`.toLowerCase();
    }

    function getRowsWithImages() {
        const atHome = getAtHome();
        return (atHome?.getRows?.() || []).filter((row) => (
            (atHome?.getIdeaImageEntries?.(row) || []).length > 0
        ));
    }

    function selectIdea(row) {
        managerState.selectedRow = row;
        refreshManagerLists();
    }

    function getFilteredRows() {
        const atHome = getAtHome();
        const rows = atHome?.getRows?.() || [];
        const query = managerState.ideaQuery.trim().toLowerCase();
        if (!query) return rows.slice(0, 80);

        return rows
            .filter((row) => ideaSearchText(row).includes(query))
            .slice(0, 80);
    }

    function updateConnectButton() {
        if (!el.managerConnect) return;
        el.managerConnect.textContent = managerState.dirHandle ? 'Change folder' : 'Connect project folder';
    }

    function updatePreview() {
        if (!el.managerPreview || !el.managerPreviewMeta) return;

        revokePreview();

        if (!managerState.webpBlob) {
            el.managerPreview.hidden = true;
            el.managerPreview.removeAttribute('src');
            el.managerPreviewMeta.textContent = 'No image selected yet.';
            return;
        }

        managerState.previewUrl = URL.createObjectURL(managerState.webpBlob);
        el.managerPreview.hidden = false;
        el.managerPreview.src = managerState.previewUrl;

        const sizeKb = Math.max(1, Math.round(managerState.webpBlob.size / 1024));
        const type = managerState.webpBlob.type.includes('webp') ? 'WebP' : 'JPEG';
        el.managerPreviewMeta.textContent = `${managerState.sourceFile?.name || 'Uploaded image'} → ${type}, ${sizeKb} KB`;
    }

    function refreshManagerLists() {
        renderWithImagesList();
        renderIdeaResults();
        updateSelectedIdea();
    }

    function updateSelectedIdea() {
        if (!el.managerSelected) return;

        if (!managerState.selectedRow) {
            el.managerSelected.textContent = 'No idea selected yet.';
            renderAttachedImages();
            return;
        }

        const row = managerState.selectedRow;
        const parent = row.parentItem ? ` · under ${row.parentItem}` : '';
        el.managerSelected.textContent = `${row.section} · ${row.title}${parent}`;
        renderAttachedImages();
    }

    function renderAttachedImages() {
        if (!el.managerAttached) return;

        const atHome = getAtHome();
        const row = managerState.selectedRow;
        el.managerAttached.innerHTML = '';

        if (!row) {
            const empty = document.createElement('p');
            empty.className = 'image-manager-empty';
            empty.textContent = 'Choose an idea to manage its images.';
            el.managerAttached.appendChild(empty);
            return;
        }

        const entries = atHome?.getIdeaImageEntries?.(row) || [];
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'image-manager-empty';
            empty.textContent = 'No images attached to this idea yet.';
            el.managerAttached.appendChild(empty);
            return;
        }

        entries.forEach((entry) => {
            const card = document.createElement('article');
            card.className = 'image-manager-attached-card';

            const preview = document.createElement('img');
            preview.className = 'image-manager-attached-preview';
            preview.alt = row.title || 'Attached image';
            preview.loading = 'lazy';
            preview.src = atHome?.resolveImageSrc ? atHome.resolveImageSrc(entry.path) : entry.path;
            preview.addEventListener('error', () => {
                preview.classList.add('is-broken');
            });

            const details = document.createElement('div');
            details.className = 'image-manager-attached-details';

            const path = document.createElement('code');
            path.textContent = entry.path;

            const source = document.createElement('span');
            source.className = 'image-manager-attached-source';
            source.textContent = entry.source === 'csv' ? 'CSV' : 'Manifest';

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'button secondary image-manager-remove';
            remove.textContent = 'Remove';
            remove.addEventListener('click', () => removeImage(entry));

            details.append(path, source, remove);
            card.append(preview, details);
            el.managerAttached.appendChild(card);
        });
    }

    async function removeImage(entry) {
        const atHome = getAtHome();
        const row = managerState.selectedRow;

        if (!atHome || !row || !entry?.path) return;

        const confirmed = window.confirm(`Remove “${entry.path}” from “${row.title}”?`);
        if (!confirmed) return;

        setBusy(true);
        setStatus('Removing image…');

        try {
            const manifest = { ...(atHome.getImageManifest?.() || {}) };
            const manifestPaths = [...(manifest[row.ideaId] || [])];
            const csvPaths = (atHome.getIdeaImageEntries(row) || [])
                .filter((item) => item.source === 'csv')
                .map((item) => item.path);
            const nextManifest = { ...manifest };
            const nextCsvPaths = [...csvPaths];
            let manifestChanged = false;
            let csvChanged = false;

            if (entry.source === 'manifest' || manifestPaths.includes(entry.path)) {
                Object.assign(nextManifest, removeManifestEntry(manifest, row, entry.path));
                manifestChanged = true;
            }

            if (entry.source === 'csv' || csvPaths.includes(entry.path)) {
                const filtered = nextCsvPaths.filter((path) => path !== entry.path);
                nextCsvPaths.length = 0;
                nextCsvPaths.push(...filtered);
                csvChanged = true;
            }

            if (canUseFileSystem()) {
                const dir = managerState.dirHandle || await connectProjectDirectory();
                if (!dir) {
                    setStatus('Connect the Home Design folder before removing images.', true);
                    return;
                }

                let raw = {};
                if (manifestChanged) {
                    raw = (await readManifestRaw()).raw;
                    await writeManifestToProject(nextManifest, raw);
                }

                if (csvChanged) {
                    const csvText = atHome.updateIdeaCsvImages(row.ideaId, nextCsvPaths);
                    await writeTextToProject(atHome.DATA_FILE || 'Home Design Bullets.csv', csvText);
                }

                try {
                    await deleteFileFromProject(entry.path);
                } catch {
                    atHome.setImageManifest(nextManifest);
                    managerState.selectedRow = atHome.findRowByIdeaId(row.ideaId) || row;
                    setStatus(`Unlinked ${entry.path}. File was not found on disk.`);
                    refreshManagerLists();
                    return;
                }

                atHome.setImageManifest(nextManifest);
                managerState.selectedRow = atHome.findRowByIdeaId(row.ideaId) || row;
                setStatus(`Removed ${entry.path} from “${row.title}”.`);
            } else {
                if (manifestChanged) atHome.setImageManifest(nextManifest);
                if (csvChanged) atHome.updateIdeaCsvImages(row.ideaId, nextCsvPaths);

                const json = `${JSON.stringify({
                    _howTo: 'Replace idea-images.json with this file after removing an image.',
                    ...nextManifest
                }, null, 2)}\n`;
                downloadBlob(new Blob([json], { type: 'application/json' }), MANIFEST_NAME);

                if (csvChanged) {
                    downloadBlob(
                        new Blob([atHome.exportCsvText()], { type: 'text/csv' }),
                        atHome.DATA_FILE || 'Home Design Bullets.csv'
                    );
                }

                managerState.selectedRow = atHome.findRowByIdeaId(row.ideaId) || row;
                setStatus(`Downloaded updated files. Replace them in the Home Design folder and delete ${entry.path} manually.`);
            }

            refreshManagerLists();
        } catch (error) {
            setStatus(error?.message || 'Could not remove image.', true);
        } finally {
            setBusy(false);
        }
    }

    function renderIdeaButton(row, container) {
        const atHome = getAtHome();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `image-manager-idea${managerState.selectedRow?.ideaId === row.ideaId ? ' is-selected' : ''}`;

        const title = document.createElement('strong');
        const meta = document.createElement('span');
        title.textContent = row.title || row.fullText;
        meta.textContent = row.parentItem
            ? `${row.section} · under ${row.parentItem}`
            : row.section;

        button.append(title, meta);

        const imageCount = (atHome?.getIdeaImageEntries?.(row) || []).length;
        if (imageCount > 0) {
            const count = document.createElement('span');
            count.className = 'image-manager-idea-count';
            count.textContent = `${imageCount} photo${imageCount === 1 ? '' : 's'}`;
            button.appendChild(count);
        }

        button.addEventListener('click', () => selectIdea(row));
        container.appendChild(button);
    }

    function renderWithImagesList() {
        if (!el.managerWithImages) return;

        const rows = getRowsWithImages();
        el.managerWithImages.innerHTML = '';

        if (!rows.length) {
            const empty = document.createElement('p');
            empty.className = 'image-manager-empty';
            empty.textContent = 'No ideas have images attached yet.';
            el.managerWithImages.appendChild(empty);
            return;
        }

        rows.forEach((row) => renderIdeaButton(row, el.managerWithImages));
    }

    function renderIdeaResults() {
        if (!el.managerResults) return;

        const rows = getFilteredRows();
        el.managerResults.innerHTML = '';

        if (!rows.length) {
            const empty = document.createElement('p');
            empty.className = 'image-manager-empty';
            empty.textContent = 'No ideas match that search.';
            el.managerResults.appendChild(empty);
            return;
        }

        rows.forEach((row) => renderIdeaButton(row, el.managerResults));
    }

    async function handleFileSelection(file) {
        if (!file || !file.type.startsWith('image/')) {
            setStatus('Choose an image file.', true);
            return;
        }

        setBusy(true);
        setStatus('Converting image…');

        try {
            const converted = await convertFileToWebp(file);
            managerState.sourceFile = file;
            managerState.webpBlob = converted.blob;
            managerState.extension = converted.extension;
            updatePreview();
            setStatus(supportsWebpEncoding() ? 'Image converted to WebP.' : 'WebP unavailable here — saved as JPEG instead.');
        } catch (error) {
            setStatus(error?.message || 'Could not convert image.', true);
        } finally {
            setBusy(false);
        }
    }

    async function attachImage() {
        const atHome = getAtHome();
        const row = managerState.selectedRow;

        if (!managerState.webpBlob) {
            setStatus('Upload an image first.', true);
            return;
        }

        if (!row) {
            setStatus('Choose an idea to attach this image to.', true);
            return;
        }

        setBusy(true);

        try {
            const extension = managerState.extension || 'webp';
            const basePath = buildImagePath(row, extension);

            if (canUseFileSystem()) {
                const dir = managerState.dirHandle || await connectProjectDirectory();
                if (!dir) {
                    setStatus('Connect the Home Design folder before saving.', true);
                    return;
                }

                const { raw, manifest } = await readManifestFromProject();
                const imagePath = uniqueImagePath(basePath, manifest, row.ideaId);
                const nextManifest = applyManifestEntry(manifest, row, imagePath);

                await writeBlobToProject(imagePath, managerState.webpBlob);
                await writeManifestToProject(nextManifest, raw);

                if (atHome?.setImageManifest) {
                    atHome.setImageManifest(nextManifest);
                }

                managerState.selectedRow = atHome.findRowByIdeaId(row.ideaId) || row;
                setStatus(`Saved ${imagePath} and linked it to “${row.title}”.`);
                refreshManagerLists();
            } else {
                const manifest = { ...(atHome?.getImageManifest?.() || {}) };
                const imagePath = uniqueImagePath(basePath, manifest, row.ideaId);
                const nextManifest = applyManifestEntry(manifest, row, imagePath);

                downloadBlob(managerState.webpBlob, imagePath.split('/').pop());
                const json = `${JSON.stringify({
                    _howTo: 'Replace idea-images.json with this file, or merge the new key below.',
                    ...nextManifest
                }, null, 2)}\n`;
                downloadBlob(new Blob([json], { type: 'application/json' }), MANIFEST_NAME);

                if (atHome?.setImageManifest) {
                    atHome.setImageManifest(nextManifest);
                }

                managerState.selectedRow = atHome.findRowByIdeaId(row.ideaId) || row;
                setStatus(`Downloaded image and updated ${MANIFEST_NAME}. Drop both into the Home Design folder.`);
                refreshManagerLists();
            }

            managerState.sourceFile = null;
            managerState.webpBlob = null;
            updatePreview();
        } catch (error) {
            setStatus(error?.message || 'Could not save image.', true);
        } finally {
            setBusy(false);
        }
    }

    function openManager() {
        if (!el.imageManager) return;
        managerState.open = true;
        el.imageManager.hidden = false;
        document.body.classList.add('manager-open');
        renderWithImagesList();
        renderIdeaResults();
        updateSelectedIdea();
        updatePreview();
        updateConnectButton();
        el.managerSearch?.focus();
    }

    function closeManager() {
        if (!el.imageManager) return;
        managerState.open = false;
        el.imageManager.hidden = true;
        document.body.classList.remove('manager-open');
    }

    function bindEvents() {
        el.imageManagerTrigger?.addEventListener('click', openManager);
        el.managerClose?.addEventListener('click', closeManager);
        el.managerBackdrop?.addEventListener('click', closeManager);
        el.managerConnect?.addEventListener('click', () => connectProjectDirectory({ forcePicker: true }));
        el.managerAttach?.addEventListener('click', attachImage);

        el.managerSearch?.addEventListener('input', (event) => {
            managerState.ideaQuery = event.target.value;
            renderIdeaResults();
        });

        el.managerFileInput?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) handleFileSelection(file);
            event.target.value = '';
        });

        el.managerDropzone?.addEventListener('dragover', (event) => {
            event.preventDefault();
            el.managerDropzone.classList.add('is-dragging');
        });

        el.managerDropzone?.addEventListener('dragleave', () => {
            el.managerDropzone.classList.remove('is-dragging');
        });

        el.managerDropzone?.addEventListener('drop', (event) => {
            event.preventDefault();
            el.managerDropzone.classList.remove('is-dragging');
            const file = event.dataTransfer?.files?.[0];
            if (file) handleFileSelection(file);
        });

        el.managerDropzone?.addEventListener('click', () => el.managerFileInput?.click());

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && managerState.open) {
                closeManager();
            }
        });

        window.addEventListener('athome:ready', () => {
            if (managerState.open) refreshManagerLists();
        });
    }

    function cacheElements() {
        el.imageManagerTrigger = document.getElementById('imageManagerTrigger');
        el.imageManager = document.getElementById('imageManager');
        el.managerBackdrop = document.getElementById('imageManagerBackdrop');
        el.managerClose = document.getElementById('imageManagerClose');
        el.managerConnect = document.getElementById('imageManagerConnect');
        el.managerAttach = document.getElementById('imageManagerAttach');
        el.managerFileInput = document.getElementById('imageManagerFile');
        el.managerDropzone = document.getElementById('imageManagerDropzone');
        el.managerPreview = document.getElementById('imageManagerPreview');
        el.managerPreviewMeta = document.getElementById('imageManagerPreviewMeta');
        el.managerSearch = document.getElementById('imageManagerSearch');
        el.managerWithImages = document.getElementById('imageManagerWithImages');
        el.managerResults = document.getElementById('imageManagerResults');
        el.managerSelected = document.getElementById('imageManagerSelected');
        el.managerAttached = document.getElementById('imageManagerAttached');
        el.managerStatus = document.getElementById('imageManagerStatus');
    }

    async function init() {
        cacheElements();
        bindEvents();
        updateConnectButton();

        if (canUseFileSystem()) {
            await connectProjectDirectory();
        } else {
            setStatus('Direct file writing needs Chrome or Edge. Fallback downloads will be used.');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
