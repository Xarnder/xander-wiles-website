/**
 * Dropped-frame counting for the FPS counter.
 *
 * A frame "drops" when it lasts long enough to miss at least one refresh at the target rate:
 * `round(deltaSeconds * targetFps) - 1`. At 60 FPS, ~33ms is one drop and ~50ms is two. A frame on
 * budget, jitter under half a frame, or a zero delta (the first frame) counts as none.
 */

const WINDOW_SECONDS = 1;

export function missedRefreshes(deltaSeconds: number, targetFps: number): number {
	if (!(deltaSeconds > 0) || !(targetFps > 0)) return 0;
	return Math.max(0, Math.round(deltaSeconds * targetFps) - 1);
}

/**
 * Rolling count of missed refreshes over the last second. `timeSeconds` is a monotonic clock in
 * the same units as the deltas passed in (the game loop's accumulated frame time).
 */
export class FrameDropMeter {
	private readonly samples: { time: number; drops: number }[] = [];
	private total = 0;

	/** Record one frame and return how many refreshes were missed in the last second. */
	push(timeSeconds: number, deltaSeconds: number, targetFps: number): number {
		const drops = missedRefreshes(deltaSeconds, targetFps);
		this.samples.push({ time: timeSeconds, drops });
		this.total += drops;
		const cutoff = timeSeconds - WINDOW_SECONDS;
		while (this.samples.length > 0 && this.samples[0].time < cutoff) {
			this.total -= this.samples.shift()!.drops;
		}
		return this.total;
	}

	get count(): number {
		return this.total;
	}
}
