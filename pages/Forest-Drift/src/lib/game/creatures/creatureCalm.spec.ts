import { describe, expect, it } from 'vitest';
import {
	CALM_HOLD_SECONDS,
	CALM_RESUME_SECONDS,
	CALM_SLOW_SECONDS,
	calmEnded,
	calmFactor,
	startCalm
} from './creatureCalm';

const HOLD_END = CALM_SLOW_SECONDS + CALM_HOLD_SECONDS;
const END = HOLD_END + CALM_RESUME_SECONDS;

describe('calming creatures with K', () => {
	it('eases down, holds still for five seconds, then eases back up', () => {
		const calm = startCalm(undefined, 10);
		expect(calmFactor(calm, 10)).toBe(1);
		const slowing = [0.1, 0.3, 0.5, 0.7].map((t) => calmFactor(calm, 10 + t));
		for (let i = 1; i < slowing.length; i++) expect(slowing[i]).toBeLessThan(slowing[i - 1]);
		expect(slowing[0]).toBeGreaterThan(0.9);
		expect(calmFactor(calm, 10 + CALM_SLOW_SECONDS)).toBe(0);
		expect(CALM_HOLD_SECONDS).toBe(5);
		expect(calmFactor(calm, 10 + HOLD_END - 0.01)).toBe(0);
		const resuming = [0.2, 0.6, 1].map((t) => calmFactor(calm, 10 + HOLD_END + t));
		for (let i = 1; i < resuming.length; i++) expect(resuming[i]).toBeGreaterThan(resuming[i - 1]);
		expect(calmFactor(calm, 10 + END)).toBe(1);
		expect(calmEnded(calm, 10 + END - 0.01)).toBe(false);
		expect(calmEnded(calm, 10 + END)).toBe(true);
	});

	it('pressing again carries on smoothly from where it had got to, and restarts the hold', () => {
		const first = startCalm(undefined, 0);
		// Pressed again halfway through resuming: no jump in speed.
		const at = HOLD_END + CALM_RESUME_SECONDS / 2;
		const was = calmFactor(first, at);
		const again = startCalm(first, at);
		expect(calmFactor(again, at)).toBeCloseTo(was, 10);
		expect(calmFactor(again, at + CALM_SLOW_SECONDS)).toBe(0);
		expect(calmFactor(again, at + HOLD_END - 0.01)).toBe(0);
		// Pressed again while still: stays still, for a fresh five seconds.
		const still = startCalm(first, 2);
		expect(calmFactor(still, 2)).toBe(0);
		expect(calmFactor(still, 2 + HOLD_END - 0.01)).toBe(0);
	});
});
