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
