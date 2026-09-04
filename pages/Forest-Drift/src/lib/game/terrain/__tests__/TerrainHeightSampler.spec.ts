import { describe, expect, it } from 'vitest';
import { createHeightSample, TerrainHeightSampler } from '../TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../TerrainSettings';

function makeSampler(seed: string): TerrainHeightSampler {
	const settings = createDefaultTerrainSettings();
	settings.seed = seed;
	return new TerrainHeightSampler(settings);
}

describe('TerrainHeightSampler determinism', () => {
	it('returns the same height for the same seed and coordinates every time', () => {
		const sampler = makeSampler('peaceful-world');
		const a = sampler.sample(123.4, -56.7);
		const b = sampler.sample(123.4, -56.7);
		const c = sampler.sample(123.4, -56.7);
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it('reproduces the exact same world after "reloading" (constructing a fresh sampler with the same seed)', () => {
		const first = makeSampler('peaceful-world');
		const points: [number, number][] = [
			[0, 0],
			[500, 500],
			[-320, 140],
			[10000, -10000]
		];
		const heightsFirstRun = points.map(([x, z]) => first.sample(x, z));

		const second = makeSampler('peaceful-world');
		const heightsSecondRun = points.map(([x, z]) => second.sample(x, z));

		expect(heightsSecondRun).toEqual(heightsFirstRun);
	});

	it('produces different terrain for a different seed', () => {
		const a = makeSampler('peaceful-world');
		const b = makeSampler('a-completely-different-world');

		const points: [number, number][] = [
			[0, 0],
			[50, 50],
			[-200, 300],
			[1000, 1000]
		];
		const heightsA = points.map(([x, z]) => a.sample(x, z));
		const heightsB = points.map(([x, z]) => b.sample(x, z));

		expect(heightsA).not.toEqual(heightsB);
	});

	it('reseeding an existing sampler changes its output and reverting the seed restores it', () => {
		const settings = createDefaultTerrainSettings();
		settings.seed = 'seed-one';
		const sampler = new TerrainHeightSampler(settings);
		const original = sampler.sample(42, 17);

		sampler.setSeed('seed-two');
		const changed = sampler.sample(42, 17);
		expect(changed).not.toBe(original);

		sampler.setSeed('seed-one');
		const restored = sampler.sample(42, 17);
		expect(restored).toBe(original);
	});
});

describe('TerrainHeightSampler normals', () => {
	it('produces a matching normal for the same world coordinate regardless of which sampler instance asks', () => {
		const a = makeSampler('peaceful-world');
		const b = makeSampler('peaceful-world');

		const sampleA = createHeightSample();
		const sampleB = createHeightSample();
		a.sampleWithNormal(75, -30, sampleA);
		b.sampleWithNormal(75, -30, sampleB);

		expect(sampleA).toEqual(sampleB);
	});

	it('returns a unit-length normal', () => {
		const sampler = makeSampler('peaceful-world');
		const sample = createHeightSample();
		sampler.sampleWithNormal(12, 34, sample);
		const length = Math.sqrt(sample.normalX ** 2 + sample.normalY ** 2 + sample.normalZ ** 2);
		expect(length).toBeCloseTo(1, 5);
	});
});

describe('TerrainHeightSampler at and across negative coordinates', () => {
	it('produces finite heights around the world-zero crossing', () => {
		const sampler = makeSampler('peaceful-world');
		for (const x of [-200, -50, -1, 0, 1, 50, 200]) {
			for (const z of [-200, -50, -1, 0, 1, 50, 200]) {
				const height = sampler.sample(x, z);
				expect(Number.isFinite(height)).toBe(true);
			}
		}
	});

	it('is continuous across x = 0 and z = 0 (no special-cased jump at the origin)', () => {
		const sampler = makeSampler('peaceful-world');
		const epsilon = 0.01;
		const nearZeroFromNegativeX = sampler.sample(-epsilon, 5);
		const nearZeroFromPositiveX = sampler.sample(epsilon, 5);
		expect(Math.abs(nearZeroFromNegativeX - nearZeroFromPositiveX)).toBeLessThan(0.5);
	});
});
