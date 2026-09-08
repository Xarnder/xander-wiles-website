import type { CreatureWorldState, SpeciesGenome } from './CreatureTypes';
import { validateIndividual, validateSpecies } from './CreatureValidation';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';

export const CREATURE_PERSISTENCE_LIMITS = {
	individuals: 1000,
	maxActiveCreatures: 100,
	density: 4
} as const;

export function createDefaultCreatureState(): CreatureWorldState {
	return {
		settings: { enabled: true, generatorVersion: 1, creatureDensity: 1, maxActiveCreatures: 40 },
		individuals: []
	};
}

const record = (v: unknown): v is Record<string, unknown> =>
	!!v &&
	typeof v === 'object' &&
	!Array.isArray(v) &&
	(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const finite = (v: unknown, min: number, max: number): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const speciesShape = { ...generateSpecies(0), voiceProfileId: '' };
const individualShape = { ...generateIndividual(speciesShape, 0), age: 0 };
/** Explicit recipe-shaped projection guard: generated renderer fields are never accepted as save data. */
function recipeOnly(value: unknown, shape: unknown): boolean {
	if (Array.isArray(shape))
		return Array.isArray(value) && value.every((v) => typeof v !== 'object');
	if (!record(shape))
		return (
			value === undefined ||
			(typeof value === typeof shape && (typeof value !== 'number' || Number.isFinite(value)))
		);
	return (
		record(value) &&
		Object.keys(value).every((k) => Object.hasOwn(shape, k) && recipeOnly(value[k], shape[k]))
	);
}

/** Validates settings plus only explicitly persistent individuals; ambient populations are regenerated. */
export function validateCreatureWorldState(value: unknown): string | null {
	if (!record(value) || Object.keys(value).some((k) => !['settings', 'individuals'].includes(k)))
		return 'Creature state must contain only settings and persistent individuals';
	const s = value.settings;
	if (
		!record(s) ||
		Object.keys(s).some(
			(k) => !['enabled', 'generatorVersion', 'creatureDensity', 'maxActiveCreatures'].includes(k)
		) ||
		typeof s.enabled !== 'boolean' ||
		s.generatorVersion !== 1 ||
		!finite(s.creatureDensity, 0, CREATURE_PERSISTENCE_LIMITS.density) ||
		!finite(s.maxActiveCreatures, 1, CREATURE_PERSISTENCE_LIMITS.maxActiveCreatures) ||
		!Number.isInteger(s.maxActiveCreatures)
	)
		return 'Invalid creature ecology settings';
	if (
		!Array.isArray(value.individuals) ||
		value.individuals.length > CREATURE_PERSISTENCE_LIMITS.individuals
	)
		return 'Too many persistent creatures or invalid collection';
	const ids = new Set<string>();
	const individualIds = new Set<string>();
	const speciesRecipes = new Map<string, string>();
	for (const entry of value.individuals) {
		if (
			!record(entry) ||
			Object.keys(entry).some(
				(k) => !['id', 'species', 'individual', 'position', 'heading', 'state'].includes(k)
			) ||
			typeof entry.id !== 'string' ||
			!entry.id.length ||
			entry.id.length > 160 ||
			ids.has(entry.id)
		)
			return 'Invalid or duplicate persistent creature id';
		ids.add(entry.id);
		const speciesError = validateSpecies(entry.species);
		if (speciesError) return speciesError;
		const species = entry.species as SpeciesGenome;
		const individualError = validateIndividual(entry.individual, species);
		if (individualError) return individualError;
		if (!recipeOnly(species, speciesShape) || !recipeOnly(entry.individual, individualShape))
			return 'Creature save must contain recipes only, not runtime data';
		const individual = entry.individual as { id: string };
		if (individualIds.has(individual.id)) return 'Duplicate persistent individual recipe';
		individualIds.add(individual.id);
		const serialized = JSON.stringify(species);
		if (speciesRecipes.has(species.id) && speciesRecipes.get(species.id) !== serialized)
			return 'Conflicting recipes for one species id';
		speciesRecipes.set(species.id, serialized);
		if (
			!record(entry.position) ||
			Object.keys(entry.position).some((k) => !['x', 'y', 'z'].includes(k)) ||
			!['x', 'y', 'z'].every((k) =>
				finite((entry.position as Record<string, unknown>)[k], -1e7, 1e7)
			) ||
			!finite(entry.heading, -1e6, 1e6)
		)
			return 'Invalid persistent creature transform';
		if (
			!['IDLE', 'WANDER', 'LOOK', 'APPROACH', 'FLEE', 'RETURN_TO_GROUP'].includes(
				String(entry.state)
			)
		)
			return 'Invalid persistent creature behaviour state';
	}
	return null;
}

/** Version 4 contains no creature data; buildings, exact MIDI pitches and timelines pass through. */
export function migrateCreaturesV4(world: Record<string, unknown>): Record<string, unknown> {
	return { ...world, schemaVersion: 5, creatures: createDefaultCreatureState() };
}
