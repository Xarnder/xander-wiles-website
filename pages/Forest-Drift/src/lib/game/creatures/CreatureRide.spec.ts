import { afterEach, describe, expect, it } from 'vitest';
import { CreatureRuntimeManager } from './CreatureRuntimeManager';
import { rideFor, rideTopSpeed } from './creatureRiding';
import { generateIndividual } from './IndividualGenerator';
import { regionSpecies } from './CreaturePopulationSystem';
import type { CreatureWorldAccess } from './CreatureTypes';

const access: CreatureWorldAccess = { surface: () => 0, blocked: () => false };
const managers: CreatureRuntimeManager[] = [];
const RUN = 12;
const FORWARD = { x: 0, z: 1, sprint: false };

/** A world with a herd around the origin, settled for a few seconds. */
function world() {
	const c = new CreatureRuntimeManager('ride-test', access, undefined);
	managers.push(c);
	for (let i = 0; i < 40; i++) c.update({ x: 0, y: 0, z: 0 }, 0.1, 'high');
	return c;
}

/** A live, rideable creature and a look ray through its middle. */
function biped(c: CreatureRuntimeManager) {
	for (const [id, live] of c.live) {
		if (!c.isRideable(id)) continue;
		const p = live.compiled.object.position;
		const mid = p.y + live.compiled.compilation.collision.height / 2;
		const reach = live.compiled.compilation.collision.radius + 1;
		return { id, eye: { x: p.x + reach, y: mid, z: p.z }, dir: { x: -1, y: 0, z: 0 } };
	}
	throw new Error('no rideable creature in range');
}

/** One frame as the scene runs it: steer the mount, then update everything else. */
function frame(c: CreatureRuntimeManager, input = FORWARD, dt = 1 / 30) {
	c.steerRide(input, 0, RUN, dt);
	const at = c.rideFrame()?.anchor ?? { x: 0, y: 0, z: 0 };
	c.update({ x: at.x, y: at.y, z: at.z }, dt, 'high');
}

afterEach(() => {
	for (const c of managers.splice(0)) c.dispose();
});

describe('riding in the creature runtime', () => {
	it('finds bipeds only, in reach only', () => {
		const c = world();
		const { id, eye, dir } = biped(c);
		expect(c.pickRideable(eye, dir, 3)?.id).toBe(id);
		expect(c.pickRideable({ ...eye, x: eye.x + 10 }, dir, 3)?.id).not.toBe(id);
		expect(c.pickCarryable(eye, dir, 3)?.id).not.toBe(id);
		expect(c.nearestRideable({ x: 0, y: 0, z: 0 })).not.toBeNull();
	});

	it('takes the mount out of herd behaviour and steers it from the rider’s input', () => {
		const c = world();
		const { id } = biped(c);
		const mount = c.mountRide(id);
		expect(mount?.profile).toEqual(rideFor(mount!.definition));
		expect(c.riddenId).toBe(id);
		const start = { ...c.logical.get(id)!.position };
		for (let i = 0; i < 90; i++) frame(c);
		const r = c.logical.get(id)!;
		// Camera yaw 0 looks along -Z: W takes it that way, fast.
		expect(start.z - r.position.z).toBeGreaterThan(RUN * 2);
		expect(Math.hypot(r.intent.velocity.x, r.intent.velocity.z)).toBeCloseTo(
			rideTopSpeed(mount!.profile, RUN, false),
			3
		);
		expect(r.intent.gait).toBe('run');
	});

	it('keeps the mount drawn and in the world however far it goes, and never pushes the rider', () => {
		const c = world();
		const { id } = biped(c);
		c.mountRide(id);
		for (let i = 0; i < 30 * 40; i++) frame(c, { x: 0, z: 1, sprint: true });
		expect(c.live.has(id)).toBe(true);
		expect(c.logical.has(id)).toBe(true);
		const seat = c.rideFrame()!;
		expect(Math.hypot(seat.anchor.x, seat.anchor.z)).toBeGreaterThan(400);
		const pushed = c.resolvePlayer(
			seat.anchor.x,
			seat.anchor.z,
			seat.anchor.y - 1,
			seat.anchor.y + 1
		);
		expect(pushed).toEqual({ x: seat.anchor.x, z: seat.anchor.z });
	});

	it('puts the seat on top of the creature, following it', () => {
		const c = world();
		const { id } = biped(c);
		const { profile } = c.mountRide(id)!;
		for (let i = 0; i < 30; i++) frame(c);
		const seat = c.rideFrame()!;
		const r = c.logical.get(id)!;
		expect(seat.kind).toBe(profile.seat);
		expect(seat.anchor.y - r.position.y).toBeGreaterThan(profile.height * 0.3);
		expect(Math.hypot(seat.anchor.x - r.position.x, seat.anchor.z - r.position.z)).toBeLessThan(
			profile.height
		);
		expect(seat.heading).toBe(r.heading);
	});

	it('carries the rider with the body’s bob and sway, not a fixed point over its feet', () => {
		const c = world();
		const { id } = biped(c);
		const { profile } = c.mountRide(id)!;
		// Standing still, the seat sits where a still body puts it.
		for (let i = 0; i < 30; i++) frame(c, { x: 0, z: 0, sprint: false });
		const idle = c.rideFrame()!;
		expect(Math.abs(idle.anchor.y - idle.steadyY)).toBeLessThan(profile.height * 0.05);
		// Running, it rises and falls with the body.
		const offsets: number[] = [];
		for (let i = 0; i < 90; i++) {
			frame(c, { x: 0, z: 1, sprint: true });
			const seat = c.rideFrame()!;
			offsets.push(seat.anchor.y - seat.steadyY);
		}
		expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(0.005);
	});

	it('gives the mount back to its herd where it was left (Q19 A)', () => {
		const c = world();
		const { id } = biped(c);
		c.mountRide(id);
		for (let i = 0; i < 60; i++) frame(c);
		const at = { ...c.logical.get(id)!.position };
		expect(c.rideFootprint()).toMatchObject({ x: at.x, z: at.z });
		expect(c.dismountRide()).toBe(id);
		expect(c.riddenId).toBeNull();
		const r = c.logical.get(id)!;
		expect(r.position).toEqual(at);
		expect(r.state).toBe('IDLE');
		expect(r.intent.gait).toBe('idle');
		expect(c.rideFrame()).toBeNull();
	});

	it('saves a placed (Lab) creature’s new spot when the rider gets off (Q14 A)', () => {
		const c = world();
		let species = regionSpecies('ride-test', 0, 0).find((s) => s.bodyPlan.id === 'biped');
		for (let x = 1; !species && x < 50; x++)
			species = regionSpecies('ride-test', x, 0).find((s) => s.bodyPlan.id === 'biped');
		if (!species) throw new Error('no biped species');
		const placedId = c.place(
			{ species, individual: generateIndividual(species, 3) },
			{ x: 30, y: 0, z: 30 }
		);
		for (let i = 0; i < 20; i++) c.update({ x: 30, y: 0, z: 30 }, 0.1, 'high');
		expect(c.mountRide(placedId)).not.toBeNull();
		for (let i = 0; i < 60; i++) frame(c);
		const placedRevision = c.placedRevision;
		c.dismountRide();
		expect(c.placedRevision).toBe(placedRevision + 1);
		const saved = c.serialize().individuals.find((p) => p.id === placedId)!;
		expect(saved.position.z).toBeLessThan(25);
	});

	it('forgets the ride when the world is reset', () => {
		const c = world();
		const { id } = biped(c);
		c.mountRide(id);
		c.setSeed('another-world');
		expect(c.riddenId).toBeNull();
		expect(c.isRidden(id)).toBe(false);
	});
});
