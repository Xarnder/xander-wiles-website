import { expect, it } from 'vitest';
import { lineHeight, lineProgress, LineProgressTracker } from './line';
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

it('calibrates even when user turns around before reaching the absolute top or bottom (imperfect strokes)', () => {
	const s = new BreathingSession();
	s.begin();
	const tracker = new LineProgressTracker(0, 0.2);
	const move = (height: number) => {
		const next = tracker.update(s.user, height);
		const start = s.user,
			delta = signedDistance(next, start);
		const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.06));
		for (let i = 1; i <= steps; i++) s.move(wrap(start + (delta * i) / steps));
	};

	// User only drags between 0.20 and 0.80 (never touching 0.0 or 1.0)
	for (let lap = 0; lap < 3; lap++) {
		// Inhale upward from 0.20 to 0.80
		for (let i = 1; i <= 30; i++) {
			s.tick(40, 6);
			move(0.2 + (0.6 * i) / 30);
		}
		s.tick(500, 6); // Hold breath at peak
		// Exhale downward from 0.80 to 0.20
		for (let i = 1; i <= 30; i++) {
			s.tick(40, 6);
			move(0.8 - (0.6 * i) / 30);
		}
		s.tick(500, 6); // Hold breath at bottom
	}

	expect(s.calibrated).toBe(true);
	expect(s.cycles).toBeGreaterThanOrEqual(2);
	expect(s.measured).not.toBeNull();
	expect(s.currentRate).not.toBeNull();
});

it('detects direction changes without dropping progress during minor wiggles', () => {
	const tracker = new LineProgressTracker(0, 0.1);
	// Dragging up:
	let p1 = tracker.update(0, 0.5);
	expect(p1).toBeCloseTo(0.125);
	let p2 = tracker.update(p1, 0.7);
	expect(p2).toBeCloseTo(0.175);

	// Minor downward tremor (0.02 reversal, below 0.05 threshold):
	let pWiggle = tracker.update(p2, 0.68);
	expect(pWiggle).toBeCloseTo(0.175); // does not regress

	// Decisive downward reversal (0.70 - 0.64 = 0.06 >= 0.05):
	let pTurn = tracker.update(p2, 0.64);
	// Switched to exhale phase!
	expect(pTurn).toBeGreaterThanOrEqual(0.5);
	expect(tracker.phase).toBe('exhale');
});
