import { describe, expect, it } from 'vitest';
import {
	diffRows,
	flattenWorld,
	mergePlacedCreatures,
	rowMap,
	unflattenWorld,
	type AuthoredContent
} from '../worldEntities';
import { affectedBetween } from '../WorldOpFeed';
import { regionSpecies } from '../../creatures/CreaturePopulationSystem';
import { generateIndividual } from '../../creatures/IndividualGenerator';

/** Ranged weapons F2: Lab-placed creatures are shared online as `creature` rows. */
const species = regionSpecies('forest', 0, 0)[0];
const creature = (id: string, x: number) => ({
	id,
	species,
	individual: generateIndividual(species, 3),
	position: { x, y: 0, z: 0 },
	heading: 0,
	state: 'IDLE'
});
const content = (placed: unknown[]): AuthoredContent =>
	({
		foundations: [],
		buildings: [],
		buildingLevels: [],
		barriers: [],
		furniture: [],
		miniBuilds: { definitions: [], instances: [] },
		musicTrees: [],
		musicPlants: [],
		proceduralOverrides: { removedTreeIds: [] },
		placedCreatures: placed
	}) as unknown as AuthoredContent;

describe('placed creatures as rows', () => {
	it('round-trip through rows, sorted by id', () => {
		const rows = flattenWorld(content([creature('placed_b', 2), creature('placed_a', 1)]));
		expect(rows.filter((r) => r.kind === 'creature').map((r) => r.id)).toEqual([
			'placed_b',
			'placed_a'
		]);
		expect(unflattenWorld(rows).placedCreatures!.map((c: { id: string }) => c.id)).toEqual([
			'placed_a',
			'placed_b'
		]);
	});

	it('turn a put-down into one patch of the spot, and mark only that creature affected', () => {
		const before = rowMap(
			flattenWorld(content([creature('placed_a', 1), creature('placed_b', 2)]))
		);
		const after = rowMap(flattenWorld(content([creature('placed_a', 9), creature('placed_b', 2)])));
		const ops = diffRows(before, after);
		expect(ops).toEqual([
			{ op: 'patch', kind: 'creature', id: 'placed_a', set: { position: { x: 9, y: 0, z: 0 } } }
		]);
		expect([...affectedBetween(before, after).creatures]).toEqual(['placed_a']);
	});

	it('join the world file: rows replace base creatures with the same id and add the rest', () => {
		const base = {
			name: 'w',
			creatures: {
				settings: { enabled: true },
				individuals: [creature('placed_old', 0), creature('placed_a', 0)]
			}
		};
		const merged = mergePlacedCreatures(
			base,
			unflattenWorld(flattenWorld(content([creature('placed_a', 5)])))
		);
		const individuals = (
			merged.creatures as { individuals: { id: string; position: { x: number } }[] }
		).individuals;
		expect(individuals.map((c) => [c.id, c.position.x])).toEqual([
			['placed_old', 0],
			['placed_a', 5]
		]);
		expect(merged).not.toHaveProperty('placedCreatures');
		expect((merged.creatures as { settings: unknown }).settings).toEqual({ enabled: true });
	});

	it('leave an older world without creature rows exactly as published', () => {
		const base = {
			name: 'w',
			creatures: { settings: {}, individuals: [creature('placed_old', 0)] }
		};
		const merged = mergePlacedCreatures(base, unflattenWorld([]));
		expect(merged.creatures).toEqual(base.creatures);
	});
});
