export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export const FURNITURE_SURFACE_OFFSET = 0.035;
export const TORCH_FLAME_HEIGHT = 0.46;
export const TORCH_PLACE_MAX_DISTANCE = 10;

export function vecLength(v: Vec3): number {
	return Math.hypot(v.x, v.y, v.z);
}

export function vecNormalize(v: Vec3): Vec3 | null {
	const len = vecLength(v);
	if (len < 1e-6) return null;
	return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vecScale(v: Vec3, s: number): Vec3 {
	return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vecDot(a: Vec3, b: Vec3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x
	};
}

/** Flip the hit normal so it faces the player (away from the surface). */
export function facingNormal(rayDirection: Vec3, hitNormal: Vec3): Vec3 | null {
	const n = vecNormalize(hitNormal);
	if (!n) return null;
	return vecDot(n, rayDirection) > 0 ? vecScale(n, -1) : n;
}

function tangentFor(axis: Vec3): Vec3 {
	const helper = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
	return vecNormalize(vecCross(helper, axis)) ?? { x: 1, y: 0, z: 0 };
}

/**
 * Local +Y is along the torch handle toward the flame. On a floor that follows the surface
 * normal; on a wall the handle stays world-up and the back faces the wall.
 */
export function furnitureBasis(normal: Vec3): { x: Vec3; y: Vec3; z: Vec3 } | null {
	const n = vecNormalize(normal);
	if (!n) return null;

	if (n.y > 0.65) {
		const y = n;
		const x = tangentFor(y);
		const z = vecNormalize(vecCross(x, y));
		if (!z) return null;
		return { x, y, z };
	}
	if (n.y < -0.65) {
		const y = { x: 0, y: -1, z: 0 };
		const x = tangentFor(y);
		const z = vecNormalize(vecCross(x, y));
		if (!z) return null;
		return { x, y, z };
	}

	const y = { x: 0, y: 1, z: 0 };
	const z = vecNormalize({ x: -n.x, y: 0, z: -n.z });
	if (!z) return null;
	const x = vecNormalize(vecCross(y, z));
	if (!x) return null;
	return { x, y, z: vecNormalize(vecCross(x, y)) ?? z };
}

export function furnitureOrigin(hit: Vec3, normal: Vec3): Vec3 {
	return vecAdd(hit, vecScale(normal, FURNITURE_SURFACE_OFFSET));
}

export function torchLightWorldPosition(origin: Vec3, normal: Vec3): Vec3 {
	const basis = furnitureBasis(normal);
	if (!basis) return vecAdd(origin, { x: 0, y: TORCH_FLAME_HEIGHT, z: 0 });
	return vecAdd(origin, vecScale(basis.y, TORCH_FLAME_HEIGHT));
}

export function furnitureDistance(a: Vec3, b: Vec3): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** World-space emissive point for lanterns and fireplaces (floor-placed, yaw ignored for light). */
export function surfaceLightWorldPosition(
	origin: Vec3,
	kind: 'lantern' | 'fireplace',
	height: number
): Vec3 {
	if (kind === 'lantern') return vecAdd(origin, { x: 0, y: height * 0.45, z: 0 });
	return vecAdd(origin, { x: 0, y: Math.min(0.28, height * 0.22), z: 0 });
}
