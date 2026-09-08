export interface TempoEvent {
	step: number;
	bpm: number;
}
export interface MeterEvent {
	step: number;
	numerator: number;
	denominator: number;
}
export interface MusicTimelineDefinition {
	totalSteps: number;
	grid: { stepsPerQuarter: number };
	tempoMap: TempoEvent[];
	meterMap: MeterEvent[];
}
export interface TempoSegment {
	startStep: number;
	endStep: number;
	bpm: number;
	startSeconds: number;
	endSeconds: number;
}
/** Binary lookup over immutable, precompiled tempo segments; supports fractional event steps. */
export class MusicTimeline {
	readonly segments: TempoSegment[] = [];
	readonly duration: number;
	constructor(readonly definition: MusicTimelineDefinition) {
		let seconds = 0;
		const map = definition.tempoMap;
		for (let i = 0; i < map.length; i++) {
			const e = map[i],
				end = map[i + 1]?.step ?? definition.totalSteps;
			const length = ((end - e.step) * 60) / e.bpm / definition.grid.stepsPerQuarter;
			this.segments.push({
				startStep: e.step,
				endStep: end,
				bpm: e.bpm,
				startSeconds: seconds,
				endSeconds: seconds + length
			});
			seconds += length;
		}
		this.duration = seconds;
	}
	private find(value: number, key: 'startStep' | 'startSeconds') {
		let lo = 0,
			hi = this.segments.length - 1;
		while (lo < hi) {
			const m = Math.ceil((lo + hi) / 2);
			if (this.segments[m][key] <= value) lo = m;
			else hi = m - 1;
		}
		return this.segments[lo];
	}
	secondsAt(step: number) {
		const s = this.find(step, 'startStep');
		return (
			s.startSeconds + ((step - s.startStep) * 60) / s.bpm / this.definition.grid.stepsPerQuarter
		);
	}
	stepAt(seconds: number) {
		const s = this.find(seconds, 'startSeconds');
		return (
			s.startStep + ((seconds - s.startSeconds) * s.bpm * this.definition.grid.stepsPerQuarter) / 60
		);
	}
	loopStep(elapsed: number) {
		return this.stepAt(((elapsed % this.duration) + this.duration) % this.duration);
	}
	label(step: number) {
		let bar = 1;
		const map = this.definition.meterMap,
			spq = this.definition.grid.stepsPerQuarter;
		for (let i = 0; i < map.length; i++) {
			const e = map[i],
				end = map[i + 1]?.step ?? Infinity;
			const perBeat = (spq * 4) / e.denominator,
				perBar = perBeat * e.numerator;
			if (step < end) {
				const offset = step - e.step;
				return {
					bar: bar + Math.floor(offset / perBar + 1e-8),
					beat: Math.floor((offset % perBar) / perBeat + 1e-8) + 1,
					numerator: e.numerator,
					denominator: e.denominator
				};
			}
			bar += Math.ceil((end - e.step) / perBar - 1e-8);
		}
		return { bar, beat: 1, numerator: 4, denominator: 4 };
	}
}
const cache = new WeakMap<MusicTimelineDefinition, MusicTimeline>();
export function compiledTimeline(t: MusicTimelineDefinition) {
	let c = cache.get(t);
	if (!c) {
		c = new MusicTimeline(t);
		cache.set(t, c);
	}
	return c;
}
