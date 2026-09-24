/**
 * Sync Markdown Editor settings to a hidden Drive appDataFolder JSON file.
 * Local localStorage remains the fast cache; cloud is the cross-device source of truth after sign-in.
 */

import { SETTINGS_CLOUD_FILE_NAME, SETTINGS_CLOUD_VERSION } from './config.js';
import {
    createAppDataFile,
    getFileContent,
    listAppDataFiles,
    updateFileContent,
} from './drive.js';
import {
    cloudHasPrefs,
    cloudSettingsScore,
    mergeFileTextBold,
    mergeFileTextColors,
    mergePinnedState,
    parseCloudSettingsText,
} from './settings-merge.js';
import { saveLastGoodSettings } from './settings-cache.js';

/** @type {string | null} */
let settingsFileId = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let saveTimer = null;
/** @type {Promise<void> | null} */
let saveInFlight = null;
/** @type {(() => CloudSettings) | null} */
let pendingSnapshot = null;
/** @type {{ onError?: (err: Error) => void } | null} */
let pendingSaveOptions = null;
let applyingCloud = false;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @typedef {{
 *   version: number,
 *   updatedAt: number,
 *   theme?: string,
 *   previewTocSticky?: boolean,
 *   previewTocOpen?: boolean,
 *   pwaTopGap?: number,
 *   pwaBottomOffset?: number,
 *   previewFontScale?: number,
 *   listStripe?: string,
 *   listLayout?: string,
 *   defaultEditView?: string,
 *   doubleTapCopy?: boolean,
 *   showFileExtensions?: boolean,
 *   blockingSave?: boolean,
 *   showDates?: boolean,
 *   finderMdOrder?: { mobile?: string, desktop?: string },
 *   finderSort?: string,
 *   pinnedItems?: object[],
 *   pinnedTombs?: Record<string, number>,
 *   openedFiles?: Record<string, number>,
 *   fileTextColors?: Record<string, string>,
 *   fileTextColorAt?: Record<string, number>,
 *   fileTextBold?: Record<string, true>,
 *   fileTextBoldAt?: Record<string, number>,
 * }} CloudSettings
 */

/**
 * @param {() => CloudSettings} getSnapshot
 * @returns {CloudSettings}
 */
export function stampSettingsSnapshot(getSnapshot) {
    const snap = typeof getSnapshot === 'function' ? getSnapshot() : {};
    return {
        ...snap,
        version: SETTINGS_CLOUD_VERSION,
        updatedAt: Date.now(),
    };
}

export function isApplyingCloudSettings() {
    return applyingCloud;
}

/** Fire after any local settings mutation so the app can schedule a cloud push. */
export function notifySettingsDirty() {
    if (applyingCloud) return;
    try {
        window.dispatchEvent(new CustomEvent('md-editor:settings-changed'));
    } catch {
        // ignore
    }
}

/**
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function withCloudApplyGuard(fn) {
    applyingCloud = true;
    try {
        return fn();
    } finally {
        applyingCloud = false;
    }
}

/**
 * Load settings from Drive appData.
 * Never overwrite an existing cloud file with the local snapshot — after a
 * Safari cache refresh localStorage is empty defaults, and writing those
 * would wipe pins / theme / colours on Drive.
 * @param {() => CloudSettings} getLocalSnapshot
 * @returns {Promise<{
 *   settings: CloudSettings,
 *   created: boolean,
 *   fromCloud: boolean,
 *   readFailed: boolean,
 * }>}
 */
export async function pullCloudSettings(getLocalSnapshot, options = {}) {
    const local = stampSettingsSnapshot(getLocalSnapshot);
    const files = await listAppDataFiles(SETTINGS_CLOUD_FILE_NAME);
    // After a PWA update, local storage is often only boot defaults. Do not
    // create a new Drive file from those — that hides the real settings file.
    const seedIfMissing = options.seedIfMissing !== false;

    if (!files.length) {
        if (!seedIfMissing) {
            return { settings: local, created: false, fromCloud: false, readFailed: false };
        }
        const created = await createAppDataFile(
            SETTINGS_CLOUD_FILE_NAME,
            JSON.stringify(local, null, 2)
        );
        settingsFileId = created.id;
        return { settings: local, created: true, fromCloud: false, readFailed: false };
    }

    const candidates = [];
    for (const file of files) {
        try {
            const text = await getFileContent(file.id);
            const cloud = parseCloudSettingsText(text);
            if (cloud && cloudHasPrefs(cloud)) {
                candidates.push({ file, settings: cloud, score: cloudSettingsScore(cloud) });
            }
        } catch (err) {
            console.warn('[md-editor] settings file unreadable', file.id, err);
        }
    }

    if (candidates.length) {
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        settingsFileId = best.file.id;
        return { settings: best.settings, created: false, fromCloud: true, readFailed: false };
    }

    // Files exist but none had usable prefs — keep them; do not seed-overwrite
    // and do not remember an id that a later push would clobber.
    return { settings: local, created: false, fromCloud: false, readFailed: true };
}

/**
 * Union pins and colours so a thin local snapshot cannot wipe Drive.
 * Scalar prefs on `local` win when present; pin lists are merged by timestamp.
 * @param {CloudSettings} cloud
 * @param {CloudSettings} local
 * @returns {CloudSettings}
 */
function mergeSnapshotForPush(cloud, local) {
    const pins = mergePinnedState({
        localItems: local.pinnedItems,
        localTombs: local.pinnedTombs,
        cloudItems: cloud.pinnedItems,
        cloudTombs: cloud.pinnedTombs,
    });
    const colors = mergeFileTextColors({
        localColors: local.fileTextColors,
        localAt: local.fileTextColorAt,
        cloudColors: cloud.fileTextColors,
        cloudAt: cloud.fileTextColorAt,
    });
    const bold = mergeFileTextBold({
        localBold: local.fileTextBold,
        localAt: local.fileTextBoldAt,
        cloudBold: cloud.fileTextBold,
        cloudAt: cloud.fileTextBoldAt,
    });
    return {
        ...cloud,
        ...local,
        pinnedItems: pins.items,
        pinnedTombs: pins.tombs,
        fileTextColors: colors.colors,
        fileTextColorAt: colors.at,
        fileTextBold: bold.bold,
        fileTextBoldAt: bold.at,
        version: SETTINGS_CLOUD_VERSION,
        updatedAt: Date.now(),
    };
}

/**
 * @param {CloudSettings} snapshot
 */
/**
 * Read every settings copy and fold it into `next`.
 * A network failure aborts the save. Unreadable JSON is skipped so we never
 * replace those bytes with a thinner snapshot.
 * @param {Array<{ id: string }>} files
 * @param {CloudSettings} next
 * @returns {Promise<{ next: CloudSettings, bestId: string | null, networkFailed: boolean }>}
 */
async function mergeExistingSettingsFiles(files, next) {
    let bestId = null;
    let bestScore = -1;
    let networkFailed = false;
    let merged = next;
    for (const file of files) {
        if (!file?.id) continue;
        try {
            const cloud = parseCloudSettingsText(await getFileContent(file.id));
            if (!cloud) continue;
            const score = cloudSettingsScore(cloud);
            if (bestId == null || score > bestScore) {
                bestScore = score;
                bestId = file.id;
            }
            merged = mergeSnapshotForPush(cloud, merged);
        } catch (err) {
            if (err?.status === 404) continue;
            networkFailed = true;
            console.warn('[md-editor] settings file unreadable during save', file.id, err);
        }
    }
    return { next: merged, bestId, networkFailed };
}

/**
 * @param {CloudSettings} snapshot
 * @returns {Promise<CloudSettings>} the snapshot actually written (cloud pins included)
 */
export async function pushCloudSettings(snapshot, options = {}) {
    let next = {
        ...snapshot,
        version: SETTINGS_CLOUD_VERSION,
        updatedAt: snapshot.updatedAt || Date.now(),
    };

    if (settingsFileId) {
        try {
            const cloud = parseCloudSettingsText(await getFileContent(settingsFileId));
            if (cloud) next = mergeSnapshotForPush(cloud, next);
            else settingsFileId = null;
        } catch (err) {
            if (err?.status === 404) settingsFileId = null;
            else throw err;
        }
    }

    if (!settingsFileId) {
        const existing = await listAppDataFiles(SETTINGS_CLOUD_FILE_NAME);
        if (existing.length) {
            const merged = await mergeExistingSettingsFiles(existing, next);
            next = merged.next;
            if (!merged.bestId) {
                if (merged.networkFailed) {
                    throw new Error('Could not read saved settings before writing');
                }
            } else {
                settingsFileId = merged.bestId;
            }
        }
    }

    const body = JSON.stringify(next, null, 2);
    const writeOpts = { keepalive: Boolean(options.keepalive) };

    if (!settingsFileId) {
        const file = await createAppDataFile(SETTINGS_CLOUD_FILE_NAME, body);
        settingsFileId = file.id;
        return next;
    }

    try {
        await updateFileContent(settingsFileId, body, 'application/json', writeOpts);
        return next;
    } catch (err) {
        if (err?.status !== 404) throw err;
        const staleId = settingsFileId;
        settingsFileId = null;
        const others = (await listAppDataFiles(SETTINGS_CLOUD_FILE_NAME)).filter(
            (file) => file.id !== staleId
        );
        if (others.length) {
            const merged = await mergeExistingSettingsFiles(others, next);
            next = merged.next;
            if (merged.networkFailed && !merged.bestId) {
                throw new Error('Could not read saved settings before writing');
            }
            if (merged.bestId) {
                settingsFileId = merged.bestId;
                await updateFileContent(
                    merged.bestId,
                    JSON.stringify(next, null, 2),
                    'application/json',
                    writeOpts
                );
                return next;
            }
        }
        const file = await createAppDataFile(SETTINGS_CLOUD_FILE_NAME, JSON.stringify(next, null, 2));
        settingsFileId = file.id;
        return next;
    }
}

async function pushSnapshotWithRetry(getSnapshot, options = {}) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const snap = stampSettingsSnapshot(getSnapshot);
            const saved = await pushCloudSettings(snap, { keepalive: Boolean(options.keepalive) });
            await saveLastGoodSettings(saved || snap);
            return;
        } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
            if (attempt < 2) await sleep(350 * (attempt + 1));
        }
    }
    options.onError?.(lastErr);
    throw lastErr;
}

function kickPendingSave() {
    if (saveInFlight || !pendingSnapshot) return;
    const getSnapshot = pendingSnapshot;
    const options = pendingSaveOptions || {};
    pendingSnapshot = null;
    pendingSaveOptions = null;
    saveInFlight = pushSnapshotWithRetry(getSnapshot, options)
        .catch(() => {})
        .finally(() => {
            saveInFlight = null;
            if (pendingSnapshot) kickPendingSave();
        });
}

/**
 * Debounced cloud save. No-op while applying a cloud pull.
 * @param {() => CloudSettings} getSnapshot
 * @param {{ delayMs?: number, immediate?: boolean, keepalive?: boolean, onError?: (err: Error) => void }} [options]
 */
export function scheduleCloudSettingsSave(getSnapshot, options = {}) {
    if (applyingCloud) return;
    pendingSnapshot = getSnapshot;
    pendingSaveOptions = options;
    const delayMs = options.immediate ? 0 : (options.delayMs ?? 700);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        kickPendingSave();
    }, delayMs);
}

/** Flush any pending debounced save immediately (e.g. before sign-out / PWA refresh). */
export async function flushCloudSettingsSave(getSnapshot, options = {}) {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (applyingCloud) return;
    if (typeof getSnapshot === 'function') {
        pendingSnapshot = getSnapshot;
        pendingSaveOptions = { ...pendingSaveOptions, ...options, keepalive: true };
    }
    if (saveInFlight) {
        await saveInFlight;
    }
    if (!pendingSnapshot) return;
    const fn = pendingSnapshot;
    const saveOptions = pendingSaveOptions || { keepalive: true };
    pendingSnapshot = null;
    pendingSaveOptions = null;
    try {
        await pushSnapshotWithRetry(fn, { ...saveOptions, keepalive: true });
    } catch {
        // ignore flush failures on hide / sign-out
    }
}

export function resetCloudSettingsState() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    settingsFileId = null;
    saveInFlight = null;
    pendingSnapshot = null;
    pendingSaveOptions = null;
    applyingCloud = false;
}
