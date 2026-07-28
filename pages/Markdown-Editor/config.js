// Safety shim for browser environments (build.js injects process.env.*)
if (typeof process === 'undefined') {
    var process = { env: {} };
}

export const GOOGLE_CLIENT_ID =
    process.env.PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID || '';

/** Full Drive scope — enables in-app folder browsing of existing files (Option 2C). */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export const ROOT_FOLDER_ID = 'root';
export const ROOT_FOLDER_NAME = 'My Drive';

export const LAST_FOLDER_KEY = 'md-editor:lastFolderId';
export const DRAFT_KEY_PREFIX = 'md-editor:draft:';

export const PAGE_SIZE = 50;
export const LARGE_FILE_BYTES = 2 * 1024 * 1024;

export function isConfigured() {
    return Boolean(GOOGLE_CLIENT_ID) && !GOOGLE_CLIENT_ID.includes('process.env');
}
