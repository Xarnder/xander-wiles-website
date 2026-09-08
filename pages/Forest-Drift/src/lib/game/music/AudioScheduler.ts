import {
	secondsAtStep,
	stepAtSeconds,
	loopDuration,
	totalSteps,
	type MusicLoopSettings
} from './MusicModel';
export class AudioScheduler {
	private cursor = 0;
	constructor(
		public start: number,
		private settings: MusicLoopSettings
	) {}
	private time(cursor: number) {
		const n = totalSteps(this.settings);
		return (
			this.start +
			Math.floor(cursor / n) * loopDuration(this.settings) +
			secondsAtStep(this.settings, cursor % n)
		);
	}
	get scheduledThrough() {
		return this.time(Math.max(0, this.cursor - 1));
	}
	schedule(now: number, emit: (ring: number, time: number) => void) {
		const duration = loopDuration(this.settings),
			n = totalSteps(this.settings),
			elapsed = now - this.start;
		const loop = Math.floor(elapsed / duration);
		const step = stepAtSeconds(this.settings, elapsed - loop * duration);
		this.cursor = Math.max(this.cursor, loop * n + Math.ceil(step - 1e-8));
		while (this.time(this.cursor) < now + 0.15) {
			emit(this.cursor % n, this.time(this.cursor));
			this.cursor++;
		}
	}
}
