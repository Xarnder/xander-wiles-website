import { createNoise2D } from 'simplex-noise';
import type { Noise2D } from './noiseLayer';
import { fbm2D } from './noiseLayer';
import { smoothstep } from './mathUtils';
import { createNamedRandom } from './seededRandom';
import type { TerrainSettings } from './TerrainSettings';

const NORMAL_EPSILON = 0.5;

/** How many world units one "detail" texture cycle spans — deliberately high frequency, low amplitude. */
const DETAIL_SCALE = 6;
/** Wavelength of the broad, gentle undulation under a flat plain. */
const PLAINS_BROAD_SCALE = 220;
/** The secondary ridged mountain-detail noise runs at this fraction of the primary mountain wavelength. */
const MOUNTAIN_DETAIL_SCALE_RATIO = 0.35;
/**
 * Biome classification works off `|biomeMaskValue|` (distance from the mask's center) rather than
 * the signed value. Single-octave simplex noise naturally spends most of its time near the middle
 * of its range and rarely reaches the extremes, so anchoring plains at the *center* (both signed
 * directions) and mountains only at the far tail is what actually produces a plains-dominated
 * world with rare, concentrated mountains — centering plains at one extreme (as a signed-axis
 * model would) instead left it under-represented, since the noise rarely visits that extreme.
 * Each pair below is a smoothstep edge (lo, hi) — the transition band between two adjacent
 * classes — widened by `biome.blendWidth` at sample time.
 */
const PLAINS_HILLS_EDGE: readonly [number, number] = [0.36, 0.5];
const HILLS_HIGHLANDS_EDGE: readonly [number, number] = [0.58, 0.66];
const HIGHLANDS_MOUNTAINS_EDGE: readonly [number, number] = [0.68, 0.76];

/** Reusable output slot for sampleWithNormal — avoids allocating a fresh object per vertex. */
export interface HeightSample {
	height: number;
	normalX: number;
	normalY: number;
	normalZ: number;
}

export function createHeightSample(): HeightSample {
	return { height: 0, normalX: 0, normalY: 1, normalZ: 0 };
}

/** Blend weights (sum to 1) for the four terrain regions at a world coordinate. */
export interface BiomeWeights {
	plains: number;
	hills: number;
	highlands: number;
	mountains: number;
}

export function createBiomeWeights(): BiomeWeights {
	return { plains: 1, hills: 0, highlands: 0, mountains: 0 };
}

/**
 * Pure, deterministic world-space terrain height function. Two callers (a chunk mesh builder
 * and the player controller) that ask for the same (worldX, worldZ) under the same seed and
 * settings always get exactly the same answer — that is what keeps chunk seams and player
 * grounding in agreement, and is what a future multiplayer client would rely on too.
 *
 * ARCHITECTURE: rather than adding a pile of noise layers everywhere, height comes from a small
 * set of large-scale *region recipes* (plains / rolling hills / highlands / mountains), blended
 * by a very-low-frequency biome mask (sampleBiomeWeights) plus an even-lower-frequency macro
 * elevation field for regional plateaus/basins. This is what makes plains actually read as flat
 * and mountains as concentrated ranges rather than uniform bumpiness everywhere — see the
 * "Terrain Regions" section of the README for the full rationale.
 *
 * IMPORTANT: sample() and its helpers below never allocate. Only setSeed() (called rarely, when
 * the seed text actually changes) allocates the noise generators themselves.
 */
export class TerrainHeightSampler {
	private readonly settings: TerrainSettings;
	private seed = '';
	private initialized = false;

	private biomeNoise!: Noise2D;
	private biomeWarpXNoise!: Noise2D;
	private biomeWarpZNoise!: Noise2D;

	private macroElevationNoise!: Noise2D;

	private plainsNoise!: Noise2D;
	private hillsNoise!: Noise2D;
	private highlandsNoise!: Noise2D;

	private mountainNoise!: Noise2D;
	private mountainDetailNoise!: Noise2D;
	private mountainRegionNoise!: Noise2D;
	private mountainRegionWarpXNoise!: Noise2D;
	private mountainRegionWarpZNoise!: Noise2D;

	private sharedDetailNoise!: Noise2D;
	private detailWarpXNoise!: Noise2D;
	private detailWarpZNoise!: Noise2D;

	constructor(settings: TerrainSettings) {
		this.settings = settings;
		this.setSeed(settings.seed);
	}

	/** Rebuilds the seeded noise generators. Call whenever settings.seed changes. */
	setSeed(seed: string): void {
		if (seed === this.seed && this.initialized) return;
		this.seed = seed;
		this.initialized = true;

		this.biomeNoise = createNoise2D(createNamedRandom(seed, 'biome'));
		this.biomeWarpXNoise = createNoise2D(createNamedRandom(seed, 'biomeWarpX'));
		this.biomeWarpZNoise = createNoise2D(createNamedRandom(seed, 'biomeWarpZ'));

		this.macroElevationNoise = createNoise2D(createNamedRandom(seed, 'macroElevation'));

		this.plainsNoise = createNoise2D(createNamedRandom(seed, 'plains'));
		this.hillsNoise = createNoise2D(createNamedRandom(seed, 'hills'));
		this.highlandsNoise = createNoise2D(createNamedRandom(seed, 'highlands'));

		this.mountainNoise = createNoise2D(createNamedRandom(seed, 'mountains'));
		this.mountainDetailNoise = createNoise2D(createNamedRandom(seed, 'mountainDetail'));
		this.mountainRegionNoise = createNoise2D(createNamedRandom(seed, 'mountainRegion'));
		this.mountainRegionWarpXNoise = createNoise2D(createNamedRandom(seed, 'mountainRegionWarpX'));
		this.mountainRegionWarpZNoise = createNoise2D(createNamedRandom(seed, 'mountainRegionWarpZ'));

		this.sharedDetailNoise = createNoise2D(createNamedRandom(seed, 'sharedDetail'));
		this.detailWarpXNoise = createNoise2D(createNamedRandom(seed, 'detailWarpX'));
		this.detailWarpZNoise = createNoise2D(createNamedRandom(seed, 'detailWarpZ'));
	}

	/**
	 * Raw biome-mask value in [-1, 1] after contrast shaping (tanh keeps it bounded smoothly —
	 * never a hard clip). Low values read as "plains-like", high values as "mountain-like".
	 * Exposed publicly for the "Biome Mask" debug view and for tests.
	 */
	sampleBiomeMaskValue(worldX: number, worldZ: number): number {
		const b = this.settings.biome;
		const scale = Math.max(1, b.scale);
		const freq = 1 / scale;

		let x = worldX;
		let z = worldZ;
		if (b.warpStrength > 0) {
			const warpFreq = freq * 0.4;
			const dx = fbm2D(this.biomeWarpXNoise, worldX * warpFreq, worldZ * warpFreq, 2, 2, 0.5, 0);
			const dz = fbm2D(this.biomeWarpZNoise, worldX * warpFreq, worldZ * warpFreq, 2, 2, 0.5, 0);
			x = worldX + dx * b.warpStrength;
			z = worldZ + dz * b.warpStrength;
		}

		// A single octave — this mask must stay dominated by its base wavelength alone (`b.scale`),
		// since adding higher octaves fragments what should be a few huge, clean regions into many
		// small ones.
		const raw = fbm2D(this.biomeNoise, x * freq, z * freq, 1, 2, 0.5, 0);
		return Math.tanh(raw * b.contrast);
	}

	/** sampleBiomeMaskValue(), remapped to [0, 1] — convenient for the debug colour view and tests. */
	sampleBiomeMaskValue01(worldX: number, worldZ: number): number {
		return (this.sampleBiomeMaskValue(worldX, worldZ) + 1) * 0.5;
	}

	/**
	 * Smoothly blended region weights (sum to exactly 1) at a world coordinate. Classification
	 * runs off `|biomeMaskValue|` through three smoothstep transitions (plains -> hills -> highlands
	 * -> mountains) — no hard `if (biome < x)` boundaries anywhere, so terrain morphs continuously
	 * between regions, and the weights are non-negative and normalized by construction (a
	 * telescoping sum), never needing a division-by-zero fallback.
	 */
	sampleBiomeWeights(worldX: number, worldZ: number, out: BiomeWeights): void {
		const absValue = Math.abs(this.sampleBiomeMaskValue(worldX, worldZ));
		const extraBlend = Math.max(0, this.settings.biome.blendWidth) * 0.5;

		const throughHills = smoothstep(
			PLAINS_HILLS_EDGE[0] - extraBlend,
			PLAINS_HILLS_EDGE[1] + extraBlend,
			absValue
		);
		const throughHighlands = smoothstep(
			HILLS_HIGHLANDS_EDGE[0] - extraBlend,
			HILLS_HIGHLANDS_EDGE[1] + extraBlend,
			absValue
		);
		const throughMountains = smoothstep(
			HIGHLANDS_MOUNTAINS_EDGE[0] - extraBlend,
			HIGHLANDS_MOUNTAINS_EDGE[1] + extraBlend,
			absValue
		);

		out.plains = 1 - throughHills;
		out.hills = throughHills - throughHighlands;
		out.highlands = throughHighlands - throughMountains;
		out.mountains = throughMountains;
	}

	/** Extremely-low-frequency regional elevation: plateaus/basins independent of region type. */
	private sampleMacroElevation(worldX: number, worldZ: number): number {
		const m = this.settings.macroElevation;
		if (m.amplitude === 0) return 0;
		const freq = 1 / Math.max(1, m.scale);
		return (
			fbm2D(this.macroElevationNoise, worldX * freq, worldZ * freq, 2, 2, 0.35, 0) * m.amplitude
		);
	}

	/** Shared high-frequency, low-amplitude surface texture — every region recipe adds this, scaled by its own detailStrength. */
	private sampleSharedDetail(worldX: number, worldZ: number): number {
		const w = this.settings.detailWarp;
		let x = worldX;
		let z = worldZ;
		if (w.enabled && w.strength > 0) {
			const dx = fbm2D(
				this.detailWarpXNoise,
				worldX * w.frequency,
				worldZ * w.frequency,
				w.octaves,
				2,
				0.5,
				0
			);
			const dz = fbm2D(
				this.detailWarpZNoise,
				worldX * w.frequency,
				worldZ * w.frequency,
				w.octaves,
				2,
				0.5,
				0
			);
			x = worldX + dx * w.strength;
			z = worldZ + dz * w.strength;
		}
		const freq = 1 / DETAIL_SCALE;
		return fbm2D(this.sharedDetailNoise, x * freq, z * freq, 3, 2, 0.5, 0);
	}

	/** Broad, gentle undulation only — `flatness` compresses amplitude toward dead flat, smoothly and linearly (never clipped). */
	private samplePlains(worldX: number, worldZ: number, sharedDetail: number): number {
		const p = this.settings.plains;
		const freq = 1 / PLAINS_BROAD_SCALE;
		const broad = fbm2D(this.plainsNoise, worldX * freq, worldZ * freq, 3, 2.1, 0.5, 0);
		const effectiveAmplitude = p.amplitude * (1 - Math.min(1, Math.max(0, p.flatness)));
		return broad * effectiveAmplitude + sharedDetail * p.detailStrength;
	}

	/** Broad hills at `hills.scale` wavelength — `roundness` blends toward rounder crests / flatter valleys. */
	private sampleRollingHills(worldX: number, worldZ: number, sharedDetail: number): number {
		const h = this.settings.hills;
		const freq = 1 / Math.max(1, h.scale);
		const base = fbm2D(this.hillsNoise, worldX * freq, worldZ * freq, 4, 2, 0.5, 0);
		const roundness = Math.min(1, Math.max(0, h.roundness));
		const rounded = Math.sign(base) * Math.pow(Math.abs(base), 1 + roundness);
		const shaped = base * (1 - roundness) + rounded * roundness;
		return shaped * h.amplitude + sharedDetail * h.detailStrength;
	}

	/** More broken terrain than rolling hills — some ridged structure, still readable at a distance. */
	private sampleHighlands(worldX: number, worldZ: number, sharedDetail: number): number {
		const hl = this.settings.highlands;
		const freq = 1 / Math.max(1, hl.scale);
		const base = fbm2D(
			this.highlandsNoise,
			worldX * freq,
			worldZ * freq,
			5,
			2.1,
			0.5,
			hl.ridgeAmount
		);
		return base * hl.amplitude + sharedDetail * hl.detailStrength;
	}

	/**
	 * Ridged-multifractal mountain shape (see fbm2D's ridgeAmount), gated by a dedicated
	 * low-frequency region mask so dramatic peaks group into ranges rather than scattering
	 * everywhere the biome mask merely leans "mountainous". The mask is warped so ranges read as
	 * organic, elongated features instead of circular blobs.
	 */
	private sampleMountains(worldX: number, worldZ: number, sharedDetail: number): number {
		const mt = this.settings.mountains;
		const regionMask = this.sampleMountainRegionMask(worldX, worldZ);
		if (regionMask <= 0) return 0;

		const freq = 1 / Math.max(1, mt.scale);
		const base = fbm2D(this.mountainNoise, worldX * freq, worldZ * freq, 4, 2.2, 0.55, 1);
		const sharpness = Math.max(0.1, mt.sharpness);
		const sharpened = Math.sign(base) * Math.pow(Math.abs(base), sharpness);

		const detailFreq = freq / Math.max(0.05, MOUNTAIN_DETAIL_SCALE_RATIO);
		const secondaryRidge = fbm2D(
			this.mountainDetailNoise,
			worldX * detailFreq,
			worldZ * detailFreq,
			3,
			2.1,
			0.5,
			0.7
		);

		const height =
			sharpened * mt.amplitude +
			secondaryRidge * mt.amplitude * 0.22 +
			sharedDetail * mt.detailStrength;
		return height * regionMask;
	}

	/** 0..1 mask gating where, within mountain-leaning biome territory, dramatic ridges actually appear. */
	private sampleMountainRegionMask(worldX: number, worldZ: number): number {
		const mt = this.settings.mountains;
		const freq = 1 / Math.max(1, mt.regionScale);

		let x = worldX;
		let z = worldZ;
		if (mt.warpStrength > 0) {
			const warpFreq = freq * 0.5;
			const dx = fbm2D(
				this.mountainRegionWarpXNoise,
				worldX * warpFreq,
				worldZ * warpFreq,
				2,
				2,
				0.5,
				0
			);
			const dz = fbm2D(
				this.mountainRegionWarpZNoise,
				worldX * warpFreq,
				worldZ * warpFreq,
				2,
				2,
				0.5,
				0
			);
			x = worldX + dx * mt.warpStrength;
			z = worldZ + dz * mt.warpStrength;
		}

		// Single octave for the same reason as the biome mask: this must stay a few large, clean
		// blobs (elongated by the warp above), not fragment into many small ones.
		const raw = fbm2D(this.mountainRegionNoise, x * freq, z * freq, 1, 2, 0.5, 0);
		const normalized = (raw + 1) * 0.5;
		const edge0 = Math.min(1, Math.max(0, mt.regionThreshold));
		const edge1 = Math.min(1, edge0 + Math.max(0, mt.regionBlend));
		return smoothstep(edge0, edge1, normalized);
	}

	private applyTerracing(height: number): number {
		const amount = this.settings.terraceAmount;
		if (amount <= 0) return height;
		const terraceStep = 3;
		const terraced = Math.round(height / terraceStep) * terraceStep;
		return height * (1 - amount) + terraced * amount;
	}

	/** Reused across sample() calls — a private scratch object, never allocated per vertex. */
	private readonly weightScratch: BiomeWeights = createBiomeWeights();

	sample(worldX: number, worldZ: number): number {
		const weights = this.weightScratch;
		this.sampleBiomeWeights(worldX, worldZ, weights);

		const macro = this.sampleMacroElevation(worldX, worldZ);
		const sharedDetail = this.sampleSharedDetail(worldX, worldZ);

		let regional = 0;
		if (weights.plains > 1e-4)
			regional += this.samplePlains(worldX, worldZ, sharedDetail) * weights.plains;
		if (weights.hills > 1e-4) {
			regional += this.sampleRollingHills(worldX, worldZ, sharedDetail) * weights.hills;
		}
		if (weights.highlands > 1e-4) {
			regional += this.sampleHighlands(worldX, worldZ, sharedDetail) * weights.highlands;
		}
		if (weights.mountains > 1e-4) {
			regional += this.sampleMountains(worldX, worldZ, sharedDetail) * weights.mountains;
		}

		const combined = this.applyTerracing(macro + regional);
		return this.settings.baseHeight + combined * this.settings.heightMultiplier;
	}

	/**
	 * Height + analytic normal from a central-difference gradient of the same world-space
	 * height function. Because both neighbouring chunks sample identical world coordinates
	 * with the same epsilon, they compute bit-identical normals along a shared edge — no
	 * per-chunk computeVertexNormals() seams.
	 */
	sampleWithNormal(worldX: number, worldZ: number, out: HeightSample): void {
		const hL = this.sample(worldX - NORMAL_EPSILON, worldZ);
		const hR = this.sample(worldX + NORMAL_EPSILON, worldZ);
		const hD = this.sample(worldX, worldZ - NORMAL_EPSILON);
		const hU = this.sample(worldX, worldZ + NORMAL_EPSILON);
		const hC = this.sample(worldX, worldZ);

		const nx = hL - hR;
		const ny = NORMAL_EPSILON * 2;
		const nz = hD - hU;
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

		out.height = hC;
		out.normalX = nx / len;
		out.normalY = ny / len;
		out.normalZ = nz / len;
	}
}
