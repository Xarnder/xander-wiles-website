import { describe, expect, it } from 'vitest';
import { FrameDropMeter, missedRefreshes } from '../frameStats';

describe('missedRefreshes', () => {
	it('counts a doubled frame as one drop at 60 FPS', () => {
		expect(missedRefreshes(1 / 30, 60)).toBe(1);
	});

	it('counts a 50ms frame as two drops at 60 FPS', () => {
		expect(missedRefreshes(0.05, 60)).toBe(2);
	});

	it('ignores a frame on the target budget', () => {
		expect(missedRefreshes(1 / 60, 60)).toBe(0);
	});

	it('ignores small jitter under half a frame', () => {
		expect(missedRefreshes(0.02, 60)).toBe(0);
	});

	it('ignores a zero delta and a non-positive target', () => {
		expect(missedRefreshes(0, 60)).toBe(0);
		expect(missedRefreshes(0.05, 0)).toBe(0);
	});

	it('uses the configured target, so 30 FPS does not call a 60 FPS frame a drop', () => {
		expect(missedRefreshes(1 / 60, 30)).toBe(0);
		expect(missedRefreshes(1 / 15, 30)).toBe(1);
	});
});

describe('FrameDropMeter', () => {
	it('sums drops inside the last second and drops older samples', () => {
		const meter = new FrameDropMeter();
		expect(meter.push(0, 0.05, 60)).toBe(2);
		expect(meter.push(0.5, 1 / 30, 60)).toBe(3);
		expect(meter.push(0.9, 1 / 60, 60)).toBe(3);
		expect(meter.push(1.01, 1 / 60, 60)).toBe(1);
		expect(meter.count).toBe(1);
	});

	it('clears once a full second has passed with no new drops', () => {
		const meter = new FrameDropMeter();
		meter.push(0, 0.05, 60);
		expect(meter.push(1.2, 1 / 60, 60)).toBe(0);
	});
});
