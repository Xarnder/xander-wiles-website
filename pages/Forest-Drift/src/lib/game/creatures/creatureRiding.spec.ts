import { describe, expect, it } from 'vitest';
import { maxSpeedForRunSpeed } from '../net/RoomCore';
import { CREATURE_CELL_SIZE, creatureDimensions, regionSpecies } from './CreaturePopulationSystem';
import { generateIndividual } from './IndividualGenerator';
import {
	RIDE_CRUISE_FRACTION,
	RIDE_MIN_SPEED,
	RIDE_SHOULDER_HEIGHT,
	RIDE_SPRINT_MAX,
	RIDE_SPRINT_MIN,
	rideClaimRadius,
	rideFor,
	rideSeatFor,
	rideSprintMultiplier,
	rideTopSpeed,
	rideTurnRate
} from './creatureRiding';
import type { CreatureDefinition } from './CreatureTypes';

/** Every regional species of a few hundred regions, each as one individual. */
function regionalCreatures(): CreatureDefinition[] {
	const out: CreatureDefinition[] = [];
	for (const seed of ['forest', '42', 'meadow'])
		for (let x = -6; x < 6; x++)
			for (let z = -6; z < 6; z++)
				for (const species of regionSpecies(seed, x, z))
					out.push({ species, individual: generateIndividual(species, x * 977 + z) });
	return out;
}

describe('which creatures can be ridden (Q6)', () => {
	const creatures = regionalCreatures();

	it('is every biped, of any size, and nothing else', () => {
		let bipeds = 0;
		for (const definition of creatures) {
			const biped = definition.species.bodyPlan.id === 'biped';
			expect(rideFor(definition) !== null, definition.species.name).toBe(biped);
			if (biped) bipeds++;
		}
		// Bands 1–5 can be bipeds, so plenty turn up.
		expect(bipeds).toBeGreaterThan(100);
	});

	it('seats small bipeds astride the neck and large ones on the right shoulder (Q4, Q5)', () => {
		expect(rideSeatFor(1.2)).toBe('neck');
		expect(rideSeatFor(RIDE_SHOULDER_HEIGHT - 0.01)).toBe('neck');
		expect(rideSeatFor(RIDE_SHOULDER_HEIGHT)).toBe('right-shoulder');
		expect(rideSeatFor(26)).toBe('right-shoulder');
		for (const definition of creatures) {
			const profile = rideFor(definition);
			if (!profile) continue;
			const height = creatureDimensions(
				definition.species,
				definition.individual.sizeFactor
			).height;
			expect(profile.height).toBeCloseTo(height, 9);
			expect(profile.seat).toBe(height >= RIDE_SHOULDER_HEIGHT ? 'right-shoulder' : 'neck');
		}
	});
});

describe('ride speed: bigger is faster (Q3 B)', () => {
	it('sprints from 1.2× run (smallest) to 1.5× run (giants), rising with height', () => {
		expect(rideSprintMultiplier(1.2)).toBeCloseTo(RIDE_SPRINT_MIN, 9);
		expect(rideSprintMultiplier(26)).toBeCloseTo(RIDE_SPRINT_MAX, 9);
		expect(rideSprintMultiplier(0.5)).toBe(RIDE_SPRINT_MIN);
		expect(rideSprintMultiplier(60)).toBe(RIDE_SPRINT_MAX);
		let previous = 0;
		for (const height of [1.2, 1.65, 2.3, 3.1, 4.4, 6, 8.5, 12, 16, 26]) {
			const next = rideSprintMultiplier(height);
			expect(next).toBeGreaterThan(previous);
			previous = next;
		}
	});

	it('always cruises faster than running', () => {
		expect(RIDE_SPRINT_MIN * RIDE_CRUISE_FRACTION).toBeGreaterThan(1);
	});

	it('stays at least 4 m/s under the room speed limit for every run speed setting', () => {
		const giant = { sprint: RIDE_SPRINT_MAX, cruise: RIDE_SPRINT_MAX * RIDE_CRUISE_FRACTION };
		for (let run = 1; run <= 30; run += 0.5) {
			const profile = {
				seat: 'right-shoulder' as const,
				height: 26,
				turnRate: 1,
				maxCadence: 5,
				...giant
			};
			const sprint = rideTopSpeed(profile, run, true);
			// At very low run speeds the minimum ride speed applies, still well under the limit.
			const headroom = sprint > RIDE_MIN_SPEED ? 4 : 2;
			expect(sprint, `run ${run}`).toBeLessThanOrEqual(maxSpeedForRunSpeed(run) - headroom + 1e-9);
			expect(rideTopSpeed(profile, run, false)).toBeLessThan(sprint + 1e-9);
		}
	});

	it('never drops below the minimum ride speed', () => {
		const profile = {
			seat: 'neck' as const,
			height: 1.2,
			sprint: 1.2,
			cruise: 1.02,
			turnRate: 2.6,
			maxCadence: 5
		};
		expect(rideTopSpeed(profile, 0.5, false)).toBe(RIDE_MIN_SPEED);
		expect(rideTopSpeed(profile, Number.NaN, true)).toBe(RIDE_MIN_SPEED);
	});

	it('turns sharply when small and in wide arcs when large', () => {
		expect(rideTurnRate(1.2)).toBeGreaterThan(rideTurnRate(5));
		expect(rideTurnRate(5)).toBeGreaterThan(rideTurnRate(26));
	});
});

describe('ride claims (online)', () => {
	it('allow for the whole of a herd’s wander area around its cell', () => {
		for (const definition of regionalCreatures()) {
			if (!rideFor(definition)) continue;
			const radius = rideClaimRadius(definition, CREATURE_CELL_SIZE);
			expect(radius).toBeGreaterThan(
				definition.species.behaviour.wanderRadius + CREATURE_CELL_SIZE / 2
			);
			expect(Number.isFinite(radius)).toBe(true);
		}
	});
});
