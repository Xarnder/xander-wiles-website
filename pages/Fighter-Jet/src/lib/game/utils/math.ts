import { Vector3 } from 'three';

export const TAU = Math.PI * 2;

export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

export function saturate(value: number): number {
	return clamp(value, 0, 1);
}

export function lerp(from: number, to: number, alpha: number): number {
	return from + (to - from) * alpha;
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, sharpness: number, delta: number): number {
	return lerp(current, target, 1 - Math.exp(-sharpness * Math.max(0, delta)));
}

export function wrapAngle(angle: number): number {
	return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export function angleDifference(from: number, to: number): number {
	return wrapAngle(to - from);
}

export function dampAngle(
	current: number,
	target: number,
	sharpness: number,
	delta: number
): number {
	return wrapAngle(current + angleDifference(current, target) * (1 - Math.exp(-sharpness * delta)));
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
	if (Math.abs(target - current) <= maxDelta) return target;
	return current + Math.sign(target - current) * maxDelta;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = saturate((value - edge0) / Math.max(Number.EPSILON, edge1 - edge0));
	return t * t * (3 - 2 * t);
}

/**
 * Writes the constant-speed intercept point into `out`.
 * Returns false when the target cannot be intercepted and writes its current position.
 */
export function solveInterceptPoint(
	shooter: Vector3,
	target: Vector3,
	targetVelocity: Vector3,
	projectileSpeed: number,
	out: Vector3
): boolean {
	const rx = target.x - shooter.x;
	const ry = target.y - shooter.y;
	const rz = target.z - shooter.z;
	const velocitySquared = targetVelocity.lengthSq();
	const speedSquared = projectileSpeed * projectileSpeed;
	const a = velocitySquared - speedSquared;
	const b = 2 * (rx * targetVelocity.x + ry * targetVelocity.y + rz * targetVelocity.z);
	const c = rx * rx + ry * ry + rz * rz;
	let time: number;

	if (Math.abs(a) < 1e-6) {
		if (Math.abs(b) < 1e-6) {
			out.copy(target);
			return false;
		}
		time = -c / b;
	} else {
		const discriminant = b * b - 4 * a * c;
		if (discriminant < 0) {
			out.copy(target);
			return false;
		}
		const root = Math.sqrt(discriminant);
		const first = (-b - root) / (2 * a);
		const second = (-b + root) / (2 * a);
		time = first > 0 ? first : second;
	}

	if (time <= 0 || !Number.isFinite(time)) {
		out.copy(target);
		return false;
	}
	out.copy(target).addScaledVector(targetVelocity, time);
	return true;
}

/**
 * Rotates a unit direction toward another direction by at most `maxRadians`.
 * All inputs may be reused by callers; only `out` is changed.
 */
export function steerDirection(
	current: Vector3,
	desired: Vector3,
	maxRadians: number,
	out: Vector3
): Vector3 {
	const dot = clamp(current.dot(desired), -1, 1);
	const angle = Math.acos(dot);
	if (angle <= maxRadians || angle < 1e-6) return out.copy(desired).normalize();
	const t = maxRadians / angle;
	const sine = Math.sin(angle);
	const currentWeight = Math.sin((1 - t) * angle) / sine;
	const desiredWeight = Math.sin(t * angle) / sine;
	return out
		.copy(current)
		.multiplyScalar(currentWeight)
		.addScaledVector(desired, desiredWeight)
		.normalize();
}

export function hashNoise2D(x: number, z: number): number {
	const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
	return (value - Math.floor(value)) * 2 - 1;
}
