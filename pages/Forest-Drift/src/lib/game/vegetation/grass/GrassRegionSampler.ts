import { clamp01, smoothstep } from '../../terrain/mathUtils';
import type { BiomeWeights } from '../../terrain/TerrainHeightSampler';

/**
 * How much grass an area wants, and what kind — from the systems that already describe the land:
 * terrain region weights (plains / hills / highlands / mountains), forest coverage and elevation.
 * Pure: the caller samples those (on a coarse grid, since all of them change over tens of metres)
 * and the per-tuft rules (slope, water, buildings, clumping) are applied in `grassPlacement.ts`.
 */
export interface GrassRegion {
	/** 0..1 — acceptance probability before clumping, slope and exclusions. */
	density: number;
	/** Multiplies tuft height (short alpine turf ↔ tall meadow). */
	heightBias: number;
	/** −1 (cool, dark forest-floor grass) … +1 (warm, dry upland grass). */
	warmth: number;
	/** 0 lush meadow tufts … 1 short, sparse, fine tufts (biases the variant choice). */
	shortness: number;
}

export function createGrassRegion(): GrassRegion {
	return { density: 0, heightBias: 1, warmth: 0, shortness: 0 };
}

/** Elevations (metres) over which grass thins out to bare upland (above the treeline it is sparse turf). */
export const GRASS_ELEVATION_FADE: readonly [number, number] = [48, 92];

export function sampleGrassRegion(
	biome: BiomeWeights,
	forestDensity: number,
	height: number,
	out: GrassRegion
): GrassRegion {
	const forest = clamp01(forestDensity);
	// Plains → dense meadow; rolling hills → slightly less; highlands → short and sparse; mountains → rare.
	let density =
		biome.plains * 1 + biome.hills * 0.85 + biome.highlands * 0.5 + biome.mountains * 0.16;
	// Forest floors keep some grass (shade-tolerant, darker), clearings and edges more.
	density *= 1 - forest * 0.55;
	const elevationFade = smoothstep(GRASS_ELEVATION_FADE[0], GRASS_ELEVATION_FADE[1], height);
	density *= 1 - elevationFade * 0.85;
	out.density = clamp01(density);
	out.heightBias =
		(biome.plains * 1.05 + biome.hills * 0.95 + biome.highlands * 0.72 + biome.mountains * 0.58) *
		(1 - forest * 0.12) *
		(1 - elevationFade * 0.3);
	out.warmth = Math.max(
		-1,
		Math.min(1, biome.hills * 0.2 + biome.highlands * 0.45 + elevationFade * 0.3 - forest * 0.55)
	);
	out.shortness = clamp01(
		biome.highlands * 0.55 + biome.mountains * 0.9 + forest * 0.35 + elevationFade * 0.4
	);
	return out;
}
