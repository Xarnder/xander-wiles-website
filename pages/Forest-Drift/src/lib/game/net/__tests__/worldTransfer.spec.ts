import { afterEach, describe, expect, it, vi } from 'vitest';
import { richWorld } from '../../world/__tests__/worldFixtures';
import { CURRENT_WORLD_SCHEMA_VERSION } from '../../world/WorldTypes';
import { GENERATOR_VERSION } from '../protocol';
import { fetchOnlineWorld } from '../worldTransfer';

/** The snapshot body the room serves: manifest + published base world + entity rows. */
function snapshot(schemaVersion: number, generatorVersion = GENERATOR_VERSION) {
	const base = structuredClone(richWorld()) as unknown as Record<string, unknown>;
	base.schemaVersion = schemaVersion;
	if (schemaVersion < 10) delete (base.environment as Record<string, unknown>).biomes;
	// Authored content travels as rows; this snapshot sends none, so nothing may reference it.
	delete (base.player as Record<string, unknown>).activeFoundationId;
	return {
		manifest: {
			worldId: 'w1',
			name: 'Forest House',
			schemaVersion,
			generatorVersion,
			publishedAt: '2026-11-01T00:00:00.000Z',
			byteLength: 1
		},
		base,
		rows: [],
		seq: 0,
		epoch: 1,
		checksum: ''
	};
}

function serve(body: unknown) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
	);
}

describe('fetchOnlineWorld schema compatibility', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('opens a world published before biomes (schema 9) with biomes off', async () => {
		serve(snapshot(9));
		const result = await fetchOnlineWorld('https://example.test', 'w1', 'invite');
		expect(result.ok ? 'ok' : result.error).toBe('ok');
		if (!result.ok) return;
		expect(result.value.world.schemaVersion).toBe(CURRENT_WORLD_SCHEMA_VERSION);
		expect(result.value.world.environment.biomes.enabled).toBe(false);
		// The hello still carries the published schema, which is what the room compares.
		expect(result.value.manifest.schemaVersion).toBe(9);
	});

	it('opens a world published at the current schema', async () => {
		serve(snapshot(CURRENT_WORLD_SCHEMA_VERSION));
		const result = await fetchOnlineWorld('https://example.test', 'w1', 'invite');
		expect(result.ok).toBe(true);
	});

	it.each([8, CURRENT_WORLD_SCHEMA_VERSION + 1])(
		'refuses a world published at schema %i',
		async (version) => {
			serve(snapshot(version));
			const result = await fetchOnlineWorld('https://example.test', 'w1', 'invite');
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('different version of the game');
		}
	);

	it('still refuses a different generator version', async () => {
		serve(snapshot(CURRENT_WORLD_SCHEMA_VERSION, GENERATOR_VERSION + 1));
		const result = await fetchOnlineWorld('https://example.test', 'w1', 'invite');
		expect(result.ok).toBe(false);
	});
});
