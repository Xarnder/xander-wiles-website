import { expect, it } from 'vitest';
import { lineHeight, lineProgress } from './line';
import { BreathingSession, signedDistance, wrap } from './breathing';
it('moves up for inhale, stays at the top, moves down, and holds at the bottom', () => {
	expect(
		[0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map(lineHeight)
	).toEqual([0, 0.5, 1, 1, 1, 0.5, 0, 0]);
	expect(lineProgress(0.25, 1)).toBe(0.25);
	expect(lineProgress(0.25, 0.8)).toBeCloseTo(0.55);
	expect(lineProgress(0.75, 0)).toBe(0.75);
	expect(lineProgress(0.75, 0.2)).toBeCloseTo(0.05);
});
it('counts complete line breaths including time spent holding at both ends', () => {
	const s = new BreathingSession();
	s.begin();
	const move = (height: number) => {
		const start = s.user,
			delta = signedDistance(lineProgress(start, height), start);
		const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.06));
		for (let i = 1; i <= steps; i++) s.move(wrap(start + (delta * i) / steps));
	};
	for (let lap = 0; lap < 4; lap++) {
		for (let i = 1; i <= 40; i++) {
			s.tick(30, 6);
			move(i / 40);
		}
		s.tick(400, 6);
		for (let i = 1; i <= 40; i++) {
			s.tick(45, 6);
			move(1 - i / 40);
		}
		s.tick(600, 6);
	}
	expect(s.calibrated).toBe(true);
	expect(s.measured).toBeCloseTo(15, 0);
});
