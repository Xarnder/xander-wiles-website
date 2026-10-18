import { describe, expect, it } from 'vitest';
import { ClockSync } from '../ClockSync';

describe('ClockSync', () => {
	it('uses the lowest-round-trip sample as the target offset', () => {
		let local = 1000;
		const clock = new ClockSync(() => local);
		const trueOffset = 50_000;
		// A congested sample (rtt 400, asymmetric) then a clean one (rtt 40).
		clock.addSample(1000, 1000 + trueOffset + 350, 1400);
		clock.addSample(2000, 2000 + trueOffset + 20, 2040);
		local = 2040;
		// The first sample set the offset directly (no estimate yet); it now slews towards the clean one.
		local += 10_000;
		expect(clock.serverNow()).toBeCloseTo(local + trueOffset, -1);
		expect(clock.rttMs).toBe(40);
	});

	it('slews by at most 5% of elapsed time instead of jumping', () => {
		let local = 10;
		const clock = new ClockSync(() => local);
		clock.addSample(0, 1005, 10); // rtt 10, offset 1000
		expect(clock.serverNow()).toBe(1010);
		clock.addSample(100, 1300, 100); // rtt 0 (better), target 1200
		local = 100;
		const a = clock.serverNow();
		local = 1100; // 1000 ms later: at most 50 ms of correction
		const b = clock.serverNow();
		expect(b - a).toBeGreaterThanOrEqual(1000);
		expect(b - a).toBeLessThanOrEqual(1050 + 1e-9);
	});

	it('is not ready until seeded', () => {
		const clock = new ClockSync(() => 0);
		expect(clock.ready).toBe(false);
		expect(Number.isNaN(clock.serverNow())).toBe(true);
		clock.seed(500, 0);
		expect(clock.serverNow()).toBe(500);
	});
});
