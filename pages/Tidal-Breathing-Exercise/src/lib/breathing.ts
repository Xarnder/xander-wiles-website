export const phaseRatios = [0.25, 0.25, 0.25, 0.25] as const;
export const phases = ['Breathe in', 'Hold', 'Breathe out', 'Hold'] as const;
export const wrap = (v: number) => ((v % 1) + 1) % 1;
export const clamp = (v: number, min: number, max: number) =>
	Math.min(max, Math.max(min, v));
export const signedDistance = (a: number, b: number) => wrap(a - b + 0.5) - 0.5;
export function timeToPath(time: number): number {
	let remaining = wrap(time);
	for (let i = 0; i < 4; i++) {
		if (remaining < phaseRatios[i]) return (i + remaining / phaseRatios[i]) / 4;
		remaining -= phaseRatios[i];
	}
	return 0;
}
export function pathToTime(position: number): number {
	const p = wrap(position) * 4,
		i = Math.floor(p);
	return (
		phaseRatios.slice(0, i).reduce((a, b) => a + b, 0) +
		(p - i) * phaseRatios[i]
	);
}
/** Pure session engine. Time is active-session milliseconds, never wall-clock time. */
export class BreathingSession {
	user = 0;
	guide = 0;
	measured: number | null = null;
	guideRate: number | null = null;
	currentRate: number | null = null;
	cycles = 0;
	elapsed = 0;
	private travel = 0;
	private lapStarted: number | null = null;
	private guideTime = 0;
	private samples: number[] = [];
	private lastInput = 0;
	private learnedGuideRate = false;
	get calibrated() {
		return this.cycles >= 2;
	}
	/** Re-grabbing starts a fresh full-lap measurement; idle gaps cannot become breaths. */
	begin() {
		this.travel = 0;
		this.lapStarted = this.elapsed;
		this.lastInput = this.elapsed;
	}
	interrupt() {
		this.travel = 0;
		this.lapStarted = null;
	}
	move(position: number) {
		const delta = signedDistance(position, this.user);
		if (Math.abs(delta) > 0.12) return; // Reject shortcuts / discontinuous pointer jumps.
		this.user = wrap(position);
		this.lastInput = this.elapsed;
		if (this.lapStarted === null) this.begin();
		this.travel = Math.max(0, this.travel + delta);
		if (this.travel < 0.995) return;
		const duration = (this.elapsed - this.lapStarted!) / 1000;
		this.travel = 0;
		this.lapStarted = this.elapsed;
		if (duration < 1.5 || duration > 40) return; // 1.5–40 breaths/minute measurement bounds.
		this.samples.push(duration);
		if (this.samples.length > 5) this.samples.shift();
		const sorted = [...this.samples].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];
		const rate = 60 / median;
		this.measured =
			this.measured === null
				? rate
				: this.measured + 0.35 * (rate - this.measured);

		// Current breathing speed based off the last three cycles
		const recent = this.samples.slice(-3);
		const totalSecs = recent.reduce((sum, d) => sum + d, 0);
		this.currentRate = totalSecs > 0 ? (recent.length * 60) / totalSecs : null;

		this.cycles++;
	}
	tick(milliseconds: number, target: number) {
		this.elapsed += milliseconds;
		const targetPace = clamp(target, 2, 10);
		// Start with a natural initial pace that can actively lead down to target
		this.guideRate ??= Math.max(targetPace + 2, 6);
		const next = this.guideTime + (milliseconds * this.guideRate) / 60000;
		if (next >= 1) {
			if (this.measured !== null && (!this.calibrated || !this.learnedGuideRate)) {
				// During active calibration, synchronize with user's baseline rate
				this.guideRate = this.measured;
				this.learnedGuideRate = true;
			} else {
				// Decelerate rapidly toward target at a fast, decisive rate
				if (this.guideRate > targetPace) {
					const step = Math.max(1.5, (this.guideRate - targetPace) * 0.4);
					this.guideRate = Math.max(targetPace, this.guideRate - step);
				} else if (this.guideRate < targetPace) {
					const step = Math.max(1.0, (targetPace - this.guideRate) * 0.4);
					this.guideRate = Math.min(targetPace, this.guideRate + step);
				}
				this.guideRate = clamp(this.guideRate, 2, 30);
			}
		}
		this.guideTime = wrap(next);
		this.guide = timeToPath(this.guideTime);
	}
}
