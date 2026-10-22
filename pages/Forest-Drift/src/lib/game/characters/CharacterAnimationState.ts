import { POSE_FLAGS } from '../net/protocol';
import type { MotionFrame } from '../net/RemoteMotion';

const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Cosmetic, client-side state. No extra network fields or changes to player collision. */
export class CharacterAnimationState {
	bodyYaw = 0;
	headYaw = 0;
	torsoYaw = 0;
	backpedaling = false;
	pitch = 0;
	reach = 0;
	compression = 0;
	private turning = false;
	private grounded = true;
	private flying = false;
	private airTime = 0;
	private fallSpeed = 0;
	private landingAge = 1;
	private impact = 0;

	update(
		frame: MotionFrame,
		dt: number,
		reset: boolean,
		verticalDelta: number,
		speed = frame.speed,
		travelYaw?: number
	): void {
		const flying = !!(frame.flags & POSE_FLAGS.flying);
		const grounded = !!(frame.flags & POSE_FLAGS.grounded) && !flying;
		const inactive = frame.stale || !!(frame.flags & POSE_FLAGS.away);
		if (reset) {
			this.bodyYaw = frame.yaw;
			this.pitch = clamp(frame.pitch, -1.15, 1.15);
			this.grounded = grounded;
			this.flying = flying;
			this.airTime = this.fallSpeed = this.impact = this.compression = this.reach = 0;
			this.landingAge = 1;
			this.turning = false;
			this.backpedaling = false;
		}
		const locomotion = grounded && !inactive && speed > 0.2 && travelYaw !== undefined;
		let targetYaw = frame.yaw;
		if (locomotion) {
			let travelOffset = angle(travelYaw - frame.yaw);
			// Backpedal instead of turning the whole body away and twisting the neck 180°.
			// Hysteresis keeps tiny sideways velocity/camera changes from flipping the hips 180°.
			if (Math.abs(travelOffset) > Math.PI / 2 + 0.18) this.backpedaling = true;
			else if (Math.abs(travelOffset) < Math.PI / 2 + 0.02) this.backpedaling = false;
			if (this.backpedaling) travelOffset = angle(travelOffset + Math.PI);
			targetYaw = frame.yaw + travelOffset;
		}
		let error = angle(frame.yaw - this.bodyYaw);
		if (Math.abs(error) > 0.65) this.turning = true;
		if (Math.abs(error) < 0.1) this.turning = false;
		if ((speed > 0.2 && !inactive) || this.turning) {
			this.bodyYaw = angle(
				this.bodyYaw + angle(targetYaw - this.bodyYaw) * (1 - Math.exp(-dt * 8))
			);
		}
		error = angle(frame.yaw - this.bodyYaw);
		const maxTwist = locomotion ? Math.PI / 2 + 0.18 : 1;
		if (Math.abs(error) > maxTwist) {
			this.bodyYaw = angle(frame.yaw - Math.sign(error) * maxTwist);
			error = Math.sign(error) * maxTwist;
		}
		// Share a sideways look between the chest and neck while hips/feet follow travel.
		this.torsoYaw = locomotion ? clamp(error * 0.35, -0.55, 0.55) : 0;
		this.headYaw = error - this.torsoYaw;
		this.pitch += (clamp(frame.pitch, -1.15, 1.15) - this.pitch) * (1 - Math.exp(-dt * 16));
		const building = !inactive && !!(frame.flags & POSE_FLAGS.building);
		this.reach += ((building ? 1 : 0) - this.reach) * (1 - Math.exp(-dt * (building ? 12 : 9)));
		if (!grounded && !flying && !inactive) {
			this.airTime += dt;
			if (dt > 0) this.fallSpeed = Math.max(this.fallSpeed, clamp(-verticalDelta / dt, 0, 15));
		}
		if (grounded && !this.grounded && !this.flying && this.airTime > 0.08 && !inactive) {
			this.impact = clamp(0.025 + this.fallSpeed * 0.015, 0.035, 0.17);
			this.landingAge = 0;
		}
		if (grounded || flying || inactive) this.airTime = this.fallSpeed = 0;
		if (flying || !grounded) this.impact = 0;
		this.landingAge += dt;
		const age = this.landingAge;
		const u = clamp((age - 0.1) / 0.32, 0, 1);
		this.compression =
			this.impact * (age < 0.1 ? Math.sin(((age / 0.1) * Math.PI) / 2) : 1 - u * u * (3 - 2 * u));
		this.grounded = grounded;
		this.flying = flying;
	}
}
