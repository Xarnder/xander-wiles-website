import { CURRENT_WORLD_SCHEMA_VERSION } from '../world/WorldTypes';
import { describe, expect, it } from 'vitest';
import { createDefaultCreatureState, validateCreatureWorldState } from './CreaturePersistence';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { migrateWorld } from '../world/WorldMigrationManager';
import { validateWorldDefinition } from '../world/WorldValidation';
import { captureWorldContent, applyContentToWorld } from '../world/WorldSerializer';
import { richWorld, runtimeFromWorld } from '../world/__tests__/worldFixtures';
import type { PersistentCreatureDefinition } from './CreatureTypes';

function persistent(seed = 42): PersistentCreatureDefinition {
	const species = generateSpecies(seed);
	return {
		id: `persistent-${seed}`,
		species,
		individual: generateIndividual(species, 1),
		position: { x: 12, y: 8, z: -10 },
		heading: 0.75,
		state: 'WANDER'
	};
}

describe('creature world persistence', () => {
	it('migrates schema 4 without changing music or buildings or mutating the input', () => {
		const old: Record<string, unknown> = { ...richWorld(), schemaVersion: 4 };
		delete old.creatures;
		const before = JSON.stringify(old);
		const migrated = migrateWorld(old);
		expect(migrated.ok).toBe(true);
		if (!migrated.ok) return;
		expect(migrated.value.schemaVersion).toBe(CURRENT_WORLD_SCHEMA_VERSION);
		expect(migrated.value.creatures).toEqual(createDefaultCreatureState());
		expect(migrated.value.musicTrees).toEqual(old.musicTrees);
		expect(migrated.value.musicPlants).toEqual(old.musicPlants);
		expect(migrated.value.buildings).toEqual(old.buildings);
		expect(JSON.stringify(old)).toBe(before);
		expect(validateWorldDefinition(migrated.value).ok).toBe(true);
	});
	it('migrates every historical schema through the creature step', () => {
		for (const schemaVersion of [1, 2, 3, 4]) {
			const result = migrateWorld({ ...richWorld(), schemaVersion });
			expect(result.ok).toBe(true);
			if (result.ok) expect(validateWorldDefinition(result.value).ok).toBe(true);
		}
	});
	it('captures persistent recipes by value and regenerates no ambient records in saves', () => {
		const world = richWorld();
		world.creatures.individuals.push(persistent());
		const runtime = runtimeFromWorld(world);
		const content = captureWorldContent(runtime);
		runtime.creatures.individuals[0].position.x = 100;
		expect(content.creatures.individuals[0].position.x).toBe(12);
		const saved = applyContentToWorld(world, content);
		expect(validateWorldDefinition(saved).ok).toBe(true);
		expect(JSON.parse(JSON.stringify(saved)).creatures).toEqual(content.creatures);
		expect(Object.keys(saved.creatures).sort()).toEqual(['individuals', 'settings']);
		expect(JSON.stringify(saved.creatures)).not.toMatch(
			/geometry|skinWeights|vertices|runtime|ambient/
		);
	});
	it('rejects malformed settings, identities, recipes and runtime payloads', () => {
		const state = createDefaultCreatureState();
		state.individuals.push(persistent());
		expect(validateCreatureWorldState(state)).toBeNull();
		for (const settings of [
			{ ...state.settings, generatorVersion: 2 },
			{ ...state.settings, creatureDensity: Infinity },
			{ ...state.settings, maxActiveCreatures: 10000 }
		])
			expect(validateCreatureWorldState({ ...state, settings })).not.toBeNull();
		expect(
			validateCreatureWorldState({
				...state,
				individuals: [...state.individuals, ...state.individuals]
			})
		).not.toBeNull();
		const entry = state.individuals[0];
		for (const altered of [
			{ ...entry, mesh: {} },
			{ ...entry, position: { x: NaN, y: 0, z: 0 } },
			{ ...entry, state: 'COMBAT' },
			{ ...entry, species: { ...entry.species, geometry: { positions: [1] } } },
			{ ...entry, individual: { ...entry.individual, sizeFactor: 100 } }
		])
			expect(validateCreatureWorldState({ ...state, individuals: [altered] })).not.toBeNull();
		expect(
			validateCreatureWorldState({ ...state, individuals: Array(1001).fill(entry) })
		).not.toBeNull();
	});
});
