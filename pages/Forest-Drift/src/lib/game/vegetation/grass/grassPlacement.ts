/**
 * Deterministic grass placement for one grass chunk. Pure (typed arrays and plain callbacks, no
 * Three.js), so it is unit-tested directly and could move to a worker unchanged.
 *
 * Candidates live on a WORLD-SPACE grid of `candidateSpacing` cells. A cell's tuft (if any) is a
 * function of (seed hash, cell x, cell z) and the land under it only — never of the chunk it was
 * generated for, the load order or the camera — so tufts are identical across chunk boundaries and
 * across sessions, and a chunk owns exactly the cells whose origin lies inside it (no gaps, no
 * duplicates, negative coordinates included).
 *
 * Per cell, cheapest test first:
 *   1. acceptance = region density × clumping × quality scale, against the cell's existence roll
 *      (a lower scale keeps a stable SUBSET — quality changes never reshuffle the meadow)
 *   2. authored exclusions: foundations / building footprints (a handful of rects per chunk)
 *   3. the built terrain surface at the jittered point: steep slopes thin out, beaches and wet
 *      shelves exclude, water (coarse depth grid) excludes
 *   4. size, variant, terrain-matched colour, LOD rank — packed into 20 bytes
 *
 * Output instances are sorted by LOD rank, so "the first N instances" is always the density-LOD
 * subset that survives at a given distance (see `grassLod.ts`).
 */
import { hashCellToFloat01 } from '../cellHash';
import { smoothstep } from '../../terrain/mathUtils';
import { writeTerrainColor } from '../../terrain/terrainColor';
import { createSurfacePoint, type SurfacePoint } from '../../terrain/terrainSurfaceLattice';
import { GRASS_VARIANTS } from './grassAtlas';
import type { GrassSettings } from './GrassTypes';

/** Hash channels for grass cells (independent of the tree channels, separate seed salt too). */
const Channel = {
	JitterX: 0,
	JitterZ: 1,
	Existence: 2,
	Height: 3,
	Width: 4,
	Variant: 5,
	Rank: 6,
	Tint: 7,
	Wind: 8
} as const;

/** A coarse, chunk-covering grid of per-node values, bilinearly interpolated. */
export interface GrassGrid {
	originX: number;
	originZ: number;
	spacing: number;
	/** Nodes per side. */
	size: number;
	channels: number;
	data: Float32Array;
}

/** Channels of the region grid (see GrassRegionSampler). */
export const REGION_DENSITY = 0;
export const REGION_HEIGHT = 1;
export const REGION_WARMTH = 2;
export const REGION_SHORTNESS = 3;
export const REGION_CHANNELS = 4;

export function sampleGrassGrid(
	grid: GrassGrid,
	worldX: number,
	worldZ: number,
	channel: number
): number {
	const max = grid.size - 1;
	const gx = Math.min(max, Math.max(0, (worldX - grid.originX) / grid.spacing));
	const gz = Math.min(max, Math.max(0, (worldZ - grid.originZ) / grid.spacing));
	const x0 = Math.min(max - 1, Math.floor(gx));
	const z0 = Math.min(max - 1, Math.floor(gz));
	const fx = gx - x0;
	const fz = gz - z0;
	const at = (x: number, z: number) => grid.data[(z * grid.size + x) * grid.channels + channel];
	const top = at(x0, z0) + (at(x0 + 1, z0) - at(x0, z0)) * fx;
	const bottom = at(x0, z0 + 1) + (at(x0 + 1, z0 + 1) - at(x0, z0 + 1)) * fx;
	return top + (bottom - top) * fz;
}

export interface GrassChunkInput {
	chunkX: number;
	chunkZ: number;
	chunkSize: number;
	seedHash: number;
	settings: GrassSettings;
	/** Graphics preset density scale (a stable subset of the full meadow). */
	densityScale: number;
	/** The built terrain surface (false outside loaded terrain). */
	surface: (worldX: number, worldZ: number, out: SurfacePoint) => boolean;
	/** Region values (density, height bias, warmth, shortness) over the chunk. */
	region: GrassGrid;
	/** Water column depth over the chunk (one channel), or null when no water is near. */
	water: GrassGrid | null;
	/** Exclusion rectangles, world space: [minX, minZ, maxX, maxZ] × n. */
	exclusions: Float32Array;
	/** Keep accepted world positions for the candidate-points debug view. */
	collectDebug?: boolean;
}

export interface GrassChunkData {
	count: number;
	/** Root position relative to the chunk origin (x, y, z), metres. */
	positions: Float32Array;
	/** height01, width01, rank, wind (UNSIGNED_BYTE normalized). */
	shape: Uint8Array;
	/** sqrt-encoded linear RGB grass colour, variant index (UNSIGNED_BYTE). */
	tint: Uint8Array;
	/** `rankCounts[k]` = number of instances whose rank byte is < k (k = 0..256). */
	rankCounts: Uint32Array;
	/** Local Y range of the roots (bounds). */
	minY: number;
	maxY: number;
	candidates: number;
	/** World xyz of accepted tufts (debug only). */
	debugPoints: Float32Array | null;
}

/** Variant weights for lush meadow vs short/sparse upland (indices match grassAtlas VARIANTS). */
const LUSH_WEIGHTS = [1, 3, 2.2, 2, 1, 1.2, 0.7, 1];
const SHORT_WEIGHTS = [3, 1, 0.2, 0.6, 1.6, 0.7, 0.35, 2.6];

function pickVariant(shortness: number, roll: number): number {
	let total = 0;
	for (let i = 0; i < GRASS_VARIANTS; i++)
		total += LUSH_WEIGHTS[i] + (SHORT_WEIGHTS[i] - LUSH_WEIGHTS[i]) * shortness;
	let target = roll * total;
	for (let i = 0; i < GRASS_VARIANTS; i++) {
		target -= LUSH_WEIGHTS[i] + (SHORT_WEIGHTS[i] - LUSH_WEIGHTS[i]) * shortness;
		if (target < 0) return i;
	}
	return GRASS_VARIANTS - 1;
}

function latticeHash(x: number, z: number, seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ x, 0x27d4eb2d);
	h = Math.imul(h ^ z, 0x165667b1);
	h ^= h >>> 15;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1] from absolute world coordinates (seamless across chunks). */
function valueNoise(x: number, z: number, seed: number): number {
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

/**
 * Clumping: two octaves of broad value noise (patches ~6 m and ~2 m across) shaped into dense
 * patches and sparse gaps — never per-cell white noise, so meadows have structure.
 */
export function grassClump(worldX: number, worldZ: number, seedHash: number): number {
	const broad = valueNoise(worldX / 6.5, worldZ / 6.5, seedHash ^ 0x3c6ef372);
	const fine = valueNoise(worldX / 2.1, worldZ / 2.1, seedHash ^ 0x1f83d9ab);
	return smoothstep(0.22, 0.78, broad * 0.68 + fine * 0.32);
}

/** First cell index whose origin is ≥ `edge` (cells own their origin — see the module comment). */
function firstCellAtOrAfter(edge: number, spacing: number): number {
	return Math.ceil(edge / spacing - 1e-9);
}

export function generateGrassChunk(input: GrassChunkInput): GrassChunkData {
	const { settings, seedHash, chunkSize } = input;
	const spacing = Math.max(0.2, settings.candidateSpacing);
	const originX = input.chunkX * chunkSize;
	const originZ = input.chunkZ * chunkSize;
	const cellMinX = firstCellAtOrAfter(originX, spacing);
	const cellMaxX = firstCellAtOrAfter(originX + chunkSize, spacing) - 1;
	const cellMinZ = firstCellAtOrAfter(originZ, spacing);
	const cellMaxZ = firstCellAtOrAfter(originZ + chunkSize, spacing) - 1;
	const capacity = Math.max(0, (cellMaxX - cellMinX + 1) * (cellMaxZ - cellMinZ + 1));

	const positions = new Float32Array(capacity * 3);
	const shape = new Uint8Array(capacity * 4);
	const tint = new Uint8Array(capacity * 4);
	const debug: number[] | null = input.collectDebug ? [] : null;
	const surface = createSurfacePoint();
	const color = new Float32Array(3);
	const exclusions = input.exclusions;
	const exclusionCount = exclusions.length / 4;
	const heightRange = Math.max(0.01, settings.maxHeight - settings.minHeight);
	const densityScale = Math.max(0, settings.density * input.densityScale);
	let count = 0;
	let minY = Infinity;
	let maxY = -Infinity;
	let candidates = 0;

	for (let cz = cellMinZ; cz <= cellMaxZ; cz++) {
		for (let cx = cellMinX; cx <= cellMaxX; cx++) {
			candidates++;
			const roll = (channel: number) => hashCellToFloat01(seedHash, cx, cz, channel);
			const x = (cx + 0.05 + roll(Channel.JitterX) * 0.9) * spacing;
			const z = (cz + 0.05 + roll(Channel.JitterZ) * 0.9) * spacing;

			const regionDensity = sampleGrassGrid(input.region, x, z, REGION_DENSITY);
			const clump = grassClump(x, z, seedHash);
			const acceptance = regionDensity * (0.34 + clump * 0.86) * densityScale;
			const existence = roll(Channel.Existence);
			if (existence >= acceptance) continue;

			let excluded = false;
			for (let e = 0; e < exclusionCount; e++) {
				const k = e * 4;
				if (
					x >= exclusions[k] &&
					z >= exclusions[k + 1] &&
					x <= exclusions[k + 2] &&
					z <= exclusions[k + 3]
				) {
					excluded = true;
					break;
				}
			}
			if (excluded) continue;
			if (!input.surface(x, z, surface)) continue;

			// Steep ground thins out to bare rock (~28° full grass → ~45° none), matching the
			// terrain colour's own rock blend; beaches and wet river shelves carry no grass.
			const slopeKeep = smoothstep(0.7, 0.88, surface.normalY);
			const shoreKeep = 1 - smoothstep(0.12, 0.42, Math.max(surface.shoreCover, surface.shoreWet));
			if (existence >= acceptance * slopeKeep * shoreKeep) continue;
			if (input.water && sampleGrassGrid(input.water, x, z, 0) > 0.01) continue;

			const heightBias = sampleGrassGrid(input.region, x, z, REGION_HEIGHT);
			const warmth = sampleGrassGrid(input.region, x, z, REGION_WARMTH);
			const shortness = sampleGrassGrid(input.region, x, z, REGION_SHORTNESS);
			// Dense patches grow a little taller; subtle, never extreme scale noise.
			const height =
				(settings.minHeight + roll(Channel.Height) * heightRange * (1 - shortness * 0.45)) *
				heightBias *
				(0.82 + clump * 0.3) *
				(0.85 + slopeKeep * 0.15);
			const height01 = Math.min(1, Math.max(0, (height - settings.minHeight) / heightRange));
			const width01 = roll(Channel.Width);
			// Bigger tufts rank earlier, so far LODs keep the larger clumps and lose the small ones.
			const rank = Math.min(0.999, roll(Channel.Rank) * 0.72 + (1 - height01) * 0.28);

			writeTerrainColor(surface.height, surface.normalY, color, 0, x, z);
			const shade = 0.93 + roll(Channel.Tint) * 0.14;
			const r = color[0] * shade * (1 + warmth * 0.12);
			const g = color[1] * shade * (1 + warmth * 0.03);
			const b = color[2] * shade * (1 - warmth * 0.2);

			const p = count * 3;
			positions[p] = x - originX;
			positions[p + 1] = surface.height;
			positions[p + 2] = z - originZ;
			const q = count * 4;
			shape[q] = Math.round(height01 * 255);
			shape[q + 1] = Math.round(width01 * 255);
			shape[q + 2] = Math.floor(rank * 256);
			shape[q + 3] = Math.floor(roll(Channel.Wind) * 256);
			tint[q] = Math.round(Math.sqrt(Math.min(1, Math.max(0, r))) * 255);
			tint[q + 1] = Math.round(Math.sqrt(Math.min(1, Math.max(0, g))) * 255);
			tint[q + 2] = Math.round(Math.sqrt(Math.min(1, Math.max(0, b))) * 255);
			tint[q + 3] = pickVariant(shortness, roll(Channel.Variant));
			if (surface.height < minY) minY = surface.height;
			if (surface.height > maxY) maxY = surface.height;
			debug?.push(x, surface.height, z);
			count++;
		}
	}

	return sortByRank({
		count,
		positions,
		shape,
		tint,
		rankCounts: new Uint32Array(257),
		minY: count > 0 ? minY : 0,
		maxY: count > 0 ? maxY : 0,
		candidates,
		debugPoints: debug ? new Float32Array(debug) : null
	});
}

/** Counting sort by rank byte (stable), trimming the arrays to `count`; fills `rankCounts`. */
function sortByRank(data: GrassChunkData): GrassChunkData {
	const { count } = data;
	const histogram = new Uint32Array(257);
	for (let i = 0; i < count; i++) histogram[data.shape[i * 4 + 2] + 1]++;
	for (let k = 1; k <= 256; k++) histogram[k] += histogram[k - 1];
	const cursor = histogram.slice(0, 256);
	const positions = new Float32Array(count * 3);
	const shape = new Uint8Array(count * 4);
	const tint = new Uint8Array(count * 4);
	for (let i = 0; i < count; i++) {
		const to = cursor[data.shape[i * 4 + 2]]++;
		positions.set(data.positions.subarray(i * 3, i * 3 + 3), to * 3);
		shape.set(data.shape.subarray(i * 4, i * 4 + 4), to * 4);
		tint.set(data.tint.subarray(i * 4, i * 4 + 4), to * 4);
	}
	return { ...data, positions, shape, tint, rankCounts: histogram };
}
