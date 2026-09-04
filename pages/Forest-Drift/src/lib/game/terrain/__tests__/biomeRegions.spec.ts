import { describe, expect, it } from 'vitest';
import {
	createBiomeWeights,
	TerrainHeightSampler,
	type BiomeWeights
} from '../TerrainHeightSampler';
import { createDefaultTerrainSettings, type TerrainSettings } from '../TerrainSettings';

function makeSampler(
	overrides: (settings: TerrainSettings) => void = () => {}
): TerrainHeightSampler {
	const settings = createDefaultTerrainSettings();
	settings.seed = 'region-test-world';
	overrides(settings);
	return new TerrainHeightSampler(settings);
}

/** Scans a grid deterministically for the world coordinate where one biome weight is largest. */
function findDominantBiomeCoordinate(
	sampler: TerrainHeightSampler,
	biome: keyof BiomeWeights,
	halfExtent: number,
	step: number
): { x: number; z: number; weight: number } {
	const weights = createBiomeWeights();
	let best = { x: 0, z: 0, weight: -1 };
	for (let x = -halfExtent; x <= halfExtent; x += step) {
		for (let z = -halfExtent; z <= halfExtent; z += step) {
			sampler.sampleBiomeWeights(x, z, weights);
			if (weights[biome] > best.weight) best = { x, z, weight: weights[biome] };
		}
	}
	return best;
}

/** Max - min height over a small neighbourhood grid — a simple, robust "local bumpiness" proxy. */
function localHeightRange(
	sampler: TerrainHeightSampler,
	centerX: number,
	centerZ: number,
	radius: number,
	step: number
): number {
	let min = Infinity;
	let max = -Infinity;
	for (let dx = -radius; dx <= radius; dx += step) {
		for (let dz = -radius; dz <= radius; dz += step) {
			const h = sampler.sample(centerX + dx, centerZ + dz);
			if (h < min) min = h;
			if (h > max) max = h;
		}
	}
	return max - min;
}

describe('biome determinism', () => {
	it('produces identical biome weights and height for the same seed, coordinates and settings', () => {
		const a = makeSampler();
		const b = makeSampler();

		const points: [number, number][] = [
			[0, 0],
			[812, -340],
			[-1500, 2200],
			[5000, -5000]
		];

		for (const [x, z] of points) {
			const weightsA = createBiomeWeights();
			const weightsB = createBiomeWeights();
			a.sampleBiomeWeights(x, z, weightsA);
			b.sampleBiomeWeights(x, z, weightsB);

			expect(weightsA).toEqual(weightsB);
			expect(a.sample(x, z)).toBe(b.sample(x, z));
		}
	});

	it('biome weights always sum to 1', () => {
		const sampler = makeSampler();
		for (const [x, z] of [
			[0, 0],
			[300, -450],
			[-900, 900],
			[4000, 1200]
		] as const) {
			const weights = createBiomeWeights();
			sampler.sampleBiomeWeights(x, z, weights);
			const sum = weights.plains + weights.hills + weights.highlands + weights.mountains;
			expect(sum).toBeCloseTo(1, 5);
		}
	});
});

describe('chunk-boundary independence', () => {
	it('two independent sampler instances agree exactly at a shared chunk-boundary world coordinate', () => {
		const settings = createDefaultTerrainSettings();
		settings.seed = 'boundary-world';
		const chunkBoundaryWorldX = 3 * settings.chunkSize; // edge shared by chunk 2 and chunk 3

		const samplerForChunk2 = new TerrainHeightSampler(settings);
		const samplerForChunk3 = new TerrainHeightSampler(settings);

		const weightsFromChunk2 = createBiomeWeights();
		const weightsFromChunk3 = createBiomeWeights();
		samplerForChunk2.sampleBiomeWeights(chunkBoundaryWorldX, 500, weightsFromChunk2);
		samplerForChunk3.sampleBiomeWeights(chunkBoundaryWorldX, 500, weightsFromChunk3);

		expect(weightsFromChunk2).toEqual(weightsFromChunk3);
		expect(samplerForChunk2.sample(chunkBoundaryWorldX, 500)).toBe(
			samplerForChunk3.sample(chunkBoundaryWorldX, 500)
		);
	});
});

describe('smooth biome transitions', () => {
	it('has no discontinuous jumps along a long line crossing several biome regions', () => {
		const sampler = makeSampler();
		const step = 2;
		let previousHeight = sampler.sample(-4000, 0);
		let maxJump = 0;

		for (let x = -4000 + step; x <= 4000; x += step) {
			const height = sampler.sample(x, 0);
			maxJump = Math.max(maxJump, Math.abs(height - previousHeight));
			previousHeight = height;
		}

		// Generous enough to allow a genuinely steep mountain face over 2 world units, but far
		// below what any hard if/else biome boundary or accidental discretization would produce.
		expect(maxJump).toBeLessThan(15);
	});

	it('biome weights themselves also change continuously, not in steps', () => {
		const sampler = makeSampler();
		const step = 2;
		const previous = createBiomeWeights();
		const current = createBiomeWeights();
		sampler.sampleBiomeWeights(-3000, 0, previous);

		let maxJump = 0;
		for (let x = -3000 + step; x <= 3000; x += step) {
			sampler.sampleBiomeWeights(x, 0, current);
			maxJump = Math.max(
				maxJump,
				Math.abs(current.plains - previous.plains),
				Math.abs(current.hills - previous.hills),
				Math.abs(current.highlands - previous.highlands),
				Math.abs(current.mountains - previous.mountains)
			);
			previous.plains = current.plains;
			previous.hills = current.hills;
			previous.highlands = current.highlands;
			previous.mountains = current.mountains;
		}

		expect(maxJump).toBeLessThan(0.15);
	});
});

describe('plains read as flat, mountains read as dramatic', () => {
	it('a forced-plains location has much lower local height variance than a forced-mountain location', () => {
		const plainsSampler = makeSampler();
		const plainsSpot = findDominantBiomeCoordinate(plainsSampler, 'plains', 2500, 50);
		expect(plainsSpot.weight).toBeGreaterThan(0.8);
		const plainsRange = localHeightRange(plainsSampler, plainsSpot.x, plainsSpot.z, 15, 3);

		// Force mountains fully active wherever the biome mask already favours them, so the search
		// below reliably lands somewhere the ridged mountain recipe is actually contributing (the
		// region mask is a *second*, independent gate on top of the biome weight — without loosening
		// it here the test would be at the mercy of both masks lining up by chance).
		const mountainSampler = makeSampler((settings) => {
			settings.mountains.regionThreshold = 0;
			settings.mountains.regionBlend = 0.01;
		});
		const mountainSpot = findDominantBiomeCoordinate(mountainSampler, 'mountains', 2500, 50);
		expect(mountainSpot.weight).toBeGreaterThan(0.8);
		const mountainRange = localHeightRange(mountainSampler, mountainSpot.x, mountainSpot.z, 15, 3);

		expect(plainsRange).toBeLessThan(5);
		expect(mountainRange).toBeGreaterThan(10);
		expect(mountainRange).toBeGreaterThan(plainsRange * 3);
	});
});
