/**
 * Tap-to-load image previews for Finder / Pinned rows.
 *
 * Data rules — keep image downloads small and deliberate:
 * - Listing never asks for thumbnails. Rows show a plain icon.
 * - Tap a row: one metadata call + one ~320px thumbnail (≤ 512 KB), cached on
 *   this device. Later taps are free.
 * - Tap the thumbnail: full screen shows a screen-sized copy (≤ 2048px, ≤ 4 MB),
 *   not the original. The original loads only when you zoom in past the copy’s
 *   detail (once per viewing) or press “Full resolution”; it asks first when
 *   big or of unknown size, and never goes above 30 MB.
 * - Pinch / pan / double-tap / wheel zoom and swipe-down-to-close live in
 *   image-zoom.js.
 * - Every network load is streamed with a hard byte cap, has a timeout, and is
 *   never retried automatically.
 * - One load at a time, an hourly count limit per kind, and a daily byte budget
 *   (asks before going past it). Cache hits cost nothing and are not counted.
 */

import { getImageMetadata, openFileDownload } from './drive.js';
import {
    DAILY_EXTRA_BYTES,
    FULL_CACHE_MAX_ITEM_BYTES,
    HOURLY_LIMITS,
    ImageTooLargeError,
    ORIGINAL_CONFIRM_BYTES,
    ORIGINAL_VIEW_MAX_BYTES,
    SCREEN_COPY_MAX_BYTES,
    THUMBNAIL_MAX_BYTES,
    THUMBNAIL_PX,
    UNMEASURED_THUMB_BYTES,
    checkImageUsage,
    formatBytes,
    isCachedImageFresh,
    needsConvertedImage,
    normalizeImageUsage,
    pickCacheEvictions,
    readBodyCapped,
    recordImageUsage,
    screenCopyPx,
    sizedThumbnailUrl,
    summarizeImageUsage,
} from './image-files.js';
import { createImageZoom, wantsMoreDetail } from './image-zoom.js';
import { fileForRow, getEls, promptLargeFile, showAppToast } from './ui.js';

const THUMB_CACHE = 'md-editor-image-thumbs-v1';
const FULL_CACHE = 'md-editor-image-full-v1';
const FULL_INDEX_KEY = 'md-editor-image-full-index-v1';
const USAGE_KEY = 'md-editor-image-usage-v1';

const METADATA_TIMEOUT_MS = 15_000;
const THUMB_TIMEOUT_MS = 20_000;
const SCREEN_TIMEOUT_MS = 45_000;
const ORIGINAL_TIMEOUT_MS = 3 * 60_000;
/** Drive thumbnail links expire after a few hours; refresh well before that. */
const LINK_FRESH_MS = 30 * 60_000;
/** Rough guesses for the daily-budget pre-check (actual bytes are what get recorded). */
const EXPECTED_THUMB_BYTES = 60 * 1024;
const EXPECTED_SCREEN_BYTES = 800 * 1024;

const KIND_LABEL = { thumb: 'thumbnails', screen: 'full-screen images', original: 'originals' };

/** @type {Map<string, { url: string, modifiedTime: string, meta: object }>} */
const thumbsInMemory = new Map();
/** Metadata (with its short-lived thumbnail link) from this session. */
const metaById = new Map();

let busyId = '';
/** @type {{ row: HTMLElement, panel: HTMLElement, fileId: string } | null} */
let openPreview = null;
let viewerObjectUrl = '';
let viewerWired = false;
/**
 * One full-screen viewing: the images it can step through and the one on screen.
 * @type {{ files: object[], index: number, item: ViewerItem | null } | null}
 */
let session = null;
/**
 * @typedef {{ file: object, meta: object|null, abort: AbortController,
 *   originalShown: boolean, detailDeclined: boolean, loadingOriginal: boolean }} ViewerItem
 */
/** @type {ReturnType<typeof createImageZoom> | null} */
let zoom = null;

// ---------------------------------------------------------------------------
// Usage ledger (per device, per day)

function readUsage() {
    try {
        return normalizeImageUsage(JSON.parse(localStorage.getItem(USAGE_KEY) || 'null'));
    } catch {
        return normalizeImageUsage(null);
    }
}

/** Fired on window whenever today’s image usage changes (Settings listens). */
export const IMAGE_USAGE_EVENT = 'md-editor:image-usage';

function writeUsage(usage) {
    try {
        localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    } catch {
        // ignore — limits still apply in memory for this load
    }
    window.dispatchEvent(new CustomEvent(IMAGE_USAGE_EVENT));
}

/** Snapshot for the Settings usage card. */
export function readImageUsageSummary(now = Date.now()) {
    let raw = null;
    try {
        raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
    } catch {
        raw = null;
    }
    return summarizeImageUsage(raw, now);
}

/** localStorage key, so other tabs’ `storage` events can be matched. */
export const IMAGE_USAGE_STORAGE_KEY = USAGE_KEY;

function usageLine() {
    const usage = readUsage();
    return `Today ${formatBytes(usage.bytes) || '0 MB'} of ${formatBytes(usage.allowance)}`;
}

function minutesText(ms) {
    const mins = Math.max(1, Math.ceil(ms / 60_000));
    return `${mins} min`;
}

/**
 * Gate a network load. Hourly limits are hard stops; the daily budget asks.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
async function ensureAllowed(kind, expectedBytes) {
    const usage = readUsage();
    const check = checkImageUsage(usage, { kind, bytes: expectedBytes });
    if (check.ok) return { ok: true };
    if (check.reason === 'hourly') {
        return {
            ok: false,
            message: `Limit of ${HOURLY_LIMITS[kind]} ${KIND_LABEL[kind]} per hour reached. Try again in ${minutesText(check.retryInMs)}.`,
        };
    }
    const allow = await promptLargeFile(getEls().largeFileDialog, {
        title: 'Daily image limit reached',
        message: `Images have used ${formatBytes(usage.bytes) || '0 MB'} of today’s ${formatBytes(usage.allowance)} on this device. Allow another ${formatBytes(DAILY_EXTRA_BYTES)} today?`,
    });
    if (!allow) return { ok: false, message: 'Daily image limit reached. Resets tomorrow.' };
    const next = readUsage();
    next.allowance = Math.max(next.allowance + DAILY_EXTRA_BYTES, next.bytes + (Number(expectedBytes) || 0));
    writeUsage(next);
    return { ok: true };
}

/**
 * Count one network load: the hourly event is recorded up front (so failed or
 * cancelled loads still count) and bytes as they arrive.
 */
function startMeter(kind) {
    writeUsage(recordImageUsage(readUsage(), { kind, bytes: 0 }));
    let pending = 0;
    return {
        add(n) {
            pending += Number(n) || 0;
        },
        done() {
            if (!pending) return;
            const usage = readUsage();
            usage.bytes += pending;
            pending = 0;
            writeUsage(usage);
        },
    };
}

/** An abort signal that fires on timeout or when `parent` aborts. */
function timeoutSignal(ms, parent) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
    const onParent = () => controller.abort(parent.reason);
    if (parent) {
        if (parent.aborted) controller.abort(parent.reason);
        else parent.addEventListener('abort', onParent, { once: true });
    }
    return {
        signal: controller.signal,
        clear() {
            clearTimeout(timer);
            parent?.removeEventListener('abort', onParent);
        },
    };
}

function isAbort(err) {
    return err?.name === 'AbortError' || err?.name === 'TimeoutError';
}

function friendlyError(err, fallback) {
    if (err?.name === 'TimeoutError' || err?.cause?.name === 'TimeoutError') return 'Timed out — check your connection.';
    if (err instanceof ImageTooLargeError) return err.message;
    if (err?.status === 403 || err?.status === 429) return 'Google Drive is limiting requests. Try again later.';
    return err?.message || fallback;
}

// ---------------------------------------------------------------------------
// Device caches

/**
 * Drive’s modifiedTime for cache checks. Pinned rows carry pin time for sorting,
 * so they pass `driveModifiedTime` ('' when unknown → trust the cache).
 */
function listedModified(file) {
    return file && 'driveModifiedTime' in file ? file.driveModifiedTime : file?.modifiedTime;
}

function cacheRequestUrl(variant, fileId) {
    return new URL(`__image-cache/${variant}/${encodeURIComponent(fileId)}`, location.href).href;
}

async function openCache(name) {
    try {
        if (typeof caches === 'undefined') return null;
        return await caches.open(name);
    } catch {
        return null;
    }
}

function metaHeaders(meta) {
    return {
        'X-Modified-Time': String(meta?.modifiedTime || ''),
        'X-Size': String(meta?.size || ''),
        'X-Width': String(meta?.imageMediaMetadata?.width || ''),
        'X-Height': String(meta?.imageMediaMetadata?.height || ''),
    };
}

function metaFromHeaders(fileId, headers) {
    const width = Number(headers.get('X-Width')) || 0;
    const height = Number(headers.get('X-Height')) || 0;
    return {
        id: fileId,
        modifiedTime: headers.get('X-Modified-Time') || '',
        size: headers.get('X-Size') || '',
        imageMediaMetadata: width && height ? { width, height } : undefined,
    };
}

async function readCachedThumb(file) {
    const cache = await openCache(THUMB_CACHE);
    if (!cache) return null;
    try {
        const hit = await cache.match(cacheRequestUrl('thumb', file.id));
        if (!hit) return null;
        const meta = metaFromHeaders(file.id, hit.headers);
        if (!isCachedImageFresh(meta.modifiedTime, listedModified(file))) return null;
        return { blob: await hit.blob(), meta };
    } catch {
        return null;
    }
}

/** Store a thumbnail, or an empty marker so “Drive has no thumbnail” is remembered too. */
async function writeCachedThumb(fileId, blob, meta) {
    const cache = await openCache(THUMB_CACHE);
    if (!cache) return;
    try {
        await cache.put(
            cacheRequestUrl('thumb', fileId),
            new Response(blob || '', {
                headers: { 'Content-Type': blob?.type || 'text/plain', ...metaHeaders(meta) },
            })
        );
    } catch {
        // Storage full or blocked — the in-memory copy still works this session.
    }
}

function readFullIndex() {
    try {
        const parsed = JSON.parse(localStorage.getItem(FULL_INDEX_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === 'string') : [];
    } catch {
        return [];
    }
}

function writeFullIndex(index) {
    try {
        localStorage.setItem(FULL_INDEX_KEY, JSON.stringify(index));
    } catch {
        // ignore
    }
}

/** @param {'screen'|'original'} variant */
async function readCachedFull(variant, file) {
    const cache = await openCache(FULL_CACHE);
    if (!cache) return null;
    try {
        const hit = await cache.match(cacheRequestUrl(variant, file.id));
        if (!hit) return null;
        if (!isCachedImageFresh(hit.headers.get('X-Modified-Time'), listedModified(file))) return null;
        const blob = await hit.blob();
        const key = `${variant}:${file.id}`;
        const index = readFullIndex();
        const entry = index.find((e) => e.id === key);
        if (entry) {
            entry.at = Date.now();
            writeFullIndex(index);
        }
        return blob;
    } catch {
        return null;
    }
}

/** @param {'screen'|'original'} variant */
async function writeCachedFull(variant, fileId, blob, meta) {
    if (!blob.size || blob.size > FULL_CACHE_MAX_ITEM_BYTES) return;
    const cache = await openCache(FULL_CACHE);
    if (!cache) return;
    const key = `${variant}:${fileId}`;
    try {
        const index = readFullIndex().filter((e) => e.id !== key);
        for (const id of pickCacheEvictions(index, blob.size)) {
            const [v, ...rest] = id.split(':');
            await cache.delete(cacheRequestUrl(v, rest.join(':')));
            const at = index.findIndex((e) => e.id === id);
            if (at >= 0) index.splice(at, 1);
        }
        await cache.put(
            cacheRequestUrl(variant, fileId),
            new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg', ...metaHeaders(meta) } })
        );
        index.push({ id: key, bytes: blob.size, at: Date.now() });
        writeFullIndex(index);
    } catch {
        // ignore — next open just downloads again
    }
}

// ---------------------------------------------------------------------------
// Network (always capped, metered, timed out, never retried)

async function fetchImageMetadata(fileId, parentSignal) {
    const t = timeoutSignal(METADATA_TIMEOUT_MS, parentSignal);
    try {
        const meta = await getImageMetadata(fileId, { signal: t.signal });
        metaById.set(fileId, { meta, at: Date.now() });
        return meta;
    } finally {
        t.clear();
    }
}

/** Fresh metadata from this session, or one metadata call. */
async function currentMetadata(fileId, parentSignal) {
    const known = metaById.get(fileId);
    if (known && Date.now() - known.at < LINK_FRESH_MS) return known.meta;
    return fetchImageMetadata(fileId, parentSignal);
}

/**
 * Google’s image CDN sends `Access-Control-Allow-Origin: *`, so a credential-free
 * fetch can read (and cap) the bytes. Returns null when the CDN refuses.
 */
async function fetchCdnImage(url, { maxBytes, timeoutMs, meter, signal }) {
    const t = timeoutSignal(timeoutMs, signal);
    try {
        let response;
        try {
            response = await fetch(url, {
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                signal: t.signal,
            });
        } catch (err) {
            if (isAbort(err) || t.signal.aborted) throw t.signal.reason || err;
            return null;
        }
        if (!response.ok) return null;
        const blob = await readBodyCapped(response, maxBytes, (n) => meter.add(n));
        if (!blob.size || !String(blob.type).startsWith('image/')) return null;
        return blob;
    } catch (err) {
        if (t.signal.aborted) throw t.signal.reason || err;
        throw err;
    } finally {
        t.clear();
    }
}

// ---------------------------------------------------------------------------
// Thumbnails in Finder rows

function describeMeta(file, meta) {
    const parts = [];
    const w = meta?.imageMediaMetadata?.width;
    const h = meta?.imageMediaMetadata?.height;
    if (w && h) parts.push(`${w} × ${h}`);
    const size = formatBytes(meta?.size || file?.size);
    if (size) parts.push(size);
    return parts.join(' · ');
}

/**
 * Load (or reuse) one thumbnail.
 * @returns {Promise<{ url: string, meta: object }>} url is '' when Drive has no thumbnail
 */
async function loadThumbnail(file, { signal } = {}) {
    const mem = thumbsInMemory.get(file.id);
    if (mem && isCachedImageFresh(mem.modifiedTime, listedModified(file))) return mem;

    const remember = (entry) => {
        if (mem?.url?.startsWith('blob:') && mem.url !== entry.url) URL.revokeObjectURL(mem.url);
        thumbsInMemory.set(file.id, entry);
        return entry;
    };

    const cached = await readCachedThumb(file);
    if (cached) {
        const url = cached.blob.size ? URL.createObjectURL(cached.blob) : '';
        return remember({ url, modifiedTime: cached.meta.modifiedTime, meta: cached.meta });
    }

    const gate = await ensureAllowed('thumb', EXPECTED_THUMB_BYTES);
    if (!gate.ok) throw new Error(gate.message);

    const meter = startMeter('thumb');
    try {
        const meta = await fetchImageMetadata(file.id, signal);
        const link = meta.thumbnailLink ? sizedThumbnailUrl(meta.thumbnailLink, THUMBNAIL_PX) : '';
        if (!link) {
            await writeCachedThumb(file.id, null, meta);
            return remember({ url: '', modifiedTime: meta.modifiedTime || '', meta });
        }
        const blob = await fetchCdnImage(link, {
            maxBytes: THUMBNAIL_MAX_BYTES,
            timeoutMs: THUMB_TIMEOUT_MS,
            meter,
            signal,
        });
        if (blob) {
            await writeCachedThumb(file.id, blob, meta);
            return remember({ url: URL.createObjectURL(blob), modifiedTime: meta.modifiedTime || '', meta });
        }
        // CDN refused a script read (rare). The link is already sized to 320px, so
        // let <img> load it; count a typical thumbnail against today’s budget.
        meter.add(UNMEASURED_THUMB_BYTES);
        return remember({ url: link, modifiedTime: meta.modifiedTime || '', meta });
    } finally {
        meter.done();
    }
}

function closeOpenPreview() {
    if (!openPreview) return;
    openPreview.panel.remove();
    openPreview.row.classList.remove('has-image-preview');
    openPreview.row.querySelector('.file-row-main')?.setAttribute('aria-expanded', 'false');
    openPreview = null;
}

function buildPanel(file) {
    const panel = document.createElement('div');
    panel.className = 'file-image-preview';

    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button';
    thumbBtn.className = 'file-image-thumb';
    thumbBtn.disabled = true;
    const status = document.createElement('span');
    status.className = 'file-image-thumb-status';
    status.textContent = 'Loading…';
    thumbBtn.appendChild(status);

    const info = document.createElement('div');
    info.className = 'file-image-info';
    const details = document.createElement('span');
    details.className = 'file-image-details';
    details.textContent = formatBytes(file.size);
    const hint = document.createElement('span');
    hint.className = 'file-image-hint';
    hint.textContent = 'Loading thumbnail only';
    info.append(details, hint);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'file-image-close';
    closeBtn.setAttribute('aria-label', 'Hide thumbnail');
    closeBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeOpenPreview();
    });

    panel.append(thumbBtn, info, closeBtn);
    return { panel, thumbBtn, status, details, hint };
}

function warnBusy() {
    showAppToast('One image at a time — wait for the current one to finish.', 'warn', { key: 'image-busy' });
}

/**
 * Row tap: show (or hide) this image’s thumbnail under its row.
 * @param {object} file Drive file ({ id, name, mimeType, size?, modifiedTime? })
 * @param {HTMLElement|null|undefined} row the `.file-row` that was tapped
 */
export async function toggleImagePreview(file, row) {
    if (!file?.id || !(row instanceof HTMLElement)) return;
    if (openPreview?.fileId === file.id && openPreview.row === row) {
        closeOpenPreview();
        return;
    }
    if (busyId) {
        warnBusy();
        return;
    }
    busyId = `thumb:${file.id}`;

    closeOpenPreview();
    const { panel, thumbBtn, status, details, hint } = buildPanel(file);
    row.classList.add('has-image-preview');
    row.appendChild(panel);
    row.querySelector('.file-row-main')?.setAttribute('aria-expanded', 'true');
    openPreview = { row, panel, fileId: file.id };

    try {
        const thumb = await loadThumbnail(file);
        if (openPreview?.panel !== panel) return;
        const meta = { ...thumb.meta, size: thumb.meta.size || file.size };
        details.textContent = describeMeta(file, meta);
        thumbBtn.disabled = false;
        thumbBtn.setAttribute('aria-label', `Open ${file.name || 'image'} full screen`);
        if (thumb.url) {
            const img = document.createElement('img');
            img.alt = '';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            img.src = thumb.url;
            img.addEventListener('error', () => {
                status.textContent = 'No preview';
                if (img.isConnected) img.replaceWith(status);
            });
            status.replaceWith(img);
            hint.textContent = 'Tap the thumbnail to view full screen';
        } else {
            status.textContent = 'No preview';
            hint.textContent = 'Drive has no thumbnail. Tap to open the viewer.';
        }
        thumbBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            openImageFull(file, { thumbUrl: thumb.url, meta, row });
        });
    } catch (err) {
        if (openPreview?.panel !== panel) return;
        status.textContent = 'Not loaded';
        hint.textContent = friendlyError(err, 'Could not load the thumbnail');
        panel.classList.add('is-error');
    } finally {
        busyId = '';
    }
}

// ---------------------------------------------------------------------------
// Full-screen viewer

function wireViewer() {
    if (viewerWired) return;
    const els = getEls();
    const dialog = els.imageViewer;
    if (!dialog || !els.imageViewerStage || !els.imageViewerImg) return;
    viewerWired = true;
    zoom = createImageZoom(els.imageViewerStage, els.imageViewerImg, {
        onTap: () => dialog.classList.toggle('is-chrome-hidden'),
        onDismiss: () => dialog.close(),
        onDrag: (progress) => dialog.style.setProperty('--viewer-dim', String(1 - progress * 0.75)),
        onSettle: () => maybeLoadDetail(),
        onSwipe: (direction) => stepViewer(direction === 'next' ? 1 : -1),
        canSwipe: (direction) => canStep(direction === 'next' ? 1 : -1),
    });
    // Every bitmap swap (thumbnail → screen copy → original) re-measures the fit.
    els.imageViewerImg.addEventListener('load', () => zoom?.layout());
    dialog.addEventListener('close', closeSession);
    dialog.addEventListener('keydown', (event) => {
        if (event.target instanceof HTMLButtonElement && (event.key === 'Enter' || event.key === ' ')) return;
        if (event.key === 'ArrowRight') stepViewer(1);
        else if (event.key === 'ArrowLeft') stepViewer(-1);
        else if (event.key === '+' || event.key === '=') zoom?.zoomBy(1.5);
        else if (event.key === '-' || event.key === '_') zoom?.zoomBy(1 / 1.5);
        else if (event.key === '0') zoom?.resetZoom();
        else return;
        event.preventDefault();
    });
    els.imageViewerClose?.addEventListener('click', () => dialog.close());
    els.imageViewerPrev?.addEventListener('click', () => stepViewer(-1));
    els.imageViewerNext?.addEventListener('click', () => stepViewer(1));
    els.imageViewerOriginal?.addEventListener('click', () => {
        if (session?.item) loadOriginalIntoViewer(session.item);
    });
}

/** Clear the picture and per-image UI (zoom, status, button). */
function clearViewerPicture() {
    const els = getEls();
    zoom?.reset();
    if (els.imageViewerImg) {
        els.imageViewerImg.removeAttribute('src');
        delete els.imageViewerImg.dataset.ready;
    }
    els.imageViewerStage?.classList.remove('is-loading');
    setOriginalButton(null);
    setViewerStatus('');
    if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
    viewerObjectUrl = '';
}

function closeSession() {
    session?.item?.abort.abort();
    session = null;
    clearViewerPicture();
    const els = getEls();
    els.imageViewer?.classList.remove('is-chrome-hidden');
    els.imageViewer?.style.removeProperty('--viewer-dim');
}

function setViewerStatus(text, kind = '') {
    const el = getEls().imageViewerStatus;
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    el.dataset.kind = kind;
    // Errors and progress should never be hidden behind a tap-to-hide.
    if (text && kind) getEls().imageViewer?.classList.remove('is-chrome-hidden');
}

/** @param {string|null} label null hides the button */
function setOriginalButton(label, disabled = false) {
    const btn = getEls().imageViewerOriginal;
    if (!btn) return;
    btn.hidden = label == null;
    btn.disabled = disabled;
    if (label != null) btn.textContent = label;
}

function originalButtonLabel(file, meta) {
    const size = formatBytes(meta?.size || file?.size);
    return size ? `Full resolution · ${size}` : 'Full resolution';
}

function canStep(delta) {
    if (!session) return false;
    const next = session.index + delta;
    return next >= 0 && next < session.files.length;
}

/** Title, “3 / 12”, and which arrows show. */
function syncViewerNav() {
    const els = getEls();
    const file = session?.item?.file;
    const total = session?.files.length || 0;
    if (els.imageViewerTitle) els.imageViewerTitle.textContent = file?.name || 'Image';
    if (els.imageViewerImg) els.imageViewerImg.alt = file?.name || 'Image';
    if (els.imageViewerCount) {
        els.imageViewerCount.hidden = total < 2;
        els.imageViewerCount.textContent = total > 1 ? `${session.index + 1} / ${total}` : '';
    }
    // Arrows stay in place (dimmed) at the ends so the bar never jumps; hidden for a single image.
    for (const [btn, delta] of [
        [els.imageViewerPrev, -1],
        [els.imageViewerNext, 1],
    ]) {
        if (!btn) continue;
        btn.hidden = total < 2;
        btn.disabled = !canStep(delta);
    }
    els.imageViewerControls?.classList.toggle('is-single', total < 2);
}

/** Abortable pause. Resolves early (without error) when aborted. */
function pause(ms, signal) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            'abort',
            () => {
                clearTimeout(timer);
                resolve();
            },
            { once: true }
        );
    });
}

/**
 * Decode a blob off-screen, then swap it in — the current picture stays up
 * until the new one is ready, and a failed decode leaves it untouched.
 * @returns {Promise<boolean>}
 */
async function showInViewer(blob, signal) {
    const els = getEls();
    const img = els.imageViewerImg;
    const url = URL.createObjectURL(blob);
    try {
        const probe = new Image();
        probe.src = url;
        await probe.decode();
    } catch {
        URL.revokeObjectURL(url);
        return false;
    }
    if (signal?.aborted || !img.isConnected || !getEls().imageViewer?.open) {
        URL.revokeObjectURL(url);
        return false;
    }
    const previous = viewerObjectUrl;
    viewerObjectUrl = url;
    img.src = url;
    img.dataset.ready = '1';
    els.imageViewerStage?.classList.remove('is-loading');
    if (previous && previous !== url) URL.revokeObjectURL(previous);
    return true;
}

/** The images in the same Finder / Pinned group as `row`, in on-screen order. */
function siblingImages(row, file) {
    const list = row?.closest?.('.file-group-list');
    const files = list
        ? [...list.querySelectorAll(':scope > .file-row--image')].map((r) => fileForRow(r)).filter(Boolean)
        : [];
    const index = files.findIndex((f) => f.id === file.id);
    if (index < 0) return { files: [file], index: 0 };
    files[index] = file; // the tapped copy may carry fresher metadata
    return { files, index };
}

/**
 * Second tap (on the thumbnail): full screen. Steps through the other images in
 * the same group with the arrows, swipes, or ←/→.
 */
async function openImageFull(file, { thumbUrl, meta, row }) {
    if (busyId) {
        warnBusy();
        return;
    }
    const els = getEls();
    const dialog = els.imageViewer;
    // dialog.open is set synchronously below, so a double tap cannot open twice.
    if (!dialog || !els.imageViewerImg || dialog.open) return;
    wireViewer();
    closeSession();
    const { files, index } = siblingImages(row, file);
    session = { files, index, item: null };
    dialog.showModal();
    els.imageViewerClose?.focus({ preventScroll: true });
    await showViewerItem(index, { thumbUrl, meta, settled: true });
}

function stepViewer(delta) {
    if (!session || !canStep(delta)) return;
    showViewerItem(session.index + delta, {});
}

/** How long to stay on an image before its screen copy loads (flicking past costs only thumbnails). */
const STEP_SETTLE_MS = 450;

/**
 * Show one image: thumbnail first (from cache, or one small download), then the
 * screen-sized copy. Stepping away cancels whatever this image was still loading.
 */
async function showViewerItem(index, { thumbUrl = '', meta = null, settled = false }) {
    if (!session || index < 0 || index >= session.files.length) return;
    session.item?.abort.abort();
    const file = session.files[index];
    /** @type {ViewerItem} */
    const item = {
        file,
        meta,
        abort: new AbortController(),
        originalShown: false,
        detailDeclined: needsConvertedImage(file),
        loadingOriginal: false,
    };
    session.index = index;
    session.item = item;
    const signal = item.abort.signal;
    const els = getEls();

    clearViewerPicture();
    syncViewerNav();
    els.imageViewerStage?.classList.add('is-loading');

    // 1. Thumbnail.
    let thumb = thumbUrl ? { url: thumbUrl, meta } : null;
    if (!thumb) {
        const memo = thumbsInMemory.get(file.id);
        if (!memo) setViewerStatus('Loading thumbnail…', 'progress');
        try {
            thumb = await loadThumbnail(file, { signal });
        } catch (err) {
            if (signal.aborted) return;
            els.imageViewerStage?.classList.remove('is-loading');
            setViewerStatus(friendlyError(err, 'Could not load this image'), 'error');
            return;
        }
        if (signal.aborted) return;
    }
    item.meta = { ...(thumb.meta || {}), ...(item.meta || {}) };
    item.meta.size = item.meta.size || file.size;
    zoom?.setFullDims(item.meta.imageMediaMetadata?.width, item.meta.imageMediaMetadata?.height);
    if (thumb.url) els.imageViewerImg.src = thumb.url;
    setViewerStatus('');

    // 2. Screen copy — after a short pause when stepping, so fast flicking stays cheap.
    if (!settled) {
        await pause(STEP_SETTLE_MS, signal);
        if (signal.aborted) return;
    }
    await showBestCopy(item, signal);
    if (!signal.aborted) maybeLoadDetail();
}

async function showBestCopy(item, signal) {
    const { file } = item;
    const meta = item.meta;
    const els = getEls();
    const canShowOriginal = !needsConvertedImage(file);
    const offerOriginal = () => {
        if (!signal.aborted) setOriginalButton(canShowOriginal ? originalButtonLabel(file, meta) : null);
    };
    const zoomHint = 'Pinch or double-tap to zoom';

    // Cache first: an original beats a screen copy, and both are free.
    const cachedOriginal = canShowOriginal ? await readCachedFull('original', file) : null;
    if (signal.aborted) return;
    if (cachedOriginal && (await showInViewer(cachedOriginal, signal))) {
        item.originalShown = true;
        setViewerStatus(`Full resolution (saved on this device) · ${zoomHint}`);
        return;
    }
    const cachedScreen = await readCachedFull('screen', file);
    if (signal.aborted) return;
    if (cachedScreen && (await showInViewer(cachedScreen, signal))) {
        setViewerStatus(`Screen copy (saved on this device) · ${zoomHint}`);
        offerOriginal();
        return;
    }

    const gate = await ensureAllowed('screen', EXPECTED_SCREEN_BYTES);
    if (signal.aborted) return;
    if (!gate.ok) {
        els.imageViewerStage?.classList.remove('is-loading');
        setViewerStatus(gate.message, 'error');
        offerOriginal();
        return;
    }

    setViewerStatus('Loading a screen-sized copy…', 'progress');
    const meter = startMeter('screen');
    try {
        const fresh = await currentMetadata(file.id, signal);
        if (!meta?.imageMediaMetadata && fresh?.imageMediaMetadata) {
            item.meta = { ...meta, imageMediaMetadata: fresh.imageMediaMetadata };
            zoom?.setFullDims(fresh.imageMediaMetadata.width, fresh.imageMediaMetadata.height);
        }
        const link = fresh.thumbnailLink;
        const px = screenCopyPx(window.screen?.width || innerWidth, window.screen?.height || innerHeight, devicePixelRatio);
        const blob = link
            ? await fetchCdnImage(sizedThumbnailUrl(link, px), {
                  maxBytes: SCREEN_COPY_MAX_BYTES,
                  timeoutMs: SCREEN_TIMEOUT_MS,
                  meter,
                  signal,
              })
            : null;
        meter.done(); // record bytes now so the “Today” line below includes them
        if (signal.aborted) return;
        if (!blob) {
            els.imageViewerStage?.classList.remove('is-loading');
            setViewerStatus(
                canShowOriginal
                    ? 'No screen-sized copy from Google. Load full resolution only if you need it.'
                    : 'No preview available for this image.',
                'error'
            );
            offerOriginal();
            return;
        }
        if (await showInViewer(blob, signal)) {
            setViewerStatus(`Screen copy · ${formatBytes(blob.size)} · ${usageLine()} · ${zoomHint}`);
            writeCachedFull('screen', file.id, blob, item.meta);
        } else if (!signal.aborted) {
            els.imageViewerStage?.classList.remove('is-loading');
            setViewerStatus('This image could not be displayed.', 'error');
        }
        offerOriginal();
    } catch (err) {
        if (signal.aborted) return;
        els.imageViewerStage?.classList.remove('is-loading');
        setViewerStatus(friendlyError(err, 'Could not load the image'), 'error');
        offerOriginal();
    } finally {
        meter.done();
    }
}

/**
 * Zoom settled: if the screen copy is now too coarse, fetch the original once.
 * Same guards as the button (confirm when big, limits, caps). Declining or a
 * refusal stops further zoom-triggered attempts for this image.
 */
function maybeLoadDetail() {
    const item = session?.item;
    const img = getEls().imageViewerImg;
    if (!item || !zoom || !img || item.originalShown || item.detailDeclined || item.loadingOriginal) return;
    if (img.dataset.ready !== '1' || zoom.scale <= 1.01) return;
    const shown = Math.max(img.naturalWidth, img.naturalHeight);
    const w = item.meta?.imageMediaMetadata?.width || 0;
    const h = item.meta?.imageMediaMetadata?.height || 0;
    if (!wantsMoreDetail(zoom.displayDevicePx, shown, Math.max(w, h))) return;
    loadOriginalIntoViewer(item, { fromZoom: true });
}

/**
 * Guard an original download: size cap, confirm when big / unknown, daily budget.
 * @returns {Promise<{ ok: true, size: number } | { ok: false, message: string }>}
 */
async function approveOriginal(file, meta, { maxBytes }) {
    const size = Number(meta?.size || file?.size) || 0;
    if (size > maxBytes) {
        return {
            ok: false,
            message: `The original is ${formatBytes(size)} — too large to load here (limit ${formatBytes(maxBytes)}).`,
        };
    }
    if (!size || size > ORIGINAL_CONFIRM_BYTES) {
        const ok = await promptLargeFile(getEls().largeFileDialog, {
            title: size ? 'Large image' : 'Unknown image size',
            message: size
                ? `The full-resolution image is ${formatBytes(size)}. Download it anyway?`
                : `Drive did not report this image’s size. Download it anyway? It will stop at ${formatBytes(maxBytes)}.`,
        });
        if (!ok) return { ok: false, message: '' };
    }
    const gate = await ensureAllowed('original', size);
    if (!gate.ok) return gate;
    return { ok: true, size };
}

/** Byte cap for an original: its reported size plus a little slack, never above `maxBytes`. */
function originalCap(size, maxBytes) {
    return size ? Math.min(maxBytes, Math.ceil(size * 1.05) + 64 * 1024) : maxBytes;
}

/**
 * @param {(received: number) => void} [onProgress]
 */
async function downloadOriginal(file, size, maxBytes, signal, onProgress) {
    const t = timeoutSignal(ORIGINAL_TIMEOUT_MS, signal);
    const meter = startMeter('original');
    let received = 0;
    try {
        const response = await openFileDownload(file.id, { signal: t.signal });
        return await readBodyCapped(response, originalCap(size, maxBytes), (n) => {
            meter.add(n);
            received += n;
            onProgress?.(received);
        });
    } catch (err) {
        if (t.signal.aborted && !signal?.aborted) throw t.signal.reason || err;
        throw err;
    } finally {
        meter.done();
        t.clear();
    }
}

/** @param {ViewerItem} item */
async function loadOriginalIntoViewer(item, { fromZoom = false } = {}) {
    if (item.loadingOriginal || item.originalShown) return;
    item.loadingOriginal = true;
    const { file, meta } = item;
    const signal = item.abort.signal;
    try {
        setOriginalButton(originalButtonLabel(file, meta), true);
        const approved = await approveOriginal(file, meta, { maxBytes: ORIGINAL_VIEW_MAX_BYTES });
        if (signal.aborted) return;
        if (!approved.ok) {
            // Don’t keep asking on every pinch after a no / a limit.
            item.detailDeclined = true;
            if (approved.message) setViewerStatus(approved.message, 'error');
            setOriginalButton(originalButtonLabel(file, meta));
            return;
        }
        const total = approved.size;
        const label = fromZoom ? 'Loading full resolution' : 'Downloading full resolution';
        setViewerStatus(total ? `${label} · ${formatBytes(total)}` : `${label}…`, 'progress');
        let lastPct = -1;
        const blob = await downloadOriginal(file, total, ORIGINAL_VIEW_MAX_BYTES, signal, (received) => {
            if (!total || signal.aborted) return;
            const pct = Math.min(99, Math.floor((received / total) * 100));
            if (pct === lastPct) return;
            lastPct = pct;
            setViewerStatus(`${label} · ${pct}% of ${formatBytes(total)}`, 'progress');
        });
        if (signal.aborted) return;
        if (await showInViewer(blob, signal)) {
            item.originalShown = true;
            setViewerStatus(`Full resolution · ${formatBytes(blob.size)} · ${usageLine()}`);
            setOriginalButton(null);
            writeCachedFull('original', file.id, blob, meta);
        } else if (!signal.aborted) {
            item.detailDeclined = true;
            setViewerStatus('This browser cannot display the full-resolution format.', 'error');
            setOriginalButton(null);
        }
    } catch (err) {
        if (signal.aborted) return;
        item.detailDeclined = true;
        setViewerStatus(friendlyError(err, 'Could not load full resolution'), 'error');
        setOriginalButton(originalButtonLabel(file, meta));
    } finally {
        item.loadingOriginal = false;
    }
}

/**
 * Item menu → Download for an image: same guards as the viewer’s original
 * (confirm when big, daily budget, byte cap, timeout). Reuses a saved original.
 * @returns {Promise<Blob|null>} null when cancelled or refused (status already shown)
 */
export async function downloadImageOriginal(file) {
    if (busyId) {
        warnBusy();
        return null;
    }
    const lock = `download:${file.id}`;
    busyId = lock;
    try {
        if (!needsConvertedImage(file)) {
            const cached = await readCachedFull('original', file);
            if (cached) return cached;
        }
        let meta = file;
        if (!Number(file.size)) {
            try {
                meta = await currentMetadata(file.id);
            } catch {
                meta = file;
            }
        }
        // Explicit download: a known size has no view cap (the stream still stops just past
        // that size); an unknown size stops at the viewer cap.
        const knownSize = Number(meta?.size || file?.size) || 0;
        const maxBytes = knownSize ? Number.MAX_SAFE_INTEGER : ORIGINAL_VIEW_MAX_BYTES;
        const approved = await approveOriginal(file, meta, { maxBytes });
        if (!approved.ok) {
            if (approved.message) showAppToast(approved.message, 'warn', { key: 'image-download' });
            return null;
        }
        return await downloadOriginal(file, approved.size, maxBytes);
    } catch (err) {
        throw new Error(friendlyError(err, 'Download failed'));
    } finally {
        if (busyId === lock) busyId = '';
    }
}

// ---------------------------------------------------------------------------

/** Drop any open preview (e.g. Finder re-rendered or the user signed out). */
export function resetImagePreviews() {
    closeOpenPreview();
}

/**
 * Remove every cached image from this device (sign-out).
 * The daily usage ledger is kept on purpose — signing out must not reset limits.
 */
export async function clearImageCaches() {
    closeOpenPreview();
    if (getEls().imageViewer?.open) getEls().imageViewer.close();
    for (const entry of thumbsInMemory.values()) {
        if (entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url);
    }
    thumbsInMemory.clear();
    metaById.clear();
    try {
        localStorage.removeItem(FULL_INDEX_KEY);
    } catch {
        // ignore
    }
    try {
        if (typeof caches !== 'undefined') {
            await Promise.all([caches.delete(THUMB_CACHE), caches.delete(FULL_CACHE)]);
        }
    } catch {
        // ignore
    }
}
