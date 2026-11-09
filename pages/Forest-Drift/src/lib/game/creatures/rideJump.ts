/**
 * Jumping on a ridden creature: a smooth arc above the ground under it, half the creature's own
 * height, so bigger creatures jump higher. The rider sits on the creature, so they rise and fall
 * with it; the creature keeps moving and steering as it flies. Pure (no Three.js), so it's
 * unit-tested.
 */
import type { RideProfile } from './creatureRiding';

/** Pull back down, m/s². A little lighter than a player's, so a ridden jump floats a touch. */
export const RIDE_JUMP_GRAVITY = 20;
/**
 * Apex height: half the creature's own height, so a jump is in proportion to whatever is being
 * ridden (a 3 m creature jumps 1.5 m, a 20 m giant 10 m), and never less than the minimum (metres).
 */
export const RIDE_JUMP_HEIGHT_FRACTION = 0.5;
export const RIDE_JUMP_MIN_HEIGHT = 0.9;

export interface RideJumpState {
	/** Height above the ground under the creature, metres (0 standing). */
	height: number;
	/** Upward speed, m/s. */
	velocity: number;
}

/** What happened this step, for the take-off and landing sounds. */
export interface RideJumpStep {
	jumped: boolean;
	landed: boolean;
}

export const restingRideJump = (): RideJumpState => ({ height: 0, velocity: 0 });

/** How high `profile`'s creature jumps, metres. */
export function rideJumpApex(profile: Pick<RideProfile, 'height'>): number {
	return Math.max(RIDE_JUMP_MIN_HEIGHT, profile.height * RIDE_JUMP_HEIGHT_FRACTION);
}

export function rideJumpAirborne(jump: RideJumpState): boolean {
	return jump.height > 0 || jump.velocity > 0;
}

/**
 * Advances the jump by `dt` seconds: takes off when `wantsJump` and standing (holding the key
 * jumps again on landing, as on foot), otherwise follows the arc and lands at 0.
 */
export function stepRideJump(
	jump: RideJumpState,
	wantsJump: boolean,
	profile: Pick<RideProfile, 'height'>,
	dt: number
): RideJumpStep {
	const step: RideJumpStep = { jumped: false, landed: false };
	if (!Number.isFinite(dt) || dt <= 0) return step;
	if (!rideJumpAirborne(jump)) {
		if (!wantsJump) return step;
		jump.velocity = Math.sqrt(2 * RIDE_JUMP_GRAVITY * rideJumpApex(profile));
		step.jumped = true;
	}
	// Exact for constant gravity, so the arc is the same at any frame rate.
	jump.height += jump.velocity * dt - 0.5 * RIDE_JUMP_GRAVITY * dt * dt;
	jump.velocity -= RIDE_JUMP_GRAVITY * dt;
	if (jump.height <= 0 && jump.velocity <= 0) {
		jump.height = 0;
		jump.velocity = 0;
		step.landed = true;
	}
	return step;
}
