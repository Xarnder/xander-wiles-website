/**
 * Google Drive file revisions (v3) for Markdown-Editor version history.
 *
 * Important: Drive only allows downloading blob revision *media* for revisions
 * marked keepForever (except we use files.get for the live head). Preview/restore
 * of older revisions therefore pins on demand before download.
 */

import { driveFetch, getFileContent } from './drive.js';

const REVISION_FIELDS =
    'id,mimeType,modifiedTime,keepForever,size,originalFilename,md5Checksum';

/**
 * @typedef {{
 *   id: string,
 *   modifiedTime?: string,
 *   keepForever: boolean,
 *   size?: number,
 *   originalFilename?: string,
 *   mimeType?: string,
 *   isCurrent: boolean,
 *   type: 'automatic' | 'safety' | 'named',
 *   label?: string,
 * }} DocumentRevision
 */

/**
 * @param {object} raw
 * @param {string | null | undefined} headRevisionId
 * @returns {DocumentRevision}
 */
export function normalizeRevision(raw, headRevisionId) {
    const id = String(raw?.id || '');
    const keepForever = Boolean(raw?.keepForever);
    const isCurrent = Boolean(headRevisionId) && id === String(headRevisionId);
    /** @type {DocumentRevision['type']} */
    let type = 'automatic';
    if (keepForever && !isCurrent) type = 'safety';
    return {
        id,
        modifiedTime: raw?.modifiedTime ? String(raw.modifiedTime) : undefined,
        keepForever,
        size: raw?.size != null && raw.size !== '' ? Number(raw.size) : undefined,
        originalFilename: raw?.originalFilename ? String(raw.originalFilename) : undefined,
        mimeType: raw?.mimeType ? String(raw.mimeType) : undefined,
        isCurrent,
        type,
    };
}

/**
 * List revisions newest-first (Drive may return ascending; we sort).
 * @param {string} fileId
 * @param {{ pageSize?: number, pageToken?: string | null }} [options]
 * @returns {Promise<{ revisions: DocumentRevision[], nextPageToken: string | null, headRevisionId: string | null }>}
 */
export async function listRevisions(fileId, options = {}) {
    const pageSize = Math.min(Math.max(Number(options.pageSize) || 100, 1), 1000);
    const params = new URLSearchParams({
        fields: `nextPageToken,revisions(${REVISION_FIELDS})`,
        pageSize: String(pageSize),
    });
    if (options.pageToken) params.set('pageToken', String(options.pageToken));

    const metaParams = new URLSearchParams({
        fields: 'headRevisionId,version,modifiedTime,size',
    });
    const [listRes, metaRes] = await Promise.all([
        driveFetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/revisions?${params}`
        ),
        driveFetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${metaParams}`
        ),
    ]);

    const listBody = await listRes.json();
    const metaBody = await metaRes.json();
    const headRevisionId = metaBody?.headRevisionId ? String(metaBody.headRevisionId) : null;

    const revisions = (Array.isArray(listBody?.revisions) ? listBody.revisions : [])
        .map((raw) => normalizeRevision(raw, headRevisionId))
        .filter((rev) => rev.id)
        .sort((a, b) => {
            const ta = Date.parse(a.modifiedTime || '') || 0;
            const tb = Date.parse(b.modifiedTime || '') || 0;
            if (tb !== ta) return tb - ta;
            return String(b.id).localeCompare(String(a.id));
        });

    // Ensure current flag even if head id missing from page (rare).
    if (headRevisionId && !revisions.some((r) => r.isCurrent)) {
        const match = revisions.find((r) => r.id === headRevisionId);
        if (match) match.isCurrent = true;
    }

    return {
        revisions,
        nextPageToken: listBody?.nextPageToken ? String(listBody.nextPageToken) : null,
        headRevisionId,
    };
}

/**
 * Load every revision page (capped) newest-first.
 * @param {string} fileId
 * @param {{ maxRevisions?: number, pageSize?: number }} [options]
 */
export async function listAllRevisions(fileId, options = {}) {
    const maxRevisions = Math.max(Number(options.maxRevisions) || 200, 1);
    const pageSize = Math.min(Math.max(Number(options.pageSize) || 100, 1), 1000);
    /** @type {DocumentRevision[]} */
    const all = [];
    let pageToken = null;
    let headRevisionId = null;

    do {
        const page = await listRevisions(fileId, { pageSize, pageToken });
        headRevisionId = page.headRevisionId || headRevisionId;
        for (const rev of page.revisions) {
            if (!all.some((x) => x.id === rev.id)) all.push(rev);
        }
        pageToken = page.nextPageToken;
    } while (pageToken && all.length < maxRevisions);

    all.sort((a, b) => {
        const ta = Date.parse(a.modifiedTime || '') || 0;
        const tb = Date.parse(b.modifiedTime || '') || 0;
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
    });

    if (headRevisionId) {
        for (const rev of all) {
            rev.isCurrent = rev.id === headRevisionId;
        }
    }

    return {
        revisions: all.slice(0, maxRevisions),
        headRevisionId,
        truncated: Boolean(pageToken) || all.length > maxRevisions,
    };
}

/**
 * Drive rejects keepForever on the live head revision. Pin only a retired head
 * (the revision we just replaced by uploading new content).
 * @param {string | null | undefined} previousHeadId
 * @param {string | null | undefined} currentHeadId
 */
export function shouldProtectPreviousHead(previousHeadId, currentHeadId) {
    if (!previousHeadId) return false;
    if (currentHeadId && String(previousHeadId) === String(currentHeadId)) return false;
    return true;
}

/**
 * Mark a revision keepForever so its media can be downloaded.
 * @param {string} fileId
 * @param {string} revisionId
 * @returns {Promise<DocumentRevision>}
 */
export async function protectRevision(fileId, revisionId) {
    const params = new URLSearchParams({
        fields: REVISION_FIELDS,
    });
    const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revisionId)}?${params}`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keepForever: true }),
        }
    );
    const raw = await response.json();
    return normalizeRevision(raw, null);
}

/**
 * Clear keepForever so Drive may purge the revision later.
 * Never use this on user-named checkpoints (caller must filter).
 * @param {string} fileId
 * @param {string} revisionId
 * @returns {Promise<DocumentRevision>}
 */
export async function unprotectRevision(fileId, revisionId) {
    const params = new URLSearchParams({
        fields: REVISION_FIELDS,
    });
    const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revisionId)}?${params}`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keepForever: false }),
        }
    );
    const raw = await response.json();
    const rev = normalizeRevision(raw, null);
    rev.type = 'automatic';
    rev.keepForever = false;
    return rev;
}

/**
 * Download revision markdown text.
 * Current head uses files.get (no pin). Older revisions pin on demand if needed.
 * @param {string} fileId
 * @param {string} revisionId
 * @param {{ isCurrent?: boolean, keepForever?: boolean }} [options]
 * @returns {Promise<{ content: string, protected: boolean }>}
 */
export async function getRevisionContent(fileId, revisionId, options = {}) {
    if (options.isCurrent) {
        const content = await getFileContent(fileId);
        return { content, protected: false };
    }

    let didProtect = false;
    if (!options.keepForever) {
        await protectRevision(fileId, revisionId);
        didProtect = true;
    }

    const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revisionId)}?alt=media`
    );
    const content = await response.text();
    return { content, protected: didProtect };
}
