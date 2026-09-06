import type { HingeSide } from './openingVisualMath';
import type { WallCollisionRect } from './wallCollision';

export const DOOR_OPEN_ANGLE = Math.PI / 2;
export const DOOR_INTERACT_MAX_DISTANCE = 4;
export const DOOR_INTERACT_AIM_RADIUS = 1.25;
/** Radians per second — π/2 takes a bit under 0.2s, so a KeyK press reads as a swing, not a snap. */
export const DOOR_SWING_SPEED = 10;
/**
 * Below this |hinge angle| the doorway is sealed with a wall-thick collider (same footprint as the
 * opening hole). Past it, only the swung leaf remains so the hole is walkable again.
 */
export const CLOSED_DOOR_COLLISION_ANGLE = 0.35;

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/**
 * Left-hinged leaves extend in +U; a +Y rotation swings them toward −thickness. Right-hinged
 * leaves extend in −U, so the opposite sign lands on the same side of the wall. Closed is always 0.
 */
export function doorOpenAngle(hingeSide: HingeSide): number {
	return hingeSide === 'left' ? DOOR_OPEN_ANGLE : -DOOR_OPEN_ANGLE;
}

export function doorTargetAngle(hingeSide: HingeSide, open: boolean): number {
	return open ? doorOpenAngle(hingeSide) : 0;
}

/**
 * Nearest door whose aim point (the opening's wall-local centre, in world space) sits along the
 * look ray, within `maxDistance` and no further than `aimRadius` off the ray. Used so K still
 * finds an open door whose leaf has swung out of the doorway.
 */
export function pickDoorAlongRay(
	origin: Vec3,
	direction: Vec3,
	candidates: readonly { id: string; aim: Vec3 }[],
	maxDistance = DOOR_INTERACT_MAX_DISTANCE,
	aimRadius = DOOR_INTERACT_AIM_RADIUS
): string | null {
	let bestId: string | null = null;
	let bestAlong = Infinity;
	for (const candidate of candidates) {
		const dx = candidate.aim.x - origin.x;
		const dy = candidate.aim.y - origin.y;
		const dz = candidate.aim.z - origin.z;
		const along = dx * direction.x + dy * direction.y + dz * direction.z;
		if (along < 0 || along > maxDistance || along >= bestAlong) continue;
		const closestX = origin.x + direction.x * along;
		const closestY = origin.y + direction.y * along;
		const closestZ = origin.z + direction.z * along;
		const perp = Math.hypot(
			candidate.aim.x - closestX,
			candidate.aim.y - closestY,
			candidate.aim.z - closestZ
		);
		if (perp > aimRadius) continue;
		bestAlong = along;
		bestId = candidate.id;
	}
	return bestId;
}

export function stepAngleToward(current: number, target: number, maxStep: number): number {
	const delta = target - current;
	if (Math.abs(delta) <= maxStep) return target;
	return current + Math.sign(delta) * maxStep;
}

/**
 * Oriented box for the door leaf in its current swing: hinge at one end, free edge `width` away
 * along `leafDir` (already rotated). Closed (`leafDir` along the wall) fills the doorway; open
 * (`leafDir` perpendicular) sits beside it so the hole is walkable again.
 */
export function doorLeafCollisionRect(input: {
	hingeX: number;
	hingeY: number;
	hingeZ: number;
	leafDirX: number;
	leafDirZ: number;
	width: number;
	height: number;
	halfThickness: number;
}): WallCollisionRect | null {
	const length = Math.hypot(input.leafDirX, input.leafDirZ);
	if (length < 1e-8 || input.width <= 1e-6 || input.height <= 1e-6) return null;
	const dirX = input.leafDirX / length;
	const dirZ = input.leafDirZ / length;
	const halfLength = input.width / 2;
	return {
		centerX: input.hingeX + dirX * halfLength,
		centerZ: input.hingeZ + dirZ * halfLength,
		halfLength,
		halfThickness: Math.max(1e-4, input.halfThickness),
		dirX,
		dirZ,
		minWorldY: input.hingeY,
		maxWorldY: input.hingeY + input.height
	};
}

/**
 * Closed: wall-thick box filling the opening (the hole `computeSolidWallSegments` left empty).
 * Open: thinner swung leaf so the doorway is walkable and the leaf itself is still solid.
 */
export function doorCollisionRect(input: {
	angle: number;
	hingeX: number;
	hingeY: number;
	hingeZ: number;
	leafDirX: number;
	leafDirZ: number;
	openingCenterX: number;
	openingCenterZ: number;
	openingMinY: number;
	wallDirX: number;
	wallDirZ: number;
	openingWidth: number;
	openingHeight: number;
	leafWidth: number;
	leafHeight: number;
	wallHalfThickness: number;
	leafHalfThickness: number;
}): WallCollisionRect | null {
	if (Math.abs(input.angle) <= CLOSED_DOOR_COLLISION_ANGLE) {
		const length = Math.hypot(input.wallDirX, input.wallDirZ);
		if (length < 1e-8 || input.openingWidth <= 1e-6 || input.openingHeight <= 1e-6) return null;
		return {
			centerX: input.openingCenterX,
			centerZ: input.openingCenterZ,
			halfLength: input.openingWidth / 2,
			halfThickness: Math.max(1e-4, input.wallHalfThickness),
			dirX: input.wallDirX / length,
			dirZ: input.wallDirZ / length,
			minWorldY: input.openingMinY,
			maxWorldY: input.openingMinY + input.openingHeight
		};
	}
	return doorLeafCollisionRect({
		hingeX: input.hingeX,
		hingeY: input.hingeY,
		hingeZ: input.hingeZ,
		leafDirX: input.leafDirX,
		leafDirZ: input.leafDirZ,
		width: input.leafWidth,
		height: input.leafHeight,
		halfThickness: input.leafHalfThickness
	});
}
