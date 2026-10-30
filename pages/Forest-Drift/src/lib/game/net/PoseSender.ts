import { POSE_FLAGS, POSE_SEND_INTERVAL_MS, type PoseSample } from './protocol';

/** The local player's state, read from `FirstPersonController` each frame. */
export interface LocalPose {
	x: number;
	/** Feet height (eye height minus `eyeHeight`). */
	feetY: number;
	z: number;
	yaw: number;
	pitch: number;
	flying: boolean;
	grounded?: boolean;
	running?: boolean;
	building?: boolean;
	/**
	 * Bumped by every deliberate jump (spawn, respawn, a restored position). A change means the next
	 * pose is a teleport even when it is short: the room's speed check would otherwise reject, say, a
	 * respawn 30 m from where the player fell.
	 */
	teleports?: number;
}

/**
 * A frame counts as "due" this close to the nominal interval. Without the tolerance, six 60 fps frames
 * add up to 99.99… ms in floating point and every pose slips a whole frame late (~117 ms apart),
 * which makes remote players be drawn later than they need to be.
 */
const SEND_TOLERANCE_MS = 8;
const POSITION_EPSILON = 0.005;
const ANGLE_EPSILON = 0.002;
/** A jump further than this in one frame is a respawn or teleport, not movement. */
const TELEPORT_DISTANCE = 50;
/**
 * While nobody else is in the world there is nobody to look smooth for: a pose a second keeps the
 * room's idea of where we are fresh, and the moment someone joins we're back to full rate (plus an
 * immediate pose, via `forceNext`).
 */
export const ALONE_SEND_INTERVAL_MS = 1000;

/**
 * Decides when the local player's pose goes out, and with which flags.
 *
 *   - While the pose is changing (walking, turning, looking): every ~100 ms.
 *   - The moment it stops changing: one final pose without the `moving` flag, so other players ease
 *     to a stop exactly there instead of extrapolating past it. Then nothing until it changes again.
 *   - A sudden large jump is flagged `teleport` so others snap rather than slide across the map.
 *   - When the game stops drawing frames (hidden tab, developer panel), `markAway` sends one `away`
 *     pose; `setAway` does the same while the frames keep coming (the pause menu, Q12).
 *   - Alone in the world, it drops to one pose a second (`setAlone`).
 *
 * Adaptive rate, measured rather than guessed: the plan's "send only when the prediction error
 * exceeds 0.15 m" would leave gaps of up to 500 ms between poses, which the interpolation buffer
 * would have to cover with extra delay — breaking R1's 200 ms target. A walker at 10 Hz costs 240
 * bytes a second, so the only rates worth cutting are the ones nobody sees: standing still (nothing
 * sent), alone (1 Hz) and away (nothing after one pose).
 */
export class PoseSender {
	private lastSendAt = Number.NEGATIVE_INFINITY;
	private lastSentFlags = 0;
	private lastFrame: LocalPose | null = null;
	private latest: LocalPose | null = null;
	private seq = 0;
	private forced = false;
	private interval = POSE_SEND_INTERVAL_MS;
	private away = false;
	private lastTeleports: number | undefined;

	/** One pose a second while nobody else is in the world. */
	setAlone(alone: boolean): void {
		const next = alone ? ALONE_SEND_INTERVAL_MS : POSE_SEND_INTERVAL_MS;
		if (next === this.interval) return;
		this.interval = next;
		if (!alone) this.forced = true;
	}

	/** Away while the frames keep coming (pause menu): one `away` pose, then quiet until cleared. */
	setAway(away: boolean): void {
		if (away === this.away) return;
		this.away = away;
		if (!away) this.forced = true;
	}

	/** Sends the current pose on the next opportunity even if nothing changed (e.g. someone joined). */
	forceNext(): void {
		this.forced = true;
	}

	/** Returns the pose to send this frame, or null. `now` is the local clock; `serverNow` the room clock estimate. */
	sample(pose: LocalPose, now: number, serverNow: number): PoseSample | null {
		const previous = this.lastFrame;
		this.lastFrame = { ...pose };
		this.latest = this.lastFrame;
		if (!Number.isFinite(serverNow)) return null;

		const changing = !previous || poseChanged(previous, pose);
		const jumped = this.lastTeleports !== undefined && pose.teleports !== this.lastTeleports;
		this.lastTeleports = pose.teleports;
		const teleported =
			jumped ||
			(previous !== null &&
				Math.hypot(pose.x - previous.x, pose.z - previous.z) > TELEPORT_DISTANCE);
		let flags = poseFlags(pose);
		if (this.away) {
			if ((this.lastSentFlags & POSE_FLAGS.away) !== 0 && !teleported) return null;
			flags |= POSE_FLAGS.away;
			if (teleported) flags |= POSE_FLAGS.teleport;
			return this.emit(pose, flags, now, serverNow);
		}
		if (changing) flags |= POSE_FLAGS.moving;
		if (teleported) flags |= POSE_FLAGS.teleport;

		const wasMoving = (this.lastSentFlags & POSE_FLAGS.moving) !== 0;
		const flagsChanged = (flags & ~POSE_FLAGS.moving) !== (this.lastSentFlags & ~POSE_FLAGS.moving);
		const due = changing ? now - this.lastSendAt >= this.interval - SEND_TOLERANCE_MS : wasMoving;

		if (!(due || teleported || flagsChanged || this.forced)) return null;
		return this.emit(pose, flags, now, serverNow);
	}

	/** Called when frames stop arriving: one `away` pose at the last known position. */
	markAway(now: number, serverNow: number): PoseSample | null {
		if (!this.latest || !Number.isFinite(serverNow)) return null;
		if ((this.lastSentFlags & POSE_FLAGS.away) !== 0) return null;
		const flags = poseFlags(this.latest) | POSE_FLAGS.away;
		return this.emit(this.latest, flags, now, serverNow);
	}

	private emit(pose: LocalPose, flags: number, now: number, serverNow: number): PoseSample {
		this.lastSendAt = now;
		this.lastSentFlags = flags;
		this.forced = false;
		this.seq = (this.seq + 1) & 0xffff;
		return {
			flags,
			seq: this.seq,
			sampleTime: serverNow,
			x: pose.x,
			y: pose.feetY,
			z: pose.z,
			yaw: pose.yaw,
			pitch: pose.pitch
		};
	}
}

function poseChanged(a: LocalPose, b: LocalPose): boolean {
	return (
		Math.abs(a.x - b.x) > POSITION_EPSILON ||
		Math.abs(a.feetY - b.feetY) > POSITION_EPSILON ||
		Math.abs(a.z - b.z) > POSITION_EPSILON ||
		Math.abs(a.yaw - b.yaw) > ANGLE_EPSILON ||
		Math.abs(a.pitch - b.pitch) > ANGLE_EPSILON
	);
}

function poseFlags(pose: LocalPose): number {
	return (
		(pose.flying ? POSE_FLAGS.flying : 0) |
		(pose.grounded ? POSE_FLAGS.grounded : 0) |
		(pose.running ? POSE_FLAGS.running : 0) |
		(pose.building ? POSE_FLAGS.building : 0)
	);
}
