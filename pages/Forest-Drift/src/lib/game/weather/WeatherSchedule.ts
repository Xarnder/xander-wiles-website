import { createWeatherState, type WeatherState, type WeatherType } from './WeatherTypes';

/**
 * Procedural weather over time — deterministic from a seed, so the weather at any moment is a pure
 * function of (seed, weather time). A save stores just those two; a future server can broadcast
 * them and every client derives the same weather. Not a climate simulation: a short Markov chain
 * of believable sequences (clear → rain → clear, clear → rain → storm → rain → clear …) with long,
 * game-world durations.
 */

export interface WeatherScheduleConfig {
	allowSnow: boolean;
	/** Seconds each weather lasts: [min, max]. */
	durations: Readonly<Record<WeatherType, readonly [number, number]>>;
	/** Seconds the change into a new weather takes: [min, max]. */
	transition: readonly [number, number];
}

export const DEFAULT_WEATHER_SCHEDULE: WeatherScheduleConfig = {
	allowSnow: false,
	durations: {
		clear: [18 * 60, 40 * 60],
		rain: [7 * 60, 16 * 60],
		thunderstorm: [4 * 60, 10 * 60],
		snow: [10 * 60, 24 * 60]
	},
	transition: [35, 60]
};

/** One stretch of weather. Its transition runs at its start, from the previous segment's weather. */
export interface WeatherSegment {
	index: number;
	start: number;
	duration: number;
	transition: number;
	state: WeatherState;
}

/** Relative chances of what follows each weather. Snow is only drawn when allowed. */
const NEXT: Readonly<Record<WeatherType, readonly [WeatherType, number][]>> = {
	clear: [
		['rain', 0.68],
		['thunderstorm', 0.08],
		['snow', 0.24]
	],
	rain: [
		['clear', 0.58],
		['thunderstorm', 0.3],
		['rain', 0.12]
	],
	thunderstorm: [
		['rain', 0.85],
		['clear', 0.15]
	],
	snow: [
		['clear', 0.7],
		['snow', 0.3]
	]
};

const INTENSITY: Readonly<Record<WeatherType, readonly [number, number]>> = {
	clear: [0.3, 1],
	rain: [0.3, 1],
	thunderstorm: [0.65, 1],
	snow: [0.25, 1]
};

/** mulberry32 for one segment — each segment draws from its own seeded stream. */
function segmentRandom(seed: number, index: number): () => number {
	let a = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Hard cap on cached segments (~months of game time); beyond it the cache restarts from 0. */
const MAX_CACHED_SEGMENTS = 4096;

export class WeatherScheduleGenerator {
	private readonly segments: WeatherSegment[] = [];

	constructor(
		readonly seed: number,
		private config: WeatherScheduleConfig = DEFAULT_WEATHER_SCHEDULE
	) {}

	get allowSnow(): boolean {
		return this.config.allowSnow;
	}

	/** Changing whether snow is allowed regenerates the schedule (it changes which weather follows). */
	setAllowSnow(allowSnow: boolean): void {
		if (allowSnow === this.config.allowSnow) return;
		this.config = { ...this.config, allowSnow };
		this.segments.length = 0;
	}

	/** The segment covering `time` (s). Segments are generated lazily and cached. */
	segmentAt(time: number): WeatherSegment {
		const t = Math.max(0, Number.isFinite(time) ? time : 0);
		if (this.segments.length === 0) this.segments.push(this.makeSegment(0, 0, null));
		let last = this.segments[this.segments.length - 1];
		while (last.start + last.duration <= t) {
			if (this.segments.length >= MAX_CACHED_SEGMENTS) {
				// Pathologically long sessions: drop the cache's head, keep generating from the tail.
				this.segments.splice(0, this.segments.length - 1);
			}
			last = this.makeSegment(last.index + 1, last.start + last.duration, last.state);
			this.segments.push(last);
		}
		// Binary search (the cache is ordered).
		let lo = 0;
		let hi = this.segments.length - 1;
		if (t < this.segments[0].start) return this.restartAt(t);
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.segments[mid].start <= t) lo = mid;
			else hi = mid - 1;
		}
		return this.segments[lo];
	}

	/** The segment before `segment` (its transition starts from that weather), or null for the first. */
	previous(segment: WeatherSegment): WeatherSegment | null {
		if (segment.index === 0) return null;
		const found = this.segments.find((s) => s.index === segment.index - 1);
		return found ?? this.segmentAt(Math.max(0, segment.start - 1e-6));
	}

	private restartAt(time: number): WeatherSegment {
		this.segments.length = 0;
		return this.segmentAt(time);
	}

	private makeSegment(index: number, start: number, previous: WeatherState | null): WeatherSegment {
		const random = segmentRandom(this.seed, index);
		const type = previous ? this.nextType(previous.type, random) : 'clear';
		const [iMin, iMax] = INTENSITY[type];
		const intensity = iMin + (iMax - iMin) * random();
		// Wind wanders from the previous weather's direction rather than jumping anywhere.
		const prevAngle = previous ? Math.atan2(previous.windDirection.x, previous.windDirection.z) : 0;
		const angle = previous
			? prevAngle + (random() - 0.5) * (Math.PI / 2.2)
			: random() * Math.PI * 2;
		const state = createWeatherState(type, intensity, angle);
		const [dMin, dMax] = this.config.durations[type];
		const [tMin, tMax] = this.config.transition;
		return {
			index,
			start,
			duration: dMin + (dMax - dMin) * random(),
			transition: previous ? tMin + (tMax - tMin) * random() : 0,
			state
		};
	}

	private nextType(current: WeatherType, random: () => number): WeatherType {
		const options = NEXT[current].filter(([type]) => type !== 'snow' || this.config.allowSnow);
		let total = 0;
		for (const [, weight] of options) total += weight;
		let pick = random() * total;
		for (const [type, weight] of options) {
			pick -= weight;
			if (pick <= 0) return type;
		}
		return options[options.length - 1][0];
	}
}
