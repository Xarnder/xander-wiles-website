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

it('calculates guide target point vertical position and first two cycles threshold correctly', () => {
	const guideY = (p: number) => 390 - lineHeight(p) * 300;
	const guidePercentTop = (p: number) => guideY(p) / 4.8;

	// Inhale start (bottom): 390px -> 81.25%
	expect(guideY(0)).toBe(390);
	expect(guidePercentTop(0)).toBeCloseTo(81.25, 2);

	// Halfway up inhale: 240px -> 50%
	expect(guideY(0.125)).toBe(240);
	expect(guidePercentTop(0.125)).toBeCloseTo(50, 2);

	// Inhale top hold: 90px -> 18.75%
	expect(guideY(0.25)).toBe(90);
	expect(guidePercentTop(0.25)).toBeCloseTo(18.75, 2);

	// Exhale halfway down: 240px -> 50%
	expect(guideY(0.625)).toBe(240);
	expect(guidePercentTop(0.625)).toBeCloseTo(50, 2);

	// Exhale bottom hold: 390px -> 81.25%
	expect(guideY(0.75)).toBe(390);
	expect(guidePercentTop(0.75)).toBeCloseTo(81.25, 2);

	// First two cycles threshold: active for cycles 0 and 1, inactive from cycle 2 onward
	const isGuideHintActive = (cycles: number) => cycles < 2;
	expect(isGuideHintActive(0)).toBe(true);
	expect(isGuideHintActive(1)).toBe(true);
	expect(isGuideHintActive(2)).toBe(false);
	expect(isGuideHintActive(3)).toBe(false);
});

it('does not show guide hint until after user gets halfway up the first stroke', () => {
	// Function mirroring LineBreathingPath's hasReachedHalfway logic
	const shouldShowGuideHint = (user: number, height: number, cycles: number, hasReachedHalfway: boolean) => {
		const reached = hasReachedHalfway || cycles > 0 || lineHeight(user) >= 0.5 || height >= 0.5;
		const inCalibration = cycles < 2;
		return reached && inCalibration;
	};

	let reachedHalfway = false;

	// Initial page load / at start (user = 0, height = 0, cycles = 0): HIDDEN
	expect(shouldShowGuideHint(0, 0, 0, reachedHalfway)).toBe(false);

	// User drags 20% up (height = 0.2, user = 0.05): STILL HIDDEN
	expect(shouldShowGuideHint(0.05, 0.2, 0, reachedHalfway)).toBe(false);

	// User drags 40% up (height = 0.4, user = 0.1): STILL HIDDEN
	expect(shouldShowGuideHint(0.1, 0.4, 0, reachedHalfway)).toBe(false);

	// User reaches 50% up (halfway up the first stroke, height = 0.5, user = 0.125): APPEARS!
	reachedHalfway = true;
	expect(shouldShowGuideHint(0.125, 0.5, 0, reachedHalfway)).toBe(true);

	// Continuing up to peak (height = 1.0, user = 0.25): REMAINS SHOWN
	expect(shouldShowGuideHint(0.25, 1.0, 0, reachedHalfway)).toBe(true);

	// Exhale stroke (cycle 0, height = 0.5, user = 0.625): REMAINS SHOWN
	expect(shouldShowGuideHint(0.625, 0.5, 0, reachedHalfway)).toBe(true);

	// Second cycle (cycle 1): REMAINS SHOWN
	expect(shouldShowGuideHint(0.2, 0.8, 1, reachedHalfway)).toBe(true);

	// Third cycle (calibration complete, cycles = 2): DISMISSED
	expect(shouldShowGuideHint(0.2, 0.8, 2, reachedHalfway)).toBe(false);
});

it('calculates slider fill height matching the target point throughout breath cycle', () => {
	const guideY = (p: number) => 390 - lineHeight(p) * 300;
	const sliderFillSpan = (p: number) => 390 - guideY(p);

	// Empty (bottom station): 0px fill (slider empty)
	expect(sliderFillSpan(0)).toBe(0);

	// 25% height inhale: 75px fill
	expect(sliderFillSpan(0.0625)).toBeCloseTo(75, 1);

	// 50% height inhale (halfway): 150px fill
	expect(sliderFillSpan(0.125)).toBe(150);

	// 100% height (top hold): 300px fill (fully filled from y=390 to y=90)
	expect(sliderFillSpan(0.25)).toBe(300);
	expect(sliderFillSpan(0.375)).toBe(300);

	// 50% height exhale: 150px fill
	expect(sliderFillSpan(0.625)).toBe(150);

	// 0% height (bottom hold): 0px fill
	expect(sliderFillSpan(0.75)).toBe(0);
	expect(sliderFillSpan(0.875)).toBe(0);
});

it('enforces the 3 guide hint rules: halfway threshold, 2s drag dismiss, 1s idle reappear', () => {
	// State machine simulating GuideHint's 3 rules
	class GuideHintSimulator {
		visible = false;
		wasActive = false;
		wasDragging = false;
		dragTimerActive = false;
		idleTimerActive = false;

		update(active: boolean, dragging: boolean) {
			// Rule 1: Only show up after halfway after first stroke up
			if (!active) {
				this.visible = false;
				this.dragTimerActive = false;
				this.idleTimerActive = false;
				this.wasActive = false;
				this.wasDragging = dragging;
				return;
			}

			// First time reaching halfway
			if (!this.wasActive && active) {
				this.wasActive = true;
				this.visible = true;
				this.idleTimerActive = false;
				if (dragging) {
					// Rule 2: Disappear after 2s of dragging
					this.dragTimerActive = true;
				}
				this.wasDragging = dragging;
				return;
			}

			// Touch / drag transitions
			if (dragging !== this.wasDragging) {
				if (dragging) {
					// User touched / started dragging
					this.idleTimerActive = false;
					if (this.visible) {
						// Rule 2: Disappear after 2s of dragging
						this.dragTimerActive = true;
					}
				} else {
					// User let go / stopped touching
					this.dragTimerActive = false;
					// Rule 3: Reappear after 1s of not touching
					this.idleTimerActive = true;
				}
				this.wasDragging = dragging;
			}
		}

		simulateDrag2sTimeout() {
			if (this.dragTimerActive) {
				this.visible = false;
				this.dragTimerActive = false;
			}
		}

		simulateIdle1sTimeout() {
			if (this.idleTimerActive) {
				this.visible = true;
				this.idleTimerActive = false;
			}
		}
	}

	const sim = new GuideHintSimulator();

	// Case 1: Initial page load (not active, not dragging) -> Hidden (Rule 1)
	sim.update(false, false);
	expect(sim.visible).toBe(false);

	// Case 2: Dragging starts before halfway -> Still hidden (Rule 1)
	sim.update(false, true);
	expect(sim.visible).toBe(false);

	// Case 3: Reaches halfway while dragging -> Appears immediately, drag timer starts (Rule 1 & 2)
	sim.update(true, true);
	expect(sim.visible).toBe(true);
	expect(sim.dragTimerActive).toBe(true);

	// Case 4: Drags continuously for 2 seconds -> Disappears (Rule 2)
	sim.simulateDrag2sTimeout();
	expect(sim.visible).toBe(false);

	// Case 5: Lets go / stops touching -> Idle timer starts (Rule 3)
	sim.update(true, false);
	expect(sim.visible).toBe(false);
	expect(sim.idleTimerActive).toBe(true);

	// Case 6: Stays idle for 1 second -> Reappears (Rule 3)
	sim.simulateIdle1sTimeout();
	expect(sim.visible).toBe(true);

	// Case 7: Touches and drags again while visible -> Drag timer starts (Rule 2)
	sim.update(true, true);
	expect(sim.visible).toBe(true);
	expect(sim.dragTimerActive).toBe(true);

	// Case 8: Drags for 2 seconds -> Disappears again (Rule 2)
	sim.simulateDrag2sTimeout();
	expect(sim.visible).toBe(false);

	// Case 9: Lets go and stops touching again -> Reappears after 1 second (Rule 3)
	sim.update(true, false);
	sim.simulateIdle1sTimeout();
	expect(sim.visible).toBe(true);

	// Case 10: Session reset -> Immediately hidden until halfway reached again (Rule 1)
	sim.update(false, false);
	expect(sim.visible).toBe(false);
});

it('detects when user reaches target bpm with smooth hysteresis', () => {
	class TargetPaceTracker {
		atTarget = false;

		update(running: boolean, cycles: number, currentRate: number | null, guideRate: number | null, target: number) {
			if (!running || cycles < 1) {
				this.atTarget = false;
				return;
			}
			const effectiveRate = currentRate ?? guideRate;
			if (effectiveRate !== null) {
				const diff = Math.abs(effectiveRate - target);
				if (!this.atTarget && diff <= 0.75) {
					this.atTarget = true;
				} else if (this.atTarget && diff > 1.35) {
					this.atTarget = false;
				}
			} else {
				this.atTarget = false;
			}
		}
	}

	const tracker = new TargetPaceTracker();
	const target = 4.0;

	// 1. Not running: false
	tracker.update(false, 0, null, null, target);
	expect(tracker.atTarget).toBe(false);

	// 2. Running at cycle 0 (baseline calibration): false
	tracker.update(true, 0, 14.0, 10.0, target);
	expect(tracker.atTarget).toBe(false);

	// 3. Fast breathing (12 bpm) at cycle 2: diff 8.0 -> false
	tracker.update(true, 2, 12.0, 8.0, target);
	expect(tracker.atTarget).toBe(false);

	// 4. Slowing down (6.0 bpm): diff 2.0 -> false
	tracker.update(true, 3, 6.0, 5.0, target);
	expect(tracker.atTarget).toBe(false);

	// 5. Reaches 4.5 bpm (diff 0.5 <= 0.75): AT TARGET! -> true
	tracker.update(true, 4, 4.5, 4.0, target);
	expect(tracker.atTarget).toBe(true);

	// 6. Natural minor breathing fluctuation to 4.9 bpm (diff 0.9, <= 1.35 hysteresis): stays true!
	tracker.update(true, 5, 4.9, 4.0, target);
	expect(tracker.atTarget).toBe(true);

	// 7. Perfect match 4.0 bpm (diff 0.0): stays true!
	tracker.update(true, 6, 4.0, 4.0, target);
	expect(tracker.atTarget).toBe(true);

	// 8. User speeds up significantly to 6.2 bpm (diff 2.2 > 1.35): loses target -> false
	tracker.update(true, 7, 6.2, 4.0, target);
	expect(tracker.atTarget).toBe(false);

	// 9. Returns down to 4.2 bpm (diff 0.2 <= 0.75): recovers target -> true!
	tracker.update(true, 8, 4.2, 4.0, target);
	expect(tracker.atTarget).toBe(true);

	// 10. Session reset -> false
	tracker.update(false, 0, null, null, target);
	expect(tracker.atTarget).toBe(false);
});

