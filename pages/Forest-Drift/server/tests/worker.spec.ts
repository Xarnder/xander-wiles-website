import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/WorldRoom', () => ({ WorldRoom: class {} }));
import worker from '../src/worker';
import type { Env } from '../src/env';

const env = { ADMIN_SECRET: 'test-admin', ALLOWED_ORIGINS: 'https://xanderwiles.com' } as Env;

describe('multiplayer HTTP routes', () => {
	it.each([
		null,
		[],
		{},
		{ world: { name: 'Bad', seed: '42', schemaVersion: 1, environment: null }, generatorVersion: 1 }
	])('rejects malformed publish bodies without a server exception: %j', async (body) => {
		const response = await worker.fetch(
			new Request('https://room.test/w', {
				method: 'POST',
				headers: { Authorization: 'Bearer test-admin' },
				body: JSON.stringify(body)
			}),
			env
		);
		expect(response.status).toBe(400);
	});

	it('requires the admin key before reading a published world', async () => {
		const response = await worker.fetch(
			new Request('https://room.test/w', {
				method: 'POST',
				body: '{}'
			}),
			env
		);
		expect(response.status).toBe(401);
	});

	it('requires the owner password to mint all role-specific invite tokens', async () => {
		const publish = vi.fn().mockResolvedValue(undefined);
		const config = {
			...env,
			WORLD_ROOM: { idFromName: (id: string) => id, get: () => ({ publish }) }
		} as unknown as Env;
		const request = (password: string) =>
			new Request('https://room.test/w', {
				method: 'POST',
				headers: { Authorization: `Bearer ${password}` },
				body: JSON.stringify({
					world: { name: 'Shared world', seed: 'test', schemaVersion: 1, environment: {} },
					generatorVersion: 3
				})
			});
		const denied = await worker.fetch(request('wrong-password'), config);
		expect(denied.status).toBe(401);
		expect(publish).not.toHaveBeenCalled();
		const accepted = await worker.fetch(request('test-admin'), config);
		expect(accepted.status).toBe(201);
		const payload = (await accepted.json()) as { invites: Record<string, string> };
		expect(Object.keys(payload.invites).sort()).toEqual(['editor', 'owner', 'viewer']);
		expect(new Set(Object.values(payload.invites)).size).toBe(3);
		const hashes = publish.mock.calls[0][2];
		expect(hashes.owner).not.toBe(payload.invites.owner);
		for (const role of ['editor', 'viewer']) {
			const guest = await worker.fetch(request(payload.invites[role]), config);
			expect(guest.status).toBe(401);
		}
		expect(publish).toHaveBeenCalledTimes(1);
	});

	it('allows the game origin and refuses an unrelated website', async () => {
		const allowed = await worker.fetch(
			new Request('https://room.test/health', {
				headers: { Origin: 'https://xanderwiles.com' }
			}),
			env
		);
		expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://xanderwiles.com');
		const denied = await worker.fetch(
			new Request('https://room.test/health', {
				headers: { Origin: 'https://unrelated.example' }
			}),
			env
		);
		expect(denied.status).toBe(403);
	});
});

describe('usage endpoint authentication', () => {
	it('checks the world owner before accessing analytics or returning cached totals', async () => {
		const roomFetch = vi.fn().mockResolvedValue(new Response('Owner only', { status: 403 }));
		const config = {
			...env,
			WORLD_ROOM: { idFromName: (id: string) => id, get: () => ({ fetch: roomFetch }) }
		} as unknown as Env;
		const response = await worker.fetch(
			new Request('https://room.test/w/b2c19e1b-3992-47df-bdc6-af40307a8988/usage'),
			config
		);
		expect(response.status).toBe(403);
		expect(await response.text()).toBe('Owner only');
	});
	it('returns explicit unavailable state to an authenticated owner when not configured', async () => {
		const roomFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const config = {
			...env,
			WORLD_ROOM: { idFromName: (id: string) => id, get: () => ({ fetch: roomFetch }) }
		} as unknown as Env;
		const response = await worker.fetch(
			new Request('https://room.test/w/b2c19e1b-3992-47df-bdc6-af40307a8988/usage'),
			config
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: 'unavailable', metrics: [] });
		expect(response.headers.get('Cache-Control')).toBe('no-store');
	});
});
