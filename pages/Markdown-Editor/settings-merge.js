/**
 * Pure merge helpers for Markdown Editor cloud settings.
 * Pins use per-item timestamps + unpin tombstones so a stale empty cloud
 * list cannot wipe local shortcuts, and unpins stay unpinned across devices.
 */

import {
    FILE_TEXT_COLORS_MAX,
    PINNED_ITEMS_MAX,
    PINNED_TOMB_MAX_AGE_MS,
} from './config.js';

/**
 * @param {object} entry
 * @returns {{ id: string, name: string, mimeType: string, parentId: string, pinnedAt: number } | null}
 */
export function normalizePinnedEntry(entry) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) return null;
    const mimeType = String(entry.mimeType || 'text/markdown');
    const isFolder = mimeType === 'application/vnd.google-apps.folder';
    return {
        id: entry.id,
        name: entry.name || (isFolder ? 'Folder' : 'Untitled.md'),
        mimeType,
        parentId: typeof entry.parentId === 'string' ? entry.parentId : '',
        pinnedAt: Number(entry.pinnedAt) || 0,
    };
}

/**
 * @param {unknown} list
 * @param {number} [max]
 */
export function normalizePinnedItems(list, max = PINNED_ITEMS_MAX) {
    if (!Array.isArray(list)) return [];
    const byId = new Map();
    for (const raw of list) {
        const entry = normalizePinnedEntry(raw);
        if (!entry) continue;
        const prev = byId.get(entry.id);
        if (!prev || entry.pinnedAt >= prev.pinnedAt) byId.set(entry.id, entry);
    }
    return [...byId.values()]
        .sort((a, b) => b.pinnedAt - a.pinnedAt)
        .slice(0, max);
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
export function normalizeTombstones(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, ts] of Object.entries(raw)) {
        if (!id) continue;
        const n = Number(ts) || 0;
        if (n > 0) out[id] = n;
    }
    return out;
}

/**
 * @param {...unknown} sources
 * @returns {Record<string, number>}
 */
export function mergeTombstones(...sources) {
    const out = {};
    for (const src of sources) {
        const normalized = normalizeTombstones(src);
        for (const [id, ts] of Object.entries(normalized)) {
            if (ts > (out[id] || 0)) out[id] = ts;
        }
    }
    return out;
}

/**
 * Drop tombs that are stale or superseded by a newer pin.
 * @param {Record<string, number>} tombs
 * @param {Array<{ id: string }>} items
 * @param {number} [now]
 */
export function prunePinnedTombs(tombs, items, now = Date.now()) {
    const pinnedIds = new Set((items || []).map((entry) => entry.id));
    const cutoff = now - PINNED_TOMB_MAX_AGE_MS;
    const out = {};
    for (const [id, ts] of Object.entries(normalizeTombstones(tombs))) {
        if (pinnedIds.has(id)) continue;
        if (ts >= cutoff) out[id] = ts;
    }
    return out;
}

/**
 * @param {{
 *   localItems?: unknown,
 *   localTombs?: unknown,
 *   cloudItems?: unknown,
 *   cloudTombs?: unknown,
 *   max?: number,
 *   now?: number,
 * }} input
 * @returns {{ items: object[], tombs: Record<string, number> }}
 */
export function mergePinnedState(input = {}) {
    const max = input.max ?? PINNED_ITEMS_MAX;
    const now = input.now ?? Date.now();
    const tombs = mergeTombstones(input.localTombs, input.cloudTombs);
    const byId = new Map();
    for (const raw of [
        ...(Array.isArray(input.cloudItems) ? input.cloudItems : []),
        ...(Array.isArray(input.localItems) ? input.localItems : []),
    ]) {
        const entry = normalizePinnedEntry(raw);
        if (!entry) continue;
        const prev = byId.get(entry.id);
        if (!prev || entry.pinnedAt >= prev.pinnedAt) byId.set(entry.id, entry);
    }

    const items = [];
    for (const entry of byId.values()) {
        const tomb = tombs[entry.id] || 0;
        if (tomb && tomb >= entry.pinnedAt) continue;
        items.push(entry);
    }
    items.sort((a, b) => b.pinnedAt - a.pinnedAt);
    const trimmed = items.slice(0, max);
    return { items: trimmed, tombs: prunePinnedTombs(tombs, trimmed, now) };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function normalizeHexColorMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, value] of Object.entries(raw)) {
        if (!id) continue;
        const hex = String(value || '').trim();
        const match = hex.match(/^#?([0-9a-f]{6})$/i);
        if (match) out[id] = `#${match[1].toLowerCase()}`;
    }
    return out;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
export function normalizeColorTimes(raw) {
    return normalizeTombstones(raw);
}

/**
 * Last-write-wins per file id. A newer timestamp with no hex means "cleared".
 * @param {{
 *   localColors?: unknown,
 *   localAt?: unknown,
 *   cloudColors?: unknown,
 *   cloudAt?: unknown,
 *   max?: number,
 * }} input
 * @returns {{ colors: Record<string, string>, at: Record<string, number> }}
 */
export function mergeFileTextColors(input = {}) {
    const max = input.max ?? FILE_TEXT_COLORS_MAX;
    const localColors = normalizeHexColorMap(input.localColors);
    const cloudColors = normalizeHexColorMap(input.cloudColors);
    const localAt = normalizeColorTimes(input.localAt);
    const cloudAt = normalizeColorTimes(input.cloudAt);
    const ids = new Set([
        ...Object.keys(localColors),
        ...Object.keys(cloudColors),
        ...Object.keys(localAt),
        ...Object.keys(cloudAt),
    ]);

    const colors = {};
    const at = {};
    for (const id of ids) {
        const lAt = localAt[id] || 0;
        const cAt = cloudAt[id] || 0;
        let hex = '';
        let ts = 0;
        if (cAt > lAt) {
            hex = cloudColors[id] || '';
            ts = cAt;
        } else if (lAt > cAt) {
            hex = localColors[id] || '';
            ts = lAt;
        } else if (cloudColors[id]) {
            hex = cloudColors[id];
            ts = cAt;
        } else if (localColors[id]) {
            hex = localColors[id];
            ts = lAt;
        }
        if (ts) at[id] = ts;
        if (hex) colors[id] = hex;
        if (Object.keys(colors).length >= max && Object.keys(at).length >= max) break;
    }

    const colorIds = Object.keys(colors);
    if (colorIds.length > max) {
        const keep = new Set(colorIds.slice(0, max));
        for (const id of Object.keys(colors)) {
            if (!keep.has(id)) delete colors[id];
        }
    }
    return { colors, at };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, true>}
 */
export function normalizeBoldMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, value] of Object.entries(raw)) {
        if (!id) continue;
        if (value === true || value === 1 || value === '1') out[id] = true;
    }
    return out;
}

/**
 * Last-write-wins per file id. A newer timestamp with no bold flag means "cleared".
 * @param {{
 *   localBold?: unknown,
 *   localAt?: unknown,
 *   cloudBold?: unknown,
 *   cloudAt?: unknown,
 *   max?: number,
 * }} input
 * @returns {{ bold: Record<string, true>, at: Record<string, number> }}
 */
export function mergeFileTextBold(input = {}) {
    const max = input.max ?? FILE_TEXT_COLORS_MAX;
    const localBold = normalizeBoldMap(input.localBold);
    const cloudBold = normalizeBoldMap(input.cloudBold);
    const localAt = normalizeColorTimes(input.localAt);
    const cloudAt = normalizeColorTimes(input.cloudAt);
    const ids = new Set([
        ...Object.keys(localBold),
        ...Object.keys(cloudBold),
        ...Object.keys(localAt),
        ...Object.keys(cloudAt),
    ]);

    const bold = {};
    const at = {};
    for (const id of ids) {
        const lAt = localAt[id] || 0;
        const cAt = cloudAt[id] || 0;
        let on = false;
        let ts = 0;
        if (cAt > lAt) {
            on = Boolean(cloudBold[id]);
            ts = cAt;
        } else if (lAt > cAt) {
            on = Boolean(localBold[id]);
            ts = lAt;
        } else if (cloudBold[id]) {
            on = true;
            ts = cAt;
        } else if (localBold[id]) {
            on = true;
            ts = lAt;
        }
        if (ts) at[id] = ts;
        if (on) bold[id] = true;
        if (Object.keys(bold).length >= max && Object.keys(at).length >= max) break;
    }

    const boldIds = Object.keys(bold);
    if (boldIds.length > max) {
        const keep = new Set(boldIds.slice(0, max));
        for (const id of Object.keys(bold)) {
            if (!keep.has(id)) delete bold[id];
        }
    }
    return { bold, at };
}

function objectMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function mapKeyCount(value) {
    return objectMap(value) ? Object.keys(value).length : 0;
}

/**
 * Normalize a parsed settings JSON object. Empty `{}` / version-only blobs
 * still return a structured object so callers can inspect them.
 * @param {unknown} parsed
 */
export function normalizeCloudSettings(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const pinnedTombs =
        objectMap(parsed.pinnedTombs) || objectMap(parsed.unpinnedAt) || undefined;
    return {
        version: Number(parsed.version) || 0,
        updatedAt: Number(parsed.updatedAt) || 0,
        theme: parsed.theme,
        previewTocSticky:
            typeof parsed.previewTocSticky === 'boolean' ? parsed.previewTocSticky : undefined,
        previewTocOpen:
            typeof parsed.previewTocOpen === 'boolean' ? parsed.previewTocOpen : undefined,
        pwaTopGap: parsed.pwaTopGap,
        pwaBottomOffset: parsed.pwaBottomOffset,
        previewFontScale: parsed.previewFontScale,
        listStripe: parsed.listStripe,
        listLayout: parsed.listLayout,
        defaultEditView: parsed.defaultEditView,
        doubleTapCopy:
            typeof parsed.doubleTapCopy === 'boolean' ? parsed.doubleTapCopy : undefined,
        showFileExtensions:
            typeof parsed.showFileExtensions === 'boolean'
                ? parsed.showFileExtensions
                : undefined,
        blockingSave: typeof parsed.blockingSave === 'boolean' ? parsed.blockingSave : undefined,
        showDates: typeof parsed.showDates === 'boolean' ? parsed.showDates : undefined,
        finderMdOrder: objectMap(parsed.finderMdOrder),
        finderSort: parsed.finderSort,
        pinnedItems: Array.isArray(parsed.pinnedItems) ? parsed.pinnedItems : undefined,
        pinnedTombs,
        openedFiles: objectMap(parsed.openedFiles),
        fileTextColors: objectMap(parsed.fileTextColors),
        fileTextColorAt: objectMap(parsed.fileTextColorAt),
        fileTextBold: objectMap(parsed.fileTextBold),
        fileTextBoldAt: objectMap(parsed.fileTextBoldAt),
    };
}

/**
 * True when the blob contains a real preference — not just version/updatedAt
 * or an empty pin list. Empty pin lists must not count, or a cache-wiped
 * client will treat default local storage as "settings" and overwrite Drive.
 */
export function cloudHasPrefs(settings) {
    if (!settings) return false;
    if (settings.theme) return true;
    if (settings.listStripe) return true;
    if (settings.listLayout) return true;
    if (settings.defaultEditView) return true;
    if (settings.finderSort) return true;
    if (typeof settings.previewTocSticky === 'boolean') return true;
    if (typeof settings.previewTocOpen === 'boolean') return true;
    if (typeof settings.doubleTapCopy === 'boolean') return true;
    if (typeof settings.showFileExtensions === 'boolean') return true;
    if (typeof settings.blockingSave === 'boolean') return true;
    if (typeof settings.showDates === 'boolean') return true;
    if (settings.pwaTopGap != null) return true;
    if (settings.pwaBottomOffset != null) return true;
    if (settings.previewFontScale != null) return true;
    if (settings.finderMdOrder) return true;
    if (Array.isArray(settings.pinnedItems) && settings.pinnedItems.length) return true;
    if (mapKeyCount(settings.pinnedTombs)) return true;
    if (mapKeyCount(settings.openedFiles)) return true;
    if (mapKeyCount(settings.fileTextColors)) return true;
    if (mapKeyCount(settings.fileTextColorAt)) return true;
    if (mapKeyCount(settings.fileTextBold)) return true;
    if (mapKeyCount(settings.fileTextBoldAt)) return true;
    return false;
}

export function parseCloudSettingsText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || trimmed === '{}') return null;
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return null;
    }
    const cloud = normalizeCloudSettings(parsed);
    return cloud && cloudHasPrefs(cloud) ? cloud : null;
}

export function cloudSettingsScore(cloud) {
    if (!cloud) return 0;
    let score = 0;
    if (cloud.theme) score += 1;
    if (cloud.listStripe) score += 1;
    if (cloud.listLayout) score += 1;
    if (cloud.defaultEditView) score += 1;
    if (cloud.finderSort) score += 1;
    if (typeof cloud.previewTocSticky === 'boolean') score += 1;
    if (typeof cloud.previewTocOpen === 'boolean') score += 1;
    if (typeof cloud.doubleTapCopy === 'boolean') score += 1;
    if (typeof cloud.showFileExtensions === 'boolean') score += 1;
    if (typeof cloud.blockingSave === 'boolean') score += 1;
    if (typeof cloud.showDates === 'boolean') score += 1;
    if (cloud.pwaTopGap != null) score += 1;
    if (cloud.pwaBottomOffset != null) score += 1;
    if (cloud.previewFontScale != null) score += 1;
    if (cloud.finderMdOrder) score += 1;
    if (Array.isArray(cloud.pinnedItems)) score += cloud.pinnedItems.length * 10;
    score += Math.min(mapKeyCount(cloud.fileTextColors), 40) * 2;
    score += Math.min(mapKeyCount(cloud.fileTextBold), 40) * 2;
    score += Math.min(mapKeyCount(cloud.pinnedTombs), 20);
    score += Math.min(mapKeyCount(cloud.openedFiles), 20) * 0.25;
    const updated = Number(cloud.updatedAt) || 0;
    score += updated / 1e15;
    return score;
}

export function pickRichestCloudSettings(candidates) {
    let best = null;
    let bestScore = -1;
    for (const cloud of candidates) {
        if (!cloud) continue;
        const score = cloudSettingsScore(cloud);
        if (score > bestScore) {
            best = cloud;
            bestScore = score;
        }
    }
    return best;
}
