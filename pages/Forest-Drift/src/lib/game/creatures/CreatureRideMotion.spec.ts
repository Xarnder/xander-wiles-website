import { describe, expect, it } from 'vitest';
import { createCreatureState } from './CreatureBehaviourSystem';
import { regionSpecies } from './CreaturePopulationSystem';
import { generateIndividual } from './IndividualGenerator';
import {
	NO_RIDE_INPUT,
	advanceRiddenCreature,
	rideInputHeading,
	type RideInput
} from './CreatureRideMotion';
import { rideFor, rideTopSpeed, type RideProfile } from './creatureRiding';
import type {
	CreatureRuntimeDefinition,
	CreatureWorldAccess,
	SpeciesGenome
} from './CreatureTypes';

const RUN = 12;
const flat: CreatureWorldAccess = { surface: () => 0, blocked: () => false };

/** The first regional biped no shorter than `min` and no taller than `max`. */
function biped(
	min: number,
	max: number
): { state: CreatureRuntimeDefinition; profile: RideProfile } {
	for (let x = 0; x < 40; x++)
		for (let z = 0; z < 40; z++)
			for (const species of regionSpecies('ride-motion', x, z) as SpeciesGenome[]) {
				if (species.bodyPlan.id !== 'biped') continue;
				const individual = generateIndividual(species, 7);
				const profile = rideFor({ species, individual });
				if (!profile || profile.height < min || profile.height > max) continue;
				const state = createCreatureState({
					id: 'group:ride-motion:0:0:0:0',
					species,
					individual,
					position: { x: 0, y: 0, z: 0 },
					heading: 0,
					groupId: 'group:ride-motion:0:0:0',
					groupCentre: { x: 0, y: 0, z: 0 },
					cellX: 0,
					cellZ: 0,
					persistent: false
				});
				return { state, profile };
			}
	throw new Error(`no biped between ${min} and ${max} m`);
}

/** Runs `seconds` of riding at 60 fps with the camera looking along -Z (yaw 0). */
function ride(
	state: CreatureRuntimeDefinition,
	profile: RideProfile,
	input: RideInput,
	seconds: number,
	access = flat,
	yaw = 0
) {
	let blocked = false;
	for (let t = 0; t < seconds; t += 1 / 60)
		blocked = advanceRiddenCreature(state, profile, input, yaw, RUN, 1 / 60, access).blocked;
	return { blocked };
}

const FORWARD: RideInput = { x: 0, z: 1, sprint: false };
const SPRINT: RideInput = { x: 0, z: 1, sprint: true };

describe('camera-relative steering (Q2 A)', () => {
	it('turns W into the camera’s forward and D into its right', () => {
		// Camera yaw 0 looks along -Z: heading π. Its right is +X: heading π/2.
		expect(Math.abs(rideInputHeading(FORWARD, 0)!)).toBeCloseTo(Math.PI, 9);
		expect(rideInputHeading({ x: 1, z: 0, sprint: false }, 0)).toBeCloseTo(Math.PI / 2, 9);
		expect(rideInputHeading({ x: 0.01, z: 0.02, sprint: false }, 0)).toBeNull();
	});

	it('turns in an arc at the profile’s turn rate, not a snap', () => {
		const { state, profile } = biped(1.2, 3.4);
		advanceRiddenCreature(state, profile, FORWARD, 0, RUN, 0.1, flat);
		expect(Math.abs(state.heading)).toBeCloseTo(profile.turnRate * 0.1, 6);
	});
});

describe('ridden movement', () => {
	it('is faster than running, and sprinting is faster still (Q3 B)', () => {
		const { state, profile } = biped(1.2, 3.4);
		state.heading = Math.PI; // already facing where the camera looks
		ride(state, profile, FORWARD, 3);
		const cruise = Math.hypot(state.intent.velocity.x, state.intent.velocity.z);
		expect(cruise).toBeCloseTo(rideTopSpeed(profile, RUN, false), 6);
		expect(cruise).toBeGreaterThan(RUN);
		ride(state, profile, SPRINT, 3);
		expect(Math.hypot(state.intent.velocity.x, state.intent.velocity.z)).toBeCloseTo(
			rideTopSpeed(profile, RUN, true),
			6
		);
		expect(state.intent.gait).toBe('run');
	});

	it('takes a giant further than a small biped in the same time', () => {
		const small = biped(1.2, 2),
			giant = biped(16, 30);
		small.state.heading = giant.state.heading = Math.PI;
		ride(small.state, small.profile, SPRINT, 4);
		ride(giant.state, giant.profile, SPRINT, 4);
		expect(-giant.state.position.z).toBeGreaterThan(-small.state.position.z);
		expect(-small.state.position.z).toBeGreaterThan(RUN * 4 * 0.9);
	});

	it('isn’t leashed to its herd’s home', () => {
		const { state, profile } = biped(1.2, 3.4);
		state.heading = Math.PI;
		ride(state, profile, SPRINT, 40);
		expect(Math.hypot(state.position.x, state.position.z)).toBeGreaterThan(500);
	});

	it('brakes to a stop without input', () => {
		const { state, profile } = biped(1.2, 3.4);
		state.heading = Math.PI;
		ride(state, profile, SPRINT, 2);
		ride(state, profile, NO_RIDE_INPUT, 3);
		expect(Math.hypot(state.intent.velocity.x, state.intent.velocity.z)).toBe(0);
		expect(state.intent.gait).toBe('idle');
	});

	it('stops at a wall without passing through, even on a long frame', () => {
		const { state, profile } = biped(1.2, 3.4);
		state.heading = Math.PI;
		const wall: CreatureWorldAccess = { surface: () => 0, blocked: (_x, z) => z < -10 };
		const { blocked } = ride(state, profile, SPRINT, 5, wall);
		expect(blocked).toBe(true);
		expect(state.position.z).toBeGreaterThan(-10);
		advanceRiddenCreature(state, profile, SPRINT, 0, RUN, 5, wall);
		expect(state.position.z).toBeGreaterThan(-10);
	});

	it('slides along a wall it meets at an angle', () => {
		const { state, profile } = biped(1.2, 3.4);
		state.heading = Math.PI * 0.85;
		const wall: CreatureWorldAccess = { surface: () => 0, blocked: (_x, z) => z < -5 };
		// Steer into the wall at about 27° and keep holding it.
		ride(state, profile, { x: 0.5, z: 1, sprint: false }, 4, wall);
		expect(state.position.z).toBeGreaterThan(-5);
		expect(state.position.x).toBeGreaterThan(5);
	});

	it('won’t walk into deep water, but climbs any slope (Q18 A)', () => {
		const { state, profile } = biped(1.2, 3.4);
		state.heading = Math.PI;
		const lake: CreatureWorldAccess = { ...flat, standable: (_x, z) => z > -8 };
		ride(state, profile, SPRINT, 4, lake);
		expect(state.position.z).toBeGreaterThan(-8);

		const cliff = biped(1.2, 3.4);
		cliff.state.heading = Math.PI;
		const steep: CreatureWorldAccess = {
			surface: (_x, z) => (z < -6 ? -z * 5 : 0),
			blocked: () => false
		};
		// About 79°: still walked straight up, following the ground.
		ride(cliff.state, cliff.profile, SPRINT, 4, steep);
		expect(cliff.state.position.z).toBeLessThan(-7);
		expect(cliff.state.position.y).toBeCloseTo(-cliff.state.position.z * 5, 5);
	});

	it('slides round another creature rather than through it (Q24)', () => {
		const { state, profile } = biped(1.2, 3.4);
		state.heading = Math.PI;
		const rock = [{ x: 0, z: -6, radius: 1 }];
		for (let t = 0; t < 3; t += 1 / 60) {
			advanceRiddenCreature(state, profile, FORWARD, 0, RUN, 1 / 60, flat, rock);
			expect(Math.hypot(state.position.x, state.position.z + 6)).toBeGreaterThan(1);
		}
	});

	it('is deterministic for the same inputs', () => {
		const a = biped(1.2, 3.4),
			b = biped(1.2, 3.4);
		for (let i = 0; i < 120; i++) {
			const input = { x: Math.sin(i * 0.1), z: 1, sprint: i % 40 > 20 };
			advanceRiddenCreature(a.state, a.profile, input, i * 0.01, RUN, 1 / 60, flat);
			advanceRiddenCreature(b.state, b.profile, input, i * 0.01, RUN, 1 / 60, flat);
		}
		expect(a.state.position).toEqual(b.state.position);
		expect(a.state.heading).toBe(b.state.heading);
	});
});
