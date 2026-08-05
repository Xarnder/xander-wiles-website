import { PAGE_SIZE, ROOT_FOLDER_ID } from './config.js';
import { getAccessToken, refreshAccessToken } from './auth.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';

async function driveFetch(url, options = {}, retried = false) {
    let token = getAccessToken();
    if (!token && !retried) {
        try {
            await refreshAccessToken();
            token = getAccessToken();
        } catch {
            // fall through to Not signed in
        }
    }
    if (!token) {
        throw new Error('Not signed in');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 && !retried) {
        await refreshAccessToken();
        return driveFetch(url, options, true);
    }

    if (!response.ok) {
        let detail = '';
        try {
            const body = await response.json();
            detail = body?.error?.message || '';
        } catch {
            // ignore
        }
        const err = new Error(detail || `Drive API error (${response.status})`);
        err.status = response.status;
        throw err;
    }

    return response;
}

export function isFolder(file) {
    return file.mimeType === FOLDER_MIME;
}

export function isMarkdownCandidate(file) {
    if (isFolder(file)) return false;
    if (file.mimeType?.startsWith(GOOGLE_NATIVE_PREFIX)) return false;
    if (file.mimeType === 'text/markdown') return true;
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.md') || name.endsWith('.markdown');
}

/** Folders first, then markdown, then other — sorted within each group by `sortMode`. */
export function sortDriveEntries(files, sortMode = 'name-asc') {
    const mode = typeof sortMode === 'string' ? sortMode : 'name-asc';
    const rank = (file) => {
        if (isFolder(file)) return 0;
        if (isMarkdownCandidate(file)) return 1;
        return 2;
    };
    const nameCmp = (a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, {
            sensitivity: 'base',
            numeric: true,
        });
    const toMs = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        return Date.parse(value || '') || 0;
    };
    const timeCmp = (key, dir) => (a, b) => {
        const ta = toMs(a?.[key]);
        const tb = toMs(b?.[key]);
        if (ta !== tb) return dir === 'desc' ? tb - ta : ta - tb;
        return nameCmp(a, b);
    };
    const sizeCmp = (dir) => (a, b) => {
        const sa = Number(a?.size) || 0;
        const sb = Number(b?.size) || 0;
        if (sa !== sb) return dir === 'desc' ? sb - sa : sa - sb;
        return nameCmp(a, b);
    };

    /** @type {(a: object, b: object) => number} */
    let within = nameCmp;
    if (mode === 'name-desc') within = (a, b) => nameCmp(b, a);
    else if (mode === 'modified-desc') within = timeCmp('modifiedTime', 'desc');
    else if (mode === 'modified-asc') within = timeCmp('modifiedTime', 'asc');
    else if (mode === 'created-desc') within = timeCmp('createdTime', 'desc');
    else if (mode === 'created-asc') within = timeCmp('createdTime', 'asc');
    else if (mode === 'size-desc') within = sizeCmp('desc');
    else if (mode === 'size-asc') within = sizeCmp('asc');

    return [...files].sort((a, b) => {
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        return within(a, b);
    });
}

/** Map UI sort mode → Drive `orderBy` (folders still first). */
export function driveOrderByForSort(sortMode = 'name-asc') {
    switch (sortMode) {
        case 'name-desc':
            return 'folder,name_natural desc';
        case 'modified-desc':
            return 'folder,modifiedTime desc';
        case 'modified-asc':
            return 'folder,modifiedTime';
        case 'created-desc':
            return 'folder,createdTime desc';
        case 'created-asc':
            return 'folder,createdTime';
        case 'size-desc':
            return 'folder,quotaBytesUsed desc';
        case 'size-asc':
            return 'folder,quotaBytesUsed';
        case 'name-asc':
        default:
            return 'folder,name_natural';
    }
}

/**
 * List folders and markdown files in a folder.
 * Query is scoped to folders + markdown candidates so pagination matches what the UI shows.
 * @param {string} [folderId]
 * @param {string|null} [pageToken]
 * @param {{ sortMode?: string }} [options]
 * @returns {Promise<{ files: object[], nextPageToken: string|null }>}
 */
export async function listFolder(folderId = ROOT_FOLDER_ID, pageToken = null, options = {}) {
    const sortMode = options.sortMode || 'name-asc';
    const parent = folderId || ROOT_FOLDER_ID;
    const safeParent = parent.replace(/'/g, "\\'");
    const q = [
        `'${safeParent}' in parents`,
        'trashed = false',
        `(mimeType = '${FOLDER_MIME}' or mimeType = 'text/markdown' or name contains '.md' or name contains '.markdown')`,
    ].join(' and ');
    const params = new URLSearchParams({
        q,
        spaces: 'drive',
        corpora: 'user',
        pageSize: String(PAGE_SIZE),
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, createdTime, size)',
        orderBy: driveOrderByForSort(sortMode),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const data = await response.json();
    const files = sortDriveEntries(
        (data.files || []).filter((f) => isFolder(f) || isMarkdownCandidate(f)),
        sortMode
    );
    return {
        files,
        nextPageToken: data.nextPageToken || null,
    };
}

/**
 * Keep requesting pages until at least one visible entry arrives or pages run out.
 * Avoids a "Load more" click that filters down to nothing.
 * @param {(token: string|null) => Promise<{ files: object[], nextPageToken: string|null }>} fetchPage
 * @param {string|null} startToken
 * @param {{ maxPages?: number }} [options]
 */
export async function fetchVisiblePage(fetchPage, startToken, options = {}) {
    const maxPages = options.maxPages ?? 8;
    let pageToken = startToken;
    /** @type {object[]} */
    let files = [];
    let pages = 0;
    let nextPageToken = null;

    do {
        const result = await fetchPage(pageToken);
        pages += 1;
        files = files.concat(result.files || []);
        nextPageToken = result.nextPageToken || null;
        pageToken = nextPageToken;
    } while (files.length === 0 && nextPageToken && pages < maxPages);

    return { files, nextPageToken };
}

/**
 * Search markdown files across the signed-in user's entire Drive
 * (includes My Drive and typically Mac "Computers" sync locations).
 * @param {string} [nameQuery] optional name filter (without requiring .md)
 * @param {string|null} [pageToken]
 * @param {{ sortMode?: string }} [options]
 * @returns {Promise<{ files: object[], nextPageToken: string|null }>}
 */
export async function searchMarkdownFiles(nameQuery = '', pageToken = null, options = {}) {
    const sortMode = options.sortMode || 'modified-desc';
    // Broad server query; tighten client-side with isMarkdownCandidate.
    const parts = ['trashed = false', "mimeType != 'application/vnd.google-apps.folder'"];
    const trimmed = (nameQuery || '').trim();
    if (trimmed) {
        const safe = trimmed.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        parts.push(`name contains '${safe}'`);
    } else {
        // Prefer files that look like markdown without requiring a folder path.
        parts.push("(mimeType = 'text/markdown' or name contains '.md')");
    }

    // Search has no folders in results — drop the folder key from orderBy.
    const orderBy = driveOrderByForSort(sortMode).replace(/^folder,/, '') || 'modifiedTime desc';

    const params = new URLSearchParams({
        q: parts.join(' and '),
        spaces: 'drive',
        corpora: 'user',
        pageSize: String(PAGE_SIZE),
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, createdTime, size, parents)',
        orderBy,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const data = await response.json();
    const files = sortDriveEntries(
        (data.files || []).filter((f) => isMarkdownCandidate(f)),
        sortMode
    );
    return {
        files,
        nextPageToken: data.nextPageToken || null,
    };
}

/**
 * Best-effort: find top-level "Computers" folders.
 * Google does not expose a Computers corpora; these folders usually have no parents.
 * Once you have a folder id, normal listFolder(parentId) works for its children.
 * @returns {Promise<object[]>}
 */
export async function listComputerRootFolders() {
    const found = [];
    let pageToken = null;

    for (let page = 0; page < 20; page += 1) {
        const params = new URLSearchParams({
            q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            spaces: 'drive',
            corpora: 'user',
            pageSize: '100',
            fields: 'nextPageToken, files(id, name, mimeType, parents, capabilities, ownedByMe, modifiedTime, createdTime, size)',
        });
        if (pageToken) params.set('pageToken', pageToken);

        const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
        const data = await response.json();
        for (const file of data.files || []) {
            const noParents = !file.parents || file.parents.length === 0;
            const canAttach = file.capabilities?.canAddMyDriveParent === true;
            if (noParents && (canAttach || file.ownedByMe !== false)) {
                found.push(file);
            }
        }
        pageToken = data.nextPageToken || null;
        if (!pageToken) break;
    }

    const byId = new Map();
    for (const f of found) byId.set(f.id, f);
    return Array.from(byId.values()).sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, {
            sensitivity: 'base',
            numeric: true,
        })
    );
}

export async function getFileMetadata(fileId) {
    const params = new URLSearchParams({
        fields: 'id,name,mimeType,modifiedTime,createdTime,size,parents',
    });
    const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`
    );
    return response.json();
}

export async function getFileContent(fileId) {
    const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
    );
    return response.text();
}

/**
 * Last-write-wins content update for an existing file.
 */
export async function updateFileContent(fileId, text, mimeType = 'text/markdown') {
    const response = await driveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type': mimeType || 'text/plain',
            },
            body: text,
        }
    );
    return response.json();
}

function ensureMdExtension(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return 'untitled.md';
    const lower = trimmed.toLowerCase();
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return trimmed;
    return `${trimmed}.md`;
}

/**
 * Normalize a markdown note name for uniqueness checks (case-insensitive).
 * @param {string} name
 * @returns {string}
 */
export function normalizeMarkdownFileName(name) {
    return ensureMdExtension(name).toLowerCase();
}

/**
 * Suggest a unique “Copy of …” name given existing sibling names.
 * @param {string} originalName
 * @param {Iterable<string>} existingNames
 * @returns {string}
 */
export function suggestCopyFileName(originalName, existingNames = []) {
    const ensured = ensureMdExtension(originalName || 'Untitled.md');
    const lower = ensured.toLowerCase();
    const ext = lower.endsWith('.markdown') ? '.markdown' : '.md';
    const stem = ensured.slice(0, ensured.length - ext.length);
    const taken = new Set(
        [...existingNames].map((n) => normalizeMarkdownFileName(String(n || ''))).filter(Boolean)
    );

    let candidate = `Copy of ${stem}${ext}`;
    let n = 2;
    while (taken.has(normalizeMarkdownFileName(candidate))) {
        candidate = `Copy of ${stem} (${n})${ext}`;
        n += 1;
    }
    return candidate;
}

/**
 * Find files/folders in a parent with an exact name (Drive may allow duplicates;
 * we treat any match as a collision).
 * @param {string} parentId
 * @param {string} name
 * @returns {Promise<Array<{ id: string, name: string, mimeType?: string }>>}
 */
export async function findItemsByNameInFolder(parentId, name) {
    const folderId = parentId || ROOT_FOLDER_ID;
    const safeName = String(name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    if (!safeName) return [];

    /** @type {Array<{ id: string, name: string, mimeType?: string }>} */
    const found = [];
    let pageToken = null;
    do {
        const params = new URLSearchParams({
            q: `'${folderId}' in parents and name = '${safeName}' and trashed = false`,
            spaces: 'drive',
            pageSize: '50',
            fields: 'nextPageToken, files(id, name, mimeType)',
            supportsAllDrives: 'true',
            includeItemsFromAllDrives: 'true',
        });
        if (pageToken) params.set('pageToken', pageToken);
        const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
        const data = await response.json();
        for (const file of data.files || []) {
            if (file?.id) found.push(file);
        }
        pageToken = data.nextPageToken || null;
    } while (pageToken);

    return found;
}

/**
 * Server-side copy of a Drive file into the same (or specified) folder.
 * @param {string} fileId
 * @param {{ name: string, parentId?: string }} options
 */
export async function copyDriveFile(fileId, { name, parentId } = {}) {
    const fileName = ensureMdExtension(name || 'Copy.md');
    /** @type {{ name: string, parents?: string[] }} */
    const body = { name: fileName };
    if (parentId) body.parents = [parentId];

    const params = new URLSearchParams({
        fields: 'id,name,mimeType,modifiedTime,createdTime,size,parents',
        supportsAllDrives: 'true',
    });

    const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?${params}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }
    );
    return response.json();
}

/** Create an empty markdown file in a folder. */
export async function createMarkdownFile(parentId, name, content = '') {
    const fileName = ensureMdExtension(name);
    const metadata = {
        name: fileName,
        mimeType: 'text/markdown',
        parents: [parentId || ROOT_FOLDER_ID],
    };
    const boundary = 'mdeditor_boundary';
    const body =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        'Content-Type: text/markdown; charset=UTF-8\r\n\r\n' +
        `${content}\r\n` +
        `--${boundary}--`;

    const response = await driveFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size',
        {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        }
    );
    return response.json();
}

/** Create a folder inside a parent folder. */
export async function createFolder(parentId, name) {
    const folderName = (name || '').trim() || 'Untitled folder';
    const response = await driveFetch(
        'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: folderName,
                mimeType: FOLDER_MIME,
                parents: [parentId || ROOT_FOLDER_ID],
            }),
        }
    );
    return response.json();
}

/** Rename a file or folder. For markdown, keeps/adds .md if appropriate. */
export async function renameDriveItem(fileId, newName, { isMarkdown = false } = {}) {
    let name = (newName || '').trim();
    if (!name) throw new Error('Name cannot be empty');
    if (isMarkdown) name = ensureMdExtension(name);

    const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,size,parents`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        }
    );
    return response.json();
}

/**
 * Move a file/folder by swapping Drive parents.
 * @param {string} fileId
 * @param {{ addParentId: string, removeParentId: string }} parents
 */
export async function moveDriveItem(fileId, { addParentId, removeParentId }) {
    if (!addParentId) throw new Error('Destination folder is required');
    if (!removeParentId) throw new Error('Current folder is required');
    if (addParentId === removeParentId) {
        throw new Error('Already in that folder');
    }

    const params = new URLSearchParams({
        addParents: addParentId,
        removeParents: removeParentId,
        fields: 'id,name,mimeType,modifiedTime,size,parents',
    });

    const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        }
    );
    return response.json();
}

/** List only child folders (for the Move picker). */
export async function listChildFolders(parentId = ROOT_FOLDER_ID) {
    const result = await listFolder(parentId);
    return {
        folders: (result.files || []).filter((f) => isFolder(f)),
        nextPageToken: result.nextPageToken || null,
    };
}

/**
 * Find a file in the private Drive appDataFolder by exact name.
 * @param {string} name
 * @returns {Promise<{ id: string, name: string } | null>}
 */
export async function findAppDataFile(name) {
    const safeName = String(name || '').replace(/'/g, "\\'");
    const params = new URLSearchParams({
        q: `name = '${safeName}' and trashed = false`,
        spaces: 'appDataFolder',
        pageSize: '1',
        fields: 'files(id, name)',
    });
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const data = await response.json();
    const file = (data.files || [])[0];
    return file?.id ? { id: file.id, name: file.name || name } : null;
}

/**
 * Create a JSON (or text) file in the Drive appDataFolder.
 * @param {string} name
 * @param {string} content
 * @param {string} [mimeType]
 */
export async function createAppDataFile(name, content = '', mimeType = 'application/json') {
    const fileName = String(name || '').trim() || 'settings.json';
    const metadata = {
        name: fileName,
        mimeType: mimeType || 'application/json',
        parents: ['appDataFolder'],
    };
    const boundary = 'mdeditor_appdata_boundary';
    const body =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType || 'application/json'}; charset=UTF-8\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

    const response = await driveFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime',
        {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        }
    );
    return response.json();
}

/**
 * Find or create the app settings JSON in appDataFolder.
 * @param {string} name
 * @param {string} [initialContent]
 */
export async function ensureAppDataFile(name, initialContent = '{}') {
    const existing = await findAppDataFile(name);
    if (existing) return existing;
    return createAppDataFile(name, initialContent, 'application/json');
}
