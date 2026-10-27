import { expect, it } from 'vitest';
import { audibleTime } from './playbackClock';
it('extrapolates output timestamps without adding output latency twice', () => {
	expect(audibleTime(2, 1200, { contextTime: 1.5, performanceTime: 1100 }, 0.2)).toBeCloseTo(1.6);
	expect(audibleTime(2, 1200, { contextTime: 2, performanceTime: 1100 }, 0.2)).toBe(2);
});
it('handles stale, missing and startup timestamps without invalid cue positions', () => {
	expect(audibleTime(2, 4000, { contextTime: 1.5, performanceTime: 1100 }, 0.2)).toBeCloseTo(1.8);
	expect(audibleTime(2, 1200, {}, 0.2)).toBeCloseTo(1.8);
	expect(audibleTime(0, 0, { contextTime: 0, performanceTime: 0 }, NaN)).toBe(0);
});
