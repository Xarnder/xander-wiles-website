import { describe, expect, it } from 'vitest';
import { REMOTE_CATCH_UP_MS, remoteFlightMs, remoteOffsetWeight } from './remotePellet';

describe("drawing other players' pellets", () => {
	it('starts at the beginning of the flight, from the drawn mouth', () => {
		for (const age of [0, 80, 250, 900]) expect(remoteFlightMs(age, 0)).toBe(0);
		expect(remoteOffsetWeight(0)).toBe(1);
	});

	it('is exactly on the true arc once caught up', () => {
		for (const age of [0, 80, 250, 900]) {
			expect(remoteFlightMs(age, REMOTE_CATCH_UP_MS)).toBeCloseTo(age + REMOTE_CATCH_UP_MS, 9);
			expect(remoteFlightMs(age, 400)).toBeCloseTo(age + 400, 9);
		}
		expect(remoteOffsetWeight(REMOTE_CATCH_UP_MS)).toBe(0);
		expect(remoteOffsetWeight(1000)).toBe(0);
	});

	it('only ever moves forward, and never faster than needed to catch up', () => {
		for (const age of [0, 120, 250]) {
			let last = -1;
			let fastest = 0;
			for (let r = 0; r <= 300; r += 2) {
				const t = remoteFlightMs(age, r);
				expect(t).toBeGreaterThan(last);
				if (r > 0) fastest = Math.max(fastest, (t - last) / 2);
				last = t;
			}
			// Smoothstep's steepest slope is 1.5×: at most 1 + 1.5·age/window times real speed.
			expect(fastest).toBeLessThanOrEqual(1 + (1.5 * age) / REMOTE_CATCH_UP_MS + 1e-6);
		}
	});

	it('fades the start offset out smoothly', () => {
		let last = 1;
		for (let r = 10; r <= REMOTE_CATCH_UP_MS; r += 10) {
			const w = remoteOffsetWeight(r);
			expect(w).toBeLessThan(last);
			last = w;
		}
	});
});
