import { describe, expect, it } from 'vitest';
import { resolveAmbientCreature } from '../../carryableCreatureRef';
import { cellGroupCentres, generatePopulationCell } from '../../CreaturePopulationSystem';
import { validateCreatureWorldState } from '../../CreaturePersistence';
import type { CreatureWorldAccess } from '../../CreatureTypes';
import { validateSpecies } from '../../CreatureValidation';
import { recipeForSave } from '../CreatureBiomeCoat';

const SEED = 'coats-in-world';
const flat: CreatureWorldAccess = { surface: () => 0, blocked: () => false };
/** A stand-in biome map: deserts west of x = 0, jungle east of it. */
const profileAt = (x: number) => (x < 0 ? 'desert' : 'jungle');
const coated: CreatureWorldAccess = { ...flat, profileAt };
const CELLS: [number, number][] = [];
for (let x = -6; x < 6; x += 1) for (let z = -3; z < 3; z += 2) CELLS.push([x, z]);

describe('biome coats in the world (Phase 1)', () => {
	it('places groups at the shared centres, with or without coats', () => {
		for (const [cx, cz] of CELLS) {
			const centres = cellGroupCentres(SEED, cx, cz);
			for (const spawn of generatePopulationCell(SEED, cx, cz, 1, flat)) {
				const slot = Number(spawn.groupId!.split(':').at(-1));
				expect(spawn.groupCentre!.x).toBe(centres[slot].cx);
				expect(spawn.groupCentre!.z).toBe(centres[slot].cz);
			}
		}
	});

	it('dresses each herd in the biome at its centre, and changes nothing else', () => {
		for (const [cx, cz] of CELLS) {
			const plain = generatePopulationCell(SEED, cx, cz, 1, flat);
			const dressed = generatePopulationCell(SEED, cx, cz, 1, coated);
			expect(dressed.map((s) => s.id)).toEqual(plain.map((s) => s.id));
			dressed.forEach((spawn, i) => {
				expect(plain[i].species.appearance.coat).toBeUndefined();
				expect(spawn.species.appearance.coat?.profile).toBe(profileAt(spawn.groupCentre!.x));
				expect(spawn.species.id).toBe(plain[i].species.id);
				expect(spawn.position).toEqual(plain[i].position);
				expect(spawn.individual).toEqual(plain[i].individual);
			});
			// A herd is one colour family: members share its species, apart from rare morphs (Q14).
			const byGroup = new Map<string, unknown>();
			for (const spawn of dressed) {
				if (spawn.species.appearance.coat?.morph) continue;
				const seen = byGroup.get(spawn.groupId!);
				if (seen) expect(spawn.species).toBe(seen);
				else byGroup.set(spawn.groupId!, spawn.species);
			}
		}
	});

	it('does not depend on the density setting', () => {
		let compared = 0;
		for (const [cx, cz] of CELLS) {
			const dense = generatePopulationCell(SEED, cx, cz, 2, coated);
			for (const spawn of generatePopulationCell(SEED, cx, cz, 0.6, coated)) {
				const same = dense.find((s) => s.id === spawn.id);
				if (!same) continue;
				expect(same.species.appearance.palette).toEqual(spawn.species.appearance.palette);
				compared++;
			}
		}
		expect(compared).toBeGreaterThan(10);
	});

	it('resolves an id to exactly what the population spawned: coated on clients, plain in the room', () => {
		for (const [cx, cz] of CELLS)
			for (const spawn of generatePopulationCell(SEED, cx, cz, 1, coated)) {
				const client = resolveAmbientCreature(SEED, spawn.id, profileAt);
				expect(client?.species).toEqual(spawn.species);
				expect(client?.individual).toEqual(spawn.individual);
				const room = resolveAmbientCreature(SEED, spawn.id);
				expect(room?.species.appearance.coat).toBeUndefined();
				expect(room?.species.id).toBe(spawn.species.id);
				expect(room?.species.bodyPlan).toEqual(spawn.species.bodyPlan);
				expect(room?.species.proportions).toEqual(spawn.species.proportions);
			}
	});

	it('keeps the classic colours when coats are switched off (no profile)', () => {
		const off: CreatureWorldAccess = { ...flat, profileAt: () => undefined };
		for (const [cx, cz] of CELLS.slice(0, 6))
			expect(generatePopulationCell(SEED, cx, cz, 1, off)).toEqual(
				generatePopulationCell(SEED, cx, cz, 1, flat)
			);
	});
});

describe('placing a coated creature (Q18)', () => {
	it('saves today recipe shape, with colours baked in and one id per biome', () => {
		const [spawn] = generatePopulationCell(SEED, -3, -1, 2, coated);
		const recipe = recipeForSave(spawn.species);
		expect(recipe.appearance.coat).toBeUndefined();
		expect(recipe.appearance.palette).toEqual(spawn.species.appearance.palette);
		expect(recipe.id).toBe(`${spawn.species.id}_${spawn.species.appearance.coat!.profile}`);
		expect(validateSpecies(recipe)).toBeNull();
		const state = {
			settings: {
				enabled: true,
				generatorVersion: 1 as const,
				creatureDensity: 1,
				maxActiveCreatures: 40
			},
			individuals: [
				{
					id: 'placed_a',
					species: recipe,
					individual: { ...spawn.individual, id: 'ia', speciesId: recipe.id },
					position: { x: 0, y: 0, z: 0 },
					heading: 0,
					state: 'IDLE' as const
				}
			]
		};
		expect(validateCreatureWorldState(state)).toBeNull();
	});
});
