import { describe, expect, it } from 'vitest';
import { createDefaultBiomeSettings, createLegacyBiomeSettings } from '../../biomes/BiomeTypes';
import { getDefaultWorldDefinition } from '../DefaultWorld';
import { migrateWorld } from '../WorldMigrationManager';
import { CURRENT_WORLD_SCHEMA_VERSION, ONLINE_COMPATIBLE_SCHEMA_VERSIONS } from '../WorldTypes';
import { validateWorldDefinition } from '../WorldValidation';
import { richWorld } from './worldFixtures';

/** A schema-9 world exactly as saved before biomes existed. */
function schema9World(): Record<string, unknown> {
	const world = structuredClone(richWorld()) as unknown as Record<string, unknown>;
	world.schemaVersion = 9;
	delete (world.environment as Record<string, unknown>).biomes;
	return world;
}

describe('biome settings in the world schema (v10)', () => {
	it('is schema 10', () => {
		expect(CURRENT_WORLD_SCHEMA_VERSION).toBe(10);
	});

	it('migrates a schema-9 world with biomes OFF, so it looks exactly as before (Q6)', () => {
		const result = migrateWorld(schema9World());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.migrated).toBe(true);
		expect(result.fromVersion).toBe(9);
		const environment = result.value.environment as Record<string, unknown>;
		expect(environment.biomes).toEqual(createLegacyBiomeSettings());
		expect(validateWorldDefinition(result.value).ok).toBe(true);
	});

	it('migrates every older schema through to biomes off', () => {
		for (const version of [1, 5, 8]) {
			const old = { ...schema9World(), schemaVersion: version };
			const result = migrateWorld(old);
			expect(result.ok, `from ${version}`).toBe(true);
			if (!result.ok) continue;
			const biomes = (result.value.environment as Record<string, unknown>).biomes as {
				enabled: boolean;
			};
			expect(biomes.enabled, `from ${version}`).toBe(false);
		}
	});

	it('keeps the bundled Main World unchanged: biomes off (Q8)', () => {
		expect(getDefaultWorldDefinition().environment.biomes.enabled).toBe(false);
	});

	it('gives new worlds biomes on', () => {
		expect(richWorld().environment.biomes).toEqual(createDefaultBiomeSettings());
		expect(validateWorldDefinition(richWorld()).ok).toBe(true);
	});

	it('rejects a current world with no biome settings', () => {
		const world = richWorld() as unknown as { environment: Record<string, unknown> };
		delete world.environment.biomes;
		const result = validateWorldDefinition(world);
		expect(result.ok).toBe(false);
	});

	it('rejects biome settings whose `enabled` is not a boolean', () => {
		const world = richWorld();
		(world.environment.biomes as unknown as Record<string, unknown>).enabled = 'yes';
		expect(validateWorldDefinition(world).ok).toBe(false);
	});

	it('clamps extreme or invalid values and drops unknown keys (untrusted imports)', () => {
		const world = richWorld();
		Object.assign(world.environment.biomes, {
			size: 'enormous',
			temperatureBias: 99,
			moistureBias: Number.NaN,
			variantRarity: -4,
			borderSharpness: 1e9,
			generatorVersion: 'x',
			extra: { __proto__: { polluted: true } }
		});
		const result = validateWorldDefinition(world);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const biomes = result.value.environment.biomes;
		expect(biomes.size).toBe('normal');
		expect(biomes.temperatureBias).toBe(0.3);
		expect(biomes.moistureBias).toBe(0);
		expect(biomes.variantRarity).toBe(0);
		expect(biomes.borderSharpness).toBe(6);
		expect(biomes.generatorVersion).toBe(1);
		expect('extra' in biomes).toBe(false);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('lets online worlds published at schema 9 keep opening, and nothing older or newer', () => {
		// 9 → 10 only adds biomes switched off: a v10 and a v9 player generate the same world.
		expect([...ONLINE_COMPATIBLE_SCHEMA_VERSIONS].sort((a, b) => a - b)).toEqual([9, 10]);
	});
});
