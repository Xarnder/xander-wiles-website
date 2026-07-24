import { Euler, Object3D, Vector3 } from 'three';
import { BALANCE } from '../config/balance';
import type { InputState } from '../types';
import { clamp, damp, dampAngle, moveTowards, wrapAngle } from '../utils/math';

const _forward = new Vector3();
const _euler = new Euler(0, 0, 0, 'YXZ');

export class FlightController {
	readonly velocity = new Vector3();
	speed: number = BALANCE.flight.cruiseSpeed;
	pitch = 0;
	roll = 0;
	yaw = Math.PI;
	afterburnerFuel: number = BALANCE.flight.afterburnerCapacity;
	afterburnerActive = false;
	altitude = 0;

	constructor(readonly aircraft: Object3D) {}

	reset(position = new Vector3(0, 260, 1200), yaw = Math.PI): void {
		this.aircraft.position.copy(position);
		this.speed = BALANCE.flight.cruiseSpeed;
		this.pitch = 0;
		this.roll = 0;
		this.yaw = yaw;
		this.afterburnerFuel = BALANCE.flight.afterburnerCapacity;
		this.afterburnerActive = false;
		this.velocity.set(0, 0, 0);
		this.applyRotation();
	}

	update(
		delta: number,
		input: Readonly<InputState>,
		terrainHeight: number,
		autoLevel = true,
		groundCollisionEnabled = true
	): boolean {
		const desiredRoll = input.roll * 1.12;
		this.roll = damp(this.roll, desiredRoll, 4.6, delta);
		this.roll = clamp(this.roll, -1.25, 1.25);

		// Rate-based pitch so holding up/down can carry through a full loop.
		this.pitch = wrapAngle(this.pitch + input.pitch * BALANCE.flight.pitchRate * delta);
		if (Math.abs(input.pitch) < 0.04 && Math.abs(this.pitch) < 0.55) {
			// Soft settle only while near level — do not fight inverted / looping attitudes.
			this.pitch = damp(this.pitch, 0, 1.4, delta);
		}

		// Positive yaw turns toward local left for the jet's -Z forward axis,
		// while positive roll banks right, so bank-induced yaw uses the opposite sign.
		const turnFromBank = -Math.sin(this.roll) * BALANCE.flight.yawRate;
		const directYaw = input.yaw * BALANCE.flight.yawRate * 0.72;
		this.yaw = wrapAngle(this.yaw + (turnFromBank + directYaw) * delta);
		if (autoLevel && Math.abs(input.roll) < 0.04) {
			this.roll = dampAngle(this.roll, 0, BALANCE.flight.autoLevelRate, delta);
		}

		this.afterburnerActive = input.afterburner && this.afterburnerFuel > 0.05;
		if (this.afterburnerActive) {
			this.afterburnerFuel = Math.max(0, this.afterburnerFuel - delta);
		} else {
			this.afterburnerFuel = Math.min(
				BALANCE.flight.afterburnerCapacity,
				this.afterburnerFuel + BALANCE.flight.afterburnerRecharge * delta
			);
		}
		const throttleSpeed =
			BALANCE.flight.minSpeed +
			(BALANCE.flight.maxSpeed - BALANCE.flight.minSpeed) * input.throttle;
		const desiredSpeed = this.afterburnerActive ? BALANCE.flight.afterburnerSpeed : throttleSpeed;
		const rate = desiredSpeed > this.speed ? BALANCE.flight.acceleration : BALANCE.flight.braking;
		this.speed = moveTowards(this.speed, desiredSpeed, rate * delta);

		this.applyRotation();
		_forward.set(0, 0, -1).applyQuaternion(this.aircraft.quaternion);
		this.velocity.copy(_forward).multiplyScalar(this.speed);
		this.aircraft.position.addScaledVector(this.velocity, delta);

		const floor =
			terrainHeight +
			(groundCollisionEnabled ? BALANCE.flight.crashClearance : BALANCE.flight.terrainClearance);
		if (this.aircraft.position.y < floor) {
			this.aircraft.position.y = floor;
			if (groundCollisionEnabled) {
				this.velocity.set(0, 0, 0);
				this.speed = 0;
				this.altitude = BALANCE.flight.crashClearance;
				return true;
			}
			// Nudge toward a climbing attitude without blocking later loops.
			if (Math.abs(this.pitch) < 0.9) this.pitch = Math.max(this.pitch, 0.12);
			this.speed = Math.max(BALANCE.flight.minSpeed, this.speed * 0.96);
			this.applyRotation();
		}
		this.altitude = Math.max(0, this.aircraft.position.y - terrainHeight);
		return false;
	}

	get afterburnerRatio(): number {
		return this.afterburnerFuel / BALANCE.flight.afterburnerCapacity;
	}

	get heading(): number {
		return (this.yaw + Math.PI * 2) % (Math.PI * 2);
	}

	private applyRotation(): void {
		_euler.set(-this.pitch, this.yaw, -this.roll);
		this.aircraft.quaternion.setFromEuler(_euler);
	}
}
