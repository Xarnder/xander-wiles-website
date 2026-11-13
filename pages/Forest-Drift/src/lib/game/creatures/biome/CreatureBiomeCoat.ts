import { createNamedRandom, hashStringToUint32 } from '../../terrain/seededRandom';
import type {
	CreatureCoatInfo,
	CreaturePattern,
	CreaturePatternDefinition,
	CreaturePatternTone,
	CreaturePatternType,
	SpeciesGenome
} from '../CreatureTypes';
import { patternFor, resolveSurfaceGenome } from '../surface/CreaturePatternGenerator';
import {
	creatureBiomeProfile,
	PLAN_PATTERN_LEAN,
	PLANNED_PATTERN_FALLBACK,
	type CreatureBiomeProfileId,
	type CreatureCoatPattern
} from './creatureBiomeProfiles';
import { hexToOklch, oklchToHex } from './oklch';

/**
 * Biome coats (biome-specific creatures, Phase 0): recolours a region's species for one creature
 * biome profile. Pure and deterministic from the world seed, the region and the profile, so every
 * client agrees without the room knowing biomes (Q16). Species identity (id, anatomy, sizes,
 * behaviour) is untouched; only `appearance` changes, in a copy.
 *
 * The whole region is coloured together so its species stay apart (Q3):
 * - each species gets its own **lightness step** (a seeded shuffle, so size doesn't predict it);
 * - species one step apart never share a pattern;
 * - accents are dealt by step, so species sharing an accent are three steps apart.
 */
export const COAT_GENERATOR = 'creature-coat-v1';
/** Smallest lightness gap between neighbouring steps (OKLab L). Profiles are tuned to exceed it. */
export const MIN_LIGHTNESS_STEP = 0.06;

const LEGACY_PATTERN: Record<CreaturePatternType, CreaturePattern> = {
	solid: 'solid',
	spots: 'spots',
	'dorsal-spots': 'spots',
	mottled: 'spots',
	stripes: 'stripe',
	'back-stripe': 'stripe',
	bands: 'bands',
	'limb-bands': 'limb-tips',
	gradient: 'gradient',
	underbelly: 'belly',
	rosettes: 'spots',
	reticulated: 'spots',
	patches: 'spots',
	speckle: 'spots',
	saddle: 'stripe'
};

/** The pattern the shader draws for a profile pattern (every one, since Phase 3). */
export function renderedPattern(pattern: CreatureCoatPattern): CreaturePatternType {
	return pattern;
}

/** A pattern a saved recipe can hold (the original ten): Phase 3 patterns map to the nearest. */
export function savedPattern(type: CreaturePatternType): CreaturePatternType {
	return type in PLANNED_PATTERN_FALLBACK
		? PLANNED_PATTERN_FALLBACK[type as keyof typeof PLANNED_PATTERN_FALLBACK]
		: type;
}

function pickWeighted<T>(items: readonly (readonly [T, number])[], r: number): T {
	const total = items.reduce((sum, [, w]) => sum + w, 0);
	let x = r * total;
	for (const [item, w] of items) if ((x -= w) <= 0) return item;
	return items[items.length - 1][0];
}

/** Natural tones: patterns darker than pale bodies, lighter than dark ones. */
function toneFor(pattern: CreatureCoatPattern, lightness: number, r: number): CreaturePatternTone {
	const pale = lightness > 0.55;
	switch (pattern) {
		case 'solid':
			return 'light';
		case 'gradient':
		case 'limb-bands':
			return 'dark';
		case 'back-stripe':
		case 'saddle':
			return r < 0.3 ? 'accent' : pale ? 'dark' : 'light';
		case 'stripes':
		case 'bands':
			return pale || r < 0.6 ? 'dark' : 'light';
		default:
			return pale ? (r < 0.8 ? 'dark' : 'underbelly') : 'light';
	}
}

/** Pattern parameters for a profile pattern, including the look of planned ones until Phase 3. */
function patternDefinition(
	pattern: CreatureCoatPattern,
	species: SpeciesGenome,
	between: (a: number, b: number) => number,
	tone: CreaturePatternTone,
	contrast: number
): CreaturePatternDefinition {
	const plan = species.bodyPlan.id;
	const p = patternFor(renderedPattern(pattern), plan, between, tone);
	p.contrast = Math.max(0, Math.min(1, p.contrast * contrast));
	return p;
}

function coatSpecies(
	species: SpeciesGenome,
	step: number,
	steps: number,
	pattern: CreatureCoatPattern,
	profileId: CreatureBiomeProfileId,
	worldSeed: string | number
): SpeciesGenome {
	const profile = creatureBiomeProfile(profileId);
	const rng = createNamedRandom(
		String(worldSeed),
		`${COAT_GENERATOR}:${species.id}:${profileId}:colour`
	);
	const between = (a: number, b: number) => a + rng() * (b - a);
	const [lo, hi] = profile.lightness;
	const l = steps > 1 ? lo + ((hi - lo) * step) / (steps - 1) : (lo + hi) / 2;
	const colour = pickWeighted(
		profile.bodies.map((b) => [b, b.weight] as const),
		rng()
	);
	const h = colour.h + between(-6, 6);
	// Pale natural coats are less saturated (a tawny cat, not a peach): taper chroma above L 0.6.
	const c = colour.c * between(0.85, 1.15) * (1 - Math.max(0, l - 0.6) * 1.3);
	const accent = profile.accents[step % profile.accents.length];
	const plan = species.bodyPlan.id;

	const base = resolveSurfaceGenome(species);
	const primaryPattern = patternDefinition(
		pattern,
		species,
		between,
		toneFor(pattern, l, rng()),
		profile.patternContrast
	);
	const secondaryPattern =
		base.secondaryPattern.type === primaryPattern.type ||
		(plan === 'serpentine' && base.secondaryPattern.type === 'limb-bands')
			? patternFor('solid', plan, between, 'light')
			: { ...base.secondaryPattern };
	const furred = plan === 'quadruped' || plan === 'biped';
	const coat: CreatureCoatInfo = {
		profile: profileId,
		pattern,
		lightnessStep: step,
		thickness: profile.coat.thickness,
		length: profile.coat.length,
		gloss: profile.coat.gloss,
		bare: furred && rng() < profile.coat.bare
	};
	return {
		...species,
		appearance: {
			...species.appearance,
			palette: {
				...species.appearance.palette,
				primary: oklchToHex({ l, c, h }),
				secondary: oklchToHex({
					l: Math.min(0.97, l + profile.underside.lift),
					c: profile.underside.c,
					h: profile.underside.h
				}),
				accent: oklchToHex({ l: accent.l, c: accent.c, h: accent.h + between(-5, 5) }),
				eye: oklchToHex({ l: 0.17, c: 0.02, h }),
				pattern: LEGACY_PATTERN[primaryPattern.type]
			},
			surface: {
				...base,
				primaryPattern,
				secondaryPattern,
				gloss: Math.max(base.gloss * 0.5, profile.coat.gloss)
			},
			coat
		}
	};
}

/**
 * Coats every species of one region for `profileId`. `regionKey` names the region (e.g. `"12:-4"`);
 * with `worldSeed` it seeds the lightness shuffle. The input species are not modified.
 */
export function coatRegionSpecies(
	speciesList: readonly SpeciesGenome[],
	profileId: CreatureBiomeProfileId,
	worldSeed: string | number,
	regionKey: string
): SpeciesGenome[] {
	const n = speciesList.length;
	const profile = creatureBiomeProfile(profileId);
	const rng = createNamedRandom(String(worldSeed), `${COAT_GENERATOR}:${regionKey}:${profileId}`);
	const steps = Array.from({ length: n }, (_, i) => i);
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[steps[i], steps[j]] = [steps[j], steps[i]];
	}
	// Patterns: species one step apart never share one (re-drawn a few times, then any other).
	const patterns: CreatureCoatPattern[] = [];
	speciesList.forEach((species, index) => {
		const lean = PLAN_PATTERN_LEAN[species.bodyPlan.id];
		const weighted = profile.patterns
			.map(([p, w]) => [p, w * (lean[p] ?? 1)] as const)
			.filter(([, w]) => w > 0);
		const clashes = (p: CreatureCoatPattern) =>
			patterns.some((other, k) => other === p && Math.abs(steps[k] - steps[index]) <= 1);
		let pattern = pickWeighted(weighted, rng());
		for (let attempt = 0; attempt < 6 && clashes(pattern); attempt++)
			pattern = pickWeighted(weighted, rng());
		// Few allowed patterns and both neighbours took them: use a common pattern instead.
		if (clashes(pattern))
			pattern =
				weighted.find(([p]) => !clashes(p))?.[0] ??
				FALLBACK_PATTERNS.find((p) => (lean[p] ?? 1) > 0 && !clashes(p)) ??
				pattern;
		patterns.push(pattern);
	});
	return speciesList.map((species, index) =>
		coatSpecies(species, steps[index], n, patterns[index], profileId, worldSeed)
	);
}

/** Patterns any body plan can wear, tried when a profile's own list is exhausted. */
const FALLBACK_PATTERNS: readonly CreatureCoatPattern[] = [
	'solid',
	'gradient',
	'dorsal-spots',
	'back-stripe',
	'bands',
	'mottled'
];

/**
 * A coated species as a saved recipe (Lab placement, decision Q18): the coat's colours and
 * (existing) pattern stay in today's fields; the runtime `coat` marker is dropped, so the save
 * format is unchanged. The id gains the profile, so copies of one species placed from different
 * biomes are different recipes rather than conflicting ones.
 */
export function recipeForSave(species: SpeciesGenome): SpeciesGenome {
	const coat = species.appearance.coat;
	const surface = species.appearance.surface;
	const unsaved =
		surface &&
		(savedPattern(surface.primaryPattern.type) !== surface.primaryPattern.type ||
			savedPattern(surface.secondaryPattern.type) !== surface.secondaryPattern.type);
	if (!coat && !unsaved) return species;
	const appearance = { ...species.appearance };
	delete appearance.coat;
	if (surface)
		appearance.surface = {
			...surface,
			primaryPattern: {
				...surface.primaryPattern,
				type: savedPattern(surface.primaryPattern.type)
			},
			secondaryPattern: {
				...surface.secondaryPattern,
				type: savedPattern(surface.secondaryPattern.type)
			}
		};
	const suffix = !coat ? '' : coat.morph ? `_${coat.profile}_${coat.morph}` : `_${coat.profile}`;
	return { ...species, id: `${species.id}${suffix}`, appearance };
}

/** About one individual in this many is a rare pale or dark morph (Q14). */
export const MORPH_RARITY = 60;

/** Whether herd member `member` of `groupId` is a rare morph: pure, the same for every player. */
export function coatMorph(groupId: string, member: number): 'pale' | 'dark' | null {
	const h = hashStringToUint32(`${groupId}:${member}:morph`) >>> 0;
	if (h % MORPH_RARITY !== 0) return null;
	return (h >>> 12) & 1 ? 'pale' : 'dark';
}

const morphs = new WeakMap<SpeciesGenome, Partial<Record<'pale' | 'dark', SpeciesGenome>>>();

/**
 * The species as a rare morph: pale (leucistic: lighter, nearly colourless body and underside) or
 * dark (melanistic). The accent is kept, so the morph still reads as its species. Cached per
 * coated species; identity is unchanged.
 */
export function morphSpecies(species: SpeciesGenome, morph: 'pale' | 'dark'): SpeciesGenome {
	const coat = species.appearance.coat;
	if (!coat) return species;
	let byMorph = morphs.get(species);
	if (!byMorph) morphs.set(species, (byMorph = {}));
	const cached = byMorph[morph];
	if (cached) return cached;
	const palette = species.appearance.palette;
	const body = hexToOklch(palette.primary);
	const under = hexToOklch(palette.secondary);
	const pale = morph === 'pale';
	const result: SpeciesGenome = {
		...species,
		appearance: {
			...species.appearance,
			palette: {
				...palette,
				primary: oklchToHex(
					pale
						? { l: Math.min(0.93, body.l + 0.2), c: body.c * 0.4, h: body.h }
						: { l: Math.max(0.12, body.l - 0.18), c: body.c * 0.6, h: body.h }
				),
				secondary: oklchToHex(
					pale
						? { l: Math.min(0.97, under.l + 0.08), c: under.c * 0.5, h: under.h }
						: { l: Math.max(0.3, under.l - 0.14), c: under.c * 0.7, h: under.h }
				)
			},
			coat: { ...coat, morph }
		}
	};
	byMorph[morph] = result;
	return result;
}

/** Herd member `member`'s species: the herd's coat, or its rare morph (coated herds only). */
export function memberSpecies(
	species: SpeciesGenome,
	groupId: string,
	member: number
): SpeciesGenome {
	if (!species.appearance.coat) return species;
	const morph = coatMorph(groupId, member);
	return morph ? morphSpecies(species, morph) : species;
}

/** Small LRU of coated regions (keyed by seed, region, profile and the species ids). */
const CACHE_LIMIT = 96;
const cache = new Map<string, SpeciesGenome[]>();

/** `coatRegionSpecies`, cached: the same region and profile return the same species objects. */
export function cachedCoatRegionSpecies(
	speciesList: readonly SpeciesGenome[],
	profileId: CreatureBiomeProfileId,
	worldSeed: string | number,
	regionKey: string
): SpeciesGenome[] {
	const key = `${worldSeed}|${regionKey}|${profileId}|${speciesList.map((s) => s.id).join(',')}`;
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	const coated = coatRegionSpecies(speciesList, profileId, worldSeed, regionKey);
	cache.set(key, coated);
	if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
	return coated;
}

/** Forget cached coats (biome settings changed, a new world). */
export function clearCoatCache(): void {
	cache.clear();
}
