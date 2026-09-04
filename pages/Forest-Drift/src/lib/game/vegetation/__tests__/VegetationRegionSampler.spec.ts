import { describe, expect, it } from 'vitest';
import { VegetationRegionSampler } from '../VegetationRegionSampler';
import { createDefaultVegetationSettings } from '../VegetationTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';

function makeSampler(seed: string): VegetationRegionSampler {
	const settings = createDefaultVegetationSettings();
	const sampler = new VegetationRegionSampler(settings);
	sampler.setSeed(seed);
	return sampler;
}

describe('VegetationRegionSampler determinism', () => {
	it('returns identical forest density for the same seed, settings and position', () => {
		const a = makeSampler('forest-world');
		const b = makeSampler('forest-world');

		const points: [number, number][] = [
			[0, 0],
			[812, -340],
			[-1500, 2200],
			[5000, -5000]
		];

		for (const [x, z] of points) {
			expect(a.getForestDensity(x, z)).toBe(b.getForestDensity(x, z));
		}
	});

	it('reproduces the same forest after "reloading" (a fresh sampler instance, same seed)', () => {
		const points: [number, number][] = [
			[100, 200],
			[-900, 400],
			[3000, 3000]
		];
		const first = makeSampler('peaceful-world');
		const heightsFirst = points.map(([x, z]) => first.getForestDensity(x, z));

		const second = makeSampler('peaceful-world');
		const heightsSecond = points.map(([x, z]) => second.getForestDensity(x, z));

		expect(heightsSecond).toEqual(heightsFirst);
	});

	it('produces different forest distribution for a different seed', () => {
		const a = makeSampler('forest-world-one');
		const b = makeSampler('forest-world-two');

		const points: [number, number][] = [
			[0, 0],
			[400, 400],
			[-800, 1200],
			[2500, -1800]
		];
		const densitiesA = points.map(([x, z]) => a.getForestDensity(x, z));
		const densitiesB = points.map(([x, z]) => b.getForestDensity(x, z));

		expect(densitiesA).not.toEqual(densitiesB);
	});

	it('returns density in [0, 1]', () => {
		const sampler = makeSampler('forest-world');
		for (let x = -2000; x <= 2000; x += 137) {
			const density = sampler.getForestDensity(x, x * 0.37);
			expect(density).toBeGreaterThanOrEqual(0);
			expect(density).toBeLessThanOrEqual(1);
		}
	});
});

describe('independence from terrain biome', () => {
	it('changing terrain-biome settings does not change the raw forest-region mask', () => {
		const vegetationSettings = createDefaultVegetationSettings();
		const sampler = new VegetationRegionSampler(vegetationSettings);
		sampler.setSeed('shared-seed');

		const points: [number, number][] = [
			[0, 0],
			[600, -300],
			[-1200, 900]
		];
		const before = points.map(([x, z]) => sampler.getForestDensity(x, z));

		// Mutate terrain biome settings drastically — the vegetation sampler never reads this
		// object at all, so its output must be completely unaffected.
		const terrainSettings = createDefaultTerrainSettings();
		terrainSettings.seed = 'shared-seed';
		terrainSettings.biome.scale = 50;
		terrainSettings.biome.contrast = 3;
		terrainSettings.mountains.amplitude = 500;
		terrainSettings.mountains.regionThreshold = 0.01;
		new TerrainHeightSampler(terrainSettings); // constructing/using it must not leak any shared state

		const after = points.map(([x, z]) => sampler.getForestDensity(x, z));
		expect(after).toEqual(before);
	});

	it('uses a different noise channel than the terrain biome mask, even under the same world seed', () => {
		const seed = 'same-seed-both-systems';

		const terrainSettings = createDefaultTerrainSettings();
		terrainSettings.seed = seed;
		const terrainSampler = new TerrainHeightSampler(terrainSettings);

		const vegetationSampler = makeSampler(seed);

		// Sample a grid and confirm the two fields are not simply the same values relabeled —
		// a real (independent) noise channel will disagree at most points.
		let agreements = 0;
		let total = 0;
		for (let x = -1000; x <= 1000; x += 100) {
			for (let z = -1000; z <= 1000; z += 100) {
				total++;
				const biomeMask01 = (terrainSampler.sampleBiomeMaskValue(x, z) + 1) / 2;
				const forestMask01 = vegetationSampler.getForestDensity(x, z) > 0 ? 1 : 0;
				const biomeHigh = biomeMask01 > 0.6 ? 1 : 0;
				if (biomeHigh === forestMask01) agreements++;
			}
		}
		// If the two were correlated (e.g. accidentally sharing a noise channel) they'd agree
		// almost everywhere; independent fields should disagree a substantial fraction of the time.
		expect(agreements).toBeLessThan(total * 0.9);
	});
});

describe('seamlessness across chunk boundaries', () => {
	it('forest density sampled at a shared chunk-boundary coordinate is identical from two independent samplers', () => {
		const settings = createDefaultTerrainSettings();
		const chunkBoundaryWorldX = 3 * settings.chunkSize;

		const samplerForChunk2 = makeSampler('boundary-forest');
		const samplerForChunk3 = makeSampler('boundary-forest');

		expect(samplerForChunk2.getForestDensity(chunkBoundaryWorldX, 400)).toBe(
			samplerForChunk3.getForestDensity(chunkBoundaryWorldX, 400)
		);
	});

	it('has no discontinuous jump in density along a line crossing several forest regions', () => {
		const sampler = makeSampler('forest-world');
		const step = 2;
		let previous = sampler.getForestDensity(-3000, 0);
		let maxJump = 0;

		for (let x = -3000 + step; x <= 3000; x += step) {
			const density = sampler.getForestDensity(x, 0);
			maxJump = Math.max(maxJump, Math.abs(density - previous));
			previous = density;
		}

		expect(maxJump).toBeLessThan(0.2);
	});
});
