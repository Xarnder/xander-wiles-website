import {
	assertEmailAllowed,
	authConfigReady,
	fetchGoogleEmail,
	googleClientId,
	requestGoogleAccessToken,
	revokeGoogleToken
} from '$lib/auth/google-gis';

const SESSION_KEY = 'playlist-deck-session';

export type AuthStatus = 'boot' | 'setup' | 'signed-out' | 'denied' | 'signed-in';

type SessionPayload = {
	accessToken: string;
	expiresAt: number;
	email: string;
};

function readSession(): SessionPayload | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(SESSION_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as SessionPayload;
		if (!parsed.accessToken || !parsed.email || parsed.expiresAt <= Date.now()) return null;
		if (!assertEmailAllowed(parsed.email)) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeSession(session: SessionPayload | null): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		if (!session) sessionStorage.removeItem(SESSION_KEY);
		else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
	} catch {
		// ignore
	}
}

class AuthStore {
	status = $state<AuthStatus>('boot');
	email = $state<string | null>(null);
	accessToken = $state<string | null>(null);
	expiresAt = $state(0);
	error = $state<string | null>(null);
	busy = $state(false);

	get readyToken(): string | null {
		if (this.status !== 'signed-in') return null;
		if (!this.accessToken || this.expiresAt <= Date.now()) return null;
		return this.accessToken;
	}

	hydrate(): void {
		if (!authConfigReady()) {
			this.status = 'setup';
			this.error = googleClientId()
				? 'Add PUBLIC_ALLOWED_GOOGLE_EMAILS before signing in.'
				: 'Add PUBLIC_GOOGLE_CLIENT_ID to .env.local.';
			return;
		}
		const session = readSession();
		if (session) {
			this.accessToken = session.accessToken;
			this.expiresAt = session.expiresAt;
			this.email = session.email;
			this.status = 'signed-in';
			this.error = null;
			return;
		}
		this.status = 'signed-out';
	}

	async signIn(): Promise<void> {
		this.busy = true;
		this.error = null;
		try {
			const { accessToken, expiresAt } = await requestGoogleAccessToken();
			const email = await fetchGoogleEmail(accessToken);
			if (!assertEmailAllowed(email)) {
				revokeGoogleToken(accessToken);
				writeSession(null);
				this.accessToken = null;
				this.email = email;
				this.status = 'denied';
				this.error = `${email} is not on the allowlist.`;
				return;
			}
			this.accessToken = accessToken;
			this.expiresAt = expiresAt;
			this.email = email;
			this.status = 'signed-in';
			writeSession({ accessToken, expiresAt, email });
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Sign-in failed.';
			if (this.status !== 'denied') this.status = 'signed-out';
		} finally {
			this.busy = false;
		}
	}

	signOut(): void {
		if (this.accessToken) revokeGoogleToken(this.accessToken);
		writeSession(null);
		this.accessToken = null;
		this.email = null;
		this.expiresAt = 0;
		this.error = null;
		this.status = authConfigReady() ? 'signed-out' : 'setup';
	}
}

export const auth = new AuthStore();
