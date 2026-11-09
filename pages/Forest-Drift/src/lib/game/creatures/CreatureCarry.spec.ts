import { afterEach, describe, expect, it } from 'vitest';
import { CreatureRuntimeManager } from './CreatureRuntimeManager';
import { abilityFor } from './creatureAbilities';
import { createDefaultCreatureState } from './CreaturePersistence';
import { regionSpecies } from './CreaturePopulationSystem';
import { generateIndividual } from './IndividualGenerator';
import type { CreatureWorldAccess } from './CreatureTypes';

const access: CreatureWorldAccess = { surface: () => 0, blocked: () => false };
const managers: CreatureRuntimeManager[] = [];

function world(seed = 'carry-test') {
	const c = new CreatureRuntimeManager(seed, access, undefined);
	managers.push(c);
	for (let i = 0; i < 30; i++) c.update({ x: 0, y: 0, z: 0 }, 0.1, 'high');
	return c;
}

/** A live, carryable creature and a look ray that passes through its middle from 1.5 m away. */
function target(c: CreatureRuntimeManager) {
	for (const [id, live] of c.live) {
		const r = c.logical.get(id)!;
		if (!abilityFor({ species: r.spawn.species, individual: r.spawn.individual })) continue;
		const p = live.compiled.object.position;
		const mid = p.y + live.compiled.compilation.collision.height / 2;
		return { id, eye: { x: p.x + 1.5, y: mid, z: p.z }, dir: { x: -1, y: 0, z: 0 } };
	}
	throw new Error('no carryable creature in range');
}

afterEach(() => {
	for (const c of managers.splice(0)) c.dispose();
});

describe('carrying creatures', () => {
	it('picks the carryable creature under the crosshair, within reach only', () => {
		const c = world();
		const { id, eye, dir } = target(c);
		expect(c.pickCarryable(eye, dir, 2)?.id).toBe(id);
		expect(c.pickCarryable(eye, { x: 1, y: 0, z: 0 }, 2)?.id).not.toBe(id);
		expect(c.pickCarryable({ ...eye, x: eye.x + 3 }, dir, 2)?.id).not.toBe(id);
	});

	it('takes a carried creature out of the herd, collision and streaming', () => {
		const c = world();
		const { id } = target(c);
		const live = c.live.get(id)!.compiled.object.position.clone();
		expect(c.carry(id)).not.toBeNull();
		expect(c.isCarried(id)).toBe(true);
		expect(c.logical.has(id)).toBe(false);
		expect(c.live.has(id)).toBe(false);
		// Nothing's body is where it stood any more.
		expect(c.bodyAt(live.x, live.z, live.y, live.y + 1.8)).toBe(false);
		// Its cell rescans and reloads without spawning a second copy.
		for (let i = 0; i < 20; i++) c.update({ x: 0, y: 0, z: 0 }, 0.1, 'high');
		c.update({ x: 5000, y: 0, z: 5000 }, 0.1, 'high');
		c.update({ x: 0, y: 0, z: 0 }, 0.1, 'high');
		expect(c.logical.has(id)).toBe(false);
		expect(c.isCarried(id)).toBe(true);
	});

	it("refuses creatures that aren't here, are already carried or are too big", () => {
		const c = world();
		const { id } = target(c);
		expect(c.carry('group:nowhere:0:0:0:0')).toBeNull();
		expect(c.carry(id)).not.toBeNull();
		expect(c.carry(id)).toBeNull();
		const big = [...c.logical.values()].find(
			(r) => !abilityFor({ species: r.spawn.species, individual: r.spawn.individual })
		)!;
		expect(c.carry(big.spawn.id)).toBeNull();
		expect(c.logical.has(big.spawn.id)).toBe(true);
	});

	it('puts a creature down where it is released, even far from its herd', () => {
		const c = world();
		const { id } = target(c);
		c.carry(id);
		c.update({ x: 900, y: 0, z: 0 }, 0.1, 'high');
		expect(c.release(id, { x: 901, y: 50, z: 2 }, 1.2)).toBe(true);
		expect(c.isCarried(id)).toBe(false);
		for (let i = 0; i < 5; i++) c.update({ x: 900, y: 0, z: 0 }, 0.1, 'high');
		const r = c.logical.get(id)!;
		expect(r).toBeDefined();
		expect(r.position.x).toBeCloseTo(901, 0);
		expect(r.position.y).toBe(0); // snapped to the ground, not where the arm was
		expect(c.release(id, { x: 0, y: 0, z: 0 }, 0)).toBe(false);
	});

	it("saves a placed creature's new spot when it is put down", () => {
		const species = regionSpecies('forest', 0, 0)[0];
		const c = new CreatureRuntimeManager('placed-carry', access, createDefaultCreatureState());
		managers.push(c);
		const id = c.place(
			{ species, individual: generateIndividual(species, 3) },
			{ x: 2, y: 0, z: 2 }
		);
		for (let i = 0; i < 5; i++) c.update({ x: 0, y: 0, z: 0 }, 0.1, 'high');
		const revision = c.revision;
		expect(c.carry(id)).not.toBeNull();
		// Saving mid-carry keeps the last put-down spot.
		expect(c.serialize().individuals[0].position).toMatchObject({ x: 2, z: 2 });
		c.release(id, { x: 12, y: 0, z: -4 }, 0.5);
		expect(c.revision).toBeGreaterThan(revision);
		expect(c.serialize().individuals[0]).toMatchObject({
			position: { x: 12, z: -4 },
			heading: 0.5
		});
	});

	it('forgets carried creatures when the world changes', () => {
		const c = world();
		const { id } = target(c);
		c.carry(id);
		c.setSeed('another-world');
		expect(c.isCarried(id)).toBe(false);
	});
});

describe('creatures carried by other players (online)', () => {
	it('takes a creature out of this herd while someone else holds it, then puts it where they did', () => {
		const c = world();
		const { id } = target(c);
		const r = c.logical.get(id)!;
		const definition = { species: r.spawn.species, individual: r.spawn.individual };
		c.holdRemote(id, 3, definition);
		expect(c.carrierOf(id)).toBe(3);
		expect(c.logical.has(id)).toBe(false);
		expect(c.carry(id)).toBeNull(); // not ours to pick up
		c.release(id, { x: 10, y: 0, z: 10 }, 0);
		expect(c.carrierOf(id)).toBeNull();
		expect(c.logical.get(id)!.position.x).toBeCloseTo(10);
	});

	it('holds a creature this client never saw, from its recipe', () => {
		const c = world();
		const { id } = target(c);
		const r = c.logical.get(id)!;
		const definition = { species: r.spawn.species, individual: r.spawn.individual };
		const unseen = id.replace(/:\d+$/, ':9');
		c.holdRemote(unseen, 2, definition);
		expect(c.carrierOf(unseen)).toBe(2);
		c.release(unseen, { x: 3, y: 0, z: 4 }, 0);
		expect(c.logical.get(unseen)!.spawn.groupCentre).toMatchObject({ x: 3, z: 4 });
	});

	it('lets the herd have it back when the carrier vanished without saying where', () => {
		const c = world();
		const { id } = target(c);
		const r = c.logical.get(id)!;
		c.holdRemote(id, 1, { species: r.spawn.species, individual: r.spawn.individual });
		c.forget(id);
		for (let i = 0; i < 3; i++) c.update({ x: 0, y: 0, z: 0 }, 0.1, 'high');
		expect(c.logical.has(id)).toBe(true);
	});

	it('carries a granted creature from its recipe when the local herd lost it', () => {
		const c = world();
		const { id } = target(c);
		const r = c.logical.get(id)!;
		const definition = { species: r.spawn.species, individual: r.spawn.individual };
		c.holdRemote(id, 4, definition);
		c.release(id, { x: 0, y: 0, z: 0 }, 0);
		c.logical.delete(id);
		expect(c.carry(id, definition)).toEqual(definition);
		expect(c.carrierOf(id)).toBe('local');
	});
});

describe('placed creatures shared online (F2)', () => {
	const species = regionSpecies('forest', 0, 0)[0];
	const placed = (id: string, x: number) => ({
		id,
		species,
		individual: generateIndividual(species, 4),
		position: { x, y: 0, z: 0 },
		heading: 0,
		state: 'IDLE' as const
	});

	it('adds, moves and removes placed creatures from other players, bumping the shared revision', () => {
		const c = new CreatureRuntimeManager('shared', access, createDefaultCreatureState());
		managers.push(c);
		const revision = c.placedRevision;
		c.applyPlaced([placed('placed_x', 4)], new Set(['placed_x']));
		expect(c.sharedPlacedCreatures().map((p) => p.id)).toEqual(['placed_x']);
		expect(c.logical.get('placed_x')!.position.x).toBe(4);
		c.applyPlaced([placed('placed_x', 8)], new Set(['placed_x']));
		expect(c.logical.get('placed_x')!.position.x).toBe(8);
		c.applyPlaced([], new Set(['placed_x']));
		expect(c.logical.has('placed_x')).toBe(false);
		expect(c.sharedPlacedCreatures()).toEqual([]);
		expect(c.placedRevision).toBe(revision + 3);
	});

	it("doesn't share wandering, only put-downs", () => {
		const c = new CreatureRuntimeManager('shared', access, createDefaultCreatureState());
		managers.push(c);
		const id = c.place(
			{ species, individual: generateIndividual(species, 4) },
			{ x: 3, y: 0, z: 3 }
		);
		const revision = c.placedRevision;
		for (let i = 0; i < 80; i++) c.update({ x: 0, y: 0, z: 0 }, 0.1, 'high');
		expect(c.placedRevision).toBe(revision);
		c.carry(id);
		c.release(id, { x: 7, y: 0, z: 7 }, 0);
		expect(c.placedRevision).toBe(revision + 1);
	});

	it("shows another player's put-down without saving it (the carrier's edit does that)", () => {
		const c = new CreatureRuntimeManager('shared', access, createDefaultCreatureState());
		managers.push(c);
		const id = c.place(
			{ species, individual: generateIndividual(species, 4) },
			{ x: 3, y: 0, z: 3 }
		);
		const r = c.logical.get(id)!;
		c.holdRemote(id, 2, { species: r.spawn.species, individual: r.spawn.individual });
		const revision = c.placedRevision;
		c.release(id, { x: 9, y: 0, z: 9 }, 0, { save: false });
		expect(c.logical.get(id)!.position.x).toBe(9);
		expect(c.sharedPlacedCreatures()[0].position.x).toBe(3);
		expect(c.placedRevision).toBe(revision);
	});
});

describe('finding carryable creatures (waypoints and badges)', () => {
	it('finds the nearest carryable creature in the herd, and nothing past the limit', () => {
		const c = world();
		const { id } = target(c);
		const at = c.creaturePosition(id)!;
		const found = c.nearestCarryable({ x: at.x + 0.5, y: 0, z: at.z })!;
		expect(found.id).toBe(id);
		expect(c.isCarryable(found.id)).toBe(true);
		expect(found.name).toBe(c.logical.get(id)!.spawn.species.name);
		expect(c.nearestCarryable({ x: 100_000, y: 0, z: 100_000 }, 50)).toBeNull();
	});

	it('skips creatures that are too big, and ones being carried', () => {
		const c = world();
		const { id } = target(c);
		const big = [...c.logical.keys()].find((k) => !c.isCarryable(k))!;
		expect(c.isCarryable(big)).toBe(false);
		const at = c.creaturePosition(id)!;
		c.carry(id);
		expect(c.creaturePosition(id)).toBeNull();
		expect(c.nearestCarryable({ x: at.x, y: 0, z: at.z })?.id).not.toBe(id);
	});
});
