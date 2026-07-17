import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { solveInterceptPoint, steerDirection } from './math';

describe('missile steering helpers', () => {
	it('limits each turn while converging on the desired direction', () => {
		const current = new Vector3(0, 0, -1);
		const desired = new Vector3(1, 0, 0);
		const result = new Vector3();

		steerDirection(current, desired, Math.PI / 6, result);

		expect(current.angleTo(result)).toBeCloseTo(Math.PI / 6, 1);
		expect(result.angleTo(desired)).toBeLessThan(Math.PI / 2);
	});

	it('solves a reachable moving-target intercept without mutating inputs', () => {
		const shooter = new Vector3(0, 0, 0);
		const target = new Vector3(0, 0, -1000);
		const velocity = new Vector3(80, 0, 0);
		const result = new Vector3();

		const reachable = solveInterceptPoint(shooter, target, velocity, 400, result);

		expect(reachable).toBe(true);
		expect(result.x).toBeGreaterThan(0);
		expect(target.x).toBe(0);
	});
});
