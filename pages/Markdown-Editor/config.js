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
export const VIEW_MODE_KEY_PREFIX = 'md-editor:viewMode:';
/** Finder markdown section order on mobile: 'top' | 'bottom' */
export const FINDER_MD_ORDER_MOBILE_KEY = 'md-editor:finderMdOrder:mobile';
/** Finder markdown section order on desktop: 'top' | 'bottom' */
export const FINDER_MD_ORDER_DESKTOP_KEY = 'md-editor:finderMdOrder:desktop';
export const FINDER_MD_ORDER_MOBILE_DEFAULT = 'bottom';
export const FINDER_MD_ORDER_DESKTOP_DEFAULT = 'top';

/** App color theme: 'blue' | 'oled' | 'light' */
export const THEME_KEY = 'md-editor:theme';
export const THEME_DEFAULT = 'blue';
export const THEME_VALUES = new Set(['blue', 'oled', 'light']);
export const THEME_META_COLORS = {
    blue: '#0b1020',
    oled: '#000000',
    light: '#e8ecf4',
};

/** Recently opened markdown files (Finder root). */
export const RECENT_FILES_KEY = 'md-editor:recentFiles';
export const RECENT_FILES_MAX = 5;
export const RECENT_FILES_MOBILE = 3;
export const RECENT_FILES_DESKTOP = 5;

/** Pinned Drive files and folders (Pinned tab). */
export const PINNED_ITEMS_KEY = 'md-editor:pinnedItems';
export const PINNED_ITEMS_MAX = 40;

/** Preview mode Contents panel: '1' open, '0' collapsed */
export const PREVIEW_TOC_OPEN_KEY = 'md-editor:previewTocOpen';
export const PREVIEW_TOC_OPEN_DEFAULT = true;

/** Preview Contents sticky: '1' sticky, '0' scrolls with page (default) */
export const PREVIEW_TOC_STICKY_KEY = 'md-editor:previewTocSticky';
export const PREVIEW_TOC_STICKY_DEFAULT = false;

export const PAGE_SIZE = 50;
export const LARGE_FILE_BYTES = 2 * 1024 * 1024;

export function isConfigured() {
    return Boolean(GOOGLE_CLIENT_ID) && !GOOGLE_CLIENT_ID.includes('process.env');
}
