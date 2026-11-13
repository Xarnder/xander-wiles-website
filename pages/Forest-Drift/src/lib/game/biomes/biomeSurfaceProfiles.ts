import { BIOME_IDS, type BiomeId } from './BiomeTypes';

/**
 * What the GROUND and GRASS of each biome look like (Phase 1). Plain data, blended linearly
 * across borders by `BiomeSurface`. Colours are linear RGB, the same space as the existing terrain
 * palette in `terrain/terrainColor.ts` — Plains reproduces today's countryside exactly.
 *
 * Ground cover is four layers painted over the grass where a biome has bare ground:
 *   snow   — white, with drifts and sparkle (snowy biomes);
 *   sand   — pale and rippled (desert, a little in shrub savanna);
 *   soil   — dry red-tan earth and gravel (savanna family, windswept hills);
 *   litter — dark organic floor: leaves, needles, loam and swamp mud (forests, swamp).
 * Each amount is a base coverage 0..1; `patchiness` breaks it into patches with world-space noise,
 * so a 0.4 litter forest is part grass, part leaf litter, not a uniform brown-green.
 */
export interface BiomeSurfaceProfile {
	/** Grass colour on low ground (≈ height −4 m). */
	low: readonly [number, number, number];
	/** Grass colour on mid ground (≈ height +4 m and up). */
	mid: readonly [number, number, number];
	/** Warm meadow tint layered over the grass (procedural look). */
	warm: readonly [number, number, number];
	/** Dry-patch tint. */
	dry: readonly [number, number, number];
	/** Lush-patch tint. */
	lush: readonly [number, number, number];
	/** Small bare-earth specks. */
	earth: readonly [number, number, number];
	snow: number;
	sand: number;
	soil: number;
	litter: number;
	/** 0 = uniform cover, 1 = strongly patchy. */
	patchiness: number;
	/** Multiplies grass density (0 = none). */
	grassDensity: number;
	/** Multiplies tuft height. */
	grassHeight: number;
	/** Added to grass warmth (−1 cool … +1 warm/dry). */
	grassWarmth: number;
	/** Added to grass shortness (0 lush … 1 short and sparse). */
	grassShortness: number;
}

type Rgb = readonly [number, number, number];

/** Today's terrain constants (terrainColor.ts). Plains uses them unchanged. */
const LEGACY = {
	low: [0.12, 0.3, 0.045] as Rgb,
	mid: [0.22, 0.49, 0.075] as Rgb,
	warm: [0.24, 0.52, 0.045] as Rgb,
	dry: [0.42, 0.42, 0.2] as Rgb,
	lush: [0.1, 0.43, 0.045] as Rgb,
	earth: [0.3, 0.23, 0.15] as Rgb
};

function scale(c: Rgb, r: number, g: number, b: number): Rgb {
	return [c[0] * r, c[1] * g, c[2] * b];
}

/**
 * Derives a full grass palette from one mid colour, keeping today's ratios between the low/mid,
 * warm, lush and dry tints so every biome's variation reads like the original countryside.
 */
function palette(mid: Rgb, dry: Rgb = LEGACY.dry, earth: Rgb = LEGACY.earth) {
	return {
		low: scale(mid, 0.55, 0.61, 0.6),
		mid,
		warm: scale(mid, 1.09, 1.06, 0.6),
		dry,
		lush: scale(mid, 0.45, 0.88, 0.6),
		earth
	};
}

const NO_COVER = { snow: 0, sand: 0, soil: 0, litter: 0, patchiness: 0.5 };
const GRASS = { grassDensity: 1, grassHeight: 1, grassWarmth: 0, grassShortness: 0 };

const DRY_GOLD: Rgb = [0.52, 0.42, 0.17];
const RED_EARTH: Rgb = [0.42, 0.24, 0.13];
const DARK_LOAM: Rgb = [0.13, 0.1, 0.06];

const PROFILES: Record<BiomeId, BiomeSurfaceProfile> = {
	plains: { ...LEGACY, ...NO_COVER, ...GRASS },
	sunflowerPlains: {
		...palette([0.27, 0.5, 0.06]),
		...NO_COVER,
		...GRASS,
		grassWarmth: 0.15
	},
	forest: {
		...palette([0.16, 0.4, 0.07], LEGACY.dry, DARK_LOAM),
		...NO_COVER,
		litter: 0.35,
		...GRASS,
		grassDensity: 0.85,
		grassWarmth: -0.15
	},
	flowerForest: {
		...palette([0.2, 0.46, 0.08]),
		...NO_COVER,
		litter: 0.18,
		...GRASS,
		grassDensity: 0.9
	},
	birchForest: {
		...palette([0.26, 0.53, 0.1]),
		...NO_COVER,
		litter: 0.2,
		...GRASS,
		grassDensity: 0.95,
		grassHeight: 0.9
	},
	oldGrowthBirch: {
		...palette([0.19, 0.42, 0.1], LEGACY.dry, DARK_LOAM),
		...NO_COVER,
		litter: 0.38,
		patchiness: 0.6,
		...GRASS,
		grassDensity: 0.75,
		grassWarmth: -0.2
	},
	darkForest: {
		...palette([0.08, 0.22, 0.05], LEGACY.dry, DARK_LOAM),
		...NO_COVER,
		litter: 0.68,
		patchiness: 0.4,
		...GRASS,
		grassDensity: 0.35,
		grassHeight: 0.8,
		grassWarmth: -0.5,
		grassShortness: 0.25
	},
	silverwood: {
		...palette([0.3, 0.35, 0.3], [0.45, 0.45, 0.4], DARK_LOAM),
		...NO_COVER,
		litter: 0.45,
		...GRASS,
		grassDensity: 0.4,
		grassHeight: 0.8,
		grassWarmth: -0.4,
		grassShortness: 0.2
	},
	sunlitWood: {
		...palette([0.29, 0.53, 0.08]),
		...NO_COVER,
		litter: 0.2,
		patchiness: 0.75,
		...GRASS,
		grassWarmth: 0.15
	},
	taiga: {
		...palette([0.13, 0.29, 0.1], [0.36, 0.34, 0.2], [0.24, 0.16, 0.1]),
		...NO_COVER,
		litter: 0.55,
		...GRASS,
		grassDensity: 0.55,
		grassHeight: 0.85,
		grassWarmth: -0.35,
		grassShortness: 0.3
	},
	snowyTaiga: {
		...palette([0.15, 0.29, 0.14], [0.36, 0.34, 0.24]),
		...NO_COVER,
		snow: 0.85,
		litter: 0.15,
		patchiness: 0.45,
		...GRASS,
		grassDensity: 0.25,
		grassHeight: 0.7,
		grassWarmth: -0.5,
		grassShortness: 0.6
	},
	jungle: {
		...palette([0.06, 0.36, 0.04], LEGACY.dry, DARK_LOAM),
		...NO_COVER,
		litter: 0.3,
		...GRASS,
		grassDensity: 1,
		grassHeight: 1.35,
		grassWarmth: -0.2
	},
	sparseJungle: {
		...palette([0.1, 0.42, 0.05]),
		...NO_COVER,
		litter: 0.12,
		...GRASS,
		grassHeight: 1.25
	},
	bambooJungle: {
		...palette([0.12, 0.42, 0.06], LEGACY.dry, DARK_LOAM),
		...NO_COVER,
		litter: 0.4,
		...GRASS,
		grassDensity: 0.8,
		grassHeight: 1.2
	},
	meadow: {
		...palette([0.25, 0.56, 0.08]),
		...NO_COVER,
		...GRASS,
		grassHeight: 1.15
	},
	cherryGrove: {
		...palette([0.27, 0.53, 0.1]),
		...NO_COVER,
		litter: 0.12,
		...GRASS,
		grassHeight: 1.05
	},
	grove: {
		...palette([0.14, 0.29, 0.15], [0.36, 0.35, 0.26]),
		...NO_COVER,
		snow: 0.75,
		patchiness: 0.5,
		...GRASS,
		grassDensity: 0.3,
		grassHeight: 0.7,
		grassWarmth: -0.5,
		grassShortness: 0.6
	},
	snowySlopes: {
		...palette([0.2, 0.3, 0.2], [0.4, 0.4, 0.34]),
		...NO_COVER,
		snow: 1,
		patchiness: 0.25,
		...GRASS,
		grassDensity: 0.05,
		grassHeight: 0.6,
		grassWarmth: -0.6,
		grassShortness: 0.9
	},
	windsweptHills: {
		...palette([0.25, 0.36, 0.16], [0.42, 0.4, 0.28], [0.32, 0.28, 0.22]),
		...NO_COVER,
		soil: 0.3,
		patchiness: 0.7,
		...GRASS,
		grassDensity: 0.65,
		grassHeight: 0.7,
		grassWarmth: 0.2,
		grassShortness: 0.5
	},
	snowyPlains: {
		...palette([0.2, 0.32, 0.18], [0.4, 0.4, 0.32]),
		...NO_COVER,
		snow: 0.95,
		patchiness: 0.35,
		...GRASS,
		grassDensity: 0.12,
		grassHeight: 0.6,
		grassWarmth: -0.5,
		grassShortness: 0.8
	},
	desert: {
		...palette([0.42, 0.4, 0.18], [0.6, 0.5, 0.3], [0.55, 0.42, 0.26]),
		...NO_COVER,
		sand: 1,
		patchiness: 0.2,
		...GRASS,
		grassDensity: 0.03,
		grassHeight: 0.6,
		grassWarmth: 1,
		grassShortness: 0.8
	},
	savanna: {
		...palette([0.48, 0.42, 0.13], DRY_GOLD, RED_EARTH),
		...NO_COVER,
		soil: 0.2,
		patchiness: 0.65,
		...GRASS,
		grassDensity: 0.9,
		grassHeight: 1.3,
		grassWarmth: 0.8
	},
	savannaPlateau: {
		...palette([0.45, 0.36, 0.12], DRY_GOLD, RED_EARTH),
		...NO_COVER,
		soil: 0.4,
		patchiness: 0.6,
		...GRASS,
		grassDensity: 0.75,
		grassHeight: 1.15,
		grassWarmth: 0.85
	},
	swamp: {
		...palette([0.11, 0.25, 0.07], [0.3, 0.3, 0.16], DARK_LOAM),
		...NO_COVER,
		litter: 0.55,
		patchiness: 0.55,
		...GRASS,
		grassDensity: 0.9,
		grassHeight: 1.3,
		grassWarmth: -0.3
	},
	shrubSavanna: {
		...palette([0.5, 0.42, 0.2], [0.56, 0.46, 0.26], RED_EARTH),
		...NO_COVER,
		soil: 0.55,
		sand: 0.15,
		patchiness: 0.6,
		...GRASS,
		grassDensity: 0.4,
		grassHeight: 0.75,
		grassWarmth: 0.9,
		grassShortness: 0.5
	},
	tropicalDryGrassland: {
		...palette([0.36, 0.5, 0.1], [0.5, 0.46, 0.18]),
		...NO_COVER,
		...GRASS,
		grassDensity: 1,
		grassHeight: 1.4,
		grassWarmth: 0.45
	}
};

/** Index-aligned with BIOME_IDS. */
export const BIOME_SURFACE_PROFILES: readonly BiomeSurfaceProfile[] = BIOME_IDS.map(
	(id) => PROFILES[id]
);

/**
 * Flat vector layout for fast, allocation-free blending. Every profile is packed into
 * `PROFILE_STRIDE` floats; `BiomeSurface` blends the packed rows by biome weight.
 */
export const P = {
	low: 0,
	mid: 3,
	warm: 6,
	dry: 9,
	lush: 12,
	earth: 15,
	snow: 18,
	sand: 19,
	soil: 20,
	litter: 21,
	patchiness: 22,
	grassDensity: 23,
	grassHeight: 24,
	grassWarmth: 25,
	grassShortness: 26
} as const;
export const PROFILE_STRIDE = 27;

export const PACKED_SURFACE_PROFILES: Float32Array = (() => {
	const out = new Float32Array(BIOME_IDS.length * PROFILE_STRIDE);
	BIOME_SURFACE_PROFILES.forEach((p, i) => {
		const o = i * PROFILE_STRIDE;
		out.set(p.low, o + P.low);
		out.set(p.mid, o + P.mid);
		out.set(p.warm, o + P.warm);
		out.set(p.dry, o + P.dry);
		out.set(p.lush, o + P.lush);
		out.set(p.earth, o + P.earth);
		out[o + P.snow] = p.snow;
		out[o + P.sand] = p.sand;
		out[o + P.soil] = p.soil;
		out[o + P.litter] = p.litter;
		out[o + P.patchiness] = p.patchiness;
		out[o + P.grassDensity] = p.grassDensity;
		out[o + P.grassHeight] = p.grassHeight;
		out[o + P.grassWarmth] = p.grassWarmth;
		out[o + P.grassShortness] = p.grassShortness;
	});
	return out;
})();

/**
 * Colours of the four ground-cover layers (linear RGB): the vertex-colour approximation used in
 * the flat-materials look and far away. The procedural shader layer (`surfaceShader.ts`, GROUND)
 * adds per-pixel detail around these same averages.
 */
export const GROUND_LAYER_RGB = {
	snow: [0.9, 0.92, 0.96] as Rgb,
	sand: [0.73, 0.57, 0.35] as Rgb,
	soil: [0.44, 0.27, 0.15] as Rgb,
	litter: [0.16, 0.115, 0.07] as Rgb
};
