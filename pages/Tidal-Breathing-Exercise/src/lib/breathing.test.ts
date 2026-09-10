import { describe, it, expect } from 'vitest';
import {
	BreathingSession,
	timeToPath,
	pathToTime,
	signedDistance
} from './breathing';
import { nearestPosition } from './geometry';
function lap(s: BreathingSession, duration = 4000) {
	for (let i = 0; i < 200; i++) {
		s.tick(duration / 200, 6);
		s.move((s.user + 0.005) % 1);
	}
}
describe('breathing engine', () => {
	it('does not assume a measured rate, calibrates from full laps, then adapts at boundaries', () => {
		const s = new BreathingSession();
		s.begin();
		expect(s.guideRate).toBeNull();
		lap(s);
		expect(s.calibrated).toBe(false);
		lap(s);
		expect(s.calibrated).toBe(true);
		expect(s.measured).toBeCloseTo(15, 0);
		expect(s.guideRate).toBeCloseTo(15, 0);
		const initial = s.guideRate!;
		s.tick(100, 6);
		expect(s.guideRate).toBe(initial);
		lap(s);
		expect(s.guideRate!).toBeLessThan(initial);
		expect(s.currentRate).toBeCloseTo(15, 0);
	});
	it('calculates currentRate based on the last three completed cycles', () => {
		const s = new BreathingSession();
		s.begin();
		expect(s.currentRate).toBeNull();
		lap(s, 4000); // 1st: 4s -> 15 bpm
		expect(s.currentRate).toBeCloseTo(15, 1);
		lap(s, 5000); // 2nd: 5s -> (2 * 60) / 9 = 13.33 bpm
		expect(s.currentRate).toBeCloseTo(13.33, 1);
		lap(s, 6000); // 3rd: 6s -> (3 * 60) / 15 = 12.0 bpm
		expect(s.currentRate).toBeCloseTo(12.0, 1);
		lap(s, 3000); // 4th: 3s -> last 3 are 5s, 6s, 3s = 14s -> (3 * 60) / 14 = 12.86 bpm
		expect(s.currentRate).toBeCloseTo(12.86, 1);
	});
	it('passes a stationary user during calibration and keeps completing laps', () => {
		const s = new BreathingSession();
		s.begin();
		for (let i = 0; i < 20; i++) {
			s.tick(50, 6);
			s.move(s.user + 0.005);
		}
		const user = s.user;
		let distance = 0;
		for (let i = 0; i < 500; i++) {
			const previous = s.guide;
			s.tick(50, 6);
			distance += signedDistance(s.guide, previous);
		}
		expect(distance).toBeGreaterThan(2);
		expect(s.user).toBe(user);
		expect(s.measured).toBeNull();
		expect(s.calibrated).toBe(false);
	});
	it('keeps moving after calibration when input stops', () => {
		const s = new BreathingSession();
		s.begin();
		lap(s);
		lap(s);
		lap(s);
		s.interrupt();
		let distance = 0;
		for (let i = 0; i < 600; i++) {
			const previous = s.guide;
			s.tick(50, 6);
			distance += signedDistance(s.guide, previous);
		}
		expect(distance).toBeGreaterThan(3);
	});
	it('does not count backtracking or wrap-boundary jitter as laps', () => {
		const s = new BreathingSession();
		s.begin();
		for (let i = 0; i < 100; i++) {
			s.tick(50, 6);
			s.move(0.01);
			s.move(0.99);
			s.move(0);
		}
		expect(s.cycles).toBe(0);
	});
	it('rejects shortcuts and implausible fast laps', () => {
		const s = new BreathingSession();
		s.begin();
		s.move(0.4);
		expect(s.user).toBe(0);
		lap(s, 1000);
		expect(s.measured).toBeNull();
	});
	it('smooths a single unusual breath and excludes interrupted partial laps', () => {
		const s = new BreathingSession();
		s.begin();
		lap(s);
		lap(s);
		lap(s);
		const before = s.measured!;
		lap(s, 9000);
		expect(Math.abs(s.measured! - before)).toBeLessThan(1);
		s.interrupt();
		s.tick(30000, 6);
		s.begin();
		lap(s);
		expect(s.measured!).toBeCloseTo(before, 0);
	});
	it('keeps the guide continuous through calibration', () => {
		const s = new BreathingSession();
		s.begin();
		lap(s);
		lap(s);
		for (let i = 0; i < 199; i++) {
			s.tick(20, 6);
			s.move((s.user + 0.005) % 1);
		}
		const previous = s.guide;
		s.tick(20, 6);
		s.move((s.user + 0.005) % 1);
		expect(Math.abs(signedDistance(s.guide, previous))).toBeLessThan(0.02);
	});
	it('converges rapidly when the user follows and respects changed targets', () => {
		const s = new BreathingSession();
		s.begin();
		lap(s);
		lap(s);
		for (let n = 0; n < 20; n++) lap(s, 60000 / s.guideRate!);
		expect(s.guideRate!).toBe(6);
		const rate = s.guideRate!;
		for (let i = 0; i < 1000; i++) {
			s.tick(20, 9);
			s.move((s.user + 0.002) % 1);
		}
		expect(s.guideRate!).toBeGreaterThan(rate);
	});
	it('round-trips configurable phase timing, including wrap', () => {
		for (let i = 0; i < 100; i++)
			expect(pathToTime(timeToPath(i / 100))).toBeCloseTo(i / 100);
		expect(timeToPath(1)).toBe(0);
		expect(timeToPath(0.25)).toBeCloseTo(0.25);
	});
	it('projects pointer input to the nearest path sample', () => {
		expect(
			nearestPosition(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{ x: 10, y: 10 },
					{ x: 0, y: 10 }
				],
				12,
				9
			)
		).toBe(0.5);
	});
});
