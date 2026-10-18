import { describe, expect, it } from 'vitest';
import { randomToken, sha256Hex, signCapability, verifyCapability } from '../capability';
import { isTokenShaped } from '../protocol';

const SECRET = 'test-secret-not-a-real-one';
const NOW = 1_800_000_000_000;

describe('invite tokens', () => {
	it('are random, URL-safe and accepted by the protocol', () => {
		const a = randomToken();
		const b = randomToken();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(isTokenShaped(a)).toBe(true);
	});

	it('hash to stable hex, so only hashes need storing', async () => {
		expect(await sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
});

describe('capabilities', () => {
	it('verify for the world and player they were issued to', async () => {
		const token = await signCapability(SECRET, {
			w: 'world-1',
			p: 'player-1',
			r: 'editor',
			e: NOW + 1000
		});
		expect(isTokenShaped(token)).toBe(true);
		const claims = await verifyCapability(SECRET, token, {
			worldId: 'world-1',
			playerId: 'player-1',
			now: NOW
		});
		expect(claims).toEqual({ w: 'world-1', p: 'player-1', r: 'editor', e: NOW + 1000 });
	});

	it('are refused for another player, another world, after expiry, or under another key', async () => {
		const token = await signCapability(SECRET, {
			w: 'world-1',
			p: 'player-1',
			r: 'owner',
			e: NOW + 1000
		});
		const expected = { worldId: 'world-1', playerId: 'player-1', now: NOW };
		expect(await verifyCapability(SECRET, token, { ...expected, playerId: 'player-2' })).toBeNull();
		expect(await verifyCapability(SECRET, token, { ...expected, worldId: 'world-2' })).toBeNull();
		expect(await verifyCapability(SECRET, token, { ...expected, now: NOW + 1000 })).toBeNull();
		expect(await verifyCapability('another-secret', token, expected)).toBeNull();
	});

	it('cannot be edited to claim a better role', async () => {
		const token = await signCapability(SECRET, {
			w: 'world-1',
			p: 'player-1',
			r: 'viewer',
			e: NOW + 1000
		});
		const [, signature] = token.split('.');
		const forgedPayload = btoa(
			JSON.stringify({ w: 'world-1', p: 'player-1', r: 'owner', e: NOW + 1000 })
		)
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		const forged = `${forgedPayload}.${signature}`;
		expect(
			await verifyCapability(SECRET, forged, { worldId: 'world-1', playerId: 'player-1', now: NOW })
		).toBeNull();
		expect(
			await verifyCapability(SECRET, 'not-a-capability', {
				worldId: 'world-1',
				playerId: 'player-1',
				now: NOW
			})
		).toBeNull();
	});
});
