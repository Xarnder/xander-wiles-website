import { POSE_FLAGS } from './protocol';

/** One received pose of a remote player, on the room clock. */
export interface MotionSample {
	/** Room-clock time the pose was sampled, ms. */
	t: number;
	x: number;
	/** Feet height. */
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	flags: number;
}

/** What the renderer draws this frame. */
export interface MotionFrame {
	/** Changes once when displayed motion jumps; animation must release foot locks. */
	discontinuity?: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	flags: number;
	/** Displayed horizontal speed, m/s — drives the walk cycle so feet never slide. */
	speed: number;
	/** No fresh data for longer than the extrapolation window: the avatar is holding position. */
	stale: boolean;
}

export interface RemoteMotionOptions {
	minDelayMs?: number;
	maxDelayMs?: number;
	initialDelayMs?: number;
	/** How long to keep moving along the last velocity when data stops arriving. */
	extrapolateMs?: number;
	/** Time constant for blending out a correction, ms. */
	correctionTauMs?: number;
	/** Corrections bigger than this are not blended (the avatar would visibly slide); it snaps. */
	snapDistance?: number;
	/** Nominal gap between a moving player's samples, ms. */
	nominalIntervalMs?: number;
}

const HISTORY_MS = 1500;
const MIN_KEPT = 4;
const STATS_WINDOW = 30;
/** Delay changes by at most this fraction of elapsed time (a 5% playback stretch, never a jump). */
const DELAY_SLEW_RATE = 0.05;
const DELAY_MARGIN_MS = 10;
const SPEED_SMOOTHING_TAU_MS = 58;

/**
 * Smooth movement for one remote player — release requirement R1.
 *
 * Poses arrive about ten times a second; the game draws 60+ frames a second. Moving an avatar only
 * when a pose arrives makes it step visibly and look like it runs at a lower frame rate than the rest
 * of the game. Instead, this follows the standard *entity interpolation* approach used by Source,
 * Overwatch and others:
 *
 *   - Every rendered frame the avatar is placed at a moment slightly in the past (`delay`), between two
 *     received poses, so there is always a "before" and an "after" to blend.
 *   - The path between poses is a cubic Hermite curve using velocities estimated from neighbouring
 *     poses (Catmull–Rom tangents), so turns and stops are smooth rather than zig-zagged.
 *   - The delay adapts to measured lateness and jitter, and changes gradually so playback never jumps.
 *   - If poses stop arriving, the avatar carries on along its last velocity for a short time, then
 *     holds. When the curve changes under the avatar (late data, a correction), the difference is
 *     blended out over a few frames instead of snapping. Only an explicit teleport jumps.
 */
export class RemoteMotion {
	private readonly samples: MotionSample[] = [];
	private readonly ages: number[] = [];
	private readonly intervals: number[] = [];
	private readonly minDelay: number;
	private readonly maxDelay: number;
	private readonly extrapolateMs: number;
	private readonly correctionTau: number;
	private readonly snapDistance: number;
	private readonly nominalInterval: number;

	private delay: number;
	private targetDelay: number;
	private lastRenderTime: number | null = null;
	private lastFrame: MotionFrame | null = null;
	private offsetX = 0;
	private offsetY = 0;
	private offsetZ = 0;
	private smoothedSpeed = 0;
	private discontinuity = 0;
	private lastTeleportTime = Number.NEGATIVE_INFINITY;

	constructor(options: RemoteMotionOptions = {}) {
		this.minDelay = options.minDelayMs ?? 60;
		this.maxDelay = options.maxDelayMs ?? 300;
		this.delay = options.initialDelayMs ?? 150;
		this.targetDelay = this.delay;
		this.extrapolateMs = options.extrapolateMs ?? 250;
		this.correctionTau = options.correctionTauMs ?? 120;
		this.snapDistance = options.snapDistance ?? 8;
		this.nominalInterval = options.nominalIntervalMs ?? 100;
	}

	/** Current interpolation delay, ms. */
	get delayMs(): number {
		return this.delay;
	}

	get sampleCount(): number {
		return this.samples.length;
	}

	/**
	 * Adds a received pose. `arrivalServerTime` is the room-clock time it arrived, used to measure how
	 * late poses are and so how far behind live the avatar has to be drawn.
	 */
	push(sample: MotionSample, arrivalServerTime: number): void {
		const last = this.samples[this.samples.length - 1];
		if (last && sample.t <= last.t) {
			if (sample.t === last.t) return;
			// Out of order: slot it in, it may still be ahead of the render time.
			if (this.samples.some((existing) => existing.t === sample.t)) return;
		}

		const teleport = (sample.flags & POSE_FLAGS.teleport) !== 0;
		const before = this.lastRenderTime !== null ? this.evaluate(this.lastRenderTime) : null;

		const index = this.samples.findIndex((existing) => existing.t > sample.t);
		if (index === -1) this.samples.push(sample);
		else this.samples.splice(index, 0, sample);

		if (teleport) {
			this.offsetX = this.offsetY = this.offsetZ = 0;
		} else if (before && this.lastRenderTime !== null) {
			// Keep what's on screen continuous: whatever the new pose changed about the curve at the
			// moment currently displayed becomes an offset that fades out over the next few frames.
			const after = this.evaluate(this.lastRenderTime);
			if (after) {
				const dx = before.x - after.x;
				const dy = before.y - after.y;
				const dz = before.z - after.z;
				if (Math.hypot(dx, dy, dz) < this.snapDistance) {
					this.offsetX += dx;
					this.offsetY += dy;
					this.offsetZ += dz;
				} else {
					this.offsetX = this.offsetY = this.offsetZ = 0;
				}
			}
		}

		this.recordTiming(sample, arrivalServerTime, last);
	}

	/**
	 * Where to draw the avatar this frame. `serverNow` is the client's estimate of the room clock;
	 * `frameDtMs` is the time since the previous frame.
	 */
	update(serverNow: number, frameDtMs: number): MotionFrame | null {
		const dt = Math.max(0, frameDtMs);
		const step = dt * DELAY_SLEW_RATE;
		this.delay += Math.max(-step, Math.min(step, this.targetDelay - this.delay));

		let renderTime = serverNow - this.delay;
		// Time never runs backwards on screen, even if the clock estimate or delay nudges it.
		if (this.lastRenderTime !== null && renderTime < this.lastRenderTime) {
			renderTime = this.lastRenderTime;
		}

		const raw = this.evaluate(renderTime);
		if (!raw) return null;

		const decay = this.correctionTau > 0 ? Math.exp(-dt / this.correctionTau) : 0;
		this.offsetX *= decay;
		this.offsetY *= decay;
		this.offsetZ *= decay;

		const frame: MotionFrame = {
			...raw,
			x: raw.x + this.offsetX,
			y: raw.y + this.offsetY,
			z: raw.z + this.offsetZ
		};

		const teleport = this.samples.findLast(
			(sample) => sample.t <= renderTime && (sample.flags & POSE_FLAGS.teleport) !== 0
		);
		const jumped =
			(teleport && teleport.t > this.lastTeleportTime) ||
			(this.lastFrame &&
				Math.hypot(
					frame.x - this.lastFrame.x,
					frame.y - this.lastFrame.y,
					frame.z - this.lastFrame.z
				) >= this.snapDistance);
		if (teleport) this.lastTeleportTime = Math.max(this.lastTeleportTime, teleport.t);
		if (jumped) {
			this.smoothedSpeed = 0;
			this.discontinuity++;
		}
		if (this.lastFrame && dt > 0 && !jumped) {
			const instant =
				Math.hypot(frame.x - this.lastFrame.x, frame.z - this.lastFrame.z) / (dt / 1000);
			this.smoothedSpeed +=
				(instant - this.smoothedSpeed) * (1 - Math.exp(-dt / SPEED_SMOOTHING_TAU_MS));
		}
		frame.speed = this.smoothedSpeed;
		frame.discontinuity = this.discontinuity;

		this.lastRenderTime = renderTime;
		this.lastFrame = frame;
		this.trim(renderTime);
		return frame;
	}

	/** The raw curve (no correction offset) at room-clock time `t`. */
	evaluate(t: number): MotionFrame | null {
		const samples = this.samples;
		if (samples.length === 0) return null;
		const first = samples[0]!;
		if (t <= first.t) return frameOf(first, false);

		const lastIndex = samples.length - 1;
		const last = samples[lastIndex]!;
		if (t >= last.t) return this.extrapolate(t, lastIndex);

		let i = 0;
		while (i < lastIndex - 1 && samples[i + 1]!.t <= t) i++;
		const a = samples[i]!;
		const b = samples[i + 1]!;

		if ((b.flags & POSE_FLAGS.teleport) !== 0) return frameOf(a, false);

		// A player who stood still sends nothing until they move again; the gap before their next pose
		// is idle time, not slow walking. Hold until one nominal interval before the next pose.
		let startT = a.t;
		if (!isMoving(a) && b.t - a.t > this.nominalInterval * 1.5) {
			startT = b.t - this.nominalInterval;
			if (t <= startT) return frameOf(a, false);
		}

		const h = (b.t - startT) / 1000;
		const u = (t - startT) / (b.t - startT);
		const va = this.tangent(i, startT !== a.t);
		const vb = this.tangent(i + 1, false);
		const u2 = u * u;
		const u3 = u2 * u;
		const h00 = 2 * u3 - 3 * u2 + 1;
		const h10 = u3 - 2 * u2 + u;
		const h01 = -2 * u3 + 3 * u2;
		const h11 = u3 - u2;

		return {
			x: h00 * a.x + h10 * h * va.x + h01 * b.x + h11 * h * vb.x,
			y: h00 * a.y + h10 * h * va.y + h01 * b.y + h11 * h * vb.y,
			z: h00 * a.z + h10 * h * va.z + h01 * b.z + h11 * h * vb.z,
			yaw: lerpAngle(a.yaw, b.yaw, u),
			pitch: a.pitch + (b.pitch - a.pitch) * u,
			flags: a.flags,
			speed: 0,
			stale: false
		};
	}

	private extrapolate(t: number, lastIndex: number): MotionFrame {
		const last = this.samples[lastIndex]!;
		const ahead = t - last.t;
		if (!isMoving(last) || lastIndex === 0) return frameOf(last, false);
		const v = this.tangent(lastIndex, false);
		const seconds = Math.min(ahead, this.extrapolateMs) / 1000;
		return {
			x: last.x + v.x * seconds,
			y: last.y + v.y * seconds,
			z: last.z + v.z * seconds,
			yaw: last.yaw,
			pitch: last.pitch,
			flags: last.flags,
			speed: 0,
			stale: ahead > this.extrapolateMs
		};
	}

	/** Velocity at sample `i` (m/s): zero for a stopped pose, central difference where both neighbours exist. */
	private tangent(i: number, fromStill: boolean): { x: number; y: number; z: number } {
		const samples = this.samples;
		const s = samples[i]!;
		if (fromStill || !isMoving(s)) return { x: 0, y: 0, z: 0 };
		const prev = samples[i - 1];
		const next = samples[i + 1];
		let from = prev && isUsableNeighbour(prev, s, this.nominalInterval) ? prev : s;
		let to = next && isUsableNeighbour(s, next, this.nominalInterval) ? next : s;
		if (from === s && to === s) return { x: 0, y: 0, z: 0 };
		if (from === to) {
			from = prev ?? s;
			to = s;
		}
		const dt = (to.t - from.t) / 1000;
		if (dt <= 0) return { x: 0, y: 0, z: 0 };
		return { x: (to.x - from.x) / dt, y: (to.y - from.y) / dt, z: (to.z - from.z) / dt };
	}

	private recordTiming(
		sample: MotionSample,
		arrival: number,
		previous: MotionSample | undefined
	): void {
		const age = arrival - sample.t;
		if (Number.isFinite(age)) {
			this.ages.push(Math.max(0, age));
			if (this.ages.length > STATS_WINDOW) this.ages.shift();
		}
		if (previous && isMoving(previous) && sample.t > previous.t) {
			const gap = sample.t - previous.t;
			if (gap < this.nominalInterval * 4) {
				this.intervals.push(gap);
				if (this.intervals.length > STATS_WINDOW) this.intervals.shift();
			}
		}
		// Typical (not worst-case) lateness and spacing: a pose that arrives a little later than
		// planned costs a few milliseconds of extrapolation, which the correction blend absorbs
		// invisibly, whereas planning for the worst case would draw everyone ~40 ms further behind.
		const lateness = percentile(this.ages, 0.75) ?? 0;
		const interval = percentile(this.intervals, 0.5) ?? this.nominalInterval;
		this.targetDelay = Math.max(
			this.minDelay,
			Math.min(this.maxDelay, lateness + interval + DELAY_MARGIN_MS)
		);
	}

	private trim(renderTime: number): void {
		const samples = this.samples;
		while (samples.length > MIN_KEPT && samples[1]!.t < renderTime - HISTORY_MS) samples.shift();
	}
}

function isMoving(sample: MotionSample): boolean {
	return (sample.flags & POSE_FLAGS.moving) !== 0;
}

/** Neighbours separated by a long idle gap don't describe current velocity. */
function isUsableNeighbour(a: MotionSample, b: MotionSample, nominal: number): boolean {
	return b.t - a.t <= nominal * 4 && (isMoving(a) || b.t - a.t <= nominal * 1.5);
}

function frameOf(sample: MotionSample, stale: boolean): MotionFrame {
	return {
		x: sample.x,
		y: sample.y,
		z: sample.z,
		yaw: sample.yaw,
		pitch: sample.pitch,
		flags: sample.flags,
		speed: 0,
		stale
	};
}

function lerpAngle(a: number, b: number, u: number): number {
	let diff = (b - a) % (Math.PI * 2);
	if (diff > Math.PI) diff -= Math.PI * 2;
	else if (diff < -Math.PI) diff += Math.PI * 2;
	return a + diff * u;
}

function percentile(values: number[], fraction: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)));
	return sorted[index]!;
}
