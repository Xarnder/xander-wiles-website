import { createNamedRandom, hashStringToUint32 } from '../../terrain/seededRandom';
import { CARRY_MAX_HEIGHT } from '../creatureAbilities';
import { creatureDimensions } from '../creatureDimensions';
import { weightedPick } from '../CreatureForm';
import { REGION_HEIGHT_BANDS, stature } from '../regionBands';
import type { BodyPlanId, SpeciesGenome } from '../CreatureTypes';
import { generateSpecies } from '../SpeciesGenerator';
import { rosterProfile } from './biomeRosters';

/**
 * A region's species for one biome family (biome-specific species, Q2): pure and deterministic from
 * the world seed, the region and the roster key, so every client and the multiplayer room build the
 * same animals. Guarantees (Q6): band 0 is a small quadruped that can be carried, and the roster has
 * at least one biped to ride.
 */
export const ROSTER_GENERATOR = 'fauna-roster-v1';

export interface RosterEntry {
	species: SpeciesGenome;
	/** Height band (index into REGION_HEIGHT_BANDS): 0 small … 5 giant. */
	band: number;
}

const PLANS: readonly BodyPlanId[] = ['quadruped', 'biped', 'hexapod', 'serpentine'];

/** Bands for a roster: always 0, then the profile's bands shuffled, repeated if the roster is larger. */
function rosterBands(rng: () => number, count: number, bands: readonly number[], rareGiant = 0) {
	const out = [0];
	let pool: number[] = [];
	while (out.length < count) {
		if (!pool.length) {
			pool = [...bands];
			for (let i = pool.length - 1; i > 0; i--) {
				const j = Math.floor(rng() * (i + 1));
				[pool[i], pool[j]] = [pool[j], pool[i]];
			}
		}
		out.push(pool.pop()!);
	}
	// A rare landmark where the family otherwise has none (the desert): replaces the largest band.
	if (rareGiant > 0 && rng() < rareGiant) out[out.indexOf(Math.max(...out))] = 4;
	return out.sort((a, b) => a - b);
}

function build(worldSeed: string | number, regionX: number, regionZ: number, key: string) {
	const profile = rosterProfile(key);
	const rng = createNamedRandom(
		String(worldSeed),
		`${ROSTER_GENERATOR}:${regionX}:${regionZ}:${key}`
	);
	const bands = rosterBands(rng, profile.count, profile.bands, profile.rareGiant);
	const plans = bands.map((band) =>
		band === 0 ? 'quadruped' : weightedPick(PLANS, (p) => profile.plans[p] ?? 0, rng())
	);
	// Something to ride everywhere (Q6): the smallest non-small band becomes a biped if none was drawn.
	if (!plans.includes('biped')) {
		const at = bands.findIndex((band) => band > 0 && band <= 3);
		plans[at >= 0 ? at : plans.length - 1] = 'biped';
	}
	const heights = bands.map((band) => {
		const [min, max] = REGION_HEIGHT_BANDS[band];
		return min + rng() * (max - min);
	});
	const b = profile.behaviour;
	return bands.map((band, index): RosterEntry => {
		const seed = hashStringToUint32(
			`${worldSeed}:${ROSTER_GENERATOR}:${regionX}:${regionZ}:${key}:${index}`
		);
		const species = stature(generateSpecies(seed, plans[index], profile.lean), heights[index]);
		// Group sizes as today (small herds, mid pairs, lone landmarks), scaled by the family.
		const base =
			band <= 2
				? Math.max(3, species.behaviour.preferredGroupSize)
				: band === 3
					? Math.min(3, Math.max(2, species.behaviour.preferredGroupSize))
					: 1;
		const behaviour = species.behaviour;
		behaviour.preferredGroupSize = band >= 4 ? 1 : Math.max(1, Math.round(base * b.herd));
		behaviour.fear = Math.min(1, behaviour.fear * b.fear);
		behaviour.curiosity = Math.min(1, behaviour.curiosity / Math.max(0.3, b.fear));
		behaviour.wanderRadius *= b.wander;
		behaviour.wanderSpeed *= b.speed;
		behaviour.fleeSpeed *= b.speed;
		// Members of one herd stay close to their species, as with regional species.
		species.individualVariation.size = 0.045;
		species.individualVariation.hue = 0.012;
		species.individualVariation.proportions = 0.035;
		species.scaleRange.min = 0.95;
		species.scaleRange.max = 1.05;
		return { species, band };
	});
}

/** Whether a roster entry can be carried at its largest individual size (Q6). */
export function rosterEntryCarryable(entry: RosterEntry): boolean {
	return (
		entry.species.bodyPlan.id === 'quadruped' &&
		creatureDimensions(entry.species, entry.species.scaleRange.max).height <= CARRY_MAX_HEIGHT
	);
}

const CACHE_LIMIT = 128;
const cache = new Map<string, RosterEntry[]>();

/** A region's roster for a roster key (`rosterKeyOf(biome)`), cached. Entries are shared objects. */
export function biomeRoster(
	worldSeed: string | number,
	regionX: number,
	regionZ: number,
	key: string
): RosterEntry[] {
	const id = `${worldSeed}|${regionX}|${regionZ}|${key}`;
	const hit = cache.get(id);
	if (hit) {
		cache.delete(id);
		cache.set(id, hit);
		return hit;
	}
	const roster = build(worldSeed, regionX, regionZ, key);
	cache.set(id, roster);
	if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
	return roster;
}

export function clearRosterCache(): void {
	cache.clear();
}
