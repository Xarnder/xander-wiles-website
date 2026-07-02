import { uploadIdeaImage, removeIdeaImage } from './api.js';
import { getAuthState } from './auth.js';

const managerState = {
    open: false,
    sourceFile: null,
    webpBlob: null,
    previewUrl: '',
    selectedRow: null,
    ideaQuery: '',
    status: '',
    busy: false,
    crop169: false,
    extension: 'webp',
    outputSize: null
};

const el = {};

function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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
    if (el.managerCrop169) el.managerCrop169.disabled = busy;
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

function ideaSearchText(row) {
    return `${row.section} ${row.subsection || ''} ${row.title} ${row.description || ''} ${row.parentItem || ''} ${row.ideaId || ''}`.toLowerCase();
}

function getFilteredRows() {
    const atHome = getAtHome();
    const rows = atHome?.getRows?.() || [];
    const query = managerState.ideaQuery.trim().toLowerCase();
    if (!query) return rows.slice(0, 80);
    return rows.filter((row) => ideaSearchText(row).includes(query)).slice(0, 80);
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
    const cropNote = managerState.crop169 ? ' · cropped 16:9' : '';
    const sizeNote = managerState.outputSize
        ? ` · ${managerState.outputSize.width}×${managerState.outputSize.height}`
        : '';
    el.managerPreviewMeta.textContent = `${managerState.sourceFile?.name || 'Uploaded image'} → ${type}, ${sizeKb} KB${sizeNote}${cropNote}`;
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
        preview.addEventListener('error', () => preview.classList.add('is-broken'));

        const details = document.createElement('div');
        details.className = 'image-manager-attached-details';

        const path = document.createElement('code');
        path.textContent = entry.path.length > 60 ? `${entry.path.slice(0, 60)}…` : entry.path;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button secondary image-manager-remove';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => removeImage(entry));

        details.append(path, remove);
        card.append(preview, details);
        el.managerAttached.appendChild(card);
    });
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

function refreshManagerLists() {
    renderWithImagesList();
    renderIdeaResults();
    updateSelectedIdea();
}

function supportsWebpEncoding() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

function drawBitmapToCanvas(bitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return canvas;
}

function cropBitmapTo169(bitmap) {
    const targetAspect = 16 / 9;
    const srcAspect = bitmap.width / bitmap.height;
    let cropW;
    let cropH;
    let cropX;
    let cropY;

    if (srcAspect > targetAspect) {
        cropH = bitmap.height;
        cropW = Math.round(cropH * targetAspect);
        cropX = Math.round((bitmap.width - cropW) / 2);
        cropY = 0;
    } else {
        cropW = bitmap.width;
        cropH = Math.round(cropW / targetAspect);
        cropX = 0;
        cropY = Math.round((bitmap.height - cropH) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return canvas;
}

async function convertFileToWebp(file, { crop169 = false } = {}) {
    const bitmap = await createImageBitmap(file);

    try {
        const canvas = crop169 ? cropBitmapTo169(bitmap) : drawBitmapToCanvas(bitmap);
        const mime = supportsWebpEncoding() ? 'image/webp' : 'image/jpeg';
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((result) => {
                if (result) resolve(result);
                else reject(new Error('Image conversion failed.'));
            }, mime, 0.86);
        });

        return {
            blob,
            extension: mime === 'image/webp' ? 'webp' : 'jpg',
            width: canvas.width,
            height: canvas.height
        };
    } finally {
        bitmap.close();
    }
}

function buildImageFileName(row, extension) {
    const atHome = getAtHome();
    const sectionSlug = atHome?.slugify ? atHome.slugify(row.section) : 'idea';
    const fileSlug = row.ideaId || (atHome?.slugify ? atHome.slugify(row.title) : 'image');
    return `${sectionSlug}-${fileSlug}.${extension}`;
}

async function handleFileSelection(file) {
    if (!file || !file.type.startsWith('image/')) {
        setStatus('Choose an image file.', true);
        return;
    }

    if (!getAuthState().isOwner) {
        setStatus('Sign in with your admin Google account first.', true);
        return;
    }

    setBusy(true);
    setStatus(managerState.crop169 ? 'Cropping and converting image…' : 'Converting image…');

    try {
        const converted = await convertFileToWebp(file, { crop169: managerState.crop169 });
        managerState.sourceFile = file;
        managerState.webpBlob = converted.blob;
        managerState.extension = converted.extension;
        managerState.outputSize = { width: converted.width, height: converted.height };
        updatePreview();
        const cropMsg = managerState.crop169 ? ' (16:9 crop applied)' : '';
        setStatus(supportsWebpEncoding()
            ? `Image converted to WebP${cropMsg}.`
            : `WebP unavailable here — using JPEG instead${cropMsg}.`);
    } catch (error) {
        setStatus(error?.message || 'Could not convert image.', true);
    } finally {
        setBusy(false);
    }
}

async function reprocessSourceImage() {
    if (!managerState.sourceFile) return;
    await handleFileSelection(managerState.sourceFile);
}

async function attachImage() {
    const row = managerState.selectedRow;

    if (!getAuthState().isOwner) {
        setStatus('Sign in with your admin Google account first.', true);
        return;
    }

    if (!managerState.webpBlob) {
        setStatus('Upload an image first.', true);
        return;
    }

    if (!row) {
        setStatus('Choose an idea to attach this image to.', true);
        return;
    }

    setBusy(true);
    setStatus('Uploading image…');

    try {
        const extension = managerState.extension || 'webp';
        const fileName = buildImageFileName(row, extension);
        await uploadIdeaImage(row.ideaId, managerState.webpBlob, fileName);

        managerState.selectedRow = getAtHome()?.findRowByIdeaId?.(row.ideaId) || row;
        setStatus(`Uploaded and linked image to "${row.title}".`);
        refreshManagerLists();

        managerState.sourceFile = null;
        managerState.webpBlob = null;
        managerState.outputSize = null;
        updatePreview();
    } catch (error) {
        setStatus(error?.message || 'Could not save image.', true);
    } finally {
        setBusy(false);
    }
}

async function removeImage(entry) {
    const atHome = getAtHome();
    const row = managerState.selectedRow;
    if (!atHome || !row || !entry?.path) return;

    if (!getAuthState().isOwner) {
        setStatus('Sign in with your admin Google account first.', true);
        return;
    }

    const confirmed = window.confirm(`Remove this image from "${row.title}"?`);
    if (!confirmed) return;

    setBusy(true);
    setStatus('Removing image…');

    try {
        await removeIdeaImage(row.ideaId, entry.path);
        managerState.selectedRow = atHome.findRowByIdeaId(row.ideaId) || row;
        setStatus(`Removed image from "${row.title}".`);
        refreshManagerLists();
    } catch (error) {
        setStatus(error?.message || 'Could not remove image.', true);
    } finally {
        setBusy(false);
    }
}

function openManager() {
    if (!getAuthState().isOwner) return;
    if (!el.imageManager) return;

    managerState.open = true;
    el.imageManager.hidden = false;
    document.body.classList.add('manager-open');
    refreshManagerLists();
    updatePreview();
    el.managerSearch?.focus();
}

function closeManager() {
    if (!el.imageManager) return;
    managerState.open = false;
    el.imageManager.hidden = true;
    document.body.classList.remove('manager-open');
}

function cacheElements() {
    el.imageManagerTrigger = document.getElementById('imageManagerTrigger');
    el.imageManager = document.getElementById('imageManager');
    el.managerBackdrop = document.getElementById('imageManagerBackdrop');
    el.managerClose = document.getElementById('imageManagerClose');
    el.managerAttach = document.getElementById('imageManagerAttach');
    el.managerFileInput = document.getElementById('imageManagerFile');
    el.managerDropzone = document.getElementById('imageManagerDropzone');
    el.managerPreview = document.getElementById('imageManagerPreview');
    el.managerPreviewMeta = document.getElementById('imageManagerPreviewMeta');
    el.managerCrop169 = document.getElementById('imageManagerCrop169');
    el.managerSearch = document.getElementById('imageManagerSearch');
    el.managerWithImages = document.getElementById('imageManagerWithImages');
    el.managerResults = document.getElementById('imageManagerResults');
    el.managerSelected = document.getElementById('imageManagerSelected');
    el.managerAttached = document.getElementById('imageManagerAttached');
    el.managerStatus = document.getElementById('imageManagerStatus');
}

function bindEvents() {
    el.imageManagerTrigger?.addEventListener('click', openManager);
    el.managerClose?.addEventListener('click', closeManager);
    el.managerBackdrop?.addEventListener('click', closeManager);
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

    el.managerCrop169?.addEventListener('change', (event) => {
        managerState.crop169 = event.target.checked;
        if (managerState.sourceFile) reprocessSourceImage();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && managerState.open) {
            closeManager();
        }
    });

    window.addEventListener('athome:ready', () => {
        if (managerState.open) refreshManagerLists();
    });
}

export function initImageManager() {
    cacheElements();
    bindEvents();
    el.imageManagerTrigger && (el.imageManagerTrigger.hidden = true);
}
