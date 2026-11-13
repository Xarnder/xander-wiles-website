import { describe, expect, it } from 'vitest';
import { GENERATOR_VERSION } from '../../src/lib/game/net/protocol';
import { baseHasBiomes, migrateGenerator } from '../src/generatorMigration';

const manifestAt = (generatorVersion: number) => ({
	worldId: 'existing-world',
	name: 'Shared world',
	schemaVersion: 9,
	generatorVersion,
	publishedAt: '2026-10-18'
});

describe('generator compatibility', () => {
	it('is generator 4 (biomes)', () => {
		expect(GENERATOR_VERSION).toBe(4);
	});

	it.each([1, 2, 3])(
		'upgrades world published at %s (no biomes) without changing metadata or the input',
		(version) => {
			const manifest = manifestAt(version);
			expect(migrateGenerator(manifest, () => false)).toEqual({
				...manifest,
				generatorVersion: 4
			});
			expect(manifest.generatorVersion).toBe(version);
		}
	);

	it('never relabels an old world whose stored data has biomes switched on', () => {
		const manifest = manifestAt(3);
		expect(migrateGenerator(manifest, () => true)).toBe(manifest);
	});

	it.each([0, 4, 5])('does not relabel unrelated generator version %s', (generatorVersion) => {
		const manifest = { generatorVersion };
		expect(migrateGenerator(manifest, () => false)).toBe(manifest);
	});

	it('reads whether a stored base world has biomes on', () => {
		expect(baseHasBiomes(null)).toBe(false);
		expect(baseHasBiomes('not json')).toBe(false);
		expect(baseHasBiomes(JSON.stringify({ environment: {} }))).toBe(false);
		expect(baseHasBiomes(JSON.stringify({ environment: { biomes: { enabled: false } } }))).toBe(
			false
		);
		expect(baseHasBiomes(JSON.stringify({ environment: { biomes: { enabled: true } } }))).toBe(
			true
		);
	});
});
