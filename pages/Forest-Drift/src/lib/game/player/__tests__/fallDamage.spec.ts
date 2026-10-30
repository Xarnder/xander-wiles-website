import { describe, expect, it } from 'vitest';
import { fallDamageSegments } from '../fallDamage';

describe('fallDamageSegments', () => {
	it('does nothing up to the 4 m safe height', () => {
		for (const distance of [0, 1.36, 3, 4, 4.0000001]) {
			expect(fallDamageSegments(distance)).toBe(0);
		}
	});

	it('costs 2 segments per metre beyond 4 m, rounded up', () => {
		expect(fallDamageSegments(4.01)).toBe(1);
		expect(fallDamageSegments(4.36)).toBe(1);
		expect(fallDamageSegments(5)).toBe(2);
		expect(fallDamageSegments(6.5)).toBe(5);
		expect(fallDamageSegments(9.1)).toBe(11);
		expect(fallDamageSegments(10)).toBe(12);
		expect(fallDamageSegments(15)).toBe(22);
	});

	it('is lethal from full health at 22 m and never exceeds the maximum', () => {
		expect(fallDamageSegments(21.9)).toBe(36);
		expect(fallDamageSegments(22)).toBe(36);
		expect(fallDamageSegments(1000)).toBe(36);
	});

	it('treats nonsense as no damage', () => {
		expect(fallDamageSegments(Number.NaN)).toBe(0);
		expect(fallDamageSegments(-1)).toBe(0);
		expect(fallDamageSegments(Number.POSITIVE_INFINITY)).toBe(0);
	});

	it('never decreases as the fall gets longer', () => {
		let previous = 0;
		for (let distance = 0; distance <= 100; distance += 0.05) {
			const damage = fallDamageSegments(distance);
			expect(damage).toBeGreaterThanOrEqual(previous);
			previous = damage;
		}
	});
});
