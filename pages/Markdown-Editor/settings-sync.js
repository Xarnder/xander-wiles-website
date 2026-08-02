/**
 * Sync Markdown Editor settings to a hidden Drive appDataFolder JSON file.
 * Local localStorage remains the fast cache; cloud is the cross-device source of truth after sign-in.
 */

import { SETTINGS_CLOUD_FILE_NAME, SETTINGS_CLOUD_VERSION } from './config.js';
import {
    ensureAppDataFile,
    getFileContent,
    updateFileContent,
} from './drive.js';

/** @type {string | null} */
let settingsFileId = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let saveTimer = null;
/** @type {Promise<void> | null} */
let saveInFlight = null;
let applyingCloud = false;

/**
 * @typedef {{
 *   version: number,
 *   updatedAt: number,
 *   theme?: string,
 *   previewTocSticky?: boolean,
 *   previewTocOpen?: boolean,
 *   pwaTopGap?: number,
 *   previewFontScale?: number,
 *   listStripe?: string,
 *   listLayout?: string,
 *   finderMdOrder?: { mobile?: string, desktop?: string },
 *   pinnedItems?: object[],
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
 * Load settings from Drive appData (or seed a new file from the local snapshot).
 * @param {() => CloudSettings} getLocalSnapshot
 * @returns {Promise<{ settings: CloudSettings, created: boolean }>}
 */
export async function pullCloudSettings(getLocalSnapshot) {
    const local = stampSettingsSnapshot(getLocalSnapshot);
    const seed = JSON.stringify(local, null, 2);
    const file = await ensureAppDataFile(SETTINGS_CLOUD_FILE_NAME, seed);
    settingsFileId = file.id;

    let text = '';
    try {
        text = await getFileContent(file.id);
    } catch (err) {
        // Empty / unreadable — keep seed and rewrite.
        await updateFileContent(file.id, seed, 'application/json');
        return { settings: local, created: true };
    }

    const trimmed = String(text || '').trim();
    if (!trimmed || trimmed === '{}') {
        await updateFileContent(file.id, seed, 'application/json');
        return { settings: local, created: true };
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid settings JSON');
        }
        /** @type {CloudSettings} */
        const cloud = {
            version: Number(parsed.version) || SETTINGS_CLOUD_VERSION,
            updatedAt: Number(parsed.updatedAt) || 0,
            theme: parsed.theme,
            previewTocSticky: parsed.previewTocSticky,
            previewTocOpen: parsed.previewTocOpen,
            pwaTopGap: parsed.pwaTopGap,
            previewFontScale: parsed.previewFontScale,
            finderMdOrder: parsed.finderMdOrder,
            pinnedItems: Array.isArray(parsed.pinnedItems) ? parsed.pinnedItems : undefined,
        };

        // If cloud is empty of prefs, seed from local.
        const hasPrefs =
            cloud.theme != null ||
            cloud.previewTocSticky != null ||
            cloud.pwaTopGap != null ||
            cloud.previewFontScale != null ||
            cloud.finderMdOrder != null ||
            cloud.pinnedItems != null;
        if (!hasPrefs) {
            await updateFileContent(file.id, seed, 'application/json');
            return { settings: local, created: true };
        }

        return { settings: cloud, created: false };
    } catch {
        await updateFileContent(file.id, seed, 'application/json');
        return { settings: local, created: true };
    }
}

/**
 * @param {CloudSettings} snapshot
 */
export async function pushCloudSettings(snapshot) {
    const body = JSON.stringify(
        {
            ...snapshot,
            version: SETTINGS_CLOUD_VERSION,
            updatedAt: snapshot.updatedAt || Date.now(),
        },
        null,
        2
    );

    if (!settingsFileId) {
        const file = await ensureAppDataFile(SETTINGS_CLOUD_FILE_NAME, body);
        settingsFileId = file.id;
        return file;
    }

    try {
        return await updateFileContent(settingsFileId, body, 'application/json');
    } catch (err) {
        // File may have been deleted — recreate.
        if (err?.status === 404) {
            settingsFileId = null;
            const file = await ensureAppDataFile(SETTINGS_CLOUD_FILE_NAME, body);
            settingsFileId = file.id;
            return file;
        }
        throw err;
    }
}

/**
 * Debounced cloud save. No-op while applying a cloud pull.
 * @param {() => CloudSettings} getSnapshot
 * @param {{ delayMs?: number, onError?: (err: Error) => void }} [options]
 */
export function scheduleCloudSettingsSave(getSnapshot, options = {}) {
    if (applyingCloud) return;
    const delayMs = options.delayMs ?? 700;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const run = async () => {
            try {
                const snap = stampSettingsSnapshot(getSnapshot);
                await pushCloudSettings(snap);
            } catch (err) {
                options.onError?.(err instanceof Error ? err : new Error(String(err)));
            }
        };
        saveInFlight = run().finally(() => {
            saveInFlight = null;
        });
    }, delayMs);
}

/** Flush any pending debounced save immediately (e.g. before sign-out). */
export async function flushCloudSettingsSave(getSnapshot) {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (applyingCloud) return;
    if (saveInFlight) {
        await saveInFlight;
    }
    try {
        const snap = stampSettingsSnapshot(getSnapshot);
        await pushCloudSettings(snap);
    } catch {
        // ignore flush failures on sign-out
    }
}

export function resetCloudSettingsState() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    settingsFileId = null;
    applyingCloud = false;
}
