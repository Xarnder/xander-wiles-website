import { describe, expect, it } from 'vitest';
import { RemoteMotion, type MotionFrame } from '../RemoteMotion';
import { PoseSender } from '../PoseSender';
import { POSE_FLAGS, ROOM_TICK_MS } from '../protocol';

/**
 * Release requirement R1: remote players must move as smoothly as the rest of the game.
 *
 * These tests simulate a sender walking at 6 m/s (straight, then round a 10 m curve, then stopping),
 * sending a pose every ~100 ms from a 60 fps game, across a network with latency, jitter, the room's
 * 50 ms batching and 2% packet loss — then draw the receiver at 60 fps and measure what it sees.
 */

const FRAME_MS = 1000 / 60;
const SPEED = 6;
const STRAIGHT_S = 3;
const CURVE_S = 3;
const CURVE_RADIUS = 10;

/** Deterministic PRNG so the "random" network is the same every run. */
function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Sender position at time s (seconds since it started walking). */
function path(s: number): { x: number; z: number; yaw: number; moving: boolean } {
	if (s <= STRAIGHT_S) return { x: SPEED * s, z: 0, yaw: -Math.PI / 2, moving: true };
	const endStraight = SPEED * STRAIGHT_S;
	const curveT = Math.min(s - STRAIGHT_S, CURVE_S);
	const angle = (SPEED * curveT) / CURVE_RADIUS;
	return {
		x: endStraight + CURVE_RADIUS * Math.sin(angle),
		z: CURVE_RADIUS * (1 - Math.cos(angle)),
		yaw: -Math.PI / 2 + angle,
		moving: s - STRAIGHT_S < CURVE_S
	};
}

interface SimOptions {
	latencyMs: number;
	jitterMs: number;
	loss: number;
	seed: number;
}

interface FrameRecord {
	renderSeconds: number;
	delayMs: number;
	frame: MotionFrame;
}

function simulate(options: SimOptions): FrameRecord[] {
	const random = mulberry32(options.seed);
	const start = 10_000;
	const totalMs = (STRAIGHT_S + CURVE_S + 1.5) * 1000;
	const arrivals: { at: number; sample: Parameters<RemoteMotion['push']>[0] }[] = [];

	// Sender: a 60 fps game loop feeding the real PoseSender (≈10 Hz while moving, one final
	// "stopped" pose), with a perfectly synchronised clock.
	const sender = new PoseSender();
	for (let t = 0; t <= totalMs; t += FRAME_MS) {
		const p = path(t / 1000);
		const pose = sender.sample(
			{ x: p.x, feetY: 0, z: p.z, yaw: p.yaw, pitch: 0, flying: false },
			t,
			start + t
		);
		if (!pose || random() < options.loss) continue;
		const upload = options.latencyMs / 2 + random() * options.jitterMs;
		// The room flushes on its 50 ms tick.
		const atRoom = pose.sampleTime + upload;
		const flushed = Math.ceil(atRoom / ROOM_TICK_MS) * ROOM_TICK_MS;
		const download = options.latencyMs / 2 + random() * options.jitterMs;
		arrivals.push({
			at: flushed + download,
			sample: {
				t: pose.sampleTime,
				x: pose.x,
				y: pose.y,
				z: pose.z,
				yaw: pose.yaw,
				pitch: pose.pitch,
				flags: pose.flags
			}
		});
	}
	arrivals.sort((a, b) => a.at - b.at);

	const motion = new RemoteMotion();
	const frames: FrameRecord[] = [];
	let next = 0;
	for (let now = start; now <= start + totalMs + 500; now += FRAME_MS) {
		while (next < arrivals.length && arrivals[next]!.at <= now) {
			motion.push(arrivals[next]!.sample, arrivals[next]!.at);
			next++;
		}
		const frame = motion.update(now, FRAME_MS);
		if (frame) {
			frames.push({
				renderSeconds: (now - motion.delayMs - start) / 1000,
				delayMs: motion.delayMs,
				frame
			});
		}
	}
	return frames;
}

function stepSpeeds(frames: FrameRecord[], fromS: number, toS: number): number[] {
	const speeds: number[] = [];
	for (let i = 1; i < frames.length; i++) {
		const a = frames[i - 1]!;
		const b = frames[i]!;
		if (a.renderSeconds < fromS || b.renderSeconds > toS) continue;
		speeds.push(Math.hypot(b.frame.x - a.frame.x, b.frame.z - a.frame.z) / (FRAME_MS / 1000));
	}
	return speeds;
}

function variation(values: number[]): number {
	const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
	const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
	return Math.sqrt(variance) / mean;
}

/** Third value: the most the avatar may be drawn behind live on that network (plan §11: ≤200 ms in the UK). */
const NETWORKS: [string, SimOptions, number][] = [
	['a clean UK connection', { latencyMs: 30, jitterMs: 5, loss: 0, seed: 1 }, 200],
	['100 ms latency, jitter and 2% loss', { latencyMs: 100, jitterMs: 40, loss: 0.02, seed: 7 }, 300]
];

describe.each(NETWORKS)('RemoteMotion smoothness (R1) on %s', (_label, network, maxDelayMs) => {
	const frames = simulate(network);

	it('moves the avatar on every rendered frame while walking', () => {
		const speeds = stepSpeeds(frames, 0.5, STRAIGHT_S + CURVE_S - 0.2);
		expect(speeds.length).toBeGreaterThan(300);
		expect(Math.min(...speeds)).toBeGreaterThan(0.5);
	});

	it('keeps frame-to-frame speed within 10% at a steady walk', () => {
		const straight = stepSpeeds(frames, 0.5, STRAIGHT_S - 0.2);
		expect(variation(straight)).toBeLessThan(0.1);
		const mean = straight.reduce((sum, v) => sum + v, 0) / straight.length;
		expect(Math.abs(mean - SPEED) / SPEED).toBeLessThan(0.05);
	});

	it('stays smooth round a curve', () => {
		const curve = stepSpeeds(frames, STRAIGHT_S + 0.3, STRAIGHT_S + CURVE_S - 0.3);
		expect(variation(curve)).toBeLessThan(0.1);
	});

	it('never snaps more than 10 cm beyond normal motion', () => {
		for (let i = 1; i < frames.length; i++) {
			const a = frames[i - 1]!.frame;
			const b = frames[i]!.frame;
			const step = Math.hypot(b.x - a.x, b.z - a.z);
			expect(step).toBeLessThan(SPEED * (FRAME_MS / 1000) + 0.1);
		}
	});

	it('comes to rest exactly where the player stopped', () => {
		const end = path(STRAIGHT_S + CURVE_S);
		const final = frames[frames.length - 1]!.frame;
		expect(Math.hypot(final.x - end.x, final.z - end.z)).toBeLessThan(0.01);
		expect(final.speed).toBeLessThan(0.1);
	});

	it('reports a displayed speed the walk cycle can follow (within 10%)', () => {
		const mid = frames.filter((f) => f.renderSeconds > 1 && f.renderSeconds < STRAIGHT_S - 0.3);
		for (const { frame } of mid) expect(Math.abs(frame.speed - SPEED) / SPEED).toBeLessThan(0.1);
	});

	it(`draws the avatar no more than ${maxDelayMs} ms behind live`, () => {
		const delays = frames.slice(60).map((f) => f.delayMs);
		expect(Math.max(...delays)).toBeLessThanOrEqual(maxDelayMs);
	});
});

describe('RemoteMotion corrections', () => {
	it('blends out a late correction instead of snapping', () => {
		const motion = new RemoteMotion({ initialDelayMs: 100, minDelayMs: 100, maxDelayMs: 100 });
		const moving = POSE_FLAGS.moving;
		motion.push({ t: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: moving }, 10);
		motion.push({ t: 100, x: 1, y: 0, z: 0, yaw: 0, pitch: 0, flags: moving }, 110);
		// Render past the last sample: the avatar extrapolates along x.
		let previous = motion.update(350, 16)!;
		// The next pose says the player actually turned sideways.
		motion.push({ t: 200, x: 1, y: 0, z: 1, yaw: 0, pitch: 0, flags: moving }, 360);
		const after = motion.update(366, 16)!;
		const raw = motion.evaluate(266)!;
		const blendedStep = Math.hypot(after.x - previous.x, after.z - previous.z);
		const rawJump = Math.hypot(raw.x - previous.x, raw.z - previous.z);
		// Without blending the avatar would jump ~2.2 m in one frame; blended it eases over.
		expect(rawJump).toBeGreaterThan(2);
		expect(blendedStep).toBeLessThan(rawJump * 0.25);
		previous = after;
		for (let t = 382; t < 1500; t += 16) previous = motion.update(t, 16)!;
		// The correction has faded completely: x is back on the received path…
		expect(previous.x).toBeCloseTo(1, 2);
		// …and with no newer pose the avatar carried on for the 250 ms window (10 m/s) and is holding.
		expect(previous.z).toBeCloseTo(3.5, 2);
		expect(previous.stale).toBe(true);
	});

	it('jumps straight to a teleport', () => {
		const motion = new RemoteMotion({ initialDelayMs: 100, minDelayMs: 100, maxDelayMs: 100 });
		motion.push({ t: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0 }, 10);
		motion.update(200, 16);
		motion.push({ t: 150, x: 500, y: 0, z: 0, yaw: 0, pitch: 0, flags: POSE_FLAGS.teleport }, 210);
		const frame = motion.update(300, 16)!;
		expect(frame.x).toBe(500);
	});
});
