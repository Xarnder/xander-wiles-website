/**
 * Application metadata for protected Drive revisions (named + safety labels).
 * Stored in Drive appDataFolder JSON — not inside the markdown file.
 */

import { REVISION_META_FILE_NAME, REVISION_META_VERSION } from './config.js';
import {
    ensureAppDataFile,
    getFileContent,
    updateFileContent,
} from './drive.js';
import { listAllRevisions, unprotectRevision } from './revisions.js';

/** Keep this many newest automatic safety pins per file. */
export const SAFETY_PIN_RECENT_KEEP = 12;

/** @type {string | null} */
let metaFileId = null;
/** @type {RevisionMetaStore | null} */
let cachedStore = null;
/** Serialize appData meta read-modify-write. */
let metaWriteChain = Promise.resolve();

/**
 * @typedef {{
 *   fileId: string,
 *   revisionId: string,
 *   type: 'safety' | 'named',
 *   label?: string,
 *   createdAt: string,
 * }} RevisionMetadata
 */

/**
 * @typedef {{
 *   version: number,
 *   updatedAt: number,
 *   entries: Record<string, Record<string, RevisionMetadata>>,
 * }} RevisionMetaStore
 */

function emptyStore() {
    return {
        version: REVISION_META_VERSION,
        updatedAt: Date.now(),
        entries: {},
    };
}

/**
 * @param {unknown} raw
 * @returns {RevisionMetaStore}
 */
function normalizeStore(raw) {
    const base = emptyStore();
    if (!raw || typeof raw !== 'object') return base;
    const obj = /** @type {Record<string, unknown>} */ (raw);
    base.updatedAt = Number(obj.updatedAt) || Date.now();
    const entries = obj.entries && typeof obj.entries === 'object' ? obj.entries : {};
    /** @type {RevisionMetaStore['entries']} */
    const out = {};
    for (const [fileId, revs] of Object.entries(entries)) {
        if (!revs || typeof revs !== 'object') continue;
        out[fileId] = {};
        for (const [revisionId, meta] of Object.entries(revs)) {
            if (!meta || typeof meta !== 'object') continue;
            const m = /** @type {Record<string, unknown>} */ (meta);
            const type = m.type === 'named' ? 'named' : 'safety';
            out[fileId][revisionId] = {
                fileId: String(m.fileId || fileId),
                revisionId: String(m.revisionId || revisionId),
                type,
                label: m.label != null ? String(m.label) : undefined,
                createdAt: String(m.createdAt || new Date().toISOString()),
            };
        }
    }
    base.entries = out;
    return base;
}

async function ensureMetaFile() {
    if (metaFileId) return metaFileId;
    const file = await ensureAppDataFile(REVISION_META_FILE_NAME, JSON.stringify(emptyStore()));
    metaFileId = file.id;
    return metaFileId;
}

/**
 * @returns {Promise<RevisionMetaStore>}
 */
export async function loadRevisionMetaStore() {
    if (cachedStore) return cachedStore;
    try {
        const id = await ensureMetaFile();
        const text = await getFileContent(id);
        cachedStore = normalizeStore(JSON.parse(text || '{}'));
        return cachedStore;
    } catch {
        cachedStore = emptyStore();
        return cachedStore;
    }
}

/**
 * @param {RevisionMetaStore} store
 */
async function saveRevisionMetaStore(store) {
    const id = await ensureMetaFile();
    const payload = {
        ...store,
        version: REVISION_META_VERSION,
        updatedAt: Date.now(),
    };
    await updateFileContent(id, JSON.stringify(payload, null, 2), 'application/json');
    cachedStore = payload;
    return payload;
}

/**
 * @param {string} fileId
 * @returns {Promise<Record<string, RevisionMetadata>>}
 */
export async function getRevisionMetaForFile(fileId) {
    const store = await loadRevisionMetaStore();
    return { ...(store.entries[fileId] || {}) };
}

/**
 * @param {RevisionMetadata} meta
 */
export async function upsertRevisionMeta(meta) {
    const fileId = String(meta.fileId || '');
    const revisionId = String(meta.revisionId || '');
    if (!fileId || !revisionId) return null;

    const run = metaWriteChain.then(async () => {
        // Bypass cache so concurrent writers don't clobber each other.
        cachedStore = null;
        const store = await loadRevisionMetaStore();
        if (!store.entries[fileId]) store.entries[fileId] = {};
        store.entries[fileId][revisionId] = {
            fileId,
            revisionId,
            type: meta.type === 'named' ? 'named' : 'safety',
            label: meta.label != null ? String(meta.label) : undefined,
            createdAt: meta.createdAt || new Date().toISOString(),
        };
        await saveRevisionMetaStore(store);
        return store.entries[fileId][revisionId];
    });
    metaWriteChain = run.then(
        () => undefined,
        () => undefined
    );
    return run;
}

/**
 * Apply appData labels onto Drive revision objects (mutates list).
 * @param {string} fileId
 * @param {import('./revisions.js').DocumentRevision[]} revisions
 */
export async function enrichRevisionsWithMeta(fileId, revisions) {
    const map = await getRevisionMetaForFile(fileId);
    for (const rev of revisions) {
        const meta = map[rev.id];
        if (!meta) continue;
        if (meta.type === 'named') {
            rev.type = 'named';
            rev.label = meta.label || 'Named version';
        } else if (meta.type === 'safety') {
            rev.type = 'safety';
            if (meta.label) rev.label = meta.label;
            else if (!rev.label) rev.label = 'Safety snapshot';
        }
    }
    return revisions;
}

/**
 * Retention: keep recent safety pins; never touch named versions.
 * Unpins older automatic safety revisions (sets keepForever false).
 * @param {string} fileId
 * @param {{ keepRecent?: number }} [options]
 * @returns {Promise<{ unprotected: number, kept: number, named: number }>}
 */
export async function pruneSafetyRevisions(fileId, options = {}) {
    const keepRecent = Math.max(Number(options.keepRecent) || SAFETY_PIN_RECENT_KEEP, 1);
    let metaMap;
    try {
        metaMap = await getRevisionMetaForFile(fileId);
    } catch (err) {
        console.warn('[md-editor] pruneSafetyRevisions skipped — meta unavailable', err);
        return { unprotected: 0, kept: 0, named: 0, skipped: true };
    }

    const namedIds = new Set(
        Object.values(metaMap)
            .filter((m) => m.type === 'named')
            .map((m) => m.revisionId)
    );
    // Only prune revisions we explicitly tagged as safety — never unknown keepForever
    // (could be a named pin whose meta write failed, or a preview pin we should keep).
    const safetyIds = new Set(
        Object.values(metaMap)
            .filter((m) => m.type === 'safety')
            .map((m) => m.revisionId)
    );
    if (!safetyIds.size) {
        return { unprotected: 0, kept: 0, named: namedIds.size };
    }

    const { revisions } = await listAllRevisions(fileId, { maxRevisions: 200 });

    const candidates = revisions
        .filter(
            (rev) =>
                rev.keepForever &&
                !rev.isCurrent &&
                safetyIds.has(rev.id) &&
                !namedIds.has(rev.id)
        )
        .sort((a, b) => {
            const ta = Date.parse(a.modifiedTime || '') || 0;
            const tb = Date.parse(b.modifiedTime || '') || 0;
            return tb - ta;
        });

    const keep = candidates.slice(0, keepRecent);
    const drop = candidates.slice(keepRecent);
    let unprotected = 0;
    for (const rev of drop) {
        try {
            await unprotectRevision(fileId, rev.id);
            unprotected += 1;
        } catch (err) {
            console.warn('[md-editor] pruneSafetyRevisions failed', rev.id, err);
        }
    }

    return {
        unprotected,
        kept: keep.length,
        named: namedIds.size,
    };
}
