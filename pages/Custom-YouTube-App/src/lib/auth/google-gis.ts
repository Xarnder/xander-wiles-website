import { env } from '$env/dynamic/public';
import { isEmailAllowed, parseAllowlist } from './allowlist';

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';
const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export function googleClientId(): string {
	return env.PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? '';
}

export function allowedEmails(): string[] {
	return parseAllowlist(env.PUBLIC_ALLOWED_GOOGLE_EMAILS);
}

export function authConfigReady(): boolean {
	return Boolean(googleClientId()) && allowedEmails().length > 0;
}

function loadGisScript(): Promise<void> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('Google Identity Services is browser-only.'));
	}
	if (window.google?.accounts?.oauth2) return Promise.resolve();

	const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT}"]`);
	if (existing) {
		return new Promise((resolve, reject) => {
			existing.addEventListener('load', () => resolve(), { once: true });
			existing.addEventListener(
				'error',
				() => reject(new Error('Failed to load Google sign-in.')),
				{
					once: true
				}
			);
		});
	}

	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = GIS_SCRIPT;
		script.async = true;
		script.defer = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('Failed to load Google sign-in.'));
		document.head.appendChild(script);
	});
}

export async function requestGoogleAccessToken(): Promise<{
	accessToken: string;
	expiresAt: number;
}> {
	const clientId = googleClientId();
	if (!clientId) {
		throw new Error('Missing PUBLIC_GOOGLE_CLIENT_ID.');
	}

	await loadGisScript();
	const oauth = window.google?.accounts?.oauth2;
	if (!oauth) {
		throw new Error('Google Identity Services did not initialize.');
	}

	return new Promise((resolve, reject) => {
		const client = oauth.initTokenClient({
			client_id: clientId,
			scope: YOUTUBE_SCOPE,
			callback: (response) => {
				if (response.error || !response.access_token) {
					reject(
						new Error(
							response.error_description || response.error || 'Google sign-in was cancelled.'
						)
					);
					return;
				}
				const expiresInMs = (response.expires_in ?? 3600) * 1000;
				resolve({
					accessToken: response.access_token,
					expiresAt: Date.now() + expiresInMs - 15_000
				});
			},
			error_callback: (error) => {
				reject(new Error(error.message || error.type || 'Google sign-in failed.'));
			}
		});
		client.requestAccessToken({ prompt: 'consent' });
	});
}

export async function fetchGoogleEmail(accessToken: string): Promise<string> {
	const response = await fetch(USERINFO_URL, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!response.ok) {
		throw new Error('Could not read the Google account email.');
	}
	const payload = (await response.json()) as { email?: string };
	if (!payload.email) {
		throw new Error('Google did not return an email address.');
	}
	return payload.email;
}

export function assertEmailAllowed(email: string): boolean {
	return isEmailAllowed(email, allowedEmails());
}

export function revokeGoogleToken(accessToken: string): void {
	window.google?.accounts?.oauth2?.revoke(accessToken);
}
