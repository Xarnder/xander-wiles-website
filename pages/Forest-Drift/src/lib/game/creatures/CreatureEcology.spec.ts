import { describe, expect, it } from 'vitest';
import {
	creatureCellAt,
	creatureDimensions,
	generateCreatureDemo,
	generatePopulationCell,
	regionSpecies
} from './CreaturePopulationSystem';
import { advanceCreature, createCreatureState, decideCreature } from './CreatureBehaviourSystem';
import { CreatureSpatialIndex } from './CreatureSpatialIndex';
import { CreatureEventBus } from './CreatureEventBus';
import type { CreatureWorldAccess } from './CreatureTypes';
const flat: CreatureWorldAccess = { surface: () => 0, blocked: () => false };
describe('deterministic world-space ecology', () => {
	it('floors negative coordinates independently of terrain chunks', () => {
		expect(creatureCellAt(-0.01, -64.01)).toEqual({ x: -1, z: -2 });
	});
	it('regenerates the same individuals after unloading', () => {
		const a = generatePopulationCell('forest', -3, 5, 6.25, flat);
		expect(a.length).toBeGreaterThan(0);
		expect(generatePopulationCell('forest', -3, 5, 6.25, flat)).toEqual(a);
		expect(generatePopulationCell('other', -3, 5, 6.25, flat)).not.toEqual(a);
	});
	it('reuses the regional species pool across adjacent population cells', () => {
		const pool = new Set(regionSpecies('forest', 0, 0).map((s) => s.id));
		for (let x = 0; x < 8; x++)
			for (const spawn of generatePopulationCell('forest', x, 2, 6.25, flat))
				expect(pool.has(spawn.species.id)).toBe(true);
	});
	it('has sparse normal density and bounded rare size tiers', () => {
		let count = 0,
			giants = 0,
			common = 0;
		for (let x = -100; x < 100; x++) {
			const spawns = generatePopulationCell('forest', x, 0, 1, flat);
			count += spawns.length;
			for (const s of spawns) {
				const h = creatureDimensions(s.species).height;
				if (h >= 10) giants++;
				if (h <= 1.51) common++;
			}
		}
		expect(count).toBeLessThan(800);
		expect(common).toBeGreaterThan(giants * 10);
		const heights = regionSpecies('forest', 0, 0).map((s) => creatureDimensions(s).height);
		expect(heights[5]).toBeGreaterThanOrEqual(10);
		expect(heights[5]).toBeLessThanOrEqual(30);
	});
	it('rejects invalid terrain and building footprints without partial invalid groups', () => {
		for (const access of [
			{ surface: () => NaN, blocked: () => false },
			{ surface: () => 0, blocked: () => true },
			{ surface: (x: number) => x * 4, blocked: () => false }
		])
			expect(generatePopulationCell('forest', 0, 0, 10, access)).toEqual([]);
		expect(generatePopulationCell('forest', 0, 0, 0, flat)).toEqual([]);
	});
	it('provides separate fixed validation species including a giant', () => {
		const demo = generateCreatureDemo(flat);
		expect(demo).toHaveLength(10);
		expect(new Set(demo.map((s) => s.species.id)).size).toBe(5);
		expect(Math.max(...demo.map((s) => creatureDimensions(s.species).height))).toBeGreaterThan(20);
		expect(generateCreatureDemo(flat)).toEqual(demo);
	});
});
describe('autonomous intent and safe movement', () => {
	function state(index = 0) {
		return createCreatureState(structuredClone(generateCreatureDemo(flat)[index]));
	}
	it('a curious creature approaches and a fearful creature flees', () => {
		const curious = state();
		const player = { ...curious.position, x: curious.position.x + 4 };
		decideCreature(curious, player, [], 0, flat);
		expect(curious.state).toBe('APPROACH');
		expect(curious.intent.velocity.x).toBeGreaterThan(0);
		const shy = state(4);
		decideCreature(shy, { ...shy.position, x: shy.position.x + 2 }, [], 0, flat);
		expect(shy.state).toBe('FLEE');
		expect(shy.intent.velocity.x).toBeLessThan(0);
	});
	it('returns home and respects decision frequency', () => {
		const s = state();
		s.position.x += s.spawn.species.behaviour.wanderRadius;
		decideCreature(s, { x: 1000, y: 0, z: 1000 }, [], 0, flat);
		expect(s.state).toBe('RETURN_TO_GROUP');
		expect(s.intent.velocity.x).toBeLessThan(0);
		const decision = s.decisionIndex;
		decideCreature(s, { x: 1000, y: 0, z: 1000 }, [], 0.01, flat);
		expect(s.decisionIndex).toBe(decision);
		expect(s.nextDecision).toBeGreaterThanOrEqual(0.2);
		expect(s.nextDecision).toBeLessThanOrEqual(0.5);
	});
	it('runs reproducibly for minutes inside its wander radius', () => {
		const a = state(),
			b = state();
		const player = { x: 1000, y: 0, z: 1000 };
		for (let i = 0; i < 2400; i++) {
			for (const s of [a, b]) {
				decideCreature(s, player, [], i * 0.05, flat);
				advanceCreature(s, 0.05, flat);
			}
			expect(
				Math.hypot(a.position.x - a.spawn.groupCentre.x, a.position.z - a.spawn.groupCentre.z)
			).toBeLessThanOrEqual(a.spawn.species.behaviour.wanderRadius * 1.02);
		}
		expect(a).toEqual(b);
	});
	it('does not tunnel through building walls or invalid support', () => {
		const s = state();
		const initial = { ...s.position };
		s.intent.velocity = { x: 50, y: 0, z: 0 };
		advanceCreature(s, 1, { surface: () => 0, blocked: (x) => x > initial.x + 0.2 });
		expect(s.position.x).toBeLessThanOrEqual(initial.x + 0.2);
		s.intent.velocity = { x: 1, y: 0, z: 0 };
		advanceCreature(s, 0.1, { surface: () => NaN, blocked: () => false });
		expect(Number.isFinite(s.position.y)).toBe(true);
		expect(s.intent.gait).toBe('idle');
	});
	it('separates neighboring individuals while keeping group wander bounded', () => {
		const a = state(),
			other = state(1);
		other.position = { ...a.position, x: a.position.x + 0.1 };
		a.state = 'WANDER';
		a.target = { ...a.position, z: a.position.z + 3 };
		decideCreature(a, { x: 1000, y: 0, z: 1000 }, [other], 0, flat);
		expect(a.intent.velocity.x).toBeLessThan(0);
	});
});
it('updates and removes spatial entries across negative cell boundaries', () => {
	const index = new CreatureSpatialIndex<{ position: { x: number; y: number; z: number } }>(10);
	const a = { position: { x: -0.1, y: 0, z: 0 } };
	index.set('a', a);
	expect(index.nearby(0, 0, 1)).toEqual([a]);
	a.position.x = 30;
	index.upsert('a', a);
	expect(index.nearby(0, 0, 1)).toEqual([]);
	expect(index.query(a.position, 1)).toEqual([a]);
	index.remove('a');
	expect(index.size).toBe(0);
});
it('cleans up event subscriptions', () => {
	const bus = new CreatureEventBus();
	let count = 0;
	const unsubscribe = bus.subscribe(() => count++);
	bus.emit({ type: 'state', id: 'a', state: 'LOOK' });
	unsubscribe();
	bus.emit({ type: 'state', id: 'a', state: 'IDLE' });
	expect(count).toBe(1);
});
