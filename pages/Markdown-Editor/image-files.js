/**
 * Pure helpers for image files in Finder. No DOM, no network — see image-preview.js.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';
const IMAGE_NAME_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|heif|tiff?)$/i;

/** Formats most browsers cannot decode — show Google’s converted rendition instead. */
const NEEDS_CONVERTED_MIME = new Set(['image/heic', 'image/heif', 'image/tiff']);
const NEEDS_CONVERTED_NAME_RE = /\.(heic|heif|tiff?)$/i;

const MB = 1024 * 1024;

/** Thumbnail edge in device pixels (≈160 CSS px on a 2× screen). */
export const THUMBNAIL_PX = 320;
/** Screen-sized copy for full screen: long edge bounds in device pixels. */
export const SCREEN_COPY_MIN_PX = 800;
export const SCREEN_COPY_MAX_PX = 2048;

/** Hard stops while streaming — the download is cut off past these. */
export const THUMBNAIL_MAX_BYTES = 512 * 1024;
export const SCREEN_COPY_MAX_BYTES = 4 * MB;
/** Originals bigger than this never open in the viewer (Download in ⋮ still can, after asking). */
export const ORIGINAL_VIEW_MAX_BYTES = 30 * MB;
/** Ask before downloading an original larger than this (or of unknown size). */
export const ORIGINAL_CONFIRM_BYTES = 10 * MB;

/** All image bytes downloaded per day, before asking to allow more. */
export const DAILY_IMAGE_BYTES = 50 * MB;
/** How much each “allow more today” adds. */
export const DAILY_EXTRA_BYTES = 25 * MB;
/** Network loads per rolling hour (cache hits are free and not counted). */
export const HOURLY_LIMITS = Object.freeze({ thumb: 60, screen: 30, original: 10 });
/** Estimate for loads we cannot measure (an <img> fallback). */
export const UNMEASURED_THUMB_BYTES = 64 * 1024;

/** Total budget for cached full-screen images on this device. */
export const FULL_CACHE_BUDGET_BYTES = 60 * MB;
/** Never keep a single full-screen image bigger than this in the cache. */
export const FULL_CACHE_MAX_ITEM_BYTES = 20 * MB;

/**
 * A real image file, not a Google Drawing / folder.
 * @param {{ mimeType?: string, name?: string }} file
 */
export function isImageFile(file) {
    if (!file || file.mimeType === FOLDER_MIME) return false;
    const mime = String(file.mimeType || '');
    if (mime.startsWith(GOOGLE_NATIVE_PREFIX)) return false;
    if (mime.startsWith('image/')) return true;
    if (mime && mime !== 'application/octet-stream') return false;
    return IMAGE_NAME_RE.test(String(file.name || ''));
}

/**
 * True when the browser probably cannot show the original bytes.
 * @param {{ mimeType?: string, name?: string }} file
 */
export function needsConvertedImage(file) {
    const mime = String(file?.mimeType || '').toLowerCase();
    if (NEEDS_CONVERTED_MIME.has(mime)) return true;
    return NEEDS_CONVERTED_NAME_RE.test(String(file?.name || ''));
}

/**
 * Drive thumbnail links end in `=s220` (or similar). Swap in our own size.
 * Unknown shapes come back unchanged rather than guessing.
 * @param {string} link
 * @param {number} px
 */
export function sizedThumbnailUrl(link, px) {
    const raw = String(link || '');
    if (!raw) return '';
    const size = Math.max(16, Math.round(Number(px) || THUMBNAIL_PX));
    if (/=s\d+(-[a-z0-9-]*)?$/i.test(raw)) return raw.replace(/=s\d+(-[a-z0-9-]*)?$/i, `=s${size}`);
    return raw;
}

/**
 * @param {number|string} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    const mb = n / 1024 / 1024;
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * A cached copy is usable when we cannot tell it is stale.
 * Pinned rows may not know modifiedTime yet — trust the cache then.
 * @param {string|null|undefined} cachedModified
 * @param {string|null|undefined} listedModified
 */
export function isCachedImageFresh(cachedModified, listedModified) {
    if (!listedModified || !cachedModified) return true;
    return String(cachedModified) === String(listedModified);
}

/**
 * Which entries to drop so `incoming` bytes fit the budget. Oldest use first.
 * @param {Array<{ id: string, bytes: number, at: number }>} index
 * @param {number} incoming
 * @param {number} [budget]
 * @returns {string[]} ids to evict
 */
export function pickCacheEvictions(index, incoming, budget = FULL_CACHE_BUDGET_BYTES) {
    const entries = Array.isArray(index) ? [...index] : [];
    entries.sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
    let total = entries.reduce((sum, e) => sum + (Number(e.bytes) || 0), 0) + (Number(incoming) || 0);
    const evict = [];
    for (const entry of entries) {
        if (total <= budget) break;
        evict.push(entry.id);
        total -= Number(entry.bytes) || 0;
    }
    return evict;
}

/**
 * Long edge for a full-screen copy: enough for this screen, never more than 2048.
 * @param {number} width CSS px
 * @param {number} height CSS px
 * @param {number} [dpr]
 */
export function screenCopyPx(width, height, dpr = 1) {
    const edge = Math.max(Number(width) || 0, Number(height) || 0) * Math.min(Math.max(Number(dpr) || 1, 1), 3);
    return Math.min(SCREEN_COPY_MAX_PX, Math.max(SCREEN_COPY_MIN_PX, Math.ceil(edge)));
}

/** Local calendar day, e.g. 2026-10-13. */
export function localDayKey(now = Date.now()) {
    const d = new Date(now);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Today’s image usage ledger. A new day starts at zero; hour-old events drop off.
 * @param {any} raw stored value
 * @param {number} [now]
 * @returns {{ day: string, bytes: number, allowance: number, events: Array<{ t: number, k: string }> }}
 */
export function normalizeImageUsage(raw, now = Date.now()) {
    const day = localDayKey(now);
    const sameDay = raw && typeof raw === 'object' && raw.day === day;
    const events = Array.isArray(raw?.events)
        ? raw.events.filter((e) => e && Number(e.t) > now - 60 * 60 * 1000 && Number(e.t) <= now && typeof e.k === 'string')
        : [];
    return {
        day,
        bytes: sameDay ? Math.max(0, Number(raw.bytes) || 0) : 0,
        allowance: sameDay ? Math.max(DAILY_IMAGE_BYTES, Number(raw.allowance) || 0) : DAILY_IMAGE_BYTES,
        events,
    };
}

/**
 * May we start a network load of this kind?
 * @param {ReturnType<typeof normalizeImageUsage>} usage
 * @param {{ kind: 'thumb'|'screen'|'original', bytes?: number }} request expected bytes (0 if unknown)
 * @param {number} [now]
 * @returns {{ ok: true } | { ok: false, reason: 'hourly', retryInMs: number } | { ok: false, reason: 'daily' }}
 */
export function checkImageUsage(usage, { kind, bytes = 0 }, now = Date.now()) {
    const limit = HOURLY_LIMITS[kind] ?? 0;
    const recent = usage.events.filter((e) => e.k === kind).sort((a, b) => a.t - b.t);
    if (recent.length >= limit) {
        const oldest = recent[recent.length - limit];
        return { ok: false, reason: 'hourly', retryInMs: Math.max(1000, oldest.t + 60 * 60 * 1000 - now) };
    }
    if (usage.bytes >= usage.allowance || usage.bytes + (Number(bytes) || 0) > usage.allowance) {
        return { ok: false, reason: 'daily' };
    }
    return { ok: true };
}

/**
 * @param {ReturnType<typeof normalizeImageUsage>} usage
 * @param {{ kind: string, bytes: number }} load
 * @param {number} [now]
 */
export function recordImageUsage(usage, { kind, bytes }, now = Date.now()) {
    return {
        ...usage,
        bytes: usage.bytes + Math.max(0, Number(bytes) || 0),
        events: [...usage.events, { t: now, k: kind }],
    };
}

/** Error thrown when a body runs past its byte cap. */
export class ImageTooLargeError extends Error {
    constructor(maxBytes) {
        super(`Stopped: image is larger than ${formatBytes(maxBytes)}`);
        this.name = 'ImageTooLargeError';
        this.maxBytes = maxBytes;
    }
}

/**
 * Read a response body but stop as soon as it passes `maxBytes`.
 * Checks Content-Length first so an oversized file is refused before streaming.
 * `onBytes` sees every received chunk size (including a cut-off tail) for the usage ledger.
 * @param {Response} response
 * @param {number} maxBytes
 * @param {(n: number) => void} [onBytes]
 * @returns {Promise<Blob>}
 */
export async function readBodyCapped(response, maxBytes, onBytes = () => {}) {
    const type = response.headers.get('Content-Type') || '';
    const declared = Number(response.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
        try {
            await response.body?.cancel();
        } catch {
            // ignore
        }
        throw new ImageTooLargeError(maxBytes);
    }
    if (!response.body?.getReader) {
        const blob = await response.blob();
        onBytes(blob.size);
        if (blob.size > maxBytes) throw new ImageTooLargeError(maxBytes);
        return blob;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        onBytes(value.byteLength);
        if (total > maxBytes) {
            try {
                await reader.cancel();
            } catch {
                // ignore
            }
            throw new ImageTooLargeError(maxBytes);
        }
        chunks.push(value);
    }
    return new Blob(chunks, { type: type.split(';')[0].trim() });
}
