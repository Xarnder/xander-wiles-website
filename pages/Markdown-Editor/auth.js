import {
    DRIVE_SCOPE,
    GOOGLE_CLIENT_ID,
    OAUTH_SESSION_KEY,
    REMEMBER_SIGNIN_KEY,
    isConfigured,
} from './config.js';

let tokenClient = null;
let accessToken = null;
let expiresAt = 0;
let gisReadyPromise = null;

function waitForGis() {
    if (window.google?.accounts?.oauth2) {
        return Promise.resolve();
    }
    if (gisReadyPromise) return gisReadyPromise;

    gisReadyPromise = new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
            if (window.google?.accounts?.oauth2) {
                clearInterval(timer);
                resolve();
                return;
            }
            if (Date.now() - started > 15000) {
                clearInterval(timer);
                reject(new Error('Google Identity Services failed to load. Check your network and try again.'));
            }
        }, 50);
    });
    return gisReadyPromise;
}

function ensureTokenClient() {
    if (!isConfigured()) {
        throw new Error('Missing PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID. Set it in .env.local and rebuild.');
    }
    if (tokenClient) return tokenClient;

    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {},
    });
    return tokenClient;
}

function readStoredSession() {
    try {
        const raw = localStorage.getItem(OAUTH_SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.accessToken || !data?.expiresAt) return null;
        return data;
    } catch {
        return null;
    }
}

function persistSession() {
    if (!accessToken || !expiresAt) return;
    try {
        localStorage.setItem(
            OAUTH_SESSION_KEY,
            JSON.stringify({ accessToken, expiresAt })
        );
        localStorage.setItem(REMEMBER_SIGNIN_KEY, '1');
    } catch {
        // private mode / quota — memory token still works for this tab
    }
}

function clearPersistedSession() {
    try {
        localStorage.removeItem(OAUTH_SESSION_KEY);
    } catch {
        // ignore
    }
}

function rememberSignInEnabled() {
    try {
        if (localStorage.getItem(REMEMBER_SIGNIN_KEY) === '1') return true;
    } catch {
        // ignore
    }
    return Boolean(readStoredSession());
}

/** Load a still-valid cached token into memory. */
function hydrateFromStorage() {
    const data = readStoredSession();
    if (!data) return false;
    if (Date.now() >= data.expiresAt - 30_000) return false;
    accessToken = data.accessToken;
    expiresAt = data.expiresAt;
    return true;
}

export function getAccessToken() {
    if (accessToken && Date.now() < expiresAt - 30_000) {
        return accessToken;
    }
    if (hydrateFromStorage()) {
        return accessToken;
    }
    accessToken = null;
    expiresAt = 0;
    return null;
}

/**
 * Clear in-memory + cached token. Optionally revoke with Google and forget auto-restore.
 * @param {{ revoke?: boolean, forget?: boolean }} [options]
 */
export function clearToken(options = {}) {
    const { revoke = true, forget = false } = options;
    const token = accessToken || readStoredSession()?.accessToken || null;
    accessToken = null;
    expiresAt = 0;
    clearPersistedSession();

    if (forget) {
        try {
            localStorage.removeItem(REMEMBER_SIGNIN_KEY);
        } catch {
            // ignore
        }
    }

    if (revoke && token && window.google?.accounts?.oauth2) {
        try {
            window.google.accounts.oauth2.revoke(token, () => {});
        } catch {
            // ignore revoke failures
        }
    }
}

export function isSignedIn() {
    return Boolean(getAccessToken());
}

/**
 * Request a Drive access token via GIS.
 * @param {{ prompt?: '' | 'consent' }} [options]
 */
export async function requestAccessToken(options = {}) {
    await waitForGis();
    const client = ensureTokenClient();

    return new Promise((resolve, reject) => {
        client.callback = (response) => {
            if (response.error) {
                reject(new Error(response.error_description || response.error || 'Sign-in failed'));
                return;
            }
            accessToken = response.access_token;
            const expiresIn = Number(response.expires_in || 3600);
            expiresAt = Date.now() + expiresIn * 1000;
            persistSession();
            resolve(accessToken);
        };

        try {
            const request = {};
            if (options.prompt !== undefined) {
                request.prompt = options.prompt;
            } else if (!getAccessToken()) {
                request.prompt = 'consent';
            }
            client.requestAccessToken(request);
        } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

/** Re-auth without wiping editor state; used after 401. */
export async function refreshAccessToken() {
    return requestAccessToken({ prompt: '' });
}

/**
 * Restore a previous session after refresh / PWA reopen.
 * Uses a cached token if still valid, otherwise silent GIS refresh (no consent UI).
 * @returns {Promise<boolean>}
 */
export async function tryRestoreSession() {
    if (getAccessToken()) return true;
    if (!isConfigured()) return false;
    if (!rememberSignInEnabled()) return false;

    try {
        await requestAccessToken({ prompt: '' });
        return Boolean(getAccessToken());
    } catch {
        return false;
    }
}
