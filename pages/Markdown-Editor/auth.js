import { DRIVE_SCOPE, GOOGLE_CLIENT_ID, isConfigured } from './config.js';

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

export function getAccessToken() {
    if (accessToken && Date.now() < expiresAt - 30_000) {
        return accessToken;
    }
    return null;
}

export function clearToken() {
    const token = accessToken;
    accessToken = null;
    expiresAt = 0;
    if (token && window.google?.accounts?.oauth2) {
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
            resolve(accessToken);
        };

        try {
            const request = {};
            if (options.prompt !== undefined) {
                request.prompt = options.prompt;
            } else if (!accessToken) {
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
