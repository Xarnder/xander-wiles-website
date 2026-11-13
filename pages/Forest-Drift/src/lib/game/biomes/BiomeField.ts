import { createBiomeWeights, type BiomeWeights } from '../terrain/TerrainHeightSampler';
import { classifyBiomes, landformClasses, type BiomeClassifierInput } from './BiomeClassifier';
import {
	BIOME_COUNT,
	createBiomeWeightVector,
	createClimateSample,
	createLandformClassWeights,
	type BiomeSettings,
	type BiomeWeightVector,
	type ClimateSample
} from './BiomeTypes';
import { biomesAvailable } from './biomeKillSwitch';
import { ClimateSampler } from './ClimateSampler';

/** The terrain functions biomes read. Pre-water and pre-edit only — never the final `sample`. */
export interface BiomeTerrainSource {
	sampleBaseWithWeights(worldX: number, worldZ: number, outWeights: BiomeWeights): number;
	/** Plateaus and basins, metres — large-scale, so uplands form contiguous regions. */
	sampleMacroElevation(worldX: number, worldZ: number): number;
	/** 0..1, where real mountain ranges rise. */
	sampleMountainRegionMask(worldX: number, worldZ: number): number;
}

/**
 * World-space spacing of the classification lattice, metres. Borders are 60–90 m wide, so 16 m
 * interpolates them smoothly; classification is the expensive part of a tile, and 16 m does a
 * quarter of the work of 8 m (measured: terrain chunk builds stay within the Q32 budget).
 */
export const BIOME_LATTICE_SPACING = 16;
/** Lattice cells per tile edge (a tile covers 64 m × 64 m). */
const TILE_CELLS = 4;
const TILE_POINTS = TILE_CELLS + 1;
const TILE_METRES = BIOME_LATTICE_SPACING * TILE_CELLS;
/**
 * Per lattice point: one weight per biome, then temperature, moisture, and the biome index when the
 * point is 100% one biome (−1 when blended) — the fast path for the common case.
 */
const POINT_STRIDE = BIOME_COUNT + 3;
const TEMPERATURE_SLOT = BIOME_COUNT;
const MOISTURE_SLOT = BIOME_COUNT + 1;
const PURE_SLOT = BIOME_COUNT + 2;
const TILE_FLOATS = TILE_POINTS * TILE_POINTS * POINT_STRIDE;
/** About 1.5 MB of tiles at most (~2 km² of classified ground around the player). */
export const DEFAULT_BIOME_TILE_CAPACITY = 512;

const KEY_OFFSET = 1 << 20;

function tileKey(tx: number, tz: number): number {
	return (tx + KEY_OFFSET) * (KEY_OFFSET * 2) + (tz + KEY_OFFSET);
}

/**
 * The one place biomes are computed and cached: a world-aligned 16 m lattice, in 64 m tiles, kept
 * in a small LRU. Every system that needs biomes (terrain colour, grass, plants, trees, weather,
 * the HUD, debug views) reads from here, so each lattice point is classified once, not once per
 * system.
 *
 * Seamless by construction: lattice points sit at `n × 16` world metres, tiles share their edge
 * points, and lookups interpolate bilinearly from the four surrounding points using absolute world
 * coordinates — two chunks touching a point always read identical values, as with terrain heights.
 *
 * Lookups never allocate. A cache miss classifies 25 points and reuses an evicted tile's buffer.
 */
export class BiomeField {
	private readonly terrain: BiomeTerrainSource;
	private readonly settings: BiomeSettings;
	private readonly climate: ClimateSampler;
	private readonly capacity: number;
	private readonly tiles = new Map<number, Float32Array>();
	private readonly spare: Float32Array[] = [];
	private seed = '';
	private generation = 0;

	private readonly terrainWeights = createBiomeWeights();
	private readonly landform = createLandformClassWeights();
	private readonly climateScratch = createClimateSample();
	private readonly input: BiomeClassifierInput;
	private readonly pointWeights = createBiomeWeightVector();
	private readonly lookupWeights = createBiomeWeightVector();

	private lastKey = Number.NaN;
	private lastTile: Float32Array | null = null;

	constructor(
		terrain: BiomeTerrainSource,
		settings: BiomeSettings,
		capacity = DEFAULT_BIOME_TILE_CAPACITY
	) {
		this.terrain = terrain;
		this.settings = settings;
		this.climate = new ClimateSampler(settings);
		this.capacity = Math.max(4, capacity);
		this.input = {
			climate: this.climateScratch,
			landform: this.landform,
			baseElevation: 0
		};
	}

	/** Sets the world seed. Clears the cache only when something actually changed. */
	setSeed(seed: string): void {
		this.seed = seed;
		this.invalidate();
	}

	/**
	 * Call after the world seed, terrain shape or any biome setting changes. Increments
	 * `getGeneration()` so callers can tell their cached results are stale.
	 */
	invalidate(): void {
		this.climate.setSeed(this.seed);
		for (const tile of this.tiles.values()) this.spare.push(tile);
		this.tiles.clear();
		this.lastKey = Number.NaN;
		this.lastTile = null;
		this.generation++;
	}

	getGeneration(): number {
		return this.generation;
	}

	/** The world's biomes are on, and not switched off by the kill switch (biomeKillSwitch.ts). */
	isEnabled(): boolean {
		return this.settings.enabled && biomesAvailable();
	}

	getSettings(): Readonly<BiomeSettings> {
		return this.settings;
	}

	getSpawnOffset(): { x: number; z: number } {
		return this.climate.getSpawnOffset();
	}

	/** Cached tiles (tests and diagnostics). */
	getTileCount(): number {
		return this.tiles.size;
	}

	/**
	 * Classifies one point directly, bypassing the lattice — for tests, the determinism report, and
	 * one-off probes. Systems should use the interpolated lookups instead.
	 */
	classifyPoint(
		worldX: number,
		worldZ: number,
		out: BiomeWeightVector,
		climateOut?: ClimateSample
	): number {
		const terrain = this.terrain;
		const elevation = terrain.sampleBaseWithWeights(worldX, worldZ, this.terrainWeights);
		const mountainWeight = this.terrainWeights.mountains;
		landformClasses(
			terrain.sampleMacroElevation(worldX, worldZ),
			mountainWeight,
			mountainWeight > 0 ? terrain.sampleMountainRegionMask(worldX, worldZ) : 0,
			this.landform
		);
		this.climate.sample(worldX, worldZ, elevation, this.climateScratch, this.landform.mountain);
		this.input.baseElevation = elevation;
		if (climateOut) {
			climateOut.temperature = this.climateScratch.temperature;
			climateOut.moisture = this.climateScratch.moisture;
			climateOut.rarity = this.climateScratch.rarity;
		}
		return classifyBiomes(this.input, this.settings, out);
	}

	private tile(tx: number, tz: number): Float32Array {
		const key = tileKey(tx, tz);
		if (key === this.lastKey && this.lastTile) return this.lastTile;
		let tile = this.tiles.get(key);
		if (tile) {
			// Refresh LRU position.
			this.tiles.delete(key);
			this.tiles.set(key, tile);
		} else {
			tile = this.buildTile(tx, tz);
			this.tiles.set(key, tile);
			while (this.tiles.size > this.capacity) {
				const oldest = this.tiles.keys().next().value as number;
				const evicted = this.tiles.get(oldest)!;
				this.tiles.delete(oldest);
				this.spare.push(evicted);
			}
		}
		this.lastKey = key;
		this.lastTile = tile;
		return tile;
	}

	private buildTile(tx: number, tz: number): Float32Array {
		const tile = this.spare.pop() ?? new Float32Array(TILE_FLOATS);
		const originX = tx * TILE_METRES;
		const originZ = tz * TILE_METRES;
		const weights = this.pointWeights;
		for (let j = 0; j < TILE_POINTS; j++) {
			for (let i = 0; i < TILE_POINTS; i++) {
				this.classifyPoint(
					originX + i * BIOME_LATTICE_SPACING,
					originZ + j * BIOME_LATTICE_SPACING,
					weights
				);
				const base = (j * TILE_POINTS + i) * POINT_STRIDE;
				let pure = -1;
				for (let k = 0; k < BIOME_COUNT; k++) {
					tile[base + k] = weights[k];
					if (weights[k] === 1) pure = k;
				}
				tile[base + PURE_SLOT] = pure;
				tile[base + TEMPERATURE_SLOT] = this.climateScratch.temperature;
				tile[base + MOISTURE_SLOT] = this.climateScratch.moisture;
			}
		}
		return tile;
	}

	// Result of the last `locate`: the four corner offsets in the tile and their bilinear weights.
	private b00 = 0;
	private b10 = 0;
	private b01 = 0;
	private b11 = 0;
	private w00 = 0;
	private w10 = 0;
	private w01 = 0;
	private w11 = 0;

	/**
	 * Finds the four lattice points around (x, z) and their bilinear weights. A tile stores its far
	 * edge points too (shared with its neighbour), so the four corners are always in one tile.
	 */
	private locate(worldX: number, worldZ: number): Float32Array {
		const gx = worldX / BIOME_LATTICE_SPACING;
		const gz = worldZ / BIOME_LATTICE_SPACING;
		const ix = Math.floor(gx);
		const iz = Math.floor(gz);
		const fx = gx - ix;
		const fz = gz - iz;
		const tx = Math.floor(ix / TILE_CELLS);
		const tz = Math.floor(iz / TILE_CELLS);
		const lx = ix - tx * TILE_CELLS;
		const lz = iz - tz * TILE_CELLS;
		const tile = this.tile(tx, tz);
		this.b00 = (lz * TILE_POINTS + lx) * POINT_STRIDE;
		this.b10 = this.b00 + POINT_STRIDE;
		this.b01 = this.b00 + TILE_POINTS * POINT_STRIDE;
		this.b11 = this.b01 + POINT_STRIDE;
		this.w00 = (1 - fx) * (1 - fz);
		this.w10 = fx * (1 - fz);
		this.w01 = (1 - fx) * fz;
		this.w11 = fx * fz;
		return tile;
	}

	/** Interpolated biome weights at a world point (sums to 1). Returns the dominant biome index. */
	weightsAt(worldX: number, worldZ: number, out: BiomeWeightVector): number {
		const tile = this.locate(worldX, worldZ);
		const { b00, b10, b01, b11, w00, w10, w01, w11 } = this;
		const pure = tile[b00 + PURE_SLOT];
		if (
			pure >= 0 &&
			tile[b10 + PURE_SLOT] === pure &&
			tile[b01 + PURE_SLOT] === pure &&
			tile[b11 + PURE_SLOT] === pure
		) {
			out.fill(0);
			out[pure] = 1;
			return pure;
		}
		let dominant = 0;
		let best = -1;
		for (let k = 0; k < BIOME_COUNT; k++) {
			const w =
				tile[b00 + k] * w00 + tile[b10 + k] * w10 + tile[b01 + k] * w01 + tile[b11 + k] * w11;
			out[k] = w;
			if (w > best) {
				best = w;
				dominant = k;
			}
		}
		return dominant;
	}

	/** Index of the biome with the largest interpolated weight at a world point. */
	dominantAt(worldX: number, worldZ: number): number {
		return this.weightsAt(worldX, worldZ, this.lookupWeights);
	}

	/** Interpolated temperature and moisture (rarity is left untouched). */
	climateAt(worldX: number, worldZ: number, out: ClimateSample): void {
		const tile = this.locate(worldX, worldZ);
		const { b00, b10, b01, b11, w00, w10, w01, w11 } = this;
		out.temperature =
			tile[b00 + TEMPERATURE_SLOT] * w00 +
			tile[b10 + TEMPERATURE_SLOT] * w10 +
			tile[b01 + TEMPERATURE_SLOT] * w01 +
			tile[b11 + TEMPERATURE_SLOT] * w11;
		out.moisture =
			tile[b00 + MOISTURE_SLOT] * w00 +
			tile[b10 + MOISTURE_SLOT] * w10 +
			tile[b01 + MOISTURE_SLOT] * w01 +
			tile[b11 + MOISTURE_SLOT] * w11;
	}
}
