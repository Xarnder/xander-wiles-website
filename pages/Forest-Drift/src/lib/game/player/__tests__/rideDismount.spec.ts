import { describe, expect, it } from 'vitest';
import { chooseDismountSpot, dismountCandidates, type DismountQuery } from '../rideDismount';

// Facing +Z (heading 0): the creature's right is -X.
const query: DismountQuery = { x: 10, z: 20, heading: 0, radius: 2, fallback: { x: 0, z: 0 } };

describe('where the rider lands (Q9 A)', () => {
	it('prefers the right side, then the left, the front and the back, clear of the body', () => {
		const [right, left, front, back] = dismountCandidates(query);
		expect(right.x).toBeCloseTo(10 - 2.6, 9);
		expect(right.z).toBeCloseTo(20, 9);
		expect(left.x).toBeCloseTo(10 + 2.6, 9);
		expect(front.z).toBeCloseTo(22.6, 9);
		expect(back.z).toBeCloseTo(17.4, 9);
		for (const spot of dismountCandidates(query))
			expect(Math.hypot(spot.x - 10, spot.z - 20)).toBeGreaterThan(query.radius);
	});

	it('follows the creature’s heading', () => {
		const [right] = dismountCandidates({ ...query, heading: Math.PI / 2 });
		// Facing +X, its right is +Z.
		expect(right.x).toBeCloseTo(10, 9);
		expect(right.z).toBeCloseTo(22.6, 9);
	});

	it('skips unsafe spots, and falls back to where the rider climbed on', () => {
		const leftOnly = chooseDismountSpot(query, (x) => x > 10);
		expect(leftOnly.x).toBeCloseTo(12.6, 9);
		const ring = chooseDismountSpot(query, (x, z) => Math.hypot(x - 10, z - 20) > 3);
		expect(Math.hypot(ring.x - 10, ring.z - 20)).toBeCloseTo(3.6, 9);
		expect(chooseDismountSpot(query, () => false)).toEqual({ x: 0, z: 0 });
	});
});
