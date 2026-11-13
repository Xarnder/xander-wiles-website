import { BIOME_IDS, type BiomeId } from '../../biomes/BiomeTypes';
import type { BodyPlanId, CreaturePatternType } from '../CreatureTypes';

/**
 * What creatures look like in each biome (biome-specific creatures, decisions Q2, Q5, Q13): natural,
 * earthy body colours from the biome's range, one brighter accent per species, and the patterns and
 * coat that suit the place. One profile per biome plus `neutral` (worlds with biomes off, Q6), built
 * from a few shared families like the other biome profile tables.
 *
 * Colours are OKLCh (see `oklch.ts`): `h` hue in degrees, `c` chroma, `l` perceptual lightness. A
 * profile gives body hues and a lightness range; each regional species takes its own step of that
 * range (Q3), so the six species of a region never share a lightness.
 */
export type CreatureBiomeProfileId = BiomeId | 'neutral';
export const CREATURE_BIOME_PROFILE_IDS: readonly CreatureBiomeProfileId[] = [
	'neutral',
	...BIOME_IDS
];

/**
 * Patterns a profile can ask for. The last five are drawn by the shader from Phase 3; until then
 * they fall back to the nearest existing pattern (`PLANNED_PATTERN_FALLBACK`).
 */
export type CreatureCoatPattern =
	| Exclude<CreaturePatternType, 'underbelly'>
	| 'rosettes'
	| 'reticulated'
	| 'patches'
	| 'speckle'
	| 'saddle';

export interface BodyColour {
	/** OKLCh hue, degrees. */
	h: number;
	/** OKLCh chroma (natural bodies stay low: ≤ ~0.12). */
	c: number;
	weight: number;
}
export interface AccentColour {
	h: number;
	c: number;
	l: number;
}
export interface CreatureBiomeProfile {
	family: 'neutral' | 'temperateForest' | 'openTemperate' | 'cold' | 'tropical' | 'warmDry' | 'wet';
	bodies: readonly BodyColour[];
	/** OKLab lightness range for bodies, split into six steps (one per regional species). */
	lightness: readonly [number, number];
	/** Pale underside: hue and chroma; lightness is the body's plus `lift`. */
	underside: { h: number; c: number; lift: number };
	/** At least three, so species sharing an accent are far apart in lightness. */
	accents: readonly AccentColour[];
	/** Pattern weights before the body plan's own leaning (`PLAN_PATTERN_LEAN`). */
	patterns: readonly (readonly [CreatureCoatPattern, number])[];
	/** Multiplies pattern contrast (subtle in snow, bold in the jungle). */
	patternContrast: number;
	/** Coat: thickness and length of fur (0..1), gloss (0 matte … 1 wet), and how often a furred body plan gets bare hide, scales or skin instead. */
	coat: { thickness: number; length: number; gloss: number; bare: number };
}

// ---------------------------------------------------------------------------------- colours
const body = (h: number, c: number, weight = 1): BodyColour => ({ h, c, weight });
const accent = (h: number, c: number, l: number): AccentColour => ({ h, c, l });
const A = {
	russet: accent(40, 0.13, 0.55),
	ochre: accent(75, 0.12, 0.68),
	petalPink: accent(350, 0.12, 0.72),
	violet: accent(305, 0.12, 0.55),
	butter: accent(100, 0.13, 0.88),
	charcoal: accent(250, 0.012, 0.3),
	black: accent(250, 0.006, 0.22),
	moss: accent(125, 0.09, 0.5),
	amber: accent(70, 0.14, 0.72),
	paleGold: accent(95, 0.1, 0.85),
	silverBlue: accent(240, 0.05, 0.78),
	frost: accent(220, 0.015, 0.95),
	leaf: accent(135, 0.13, 0.65),
	honey: accent(80, 0.13, 0.75),
	cornflower: accent(265, 0.13, 0.62),
	poppy: accent(30, 0.18, 0.58),
	blossom: accent(355, 0.1, 0.8),
	white: accent(90, 0.006, 0.96),
	rust: accent(45, 0.13, 0.52),
	sunflower: accent(95, 0.16, 0.85),
	deepBrown: accent(55, 0.06, 0.32),
	iceBlue: accent(225, 0.06, 0.86),
	scarlet: accent(28, 0.2, 0.58),
	gold: accent(85, 0.15, 0.78),
	teal: accent(190, 0.11, 0.6),
	orange: accent(55, 0.16, 0.7),
	jade: accent(165, 0.12, 0.65),
	turquoise: accent(195, 0.11, 0.72),
	burntOrange: accent(48, 0.15, 0.6),
	ochreRed: accent(35, 0.14, 0.5),
	cream: accent(90, 0.03, 0.92),
	sulphur: accent(105, 0.15, 0.86),
	red: accent(28, 0.17, 0.55),
	slateBlue: accent(255, 0.06, 0.55)
} as const;
const UNDER = {
	cream: { h: 85, c: 0.03, lift: 0.2 },
	warmCream: { h: 75, c: 0.04, lift: 0.2 },
	whiteCream: { h: 90, c: 0.015, lift: 0.22 },
	ivory: { h: 95, c: 0.02, lift: 0.22 },
	dun: { h: 75, c: 0.04, lift: 0.18 },
	paleGrey: { h: 230, c: 0.01, lift: 0.2 },
	blush: { h: 40, c: 0.03, lift: 0.2 },
	buff: { h: 80, c: 0.05, lift: 0.18 },
	lightGrey: { h: 250, c: 0.008, lift: 0.2 },
	grey: { h: 250, c: 0.01, lift: 0.16 },
	oat: { h: 85, c: 0.04, lift: 0.2 },
	yellowCream: { h: 95, c: 0.06, lift: 0.22 },
	white: { h: 95, c: 0.006, lift: 0.24 },
	bone: { h: 90, c: 0.02, lift: 0.18 },
	sand: { h: 85, c: 0.05, lift: 0.16 },
	muddyCream: { h: 90, c: 0.035, lift: 0.18 }
} as const;

// ---------------------------------------------------------------------------------- families
type Profile = CreatureBiomeProfile;
const temperateForest: Profile = {
	family: 'temperateForest',
	bodies: [body(105, 0.05), body(50, 0.08), body(70, 0.018)],
	lightness: [0.36, 0.72],
	underside: UNDER.warmCream,
	accents: [A.russet, A.ochre, A.moss],
	patterns: [
		['spots', 3],
		['back-stripe', 2],
		['mottled', 2],
		['dorsal-spots', 1],
		['solid', 1]
	],
	patternContrast: 0.9,
	coat: { thickness: 0.5, length: 0.45, gloss: 0.05, bare: 0.1 }
};
const openTemperate: Profile = {
	family: 'openTemperate',
	bodies: [body(85, 0.06), body(70, 0.05), body(120, 0.04)],
	lightness: [0.48, 0.84],
	underside: UNDER.cream,
	accents: [A.rust, A.black, A.cornflower],
	patterns: [
		['speckle', 2],
		['gradient', 2],
		['back-stripe', 2],
		['limb-bands', 1],
		['solid', 1]
	],
	patternContrast: 0.85,
	coat: { thickness: 0.35, length: 0.3, gloss: 0.05, bare: 0.15 }
};
const cold: Profile = {
	family: 'cold',
	bodies: [body(60, 0.035), body(250, 0.02), body(70, 0.012)],
	lightness: [0.34, 0.8],
	underside: UNDER.buff,
	accents: [A.rust, A.white, A.iceBlue],
	patterns: [
		['mottled', 3],
		['back-stripe', 2],
		['patches', 1],
		['solid', 1]
	],
	patternContrast: 0.75,
	coat: { thickness: 0.85, length: 0.7, gloss: 0, bare: 0 }
};
const tropical: Profile = {
	family: 'tropical',
	bodies: [body(150, 0.08), body(155, 0.05), body(50, 0.08)],
	lightness: [0.3, 0.66],
	underside: UNDER.yellowCream,
	accents: [A.scarlet, A.gold, A.teal],
	patterns: [
		['rosettes', 3],
		['stripes', 2],
		['reticulated', 2],
		['spots', 1]
	],
	patternContrast: 1.15,
	coat: { thickness: 0.3, length: 0.25, gloss: 0.25, bare: 0.25 }
};
const warmDry: Profile = {
	family: 'warmDry',
	bodies: [body(80, 0.07), body(70, 0.1), body(45, 0.11)],
	lightness: [0.48, 0.84],
	underside: UNDER.cream,
	accents: [A.black, A.ochreRed, A.burntOrange],
	patterns: [
		['spots', 2],
		['stripes', 2],
		['bands', 2],
		['saddle', 1],
		['speckle', 1]
	],
	patternContrast: 0.95,
	coat: { thickness: 0.3, length: 0.2, gloss: 0.05, bare: 0.3 }
};
const wet: Profile = {
	family: 'wet',
	bodies: [body(110, 0.06), body(60, 0.05), body(160, 0.03)],
	lightness: [0.28, 0.6],
	underside: UNDER.muddyCream,
	accents: [A.sulphur, A.red, A.teal],
	patterns: [
		['mottled', 3],
		['dorsal-spots', 2],
		['reticulated', 2],
		['bands', 1]
	],
	patternContrast: 0.9,
	coat: { thickness: 0.25, length: 0.2, gloss: 0.55, bare: 0.6 }
};

const make = (family: Profile, overrides: Partial<Profile>): Profile => ({
	...family,
	...overrides,
	coat: { ...family.coat, ...overrides.coat }
});

/** Every biome and `neutral`, in `CREATURE_BIOME_PROFILE_IDS` order. Locked table: technical plan §5. */
const PROFILES: Record<CreatureBiomeProfileId, Profile> = {
	neutral: make(temperateForest, {
		family: 'neutral',
		bodies: [body(75, 0.06), body(50, 0.08), body(105, 0.05), body(250, 0.015)],
		lightness: [0.38, 0.76],
		underside: UNDER.cream,
		accents: [A.russet, A.ochre, A.slateBlue],
		patterns: [
			['spots', 2],
			['back-stripe', 2],
			['mottled', 2],
			['bands', 1],
			['solid', 1]
		]
	}),
	forest: make(temperateForest, {
		patterns: [
			['spots', 3],
			['back-stripe', 2],
			['mottled', 2]
		]
	}),
	flowerForest: make(temperateForest, {
		bodies: [body(75, 0.05), body(115, 0.045)],
		lightness: [0.42, 0.78],
		underside: UNDER.cream,
		accents: [A.petalPink, A.violet, A.butter],
		patterns: [
			['speckle', 3],
			['spots', 2],
			['solid', 1]
		],
		coat: { thickness: 0.5, length: 0.45, gloss: 0.05, bare: 0.1 }
	}),
	birchForest: make(temperateForest, {
		bodies: [body(230, 0.012), body(80, 0.015), body(75, 0.04)],
		lightness: [0.5, 0.86],
		underside: UNDER.whiteCream,
		accents: [A.charcoal, A.black, A.moss],
		patterns: [
			['bands', 3],
			['speckle', 2],
			['solid', 1]
		],
		coat: { thickness: 0.35, length: 0.3, gloss: 0.05, bare: 0.1 }
	}),
	oldGrowthBirch: make(temperateForest, {
		bodies: [body(220, 0.01), body(70, 0.03)],
		lightness: [0.46, 0.84],
		underside: UNDER.ivory,
		accents: [A.charcoal, A.moss, A.black],
		patterns: [
			['bands', 2],
			['patches', 2],
			['solid', 1]
		],
		coat: { thickness: 0.55, length: 0.6, gloss: 0.05, bare: 0.05 }
	}),
	darkForest: make(temperateForest, {
		bodies: [body(55, 0.05), body(150, 0.035)],
		lightness: [0.26, 0.58],
		underside: UNDER.dun,
		accents: [A.amber, A.paleGold, A.russet],
		patterns: [
			['mottled', 3],
			['dorsal-spots', 2],
			['solid', 1]
		],
		coat: { thickness: 0.75, length: 0.6, gloss: 0.05, bare: 0.05 }
	}),
	silverwood: make(temperateForest, {
		bodies: [body(200, 0.01), body(140, 0.03)],
		lightness: [0.44, 0.8],
		underside: UNDER.paleGrey,
		accents: [A.silverBlue, A.frost, A.charcoal],
		patterns: [
			['reticulated', 3],
			['mottled', 2],
			['solid', 1]
		],
		patternContrast: 0.75,
		coat: { thickness: 0.4, length: 0.35, gloss: 0.1, bare: 0.05 }
	}),
	sunlitWood: make(temperateForest, {
		bodies: [body(80, 0.08), body(55, 0.08)],
		lightness: [0.44, 0.8],
		underside: UNDER.cream,
		accents: [A.leaf, A.honey, A.russet],
		patterns: [
			['spots', 3],
			['saddle', 2],
			['back-stripe', 1]
		],
		coat: { thickness: 0.35, length: 0.3, gloss: 0.05, bare: 0.1 }
	}),
	taiga: make(cold, {
		bodies: [body(60, 0.035), body(250, 0.02), body(70, 0.012)],
		lightness: [0.3, 0.68],
		accents: [A.rust, A.white, A.ochre]
	}),
	snowyTaiga: make(cold, {
		bodies: [body(65, 0.025), body(240, 0.012), body(90, 0.006)],
		lightness: [0.4, 0.92],
		underside: UNDER.paleGrey,
		accents: [A.white, A.iceBlue, A.charcoal],
		patterns: [
			['patches', 3],
			['dorsal-spots', 2],
			['solid', 1]
		],
		patternContrast: 0.7,
		coat: { thickness: 1, length: 0.9, gloss: 0, bare: 0 }
	}),
	snowyPlains: make(cold, {
		bodies: [body(90, 0.006), body(245, 0.012), body(60, 0.03)],
		lightness: [0.4, 0.93],
		underside: UNDER.lightGrey,
		accents: [A.white, A.black, A.iceBlue],
		patterns: [
			['patches', 3],
			['gradient', 2],
			['solid', 1]
		],
		patternContrast: 0.7,
		coat: { thickness: 1, length: 0.9, gloss: 0, bare: 0 }
	}),
	grove: make(cold, {
		bodies: [body(250, 0.02), body(60, 0.035)],
		lightness: [0.28, 0.66],
		accents: [A.white, A.rust, A.iceBlue],
		patterns: [
			['mottled', 3],
			['speckle', 2],
			['solid', 1]
		]
	}),
	snowySlopes: make(cold, {
		bodies: [body(90, 0.006), body(250, 0.012), body(55, 0.035)],
		lightness: [0.3, 0.92],
		underside: UNDER.grey,
		accents: [A.white, A.iceBlue, A.charcoal],
		patterns: [
			['patches', 3],
			['saddle', 2],
			['solid', 1]
		],
		patternContrast: 0.7,
		coat: { thickness: 1, length: 0.9, gloss: 0, bare: 0 }
	}),
	windsweptHills: make(cold, {
		bodies: [body(330, 0.02), body(60, 0.045)],
		lightness: [0.32, 0.7],
		underside: UNDER.oat,
		accents: [A.rust, A.moss, A.cream],
		patterns: [
			['mottled', 3],
			['back-stripe', 2],
			['solid', 1]
		],
		coat: { thickness: 0.8, length: 0.85, gloss: 0, bare: 0.05 }
	}),
	jungle: make(tropical, {}),
	sparseJungle: make(tropical, {
		bodies: [body(115, 0.07), body(70, 0.1)],
		lightness: [0.36, 0.72],
		underside: UNDER.cream,
		accents: [A.orange, A.teal, A.scarlet],
		patterns: [
			['rosettes', 3],
			['spots', 2],
			['solid', 1]
		],
		patternContrast: 1.05,
		coat: { thickness: 0.3, length: 0.25, gloss: 0.15, bare: 0.2 }
	}),
	bambooJungle: make(tropical, {
		bodies: [body(135, 0.07), body(90, 0.006), body(250, 0.008)],
		lightness: [0.24, 0.9],
		underside: UNDER.white,
		accents: [A.jade, A.gold, A.black],
		patterns: [
			['patches', 3],
			['bands', 2],
			['solid', 1]
		],
		patternContrast: 1.2,
		coat: { thickness: 0.5, length: 0.45, gloss: 0.05, bare: 0.05 }
	}),
	meadow: make(openTemperate, {
		bodies: [body(85, 0.06), body(65, 0.05), body(130, 0.035)],
		accents: [A.cornflower, A.poppy, A.rust],
		patterns: [
			['speckle', 3],
			['gradient', 2],
			['solid', 1]
		]
	}),
	cherryGrove: make(openTemperate, {
		bodies: [body(50, 0.015), body(20, 0.045)],
		lightness: [0.44, 0.82],
		underside: UNDER.blush,
		accents: [A.blossom, A.white, A.charcoal],
		patterns: [
			['patches', 3],
			['speckle', 2],
			['solid', 1]
		]
	}),
	plains: make(openTemperate, {
		bodies: [body(85, 0.07), body(70, 0.06), body(80, 0.04)],
		accents: [A.rust, A.black, A.ochre],
		patterns: [
			['back-stripe', 3],
			['saddle', 2],
			['limb-bands', 2],
			['solid', 1]
		]
	}),
	sunflowerPlains: make(openTemperate, {
		bodies: [body(75, 0.08), body(60, 0.07)],
		lightness: [0.42, 0.8],
		accents: [A.sunflower, A.deepBrown, A.rust],
		patterns: [
			['saddle', 3],
			['bands', 2],
			['solid', 1]
		]
	}),
	desert: make(warmDry, {
		bodies: [body(85, 0.06, 2), body(75, 0.1), body(45, 0.11)],
		lightness: [0.5, 0.88],
		underside: UNDER.bone,
		accents: [A.turquoise, A.burntOrange, A.black],
		patterns: [
			['bands', 3],
			['speckle', 2],
			['saddle', 2],
			['solid', 1]
		],
		patternContrast: 0.8,
		coat: { thickness: 0.15, length: 0.1, gloss: 0.1, bare: 0.6 }
	}),
	savanna: make(warmDry, {
		bodies: [body(80, 0.1), body(70, 0.11), body(50, 0.1)],
		lightness: [0.42, 0.8],
		accents: [A.black, A.ochreRed, A.cream],
		patterns: [
			['spots', 3],
			['stripes', 2],
			['reticulated', 2]
		],
		coat: { thickness: 0.3, length: 0.2, gloss: 0.05, bare: 0.2 }
	}),
	savannaPlateau: make(warmDry, {
		bodies: [body(45, 0.1), body(40, 0.11)],
		lightness: [0.36, 0.72],
		underside: UNDER.buff,
		accents: [A.black, A.cream, A.ochre],
		patterns: [
			['bands', 3],
			['saddle', 2],
			['solid', 1]
		],
		coat: { thickness: 0.3, length: 0.2, gloss: 0.05, bare: 0.25 }
	}),
	shrubSavanna: make(warmDry, {
		bodies: [body(70, 0.03), body(100, 0.04)],
		lightness: [0.4, 0.76],
		underside: UNDER.sand,
		accents: [A.rust, A.black, A.ochre],
		patterns: [
			['speckle', 3],
			['back-stripe', 2],
			['solid', 1]
		],
		coat: { thickness: 0.35, length: 0.3, gloss: 0, bare: 0.3 }
	}),
	tropicalDryGrassland: make(warmDry, {
		bodies: [body(85, 0.09), body(70, 0.07)],
		lightness: [0.46, 0.84],
		accents: [A.burntOrange, A.black, A.rust],
		patterns: [
			['stripes', 3],
			['limb-bands', 2],
			['solid', 1]
		],
		coat: { thickness: 0.3, length: 0.25, gloss: 0.05, bare: 0.2 }
	}),
	swamp: make(wet, {})
};

export const CREATURE_BIOME_PROFILES: Readonly<Record<CreatureBiomeProfileId, Profile>> = PROFILES;

export function creatureBiomeProfile(id: CreatureBiomeProfileId): CreatureBiomeProfile {
	return PROFILES[id];
}

/** How each body plan leans inside a profile's pattern weights (serpents: bands; insects: segments). */
export const PLAN_PATTERN_LEAN: Readonly<
	Record<BodyPlanId, Partial<Record<CreatureCoatPattern, number>>>
> = {
	quadruped: { 'limb-bands': 0.8 },
	biped: { mottled: 1.2, gradient: 1.2 },
	hexapod: { bands: 1.6, 'dorsal-spots': 1.4, mottled: 0.6, rosettes: 0.5, reticulated: 0.6 },
	serpentine: {
		bands: 1.7,
		'dorsal-spots': 1.4,
		'back-stripe': 1.3,
		stripes: 0.4,
		'limb-bands': 0,
		saddle: 0.6
	}
};

/** Until Phase 3 draws them, planned patterns render as the nearest existing one. */
export const PLANNED_PATTERN_FALLBACK: Readonly<
	Record<
		Extract<CreatureCoatPattern, 'rosettes' | 'reticulated' | 'patches' | 'speckle' | 'saddle'>,
		CreaturePatternType
	>
> = {
	rosettes: 'spots',
	reticulated: 'mottled',
	patches: 'mottled',
	speckle: 'spots',
	saddle: 'back-stripe'
};
