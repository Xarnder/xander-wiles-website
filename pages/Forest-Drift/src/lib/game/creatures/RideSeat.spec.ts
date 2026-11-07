import { describe, expect, it } from 'vitest';
import { compileCreatureGeometry } from './CreatureCompiler';
import { regionSpecies } from './CreaturePopulationSystem';
import { generateIndividual } from './IndividualGenerator';
import { rideFor, RIDE_SHOULDER_HEIGHT } from './creatureRiding';
import { restJointPositions, rideSeatLayout, skinTop } from './RideSeat';
import type { CreatureCompilation } from './CreatureTypes';

/** A spread of regional bipeds, small and large, compiled at LOD 1 (same anatomy, fewer vertices). */
function bipeds(): CreatureCompilation[] {
	const out: CreatureCompilation[] = [];
	for (let x = 0; x < 12 && out.length < 24; x++)
		for (let z = 0; z < 12 && out.length < 24; z++)
			for (const species of regionSpecies('ride-seat', x, z))
				if (species.bodyPlan.id === 'biped')
					out.push(
						compileCreatureGeometry({ species, individual: generateIndividual(species, x + z) }, 1)
					);
	return out;
}

describe('where the rider sits', () => {
	const compiled = bipeds();

	it('covers both seat kinds', () => {
		const heights = compiled.map((c) => rideFor(c.definition)!.height);
		expect(heights.some((h) => h < RIDE_SHOULDER_HEIGHT)).toBe(true);
		expect(heights.some((h) => h >= RIDE_SHOULDER_HEIGHT)).toBe(true);
	});

	it('sits on top of the skin, below the head, and the right shoulder seat is on the right', () => {
		for (const c of compiled) {
			const profile = rideFor(c.definition)!;
			const seat = rideSeatLayout(c, profile.seat);
			const label = `${c.definition.species.name} ${profile.height.toFixed(2)} m`;
			expect(seat.kind, label).toBe(profile.seat);
			// High on the body (big-headed species have low shoulders), below the top of the head.
			expect(seat.pelvis.y, label).toBeGreaterThan(profile.height * 0.35);
			// The pelvis rests on the skin (never in the air beside the body).
			const p = c.geometry.positions;
			const contact = Math.max(0.08, c.bounds.height * 0.02);
			const resting = skinTop(p, seat.pelvis.x, seat.pelvis.z, contact, seat.pelvis.y + 0.25);
			expect(resting, `${label}: skin under the seat`).not.toBeNull();
			expect(seat.pelvis.y - resting!, label).toBeLessThan(0.1);
			// A head too big to sit beside (it hangs over the shoulders) is sat on instead.
			if (seat.onHead) {
				expect(seat.hands, label).toEqual({ left: null, right: null });
				continue;
			}
			// Otherwise nothing (a big head, a crest) fills the space above the seat.
			expect(seat.pelvis.y, label).toBeLessThan(seat.headTop);
			const under = skinTop(p, seat.pelvis.x, seat.pelvis.z, 0.05, seat.pelvis.y + 0.25);
			if (under !== null) expect(under, label).toBeLessThanOrEqual(seat.pelvis.y + 1e-6);
			for (let i = 0; i < p.length; i += 3) {
				const near = Math.hypot(p[i] - seat.pelvis.x, p[i + 2] - seat.pelvis.z) < 0.05;
				if (near)
					expect(p[i + 1] < seat.pelvis.y + 0.25 || p[i + 1] > seat.pelvis.y + 0.9, label).toBe(
						true
					);
			}
			if (profile.seat === 'right-shoulder') {
				expect(seat.pelvis.x, label).toBeLessThan(0);
				expect(seat.hands.left, label).not.toBeNull();
			} else {
				expect(seat.pelvis.x, label).toBe(0);
				// Behind the neck, so the neck rises between the rider's legs.
				const neck = restJointPositions(c.skeleton.joints).get('neck')!;
				expect(seat.pelvis.z, label).toBeLessThan(neck.z);
			}
		}
	});

	it('moves further out from the neck while carrying a creature (Q12 C)', () => {
		const large = compiled.find((c) => rideFor(c.definition)!.seat === 'right-shoulder')!;
		const empty = rideSeatLayout(large, 'right-shoulder');
		const carrying = rideSeatLayout(large, 'right-shoulder', 0.4);
		expect(carrying.pelvis.x).toBeLessThanOrEqual(empty.pelvis.x);
	});

	it('rebuilds rest joint positions from the local offsets', () => {
		const joints = restJointPositions([
			{ id: 'root', semantic: 'root', localPosition: { x: 0, y: 1, z: 0 } },
			{ id: 'chest', parentId: 'root', semantic: 'chest', localPosition: { x: 0, y: 2, z: 0.5 } },
			{ id: 'neck', parentId: 'chest', semantic: 'neck', localPosition: { x: 0, y: 0.5, z: 0.1 } }
		]);
		expect(joints.get('neck')).toEqual({ x: 0, y: 3.5, z: 0.6 });
	});
});
