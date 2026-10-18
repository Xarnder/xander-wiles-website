import {
	PLAYER_ROLES,
	isTokenShaped,
	sanitizeColour,
	sanitizeDisplayName,
	type PlayerRole
} from './protocol';

/**
 * The deployed multiplayer server, e.g. `https://forest-drift-mp.<your-subdomain>.workers.dev`.
 * Empty until the server is deployed (docs/2026/10-16/Multiplayer/cloudflare-setup-guide.md, step 10);
 * while empty, the production build hides every online feature. `VITE_FOREST_DRIFT_MP_URL` overrides it.
 */
export const DEPLOYED_SERVER_URL = '';

const STORAGE_KEYS = {
	playerId: 'forest-drift-mp-player-id',
	name: 'forest-drift-mp-name',
	colour: 'forest-drift-mp-colour',
	adminKey: 'forest-drift-mp-admin-key',
	server: 'forest-drift-mp-server',
	worlds: 'forest-drift-mp-worlds'
} as const;

/** Bright, distinct avatar colours that read well against forest greens and sky blues. */
export const AVATAR_COLOURS = [
	'#e4572e',
	'#f3a712',
	'#e83f6f',
	'#7b2cbf',
	'#2e86ab',
	'#ffd166',
	'#ff7f51',
	'#c1121f',
	'#3a86ff',
	'#f15bb5'
] as const;

export interface PlayerIdentity {
	playerId: string;
	name: string;
	colour: string;
}

/**
 * The multiplayer server's base URL (http/https), or null when multiplayer isn't available.
 *
 * In order: a `?mpServer=` override (remembered, for testing a deployed server), the
 * `VITE_FOREST_DRIFT_MP_URL` build variable, `DEPLOYED_SERVER_URL`, then — in development only — the
 * same host on port 8787,
 * which is where `npm run dev` in `server/` listens. Using the page's own hostname (not "localhost")
 * means an iPad opening the dev build over the LAN reaches the Mac's room server too.
 */
export function multiplayerServerUrl(): string | null {
	if (typeof window === 'undefined') return null;
	const params = new URLSearchParams(window.location.search);
	const override = params.get('mpServer');
	if (override && /^https?:\/\//.test(override)) {
		safeSet(STORAGE_KEYS.server, override);
		return stripSlash(override);
	}
	const remembered = safeGet(STORAGE_KEYS.server);
	if (remembered && /^https?:\/\//.test(remembered)) return stripSlash(remembered);
	const configured = import.meta.env.VITE_FOREST_DRIFT_MP_URL as string | undefined;
	if (configured) return stripSlash(configured);
	if (DEPLOYED_SERVER_URL) return stripSlash(DEPLOYED_SERVER_URL);
	if (import.meta.env.DEV) return `http://${window.location.hostname}:8787`;
	return null;
}

export function webSocketUrl(serverUrl: string, worldId: string): string {
	return `${serverUrl.replace(/^http/, 'ws')}/w/${encodeURIComponent(worldId)}/ws`;
}

export interface WorldReference {
	worldId: string;
	/** The invite token from the link's `#invite=` fragment; null for a bare world code. */
	invite: string | null;
}

/** The world (and invite) from a pasted invite link, or a bare world id. */
export function parseWorldReference(input: string): WorldReference | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		const worldId = url.searchParams.get('mp');
		if (!worldId || !isWorldId(worldId)) return null;
		return { worldId, invite: inviteFromHash(url.hash) };
	} catch {
		// Not a URL; maybe a bare id.
	}
	return isWorldId(trimmed) ? { worldId: trimmed, invite: null } : null;
}

/** The world and invite in this page's own address (`?mp=…#invite=…`), if any. */
export function worldReferenceFromLocation(): WorldReference | null {
	if (typeof window === 'undefined') return null;
	const worldId = new URLSearchParams(window.location.search).get('mp');
	if (!worldId || !isWorldId(worldId)) return null;
	return { worldId, invite: inviteFromHash(window.location.hash) };
}

/**
 * The invite link for a world, pointing at this same page. The token rides in the fragment, which
 * browsers never send to a server, so it can't end up in anyone's access logs (plan §8.6).
 */
export function inviteLink(worldId: string, invite: string): string {
	const url = new URL(window.location.href);
	url.search = '';
	url.hash = '';
	url.searchParams.set('mp', worldId);
	return `${url.toString()}#invite=${encodeURIComponent(invite)}`;
}

function inviteFromHash(hash: string): string | null {
	const value = new URLSearchParams(hash.replace(/^#/, '')).get('invite');
	return value && isTokenShaped(value) ? value : null;
}

/** An online world this browser has joined or published, with what it needs to get back in. */
export interface OnlineWorldEntry {
	worldId: string;
	name: string;
	/** The token this browser joins with (the owner's, for the publisher). */
	invite: string;
	/** Role the room last gave us. */
	role: PlayerRole | null;
	/** All three links' tokens — only the publisher has these. */
	invites?: { owner: string; editor: string; viewer: string };
	/** Signed proof of our role from the last `welcome`, for quick resumes. */
	capability?: string | null;
	lastJoinedAt?: string;
}

export function loadOnlineWorlds(): OnlineWorldEntry[] {
	try {
		const parsed = JSON.parse(safeGet(STORAGE_KEYS.worlds) ?? '[]') as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isOnlineWorldEntry);
	} catch {
		return [];
	}
}

export function findOnlineWorld(worldId: string): OnlineWorldEntry | null {
	return loadOnlineWorlds().find((entry) => entry.worldId === worldId) ?? null;
}

/** Adds or updates a remembered online world (most recent first). */
export function rememberOnlineWorld(
	update: Partial<OnlineWorldEntry> & { worldId: string }
): OnlineWorldEntry | null {
	const worlds = loadOnlineWorlds();
	const existing = worlds.find((entry) => entry.worldId === update.worldId);
	const merged = { ...existing, ...update } as OnlineWorldEntry;
	merged.name ??= 'Online world';
	merged.role ??= null;
	if (!isOnlineWorldEntry(merged)) return null;
	const rest = worlds.filter((entry) => entry.worldId !== update.worldId);
	safeSet(STORAGE_KEYS.worlds, JSON.stringify([merged, ...rest].slice(0, 30)));
	return merged;
}

export function forgetOnlineWorld(worldId: string): void {
	const rest = loadOnlineWorlds().filter((entry) => entry.worldId !== worldId);
	safeSet(STORAGE_KEYS.worlds, JSON.stringify(rest));
}

function isOnlineWorldEntry(value: unknown): value is OnlineWorldEntry {
	if (!value || typeof value !== 'object') return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.worldId === 'string' &&
		isWorldId(entry.worldId) &&
		typeof entry.name === 'string' &&
		isTokenShaped(entry.invite) &&
		(entry.role === null || PLAYER_ROLES.includes(entry.role as PlayerRole))
	);
}

/** The player's remembered identity; generates an id (and a colour) the first time. */
export function loadIdentity(): PlayerIdentity {
	let playerId = safeGet(STORAGE_KEYS.playerId);
	if (!playerId || !/^[A-Za-z0-9-]{8,64}$/.test(playerId)) {
		playerId = createId();
		safeSet(STORAGE_KEYS.playerId, playerId);
	}
	let colour = sanitizeColour(safeGet(STORAGE_KEYS.colour));
	if (!colour) {
		colour = AVATAR_COLOURS[Math.floor(Math.random() * AVATAR_COLOURS.length)]!;
		safeSet(STORAGE_KEYS.colour, colour);
	}
	const name = sanitizeDisplayName(safeGet(STORAGE_KEYS.name)) ?? '';
	return { playerId, name, colour };
}

export function saveIdentity(name: string, colour: string): void {
	safeSet(STORAGE_KEYS.name, name);
	safeSet(STORAGE_KEYS.colour, colour);
}

export function loadAdminKey(): string {
	return safeGet(STORAGE_KEYS.adminKey) ?? '';
}

export function saveAdminKey(key: string): void {
	safeSet(STORAGE_KEYS.adminKey, key);
}

/**
 * A random id that also works where `crypto.randomUUID` doesn't: it only exists in secure contexts,
 * and an iPad opening the dev build at `http://192.168.x.x` is not one (plan risk R15).
 */
export function createId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		try {
			return crypto.randomUUID();
		} catch {
			// Fall through.
		}
	}
	const bytes = new Uint8Array(16);
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes);
	} else {
		for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
	}
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isWorldId(value: string): boolean {
	return /^[A-Za-z0-9-]{8,64}$/.test(value);
}

function stripSlash(url: string): string {
	return url.replace(/\/+$/, '');
}

function safeGet(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeSet(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Private mode or storage blocked: identity just won't be remembered.
	}
}
