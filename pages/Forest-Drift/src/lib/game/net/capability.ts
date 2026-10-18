import { PLAYER_ROLES, type PlayerRole } from './protocol';

/**
 * Invite tokens and capabilities (plan §8.6, locked decisions Q3-A and Q7).
 *
 *   - **Invite tokens** are random secrets, one per role, handed out as links
 *     (`?mp=<world>#invite=<token>`). The fragment never reaches a server log, and the room stores only
 *     each token's SHA-256, so a leaked database can't be turned back into working links.
 *   - **Capabilities** are what the room gives back on joining: `{world, player, role, expiry}`
 *     signed with HMAC-SHA-256 under a Worker secret. A dropped player resumes with it, which proves
 *     they are the same player (so nobody holding the shared editor link can take over someone else's
 *     slot by copying their player id).
 *
 * Web Crypto only, so the same code runs in the Worker, the browser and Vitest.
 */

/** How long a capability stays valid. Each join or resume issues a fresh one. */
export const CAPABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CapabilityClaims {
	/** World id. */
	w: string;
	/** Player id. */
	p: string;
	r: PlayerRole;
	/** Expiry, ms since the epoch. */
	e: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A random URL-safe token (24 bytes → 32 characters). */
export function randomToken(bytes = 24): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return toBase64Url(buffer);
}

export async function sha256Hex(text: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signCapability(secret: string, claims: CapabilityClaims): Promise<string> {
	const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
	const signature = await crypto.subtle.sign(
		'HMAC',
		await hmacKey(secret),
		encoder.encode(payload)
	);
	return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The capability's claims if its signature is good, it hasn't expired, and it was issued for this
 * world and player; otherwise null.
 */
export async function verifyCapability(
	secret: string,
	token: string,
	expected: { worldId: string; playerId: string; now: number }
): Promise<CapabilityClaims | null> {
	const dot = token.indexOf('.');
	if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
	const payload = token.slice(0, dot);
	const signature = fromBase64Url(token.slice(dot + 1));
	if (!signature) return null;
	let valid: boolean;
	try {
		// `verify` compares in constant time.
		valid = await crypto.subtle.verify(
			'HMAC',
			await hmacKey(secret),
			signature,
			encoder.encode(payload)
		);
	} catch {
		return null;
	}
	if (!valid) return null;
	const bytes = fromBase64Url(payload);
	if (!bytes) return null;
	let claims: unknown;
	try {
		claims = JSON.parse(decoder.decode(bytes));
	} catch {
		return null;
	}
	if (!isClaims(claims)) return null;
	if (claims.w !== expected.worldId || claims.p !== expected.playerId) return null;
	if (claims.e <= expected.now) return null;
	return claims;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

/**
 * The signing key, derived from the secret with a fixed label. Deriving (rather than using the
 * secret directly) means one Worker secret can safely serve both the admin key check and this.
 */
function hmacKey(secret: string): Promise<CryptoKey> {
	let key = keyCache.get(secret);
	if (!key) {
		key = crypto.subtle
			.digest('SHA-256', encoder.encode(`forest-drift-capability:v1:${secret}`))
			.then((material) =>
				crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, [
					'sign',
					'verify'
				])
			);
		keyCache.set(secret, key);
	}
	return key;
}

function isClaims(value: unknown): value is CapabilityClaims {
	if (!value || typeof value !== 'object') return false;
	const claims = value as Record<string, unknown>;
	return (
		typeof claims.w === 'string' &&
		typeof claims.p === 'string' &&
		PLAYER_ROLES.includes(claims.r as PlayerRole) &&
		typeof claims.e === 'number' &&
		Number.isFinite(claims.e)
	);
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	try {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}
