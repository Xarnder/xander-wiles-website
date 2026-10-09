import { WeatherScheduleGenerator, type WeatherSegment } from './WeatherSchedule';
import { WeatherTransitionController } from './WeatherTransitionController';
import {
	cloneWeatherState,
	defaultTransitionSeconds,
	environmentForState,
	sameWeatherState,
	type WeatherEnvironment,
	type WeatherSaveState,
	type WeatherState
} from './WeatherTypes';

export type WeatherMode = 'schedule' | 'manual';

/**
 * Owns the logical weather: the weather clock, the procedural schedule, a forced (manual) weather
 * when a developer picks one, and the transition between whatever is showing and the target.
 * Framework-free and deterministic — the same seed and clock give the same weather anywhere.
 */
export class WeatherController {
	readonly transition = new WeatherTransitionController();
	private schedule: WeatherScheduleGenerator;
	private mode: WeatherMode = 'schedule';
	private manual: WeatherState | null = null;
	private time = 0;
	private segmentIndex = -1;
	private stateRevision = 0;
	/** Multiplies how fast the weather clock runs (debug acceleration). */
	timeScale = 1;
	paused = false;

	constructor(seed: number, allowSnow = false) {
		this.schedule = new WeatherScheduleGenerator(seed >>> 0);
		this.schedule.setAllowSnow(allowSnow);
		this.syncSchedule(true);
	}

	get seed(): number {
		return this.schedule.seed;
	}

	get weatherMode(): WeatherMode {
		return this.mode;
	}

	/** The authoritative weather: what the world is in, or moving toward. */
	get state(): WeatherState {
		return this.transition.targetState;
	}

	get environment(): WeatherEnvironment {
		return this.transition.environment;
	}

	get weatherTime(): number {
		return this.time;
	}

	get allowSnow(): boolean {
		return this.schedule.allowSnow;
	}

	/** Bumps whenever the target weather changes — the world save watches it. */
	get revision(): number {
		return this.stateRevision;
	}

	/** The scheduled segment now in force (for the debug panel). */
	currentSegment(): WeatherSegment {
		return this.schedule.segmentAt(this.time);
	}

	update(deltaSeconds: number): WeatherEnvironment {
		const step = this.paused ? 0 : Math.max(0, deltaSeconds) * Math.max(0, this.timeScale);
		this.time += step;
		if (this.mode === 'schedule') this.syncSchedule(false);
		return this.transition.update(step);
	}

	/** Forces a weather (developer selection). Moves there over `durationSeconds` (0 = automatic). */
	setManual(state: WeatherState, durationSeconds = 0): void {
		const changed = this.mode !== 'manual' || !this.manual || !sameWeatherState(this.manual, state);
		this.mode = 'manual';
		this.manual = cloneWeatherState(state);
		if (!changed) return;
		const target = environmentForState(state, {} as WeatherEnvironment);
		this.transition.start(
			state,
			durationSeconds > 0 ? durationSeconds : defaultTransitionSeconds(this.environment, target)
		);
		this.stateRevision++;
	}

	/** Returns to the procedural schedule, moving smoothly to whatever it says now. */
	useSchedule(): void {
		if (this.mode === 'schedule') return;
		this.mode = 'schedule';
		this.manual = null;
		this.segmentIndex = -1;
		this.syncSchedule(false, true);
	}

	setAllowSnow(allowSnow: boolean): void {
		if (allowSnow === this.schedule.allowSnow) return;
		this.schedule.setAllowSnow(allowSnow);
		this.segmentIndex = -1;
		if (this.mode === 'schedule') this.syncSchedule(false, true);
		this.stateRevision++;
	}

	save(): WeatherSaveState {
		const save: WeatherSaveState = {
			version: 1,
			seed: this.schedule.seed,
			time: this.time,
			mode: this.mode,
			allowSnow: this.schedule.allowSnow
		};
		if (this.mode === 'manual' && this.manual) {
			save.manual = cloneWeatherState(this.manual);
			if (this.transition.active) {
				save.transition = {
					from: cloneWeatherState(this.transition.sourceState),
					progress: this.transition.progress,
					duration: this.transition.transitionDuration
				};
			}
		}
		return save;
	}

	/** Restores a saved weather exactly (no transition from whatever was showing before). */
	load(save: WeatherSaveState): void {
		this.schedule = new WeatherScheduleGenerator(save.seed >>> 0);
		this.schedule.setAllowSnow(save.allowSnow);
		this.time = Math.max(0, save.time);
		this.segmentIndex = -1;
		if (save.mode === 'manual' && save.manual) {
			this.mode = 'manual';
			this.manual = cloneWeatherState(save.manual);
			if (save.transition && save.transition.progress < 1) {
				this.transition.resume(
					save.transition.from,
					save.manual,
					save.transition.duration,
					save.transition.progress
				);
			} else {
				this.transition.jumpTo(save.manual);
			}
		} else {
			this.mode = 'schedule';
			this.manual = null;
			this.syncSchedule(true);
		}
		this.stateRevision++;
	}

	/**
	 * Follows the schedule. On load (`exact`) it reproduces the moment exactly — including a change
	 * still in progress; during play each new segment starts its own transition from what is shown.
	 */
	private syncSchedule(exact: boolean, smooth = false): void {
		const segment = this.schedule.segmentAt(this.time);
		if (segment.index === this.segmentIndex) return;
		this.segmentIndex = segment.index;
		if (exact) {
			const since = this.time - segment.start;
			const previous = this.schedule.previous(segment);
			if (previous && segment.transition > 0 && since < segment.transition) {
				this.transition.resume(
					previous.state,
					segment.state,
					segment.transition,
					since / segment.transition
				);
			} else {
				this.transition.jumpTo(segment.state);
			}
		} else {
			const target = environmentForState(segment.state, {} as WeatherEnvironment);
			const duration = smooth
				? defaultTransitionSeconds(this.environment, target)
				: Math.max(1, segment.transition);
			this.transition.start(segment.state, duration);
		}
		this.stateRevision++;
	}
}
