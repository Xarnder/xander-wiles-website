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

/** Virtual root for Finder / Move “Computers” browsing (not a real Drive id). */
export const COMPUTERS_FOLDER_ID = '__computers__';
export const COMPUTERS_FOLDER_NAME = 'Computers';

export const LAST_FOLDER_KEY = 'md-editor:lastFolderId';
export const DRAFT_KEY_PREFIX = 'md-editor:draft:';
export const VIEW_MODE_KEY_PREFIX = 'md-editor:viewMode:';
/** Finder markdown section order on mobile: 'top' | 'bottom' */
export const FINDER_MD_ORDER_MOBILE_KEY = 'md-editor:finderMdOrder:mobile';
/** Finder markdown section order on desktop: 'top' | 'bottom' */
export const FINDER_MD_ORDER_DESKTOP_KEY = 'md-editor:finderMdOrder:desktop';
export const FINDER_MD_ORDER_MOBILE_DEFAULT = 'bottom';
export const FINDER_MD_ORDER_DESKTOP_DEFAULT = 'top';

/**
 * Finder list sort order.
 * Folders stay grouped above markdown; this sorts within each group.
 */
export const FINDER_SORT_KEY = 'md-editor:finderSort';
export const FINDER_SORT_DEFAULT = 'name-asc';
/** @type {readonly { value: string, label: string }[]} */
export const FINDER_SORT_OPTIONS = Object.freeze([
    { value: 'modified-desc', label: 'Last updated' },
    { value: 'modified-asc', label: 'Oldest updated' },
    { value: 'created-desc', label: 'Newest created' },
    { value: 'created-asc', label: 'Oldest created' },
    { value: 'name-asc', label: 'Name A–Z' },
    { value: 'name-desc', label: 'Name Z–A' },
    { value: 'size-desc', label: 'Largest first' },
    { value: 'size-asc', label: 'Smallest first' },
]);
export const FINDER_SORT_VALUES = new Set(FINDER_SORT_OPTIONS.map((o) => o.value));

/** App color theme: 'blue' | 'oled' | 'light' */
export const THEME_KEY = 'md-editor:theme';
export const THEME_DEFAULT = 'blue';
export const THEME_VALUES = new Set(['blue', 'oled', 'light']);
export const THEME_META_COLORS = {
    blue: '#0b1020',
    oled: '#000000',
    light: '#e8ecf4',
};

/** Recently opened markdown files (shown at top of Finder in any folder). */
export const RECENT_FILES_KEY = 'md-editor:recentFiles';
export const RECENT_FILES_MAX = 5;
export const RECENT_FILES_MOBILE = 3;
export const RECENT_FILES_DESKTOP = 5;

/**
 * Last-opened timestamps for Finder indicator dots (id → openedAt ms).
 * Pruned to the last week; capped so localStorage stays small.
 */
export const OPENED_FILES_KEY = 'md-editor:openedFiles';
export const OPENED_FILES_MAX = 200;
export const OPENED_FILES_DAY_MS = 24 * 60 * 60 * 1000;
export const OPENED_FILES_WEEK_MS = 7 * OPENED_FILES_DAY_MS;

/** Pinned Drive files and folders (Pinned tab). */
export const PINNED_ITEMS_KEY = 'md-editor:pinnedItems';
export const PINNED_ITEMS_MAX = 40;
/** Unpin tombstones (id → unpinnedAt ms) so cloud merge does not revive removed pins. */
export const PINNED_TOMBS_KEY = 'md-editor:pinnedTombs';
export const PINNED_TOMB_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Per-item text colours in Finder / Pinned (id → #rrggbb).
 * Capped so localStorage / cloud settings stay small.
 */
export const FILE_TEXT_COLORS_KEY = 'md-editor:fileTextColors';
export const FILE_TEXT_COLORS_MAX = 300;
/** Per-id timestamps for colour add/clear so cloud merge is last-write-wins. */
export const FILE_TEXT_COLOR_AT_KEY = 'md-editor:fileTextColorAt';

/** Preview mode Contents panel: '1' open, '0' collapsed */
export const PREVIEW_TOC_OPEN_KEY = 'md-editor:previewTocOpen';
export const PREVIEW_TOC_OPEN_DEFAULT = true;

/** Preview Contents sticky: '1' sticky, '0' scrolls with page (default) */
export const PREVIEW_TOC_STICKY_KEY = 'md-editor:previewTocSticky';
export const PREVIEW_TOC_STICKY_DEFAULT = false;

/**
 * List item stripe styling for custom + normal lists.
 * 'normal' | 'zebra' | 'spectrum'
 */
export const LIST_STRIPE_KEY = 'md-editor:listStripe';
export const LIST_STRIPE_DEFAULT = 'normal';
export const LIST_STRIPE_VALUES = new Set(['normal', 'zebra', 'spectrum']);

/**
 * List item layout for stripe modes.
 * 'segmented' = each item is its own container (uniform fill for normal;
 *   alternating/spectrum backgrounds for stripe modes)
 * 'continuous' = one flowing list; stripe modes tint text colour instead
 */
export const LIST_LAYOUT_KEY = 'md-editor:listLayout';
export const LIST_LAYOUT_DEFAULT = 'segmented';
export const LIST_LAYOUT_VALUES = new Set(['segmented', 'continuous']);

/**
 * Default Edit sub-view when opening a markdown file with no per-file mode saved.
 * 'contents' | 'list' | 'preview' | 'raw'
 */
export const DEFAULT_EDIT_VIEW_KEY = 'md-editor:defaultEditView';
export const DEFAULT_EDIT_VIEW_DEFAULT = 'preview';
/** @type {readonly { value: string, label: string }[]} */
export const DEFAULT_EDIT_VIEW_OPTIONS = Object.freeze([
    { value: 'contents', label: 'Contents' },
    { value: 'list', label: 'List' },
    { value: 'preview', label: 'Preview' },
    { value: 'raw', label: 'Raw' },
]);
export const DEFAULT_EDIT_VIEW_VALUES = new Set(
    DEFAULT_EDIT_VIEW_OPTIONS.map((o) => o.value)
);

/**
 * Double-tap a list item in Preview/List to copy its text.
 * '1' on (default), '0' off
 */
export const DOUBLE_TAP_COPY_KEY = 'md-editor:doubleTapCopy';
export const DOUBLE_TAP_COPY_DEFAULT = true;

/**
 * Show .md / .markdown on Finder and Pinned row labels.
 * '1' on, '0' off (default — extensions stay hidden).
 */
export const SHOW_FILE_EXTENSIONS_KEY = 'md-editor:showFileExtensions';
export const SHOW_FILE_EXTENSIONS_DEFAULT = false;

/**
 * Block the UI with a non-dismissible “Saving in progress” dialog when the user
 * taps Save (not autosave). '1' on (default), '0' off.
 */
export const BLOCKING_SAVE_KEY = 'md-editor:blockingSave';
export const BLOCKING_SAVE_DEFAULT = true;

/**
 * Show {{date:…}} tags in Preview / List.
 * '1' on, '0' off (default — tags stay in Raw only).
 */
export const SHOW_DATES_KEY = 'md-editor:showDates';
export const SHOW_DATES_DEFAULT = true;

/**
 * Total top inset for Home Screen / PWA (px) — replaces iOS safe-area-inset-top.
 * Slider is the full status-bar clearance (0 = flush with the top of the screen).
 */
export const PWA_TOP_GAP_KEY = 'md-editor:pwaTopGap';
/** One-time: old values were EXTRA on top of safe-area; now the key stores the total. */
export const PWA_TOP_GAP_MIGRATED_KEY = 'md-editor:pwaTopGapAsTotal';
export const PWA_TOP_GAP_DEFAULT = 57;
export const PWA_TOP_GAP_MIN = 0;
export const PWA_TOP_GAP_MAX = 80;

/**
 * Bottom edge of the tab bar relative to the screen bottom (px).
 * 0 = flush, positive = lifted, negative = pushed further down into empty PWA space.
 */
export const PWA_BOTTOM_OFFSET_KEY = 'md-editor:pwaBottomOffset';
/** One-time: old pull-down / inset semantics → current bottom-edge value. */
export const PWA_BOTTOM_OFFSET_MIGRATED_KEY = 'md-editor:pwaBottomAsInset';
export const PWA_BOTTOM_OFFSET_DEFAULT = 25;
export const PWA_BOTTOM_OFFSET_MIN = -80;
export const PWA_BOTTOM_OFFSET_MAX = 80;

/** Preview / List body text size as percent of default (100 = 1.02rem). */
export const PREVIEW_FONT_SCALE_KEY = 'md-editor:previewFontScale';
export const PREVIEW_FONT_SCALE_DEFAULT = 100;
export const PREVIEW_FONT_SCALE_MIN = 75;
export const PREVIEW_FONT_SCALE_MAX = 150;

/** Hidden Drive appData settings file (synced across devices). */
export const SETTINGS_CLOUD_FILE_NAME = 'md-editor-settings.json';
export const SETTINGS_CLOUD_VERSION = 1;

/** AppData JSON for named / safety revision labels. */
export const REVISION_META_FILE_NAME = 'md-editor-revision-meta.json';
export const REVISION_META_VERSION = 1;

/** Short-lived Drive access token cache (localStorage; expires ~1h). */
export const OAUTH_SESSION_KEY = 'md-editor:oauthSession';
/** Prefer auto-restore on next open after a successful sign-in. */
export const REMEMBER_SIGNIN_KEY = 'md-editor:rememberSignIn';

export const PAGE_SIZE = 50;
export const LARGE_FILE_BYTES = 2 * 1024 * 1024;

export function isConfigured() {
    return Boolean(GOOGLE_CLIENT_ID) && !GOOGLE_CLIENT_ID.includes('process.env');
}
