import {
	cloneWeatherState,
	copyWeatherEnvironment,
	createWeatherEnvironment,
	createWeatherState,
	environmentForState,
	lerpWeatherEnvironment,
	type WeatherEnvironment,
	type WeatherState
} from './WeatherTypes';

/**
 * Moves the world from one weather to the next over time. Holds a snapshot of the environment the
 * change started from (whatever was showing — possibly mid-way through another change) and the
 * target state; the current environment is their staged blend (see `lerpWeatherEnvironment`).
 * Starting a new change mid-way never jumps: it starts from what is on screen.
 */
export class WeatherTransitionController {
	private readonly from: WeatherEnvironment = createWeatherEnvironment();
	private readonly to: WeatherEnvironment = createWeatherEnvironment();
	private readonly current: WeatherEnvironment = createWeatherEnvironment();
	private fromState: WeatherState = createWeatherState('clear');
	private target: WeatherState = createWeatherState('clear');
	private duration = 0;
	private elapsed = 0;

	/** The weather being moved toward (authoritative once the change finishes). */
	get targetState(): WeatherState {
		return this.target;
	}

	/** The weather the current change started from. */
	get sourceState(): WeatherState {
		return this.fromState;
	}

	get progress(): number {
		return this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
	}

	get transitionDuration(): number {
		return this.duration;
	}

	get active(): boolean {
		return this.progress < 1;
	}

	get environment(): WeatherEnvironment {
		return this.current;
	}

	/** Shows `state` immediately (world load, tests). */
	jumpTo(state: WeatherState): void {
		this.fromState = cloneWeatherState(state);
		this.target = cloneWeatherState(state);
		environmentForState(state, this.to);
		copyWeatherEnvironment(this.to, this.from);
		copyWeatherEnvironment(this.to, this.current);
		this.duration = 0;
		this.elapsed = 0;
	}

	/** Starts moving from what is currently shown toward `state`. */
	start(state: WeatherState, durationSeconds: number): void {
		copyWeatherEnvironment(this.current, this.from);
		this.fromState = cloneWeatherState(this.target);
		this.target = cloneWeatherState(state);
		environmentForState(state, this.to);
		this.duration = Math.max(0, durationSeconds);
		this.elapsed = 0;
		this.evaluate();
	}

	/** Resumes a change from `from` to `to` that is `progress` (0..1) of the way through. */
	resume(from: WeatherState, to: WeatherState, durationSeconds: number, progress: number): void {
		this.fromState = cloneWeatherState(from);
		this.target = cloneWeatherState(to);
		environmentForState(from, this.from);
		environmentForState(to, this.to);
		this.duration = Math.max(0, durationSeconds);
		this.elapsed = this.duration * Math.min(1, Math.max(0, progress));
		this.evaluate();
	}

	update(deltaSeconds: number): WeatherEnvironment {
		if (this.duration > 0 && this.elapsed < this.duration) {
			this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, deltaSeconds));
		}
		return this.evaluate();
	}

	private evaluate(): WeatherEnvironment {
		return lerpWeatherEnvironment(this.from, this.to, this.progress, this.current);
	}
}
