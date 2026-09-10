import { clamp, wrap } from './breathing';

/** Height from bottom (0) to top (1); holds occupy time without movement. */
export function lineHeight(progress: number): number {
	const p = wrap(progress);
	if (p < 0.25) return p * 4;
	if (p < 0.5) return 1;
	if (p < 0.75) return 3 - p * 4;
	return 0;
}

/**
 * Stateful tracker that detects breathing turnarounds (direction changes)
 * without requiring the user to hit the extreme top or bottom of the rail.
 */
export class LineProgressTracker {
	phase: 'inhale' | 'exhale' = 'inhale';
	peak = 0;
	valley = 1;
	strokeStart = 0;
	private initialized = false;

	constructor(initialProgress = 0, initialHeight = 0) {
		this.reset(initialProgress, initialHeight);
	}

	reset(initialProgress = 0, initialHeight = 0) {
		const p = wrap(initialProgress);
		const h = clamp(initialHeight, 0, 1);
		this.phase = p >= 0.25 && p < 0.75 ? 'exhale' : 'inhale';
		this.strokeStart = h;
		this.peak = h;
		this.valley = h;
		this.initialized = false;
	}

	update(current: number, rawHeight: number): number {
		let h = clamp(rawHeight, 0, 1);
		if (h > 0.98) h = 1;
		if (h < 0.02) h = 0;

		const p = wrap(current);

		if (!this.initialized) {
			this.initialized = true;
			this.phase = p >= 0.25 && p < 0.75 ? 'exhale' : 'inhale';
			this.strokeStart = h;
			this.peak = h;
			this.valley = h;
		}

		const TURN_THRESHOLD = 0.05; // 5% reversal confirms direction change (~15-20px)
		const MIN_STROKE = 0.15; // Must have moved at least 15% to count as a breathing stroke

		// If in initial inhale phase at start, but user immediately drags downward:
		if (
			this.phase === 'inhale' &&
			this.peak === this.strokeStart &&
			this.strokeStart - h >= TURN_THRESHOLD
		) {
			this.phase = 'exhale';
			this.strokeStart = this.peak;
			this.valley = h;
		}

		if (this.phase === 'inhale') {
			if (h > this.peak) this.peak = h;
			const travel = this.peak - this.strokeStart;
			const reversal = this.peak - h;

			// If user is at or near the top hold
			if (h >= 0.96 && reversal < TURN_THRESHOLD) {
				return 0.25;
			}

			// Direction change: user moved up and then reversed downwards
			if (
				(travel >= MIN_STROKE && reversal >= TURN_THRESHOLD) ||
				(this.peak >= 0.96 && reversal >= TURN_THRESHOLD)
			) {
				this.phase = 'exhale';
				this.strokeStart = this.peak;
				this.valley = h;
				return 0.5 + (1 - h) / 4;
			}

			// Still inhaling: stabilize progress during minor downward wiggles (< TURN_THRESHOLD)
			const effectiveH = reversal > 0 ? this.peak : h;
			return effectiveH >= 0.98 ? 0.25 : effectiveH / 4;
		} else {
			// Exhale phase
			if (h < this.valley) this.valley = h;
			const travel = this.strokeStart - this.valley;
			const reversal = h - this.valley;

			// If user is at or near the bottom hold
			if (h <= 0.04 && reversal < TURN_THRESHOLD) {
				return 0.75;
			}

			// Direction change: user moved down and then reversed upwards
			if (
				(travel >= MIN_STROKE && reversal >= TURN_THRESHOLD) ||
				(this.valley <= 0.04 && reversal >= TURN_THRESHOLD)
			) {
				this.phase = 'inhale';
				this.strokeStart = this.valley;
				this.peak = h;
				return h / 4;
			}

			// Still exhaling: stabilize progress during minor upward wiggles (< TURN_THRESHOLD)
			const effectiveH = reversal > 0 ? this.valley : h;
			return effectiveH <= 0.02 ? 0.75 : 0.5 + (1 - effectiveH) / 4;
		}
	}
}

/** Direction changes at endpoints advance the user's self-reported hold. */
export function lineProgress(
	current: number,
	height: number,
	tracker?: LineProgressTracker
): number {
	if (tracker) {
		return tracker.update(current, height);
	}
	let h = clamp(height, 0, 1);
	if (h > 0.98) h = 1;
	if (h < 0.02) h = 0;
	const p = wrap(current);
	if (p < 0.25) return h / 4;
	if (p < 0.5) return h >= 0.98 ? 0.25 : 0.5 + (1 - h) / 4;
	if (p < 0.75) return 0.5 + (1 - h) / 4;
	return h <= 0.02 ? 0.75 : h / 4;
}
