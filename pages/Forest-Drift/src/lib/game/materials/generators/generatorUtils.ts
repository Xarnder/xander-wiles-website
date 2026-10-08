import { createMulberry32 } from '../../terrain/seededRandom';
import { subSeed } from '../noise/tileableNoise';
import type { ResolvedMaterialRecipe, RgbColor } from '../ProceduralMaterialTypes';

/**
 * How many lattice cells of a noise layer fit across a tile so its features are roughly
 * `featureSize` metres. Always an integer ≥ 1 — that's what keeps the layer seamless.
 */
export function periodFor(tileSize: number, featureSize: number): number {
	return Math.max(1, Math.round(tileSize / featureSize));
}

/** A named colour from the resolved palette, with a neutral grey fallback so a palette missing a name degrades visibly rather than crashing generation. */
export function paletteColor(recipe: ResolvedMaterialRecipe, name: string): RgbColor {
	return recipe.colors[name] ?? [0.5, 0.5, 0.5];
}

/**
 * Seeded PRNG for per-recipe layout decisions (course heights, block lengths, knot positions).
 * Per-texel randomness uses `hash2`/`hash01` instead, so it never depends on iteration order.
 */
export function layoutRandom(seed: number, purpose: number): () => number {
	return createMulberry32((seed ^ Math.imul(purpose + 1, 0x9e3779b1)) >>> 0);
}

/**
 * Splits `total` into `count` random-length segments (each within ±`spread` of the mean) that sum to
 * exactly `total` — used for stone course heights and block lengths, which must tile exactly.
 * Returns the `count + 1` cumulative boundaries, starting at 0 and ending at `total`.
 */
export function randomPartition(
	total: number,
	count: number,
	spread: number,
	random: () => number
): number[] {
	const sizes: number[] = [];
	let sum = 0;
	for (let i = 0; i < count; i++) {
		const size = 1 + (random() * 2 - 1) * spread;
		sizes.push(size);
		sum += size;
	}
	const boundaries = [0];
	let acc = 0;
	for (const size of sizes) {
		acc += (size / sum) * total;
		boundaries.push(acc);
	}
	boundaries[count] = total;
	return boundaries;
}

/** Index of the segment containing `value` in sorted `boundaries` (from `randomPartition`). */
export function segmentIndex(boundaries: readonly number[], value: number): number {
	let lo = 0;
	let hi = boundaries.length - 2;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (boundaries[mid] <= value) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** Derives one independent seed per named noise layer, hoisted out of texel loops. */
export function layerSeeds<K extends string>(
	seed: number,
	layers: Readonly<Record<K, number>>
): Record<K, number> {
	const seeds = {} as Record<K, number>;
	for (const name of Object.keys(layers) as K[]) seeds[name] = subSeed(seed, layers[name]);
	return seeds;
}
