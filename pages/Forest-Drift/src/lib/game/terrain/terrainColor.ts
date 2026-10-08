/** Vertex colouring: normal elevation/slope tinting, plus debug visualizations. Pure functions, write into caller-owned output — no allocation. */

import { smoothstep } from './mathUtils';
import type { BiomeWeights } from './TerrainHeightSampler';

const LOW = [0.16, 0.22, 0.1];
const MID = [0.27, 0.38, 0.17];
const HIGH = [0.52, 0.52, 0.44];
const ROCK = [0.38, 0.36, 0.32];

/**
 * Ground-cover variation (lush/dry patches, occasional bare earth) layered over the elevation
 * colours. Part of the procedural-materials look — `ThreeScene` turns it off together with the
 * procedural toggle so the flat comparison stays the original look.
 */
export const terrainColorOptions = { groundVariation: true };

const WARM_GRASS = [0.27, 0.4, 0.1];
const DRY = [0.42, 0.42, 0.2];
const LUSH = [0.18, 0.32, 0.11];
const EARTH = [0.3, 0.23, 0.15];

function latticeHash(x: number, z: number, seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ x, 0x27d4eb2d);
	h = Math.imul(h ^ z, 0x165667b1);
	h ^= h >>> 15;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0, 1] from absolute world coordinates — seamless across chunks. */
function groundNoise(x: number, z: number, seed: number): number {
	const ix = Math.floor(x);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fz = z - iz;
	const ux = fx * fx * (3 - 2 * fx);
	const uz = fz * fz * (3 - 2 * fz);
	const a = latticeHash(ix, iz, seed);
	const b = latticeHash(ix + 1, iz, seed);
	const c = latticeHash(ix, iz + 1, seed);
	const d = latticeHash(ix + 1, iz + 1, seed);
	return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function writeTerrainColor(
	height: number,
	normalY: number,
	out: Float32Array,
	offset: number,
	worldX = 0,
	worldZ = 0
): void {
	const lowToMid = smoothstep(-4, 4, height);
	const midToHigh = smoothstep(6, 26, height);

	let r = LOW[0] + (MID[0] - LOW[0]) * lowToMid;
	let g = LOW[1] + (MID[1] - LOW[1]) * lowToMid;
	let b = LOW[2] + (MID[2] - LOW[2]) * lowToMid;

	r += (HIGH[0] - r) * midToHigh;
	g += (HIGH[1] - g) * midToHigh;
	b += (HIGH[2] - b) * midToHigh;

	if (terrainColorOptions.groundVariation) {
		// Richer, warmer meadow greens than the flat look's blue-leaning ramp.
		const grass = 1 - midToHigh;
		r += (WARM_GRASS[0] - r) * 0.45 * grass;
		g += (WARM_GRASS[1] - g) * 0.45 * grass;
		b += (WARM_GRASS[2] - b) * 0.45 * grass;
		const broad =
			groundNoise(worldX / 23, worldZ / 23, 0x5f3759df) * 0.7 +
			groundNoise(worldX / 7, worldZ / 7, 0x2c1b3c6d) * 0.3;
		const dryness = smoothstep(0.55, 0.85, broad);
		const lushness = smoothstep(0.45, 0.15, broad);
		const grassy = 1 - midToHigh;
		r += (DRY[0] - r) * dryness * 0.45 * grassy;
		g += (DRY[1] - g) * dryness * 0.45 * grassy;
		b += (DRY[2] - b) * dryness * 0.45 * grassy;
		r += (LUSH[0] - r) * lushness * 0.35 * grassy;
		g += (LUSH[1] - g) * lushness * 0.35 * grassy;
		b += (LUSH[2] - b) * lushness * 0.35 * grassy;
		const earth =
			smoothstep(0.8, 0.93, groundNoise(worldX / 4.5, worldZ / 4.5, 0x1b873593)) * grassy;
		r += (EARTH[0] - r) * earth * 0.55;
		g += (EARTH[1] - g) * earth * 0.55;
		b += (EARTH[2] - b) * earth * 0.55;
	}

	// Steep slopes (low normalY) read as bare rock rather than grass.
	const steepness = smoothstep(0.55, 0.85, 1 - normalY);
	r += (ROCK[0] - r) * steepness;
	g += (ROCK[1] - g) * steepness;
	b += (ROCK[2] - b) * steepness;

	out[offset] = r;
	out[offset + 1] = g;
	out[offset + 2] = b;
}

const PLAINS_DEBUG_COLOR = [0.25, 0.62, 0.22];
const HILLS_DEBUG_COLOR = [0.68, 0.62, 0.16];
const HIGHLANDS_DEBUG_COLOR = [0.62, 0.38, 0.14];
const MOUNTAINS_DEBUG_COLOR = [0.8, 0.8, 0.83];

/** "Biome Colours" debug view — blends each region's flat debug colour by its weight, so overlaps are visible as a blend. */
export function writeBiomeDebugColor(
	weights: BiomeWeights,
	out: Float32Array,
	offset: number
): void {
	out[offset] =
		PLAINS_DEBUG_COLOR[0] * weights.plains +
		HILLS_DEBUG_COLOR[0] * weights.hills +
		HIGHLANDS_DEBUG_COLOR[0] * weights.highlands +
		MOUNTAINS_DEBUG_COLOR[0] * weights.mountains;
	out[offset + 1] =
		PLAINS_DEBUG_COLOR[1] * weights.plains +
		HILLS_DEBUG_COLOR[1] * weights.hills +
		HIGHLANDS_DEBUG_COLOR[1] * weights.highlands +
		MOUNTAINS_DEBUG_COLOR[1] * weights.mountains;
	out[offset + 2] =
		PLAINS_DEBUG_COLOR[2] * weights.plains +
		HILLS_DEBUG_COLOR[2] * weights.hills +
		HIGHLANDS_DEBUG_COLOR[2] * weights.highlands +
		MOUNTAINS_DEBUG_COLOR[2] * weights.mountains;
}

/** "Biome Mask" / "Elevation" debug views — a plain grayscale ramp from a 0..1 input. */
export function writeScalarDebugColor(value01: number, out: Float32Array, offset: number): void {
	const v = value01 < 0 ? 0 : value01 > 1 ? 1 : value01;
	out[offset] = v;
	out[offset + 1] = v;
	out[offset + 2] = v;
}

const FOREST_DEBUG_LOW = [0.05, 0.05, 0.05];
const FOREST_DEBUG_HIGH = [0.15, 0.95, 0.2];

/** "Forest Density" debug view — black (no forest) to bright green (dense forest), independent of terrain biome. */
export function writeForestDebugColor(density01: number, out: Float32Array, offset: number): void {
	const d = density01 < 0 ? 0 : density01 > 1 ? 1 : density01;
	out[offset] = FOREST_DEBUG_LOW[0] + (FOREST_DEBUG_HIGH[0] - FOREST_DEBUG_LOW[0]) * d;
	out[offset + 1] = FOREST_DEBUG_LOW[1] + (FOREST_DEBUG_HIGH[1] - FOREST_DEBUG_LOW[1]) * d;
	out[offset + 2] = FOREST_DEBUG_LOW[2] + (FOREST_DEBUG_HIGH[2] - FOREST_DEBUG_LOW[2]) * d;
}

const FOREST_OVERLAY_TINT = [0.04, 0.3, 0.08];

/**
 * "Terrain + Forest" debug view — the normal biome-colour blend, darkened toward a forest-green
 * tint proportional to forest density. This is what makes it easy to see the two systems are
 * genuinely independent: the same biome colour (say, mountain grey) appears both with and without
 * a forest tint in different places, and the tint crosses biome-colour boundaries freely.
 */
export function writeCombinedDebugColor(
	weights: BiomeWeights,
	forestDensity01: number,
	out: Float32Array,
	offset: number
): void {
	writeBiomeDebugColor(weights, out, offset);
	const overlay = (forestDensity01 < 0 ? 0 : forestDensity01 > 1 ? 1 : forestDensity01) * 0.65;
	out[offset] = out[offset] * (1 - overlay) + FOREST_OVERLAY_TINT[0] * overlay;
	out[offset + 1] = out[offset + 1] * (1 - overlay) + FOREST_OVERLAY_TINT[1] * overlay;
	out[offset + 2] = out[offset + 2] * (1 - overlay) + FOREST_OVERLAY_TINT[2] * overlay;
}
