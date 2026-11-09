/**
 * The box `K` aims at to pick up or ride a creature: its body's bounding box, turned with it and
 * padded on every side, so small or fast-moving creatures are easy to target. Pure (no Three.js),
 * so it's unit-tested; the scene draws the same box in the debug overlay.
 */

export interface HitboxVec3 {
	x: number;
	y: number;
	z: number;
}

/** A box turned about the vertical axis: `half` is measured along the creature's own axes. */
export interface CreatureHitbox {
	centre: HitboxVec3;
	half: HitboxVec3;
	/** The creature's heading (Three.js `rotation.y`). */
	yaw: number;
}

/** Padding on every side, metres: a base plus a share of the creature's largest dimension. */
export const HITBOX_PADDING_BASE = 0.3;
export const HITBOX_PADDING_FRACTION = 0.25;
/** Never more padding than this, metres (a giant's box is already large). */
export const HITBOX_PADDING_MAX = 0.8;
/** Smallest half-size across and along the body, and vertically, metres. */
export const HITBOX_MIN_HALF = 0.55;
export const HITBOX_MIN_HALF_HEIGHT = 0.5;
/** Below the lowest foot, metres. */
const GROUND_MARGIN = 0.05;
/** Around the body's core (its collision cylinder, as a box), metres. */
const CORE_PADDING = 0.1;

/** The local (creature-space) bounds the hitbox is built from, as `CreatureBounds` has them. */
export interface HitboxBounds {
	min: HitboxVec3;
	max: HitboxVec3;
}

/** The body's core, as `CreatureCollisionDefinition` has it: a cylinder about its root. */
export interface HitboxCore {
	radius: number;
	height: number;
}

/** The hitbox of a creature drawn at `position` facing `yaw`: its bounds, padded. */
export function creatureHitbox(
	bounds: HitboxBounds,
	position: HitboxVec3,
	yaw: number
): CreatureHitbox {
	const { min, max } = bounds;
	const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 0);
	const pad = Math.min(HITBOX_PADDING_MAX, HITBOX_PADDING_BASE + HITBOX_PADDING_FRACTION * size);
	// From the ground (or the lowest foot) up to above the head.
	const bottom = Math.min(min.y, 0) - GROUND_MARGIN;
	const top = max.y + pad;
	const halfY = Math.max(HITBOX_MIN_HALF_HEIGHT, (top - bottom) / 2);
	const local = { x: (min.x + max.x) / 2, y: bottom + halfY, z: (min.z + max.z) / 2 };
	const cos = Math.cos(yaw),
		sin = Math.sin(yaw);
	return {
		centre: {
			// Three.js rotation about Y: x' = x cos + z sin, z' = −x sin + z cos.
			x: position.x + local.x * cos + local.z * sin,
			y: position.y + local.y,
			z: position.z - local.x * sin + local.z * cos
		},
		half: {
			x: Math.max(HITBOX_MIN_HALF, (max.x - min.x) / 2 + pad),
			y: halfY,
			z: Math.max(HITBOX_MIN_HALF, (max.z - min.z) / 2 + pad)
		},
		yaw
	};
}

/** The body's core as a box: what counts once the eye is inside the padded hitbox. */
export function creatureCoreBox(
	core: HitboxCore,
	position: HitboxVec3,
	yaw: number
): CreatureHitbox {
	const half = core.radius + CORE_PADDING;
	const halfY = core.height / 2 + GROUND_MARGIN;
	return {
		centre: { x: position.x, y: position.y + core.height / 2, z: position.z },
		half: { x: half, y: halfY, z: half },
		yaw
	};
}

/**
 * How far along the ray from `eye` in direction `dir` (unit length) it enters `box`, or null when
 * it misses or enters beyond `reach`. 0 when the eye is already inside.
 */
export function rayEntersHitbox(
	eye: HitboxVec3,
	dir: HitboxVec3,
	box: CreatureHitbox,
	reach: number
): number | null {
	const cos = Math.cos(box.yaw),
		sin = Math.sin(box.yaw);
	// Into the box's own axes (the inverse of the rotation in `creatureHitbox`).
	const toLocal = (x: number, z: number) => ({ x: x * cos - z * sin, z: x * sin + z * cos });
	const o = toLocal(eye.x - box.centre.x, eye.z - box.centre.z);
	const d = toLocal(dir.x, dir.z);
	const origin = [o.x, eye.y - box.centre.y, o.z];
	const direction = [d.x, dir.y, d.z];
	const half = [box.half.x, box.half.y, box.half.z];
	let near = 0,
		far = reach;
	for (let axis = 0; axis < 3; axis++) {
		const from = origin[axis],
			step = direction[axis],
			extent = half[axis];
		if (Math.abs(step) < 1e-9) {
			if (from < -extent || from > extent) return null;
			continue;
		}
		let t0 = (-extent - from) / step,
			t1 = (extent - from) / step;
		if (t0 > t1) [t0, t1] = [t1, t0];
		near = Math.max(near, t0);
		far = Math.min(far, t1);
		if (near > far) return null;
	}
	return near;
}

/**
 * Where the look ray meets a creature, or null: its padded hitbox, unless the eye is already inside
 * it (standing right beside the creature, or just got off it). Then the ray has to meet the body's
 * core, so a creature next to you isn't picked whichever way you look.
 */
export function creatureRayHit(
	bounds: HitboxBounds,
	core: HitboxCore,
	position: HitboxVec3,
	yaw: number,
	eye: HitboxVec3,
	dir: HitboxVec3,
	reach: number
): number | null {
	const t = rayEntersHitbox(eye, dir, creatureHitbox(bounds, position, yaw), reach);
	if (t === null || t > 0) return t;
	return rayEntersHitbox(eye, dir, creatureCoreBox(core, position, yaw), reach);
}

/** The shortest distance from `point` to `box`, metres (0 inside it). */
export function hitboxDistance(point: HitboxVec3, box: CreatureHitbox): number {
	const cos = Math.cos(box.yaw),
		sin = Math.sin(box.yaw);
	const dx = point.x - box.centre.x,
		dz = point.z - box.centre.z;
	const outside = (offset: number, half: number) => Math.max(0, Math.abs(offset) - half);
	return Math.hypot(
		outside(dx * cos - dz * sin, box.half.x),
		outside(point.y - box.centre.y, box.half.y),
		outside(dx * sin + dz * cos, box.half.z)
	);
}
