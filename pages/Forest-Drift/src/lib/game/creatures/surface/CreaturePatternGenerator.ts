import { createNamedRandom, hashStringToUint32 } from '../../terrain/seededRandom';
import type {
	BodyPlanId,
	CreatureAccentRegion,
	CreaturePatternDefinition,
	CreaturePatternTone,
	CreaturePatternType,
	CreatureSurfaceGenome,
	IndividualGenome,
	SpeciesGenome,
	UnderbellyPatternDefinition
} from '../CreatureTypes';
import { resolveSpeciesForm } from '../CreatureForm';
import { resolveCreaturePalette, type ResolvedCreaturePalette } from './CreaturePaletteGenerator';
import { sampleCreatureNoise } from './CreatureSurfaceNoise';

/**
 * Species surface identity and its individual variation. A species gets ONE signature pattern
 * (biased by body plan) and at most one secondary pattern; individuals keep the palette family and
 * pattern type but get their own placement (noise offset) and slightly different scale/coverage.
 * Everything is deterministic from named seeded streams — never Math.random.
 */
export const SURFACE_GENERATOR_VERSION = 1 as const;
export const PATTERN_TYPES: CreaturePatternType[] = [
	'solid',
	'spots',
	'mottled',
	'stripes',
	'bands',
	'back-stripe',
	'limb-bands',
	'dorsal-spots',
	'gradient',
	'underbelly'
];
/** Shader codes, in PATTERN_TYPES order. */
export const patternCode = (type: CreaturePatternType) => PATTERN_TYPES.indexOf(type);
export const ACCENT_REGIONS: CreatureAccentRegion[] = [
	'feet',
	'hands',
	'ears',
	'horns',
	'fins',
	'spines',
	'plates',
	'frills',
	'antennae',
	'tail-tip'
];

type Weighted<T> = [T, number][];
const PRIMARY_BIAS: Record<BodyPlanId, Weighted<CreaturePatternType>> = {
	quadruped: [
		['spots', 0.3],
		['mottled', 0.15],
		['dorsal-spots', 0.15],
		['back-stripe', 0.1],
		['stripes', 0.1],
		['gradient', 0.1],
		['solid', 0.1]
	],
	biped: [
		['mottled', 0.3],
		['spots', 0.2],
		['gradient', 0.2],
		['stripes', 0.1],
		['back-stripe', 0.1],
		['solid', 0.1]
	],
	hexapod: [
		['bands', 0.35],
		['dorsal-spots', 0.25],
		['back-stripe', 0.15],
		['gradient', 0.15],
		['spots', 0.1]
	],
	serpentine: [
		['bands', 0.35],
		['dorsal-spots', 0.2],
		['back-stripe', 0.2],
		['spots', 0.15],
		['mottled', 0.1]
	]
};
const SECONDARY_BIAS: Record<BodyPlanId, Weighted<CreaturePatternType>> = {
	quadruped: [
		['limb-bands', 0.45],
		['solid', 0.4],
		['back-stripe', 0.15]
	],
	biped: [
		['limb-bands', 0.5],
		['solid', 0.5]
	],
	hexapod: [
		['limb-bands', 0.3],
		['solid', 0.7]
	],
	serpentine: [
		['dorsal-spots', 0.3],
		['back-stripe', 0.3],
		['solid', 0.4]
	]
};
const TONES: Record<CreaturePatternType, Weighted<CreaturePatternTone>> = {
	solid: [['light', 1]],
	underbelly: [['underbelly', 1]],
	spots: [
		['light', 0.6],
		['dark', 0.3],
		['underbelly', 0.1]
	],
	'dorsal-spots': [
		['light', 0.55],
		['dark', 0.3],
		['accent', 0.15]
	],
	mottled: [
		['light', 0.5],
		['dark', 0.5]
	],
	stripes: [
		['dark', 0.75],
		['light', 0.25]
	],
	bands: [
		['dark', 0.55],
		['light', 0.3],
		['accent', 0.15]
	],
	'back-stripe': [
		['dark', 0.6],
		['accent', 0.4]
	],
	'limb-bands': [
		['dark', 0.55],
		['accent', 0.45]
	],
	gradient: [['dark', 1]]
};
function pickWeighted<T>(items: Weighted<T>, r: number): T {
	const total = items.reduce((sum, [, w]) => sum + w, 0);
	let x = r * total;
	for (const [item, w] of items) if ((x -= w) <= 0) return item;
	return items[items.length - 1][0];
}

/** Typical parameters per pattern type (body-length units; limbs/tails use 4 units per part). */
export function patternFor(
	type: CreaturePatternType,
	plan: BodyPlanId,
	between: (a: number, b: number) => number,
	tone: CreaturePatternTone
): CreaturePatternDefinition {
	const base = { type, scale: 4, density: 0.3, contrast: 0.7, stretch: 1, frequency: 4, tone };
	switch (type) {
		case 'spots':
			return {
				...base,
				scale: between(2.4, 3.8),
				density: between(0.24, 0.36),
				contrast: between(0.6, 0.85),
				stretch: between(1, 1.6)
			};
		case 'dorsal-spots':
			return {
				...base,
				scale: between(3, 4.5),
				density: between(0.3, 0.42),
				contrast: between(0.65, 0.9),
				stretch: between(1, 1.5)
			};
		case 'mottled':
			return {
				...base,
				scale: between(1.2, 2),
				density: between(0.42, 0.55),
				contrast: between(0.45, 0.7),
				stretch: between(1, 1.3)
			};
		case 'stripes':
			return {
				...base,
				scale: 2,
				density: between(0.25, 0.38),
				contrast: between(0.5, 0.8),
				frequency: between(5, 9)
			};
		case 'bands':
			return {
				...base,
				density: between(0.35, 0.5),
				contrast: between(0.45, 0.75),
				frequency:
					plan === 'serpentine'
						? between(9, 15)
						: plan === 'hexapod'
							? between(4, 7)
							: between(3, 6)
			};
		case 'back-stripe':
			return { ...base, density: between(0.25, 0.4), contrast: between(0.5, 0.8) };
		case 'limb-bands':
			return {
				...base,
				density: between(0.35, 0.5),
				contrast: between(0.5, 0.8),
				frequency: between(0.7, 1.1)
			};
		case 'gradient':
			return { ...base, contrast: between(0.35, 0.55) };
		default:
			return { ...base, contrast: 0 };
	}
}

/**
 * Species surface recipe from its own named stream (`creature-surface-v1:<plan>`), so adding it
 * never perturbs the species' other draws.
 */
export function deriveSurfaceGenome(
	species: Pick<SpeciesGenome, 'seed' | 'bodyPlan' | 'anatomy' | 'appearance'> &
		Partial<Pick<SpeciesGenome, 'form'>>,
	salt = 0
): CreatureSurfaceGenome {
	const plan = species.bodyPlan.id;
	const rng = createNamedRandom(String(species.seed), `creature-surface-v1:${plan}:${salt}`);
	const between = (a: number, b: number) => a + rng() * (b - a);
	const primaryType = pickWeighted(PRIMARY_BIAS[plan], rng());
	let secondaryType = pickWeighted(SECONDARY_BIAS[plan], rng());
	if (secondaryType === primaryType) secondaryType = 'solid';
	const primaryPattern = patternFor(
		primaryType,
		plan,
		between,
		pickWeighted(TONES[primaryType], rng())
	);
	const secondaryPattern = patternFor(
		secondaryType,
		plan,
		between,
		pickWeighted(TONES[secondaryType], rng())
	);
	const form = resolveSpeciesForm(species as SpeciesGenome);
	const underbelly: UnderbellyPatternDefinition = {
		width: plan === 'serpentine' ? between(0.28, 0.4) : between(0.2, 0.34),
		softness: between(0.12, 0.22),
		strength: form.bellyStrength,
		brightness: between(0, 0.08),
		segmented: plan === 'serpentine' ? rng() < 0.7 : plan === 'hexapod' ? rng() < 0.4 : false
	};
	const accents = ACCENT_REGIONS.filter((region) =>
		region === 'feet' || region === 'hands' ? true : rng() < 0.82
	);
	return {
		version: SURFACE_GENERATOR_VERSION,
		seed: hashStringToUint32(`${species.seed}:${plan}:surface:${salt}`) >>> 0,
		primaryPattern,
		secondaryPattern,
		underbelly,
		accents,
		roughness: Math.max(0.62, Math.min(0.9, species.appearance.palette.roughness)),
		roughnessVariation: between(0.03, 0.09),
		gloss: plan === 'serpentine' ? between(0.2, 0.5) : between(0, 0.2)
	};
}

/** Recipes saved before surfaces existed keep their old look: palette.pattern maps across. */
export function legacySurfaceGenome(species: SpeciesGenome): CreatureSurfaceGenome {
	const plan = species.bodyPlan.id;
	const rng = createNamedRandom(String(species.seed), `creature-surface-legacy:${plan}`);
	const between = (a: number, b: number) => a + rng() * (b - a);
	const map: Record<string, CreaturePatternType> = {
		solid: 'solid',
		gradient: 'gradient',
		belly: 'underbelly',
		stripe: 'back-stripe',
		spots: 'spots',
		bands: 'bands',
		'limb-tips': 'limb-bands'
	};
	const type = map[species.appearance.palette.pattern] ?? 'solid';
	const form = resolveSpeciesForm(species);
	return {
		version: SURFACE_GENERATOR_VERSION,
		seed: species.seed >>> 0,
		primaryPattern: patternFor(type, plan, between, type === 'spots' ? 'dark' : 'light'),
		secondaryPattern: patternFor('solid', plan, between, 'light'),
		underbelly: {
			width: 0.3,
			softness: 0.18,
			strength: form.bellyStrength * (type === 'underbelly' ? 1.15 : type === 'solid' ? 0.75 : 1),
			brightness: 0,
			segmented: false
		},
		accents: [...ACCENT_REGIONS],
		roughness: Math.max(0.62, Math.min(0.9, species.appearance.palette.roughness)),
		roughnessVariation: 0.05,
		gloss: 0
	};
}
export const resolveSurfaceGenome = (species: SpeciesGenome) =>
	species.appearance.surface ?? legacySurfaceGenome(species);

/** A pattern with this individual's placement: noise offset, phase and slight scale/coverage drift. */
export interface IndividualPattern extends CreaturePatternDefinition {
	offset: [number, number, number];
	phase: number;
}
/** Resolved per-individual surface: what the classifier and shader actually use. */
export interface CreatureSurfaceDefinition {
	palette: ResolvedCreaturePalette;
	underbelly: UnderbellyPatternDefinition;
	primaryPattern: IndividualPattern;
	secondaryPattern?: IndividualPattern;
	accents: CreatureAccentRegion[];
	roughness: number;
	roughnessVariation: number;
	glossVariation: number;
	seed: number;
}
export function resolveCreatureSurface(
	species: SpeciesGenome,
	individual: Pick<IndividualGenome, 'seed' | 'paletteVariation'>
): CreatureSurfaceDefinition {
	const genome = resolveSurfaceGenome(species);
	const rng = createNamedRandom(String(genome.seed), `surface-individual-v1:${individual.seed}`);
	const jitter = (range: number) => 1 + (rng() * 2 - 1) * range;
	const individualise = (p: CreaturePatternDefinition): IndividualPattern => ({
		...p,
		scale: p.scale * jitter(0.08),
		density: Math.max(0.05, Math.min(0.85, p.density + (rng() * 2 - 1) * 0.03)),
		contrast: Math.max(0, Math.min(1, p.contrast * jitter(0.06))),
		offset: [rng() * 32, rng() * 32, rng() * 32],
		phase: rng()
	});
	const primaryPattern = individualise(genome.primaryPattern);
	const secondary =
		genome.secondaryPattern.type === 'solid' ? undefined : individualise(genome.secondaryPattern);
	return {
		palette: resolveCreaturePalette(
			species,
			individual,
			primaryPattern.type === 'solid' ? 'light' : primaryPattern.tone,
			genome.underbelly.brightness
		),
		underbelly: genome.underbelly,
		primaryPattern,
		secondaryPattern: secondary,
		accents: genome.accents,
		roughness: genome.roughness,
		roughnessVariation: genome.roughnessVariation,
		glossVariation: genome.gloss,
		seed: genome.seed
	};
}

/** Noise texels per pattern feature: `scale` counts features (blobs) per body length. */
export const NOISE_FEATURE_TEXELS = 12;
/**
 * Fixed oblique rotation of pattern space: the 32-texel noise tile never repeats in line with the
 * body axes. Row-major; the shader uses the same numbers.
 */
export const PATTERN_ROTATION = [
	[0.876035, -0.24245, 0.416871],
	[0.448786, 0.726254, -0.520717],
	[-0.176507, 0.643252, 0.745032]
] as const;
const smoothstep = (a: number, b: number, x: number) => {
	const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
/**
 * CPU mirror of the shader's pattern mask (before region masks and contrast). `p` is the bind-space
 * position divided by body scale, `u` the longitudinal coordinate, `radial` dorsal +1 … ventral −1.
 * Patterns live in creature-anatomical space, so they never swim when the creature moves.
 */
export function patternMask(
	pattern: Pick<
		IndividualPattern,
		'type' | 'scale' | 'density' | 'stretch' | 'frequency' | 'offset' | 'phase'
	>,
	p: { x: number; y: number; z: number },
	u: number,
	radial: number
): number {
	const s = pattern.scale * NOISE_FEATURE_TEXELS,
		o = pattern.offset;
	const R = PATTERN_ROTATION;
	const noise = (k: number, shift = 0) => {
		const x = p.x * s * k,
			y = p.y * s * k,
			z = (p.z * s * k) / Math.max(0.2, pattern.stretch);
		return sampleCreatureNoise(
			(R[0][0] * x + R[0][1] * y + R[0][2] * z + o[0] + shift) / 32,
			(R[1][0] * x + R[1][1] * y + R[1][2] * z + o[1] + shift) / 32,
			(R[2][0] * x + R[2][1] * y + R[2][2] * z + o[2] + shift) / 32
		);
	};
	const threshold = 1 - pattern.density;
	switch (pattern.type) {
		case 'spots':
			return smoothstep(threshold - 0.05, threshold + 0.05, noise(1));
		case 'dorsal-spots':
			return (
				smoothstep(threshold - 0.05, threshold + 0.05, noise(1)) * smoothstep(-0.1, 0.5, radial)
			);
		case 'mottled': {
			const n = noise(1) * 0.65 + noise(2.3, 11.3) * 0.35;
			return smoothstep(threshold - 0.16, threshold + 0.16, n);
		}
		case 'stripes': {
			const warp = noise(0.5) - 0.5;
			const wave = 0.5 + 0.5 * Math.sin(TAU * (u * pattern.frequency + pattern.phase) + warp * 2.5);
			return smoothstep(threshold - 0.08, threshold + 0.08, wave);
		}
		case 'bands':
		case 'limb-bands': {
			const wave = 0.5 + 0.5 * Math.sin(TAU * (u * pattern.frequency + pattern.phase));
			return smoothstep(threshold - 0.12, threshold + 0.12, wave);
		}
		case 'back-stripe': {
			const edge = 1 - pattern.density * 1.2;
			return smoothstep(edge - 0.12, edge + 0.12, radial * 0.5 + 0.5);
		}
		case 'gradient':
			return smoothstep(-0.3, 1, radial);
		default:
			return 0;
	}
}

const PATTERN_RANGES: Record<
	keyof Omit<CreaturePatternDefinition, 'type' | 'tone'>,
	[number, number]
> = {
	scale: [0.1, 40],
	density: [0, 1],
	contrast: [0, 1],
	stretch: [0.2, 5],
	frequency: [0, 64]
};
/** Rejects malformed saved surface recipes. Returns an error message or null. */
export function validateSurfaceGenome(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return 'Invalid creature surface';
	const s = value as Record<string, unknown>;
	if (s.version !== SURFACE_GENERATOR_VERSION || !Number.isSafeInteger(s.seed))
		return 'Unsupported creature surface version';
	for (const key of ['primaryPattern', 'secondaryPattern']) {
		const p = s[key] as Record<string, unknown> | undefined;
		if (!p || typeof p !== 'object' || !PATTERN_TYPES.includes(p.type as CreaturePatternType))
			return 'Invalid creature surface pattern';
		if (!['light', 'dark', 'underbelly', 'accent'].includes(String(p.tone)))
			return 'Invalid creature surface pattern tone';
		for (const [k, [lo, hi]] of Object.entries(PATTERN_RANGES)) {
			const n = p[k];
			if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi)
				return `Invalid creature surface pattern value: ${k}`;
		}
	}
	const u = s.underbelly as Record<string, unknown> | undefined;
	if (
		!u ||
		typeof u !== 'object' ||
		!['width', 'softness', 'strength', 'brightness'].every(
			(k) =>
				typeof u[k] === 'number' &&
				Number.isFinite(u[k]) &&
				(u[k] as number) >= 0 &&
				(u[k] as number) <= 1
		) ||
		typeof u.segmented !== 'boolean'
	)
		return 'Invalid creature underbelly';
	if (
		!Array.isArray(s.accents) ||
		s.accents.length > ACCENT_REGIONS.length ||
		!s.accents.every((a) => ACCENT_REGIONS.includes(a as CreatureAccentRegion)) ||
		new Set(s.accents).size !== s.accents.length
	)
		return 'Invalid creature accent regions';
	for (const k of ['roughness', 'roughnessVariation', 'gloss']) {
		const n = s[k];
		if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)
			return `Invalid creature surface value: ${k}`;
	}
	return null;
}
