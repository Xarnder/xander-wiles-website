import { describe, expect, it } from 'vitest';
import { RideController, type RideClaimResult, type RideHost } from '../RideController';
import type { RideInput } from '../../creatures/CreatureRideMotion';
import type { RideProfile } from '../../creatures/creatureRiding';
import type { CreatureDefinition } from '../../creatures/CreatureTypes';

const definition = { species: { name: 'Dusk Stilt' } } as unknown as CreatureDefinition;
const profile: RideProfile = {
	seat: 'neck',
	height: 2,
	sprint: 1.3,
	cruise: 1.1,
	turnRate: 2,
	maxCadence: 5
};

/** A host whose world is a few flags, recording what the controller asked it to do. */
function harness(options: { online?: boolean } = {}) {
	const world = {
		allowed: true,
		cannotMount: false,
		target: { id: 'group:s:0:0:0:0', definition, distance: 1.5 } as {
			id: string;
			definition: CreatureDefinition;
			distance: number;
		} | null,
		ridden: null as string | null,
		seated: false,
		blocked: false,
		input: { x: 0, z: 1, sprint: false } as RideInput,
		claims: [] as ((result: RideClaimResult) => void)[]
	};
	const calls: string[] = [];
	const steered: RideInput[] = [];
	const host: RideHost = {
		eye: () => ({ x: 0, y: 1.7, z: 0 }),
		aim: () => ({ x: 0, y: 0, z: -1 }),
		inputAllowed: () => world.allowed,
		cannotMount: () => world.cannotMount,
		pick: () => world.target,
		mount: (id) => {
			calls.push(`mount ${id}`);
			world.ridden = id;
			world.seated = true;
			return profile;
		},
		seated: () => world.seated,
		isRidden: (id) => world.ridden === id,
		input: () => world.input,
		steer: (input) => {
			steered.push(input);
			return { blocked: world.blocked };
		},
		dismount: (id, instant) => {
			calls.push(`dismount ${id}${instant ? ' instant' : ''}`);
			world.ridden = null;
			world.seated = false;
		},
		abandon: (id) => {
			calls.push(`abandon ${id}`);
			world.ridden = null;
			world.seated = false;
		},
		...(options.online
			? { claim: () => new Promise<RideClaimResult>((resolve) => world.claims.push(resolve)) }
			: {})
	};
	const events: string[] = [];
	const ride = new RideController(host, {
		change: (state) =>
			events.push(state.riding ? `riding ${state.species} ${state.seat}` : 'on foot'),
		mounted: (species) => events.push(`mounted ${species}`),
		dismounted: (species) => events.push(`dismounted ${species}`),
		refused: (reason) => events.push(`refused ${reason}`),
		blocked: () => events.push('blocked')
	});
	return { ride, world, calls, steered, events };
}

describe('RideController', () => {
	it('climbs on, steers every frame and climbs off (single player)', () => {
		const { ride, world, calls, steered, events } = harness();
		ride.update(0.1);
		expect(ride.target?.id).toBe(world.target!.id);
		expect(ride.mount()).toBe(true);
		expect(ride.riding).toBe(true);
		expect(ride.state()).toEqual({ riding: true, species: 'Dusk Stilt', seat: 'neck' });
		ride.update(1 / 60);
		ride.update(1 / 60);
		expect(steered).toEqual([world.input, world.input]);
		// No looking for something else to climb onto while riding.
		expect(ride.target).toBeNull();
		ride.dismount();
		expect(ride.riding).toBe(false);
		expect(calls).toEqual([`mount ${world.target!.id}`, `dismount ${world.target!.id}`]);
		expect(events).toEqual([
			'mounted Dusk Stilt',
			'riding Dusk Stilt neck',
			'dismounted Dusk Stilt',
			'on foot'
		]);
	});

	it('brakes the mount when input isn’t the game’s (a menu opened)', () => {
		const { ride, world, steered } = harness();
		ride.update(0.1);
		ride.mount();
		world.allowed = false;
		ride.update(1 / 60);
		expect(steered.at(-1)).toEqual({ x: 0, z: 0, sprint: false });
	});

	it('won’t climb on with nothing in reach, while flying or seated, or with input elsewhere', () => {
		const { ride, world } = harness();
		world.target = null;
		ride.update(0.1);
		expect(ride.mount()).toBe(false);
		world.target = { id: 'x', definition, distance: 1 };
		world.cannotMount = true;
		ride.update(0.1);
		expect(ride.target).toBeNull();
		expect(ride.mount()).toBe(false);
		world.cannotMount = false;
		world.allowed = false;
		expect(ride.mount()).toBe(false);
	});

	it('says "can’t go that way" at most every three seconds', () => {
		const { ride, world, events } = harness();
		ride.update(0.1);
		ride.mount();
		world.blocked = true;
		for (let i = 0; i < 60 * 5; i++) ride.update(1 / 60);
		expect(events.filter((e) => e === 'blocked')).toHaveLength(2);
	});

	it('lets go of the mount when the ride ends some other way (teleported, world replaced)', () => {
		const { ride, world, calls, events } = harness();
		ride.update(0.1);
		ride.mount();
		world.seated = false;
		ride.update(1 / 60);
		expect(ride.riding).toBe(false);
		expect(calls.at(-1)).toBe(`abandon ${world.target!.id}`);
		expect(events).toContain('dismounted Dusk Stilt');
	});

	it('climbs off instantly when told to (knocked out)', () => {
		const { ride, calls } = harness();
		ride.update(0.1);
		ride.mount();
		ride.dismount(true);
		expect(calls.at(-1)).toMatch(/instant$/);
	});

	it('online: waits for the room, swallows repeat presses, and hears refusals', async () => {
		const { ride, world, calls, events } = harness({ online: true });
		ride.update(0.1);
		expect(ride.mount()).toBe(true);
		expect(ride.pending).toBe(true);
		expect(ride.pendingSpecies).toBe('Dusk Stilt');
		expect(ride.mount()).toBe(true);
		expect(world.claims).toHaveLength(1);
		world.claims[0]({ ok: false, reason: 'taken' });
		await Promise.resolve();
		expect(ride.pending).toBe(false);
		expect(ride.riding).toBe(false);
		expect(events).toContain('refused taken');
		ride.update(0.1);
		ride.mount();
		world.claims[1]({ ok: true });
		await Promise.resolve();
		expect(ride.riding).toBe(true);
		expect(calls).toEqual([`mount ${world.target!.id}`]);
	});

	it('online: the room ending the ride gets the rider off', () => {
		const { ride, world, calls } = harness();
		ride.update(0.1);
		ride.mount();
		ride.forceDismount('someone else');
		expect(ride.riding).toBe(true);
		ride.forceDismount(world.target!.id);
		expect(ride.riding).toBe(false);
		expect(calls.at(-1)).toBe(`dismount ${world.target!.id}`);
	});
});
