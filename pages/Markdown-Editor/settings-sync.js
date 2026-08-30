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
export async function pullCloudSettings(getLocalSnapshot) {
    const local = stampSettingsSnapshot(getLocalSnapshot);
    const files = await listAppDataFiles(SETTINGS_CLOUD_FILE_NAME);

    if (!files.length) {
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

    // Files exist but none had usable prefs — keep them; do not seed-overwrite.
    settingsFileId = files[0].id;
    return { settings: local, created: false, fromCloud: false, readFailed: true };
}

/**
 * @param {CloudSettings} snapshot
 */
export async function pushCloudSettings(snapshot, options = {}) {
    const body = JSON.stringify(
        {
            ...snapshot,
            version: SETTINGS_CLOUD_VERSION,
            updatedAt: snapshot.updatedAt || Date.now(),
        },
        null,
        2
    );
    const writeOpts = { keepalive: Boolean(options.keepalive) };

    if (!settingsFileId) {
        const existing = await listAppDataFiles(SETTINGS_CLOUD_FILE_NAME);
        if (existing.length) {
            settingsFileId = existing[0].id;
        } else {
            const file = await createAppDataFile(SETTINGS_CLOUD_FILE_NAME, body);
            settingsFileId = file.id;
            return file;
        }
    }

    try {
        return await updateFileContent(settingsFileId, body, 'application/json', writeOpts);
    } catch (err) {
        // File may have been deleted — reuse another copy or create one.
        if (err?.status === 404) {
            settingsFileId = null;
            const existing = await listAppDataFiles(SETTINGS_CLOUD_FILE_NAME);
            if (existing.length) {
                settingsFileId = existing[0].id;
                return await updateFileContent(settingsFileId, body, 'application/json', writeOpts);
            }
            const file = await createAppDataFile(SETTINGS_CLOUD_FILE_NAME, body);
            settingsFileId = file.id;
            return file;
        }
        throw err;
    }
}

async function pushSnapshotWithRetry(getSnapshot, options = {}) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const snap = stampSettingsSnapshot(getSnapshot);
            await pushCloudSettings(snap, { keepalive: Boolean(options.keepalive) });
            await saveLastGoodSettings(snap);
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
