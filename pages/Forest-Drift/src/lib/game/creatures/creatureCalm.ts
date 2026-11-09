/**
 * A quiet helper for picking up and climbing on: pressing `K` with nothing under the crosshair
 * eases every creature in reach to a stop, holds it still, then eases it back up. No prompt or
 * toast. This is only the timing, as a speed factor (1 = its own pace, 0 = standing still); pure,
 * so it's unit-tested.
 */

/** Easing down to a stop, seconds. */
export const CALM_SLOW_SECONDS = 0.8;
/** Standing still, seconds. */
export const CALM_HOLD_SECONDS = 5;
/** Easing back up to its own pace, seconds. */
export const CALM_RESUME_SECONDS = 1.2;
/** Below this factor the creature stands (idle gait), so its legs don't tread in place. */
export const CALM_STILL_FACTOR = 0.05;

export interface CalmTimeline {
	/** When `K` was pressed, seconds on the herd's clock. */
	start: number;
	/** The speed factor at that moment (below 1 when pressed again while still slowing or resuming). */
	from: number;
}

const smooth = (t: number) => {
	const x = Math.min(1, Math.max(0, t));
	return x * x * (3 - 2 * x);
};

/** Starts (or restarts) a calm at `now`, carrying on from wherever an earlier one had got to. */
export function startCalm(previous: CalmTimeline | undefined, now: number): CalmTimeline {
	return { start: now, from: previous ? calmFactor(previous, now) : 1 };
}

/** The speed factor at `now`: eases from `from` to 0, holds, then eases back to 1. */
export function calmFactor(calm: CalmTimeline, now: number): number {
	const t = now - calm.start;
	if (t <= 0) return calm.from;
	if (t < CALM_SLOW_SECONDS) return calm.from * (1 - smooth(t / CALM_SLOW_SECONDS));
	const resume = t - CALM_SLOW_SECONDS - CALM_HOLD_SECONDS;
	if (resume <= 0) return 0;
	return smooth(resume / CALM_RESUME_SECONDS);
}

/** Whether the creature is back to its own pace. */
export function calmEnded(calm: CalmTimeline, now: number): boolean {
	return now - calm.start >= CALM_SLOW_SECONDS + CALM_HOLD_SECONDS + CALM_RESUME_SECONDS;
}
