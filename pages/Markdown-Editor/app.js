import {
    isConfigured,
    LAST_FOLDER_KEY,
    LARGE_FILE_BYTES,
    ROOT_FOLDER_ID,
    ROOT_FOLDER_NAME,
    VIEW_MODE_KEY_PREFIX,
    FINDER_MD_ORDER_MOBILE_KEY,
    FINDER_MD_ORDER_DESKTOP_KEY,
    FINDER_MD_ORDER_MOBILE_DEFAULT,
    FINDER_MD_ORDER_DESKTOP_DEFAULT,
    FINDER_SORT_KEY,
    FINDER_SORT_DEFAULT,
    FINDER_SORT_VALUES,
    FINDER_SORT_OPTIONS,
    THEME_KEY,
    THEME_DEFAULT,
    THEME_VALUES,
    THEME_META_COLORS,
    PWA_TOP_GAP_KEY,
    PWA_TOP_GAP_MIGRATED_KEY,
    PWA_TOP_GAP_DEFAULT,
    PWA_TOP_GAP_MIN,
    PWA_TOP_GAP_MAX,
    PWA_BOTTOM_OFFSET_KEY,
    PWA_BOTTOM_OFFSET_MIGRATED_KEY,
    PWA_BOTTOM_OFFSET_DEFAULT,
    PWA_BOTTOM_OFFSET_MIN,
    PWA_BOTTOM_OFFSET_MAX,
    PREVIEW_FONT_SCALE_KEY,
    PREVIEW_FONT_SCALE_DEFAULT,
    PREVIEW_FONT_SCALE_MIN,
    PREVIEW_FONT_SCALE_MAX,
    LIST_STRIPE_KEY,
    LIST_STRIPE_DEFAULT,
    LIST_STRIPE_VALUES,
    LIST_LAYOUT_KEY,
    LIST_LAYOUT_DEFAULT,
    LIST_LAYOUT_VALUES,
    DEFAULT_EDIT_VIEW_KEY,
    DEFAULT_EDIT_VIEW_DEFAULT,
    DEFAULT_EDIT_VIEW_VALUES,
    DEFAULT_EDIT_VIEW_OPTIONS,
    DOUBLE_TAP_COPY_KEY,
    PREVIEW_TOC_OPEN_KEY,
    PREVIEW_TOC_STICKY_KEY,
    RECENT_FILES_KEY,
    RECENT_FILES_MAX,
    OPENED_FILES_KEY,
    OPENED_FILES_MAX,
    OPENED_FILES_WEEK_MS,
    PINNED_ITEMS_KEY,
    PINNED_ITEMS_MAX,
} from './config.js';
import {
    clearToken,
    isSignedIn,
    requestAccessToken,
    tryRestoreSession,
} from './auth.js';
import {
    createFolder,
    createMarkdownFile,
    getFileContent,
    getFileMetadata,
    isFolder,
    listChildFolders,
    listComputerRootFolders,
    listFolder,
    fetchVisiblePage,
    moveDriveItem,
    renameDriveItem,
    searchMarkdownFiles,
    sortDriveEntries,
    updateFileContent,
} from './drive.js';
import {
    applyLoadedContent,
    clearDraft,
    createEditorState,
    markError,
    markSaved,
    markSaving,
    promptRestoreDraft,
    readDraft,
    setEditorText,
} from './editor.js';
import {
    addItem,
    appendEmptyList,
    offsetFromPreviewAnchor,
    parseDocument,
    previewAnchorFromOffset,
    serializeDocument,
    stripMdlistAgentNotes,
} from './lists.js';
import { parseXanderListJson, xanderListToMdlist } from './list-import.js';
import { applyEditingLists, applyEditingPlainLists, applyTagFilters, readDoubleTapCopyEnabled, readPreviewTocOpen, readPreviewTocSticky, renderListsUi, writeDoubleTapCopyEnabled } from './lists-ui.js';
import {
    flushCloudSettingsSave,
    pullCloudSettings,
    resetCloudSettingsState,
    scheduleCloudSettingsSave,
    withCloudApplyGuard,
} from './settings-sync.js';
import {
    extractMarkdownHeadings,
    getTextareaViewportOffset,
    getVisiblePreviewBlock,
    scrollListsRootToAnchor,
    scrollTextareaToLine,
    scrollTextareaToOffset,
    splitMarkdownBlocks,
} from './markdown.js';
import { createEditorSearch } from './search.js';
import {
    applyEditorDisplayMode,
    applyFinderLayoutPrefs,
    applyTheme,
    bindUi,
    confirmLeaveUnsaved,
    getEls,
    promptForName,
    promptItemActions,
    promptEditorMoreMenu,
    fillEditorMoreStats,
    promptFinderSort,
    promptMoveDestination,
    promptPinnedShortcutIssue,
    promptUnsavedChanges,
    renderFileList,
    renderPinnedList,
    renderFolderPath,
    scrollFinderToMarkdownSection,
    setBrowseEmptyMessage,
    setBrowseModeUi,
    setConfigError,
    setCreateActionsVisible,
    setEditorLoading,
    setListsStatus,
    setLoadMoreVisible,
    setLoadMoreBusy,
    setStatus,
    showEditorToast,
    setUpEnabled,
    showView,
    syncEditorChrome,
    syncFinderLayoutControls,
    syncNavLayout,
    syncThemeControl,
    applyPwaTopGap,
    syncPwaTopGapControl,
    applyPwaBottomOffset,
    syncPwaBottomOffsetControl,
    applyPreviewFontScale,
    syncPreviewFontScaleControl,
    applyListStripe,
    syncListStripeControl,
    applyListLayout,
    syncListLayoutControl,
    syncDefaultEditViewControl,
    syncDoubleTapCopyControl,
    syncFinderSortControl,
} from './ui.js';

const COMPUTERS_ROOT = { id: '__computers__', name: 'Computers' };
const VIEW_MODES = new Set(['list', 'preview', 'contents', 'raw']);
const LEGACY_VIEW_MODES = {
    custom: 'list',
    mixed: 'preview',
    standard: 'raw',
};

const state = {
    browseMode: 'folder', // 'folder' | 'search' | 'computers'
    searchQuery: '',
    folderStack: [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }],
    files: [],
    nextPageToken: null,
    loadingFolder: false,
    editor: createEditorState(),
    viewMode: 'raw', // 'list' | 'preview' | 'contents' | 'raw'
    documentModel: null,
    tagFilters: {},
    editingListIds: {},
    editingPlainLists: {},
    placingList: false,
    /** @type {object | null} */
    pendingImportList: null,
    clickEdit: false,
    parseWarnings: [],
};

/** @type {ReturnType<typeof createEditorSearch> | null} */
let editorSearch = null;

function currentFolder() {
    return state.folderStack[state.folderStack.length - 1];
}

function rememberFolder(folderId) {
    try {
        localStorage.setItem(LAST_FOLDER_KEY, folderId);
    } catch {
        // ignore
    }
}

function readRememberedFolder() {
    try {
        return localStorage.getItem(LAST_FOLDER_KEY);
    } catch {
        return null;
    }
}

function viewModeKey(fileId) {
    return `${VIEW_MODE_KEY_PREFIX}${fileId}`;
}

function readViewMode(fileId) {
    if (!fileId) return null;
    try {
        const raw = localStorage.getItem(viewModeKey(fileId));
        if (!raw) return null;
        if (VIEW_MODES.has(raw)) return raw;
        if (LEGACY_VIEW_MODES[raw]) return LEGACY_VIEW_MODES[raw];
    } catch {
        // ignore
    }
    return null;
}

function readFinderLayoutPrefs() {
    const read = (key, fallback) => {
        try {
            const raw = localStorage.getItem(key);
            if (raw === 'top' || raw === 'bottom') return raw;
        } catch {
            // ignore
        }
        return fallback;
    };
    return {
        mobile: read(FINDER_MD_ORDER_MOBILE_KEY, FINDER_MD_ORDER_MOBILE_DEFAULT),
        desktop: read(FINDER_MD_ORDER_DESKTOP_KEY, FINDER_MD_ORDER_DESKTOP_DEFAULT),
    };
}

function writeFinderLayoutPrefs(prefs) {
    try {
        if (prefs.mobile === 'top' || prefs.mobile === 'bottom') {
            localStorage.setItem(FINDER_MD_ORDER_MOBILE_KEY, prefs.mobile);
        }
        if (prefs.desktop === 'top' || prefs.desktop === 'bottom') {
            localStorage.setItem(FINDER_MD_ORDER_DESKTOP_KEY, prefs.desktop);
        }
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
}

function applySavedFinderLayout() {
    const prefs = readFinderLayoutPrefs();
    applyFinderLayoutPrefs(prefs);
    syncFinderLayoutControls(prefs);
}

function readFinderSort() {
    try {
        const raw = localStorage.getItem(FINDER_SORT_KEY);
        if (FINDER_SORT_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return FINDER_SORT_DEFAULT;
}

function writeFinderSort(mode) {
    const next = FINDER_SORT_VALUES.has(mode) ? mode : FINDER_SORT_DEFAULT;
    try {
        localStorage.setItem(FINDER_SORT_KEY, next);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return next;
}

function applySavedFinderSort() {
    syncFinderSortControl(readFinderSort());
}

function readTheme() {
    try {
        const raw = localStorage.getItem(THEME_KEY);
        if (THEME_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return THEME_DEFAULT;
}

function writeTheme(theme) {
    if (!THEME_VALUES.has(theme)) return;
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
}

function applySavedTheme() {
    const theme = readTheme();
    applyTheme(theme, { metaColor: THEME_META_COLORS[theme] || THEME_META_COLORS.blue });
    syncThemeControl(theme);
}

function clampPwaTopGap(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return PWA_TOP_GAP_DEFAULT;
    return Math.max(PWA_TOP_GAP_MIN, Math.min(PWA_TOP_GAP_MAX, n));
}

function measureSafeTopPx() {
    try {
        const probe = document.createElement('div');
        probe.style.cssText =
            'position:absolute;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);';
        document.documentElement.appendChild(probe);
        const px = Math.round(parseFloat(getComputedStyle(probe).paddingTop) || 0);
        probe.remove();
        return Math.max(0, px);
    } catch {
        return 0;
    }
}

function readPwaTopGap() {
    try {
        const raw = localStorage.getItem(PWA_TOP_GAP_KEY);
        const migrated = localStorage.getItem(PWA_TOP_GAP_MIGRATED_KEY) === '1';
        if (!migrated) {
            const safe = measureSafeTopPx();
            const total =
                raw == null || raw === ''
                    ? clampPwaTopGap(PWA_TOP_GAP_DEFAULT)
                    : clampPwaTopGap(Number(raw) + safe);
            try {
                localStorage.setItem(PWA_TOP_GAP_KEY, String(total));
                localStorage.setItem(PWA_TOP_GAP_MIGRATED_KEY, '1');
            } catch {
                // ignore
            }
            return total;
        }
        if (raw == null || raw === '') {
            return clampPwaTopGap(PWA_TOP_GAP_DEFAULT);
        }
        return clampPwaTopGap(raw);
    } catch {
        return PWA_TOP_GAP_DEFAULT;
    }
}

function writePwaTopGap(gapPx) {
    const n = clampPwaTopGap(gapPx);
    try {
        localStorage.setItem(PWA_TOP_GAP_KEY, String(n));
        localStorage.setItem(PWA_TOP_GAP_MIGRATED_KEY, '1');
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return n;
}

function applySavedPwaTopGap() {
    syncPwaTopGapControl(readPwaTopGap());
}

function clampPwaBottomOffset(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return PWA_BOTTOM_OFFSET_DEFAULT;
    return Math.max(PWA_BOTTOM_OFFSET_MIN, Math.min(PWA_BOTTOM_OFFSET_MAX, n));
}

function measureSafeBottomPx() {
    try {
        const probe = document.createElement('div');
        probe.style.cssText =
            'position:absolute;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px);';
        document.documentElement.appendChild(probe);
        const px = Math.round(parseFloat(getComputedStyle(probe).paddingBottom) || 0);
        probe.remove();
        return Math.max(0, px);
    } catch {
        return 0;
    }
}

function readPwaBottomOffset() {
    try {
        const raw = localStorage.getItem(PWA_BOTTOM_OFFSET_KEY);
        const migrated = localStorage.getItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY) === '1';
        if (!migrated) {
            const safe = measureSafeBottomPx();
            const pull = raw == null || raw === '' ? null : Number(raw);
            // Old values pulled the nav down; convert to remaining bottom inset.
            const inset = clampPwaBottomOffset(
                pull == null || !Number.isFinite(pull)
                    ? PWA_BOTTOM_OFFSET_DEFAULT
                    : Math.max(0, safe - pull)
            );
            try {
                localStorage.setItem(PWA_BOTTOM_OFFSET_KEY, String(inset));
                localStorage.setItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY, '1');
            } catch {
                // ignore
            }
            return inset;
        }
        if (raw == null || raw === '') {
            return clampPwaBottomOffset(PWA_BOTTOM_OFFSET_DEFAULT);
        }
        return clampPwaBottomOffset(raw);
    } catch {
        return PWA_BOTTOM_OFFSET_DEFAULT;
    }
}

function writePwaBottomOffset(offsetPx) {
    const n = clampPwaBottomOffset(offsetPx);
    try {
        localStorage.setItem(PWA_BOTTOM_OFFSET_KEY, String(n));
        localStorage.setItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY, '1');
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return n;
}

function applySavedPwaBottomOffset() {
    syncPwaBottomOffsetControl(readPwaBottomOffset());
}

function clampPreviewFontScale(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return PREVIEW_FONT_SCALE_DEFAULT;
    return Math.max(PREVIEW_FONT_SCALE_MIN, Math.min(PREVIEW_FONT_SCALE_MAX, n));
}

function readPreviewFontScale() {
    try {
        const raw = localStorage.getItem(PREVIEW_FONT_SCALE_KEY);
        if (raw == null || raw === '') return PREVIEW_FONT_SCALE_DEFAULT;
        return clampPreviewFontScale(raw);
    } catch {
        return PREVIEW_FONT_SCALE_DEFAULT;
    }
}

function writePreviewFontScale(percent) {
    const n = clampPreviewFontScale(percent);
    try {
        localStorage.setItem(PREVIEW_FONT_SCALE_KEY, String(n));
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return n;
}

function applySavedPreviewFontScale() {
    syncPreviewFontScaleControl(readPreviewFontScale());
}

function readListStripe() {
    try {
        const raw = localStorage.getItem(LIST_STRIPE_KEY);
        if (LIST_STRIPE_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return LIST_STRIPE_DEFAULT;
}

function writeListStripe(mode) {
    const next = LIST_STRIPE_VALUES.has(mode) ? mode : LIST_STRIPE_DEFAULT;
    try {
        localStorage.setItem(LIST_STRIPE_KEY, next);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return next;
}

function applySavedListStripe() {
    syncListStripeControl(readListStripe());
}

function readListLayout() {
    try {
        const raw = localStorage.getItem(LIST_LAYOUT_KEY);
        if (LIST_LAYOUT_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return LIST_LAYOUT_DEFAULT;
}

function writeListLayout(layout) {
    const next = LIST_LAYOUT_VALUES.has(layout) ? layout : LIST_LAYOUT_DEFAULT;
    try {
        localStorage.setItem(LIST_LAYOUT_KEY, next);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return next;
}

function applySavedListLayout() {
    syncListLayoutControl(readListLayout());
}

function readDefaultEditView() {
    try {
        const raw = localStorage.getItem(DEFAULT_EDIT_VIEW_KEY);
        if (DEFAULT_EDIT_VIEW_VALUES.has(raw)) return raw;
    } catch {
        // ignore
    }
    return DEFAULT_EDIT_VIEW_DEFAULT;
}

function writeDefaultEditView(mode) {
    const next = DEFAULT_EDIT_VIEW_VALUES.has(mode) ? mode : DEFAULT_EDIT_VIEW_DEFAULT;
    try {
        localStorage.setItem(DEFAULT_EDIT_VIEW_KEY, next);
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
    return next;
}

function applySavedDefaultEditView() {
    syncDefaultEditViewControl(readDefaultEditView());
}

function applySavedDoubleTapCopy() {
    syncDoubleTapCopyControl(readDoubleTapCopyEnabled());
}

function buildSettingsSnapshot() {
    return {
        theme: readTheme(),
        previewTocSticky: readPreviewTocSticky(),
        previewTocOpen: readPreviewTocOpen(),
        pwaTopGap: readPwaTopGap(),
        pwaBottomOffset: readPwaBottomOffset(),
        previewFontScale: readPreviewFontScale(),
        listStripe: readListStripe(),
        listLayout: readListLayout(),
        defaultEditView: readDefaultEditView(),
        doubleTapCopy: readDoubleTapCopyEnabled(),
        finderMdOrder: readFinderLayoutPrefs(),
        finderSort: readFinderSort(),
        pinnedItems: readPinnedItems(),
        openedFiles: openedFilesSnapshot(),
    };
}

function queueSettingsCloudSync() {
    if (!isSignedIn()) return;
    scheduleCloudSettingsSave(buildSettingsSnapshot, {
        onError: (err) => {
            console.warn('[md-editor] settings cloud save failed', err);
        },
    });
}

/**
 * Apply a cloud settings blob to localStorage + live UI (without re-pushing).
 * @param {import('./settings-sync.js').CloudSettings | object} cloud
 */
function applyCloudSettings(cloud) {
    if (!cloud || typeof cloud !== 'object') return;

    withCloudApplyGuard(() => {
        if (THEME_VALUES.has(cloud.theme)) {
            try {
                localStorage.setItem(THEME_KEY, cloud.theme);
            } catch {
                // ignore
            }
            applyTheme(cloud.theme, {
                metaColor: THEME_META_COLORS[cloud.theme] || THEME_META_COLORS.blue,
            });
            syncThemeControl(cloud.theme);
        }

        if (typeof cloud.previewTocSticky === 'boolean') {
            try {
                localStorage.setItem(PREVIEW_TOC_STICKY_KEY, cloud.previewTocSticky ? '1' : '0');
            } catch {
                // ignore
            }
        }

        if (typeof cloud.previewTocOpen === 'boolean') {
            try {
                localStorage.setItem(PREVIEW_TOC_OPEN_KEY, cloud.previewTocOpen ? '1' : '0');
            } catch {
                // ignore
            }
        }

        if (cloud.pwaTopGap != null) {
            let n = clampPwaTopGap(cloud.pwaTopGap);
            const alreadyTotal = localStorage.getItem(PWA_TOP_GAP_MIGRATED_KEY) === '1';
            if (!alreadyTotal) {
                const safe = measureSafeTopPx();
                // Pre-migration cloud values were EXTRA on top of safe-area.
                if (n < safe) n = clampPwaTopGap(n + safe);
            }
            try {
                localStorage.setItem(PWA_TOP_GAP_KEY, String(n));
                localStorage.setItem(PWA_TOP_GAP_MIGRATED_KEY, '1');
            } catch {
                // ignore
            }
            syncPwaTopGapControl(n);
        }

        if (cloud.pwaBottomOffset != null) {
            let n = clampPwaBottomOffset(cloud.pwaBottomOffset);
            const alreadyInset = localStorage.getItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY) === '1';
            if (!alreadyInset) {
                const safe = measureSafeBottomPx();
                // Pre-migration cloud values were "pull down" amounts.
                n = clampPwaBottomOffset(Math.max(0, safe - n));
            }
            try {
                localStorage.setItem(PWA_BOTTOM_OFFSET_KEY, String(n));
                localStorage.setItem(PWA_BOTTOM_OFFSET_MIGRATED_KEY, '1');
            } catch {
                // ignore
            }
            syncPwaBottomOffsetControl(n);
        }

        if (cloud.previewFontScale != null) {
            const n = clampPreviewFontScale(cloud.previewFontScale);
            try {
                localStorage.setItem(PREVIEW_FONT_SCALE_KEY, String(n));
            } catch {
                // ignore
            }
            syncPreviewFontScaleControl(n);
        }

        if (LIST_STRIPE_VALUES.has(cloud.listStripe)) {
            try {
                localStorage.setItem(LIST_STRIPE_KEY, cloud.listStripe);
            } catch {
                // ignore
            }
            syncListStripeControl(cloud.listStripe);
        }

        if (LIST_LAYOUT_VALUES.has(cloud.listLayout)) {
            try {
                localStorage.setItem(LIST_LAYOUT_KEY, cloud.listLayout);
            } catch {
                // ignore
            }
            syncListLayoutControl(cloud.listLayout);
        }

        if (DEFAULT_EDIT_VIEW_VALUES.has(cloud.defaultEditView)) {
            try {
                localStorage.setItem(DEFAULT_EDIT_VIEW_KEY, cloud.defaultEditView);
            } catch {
                // ignore
            }
            syncDefaultEditViewControl(cloud.defaultEditView);
        }

        if (typeof cloud.doubleTapCopy === 'boolean') {
            try {
                localStorage.setItem(DOUBLE_TAP_COPY_KEY, cloud.doubleTapCopy ? '1' : '0');
            } catch {
                // ignore
            }
            syncDoubleTapCopyControl(cloud.doubleTapCopy);
        }

        if (cloud.finderMdOrder && typeof cloud.finderMdOrder === 'object') {
            const next = {
                mobile:
                    cloud.finderMdOrder.mobile === 'top' || cloud.finderMdOrder.mobile === 'bottom'
                        ? cloud.finderMdOrder.mobile
                        : readFinderLayoutPrefs().mobile,
                desktop:
                    cloud.finderMdOrder.desktop === 'top' || cloud.finderMdOrder.desktop === 'bottom'
                        ? cloud.finderMdOrder.desktop
                        : readFinderLayoutPrefs().desktop,
            };
            try {
                localStorage.setItem(FINDER_MD_ORDER_MOBILE_KEY, next.mobile);
                localStorage.setItem(FINDER_MD_ORDER_DESKTOP_KEY, next.desktop);
            } catch {
                // ignore
            }
            applyFinderLayoutPrefs(next);
            syncFinderLayoutControls(next);
        }

        if (FINDER_SORT_VALUES.has(cloud.finderSort)) {
            try {
                localStorage.setItem(FINDER_SORT_KEY, cloud.finderSort);
            } catch {
                // ignore
            }
            syncFinderSortControl(cloud.finderSort);
        }

        if (Array.isArray(cloud.pinnedItems)) {
            const normalized = cloud.pinnedItems
                .filter((entry) => entry && typeof entry.id === 'string' && entry.id)
                .map((entry) => ({
                    id: entry.id,
                    name: entry.name || 'Untitled.md',
                    mimeType: entry.mimeType || 'text/markdown',
                    parentId: typeof entry.parentId === 'string' ? entry.parentId : '',
                    pinnedAt: Number(entry.pinnedAt) || 0,
                }))
                .sort((a, b) => b.pinnedAt - a.pinnedAt)
                .slice(0, PINNED_ITEMS_MAX);
            try {
                localStorage.setItem(PINNED_ITEMS_KEY, JSON.stringify(normalized));
            } catch {
                // ignore
            }
        }

        if (
            cloud.openedFiles &&
            typeof cloud.openedFiles === 'object' &&
            !Array.isArray(cloud.openedFiles)
        ) {
            const cutoff = Date.now() - OPENED_FILES_WEEK_MS;
            const merged = readOpenedFilesMap();
            for (const [id, openedAt] of Object.entries(cloud.openedFiles)) {
                if (!id) continue;
                const ts = Number(openedAt) || 0;
                if (ts < cutoff) continue;
                const prev = merged.get(String(id)) || 0;
                if (ts > prev) merged.set(String(id), ts);
            }
            writeOpenedFilesMap(merged);
        }
    });
}

async function syncSettingsFromCloud() {
    if (!isSignedIn()) return;
    try {
        const { settings, created } = await pullCloudSettings(buildSettingsSnapshot);
        if (!created) {
            applyCloudSettings(settings);
        }
        // Push so local-only fields (e.g. openedFiles) join an existing cloud blob.
        queueSettingsCloudSync();
    } catch (err) {
        console.warn('[md-editor] settings cloud load failed', err);
    }
}

function readRecentFiles() {
    try {
        const raw = localStorage.getItem(RECENT_FILES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry) => entry && typeof entry.id === 'string' && entry.id)
            .map((entry) => ({
                id: entry.id,
                name: entry.name || 'Untitled.md',
                mimeType: entry.mimeType || 'text/markdown',
                openedAt: Number(entry.openedAt) || 0,
            }))
            .sort((a, b) => b.openedAt - a.openedAt)
            .slice(0, RECENT_FILES_MAX);
    } catch {
        return [];
    }
}

function writeRecentFiles(entries) {
    try {
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(entries.slice(0, RECENT_FILES_MAX)));
    } catch {
        // ignore
    }
}

/**
 * Map of file id → last openedAt (ms) for opens within the past week.
 * @returns {Map<string, number>}
 */
function readOpenedFilesMap() {
    const map = new Map();
    const cutoff = Date.now() - OPENED_FILES_WEEK_MS;
    try {
        const raw = localStorage.getItem(OPENED_FILES_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [id, openedAt] of Object.entries(parsed)) {
                    const ts = Number(openedAt) || 0;
                    if (!id || ts < cutoff) continue;
                    map.set(String(id), ts);
                }
            }
        }
    } catch {
        // ignore
    }
    // Include the short Recent list so existing opens still show dots.
    for (const entry of readRecentFiles()) {
        if (!entry?.id) continue;
        const ts = Number(entry.openedAt) || 0;
        if (ts < cutoff) continue;
        const prev = map.get(entry.id) || 0;
        if (ts > prev) map.set(entry.id, ts);
    }
    return map;
}

function writeOpenedFilesMap(map) {
    const cutoff = Date.now() - OPENED_FILES_WEEK_MS;
    const entries = [...map.entries()]
        .filter(([, openedAt]) => openedAt >= cutoff)
        .sort((a, b) => b[1] - a[1])
        .slice(0, OPENED_FILES_MAX);
    const obj = {};
    for (const [id, openedAt] of entries) obj[id] = openedAt;
    try {
        localStorage.setItem(OPENED_FILES_KEY, JSON.stringify(obj));
    } catch {
        // ignore
    }
}

/** Plain object for settings cloud snapshot (id → openedAt). */
function openedFilesSnapshot() {
    const obj = {};
    for (const [id, openedAt] of readOpenedFilesMap()) obj[id] = openedAt;
    return obj;
}

function rememberOpenedFile(fileId) {
    if (!fileId) return;
    const map = readOpenedFilesMap();
    map.set(String(fileId), Date.now());
    writeOpenedFilesMap(map);
    queueSettingsCloudSync();
}

function rememberRecentFile(file) {
    if (!file?.id) return;
    rememberOpenedFile(file.id);
    const next = [
        {
            id: file.id,
            name: file.name || 'Untitled.md',
            mimeType: file.mimeType || 'text/markdown',
            openedAt: Date.now(),
        },
        ...readRecentFiles().filter((entry) => entry.id !== file.id),
    ].slice(0, RECENT_FILES_MAX);
    writeRecentFiles(next);
}

function updateRecentFileName(fileId, name) {
    if (!fileId || !name) return;
    const entries = readRecentFiles();
    let changed = false;
    for (const entry of entries) {
        if (entry.id === fileId) {
            entry.name = name;
            changed = true;
        }
    }
    if (changed) writeRecentFiles(entries);
}

function normalizeParentId(parents) {
    if (Array.isArray(parents) && parents[0]) return String(parents[0]);
    return '';
}

function readPinnedItems() {
    try {
        const raw = localStorage.getItem(PINNED_ITEMS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry) => entry && typeof entry.id === 'string' && entry.id)
            .map((entry) => ({
                id: entry.id,
                name: entry.name || (isFolder(entry) ? 'Folder' : 'Untitled.md'),
                mimeType: entry.mimeType || 'text/markdown',
                parentId: typeof entry.parentId === 'string' ? entry.parentId : '',
                pinnedAt: Number(entry.pinnedAt) || 0,
            }))
            .sort((a, b) => b.pinnedAt - a.pinnedAt)
            .slice(0, PINNED_ITEMS_MAX);
    } catch {
        return [];
    }
}

function writePinnedItems(entries) {
    try {
        localStorage.setItem(PINNED_ITEMS_KEY, JSON.stringify(entries.slice(0, PINNED_ITEMS_MAX)));
    } catch {
        // ignore
    }
    queueSettingsCloudSync();
}

function isPinned(fileId) {
    if (!fileId) return false;
    return readPinnedItems().some((entry) => entry.id === fileId);
}

function pinItem(file, { switchToPinned = true } = {}) {
    if (!file?.id) return;
    const parentId = normalizeParentId(file.parents);
    const next = [
        {
            id: file.id,
            name: file.name || (isFolder(file) ? 'Folder' : 'Untitled.md'),
            mimeType: file.mimeType || 'text/markdown',
            parentId,
            pinnedAt: Date.now(),
        },
        ...readPinnedItems().filter((entry) => entry.id !== file.id),
    ].slice(0, PINNED_ITEMS_MAX);
    writePinnedItems(next);
    setStatus(`Pinned ${file.name || 'item'}`, 'ok');
    if (switchToPinned) {
        showPinnedView();
    }
}

/** @type {Map<string, object>} */
const pinnedMetaCache = new Map();

function unpinItem(fileId, { refresh = true } = {}) {
    if (!fileId) return;
    const next = readPinnedItems().filter((entry) => entry.id !== fileId);
    writePinnedItems(next);
    pinnedMetaCache.delete(fileId);
    if (refresh) renderPinnedView();
}

function updatePinnedItem(fileId, patch = {}) {
    if (!fileId) return;
    const entries = readPinnedItems();
    let changed = false;
    for (const entry of entries) {
        if (entry.id !== fileId) continue;
        if (patch.name != null) entry.name = patch.name;
        if (patch.mimeType != null) entry.mimeType = patch.mimeType;
        if (patch.parentId != null) entry.parentId = patch.parentId;
        changed = true;
    }
    if (changed) writePinnedItems(entries);
    pinnedMetaCache.delete(fileId);
}

/**
 * Merge live Drive metadata so pinned sort matches Finder (dates/size).
 * @param {object[]} items
 * @returns {Promise<object[]>}
 */
async function enrichPinnedItemsForSort(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];

    return Promise.all(
        list.map(async (entry) => {
            let meta = pinnedMetaCache.get(entry.id);
            if (!meta && isSignedIn()) {
                try {
                    meta = await getFileMetadata(entry.id);
                    if (meta?.id) pinnedMetaCache.set(entry.id, meta);
                } catch {
                    meta = null;
                }
            }
            const pinIso = entry.pinnedAt ? new Date(entry.pinnedAt).toISOString() : '';
            return {
                ...entry,
                name: meta?.name || entry.name,
                mimeType: meta?.mimeType || entry.mimeType,
                modifiedTime: meta?.modifiedTime || pinIso,
                createdTime: meta?.createdTime || pinIso,
                size: meta?.size ?? 0,
            };
        })
    );
}

async function renderPinnedView() {
    const items = readPinnedItems();
    const handlers = {
        onOpen: handleOpenPinnedEntry,
        onMenu: handlePinnedItemMenu,
    };
    const sortMode = readFinderSort();
    // Instant pass using pin time / name, then refine with Drive metadata.
    const localPrepared = items.map((entry) => ({
        ...entry,
        modifiedTime: entry.pinnedAt || 0,
        createdTime: entry.pinnedAt || 0,
        size: 0,
    }));
    renderPinnedList(sortDriveEntries(localPrepared, sortMode), handlers);

    const enriched = await enrichPinnedItemsForSort(items);
    const elsNow = getEls();
    if (elsNow.viewPinned?.hidden) return;
    renderPinnedList(sortDriveEntries(enriched, readFinderSort()), handlers);
}

function showPinnedView() {
    showAppView('pinned');
    renderPinnedView().catch(() => {});
    setStatus(readPinnedItems().length ? '' : 'Pin notes or folders from Finder');
}

function writeViewMode(fileId, mode) {
    if (!fileId || !VIEW_MODES.has(mode)) return;
    try {
        localStorage.setItem(viewModeKey(fileId), mode);
    } catch {
        // ignore
    }
}

function resolveInitialViewMode(fileId) {
    const saved = readViewMode(fileId);
    if (saved) return saved;
    return readDefaultEditView();
}

function refreshDocumentModelFromText(text) {
    const parsed = parseDocument(text);
    applyTagFilters(parsed, state.tagFilters);
    applyEditingLists(parsed, state.editingListIds);
    applyEditingPlainLists(parsed, state.editingPlainLists);
    state.documentModel = parsed;
    state.parseWarnings = parsed.warnings || [];
    return parsed;
}

function showParseWarnings() {
    const parts = [];
    if (state.parseWarnings.length) {
        parts.push(state.parseWarnings.slice(0, 3).join(' · '));
    }
    const doc = state.documentModel;
    if (doc?.hasError) {
        parts.push('Some mdlist blocks are invalid — use Raw to fix the markdown/JSON.');
    }
    setListsStatus(parts.join(' ') || '', parts.length ? 'warn' : '');
}

function flushCurrentEditorContent() {
    const els = getEls();
    if (!state.editor.fileId) return;
    if (state.viewMode === 'raw') {
        setEditorText(state.editor, els.editor.value);
    } else if (
        state.viewMode === 'list' ||
        state.viewMode === 'preview' ||
        state.viewMode === 'contents'
    ) {
        if (state.documentModel) {
            const serialized = serializeDocument(state.documentModel);
            setEditorText(state.editor, serialized);
            els.editor.value = serialized;
        }
    }
}

function renderStructuredEditor(extra = {}) {
    const els = getEls();
    if (!state.documentModel || !els.listsRoot) return;
    const structuredMode =
        state.viewMode === 'list'
            ? 'list'
            : state.viewMode === 'contents'
              ? 'contents'
              : 'preview';
    renderListsUi(els.listsRoot, {
        mode: structuredMode,
        doc: state.documentModel,
        focusItemId: extra.focusItemId || null,
        focusPlainItemId: extra.focusPlainItemId || null,
        openMiniPlainItemId: extra.openMiniPlainItemId || null,
        focusTocId: extra.focusTocId || null,
        placingList: state.viewMode === 'preview' && state.placingList,
        pendingImportList: state.viewMode === 'preview' && state.placingList ? state.pendingImportList : null,
        clickEdit: state.viewMode === 'preview' && state.clickEdit,
        onEditSpot: (payload) => jumpToRawAtPreviewSpot(payload),
        onContentsSelect: (tocId) => {
            applyViewMode('preview', { persist: true, focusTocId: tocId });
        },
        onStatus: (msg, kind) => setStatus(msg, kind),
        onChange: (doc, opts = {}) => {
            if (typeof opts.placingList === 'boolean') {
                state.placingList = opts.placingList;
                if (opts.placingList) state.clickEdit = false;
                if (!opts.placingList) state.pendingImportList = null;
            }
            if (Object.prototype.hasOwnProperty.call(opts, 'pendingImportList')) {
                state.pendingImportList = opts.pendingImportList || null;
            }
            if (opts.statusMessage) {
                setStatus(opts.statusMessage, opts.statusKind || 'ok');
            }
            if (opts.tagFilters) state.tagFilters = opts.tagFilters;
            if (opts.editingListIds) state.editingListIds = opts.editingListIds;
            if (opts.editingPlainLists) state.editingPlainLists = opts.editingPlainLists;
            if (opts.focusItemId) {
                for (const seg of doc.segments || []) {
                    if (
                        seg.type === 'mdlist' &&
                        seg.list &&
                        (seg.list.items || []).some((item) => item.id === opts.focusItemId)
                    ) {
                        state.editingListIds = { ...state.editingListIds, [seg.list.id]: true };
                        seg._editing = true;
                        break;
                    }
                }
            }
            applyTagFilters(doc, state.tagFilters);
            applyEditingLists(doc, state.editingListIds);
            applyEditingPlainLists(doc, state.editingPlainLists);
            state.documentModel = doc;
            if (opts.soft) {
                if (opts.persist) {
                    const serialized = serializeDocument(doc);
                    setEditorText(state.editor, serialized);
                    els.editor.value = serialized;
                    syncEditorChrome(state.editor);
                }
                renderStructuredEditor({
                    focusItemId: opts.focusItemId,
                    focusPlainItemId: opts.focusPlainItemId,
                    openMiniPlainItemId: opts.openMiniPlainItemId,
                });
                return;
            }
            const serialized = serializeDocument(doc);
            setEditorText(state.editor, serialized);
            els.editor.value = serialized;
            syncEditorChrome(state.editor);
            if (opts.skipRender) {
                return;
            }
            refreshDocumentModelFromText(serialized);
            applyTagFilters(state.documentModel, state.tagFilters);
            applyEditingLists(state.documentModel, state.editingListIds);
            applyEditingPlainLists(state.documentModel, state.editingPlainLists);
            showParseWarnings();
            renderStructuredEditor({
                focusItemId: opts.focusItemId,
                focusPlainItemId: opts.focusPlainItemId,
                openMiniPlainItemId: opts.openMiniPlainItemId,
            });
        },
    });
    syncInsertListButton();
    syncImportListButton();
    syncClickEditButton();
    // Re-apply find highlights after the Preview/List DOM is rebuilt
    if (editorSearch?.isOpen()) {
        requestAnimationFrame(() => editorSearch?.refresh());
    }
}

function getEditorActionMode() {
    if (state.viewMode !== 'preview') return null;
    if (state.clickEdit) return 'click-edit';
    if (state.placingList && state.pendingImportList) return 'import-list';
    if (state.placingList) return 'insert-list';
    return null;
}

/** Grey out / disable sibling actions while one cancelable mode is active. */
function syncEditorActionLocks() {
    const els = getEls();
    const mode = getEditorActionMode();
    const locked = Boolean(mode);
    const saving = state.editor.status === 'saving';
    const hasFile = Boolean(state.editor.fileId);
    const baseDisabled = saving || !hasFile;

    if (els.navActionsEditor) {
        els.navActionsEditor.classList.toggle('is-action-locked', locked);
    }
    if (els.app) {
        if (mode) els.app.dataset.activeEditorAction = mode;
        else delete els.app.dataset.activeEditorAction;
        els.app.classList.toggle('is-action-locked', locked);
    }

    const entries = [
        [els.btnEditorSearch, 'search'],
        [els.btnClickEdit, 'click-edit'],
        [els.btnInsertList, 'insert-list'],
        [els.btnEditorMore, 'import-list'],
        [els.btnSave, 'save'],
    ];

    for (const [btn, key] of entries) {
        if (!btn) continue;
        const isActive = mode === key;
        btn.classList.toggle('is-active-action', isActive);
        if (locked) {
            btn.disabled = !isActive;
        } else if (key === 'save') {
            btn.disabled = baseDisabled || !state.editor.dirty;
        } else {
            btn.disabled = baseDisabled;
        }
    }
}

function syncInsertListButton() {
    const els = getEls();
    if (!els.btnInsertList) return;
    const placing = state.viewMode === 'preview' && state.placingList && !state.pendingImportList;
    els.btnInsertList.title = placing ? 'Cancel' : 'Add list';
    els.btnInsertList.setAttribute(
        'aria-label',
        placing ? 'Cancel placing list' : 'Add ranked list'
    );
    els.btnInsertList.classList.toggle('btn-insert-list--cancel', placing);
    syncEditorActionLocks();
}

function syncImportListButton() {
    const els = getEls();
    if (!els.btnEditorMore) return;
    const placingImport = state.viewMode === 'preview' && state.placingList && Boolean(state.pendingImportList);
    els.btnEditorMore.title = placingImport ? 'Cancel' : 'More';
    els.btnEditorMore.setAttribute(
        'aria-label',
        placingImport ? 'Cancel importing list' : 'More file actions'
    );
    els.btnEditorMore.classList.toggle('btn-editor-more--cancel', placingImport);
    els.btnEditorMore.hidden = !state.editor.fileId;

    const icon = els.btnEditorMore.querySelector('.nav-action-icon');
    if (icon) {
        icon.classList.toggle('nav-action-icon--menu', !placingImport);
        icon.classList.toggle('nav-action-icon--cross', placingImport);
    }

    syncEditorActionLocks();
}

function syncClickEditButton() {
    const els = getEls();
    if (!els.btnClickEdit) return;
    const picking = state.viewMode === 'preview' && state.clickEdit;
    els.btnClickEdit.title = picking ? 'Cancel' : 'Edit here';
    els.btnClickEdit.setAttribute(
        'aria-label',
        picking ? 'Cancel click-to-edit' : 'Click text in Preview to edit in Raw'
    );
    els.btnClickEdit.classList.toggle('btn-click-edit--active', picking);
    els.btnClickEdit.hidden = !state.editor.fileId;

    const icon = els.btnClickEdit.querySelector('.nav-action-icon');
    if (icon) {
        icon.classList.toggle('nav-action-icon--edit', !picking);
        icon.classList.toggle('nav-action-icon--cross', picking);
    }

    syncEditorActionLocks();
}

/**
 * Jump from a Preview click-edit target into Raw at the matching source offset.
 * @param {{
 *   segIndex: number,
 *   localLine: number,
 *   nextLocalLine?: number,
 *   prefix?: string,
 *   word?: string,
 *   blockText?: string
 * }} payload
 */
function jumpToRawAtPreviewSpot(payload) {
    if (!state.documentModel || !state.editor.fileId) return;
    state.clickEdit = false;
    state.placingList = false;
    state.pendingImportList = null;

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    const offset = offsetFromPreviewAnchor(
        state.documentModel,
        payload.segIndex,
        payload.localLine,
        payload
    );
    const serialized = serializeDocument(state.documentModel);
    setEditorText(state.editor, serialized);
    const els = getEls();
    els.editor.value = serialized;

    applyViewMode('raw', {
        persist: true,
        focusOffset: offset,
        selectWord: true,
        focusEditor: true,
    });
    setStatus('Editing in Raw', 'ok');
}

function applyViewMode(mode, {
    persist = true,
    reparseFromTextarea = false,
    focusOffset = null,
    focusLine: focusLineOpt = null,
    selectWord = false,
    focusEditor = false,
    focusTocId = null,
} = {}) {
    if (!VIEW_MODES.has(mode)) mode = 'raw';
    const els = getEls();
    const previousMode = state.viewMode;

    let focusLine = focusLineOpt;
    let rawFocusOffset = focusOffset;
    /** @type {{ segIndex: number, localLine: number, needle: string } | null} */
    let previewAnchor = null;
    let pendingPreviewOffset = null;

    if (rawFocusOffset == null && focusLine == null && previewAnchor == null) {
        if (previousMode === 'raw' && (mode === 'preview' || mode === 'list') && els.editor) {
            // Capture wrapped viewport offset now; map after the document is refreshed.
            pendingPreviewOffset = getTextareaViewportOffset(els.editor);
        } else if (
            (previousMode === 'preview' || previousMode === 'list') &&
            mode === 'raw' &&
            els.listsRoot &&
            state.documentModel
        ) {
            const block = getVisiblePreviewBlock(els.listsRoot);
            if (block) {
                const preview = block.closest('.md-preview--segment');
                const segIndex = Number(
                    preview?.dataset?.segIndex ?? block.dataset.previewSegIndex
                );
                const localLine = Number(block.getAttribute('data-md-line')) || 1;
                if (Number.isFinite(segIndex)) {
                    const blocks = preview
                        ? [...preview.querySelectorAll(':scope > [data-md-line]')]
                        : [];
                    const blockIndex = blocks.indexOf(block);
                    const nextBlock =
                        blockIndex >= 0 ? blocks[blockIndex + 1] : null;
                    rawFocusOffset = offsetFromPreviewAnchor(
                        state.documentModel,
                        segIndex,
                        localLine,
                        {
                            blockText: block.textContent || '',
                            nextLocalLine: nextBlock
                                ? Number(nextBlock.getAttribute('data-md-line')) || undefined
                                : undefined,
                        }
                    );
                } else {
                    focusLine = localLine;
                }
            }
        }
    }

    // Leaving editable surfaces: flush first
    if (state.viewMode === 'raw' || reparseFromTextarea) {
        setEditorText(state.editor, els.editor.value);
    } else if (
        state.viewMode === 'list' ||
        state.viewMode === 'preview' ||
        state.viewMode === 'contents'
    ) {
        if (state.documentModel) {
            const serialized = serializeDocument(state.documentModel);
            setEditorText(state.editor, serialized);
            els.editor.value = serialized;
        }
    }

    if (mode === 'list' || mode === 'preview' || mode === 'contents') {
        refreshDocumentModelFromText(state.editor.editorContent);
        if (pendingPreviewOffset != null && state.documentModel) {
            previewAnchor = previewAnchorFromOffset(state.documentModel, pendingPreviewOffset);
        }
    }

    state.viewMode = mode;
    if (mode !== 'preview') {
        state.placingList = false;
        state.pendingImportList = null;
        state.clickEdit = false;
    }
    if (persist && state.editor.fileId) writeViewMode(state.editor.fileId, mode);

    applyEditorDisplayMode(mode, { hasFile: Boolean(state.editor.fileId) });
    if (mode === 'list' || mode === 'preview') showParseWarnings();
    else setListsStatus('');

    if (mode === 'raw') {
        els.editor.value = state.editor.editorContent;
        syncNavLayout();
        syncInsertListButton();
        syncImportListButton();
        syncClickEditButton();
        const go = () => {
            const searchOpen = Boolean(editorSearch?.isOpen());
            const shouldFocus =
                !searchOpen && (focusEditor || selectWord || rawFocusOffset != null || focusLine != null);
            if (rawFocusOffset != null) {
                scrollTextareaToOffset(els.editor, rawFocusOffset, {
                    selectWord: Boolean(selectWord),
                    focus: shouldFocus,
                });
            } else if (focusLine != null) {
                scrollTextareaToLine(els.editor, focusLine, { focus: shouldFocus });
            }
        };
        requestAnimationFrame(() => {
            requestAnimationFrame(go);
        });
        if (editorSearch?.isOpen()) {
            requestAnimationFrame(() => editorSearch?.revealCurrent());
        }
        return;
    }

    renderStructuredEditor({ focusTocId: focusTocId || null });
    syncNavLayout();
    syncImportListButton();
    syncClickEditButton();
    if (previewAnchor && els.listsRoot && !focusTocId) {
        // After lists-ui restoreScroll rAF, place the matching Preview block in view.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollListsRootToAnchor(els.listsRoot, previewAnchor);
            });
        });
    }
    if (editorSearch?.isOpen()) {
        requestAnimationFrame(() => editorSearch?.revealCurrent());
    }
}

function setupEditorForOpenFile() {
    const els = getEls();
    state.tagFilters = {};
    state.editingListIds = {};
    state.editingPlainLists = {};
    state.placingList = false;
    state.pendingImportList = null;
    state.clickEdit = false;
    editorSearch?.close({ restoreFocus: false });
    refreshDocumentModelFromText(state.editor.editorContent);

    const repaired = (state.documentModel.segments || []).some((s) => s.repaired);
    if (repaired) {
        const serialized = serializeDocument(state.documentModel);
        setEditorText(state.editor, serialized);
        els.editor.value = serialized;
        refreshDocumentModelFromText(serialized);
    }

    state.viewMode = resolveInitialViewMode(state.editor.fileId);

    applyEditorDisplayMode(state.viewMode, { hasFile: true });
    if (state.viewMode === 'list' || state.viewMode === 'preview') showParseWarnings();
    else setListsStatus('');
    if (state.viewMode === 'raw') {
        els.editor.value = state.editor.editorContent;
        els.editor.focus();
    } else {
        renderStructuredEditor();
    }
    syncEditorChrome(state.editor);
    setStatus('');
    if (repaired) {
        showEditorToast('Repaired list data — Save to persist fixes.', 'warn', {
            key: 'repaired',
            durationMs: 3200,
        });
    } else if (!readViewMode(state.editor.fileId)) {
        const label =
            DEFAULT_EDIT_VIEW_OPTIONS.find((o) => o.value === state.viewMode)?.label ||
            state.viewMode;
        showEditorToast(`Opened in ${label}`, 'ok', {
            key: 'opened-default-view',
            durationMs: 2200,
        });
    }
}

async function refreshBrowse(reset = true) {
    if (state.browseMode === 'search') {
        await loadSearch(reset);
    } else if (state.browseMode === 'computers') {
        await loadComputers(reset);
    } else {
        await loadBrowse(reset);
    }
}

function canCreateInCurrentLocation() {
    if (state.browseMode === 'search') return false;
    if (state.browseMode === 'computers') {
        // Virtual Computers root is not a real parent id.
        return !(state.folderStack.length === 1 && state.folderStack[0].id === COMPUTERS_ROOT.id);
    }
    return state.browseMode === 'folder';
}

function updateCreateActions() {
    setCreateActionsVisible(canCreateInCurrentLocation());
}

function renderCurrentFileList({ scrollToMarkdown = false } = {}) {
    renderFileList(state.files, {
        onOpen: handleOpenEntry,
        onMenu: handleItemMenu,
        recent: readRecentFiles(),
        scrollToMarkdown,
        sortMode: readFinderSort(),
        openedAtById: readOpenedFilesMap(),
    });
}

async function jumpToFolderCrumb(index) {
    if (index < 0 || index >= state.folderStack.length - 1) return;
    state.folderStack = state.folderStack.slice(0, index + 1);
    await refreshBrowse(true);
}

async function loadBrowse(reset = true) {
    const folder = currentFolder();
    state.loadingFolder = true;
    setBrowseModeUi('folder');
    setStatus(reset ? 'Loading folder…' : 'Loading more…');
    setUpEnabled(state.folderStack.length > 1);
    renderFolderPath(state.folderStack, 'folder', '', jumpToFolderCrumb);
    rememberFolder(folder.id);
    updateCreateActions();
    setBrowseEmptyMessage(
        'No folders or markdown files here yet. Tap + Note or + Folder to create one.'
    );
    if (reset) setLoadMoreVisible(false);
    else setLoadMoreBusy(true);

    try {
        const pageToken = reset ? null : state.nextPageToken;
        if (!reset && !pageToken) {
            setLoadMoreVisible(false);
            setStatus('');
            return;
        }
        const result = await fetchVisiblePage(
            (token) => listFolder(folder.id, token, { sortMode: readFinderSort() }),
            pageToken
        );
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList({ scrollToMarkdown: reset });
        setLoadMoreVisible(Boolean(state.nextPageToken));
        if (!reset && !result.files.length && !state.nextPageToken) {
            setStatus('No more items to load.');
        } else {
            setStatus(state.files.length ? '' : 'This folder is empty — create a note or folder.');
        }
    } catch (err) {
        setStatus(err.message || 'Failed to list folder', 'error');
        setLoadMoreVisible(Boolean(state.nextPageToken));
    } finally {
        state.loadingFolder = false;
        setLoadMoreBusy(false);
    }
}

async function loadSearch(reset = true) {
    state.loadingFolder = true;
    setBrowseModeUi('search');
    setUpEnabled(false);
    updateCreateActions();
    renderFolderPath([], 'search', state.searchQuery);
    setStatus(reset ? 'Searching Drive for markdown…' : 'Loading more…');
    setBrowseEmptyMessage(
        'No markdown files found for this Google account. Check you signed in with the same account as Google Drive for Desktop, and that .md files finished uploading to the cloud.'
    );
    if (reset) setLoadMoreVisible(false);
    else setLoadMoreBusy(true);

    try {
        const pageToken = reset ? null : state.nextPageToken;
        if (!reset && !pageToken) {
            setLoadMoreVisible(false);
            return;
        }
        const result = await fetchVisiblePage(
            (token) => searchMarkdownFiles(state.searchQuery, token, { sortMode: readFinderSort() }),
            pageToken
        );
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList({ scrollToMarkdown: reset });
        setLoadMoreVisible(Boolean(state.nextPageToken));
        setStatus(
            state.files.length
                ? `Found ${state.files.length}${state.nextPageToken ? '+' : ''} markdown file(s).`
                : 'No markdown files found.'
        );
    } catch (err) {
        setStatus(err.message || 'Search failed', 'error');
        setLoadMoreVisible(Boolean(state.nextPageToken));
    } finally {
        state.loadingFolder = false;
        setLoadMoreBusy(false);
    }
}

async function loadComputers(reset = true) {
    state.loadingFolder = true;
    setBrowseModeUi('computers');
    setBrowseEmptyMessage(
        'No Computers folders found via the API (Google limits this). Reliable fix: in drive.google.com → Computers → move your notes folder into My Drive, then use My Drive here.'
    );

    const atComputersRoot =
        state.folderStack.length === 1 && state.folderStack[0].id === COMPUTERS_ROOT.id;
    updateCreateActions();

    try {
        if (atComputersRoot) {
            setUpEnabled(false);
            renderFolderPath(state.folderStack, 'computers', '', jumpToFolderCrumb);
            setStatus('Looking for Computers folders…');
            const computers = await listComputerRootFolders();
            state.files = computers;
            state.nextPageToken = null;
            renderCurrentFileList({ scrollToMarkdown: true });
            setLoadMoreVisible(false);
            setStatus(
                computers.length
                    ? `Found ${computers.length} possible computer folder(s). Open one to browse.`
                    : 'Could not list Computers via API.'
            );
            return;
        }

        const folder = currentFolder();
        setUpEnabled(true);
        renderFolderPath(state.folderStack, 'computers', '', jumpToFolderCrumb);
        setStatus(reset ? 'Loading folder…' : 'Loading more…');
        if (reset) setLoadMoreVisible(false);
        else setLoadMoreBusy(true);
        const pageToken = reset ? null : state.nextPageToken;
        if (!reset && !pageToken) {
            setLoadMoreVisible(false);
            return;
        }
        const result = await fetchVisiblePage(
            (token) => listFolder(folder.id, token, { sortMode: readFinderSort() }),
            pageToken
        );
        if (reset) {
            state.files = result.files;
        } else {
            state.files = state.files.concat(result.files);
        }
        state.nextPageToken = result.nextPageToken;
        renderCurrentFileList({ scrollToMarkdown: reset });
        setLoadMoreVisible(Boolean(state.nextPageToken));
        setStatus(state.files.length ? '' : 'No folders or markdown files here.');
    } catch (err) {
        setStatus(err.message || 'Failed to load Computers', 'error');
        setLoadMoreVisible(Boolean(state.nextPageToken));
    } finally {
        state.loadingFolder = false;
        setLoadMoreBusy(false);
    }
}

async function enterFolder(folder) {
    if (state.browseMode === 'computers' && state.folderStack[0]?.id === COMPUTERS_ROOT.id) {
        state.folderStack.push({ id: folder.id, name: folder.name || 'Folder' });
        await loadComputers(true);
        return;
    }
    state.browseMode = 'folder';
    state.folderStack.push({ id: folder.id, name: folder.name || 'Folder' });
    await loadBrowse(true);
}

async function goUp() {
    if (state.browseMode === 'computers') {
        if (state.folderStack.length <= 1) return;
        state.folderStack.pop();
        await loadComputers(true);
        return;
    }
    if (state.browseMode !== 'folder') return;
    if (state.folderStack.length <= 1) return;
    state.folderStack.pop();
    await loadBrowse(true);
}

async function switchToFolderMode() {
    state.browseMode = 'folder';
    state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
    showAppView('finder');
    await loadBrowse(true);
}

async function switchToComputersMode() {
    state.browseMode = 'computers';
    state.folderStack = [{ ...COMPUTERS_ROOT }];
    showAppView('finder');
    await loadComputers(true);
}

async function switchToSearchMode() {
    state.browseMode = 'search';
    const els = getEls();
    if (els.searchInput && !state.searchQuery) {
        els.searchInput.value = '';
    }
    showAppView('finder');
    await loadSearch(true);
}

async function handleOpenEntry(file) {
    if (isFolder(file)) {
        await enterFolder(file);
        return;
    }
    await openMarkdownFile(file);
}

async function handleItemMenu(file) {
    const action = await promptItemActions(file, { isPinned: isPinned(file.id) });
    if (action === 'pin') {
        // Prefer fresh parent metadata when available
        let toPin = file;
        if (!Array.isArray(file.parents) || !file.parents[0]) {
            try {
                toPin = await getFileMetadata(file.id);
            } catch {
                // keep local file snapshot
            }
        }
        pinItem(toPin);
        return;
    }
    if (action === 'unpin') {
        unpinItem(file.id, { refresh: false });
        setStatus(`Unpinned ${file.name || 'item'}`, 'ok');
        return;
    }
    if (action === 'rename') {
        await handleRenameEntry(file);
        return;
    }
    if (action === 'move') {
        await handleMoveEntry(file);
        return;
    }
    if (action === 'download') {
        await handleDownloadEntry(file);
    }
}

async function handlePinnedItemMenu(file) {
    const action = await promptItemActions(file, { isPinned: true });
    if (action === 'unpin' || action === 'pin') {
        // From Pinned tab the control is Unpin
        unpinItem(file.id);
        setStatus(`Unpinned ${file.name || 'item'}`, 'ok');
        return;
    }
    if (action === 'rename') {
        await handleRenameEntry(file);
        renderPinnedView();
        return;
    }
    if (action === 'move') {
        await handleMoveEntry(file);
        renderPinnedView();
        return;
    }
    if (action === 'download') {
        await handleDownloadEntry(file);
    }
}

/**
 * Resolve a pinned shortcut; warn if missing, renamed, or moved.
 * @returns {Promise<object|null>} live Drive metadata, or null if shortcut removed / cancelled
 */
async function resolvePinnedEntry(pinned) {
    if (!pinned?.id) return null;
    setStatus('Checking pinned item…');
    try {
        const meta = await getFileMetadata(pinned.id);
        const liveParent = normalizeParentId(meta.parents);
        const renamed = Boolean(pinned.name) && meta.name !== pinned.name;
        const moved = Boolean(pinned.parentId) && liveParent && pinned.parentId !== liveParent;

        if (renamed || moved) {
            const parts = [];
            if (renamed) {
                parts.push(`Renamed from “${pinned.name}” to “${meta.name}”.`);
            }
            if (moved) {
                parts.push('It was moved to a different folder in Google Drive.');
            }
            const choice = await promptPinnedShortcutIssue({
                title: renamed && moved ? 'Moved and renamed' : renamed ? 'Renamed' : 'Moved',
                message: `${parts.join(' ')} Keep this pinned shortcut?`,
                name: meta.name || pinned.name,
            });
            if (choice === 'delete') {
                unpinItem(pinned.id);
                setStatus('Pinned shortcut removed', 'ok');
                return null;
            }
            updatePinnedItem(pinned.id, {
                name: meta.name,
                mimeType: meta.mimeType,
                parentId: liveParent,
            });
            renderPinnedView();
        } else {
            // Refresh stored snapshot quietly
            updatePinnedItem(pinned.id, {
                name: meta.name,
                mimeType: meta.mimeType,
                parentId: liveParent || pinned.parentId || '',
            });
        }
        setStatus('');
        return meta;
    } catch (err) {
        const missing = Number(err?.status) === 404;
        const choice = await promptPinnedShortcutIssue({
            title: missing ? 'Pinned item missing' : 'Pinned item unavailable',
            message: missing
                ? 'This pinned file or folder was moved, deleted, or is no longer accessible. Delete the shortcut or keep it for later?'
                : `${err.message || 'Could not open this pinned item.'} Delete the shortcut or keep it?`,
            name: pinned.name,
        });
        if (choice === 'delete') {
            unpinItem(pinned.id);
            setStatus('Pinned shortcut removed', 'ok');
        } else {
            setStatus(err.message || 'Pinned item unavailable', 'warn');
        }
        return null;
    }
}

async function handleOpenPinnedEntry(pinned) {
    const meta = await resolvePinnedEntry(pinned);
    if (!meta) return;

    if (isFolder(meta)) {
        state.browseMode = 'folder';
        state.folderStack = [
            { id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME },
            { id: meta.id, name: meta.name || 'Folder' },
        ];
        // If parent is known and not root, still open the pinned folder directly
        showAppView('finder');
        await loadBrowse(true);
        setStatus(`Opened pinned folder ${meta.name || ''}`, 'ok');
        return;
    }

    await openMarkdownFile(meta);
}

async function resolveCurrentParentId(file) {
    if (Array.isArray(file.parents) && file.parents[0]) return file.parents[0];
    if (
        state.browseMode === 'folder' ||
        (state.browseMode === 'computers' &&
            !(state.folderStack.length === 1 && state.folderStack[0].id === COMPUTERS_ROOT.id))
    ) {
        const folder = currentFolder();
        if (folder?.id && folder.id !== COMPUTERS_ROOT.id) return folder.id;
    }
    const meta = await getFileMetadata(file.id);
    if (Array.isArray(meta.parents) && meta.parents[0]) return meta.parents[0];
    throw new Error('Could not determine the current folder for this item');
}

async function handleMoveEntry(file) {
    setStatus('Preparing move…');
    let currentParentId;
    try {
        currentParentId = await resolveCurrentParentId(file);
    } catch (err) {
        setStatus(err.message || 'Could not prepare move', 'error');
        return;
    }

    const destination = await promptMoveDestination({
        item: file,
        currentParentId,
        listFolders: async (parentId) => {
            const result = await listChildFolders(parentId);
            return result.folders || [];
        },
    });
    if (!destination) {
        setStatus('');
        return;
    }
    if (destination.folderId === currentParentId) {
        setStatus('Already in that folder', 'warn');
        return;
    }
    if (isFolder(file) && destination.folderId === file.id) {
        setStatus('Cannot move a folder into itself', 'error');
        return;
    }

    setStatus('Moving…');
    try {
        await moveDriveItem(file.id, {
            addParentId: destination.folderId,
            removeParentId: currentParentId,
        });
        state.files = state.files.filter((f) => f.id !== file.id);
        renderCurrentFileList();
        updatePinnedItem(file.id, { parentId: destination.folderId });
        // If we moved a folder that is in the path stack, truncate path to before it
        const pathIndex = state.folderStack.findIndex((frame) => frame.id === file.id);
        if (pathIndex >= 0) {
            state.folderStack = state.folderStack.slice(0, pathIndex);
            if (!state.folderStack.length) {
                state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
            }
            await refreshBrowse(true);
        }
        setStatus(`Moved to ${destination.folderName}`, 'ok');
    } catch (err) {
        setStatus(err.message || 'Move failed', 'error');
    }
}

async function handleDownloadEntry(file) {
    if (isFolder(file)) return;
    setStatus('Downloading…');
    try {
        const text = await getFileContent(file.id);
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name || 'note.md';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus(`Downloaded ${file.name || 'file'}`, 'ok');
    } catch (err) {
        setStatus(err.message || 'Download failed', 'error');
    }
}

async function handleRenameEntry(file) {
    const folder = isFolder(file);
    const name = await promptForName({
        title: folder ? 'Rename folder' : 'Rename note',
        hint: folder ? 'Folder name' : 'We’ll keep the .md ending for notes.',
        confirmLabel: 'Rename',
        initialValue: file.name || '',
        selectStem: !folder,
    });
    if (!name || name === file.name) return;

    setStatus('Renaming…');
    try {
        const updated = await renameDriveItem(file.id, name, { isMarkdown: !folder });
        const idx = state.files.findIndex((f) => f.id === file.id);
        if (idx >= 0) {
            state.files[idx] = { ...state.files[idx], name: updated.name };
        }
        if (state.editor.fileId === file.id) {
            state.editor.fileName = updated.name;
            syncEditorChrome(state.editor);
        }
        if (!folder) updateRecentFileName(file.id, updated.name);
        updatePinnedItem(file.id, { name: updated.name });
        if (idx >= 0 || !folder) {
            renderCurrentFileList();
        }
        // Keep folder stack labels in sync if renaming current path folder
        for (const frame of state.folderStack) {
            if (frame.id === file.id) frame.name = updated.name;
        }
        if (state.browseMode !== 'search') {
            renderFolderPath(
                state.folderStack,
                state.browseMode === 'computers' ? 'computers' : 'folder',
                state.searchQuery,
                jumpToFolderCrumb
            );
        }
        setStatus(`Renamed to ${updated.name}`, 'ok');
    } catch (err) {
        setStatus(err.message || 'Rename failed', 'error');
    }
}

async function handleCreateNote() {
    if (!canCreateInCurrentLocation()) return;
    const parent = currentFolder();
    const name = await promptForName({
        title: 'New note',
        hint: 'Name your markdown file. .md is added automatically if missing.',
        confirmLabel: 'Create',
        initialValue: 'Untitled.md',
        selectStem: true,
    });
    if (!name) return;

    setStatus('Creating note…');
    try {
        const created = await createMarkdownFile(parent.id, name, `# ${name.replace(/\.md$/i, '')}\n\n`);
        setStatus(`Created ${created.name}`, 'ok');
        await openMarkdownFile(created);
    } catch (err) {
        setStatus(err.message || 'Could not create note', 'error');
    }
}

async function handleCreateFolder() {
    if (!canCreateInCurrentLocation()) return;
    const parent = currentFolder();
    const name = await promptForName({
        title: 'New folder',
        hint: 'Created inside the folder you’re viewing now.',
        confirmLabel: 'Create',
        initialValue: 'New folder',
    });
    if (!name) return;

    setStatus('Creating folder…');
    try {
        const created = await createFolder(parent.id, name);
        setStatus(`Created folder ${created.name}`, 'ok');
        await refreshBrowse(true);
    } catch (err) {
        setStatus(err.message || 'Could not create folder', 'error');
    }
}

async function handleRenameCurrentFile() {
    if (!state.editor.fileId) return;
    await handleRenameEntry({
        id: state.editor.fileId,
        name: state.editor.fileName,
        mimeType: state.editor.mimeType || 'text/markdown',
    });
}

function handlePinCurrentFile() {
    if (!state.editor.fileId) return;
    const folder = currentFolder();
    const file = {
        id: state.editor.fileId,
        name: state.editor.fileName,
        mimeType: state.editor.mimeType || 'text/markdown',
        parents: folder?.id && folder.id !== COMPUTERS_ROOT.id ? [folder.id] : undefined,
    };
    if (isPinned(file.id)) {
        unpinItem(file.id, { refresh: false });
        setStatus(`Unpinned ${file.name || 'file'}`, 'ok');
    } else {
        pinItem(file, { switchToPinned: false });
    }
}

async function handleEditorMoreMenu() {
    if (!state.editor.fileId) return;
    if (state.viewMode === 'preview' && state.placingList && state.pendingImportList) {
        cancelListPlacement();
        return;
    }

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    const metaPromise = getFileMetadata(state.editor.fileId)
        .then((meta) => ({
            createdTime: meta?.createdTime || null,
            modifiedTime: meta?.modifiedTime || null,
            size: meta?.size != null ? Number(meta.size) : null,
        }))
        .catch(() => null);

    metaPromise.then((meta) => {
        const elsNow = getEls();
        if (!meta || !elsNow.editorMoreDialog?.open) return;
        fillEditorMoreStats(buildEditorFileStatRows({ meta }));
    });

    const action = await promptEditorMoreMenu({
        fileName: state.editor.fileName,
        isPinned: isPinned(state.editor.fileId),
        stats: buildEditorFileStatRows({ metaPending: true }),
    });
    if (!action) return;

    if (action === 'rename') {
        await handleRenameCurrentFile();
        return;
    }
    if (action === 'pin' || action === 'unpin') {
        handlePinCurrentFile();
    }
}

function formatStatNumber(n) {
    return Number(n || 0).toLocaleString();
}

function formatStatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStatDate(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    try {
        return date.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return date.toLocaleString();
    }
}

function countWordsInText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
}

/**
 * @param {{ meta?: { createdTime?: string|null, modifiedTime?: string|null, size?: number|null } | null, metaPending?: boolean }} [options]
 * @returns {Array<{ label: string, value: string, pending?: boolean }>}
 */
function buildEditorFileStatRows(options = {}) {
    const text = String(state.editor.editorContent || '');
    const doc = state.documentModel;
    const meta = options.meta || null;
    const metaPending = Boolean(options.metaPending) && !meta;

    const characters = text.length;
    const charactersNoSpace = text.replace(/\s/g, '').length;
    const words = countWordsInText(text);
    const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
    const contentBytes = new TextEncoder().encode(text).length;

    let customLists = 0;
    let customItems = 0;
    let plainLists = 0;
    let plainItems = 0;
    let headings = 0;

    for (const seg of doc?.segments || []) {
        if (seg.type === 'mdlist' && seg.list) {
            customLists += 1;
            customItems += (seg.list.items || []).length;
            continue;
        }
        if (seg.type !== 'markdown') continue;
        const source = stripMdlistAgentNotes(seg.text || '');
        headings += extractMarkdownHeadings(source).length;
        for (const block of splitMarkdownBlocks(source)) {
            if (block.type !== 'plainlist') continue;
            plainLists += 1;
            plainItems += (block.items || []).length;
        }
    }

    const totalLists = customLists + plainLists;
    const totalItems = customItems + plainItems;
    const readingMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));

    return [
        { label: 'Characters', value: formatStatNumber(characters) },
        { label: 'Characters (no spaces)', value: formatStatNumber(charactersNoSpace) },
        { label: 'Words', value: formatStatNumber(words) },
        { label: 'Lines', value: formatStatNumber(lines) },
        { label: 'Reading time', value: words === 0 ? '—' : `~${readingMinutes} min` },
        { label: 'Headings', value: formatStatNumber(headings) },
        {
            label: 'Lists',
            value:
                totalLists === 0
                    ? '0'
                    : `${formatStatNumber(totalLists)} (${formatStatNumber(customLists)} custom · ${formatStatNumber(plainLists)} normal)`,
        },
        { label: 'List items', value: formatStatNumber(totalItems) },
        { label: 'Content size', value: formatStatBytes(contentBytes) },
        {
            label: 'Drive size',
            value: metaPending ? 'Loading…' : formatStatBytes(meta?.size),
            pending: metaPending,
        },
        {
            label: 'Created',
            value: metaPending ? 'Loading…' : formatStatDate(meta?.createdTime),
            pending: metaPending,
        },
        {
            label: 'Last edited',
            value: metaPending ? 'Loading…' : formatStatDate(meta?.modifiedTime),
            pending: metaPending,
        },
        {
            label: 'Unsaved changes',
            value: state.editor.dirty ? 'Yes' : 'No',
        },
    ];
}

function importXanderListFromText(text) {
    if (!state.editor.fileId) {
        setStatus('Open a markdown file first', 'warn');
        return;
    }
    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    const payload = parseXanderListJson(text);
    const mdlist = xanderListToMdlist(payload);
    state.clickEdit = false;
    state.pendingImportList = mdlist;
    state.placingList = true;

    if (state.viewMode !== 'preview') {
        applyViewMode('preview', { persist: true });
        // applyViewMode clears placing when leaving other modes — re-enable place mode
        state.pendingImportList = mdlist;
        state.placingList = true;
        renderStructuredEditor();
    } else {
        renderStructuredEditor();
    }
    syncInsertListButton();
    syncImportListButton();
    setStatus(
        `Tap where to place “${mdlist.title}” (${mdlist.items.length} item${
            mdlist.items.length === 1 ? '' : 's'
        }), then Above or Below — or Cancel`,
        'ok'
    );
}

async function handleImportListFile(file) {
    if (!file) return;
    try {
        const text = await file.text();
        importXanderListFromText(text);
    } catch (err) {
        setStatus(err.message || 'Could not import list JSON', 'error');
    }
}

function cancelListPlacement() {
    state.placingList = false;
    state.pendingImportList = null;
    renderStructuredEditor();
    syncInsertListButton();
    syncImportListButton();
    setStatus('Cancelled list placement');
}

function insertRankedList() {
    if (!state.editor.fileId) return;

    if (state.viewMode === 'preview' && state.placingList) {
        cancelListPlacement();
        return;
    }

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);

    if (state.viewMode === 'preview') {
        state.clickEdit = false;
        state.pendingImportList = null;
        state.placingList = true;
        applyEditingLists(state.documentModel, state.editingListIds);
        applyTagFilters(state.documentModel, state.tagFilters);
        renderStructuredEditor();
        syncImportListButton();
        setStatus('Tap content to place the list, or Cancel', 'ok');
        return;
    }

    const list = appendEmptyList(state.documentModel);
    const item = addItem(list, '');
    state.editingListIds = { ...state.editingListIds, [list.id]: true };
    state.placingList = false;
    state.pendingImportList = null;
    state.clickEdit = false;
    applyEditingLists(state.documentModel, state.editingListIds);
    const serialized = serializeDocument(state.documentModel);
    setEditorText(state.editor, serialized);
    const els = getEls();
    els.editor.value = serialized;
    applyViewMode('list', { persist: true });
    renderStructuredEditor({ focusItemId: item.id });
    syncEditorChrome(state.editor);
    setStatus('Added ranked list', 'ok');
}

function toggleClickEdit() {
    if (!state.editor.fileId) return;

    if (state.viewMode === 'preview' && state.clickEdit) {
        state.clickEdit = false;
        renderStructuredEditor();
        setStatus('Cancelled');
        return;
    }

    flushCurrentEditorContent();
    refreshDocumentModelFromText(state.editor.editorContent);
    state.placingList = false;
    state.pendingImportList = null;
    state.clickEdit = true;

    if (state.viewMode !== 'preview') {
        applyViewMode('preview', { persist: true });
    } else {
        renderStructuredEditor();
    }
    syncClickEditButton();
    setStatus('Tap text to edit in Raw, or Cancel', 'ok');
}

function hasOpenFile() {
    return Boolean(state.editor.fileId);
}

function showAppView(name, extra = {}) {
    showView(name, { hasOpenFile: hasOpenFile(), ...extra });
    if (name === 'editor' && hasOpenFile() && !extra.loading) {
        applyEditorDisplayMode(state.viewMode, { hasFile: true });
        if (
            state.viewMode === 'list' ||
            state.viewMode === 'preview' ||
            state.viewMode === 'contents'
        ) {
            renderStructuredEditor();
        }
        syncNavLayout();
    }
}

async function openMarkdownFile(file) {
    flushCurrentEditorContent();
    if (
        state.editor.fileId &&
        state.editor.fileId !== file.id &&
        state.editor.dirty &&
        !confirmLeaveUnsaved()
    ) {
        return;
    }

    const els = getEls();
    state.editor.status = 'loading';
    showAppView('editor', { loading: true });
    setEditorLoading(true, file.name || 'Markdown file');
    setStatus('Opening file…');

    try {
        const meta = await getFileMetadata(file.id);
        const size = Number(meta.size || 0);
        if (size > LARGE_FILE_BYTES) {
            const ok = window.confirm(
                `This file is about ${Math.round(size / 1024 / 1024)} MB. Opening large files may be slow on iPhone. Continue?`
            );
            if (!ok) {
                setEditorLoading(false);
                state.editor.status = state.editor.dirty ? 'dirty' : 'idle';
                showAppView('finder');
                setStatus('');
                return;
            }
        }

        const content = await getFileContent(file.id);
        applyLoadedContent(state.editor, {
            fileId: meta.id,
            fileName: meta.name,
            mimeType: meta.mimeType,
            content,
        });
        rememberRecentFile({
            id: meta.id,
            name: meta.name,
            mimeType: meta.mimeType,
        });

        const draft = readDraft(meta.id);
        if (draft && draft.text !== content) {
            const choice = await promptRestoreDraft(els.draftDialog);
            if (choice === 'restore') {
                setEditorText(state.editor, draft.text);
            } else {
                clearDraft(meta.id);
            }
        }

        setEditorLoading(false);
        showAppView('editor');
        syncEditorChrome(state.editor);
        setupEditorForOpenFile();
    } catch (err) {
        setEditorLoading(false);
        markError(state.editor, err.message || 'Failed to open file');
        showAppView('editor');
        syncEditorChrome(state.editor);
        if (hasOpenFile()) {
            applyEditorDisplayMode(state.viewMode, { hasFile: true });
        }
        setStatus(state.editor.errorMessage, 'error');
    }
}

async function saveCurrentFile() {
    const ed = state.editor;
    const els = getEls();
    if (!ed.fileId) return;

    flushCurrentEditorContent();
    if (!ed.dirty) {
        setStatus('Already saved', 'ok');
        return;
    }

    markSaving(ed);
    syncEditorChrome(ed);

    try {
        await updateFileContent(ed.fileId, ed.editorContent, ed.mimeType || 'text/markdown');
        markSaved(ed);
        syncEditorChrome(ed);
        refreshDocumentModelFromText(ed.editorContent);
        applyTagFilters(state.documentModel, state.tagFilters);
        applyEditingLists(state.documentModel, state.editingListIds);
        if (state.viewMode !== 'raw') renderStructuredEditor();
    } catch (err) {
        markError(ed, err.message || 'Save failed');
        ed.dirty = ed.editorContent !== ed.originalContent;
        if (ed.dirty) ed.status = 'error';
        syncEditorChrome(ed);
        setStatus(ed.errorMessage, 'error');
    }
}

/**
 * Switch app mode tabs. Open files stay in memory across Pinned / Finder / Edit / Settings.
 * @param {'pinned' | 'finder' | 'editor' | 'settings'} mode
 */
async function switchAppMode(mode) {
    if (mode === 'editor') {
        showAppView('editor');
        if (hasOpenFile()) {
            syncEditorChrome(state.editor);
            applyViewMode(state.viewMode, { persist: false });
        }
        return;
    }

    const els = getEls();
    const leavingEditor = els.viewEditor && !els.viewEditor.hidden;
    if (leavingEditor && hasOpenFile() && state.editor.dirty) {
        flushCurrentEditorContent();
        const choice = await promptUnsavedChanges(els.unsavedDialog);
        if (choice === 'cancel') return;
        if (choice === 'save') {
            await saveCurrentFile();
            if (state.editor.dirty) return;
        }
    }

    if (leavingEditor) {
        state.placingList = false;
        state.pendingImportList = null;
        state.clickEdit = false;
    }

    if (mode === 'pinned') {
        showPinnedView();
        return;
    }

    if (mode === 'finder') {
        showAppView('finder');
        await refreshBrowse(true);
        return;
    }

    if (mode === 'settings') {
        showAppView('settings');
    }
}

async function signIn() {
    setConfigError('');
    setStatus('Waiting for Google…');
    try {
        await requestAccessToken();
        await afterSignedIn();
    } catch (err) {
        setStatus(err.message || 'Sign-in cancelled or failed', 'error');
    }
}

async function signOut() {
    if (state.editor.dirty && !confirmLeaveUnsaved()) return;
    try {
        await flushCloudSettingsSave(buildSettingsSnapshot);
    } catch {
        // ignore
    }
    resetCloudSettingsState();
    pinnedMetaCache.clear();
    clearToken({ revoke: true, forget: true });
    state.editor = createEditorState();
    state.files = [];
    state.browseMode = 'folder';
    state.searchQuery = '';
    state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
    state.documentModel = null;
    state.tagFilters = {};
    state.editingListIds = {};
    state.editingPlainLists = {};
    state.placingList = false;
    state.pendingImportList = null;
    state.clickEdit = false;
    state.viewMode = 'raw';
    state.parseWarnings = [];
    editorSearch?.close({ restoreFocus: false });
    showView('login');
    setStatus('');
}

async function afterSignedIn() {
    setStatus('');
    state.browseMode = 'folder';

    await syncSettingsFromCloud();

    const remembered = readRememberedFolder();
    if (remembered && remembered !== ROOT_FOLDER_ID) {
        state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
        try {
            const meta = await getFileMetadata(remembered);
            if (isFolder(meta)) {
                state.folderStack.push({ id: meta.id, name: meta.name || 'Folder' });
            }
        } catch {
            state.folderStack = [{ id: ROOT_FOLDER_ID, name: ROOT_FOLDER_NAME }];
        }
    }

    // Prefer Pinned when the user has shortcuts; Finder stays one tap away.
    if (readPinnedItems().length) {
        showPinnedView();
        // Warm Finder listing in the background for when they switch tabs
        loadBrowse(true).catch(() => {});
        return;
    }

    showAppView('finder');
    await loadBrowse(true);
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('SW registration failed', err);
        });
    });
}

function wireEvents() {
    const els = getEls();

    editorSearch = createEditorSearch({
        getEls,
        getText: () => {
            flushCurrentEditorContent();
            return getEls().editor?.value ?? state.editor.editorContent ?? '';
        },
        getViewMode: () => state.viewMode,
        getHighlightRoot: () => getEls().listsRoot,
        isActive: () => {
            const nodes = getEls();
            return Boolean(state.editor.fileId && nodes.viewEditor && !nodes.viewEditor.hidden);
        },
        onStatus: setStatus,
        onLayout: () => {
            // Find bar lives in the bottom nav — remeasure padding when it opens/closes.
            requestAnimationFrame(() => syncNavLayout());
        },
    });
    editorSearch.bind();

    els.tabPinned?.addEventListener('click', () => {
        editorSearch?.close({ restoreFocus: false });
        switchAppMode('pinned');
    });
    els.tabFinder.addEventListener('click', () => {
        editorSearch?.close({ restoreFocus: false });
        switchAppMode('finder');
    });
    els.tabEditor.addEventListener('click', () => {
        switchAppMode('editor');
    });
    els.tabSettings.addEventListener('click', () => {
        editorSearch?.close({ restoreFocus: false });
        switchAppMode('settings');
    });
    els.btnGoFinder.addEventListener('click', () => {
        editorSearch?.close({ restoreFocus: false });
        switchAppMode('finder');
    });

    els.btnSignIn.addEventListener('click', () => {
        signIn();
    });
    els.btnSignOut.addEventListener('click', () => {
        signOut();
    });
    els.btnSave.addEventListener('click', () => {
        saveCurrentFile();
    });
    els.btnUp.addEventListener('click', () => {
        goUp();
    });
    els.btnLoadMore.addEventListener('click', () => {
        if (!state.loadingFolder && state.nextPageToken) {
            refreshBrowse(false);
        }
    });
    els.btnModeFolders.addEventListener('click', () => {
        switchToFolderMode();
    });
    els.btnModeComputers.addEventListener('click', () => {
        switchToComputersMode();
    });
    els.btnModeSearch.addEventListener('click', async () => {
        await switchToSearchMode();
    });
    els.btnNewNote.addEventListener('click', () => {
        handleCreateNote();
    });
    els.btnNewFolder.addEventListener('click', () => {
        handleCreateFolder();
    });
    if (els.btnFinderSort) {
        els.btnFinderSort.addEventListener('click', async () => {
            const current = readFinderSort();
            const next = await promptFinderSort(current);
            if (!next || next === current) return;
            const mode = writeFinderSort(next);
            syncFinderSortControl(mode);
            const label =
                FINDER_SORT_OPTIONS.find((o) => o.value === mode)?.label || mode;
            setStatus(`Sorted by ${label}`, 'ok');
            const elsNow = getEls();
            if (elsNow.viewPinned && !elsNow.viewPinned.hidden) {
                await renderPinnedView();
            } else {
                await refreshBrowse(true);
            }
        });
    }
    if (els.btnEditorMore) {
        els.btnEditorMore.addEventListener('click', () => {
            handleEditorMoreMenu();
        });
    }
    if (els.editorMoreImport && els.importListFile) {
        // Keep file-picker open in the same user gesture as the menu tap.
        els.editorMoreImport.addEventListener('click', () => {
            const dialog = els.editorMoreDialog;
            if (dialog?.open) dialog.close('cancel');
            if (!hasOpenFile()) {
                setStatus('Open a markdown file first', 'warn');
                return;
            }
            els.importListFile.value = '';
            els.importListFile.click();
        });
    }
    if (els.btnInsertList) {
        els.btnInsertList.addEventListener('click', () => {
            insertRankedList();
        });
    }
    if (els.importListFile) {
        els.importListFile.addEventListener('change', () => {
            const file = els.importListFile.files?.[0];
            handleImportListFile(file);
            els.importListFile.value = '';
        });
    }
    if (els.btnClickEdit) {
        els.btnClickEdit.addEventListener('click', () => {
            toggleClickEdit();
        });
    }

    const prefs = readFinderLayoutPrefs();
    applyFinderLayoutPrefs(prefs);
    syncFinderLayoutControls(prefs);
    applySavedTheme();
    applySavedPwaTopGap();
    applySavedPwaBottomOffset();
    applySavedPreviewFontScale();
    applySavedListStripe();
    applySavedListLayout();
    applySavedDefaultEditView();
    applySavedDoubleTapCopy();
    applySavedFinderSort();
    if (els.prefTheme) {
        els.prefTheme.addEventListener('change', () => {
            const theme = THEME_VALUES.has(els.prefTheme.value) ? els.prefTheme.value : THEME_DEFAULT;
            writeTheme(theme);
            applyTheme(theme, { metaColor: THEME_META_COLORS[theme] || THEME_META_COLORS.blue });
            setStatus('Theme saved', 'ok');
        });
    }
    if (els.prefPwaTopGap) {
        const onGapInput = () => {
            const n = writePwaTopGap(els.prefPwaTopGap.value);
            applyPwaTopGap(n);
        };
        els.prefPwaTopGap.addEventListener('input', onGapInput);
        els.prefPwaTopGap.addEventListener('change', () => {
            const n = writePwaTopGap(els.prefPwaTopGap.value);
            applyPwaTopGap(n);
            setStatus(`Status bar spacing set to ${n}px`, 'ok');
        });
    }
    if (els.prefPwaBottomOffset) {
        const onBottomInput = () => {
            const n = writePwaBottomOffset(els.prefPwaBottomOffset.value);
            applyPwaBottomOffset(n);
        };
        els.prefPwaBottomOffset.addEventListener('input', onBottomInput);
        els.prefPwaBottomOffset.addEventListener('change', () => {
            const n = writePwaBottomOffset(els.prefPwaBottomOffset.value);
            applyPwaBottomOffset(n);
            setStatus(`Bottom edge set to ${n}px`, 'ok');
        });
    }
    if (els.prefPreviewFontScale) {
        const onScaleInput = () => {
            const n = writePreviewFontScale(els.prefPreviewFontScale.value);
            applyPreviewFontScale(n);
        };
        els.prefPreviewFontScale.addEventListener('input', onScaleInput);
        els.prefPreviewFontScale.addEventListener('change', () => {
            const n = writePreviewFontScale(els.prefPreviewFontScale.value);
            applyPreviewFontScale(n);
            setStatus(`Preview text size set to ${n}%`, 'ok');
        });
    }
    if (els.prefListStripe) {
        els.prefListStripe.addEventListener('change', () => {
            const mode = writeListStripe(els.prefListStripe.value);
            applyListStripe(mode);
            const label =
                mode === 'zebra'
                    ? 'Alternating grey list stripes'
                    : mode === 'spectrum'
                      ? '16-colour list stripes'
                      : 'Normal list styling';
            setStatus(`${label} saved`, 'ok');
        });
    }
    if (els.prefListLayoutSegmented) {
        els.prefListLayoutSegmented.addEventListener('change', () => {
            const layout = writeListLayout(
                els.prefListLayoutSegmented.checked ? 'segmented' : 'continuous'
            );
            applyListLayout(layout);
            setStatus(
                layout === 'segmented'
                    ? 'Segmented list containers on'
                    : 'Continuous list with text colour stripes',
                'ok'
            );
        });
    }
    if (els.prefDefaultEditView) {
        els.prefDefaultEditView.addEventListener('change', () => {
            const mode = writeDefaultEditView(els.prefDefaultEditView.value);
            syncDefaultEditViewControl(mode);
            const label =
                DEFAULT_EDIT_VIEW_OPTIONS.find((o) => o.value === mode)?.label || mode;
            setStatus(`Default edit view: ${label}`, 'ok');
        });
    }
    if (els.prefDoubleTapCopy) {
        els.prefDoubleTapCopy.addEventListener('change', () => {
            const enabled = writeDoubleTapCopyEnabled(els.prefDoubleTapCopy.checked);
            syncDoubleTapCopyControl(enabled);
            setStatus(
                enabled ? 'Double-tap copy on' : 'Double-tap copy off',
                'ok'
            );
        });
    }
    if (els.prefMdOrderMobile) {
        els.prefMdOrderMobile.addEventListener('change', () => {
            const next = {
                ...readFinderLayoutPrefs(),
                mobile: els.prefMdOrderMobile.value === 'top' ? 'top' : 'bottom',
            };
            writeFinderLayoutPrefs(next);
            applyFinderLayoutPrefs(next);
            scrollFinderToMarkdownSection();
            setStatus('Mobile Finder layout saved', 'ok');
        });
    }
    if (els.prefMdOrderDesktop) {
        els.prefMdOrderDesktop.addEventListener('change', () => {
            const next = {
                ...readFinderLayoutPrefs(),
                desktop: els.prefMdOrderDesktop.value === 'top' ? 'top' : 'bottom',
            };
            writeFinderLayoutPrefs(next);
            applyFinderLayoutPrefs(next);
            scrollFinderToMarkdownSection();
            setStatus('Desktop Finder layout saved', 'ok');
        });
    }

    els.searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        state.browseMode = 'search';
        state.searchQuery = els.searchInput.value || '';
        loadSearch(true);
    });
    els.nameForm.addEventListener('submit', (event) => {
        // Let method="dialog" close; block empty confirm
        const submitter = event.submitter;
        if (submitter && submitter.value === 'confirm' && !els.nameInput.value.trim()) {
            event.preventDefault();
            els.nameInput.focus();
        }
    });

    els.editor.addEventListener('input', () => {
        setEditorText(state.editor, els.editor.value);
        syncEditorChrome(state.editor);
    });

    const modeButtons = [els.modeList, els.modePreview, els.modeContents, els.modeRaw];
    for (const btn of modeButtons) {
        if (!btn) continue;
        btn.addEventListener('click', () => {
            if (!hasOpenFile()) return;
            const next = btn.dataset.viewMode;
            applyViewMode(next, {
                persist: true,
                reparseFromTextarea: state.viewMode === 'raw',
            });
        });
    }

    window.addEventListener('keydown', (event) => {
        const key = event.key?.toLowerCase();
        if ((event.metaKey || event.ctrlKey) && key === 's') {
            event.preventDefault();
            if (hasOpenFile()) saveCurrentFile();
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (state.editor.dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && state.editor.dirty && state.editor.fileId) {
            if (state.viewMode === 'raw') {
                setEditorText(state.editor, els.editor.value);
            } else if (state.documentModel) {
                setEditorText(state.editor, serializeDocument(state.documentModel));
            }
        }
    });

    window.addEventListener('resize', () => {
        syncNavLayout();
    });

    window.addEventListener('md-editor:settings-changed', () => {
        queueSettingsCloudSync();
    });
}

async function boot() {
    bindUi();
    wireEvents();
    applySavedFinderLayout();
    applySavedTheme();
    applySavedListStripe();
    applySavedListLayout();
    applySavedDefaultEditView();
    applySavedDoubleTapCopy();
    applySavedFinderSort();
    registerServiceWorker();

    if (!isConfigured()) {
        showView('login');
        setConfigError(
            'Client ID not configured. Add PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID to .env.local, then run npm run build && npm run preview (or set the var on Vercel). See README.md.'
        );
        setStatus('Configuration needed', 'warn');
        return;
    }

    if (isSignedIn()) {
        await afterSignedIn();
        return;
    }

    showView('login');
    setStatus('Restoring session…');
    const restored = await tryRestoreSession();
    if (restored) {
        await afterSignedIn();
        return;
    }

    setStatus('');
}

boot();
