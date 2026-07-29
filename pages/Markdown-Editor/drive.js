import { PAGE_SIZE, ROOT_FOLDER_ID } from './config.js';
import { getAccessToken, refreshAccessToken } from './auth.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';

async function driveFetch(url, options = {}, retried = false) {
    const token = getAccessToken();
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

/** Folders first, then markdown, then other — alphabetical within each group. */
export function sortDriveEntries(files) {
    const rank = (file) => {
        if (isFolder(file)) return 0;
        if (isMarkdownCandidate(file)) return 1;
        return 2;
    };
    return [...files].sort((a, b) => {
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
            sensitivity: 'base',
            numeric: true,
        });
    });
}

/**
 * List folders and markdown files in a folder.
 * @returns {Promise<{ files: object[], nextPageToken: string|null }>}
 */
export async function listFolder(folderId = ROOT_FOLDER_ID, pageToken = null) {
    const parent = folderId || ROOT_FOLDER_ID;
    const q = `'${parent.replace(/'/g, "\\'")}' in parents and trashed = false`;
    const params = new URLSearchParams({
        q,
        spaces: 'drive',
        corpora: 'user',
        pageSize: String(PAGE_SIZE),
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
        orderBy: 'folder,name_natural',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const data = await response.json();
    const files = sortDriveEntries(
        (data.files || []).filter((f) => isFolder(f) || isMarkdownCandidate(f))
    );
    return {
        files,
        nextPageToken: data.nextPageToken || null,
    };
}

/**
 * Search markdown files across the signed-in user's entire Drive
 * (includes My Drive and typically Mac "Computers" sync locations).
 * @param {string} [nameQuery] optional name filter (without requiring .md)
 * @returns {Promise<{ files: object[], nextPageToken: string|null }>}
 */
export async function searchMarkdownFiles(nameQuery = '', pageToken = null) {
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

    const params = new URLSearchParams({
        q: parts.join(' and '),
        spaces: 'drive',
        corpora: 'user',
        pageSize: String(PAGE_SIZE),
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)',
        orderBy: 'modifiedTime desc',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const data = await response.json();
    const files = sortDriveEntries((data.files || []).filter((f) => isMarkdownCandidate(f)));
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
            fields: 'nextPageToken, files(id, name, mimeType, parents, capabilities, ownedByMe)',
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
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    );
}

export async function getFileMetadata(fileId) {
    const params = new URLSearchParams({
        fields: 'id,name,mimeType,modifiedTime,size,parents',
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
