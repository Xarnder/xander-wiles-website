/**
 * Biome configuration and identity types. Framework-, DOM- and Three.js-free like every other
 * `*Types.ts` file. See `docs/2026/11-12/Biomes-and-Enviroments/feature-plan/02-technical-plan.md`.
 *
 * Naming: `TerrainSettings.biome` is the older LANDFORM mask (plains / hills / highlands /
 * mountains — the shape of the ground). A BIOME here is what grows and lives on that ground
 * (Snowy Taiga, Desert, Jungle …), chosen from a seeded climate plus the landform and elevation.
 * Biomes never change terrain height.
 */

/** Bump when classification changes which biome a seed produces where. Saved per world. */
export const BIOME_GENERATOR_VERSION = 1;

/**
 * Index order is runtime data (lattice tiles store weights by index, the determinism report hashes
 * indices) — append, never reorder or remove.
 */
export const BIOME_IDS = [
	'forest',
	'flowerForest',
	'birchForest',
	'oldGrowthBirch',
	'darkForest',
	'silverwood',
	'sunlitWood',
	'taiga',
	'snowyTaiga',
	'jungle',
	'sparseJungle',
	'bambooJungle',
	'meadow',
	'cherryGrove',
	'grove',
	'snowySlopes',
	'windsweptHills',
	'plains',
	'sunflowerPlains',
	'snowyPlains',
	'desert',
	'savanna',
	'savannaPlateau',
	'swamp',
	'shrubSavanna',
	'tropicalDryGrassland'
] as const;

export type BiomeId = (typeof BIOME_IDS)[number];

export const BIOME_COUNT = BIOME_IDS.length;

/** Composition groups (decision Q14). */
export type BiomeGroup = 'temperate' | 'cold' | 'warmDry' | 'tropical' | 'swamp';

export const BIOME_GROUPS: readonly BiomeGroup[] = [
	'temperate',
	'cold',
	'warmDry',
	'tropical',
	'swamp'
];

/** Which landform class a climate box applies to. Lowland = plains + rolling hills. */
export type LandformClass = 'lowland' | 'highland' | 'mountain';

/** A rectangle in (temperature, moisture) space, both 0..1, on one landform class. */
export interface ClimateBox {
	landform: LandformClass;
	temperature: readonly [number, number];
	moisture: readonly [number, number];
}

export interface BiomeDefinition {
	id: BiomeId;
	/** Display name (decision Q2: Forest Drift's own look; two names are its own). */
	name: string;
	group: BiomeGroup;
	/**
	 * Base biomes partition climate space per landform class with these boxes. Overlay biomes
	 * (variants and swamp) leave this empty and use `overlay` instead.
	 */
	boxes: readonly ClimateBox[];
	overlay?: BiomeOverlay;
	/** Flat colour for the "Biome map" debug view, `#RRGGBB`. */
	debugColor: string;
}

/**
 * An overlay takes a share of other biomes' weight where its condition holds.
 * - `variant`: replaces part of one parent biome, where the rarity field is high (decision Q12).
 * - `lowWet`: takes over any base biome in its climate box on low, flat lowland (swamp, Q16).
 */
export type BiomeOverlay =
	| { kind: 'variant'; parent: BiomeId }
	| {
			kind: 'lowWet';
			temperature: readonly [number, number];
			moisture: readonly [number, number];
			/** Fades out between these base elevations, metres. */
			maxElevation: readonly [number, number];
	  };

/** Biome size (decision Q10 / Q23). The value is the typical biome diameter in metres. */
export type BiomeSize = 'small' | 'normal' | 'large';

export const BIOME_SIZE_METRES: Readonly<Record<BiomeSize, number>> = {
	small: 450,
	normal: 750,
	large: 1500
};

/**
 * Saved in the world (`environment.biomes`). Generation-defining, so it belongs to the "land"
 * settings that are locked in online worlds.
 */
export interface BiomeSettings {
	enabled: boolean;
	/** BIOME_GENERATOR_VERSION when the world was created. */
	generatorVersion: number;
	size: BiomeSize;
	/** Shifts the whole world warmer (+) or colder (−). */
	temperatureBias: number;
	/** Shifts the whole world wetter (+) or drier (−). */
	moistureBias: number;
	/** Share of a parent biome taken by its variant (Flower Forest, Cherry Grove …). */
	variantRarity: number;
	/** Higher = narrower borders between biomes. */
	borderSharpness: number;
	/** Keep the spawn point (world origin) in gentle temperate climate (decision Q21). */
	spawnTemperate: boolean;
}

export const BIOME_SETTING_LIMITS = {
	temperatureBias: [-0.3, 0.3],
	moistureBias: [-0.3, 0.3],
	variantRarity: [0, 0.4],
	borderSharpness: [1, 6]
} as const;

/** Settings for a brand-new world: biomes on. */
export function createDefaultBiomeSettings(size: BiomeSize = 'normal'): BiomeSettings {
	return {
		enabled: true,
		generatorVersion: BIOME_GENERATOR_VERSION,
		size,
		temperatureBias: 0,
		moistureBias: 0,
		variantRarity: 0.15,
		borderSharpness: 3,
		spawnTemperate: true
	};
}

/**
 * Settings for a world saved before biomes existed (decision Q6): identical values, but off, so the
 * world keeps looking exactly as it did. The owner may switch biomes on later in a local world.
 */
export function createLegacyBiomeSettings(): BiomeSettings {
	return { ...createDefaultBiomeSettings(), enabled: false };
}

function clampNumber(value: unknown, [lo, hi]: readonly [number, number], fallback: number) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(hi, Math.max(lo, value));
}

/**
 * A safe, fully-populated copy of untrusted biome settings (imports, online snapshots, storage).
 * Unknown keys are dropped; numbers are finite and clamped; an unknown size becomes `normal`.
 * Returns null only when `enabled` itself isn't a boolean (the one thing that must not be guessed).
 */
export function sanitizeBiomeSettings(value: unknown): BiomeSettings | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const v = value as Record<string, unknown>;
	if (typeof v.enabled !== 'boolean') return null;
	const base = createDefaultBiomeSettings();
	const size =
		typeof v.size === 'string' && Object.prototype.hasOwnProperty.call(BIOME_SIZE_METRES, v.size)
			? (v.size as BiomeSize)
			: base.size;
	const generatorVersion =
		typeof v.generatorVersion === 'number' &&
		Number.isSafeInteger(v.generatorVersion) &&
		v.generatorVersion >= 1
			? v.generatorVersion
			: base.generatorVersion;
	return {
		enabled: v.enabled,
		generatorVersion,
		size,
		temperatureBias: clampNumber(
			v.temperatureBias,
			BIOME_SETTING_LIMITS.temperatureBias,
			base.temperatureBias
		),
		moistureBias: clampNumber(v.moistureBias, BIOME_SETTING_LIMITS.moistureBias, base.moistureBias),
		variantRarity: clampNumber(
			v.variantRarity,
			BIOME_SETTING_LIMITS.variantRarity,
			base.variantRarity
		),
		borderSharpness: clampNumber(
			v.borderSharpness,
			BIOME_SETTING_LIMITS.borderSharpness,
			base.borderSharpness
		),
		spawnTemperate: typeof v.spawnTemperate === 'boolean' ? v.spawnTemperate : base.spawnTemperate
	};
}

/** A blend of biomes at one point: weights over every biome (index-aligned with BIOME_IDS), summing to 1. */
export type BiomeWeightVector = Float32Array;

export function createBiomeWeightVector(): BiomeWeightVector {
	return new Float32Array(BIOME_COUNT);
}

/**
 * How much of a point is lowland, upland (highlands) and real mountain range. Sums to 1. Derived from
 * the landform mask in `BiomeClassifier.landformClasses`, with broader, contiguous bands than the
 * terrain's own four-way landform weights (which pack four classes into rings a few hundred metres
 * wide, and call flat ground "mountains" where no range actually rises).
 */
export interface LandformClassWeights {
	lowland: number;
	highland: number;
	mountain: number;
}

export function createLandformClassWeights(): LandformClassWeights {
	return { lowland: 1, highland: 0, mountain: 0 };
}

/** Climate inputs at a point, all 0..1 (temperature already includes the elevation lapse). */
export interface ClimateSample {
	temperature: number;
	moisture: number;
	rarity: number;
}

export function createClimateSample(): ClimateSample {
	return { temperature: 0.5, moisture: 0.5, rarity: 0 };
}
