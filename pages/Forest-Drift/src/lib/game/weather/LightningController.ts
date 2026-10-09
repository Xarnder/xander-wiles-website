/**
 * Lightning — framework-free. Decides WHEN and WHERE strikes happen and how bright the flash is
 * at each moment; the renderer (bolt), the environment (flash light) and the audio (thunder) all
 * read from here.
 *
 * Strikes are irregular: the wait to the next one is drawn from a skewed distribution whose mean
 * shrinks with storm activity, with occasional quick follow-up strikes — never a fixed timer. Each
 * strike is a `LightningEvent` (time, world position, intensity, seed): exactly what a future
 * server would broadcast. Clients derive flash, bolt and thunder delay from it locally.
 */

export interface LightningEvent {
	/** Controller clock (s) when the strike happens. */
	time: number;
	/** Strike position (world X/Z). */
	x: number;
	z: number;
	/** Distance from the listener at strike time (m). */
	distance: number;
	/** 0..1 strength of the strike itself (before distance). */
	intensity: number;
	/** Visual variation (bolt shape, flash pulses, thunder character). */
	seed: number;
}

export interface LightningPulse {
	/** Seconds after the strike. */
	start: number;
	amplitude: number;
	/** Seconds for the pulse to fall to ~37%. */
	decay: number;
}

export interface LightningOptions {
	/** Strikes happen this far from the listener (m). */
	minDistance: number;
	maxDistance: number;
	/** Mean wait (s) between strikes at the lowest and highest storm activity. */
	calmInterval: number;
	wildInterval: number;
}

export const DEFAULT_LIGHTNING_OPTIONS: LightningOptions = {
	minDistance: 120,
	maxDistance: 3200,
	calmInterval: 24,
	wildInterval: 6
};

/** Speed of sound (m/s) — thunder arrives `distance / SPEED_OF_SOUND` after the flash. */
export const SPEED_OF_SOUND = 343;

export function thunderDelaySeconds(distance: number): number {
	return Math.max(0, distance) / SPEED_OF_SOUND;
}

/** How bright a strike looks from `distance` metres away (0..1). */
export function flashStrengthAt(distance: number, intensity: number): number {
	return intensity / (1 + Math.pow(Math.max(0, distance) / 900, 1.3));
}

function mulberry(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * The flicker of one strike: a strong first flash, then one to three weaker return strokes with
 * dark gaps between — e.g. strong at 0 ms, dark by ~80 ms, medium at ~140 ms, fading by ~300 ms.
 */
export function lightningPulses(seed: number): LightningPulse[] {
	const random = mulberry(seed ^ 0x51ed27);
	const pulses: LightningPulse[] = [{ start: 0, amplitude: 1, decay: 0.045 + random() * 0.02 }];
	const extra = 1 + Math.floor(random() * 2.6);
	let t = 0;
	for (let i = 0; i < extra; i++) {
		t += 0.06 + random() * 0.11;
		pulses.push({
			start: t,
			amplitude: 0.35 + random() * 0.45,
			decay: 0.035 + random() * 0.05
		});
	}
	return pulses;
}

/** Flash envelope of a pulse list at `t` seconds after the strike (0..~1.2). */
export function flashEnvelope(pulses: readonly LightningPulse[], t: number): number {
	if (t < 0) return 0;
	let value = 0;
	for (const pulse of pulses) {
		const dt = t - pulse.start;
		if (dt < 0) continue;
		// ~10 ms rise, exponential fall.
		const rise = Math.min(1, dt / 0.01);
		value += pulse.amplitude * rise * Math.exp(-dt / pulse.decay);
	}
	return value;
}

/** Total length of a pulse list (s) — after this the flash is effectively over. */
export function flashDuration(pulses: readonly LightningPulse[]): number {
	let end = 0;
	for (const pulse of pulses) end = Math.max(end, pulse.start + pulse.decay * 5);
	return end;
}

interface ActiveStrike {
	event: LightningEvent;
	pulses: LightningPulse[];
	strength: number;
	end: number;
}

export class LightningController {
	private readonly random: () => number;
	private clock = 0;
	private nextStrike = Number.POSITIVE_INFINITY;
	private readonly active: ActiveStrike[] = [];
	private readonly fired: LightningEvent[] = [];
	private strikeCount = 0;
	private eventSeed: number;
	/** Multiplies strike frequency (debug). */
	frequency = 1;

	constructor(
		seed: number,
		private readonly options: LightningOptions = DEFAULT_LIGHTNING_OPTIONS
	) {
		this.random = mulberry(seed ^ 0x2545f491);
		this.eventSeed = seed >>> 0;
	}

	get time(): number {
		return this.clock;
	}

	get strikes(): number {
		return this.strikeCount;
	}

	/** Strikes still flashing (newest last). */
	get activeStrikes(): readonly { event: LightningEvent; pulses: readonly LightningPulse[] }[] {
		return this.active;
	}

	/**
	 * Advances the clock. `activity` (0..1) is the storm's lightning level; 0 stops new strikes (those
	 * already flashing finish). Returns the strikes that happened during this step — reused array.
	 */
	update(
		deltaSeconds: number,
		activity: number,
		listenerX: number,
		listenerZ: number
	): readonly LightningEvent[] {
		this.fired.length = 0;
		this.clock += Math.max(0, deltaSeconds);
		const level = Math.min(1, Math.max(0, activity)) * Math.max(0, this.frequency);
		if (level <= 0.001) {
			this.nextStrike = Number.POSITIVE_INFINITY;
		} else {
			if (!Number.isFinite(this.nextStrike)) {
				this.nextStrike = this.clock + this.nextWait(level) * 0.5;
			}
			while (this.clock >= this.nextStrike) {
				this.strike(this.nextStrike, listenerX, listenerZ, level);
				// A quarter of strikes are followed quickly by another: storms cluster.
				this.nextStrike +=
					this.random() < 0.25 ? 0.6 + this.random() * 2.2 : this.nextWait(level);
			}
		}
		for (let i = this.active.length - 1; i >= 0; i--) {
			if (this.clock > this.active[i].end) this.active.splice(i, 1);
		}
		return this.fired;
	}

	/** A strike right now (debug "Trigger lightning"), whatever the weather; optionally at a bearing. */
	force(listenerX: number, listenerZ: number, distance?: number, bearing?: number): LightningEvent {
		return this.strike(this.clock, listenerX, listenerZ, 1, distance, bearing);
	}

	/** Plays a strike decided elsewhere (a future server's LIGHTNING_EVENT), at the local clock. */
	receive(event: LightningEvent): void {
		const local = { ...event, time: this.clock };
		this.track(local);
		this.fired.push(local);
	}

	/** Combined flash brightness of every strike still flashing (0..~1.5). */
	flash(): number {
		let value = 0;
		for (const strike of this.active) {
			value += strike.strength * flashEnvelope(strike.pulses, this.clock - strike.event.time);
		}
		return value;
	}

	private nextWait(level: number): number {
		const mean =
			this.options.calmInterval + (this.options.wildInterval - this.options.calmInterval) * level;
		// Skewed: mostly shorter than the mean, sometimes much longer. Never a fixed rhythm.
		const r = this.random();
		return Math.max(1.2, mean * (0.3 + 1.6 * r * r));
	}

	private strike(
		time: number,
		listenerX: number,
		listenerZ: number,
		level: number,
		forcedDistance?: number,
		forcedBearing?: number
	): LightningEvent {
		const { minDistance, maxDistance } = this.options;
		// Near-biased but mostly distant: median about a kilometre.
		const distance =
			forcedDistance ??
			minDistance + (maxDistance - minDistance) * Math.pow(this.random(), 1.4);
		const randomBearing = this.random() * Math.PI * 2;
		const bearing = forcedBearing ?? randomBearing;
		this.eventSeed = (Math.imul(this.eventSeed ^ (this.strikeCount + 1), 0x9e3779b1) + 0x7f4a7c15) >>> 0;
		const event: LightningEvent = {
			time,
			x: listenerX + Math.sin(bearing) * distance,
			z: listenerZ + Math.cos(bearing) * distance,
			distance,
			intensity: 0.6 + 0.4 * Math.min(1, level + this.random() * 0.3),
			seed: this.eventSeed
		};
		this.track(event);
		this.fired.push(event);
		return event;
	}

	private track(event: LightningEvent): void {
		const pulses = lightningPulses(event.seed);
		this.active.push({
			event,
			pulses,
			strength: flashStrengthAt(event.distance, event.intensity),
			end: event.time + flashDuration(pulses)
		});
		this.strikeCount++;
		if (this.active.length > 6) this.active.shift();
	}
}

// ---------------------------------------------------------------------------------- bolt shape

export interface LightningBoltPath {
	/** Main channel, top to bottom: x, y, z triples relative to the strike point on the ground. */
	main: Float32Array;
	/** Short side branches, each its own polyline. */
	branches: Float32Array[];
}

/**
 * A cheap jagged bolt: midpoint displacement of a top-to-ground line (16 segments), plus two to
 * four short branches peeling off the upper part. Deterministic from the seed, so every client
 * draws the same bolt for the same event.
 */
export function generateLightningBolt(
	seed: number,
	height: number,
	options: { subdivisions?: number; maxBranches?: number } = {}
): LightningBoltPath {
	const random = mulberry(seed ^ 0x1b873593);
	const subdivisions = options.subdivisions ?? 4;
	const lean = height * 0.25;
	let points: number[][] = [
		[(random() - 0.5) * lean, height, (random() - 0.5) * lean],
		[0, 0, 0]
	];
	let roughness = 0.42;
	for (let level = 0; level < subdivisions; level++) {
		const next: number[][] = [points[0]];
		for (let i = 0; i < points.length - 1; i++) {
			const a = points[i];
			const b = points[i + 1];
			const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
			const offset = length * roughness;
			next.push([
				(a[0] + b[0]) / 2 + (random() - 0.5) * offset,
				(a[1] + b[1]) / 2 + (random() - 0.5) * offset * 0.2,
				(a[2] + b[2]) / 2 + (random() - 0.5) * offset
			]);
			next.push(b);
		}
		points = next;
		roughness *= 0.85;
	}
	const branches: Float32Array[] = [];
	const branchCount = Math.min(options.maxBranches ?? 4, 2 + Math.floor(random() * 3));
	for (let b = 0; b < branchCount; b++) {
		const startIndex = 2 + Math.floor(random() * Math.max(1, points.length * 0.55));
		const start = points[Math.min(points.length - 2, startIndex)];
		const segments = 3 + Math.floor(random() * 3);
		const angle = random() * Math.PI * 2;
		const reach = height * (0.12 + random() * 0.18);
		const branch: number[] = [...start];
		let [x, y, z] = start;
		for (let s = 0; s < segments; s++) {
			const step = reach / segments;
			x += Math.sin(angle) * step + (random() - 0.5) * step * 0.8;
			z += Math.cos(angle) * step + (random() - 0.5) * step * 0.8;
			y -= step * (0.6 + random() * 0.7);
			branch.push(x, Math.max(0, y), z);
		}
		branches.push(new Float32Array(branch));
	}
	return { main: new Float32Array(points.flat()), branches };
}
