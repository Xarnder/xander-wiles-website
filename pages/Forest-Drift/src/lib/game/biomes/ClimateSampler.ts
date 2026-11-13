import { createNoise2D } from 'simplex-noise';
import { fbm2D, type Noise2D } from '../terrain/noiseLayer';
import { createMulberry32, createNamedRandom, hashStringToUint32 } from '../terrain/seededRandom';
import { BIOME_SIZE_METRES, type BiomeSettings, type ClimateSample } from './BiomeTypes';

/**
 * Quantiles of single-octave simplex noise (`simplex-noise` createNoise2D), symmetrised, at
 * k / 32 for k = 0 … 32 — measured over 2 million samples from 40 seeds. The distribution of
 * simplex noise doesn't depend on the seed, so this is a constant. Mapping a raw value through the
 * inverse makes climate EQUAL-AREA (every value 0..1 equally common), so a biome box's width in
 * `biomeDefinitions.ts` reads directly as a share of the world.
 */
const SIMPLEX_QUANTILES: readonly number[] = [
	-0.9979, -0.7521, -0.6446, -0.5953, -0.5496, -0.5046, -0.46035, -0.4157, -0.37085, -0.3237,
	-0.2768, -0.23035, -0.18415, -0.1392, -0.0943, -0.04765, 0, 0.04765, 0.0943, 0.1392, 0.18415,
	0.23035, 0.2768, 0.3237, 0.37085, 0.4157, 0.46035, 0.5046, 0.5496, 0.5953, 0.6446, 0.7521, 0.9979
];
const QUANTILE_STEPS = SIMPLEX_QUANTILES.length - 1;

/** Raw simplex value → 0..1 with a uniform distribution (piecewise-linear inverse CDF). */
export function equalizeSimplex(raw: number): number {
	if (raw <= SIMPLEX_QUANTILES[0]) return 0;
	if (raw >= SIMPLEX_QUANTILES[QUANTILE_STEPS]) return 1;
	let lo = 0;
	let hi = QUANTILE_STEPS;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (SIMPLEX_QUANTILES[mid] <= raw) lo = mid;
		else hi = mid;
	}
	const a = SIMPLEX_QUANTILES[lo];
	const b = SIMPLEX_QUANTILES[hi];
	return (lo + (raw - a) / (b - a)) / QUANTILE_STEPS;
}

/**
 * Feature size of each climate field relative to the typical biome diameter. Temperature changes
 * slowest (cold ↔ hot is a long journey), moisture faster, rarity (variants) fastest. Tuned so a
 * running player meets a new biome every one to two minutes at Normal size (decision Q10).
 */
export const TEMPERATURE_SCALE_FACTOR = 13;
export const MOISTURE_SCALE_FACTOR = 10;
export const RARITY_SCALE_FACTOR = 3;
/** Domain warp strength, as a fraction of each field's own scale. */
const WARP_FRACTION = 0.18;

/** Real mountain ranges are this much colder at their core (snow on the ranges, not the hills). */
export const MOUNTAIN_COOLING = 0.14;
/** Elevation lapse: temperature falls by LAPSE_PER_METRE for each metre above LAPSE_START. */
export const LAPSE_START = 6;
export const LAPSE_PER_METRE = 0.004;

/**
 * Climate values are rounded to this grid before classification. Exact float results differ by
 * last-bit rounding between browser engines (see `determinismReport.ts`); rounding first means
 * that noise can only flip a decision where a value lies within ~1e-16 of a grid line, instead of
 * anywhere near a biome border.
 */
const CLIMATE_QUANTUM = 4096;

function quantize(value: number): number {
	return Math.round(value * CLIMATE_QUANTUM) / CLIMATE_QUANTUM;
}

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The gentle temperate window the spawn point is moved into (decision Q21). */
export const SPAWN_TEMPERATURE: readonly [number, number] = [0.38, 0.49];
export const SPAWN_MOISTURE: readonly [number, number] = [0.14, 0.6];
const SPAWN_SEARCH_ATTEMPTS = 256;
const SPAWN_SEARCH_RADIUS = 60_000;

/**
 * Seeded, deterministic climate: temperature, moisture and a rarity field for variant biomes.
 * Every noise generator is named (`climateTemperature`, `climateMoisture`, `biomeRarity`,
 * `climateWarpX/Z`) and distinct from every terrain and vegetation seed name, so climate never
 * correlates with landform except through the deliberate elevation lapse.
 *
 * `sample()` never allocates. The spawn guarantee moves the noise DOMAIN (an offset found once in
 * `setSeed`) rather than shifting values, so the equal-area distribution is kept everywhere.
 */
export class ClimateSampler {
	private readonly settings: BiomeSettings;
	private seed = '';
	private initialized = false;
	private sizeAtSeed = '';
	private spawnAtSeed = false;

	private temperatureNoise!: Noise2D;
	private moistureNoise!: Noise2D;
	private rarityNoise!: Noise2D;
	private warpXNoise!: Noise2D;
	private warpZNoise!: Noise2D;

	private offsetX = 0;
	private offsetZ = 0;

	constructor(settings: BiomeSettings) {
		this.settings = settings;
	}

	/** Rebuilds the noise and the spawn offset. Cheap to call repeatedly with the same inputs. */
	setSeed(seed: string): void {
		const settings = this.settings;
		if (
			this.initialized &&
			seed === this.seed &&
			this.sizeAtSeed === settings.size &&
			this.spawnAtSeed === settings.spawnTemperate
		) {
			return;
		}
		this.initialized = true;
		this.seed = seed;
		this.sizeAtSeed = settings.size;
		this.spawnAtSeed = settings.spawnTemperate;
		this.temperatureNoise = createNoise2D(createNamedRandom(seed, 'climateTemperature'));
		this.moistureNoise = createNoise2D(createNamedRandom(seed, 'climateMoisture'));
		this.rarityNoise = createNoise2D(createNamedRandom(seed, 'biomeRarity'));
		this.warpXNoise = createNoise2D(createNamedRandom(seed, 'climateWarpX'));
		this.warpZNoise = createNoise2D(createNamedRandom(seed, 'climateWarpZ'));
		this.offsetX = 0;
		this.offsetZ = 0;
		if (settings.spawnTemperate) this.findSpawnOffset(seed);
	}

	/** Typical biome diameter in metres, from the world's size choice. */
	private biomeScale(): number {
		return BIOME_SIZE_METRES[this.settings.size] ?? BIOME_SIZE_METRES.normal;
	}

	/** Temperature and moisture before bias and lapse, at a domain-space point. */
	private rawClimate(x: number, z: number, out: ClimateSample): void {
		const scale = this.biomeScale();
		const tScale = scale * TEMPERATURE_SCALE_FACTOR;
		const mScale = scale * MOISTURE_SCALE_FACTOR;
		const warpFreq = 1 / (tScale * 0.7);
		const wx = fbm2D(this.warpXNoise, x * warpFreq, z * warpFreq, 2, 2, 0.5, 0);
		const wz = fbm2D(this.warpZNoise, x * warpFreq, z * warpFreq, 2, 2, 0.5, 0);
		const tx = x + wx * tScale * WARP_FRACTION;
		const tz = z + wz * tScale * WARP_FRACTION;
		const mx = x + wz * mScale * WARP_FRACTION;
		const mz = z - wx * mScale * WARP_FRACTION;
		out.temperature = equalizeSimplex(this.temperatureNoise(tx / tScale, tz / tScale));
		out.moisture = equalizeSimplex(this.moistureNoise(mx / mScale + 41.3, mz / mScale - 17.9));
	}

	/**
	 * Searches seeded candidate domain offsets for one that puts the origin's raw climate in the
	 * temperate window. Deterministic: the candidates come from the seed alone.
	 */
	private findSpawnOffset(seed: string): void {
		const random = createMulberry32(hashStringToUint32(`${seed}::climateSpawn`));
		const probe: ClimateSample = { temperature: 0, moisture: 0, rarity: 0 };
		for (let attempt = 0; attempt < SPAWN_SEARCH_ATTEMPTS; attempt++) {
			const ox = attempt === 0 ? 0 : (random() * 2 - 1) * SPAWN_SEARCH_RADIUS;
			const oz = attempt === 0 ? 0 : (random() * 2 - 1) * SPAWN_SEARCH_RADIUS;
			this.rawClimate(ox, oz, probe);
			const t = probe.temperature + this.settings.temperatureBias;
			const m = probe.moisture + this.settings.moistureBias;
			if (
				t >= SPAWN_TEMPERATURE[0] &&
				t <= SPAWN_TEMPERATURE[1] &&
				m >= SPAWN_MOISTURE[0] &&
				m <= SPAWN_MOISTURE[1]
			) {
				this.offsetX = Math.round(ox);
				this.offsetZ = Math.round(oz);
				return;
			}
		}
	}

	/**
	 * Climate at a world point. `baseElevation` is the PRE-water, PRE-edit terrain height
	 * (`TerrainHeightSampler.sampleBase`), so neither rivers nor shovel edits change a biome.
	 * `mountain` is the point's mountain-range class weight (0..1), which cools it further.
	 */
	sample(
		worldX: number,
		worldZ: number,
		baseElevation: number,
		out: ClimateSample,
		mountain = 0
	): void {
		const x = worldX + this.offsetX;
		const z = worldZ + this.offsetZ;
		this.rawClimate(x, z, out);
		const lapse =
			Math.max(0, baseElevation - LAPSE_START) * LAPSE_PER_METRE + mountain * MOUNTAIN_COOLING;
		out.temperature = quantize(clamp01(out.temperature + this.settings.temperatureBias - lapse));
		out.moisture = quantize(clamp01(out.moisture + this.settings.moistureBias));
		const rScale = this.biomeScale() * RARITY_SCALE_FACTOR;
		out.rarity = quantize(equalizeSimplex(this.rarityNoise(x / rScale - 73.1, z / rScale + 29.4)));
	}

	/** The domain offset chosen for the spawn guarantee (tests and the debug overlay). */
	getSpawnOffset(): { x: number; z: number } {
		return { x: this.offsetX, z: this.offsetZ };
	}
}
