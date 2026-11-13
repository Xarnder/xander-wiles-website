/**
 * Turns a carried creature's id back into its recipe without terrain, so the multiplayer room and
 * other players can identify and draw a creature they never simulated. Pure: no Three.js or DOM.
 *
 * Ambient ids are `group:{worldSeed}:{cellX}:{cellZ}:{slot}:{member}` (see generatePopulationCell);
 * the world seed may itself contain colons, so the four numbers are read from the end.
 * Lab-placed ids (`placed_…`) are looked up in the world's saved creatures.
 */
import { hashStringToUint32 } from '../terrain/seededRandom';
import {
	CREATURE_CELL_SLOTS,
	cellGroupCentres,
	creatureGroupId,
	slotSpecies,
	type HerdBiomeSources
} from './CreaturePopulationSystem';
import { generateIndividual } from './IndividualGenerator';
import { memberSpecies } from './biome/CreatureBiomeCoat';
import type { CreatureDefinition, PersistentCreatureDefinition } from './CreatureTypes';

export interface AmbientCreatureRef {
	seed: string;
	cellX: number;
	cellZ: number;
	slot: number;
	member: number;
}

/** Longest id accepted anywhere (network messages included). */
export const CREATURE_ID_MAX_LENGTH = 160;
/** Generous upper bound on a herd's size; real groups are far smaller. */
const MAX_GROUP_MEMBERS = 32;
/** Cells this far from the origin are beyond any reachable world. */
const MAX_CELL = 1_000_000;

function integer(text: string, min: number, max: number): number | null {
	if (!/^-?\d{1,7}$/.test(text)) return null;
	const value = Number(text);
	return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

export function parseAmbientCreatureId(id: unknown): AmbientCreatureRef | null {
	if (typeof id !== 'string' || id.length > CREATURE_ID_MAX_LENGTH) return null;
	const parts = id.split(':');
	if (parts.length < 6 || parts[0] !== 'group') return null;
	const [cx, cz, sl, mb] = parts.slice(-4);
	const seed = parts.slice(1, -4).join(':');
	const cellX = integer(cx, -MAX_CELL, MAX_CELL);
	const cellZ = integer(cz, -MAX_CELL, MAX_CELL);
	const slot = integer(sl, 0, CREATURE_CELL_SLOTS - 1);
	const member = integer(mb, 0, MAX_GROUP_MEMBERS - 1);
	if (!seed || cellX === null || cellZ === null || slot === null || member === null) return null;
	return { seed, cellX, cellZ, slot, member };
}

/**
 * The ambient creature's recipe, rebuilt from its id and the world seed. Null when the id is
 * malformed, belongs to another world, or names a member its group doesn't have.
 */
export function resolveAmbientCreature(
	worldSeed: string,
	id: unknown,
	biomes?: HerdBiomeSources | ((x: number, z: number) => string | undefined)
): CreatureDefinition | null {
	const ref = parseAmbientCreatureId(id);
	if (!ref || ref.seed !== String(worldSeed)) return null;
	// The same rule as the population (`slotSpecies`): clients pass their biome sources (rosters and
	// coats); the room passes rosters only, and gets the same identity and abilities, uncoloured.
	const sources = typeof biomes === 'function' ? { profileAt: biomes } : (biomes ?? {});
	const centre = cellGroupCentres(worldSeed, ref.cellX, ref.cellZ)[ref.slot];
	const herd = slotSpecies(worldSeed, ref.cellX, ref.cellZ, centre, sources);
	if (!herd || ref.member >= herd.groupSize) return null;
	const groupId = creatureGroupId(worldSeed, ref.cellX, ref.cellZ, ref.slot);
	return {
		species: memberSpecies(herd.species, groupId, ref.member),
		individual: generateIndividual(herd.species, hashStringToUint32(`${groupId}:${ref.member}`))
	};
}

/**
 * Any carryable creature's recipe: ambient ids are rebuilt from the seed, `placed_` ids are found
 * among the world's saved creatures.
 */
export function resolveCarryableCreature(
	worldSeed: string,
	id: unknown,
	placed: readonly PersistentCreatureDefinition[]
): { definition: CreatureDefinition; placed: boolean } | null {
	if (typeof id !== 'string' || id.length > CREATURE_ID_MAX_LENGTH) return null;
	if (id.startsWith('placed_')) {
		const found = placed.find((p) => p.id === id);
		return found
			? { definition: { species: found.species, individual: found.individual }, placed: true }
			: null;
	}
	const definition = resolveAmbientCreature(worldSeed, id);
	return definition ? { definition, placed: false } : null;
}
