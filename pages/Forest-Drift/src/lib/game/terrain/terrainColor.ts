/** Vertex colouring: normal elevation/slope tinting, plus debug visualizations. Pure functions, write into caller-owned output — no allocation. */

import { smoothstep } from './mathUtils';
import type { BiomeWeights } from './TerrainHeightSampler';

const LOW = [0.16, 0.22, 0.1];
const MID = [0.27, 0.38, 0.17];
const HIGH = [0.52, 0.52, 0.44];
const ROCK = [0.38, 0.36, 0.32];

export function writeTerrainColor(
	height: number,
	normalY: number,
	out: Float32Array,
	offset: number
): void {
	const lowToMid = smoothstep(-4, 4, height);
	const midToHigh = smoothstep(6, 26, height);

	let r = LOW[0] + (MID[0] - LOW[0]) * lowToMid;
	let g = LOW[1] + (MID[1] - LOW[1]) * lowToMid;
	let b = LOW[2] + (MID[2] - LOW[2]) * lowToMid;

	r += (HIGH[0] - r) * midToHigh;
	g += (HIGH[1] - g) * midToHigh;
	b += (HIGH[2] - b) * midToHigh;

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
