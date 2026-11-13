import { describe, expect, it } from 'vitest';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { BIOME_LATTICE_SPACING, BiomeField } from '../BiomeField';
import {
	createBiomeWeightVector,
	createClimateSample,
	createDefaultBiomeSettings
} from '../BiomeTypes';

function field(seed = 'field-test', capacity?: number) {
	const terrainSettings = createDefaultTerrainSettings();
	terrainSettings.seed = seed;
	const terrain = new TerrainHeightSampler(terrainSettings);
	const settings = createDefaultBiomeSettings();
	const f = new BiomeField(terrain, settings, capacity);
	f.setSeed(seed);
	return { field: f, settings, terrain };
}

function maxDifference(a: Float32Array, b: Float32Array): number {
	let max = 0;
	for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
	return max;
}

describe('BiomeField', () => {
	it('matches direct classification exactly at lattice points', () => {
		const { field: f } = field();
		const lookup = createBiomeWeightVector();
		const direct = createBiomeWeightVector();
		for (let i = -20; i <= 20; i += 3) {
			for (let j = -20; j <= 20; j += 5) {
				const x = i * BIOME_LATTICE_SPACING * 3;
				const z = j * BIOME_LATTICE_SPACING * 2;
				f.weightsAt(x, z, lookup);
				f.classifyPoint(x, z, direct);
				expect(maxDifference(lookup, direct)).toBeLessThan(1e-6);
			}
		}
	});

	it('is continuous across tile edges and the world-zero boundary', () => {
		const { field: f } = field();
		const a = createBiomeWeightVector();
		const b = createBiomeWeightVector();
		for (const edge of [-128, -64, 0, 64, 640, 64 * 37]) {
			for (const along of [-300, -7.3, 0, 12.5, 999]) {
				f.weightsAt(edge - 1e-4, along, a);
				f.weightsAt(edge + 1e-4, along, b);
				expect(maxDifference(a, b), `x edge ${edge}`).toBeLessThan(1e-3);
				f.weightsAt(along, edge - 1e-4, a);
				f.weightsAt(along, edge + 1e-4, b);
				expect(maxDifference(a, b), `z edge ${edge}`).toBeLessThan(1e-3);
			}
		}
	});

	it('returns weights summing to 1 between lattice points', () => {
		const { field: f } = field();
		const w = createBiomeWeightVector();
		for (let i = 0; i < 300; i++) {
			f.weightsAt(i * 13.7 - 2000, i * -9.1 + 500, w);
			const sum = w.reduce((s, v) => s + v, 0);
			expect(sum).toBeCloseTo(1, 4);
		}
	});

	it('interpolates climate within the range of its corners', () => {
		const { field: f } = field();
		const c = createClimateSample();
		for (let i = 0; i < 100; i++) {
			f.climateAt(i * 31.3, i * 17.9, c);
			expect(c.temperature).toBeGreaterThanOrEqual(0);
			expect(c.temperature).toBeLessThanOrEqual(1);
			expect(c.moisture).toBeGreaterThanOrEqual(0);
			expect(c.moisture).toBeLessThanOrEqual(1);
		}
	});

	it('keeps at most `capacity` tiles (LRU)', () => {
		const { field: f } = field('lru', 16);
		const w = createBiomeWeightVector();
		for (let i = 0; i < 60; i++) f.weightsAt(i * 64 + 1, 1, w);
		expect(f.getTileCount()).toBe(16);
	});

	it('clears tiles and bumps the generation on invalidate, then reproduces the same result', () => {
		const { field: f } = field('invalidate');
		const before = createBiomeWeightVector();
		const after = createBiomeWeightVector();
		f.weightsAt(321, -654, before);
		const generation = f.getGeneration();
		f.invalidate();
		expect(f.getGeneration()).toBe(generation + 1);
		expect(f.getTileCount()).toBe(0);
		f.weightsAt(321, -654, after);
		expect(maxDifference(before, after)).toBe(0);
	});

	it('picks up changed settings after invalidate', () => {
		const { field: f, settings } = field('settings-change');
		const c = createClimateSample();
		settings.spawnTemperate = false;
		f.invalidate();
		f.climateAt(4000, 4000, c);
		const before = c.temperature;
		settings.temperatureBias = 0.3;
		f.invalidate();
		f.climateAt(4000, 4000, c);
		expect(c.temperature).toBeCloseTo(Math.min(1, before + 0.3), 3);
	});

	it('reads only pre-water, pre-edit terrain', () => {
		const { field: f, terrain } = field('pre-edit');
		const a = createBiomeWeightVector();
		const b = createBiomeWeightVector();
		f.classifyPoint(100, 100, a);
		// A shovel edit or river carve changes the final height, never the biome.
		terrain.setHeightModifier((_x, _z, h) => h + 50);
		f.classifyPoint(100, 100, b);
		expect(maxDifference(a, b)).toBe(0);
	});
});
