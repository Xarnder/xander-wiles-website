import { smoothstep } from '../terrain/mathUtils';
import { groundNoise, terrainColorOptions } from '../terrain/terrainColor';
import type { GrassRegion } from '../vegetation/grass/GrassRegionSampler';
import type { BiomeField } from './BiomeField';
import {
	GROUND_LAYER_RGB,
	P,
	PACKED_SURFACE_PROFILES,
	PROFILE_STRIDE
} from './biomeSurfaceProfiles';
import { BIOME_COUNT, createBiomeWeightVector } from './BiomeTypes';

const HIGH = [0.52, 0.52, 0.44];
const ROCK = [0.38, 0.36, 0.32];

/** Distinct seeds per ground layer, so snow, sand, soil and litter patches don't line up. */
const LAYER_SEEDS = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a] as const;

/**
 * Ground cover amounts (snow, sand, soil, litter) from blended base amounts + world-space patch
 * noise. A layer whose base is 0 stays exactly 0; small bases fade in, so borders are ragged
 * patches rather than a band or a jump.
 */
function coverAmount(base: number, patchiness: number, x: number, z: number, seed: number) {
	if (base <= 0.001) return 0;
	const n =
		groundNoise(x / 9, z / 9, seed) * 0.7 + groundNoise(x / 2.7, z / 2.7, seed ^ 0x5bd1) * 0.3;
	const raw = base + (n - 0.5) * patchiness * 1.6;
	return smoothstep(0.25, 0.75, raw) * Math.min(1, base * 8);
}

/**
 * Biome ground and grass at a point, from the shared `BiomeField`. Used by terrain chunks (vertex
 * colour + the `aGround` cover attribute) and by grass (tuft colour, density, height).
 *
 * When the world's biomes are off, callers don't use this at all and keep today's code paths, so
 * a world without biomes is bit-for-bit what it was. Never allocates.
 */
export class BiomeSurface {
	private readonly field: BiomeField;
	private readonly weights = createBiomeWeightVector();
	private readonly profile = new Float32Array(PROFILE_STRIDE);
	private readonly cover = new Float32Array(4);

	constructor(field: BiomeField) {
		this.field = field;
	}

	enabled(): boolean {
		return this.field.isEnabled();
	}

	/**
	 * The profile in effect after `blendAt`: `src[o + P.…]`. Most of the world is a single biome, so
	 * that case points straight at the biome's packed row; only borders blend into `this.profile`.
	 */
	private src: Float32Array = PACKED_SURFACE_PROFILES;
	private o = 0;

	/** Blends every biome's profile at (x, z), skipping absent biomes. */
	private blendAt(worldX: number, worldZ: number): void {
		const w = this.weights;
		const dominant = this.field.weightsAt(worldX, worldZ, w);
		if (w[dominant] >= 0.9999) {
			this.src = PACKED_SURFACE_PROFILES;
			this.o = dominant * PROFILE_STRIDE;
			return;
		}
		const profile = this.profile;
		profile.fill(0);
		for (let k = 0; k < BIOME_COUNT; k++) {
			const weight = w[k];
			if (weight <= 0) continue;
			const row = k * PROFILE_STRIDE;
			for (let j = 0; j < PROFILE_STRIDE; j++) {
				profile[j] += PACKED_SURFACE_PROFILES[row + j] * weight;
			}
		}
		this.src = profile;
		this.o = 0;
	}

	/** Patchy cover amounts for the blended profile into `this.cover`; returns their sum. */
	private coverAt(worldX: number, worldZ: number): number {
		const profile = this.src;
		const o = this.o;
		const patchiness = profile[o + P.patchiness];
		const c = this.cover;
		c[0] = coverAmount(profile[o + P.snow], patchiness, worldX, worldZ, LAYER_SEEDS[0]);
		c[1] = coverAmount(profile[o + P.sand], patchiness, worldX, worldZ, LAYER_SEEDS[1]);
		c[2] = coverAmount(profile[o + P.soil], patchiness, worldX, worldZ, LAYER_SEEDS[2]);
		c[3] = coverAmount(profile[o + P.litter], patchiness, worldX, worldZ, LAYER_SEEDS[3]);
		return c[0] + c[1] + c[2] + c[3];
	}

	/**
	 * The grass colour ramp of `writeTerrainColor`, with the blended biome palette in place of the
	 * fixed countryside colours (elevation ramp → ground variation → rock on steep slopes).
	 */
	private writeGrassRamp(
		height: number,
		normalY: number,
		worldX: number,
		worldZ: number,
		out: Float32Array,
		offset: number
	): void {
		const p = this.src;
		const o = this.o;
		const lowToMid = smoothstep(-4, 4, height);
		const midToHigh = smoothstep(6, 26, height);
		let r = p[o + P.low] + (p[o + P.mid] - p[o + P.low]) * lowToMid;
		let g = p[o + P.low + 1] + (p[o + P.mid + 1] - p[o + P.low + 1]) * lowToMid;
		let b = p[o + P.low + 2] + (p[o + P.mid + 2] - p[o + P.low + 2]) * lowToMid;
		r += (HIGH[0] - r) * midToHigh;
		g += (HIGH[1] - g) * midToHigh;
		b += (HIGH[2] - b) * midToHigh;

		if (terrainColorOptions.groundVariation) {
			const grass = 1 - midToHigh;
			r += (p[o + P.warm] - r) * 0.45 * grass;
			g += (p[o + P.warm + 1] - g) * 0.45 * grass;
			b += (p[o + P.warm + 2] - b) * 0.45 * grass;
			const broad =
				groundNoise(worldX / 23, worldZ / 23, 0x5f3759df) * 0.7 +
				groundNoise(worldX / 7, worldZ / 7, 0x2c1b3c6d) * 0.3;
			const dryness = smoothstep(0.55, 0.85, broad);
			const lushness = smoothstep(0.45, 0.15, broad);
			r += (p[o + P.dry] - r) * dryness * 0.45 * grass;
			g += (p[o + P.dry + 1] - g) * dryness * 0.45 * grass;
			b += (p[o + P.dry + 2] - b) * dryness * 0.45 * grass;
			r += (p[o + P.lush] - r) * lushness * 0.35 * grass;
			g += (p[o + P.lush + 1] - g) * lushness * 0.35 * grass;
			b += (p[o + P.lush + 2] - b) * lushness * 0.35 * grass;
			const earth =
				smoothstep(0.8, 0.93, groundNoise(worldX / 4.5, worldZ / 4.5, 0x1b873593)) * grass;
			r += (p[o + P.earth] - r) * earth * 0.55;
			g += (p[o + P.earth + 1] - g) * earth * 0.55;
			b += (p[o + P.earth + 2] - b) * earth * 0.55;
		}

		const steepness = smoothstep(0.55, 0.85, 1 - normalY);
		r += (ROCK[0] - r) * steepness;
		g += (ROCK[1] - g) * steepness;
		b += (ROCK[2] - b) * steepness;
		out[offset] = r;
		out[offset + 1] = g;
		out[offset + 2] = b;
	}

	/**
	 * Terrain vertex colour and ground cover. `ground` receives (snow, sand, soil, litter) for the
	 * `aGround` attribute: gated off steep rock and beaches, and normalised to sum ≤ 1. The vertex
	 * colour also blends toward the cover colours, which is the whole look with procedural
	 * materials off and the far-distance average with them on.
	 */
	writeTerrain(
		height: number,
		normalY: number,
		worldX: number,
		worldZ: number,
		shoreCover: number,
		shoreStone: number,
		color: Float32Array,
		colorOffset: number,
		ground: Float32Array,
		groundOffset: number
	): void {
		this.blendAt(worldX, worldZ);
		this.writeGrassRamp(height, normalY, worldX, worldZ, color, colorOffset);

		const shore = shoreCover < 0 ? 0 : shoreCover > 1 ? 1 : shoreCover;
		let total = this.coverAt(worldX, worldZ);
		const c = this.cover;
		if (total > 0) {
			// Snow settles on gentle ground only; everything else gives way to bare rock on steep faces.
			const snowSlope = smoothstep(0.6, 0.85, normalY);
			const flat = 1 - smoothstep(0.55, 0.85, 1 - normalY);
			const keep = 1 - shore;
			c[0] *= snowSlope * keep;
			c[1] *= flat * keep;
			c[2] *= flat * keep;
			c[3] *= flat * keep;
			total = c[0] + c[1] + c[2] + c[3];
			if (total > 1) {
				const inv = 1 / total;
				c[0] *= inv;
				c[1] *= inv;
				c[2] *= inv;
				c[3] *= inv;
				total = 1;
			}
		}
		ground[groundOffset] = c[0];
		ground[groundOffset + 1] = c[1];
		ground[groundOffset + 2] = c[2];
		ground[groundOffset + 3] = c[3];

		let r = color[colorOffset];
		let g = color[colorOffset + 1];
		let b = color[colorOffset + 2];
		if (total > 0.001) {
			const L = GROUND_LAYER_RGB;
			const inv = 1 / total;
			const tr =
				(L.snow[0] * c[0] + L.sand[0] * c[1] + L.soil[0] * c[2] + L.litter[0] * c[3]) * inv;
			const tg =
				(L.snow[1] * c[0] + L.sand[1] * c[1] + L.soil[1] * c[2] + L.litter[1] * c[3]) * inv;
			const tb =
				(L.snow[2] * c[0] + L.sand[2] * c[1] + L.soil[2] * c[2] + L.litter[2] * c[3]) * inv;
			r += (tr - r) * total;
			g += (tg - g) * total;
			b += (tb - b) * total;
		}

		// Beaches and wet beds — identical to `writeTerrainColor`.
		if (shore > 0.001) {
			const stone = shoreStone < 0 ? 0 : shoreStone > 1 ? 1 : shoreStone;
			const grain = groundNoise(worldX * 1.6, worldZ * 1.6, 0x51a1e3);
			const pebble = groundNoise(worldX * 4.2, worldZ * 4.2, 0x9e3779b1);
			const mudR = 0.28 + (0.43 - 0.28) * grain;
			const mudG = 0.19 + (0.32 - 0.19) * grain;
			const mudB = 0.11 + (0.18 - 0.11) * grain;
			const rockR = 0.4 + (0.74 - 0.4) * pebble;
			const rockG = 0.38 + (0.71 - 0.38) * pebble;
			const rockB = 0.34 + (0.64 - 0.34) * pebble;
			r += (mudR + (rockR - mudR) * stone - r) * shore;
			g += (mudG + (rockG - mudG) * stone - g) * shore;
			b += (mudB + (rockB - mudB) * stone - b) * shore;
		}
		color[colorOffset] = r;
		color[colorOffset + 1] = g;
		color[colorOffset + 2] = b;
	}

	/** Grass tuft colour: the biome's grass ramp, never the ground cover (no white grass in snow). */
	writeGrassColor(
		height: number,
		normalY: number,
		worldX: number,
		worldZ: number,
		out: Float32Array,
		offset: number
	): void {
		this.blendAt(worldX, worldZ);
		this.writeGrassRamp(height, normalY, worldX, worldZ, out, offset);
	}

	/**
	 * Adjusts a grass region for the biome: density, height, warmth and shortness from the profile,
	 * and thinner grass where the ground is covered (snowfields, sand, bare soil, leaf litter).
	 */
	applyGrass(worldX: number, worldZ: number, region: GrassRegion): GrassRegion {
		this.blendAt(worldX, worldZ);
		const p = this.src;
		const o = this.o;
		const covered = Math.min(1, this.coverAt(worldX, worldZ));
		region.density = Math.max(
			0,
			Math.min(1, region.density * p[o + P.grassDensity] * (1 - covered * 0.85))
		);
		region.heightBias *= p[o + P.grassHeight];
		region.warmth = Math.max(-1, Math.min(1, region.warmth + p[o + P.grassWarmth]));
		region.shortness = Math.max(0, Math.min(1, region.shortness + p[o + P.grassShortness]));
		return region;
	}
}
