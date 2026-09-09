import { describe, it, expect } from 'vitest';
import { CreatureRuntimeManager } from './CreatureRuntimeManager';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { createDefaultCreatureState, validateCreatureWorldState } from './CreaturePersistence';
const access = { surface: () => 0, blocked: () => false };
describe('bounded creature runtime', () => {
	it('streams/regenerates identities immediately across cell changes and disposes every mesh', () => {
		const c = new CreatureRuntimeManager('runtime-test', access, undefined);
		for (let i = 0; i < 20; i++) c.update({ x: 0, y: 0, z: 0 }, 0.1, 'low');
		const ids = [...c.logical.keys()].sort();
		expect(ids.length).toBeGreaterThan(0);
		expect(c.live.size).toBeLessThanOrEqual(16);
		const old = [...c.live.values()].map((r) => r.compiled);
		c.update({ x: 4000, y: 0, z: 4000 }, 0.1, 'low');
		expect(old.every((o) => o.object.parent === null)).toBe(true);
		c.update({ x: 0, y: 0, z: 0 }, 0.1, 'low');
		expect([...c.logical.keys()].sort()).toEqual(ids);
		c.dispose();
		expect(c.group.children).toHaveLength(0);
		expect(c.live.size).toBe(0);
	});
	it('persists recipes only and safely places the same individual after reload', () => {
		const species = generateSpecies(42),
			individual = generateIndividual(species, 7),
			definition = { species, individual };
		const c = new CreatureRuntimeManager('placed', access, createDefaultCreatureState());
		const a = c.place(definition, { x: 5, y: 0, z: 5 });
		const saved = c.serialize();
		expect(validateCreatureWorldState(saved)).toBeNull();
		c.dispose();
		const restored = new CreatureRuntimeManager('placed', access, saved);
		const b = restored.place(definition, { x: 15, y: 0, z: 5 });
		expect(b).not.toBe(a);
		expect(restored.serialize().individuals).toHaveLength(2);
		expect(JSON.stringify(restored.serialize())).not.toContain('geometry');
		restored.dispose();
	});
	it('rejects blocked placement before altering persistent state', () => {
		const c = new CreatureRuntimeManager(
			'blocked',
			{ surface: () => 0, blocked: () => true },
			undefined
		);
		const species = generateSpecies(10);
		expect(() =>
			c.place({ species, individual: generateIndividual(species, 2) }, { x: 0, y: 0, z: 0 })
		).toThrow('open ground');
		expect(c.serialize().individuals).toHaveLength(0);
		c.dispose();
	});
});
