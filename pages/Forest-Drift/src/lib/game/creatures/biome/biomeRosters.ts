import type { BiomeId } from '../../biomes/BiomeTypes';
import type { BodyPlanId, SpeciesLean } from '../CreatureTypes';
import { creatureBiomeProfile, type CreatureBiomeProfile } from './creatureBiomeProfiles';

/**
 * Which animals live in each biome family (biome-specific species, decisions Q1–Q6, Q13–Q15).
 * The six families are the creature-coat families: they split the biome system's temperate group
 * into forest and open land. A few biomes override their family (Q3): a sparser, giant-poor desert,
 * sparser snowfields, and more bipeds in the bamboo.
 */
export type BiomeFamily = Exclude<CreatureBiomeProfile['family'], 'neutral'>;
export const BIOME_FAMILIES: readonly BiomeFamily[] = [
	'temperateForest',
	'openTemperate',
	'cold',
	'tropical',
	'warmDry',
	'wet'
];

export interface RosterProfile {
	/** Species in a region's roster (Q4). */
	count: number;
	/** Height bands (indices into REGION_HEIGHT_BANDS, 0 small … 5 giant) besides the always-present 0 (Q5). */
	bands: readonly number[];
	/** Chance of one rare giant (band 4) where `bands` has none (the desert, Q5). */
	rareGiant?: number;
	/** Body-plan weights for every band but 0 (always a small quadruped, Q6). */
	plans: Readonly<Partial<Record<BodyPlanId, number>>>;
	/** Anatomy leanings (Q13) and the family's first name words (Q7). */
	lean: SpeciesLean;
	/** Herd behaviour multipliers (Q14). */
	behaviour: { herd: number; fear: number; wander: number; speed: number };
	/** Multiplies the chance a herd is present (Q15). */
	density: number;
}

const FAMILIES: Record<BiomeFamily, RosterProfile> = {
	temperateForest: {
		count: 6,
		bands: [1, 2, 3],
		plans: { quadruped: 3, hexapod: 2, biped: 1, serpentine: 1 },
		lean: {
			strategy: { round: 2, crownhead: 2, longleg: 0.7, longbody: 0.8 },
			style: { chunky: 1.6, cute: 1.6 },
			traits: { horned: 2.5, 'big-eyes': 2, 'curled-tail': 1.5 },
			nameWords: ['Moss', 'Bark', 'Hollow', 'Acorn', 'Thicket', 'Loam']
		},
		behaviour: { herd: 0.8, fear: 0.8, wander: 1, speed: 1 },
		density: 1
	},
	openTemperate: {
		count: 5,
		bands: [1, 2, 3, 4, 5],
		plans: { quadruped: 4, biped: 2, hexapod: 1 },
		lean: {
			strategy: { longleg: 3, round: 0.7, longbody: 0.6, crownhead: 0.8 },
			style: { elegant: 2, slender: 1.4 },
			traits: { 'long-neck': 2.5, 'very-long-legs': 2.5, 'huge-ears': 1.3 },
			nameWords: ['Meadow', 'Wind', 'Clover', 'Gale', 'Barley', 'Thistle']
		},
		behaviour: { herd: 1.5, fear: 1.3, wander: 1.4, speed: 1.15 },
		density: 1.3
	},
	cold: {
		count: 5,
		bands: [1, 2, 3],
		plans: { quadruped: 4, biped: 1, hexapod: 1 },
		lean: {
			strategy: { round: 3, crownhead: 1, longleg: 0.5, longbody: 0.6 },
			style: { heavy: 2.5, chunky: 2 },
			traits: { 'round-belly': 2.5, 'short-neck': 2, 'broad-shoulders': 2, 'heavy-haunches': 1.5 },
			nameWords: ['Frost', 'Rime', 'Snow', 'Drift', 'Pine', 'Hail']
		},
		behaviour: { herd: 0.6, fear: 1, wander: 1.5, speed: 0.85 },
		density: 0.85
	},
	tropical: {
		count: 7,
		bands: [1, 2, 3, 4, 5],
		plans: { biped: 3, quadruped: 2, hexapod: 2, serpentine: 1 },
		lean: {
			strategy: { crownhead: 2, longbody: 2, longleg: 1, round: 0.7 },
			style: { cute: 1.6, elegant: 1.4 },
			traits: { frilled: 2, 'long-tail': 2.5, horned: 1.3, 'big-eyes': 1.5, 'curled-tail': 1.5 },
			nameWords: ['Fern', 'Vine', 'Orchid', 'Canopy', 'Liana', 'Mango']
		},
		behaviour: { herd: 0.7, fear: 0.7, wander: 0.8, speed: 1 },
		density: 1.3
	},
	warmDry: {
		count: 5,
		bands: [1, 2, 3, 4, 5],
		plans: { quadruped: 3, hexapod: 2, serpentine: 1, biped: 1 },
		lean: {
			strategy: { longleg: 3, crownhead: 1, round: 0.6, longbody: 0.8 },
			style: { slender: 2.2, elegant: 1.5 },
			traits: { 'huge-ears': 3, 'very-long-legs': 2, 'tiny-head': 1.5 },
			nameWords: ['Dune', 'Sand', 'Mesa', 'Ochre', 'Sirocco', 'Thorn']
		},
		behaviour: { herd: 0.7, fear: 1.5, wander: 1.6, speed: 1.2 },
		density: 1
	},
	wet: {
		count: 6,
		bands: [1, 2, 3],
		plans: { serpentine: 3, hexapod: 2, quadruped: 2, biped: 1 },
		lean: {
			strategy: { longbody: 3, round: 1, longleg: 0.6, crownhead: 0.8 },
			style: { slender: 2 },
			traits: { 'dorsal-fin': 3, frilled: 2.5, snout: 2, 'long-tail': 1.5 },
			nameWords: ['Bog', 'Reed', 'Marsh', 'Fen', 'Mire', 'Sedge']
		},
		behaviour: { herd: 0.8, fear: 0.6, wander: 0.7, speed: 0.75 },
		density: 0.85
	}
};

/** Biomes that adjust their family (Q3). Each gets its own roster. */
const OVERRIDES: Partial<Record<BiomeId, Partial<RosterProfile>>> = {
	desert: { count: 4, bands: [1, 2, 3], rareGiant: 0.25, density: 0.55 },
	snowyPlains: { count: 4, density: 0.55 },
	snowySlopes: { count: 4, density: 0.55 },
	bambooJungle: { plans: { biped: 4.5, quadruped: 2, hexapod: 2, serpentine: 1 } }
};

/** The roster family of a biome, or null for `neutral` (biomes off: today's species, Q10). */
export function biomeFamilyOf(biome: string): BiomeFamily | null {
	if (biome === 'neutral') return null;
	const family = creatureBiomeProfile(biome as BiomeId)?.family;
	return family && family !== 'neutral' ? family : null;
}

/** Roster key: the family, or the family plus the biome when the biome overrides it. */
export function rosterKeyOf(biome: string): string | null {
	const family = biomeFamilyOf(biome);
	if (!family) return null;
	return OVERRIDES[biome as BiomeId] ? `${family}:${biome}` : family;
}

/** The roster profile for a roster key (see `rosterKeyOf`). */
export function rosterProfile(key: string): RosterProfile {
	const [family, biome] = key.split(':') as [BiomeFamily, BiomeId | undefined];
	const base = FAMILIES[family];
	const override = biome ? OVERRIDES[biome] : undefined;
	return override ? { ...base, ...override } : base;
}

/** The largest family density multiplier (a cheap upper bound for spawning). */
export const MAX_ROSTER_DENSITY = Math.max(
	...BIOME_FAMILIES.map((f) => FAMILIES[f].density),
	...Object.values(OVERRIDES).map((o) => o?.density ?? 0)
);

/** The herd presence multiplier at a biome (Q15); 1 with biomes off. */
export function rosterDensity(biome: string): number {
	const key = rosterKeyOf(biome);
	return key ? rosterProfile(key).density : 1;
}
