export const phaseRatios = [0.3, 0.1, 0.45, 0.15] as const;
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
	cycles = 0;
	elapsed = 0;
	private travel = 0;
	private lapStarted: number | null = null;
	private guideTime = 0;
	private samples: number[] = [];
	private lastInput = 0;
	private learnedGuideRate = false;
	get calibrated() {
		return this.cycles >= 3;
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
		if (duration < 2 || duration > 20) return; // 3–30 breaths/minute measurement bounds.
		this.samples.push(duration);
		if (this.samples.length > 5) this.samples.shift();
		const sorted = [...this.samples].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];
		const rate = 60 / median;
		this.measured =
			this.measured === null
				? rate
				: this.measured + 0.25 * (rate - this.measured);
		this.cycles++;
	}
	tick(milliseconds: number, target: number) {
		this.elapsed += milliseconds;
		// The guide always owns its clock, including during calibration. The target
		// is only a provisional guide pace, never a measurement of the user.
		this.guideRate ??= clamp(target, 4, 10);
		const next = this.guideTime + (milliseconds * this.guideRate) / 60000;
		if (next >= 1 && (!this.calibrated || !this.learnedGuideRate)) {
			this.guideRate = this.measured ?? clamp(target, 4, 10);
			this.learnedGuideRate = this.measured !== null;
		} else if (
			next >= 1 &&
			this.elapsed - this.lastInput < 20000 &&
			this.measured !== null
		) {
			// Limit each change to 3%; don't get more than ~12% slower than recent breathing.
			const comfortable = Math.max(clamp(target, 4, 10), this.measured! * 0.88);
			const desired = this.guideRate! + 0.12 * (comfortable - this.guideRate!);
			this.guideRate = clamp(
				desired,
				this.guideRate! * 0.97,
				this.guideRate! * 1.03
			);
			this.guideRate = clamp(this.guideRate, 3, 30);
		}
		this.guideTime = wrap(next);
		this.guide = timeToPath(this.guideTime);
	}
}
