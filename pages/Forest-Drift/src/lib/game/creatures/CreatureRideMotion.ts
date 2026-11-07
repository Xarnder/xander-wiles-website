/**
 * How a ridden creature moves: the rider steers (camera-relative, Q2 A), it follows the terrain and
 * the same walkability rules as a wild creature (slope, deep water, buildings; Q18 A), slides around
 * other creatures (Q24) and, unlike a wild one, isn't leashed to its herd's home. Pure: no Three.js.
 *
 * Plan: docs/2026/11-07/bipedal-speed-creature/feature-plan/02-technical-plan.md §4.2.
 */
import type { CreatureRuntimeDefinition, CreatureWorldAccess } from './CreatureTypes';
import { creatureDimensions, creatureSurface } from './CreaturePopulationSystem';
import { resolveTerrainLocomotion } from './CreatureTerrainProfile';
import { rideTopSpeed, type RideProfile } from './creatureRiding';

/** Camera-space steering: `x` right, `z` forward, each in [-1, 1]. */
export interface RideInput {
	x: number;
	z: number;
	sprint: boolean;
}

export const NO_RIDE_INPUT: RideInput = Object.freeze({ x: 0, z: 0, sprint: false });

/** Another creature's footprint the ridden one slides around. */
export interface RideObstacle {
	x: number;
	z: number;
	radius: number;
}

export interface RideStepResult {
	/** The rider asked to move but nothing in that direction was walkable. */
	blocked: boolean;
}

/** Speeding up and slowing down, m/s². */
export const RIDE_ACCELERATION = 10;
export const RIDE_BRAKING = 14;
/** Input below this is treated as none (stick drift). */
const DEAD_ZONE = 0.05;
/** Below this speed the gait is idle, m/s. */
const IDLE_SPEED = 0.2;
/** Headings tried when straight ahead is blocked, radians either side. */
const SLIDE_ANGLES = [0.65, -0.65, 1.2, -1.2];
/** A frame hitch never moves the creature further than this many seconds' worth at once. */
const MAX_STEP_SECONDS = 0.25;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The world heading (`atan2(x, z)`, the creature convention) of camera-relative input, or null when
 * the input is inside the dead zone. The camera looks along `(-sin yaw, -cos yaw)`.
 */
export function rideInputHeading(input: RideInput, cameraYaw: number): number | null {
	const length = Math.hypot(input.x, input.z);
	if (length < DEAD_ZONE) return null;
	const sin = Math.sin(cameraYaw),
		cos = Math.cos(cameraYaw);
	const dirX = input.x * cos - input.z * sin;
	const dirZ = -input.x * sin - input.z * cos;
	return Math.atan2(dirX, dirZ);
}

/**
 * Advances a ridden creature by `dt` seconds. Turns toward the input heading at the profile's turn
 * rate, eases its speed toward the target (slower through sharp turns), and moves in substeps so a
 * long frame can't tunnel through a wall. Writes `state.position`, `heading` and `intent`.
 */
export function advanceRiddenCreature(
	state: CreatureRuntimeDefinition,
	profile: RideProfile,
	input: RideInput,
	cameraYaw: number,
	runSpeed: number,
	dt: number,
	access: CreatureWorldAccess,
	obstacles: readonly RideObstacle[] = []
): RideStepResult {
	if (!Number.isFinite(dt) || dt <= 0) return { blocked: false };
	const elapsed = Math.min(dt, MAX_STEP_SECONDS);
	const desired = rideInputHeading(input, cameraYaw);
	const magnitude = Math.min(1, Math.hypot(input.x, input.z));

	// Turn in an arc, never a snap.
	let turnLeft = 0;
	if (desired !== null) {
		const delta = wrapAngle(desired - state.heading);
		const step = Math.max(-profile.turnRate * elapsed, Math.min(profile.turnRate * elapsed, delta));
		state.heading = wrapAngle(state.heading + step);
		state.intent.angularVelocity = step / elapsed;
		turnLeft = Math.abs(delta - step);
	} else state.intent.angularVelocity = 0;

	// Ease toward the target speed; slow right down to turn round.
	const top = desired === null ? 0 : rideTopSpeed(profile, runSpeed, input.sprint) * magnitude;
	const target = top * Math.max(0.3, Math.cos(Math.min(turnLeft, Math.PI / 2)));
	const current = Math.hypot(state.intent.velocity.x, state.intent.velocity.z);
	const rate = target > current ? RIDE_ACCELERATION : RIDE_BRAKING;
	let speed =
		target > current
			? Math.min(target, current + rate * elapsed)
			: Math.max(target, current - rate * elapsed);

	const blocked = speed > 0 && !move(state, speed, elapsed, access, obstacles);
	if (blocked) speed = 0;
	state.intent.velocity = {
		x: Math.sin(state.heading) * speed,
		y: 0,
		z: Math.cos(state.heading) * speed
	};
	state.intent.heading = state.heading;
	state.intent.gait = speed > IDLE_SPEED ? 'run' : 'idle';
	state.target = { ...state.position };
	return { blocked: blocked && desired !== null };
}

/** Moves along the heading (or a slide either side of it) in substeps. False when fully blocked. */
function move(
	state: CreatureRuntimeDefinition,
	speed: number,
	elapsed: number,
	access: CreatureWorldAccess,
	obstacles: readonly RideObstacle[]
): boolean {
	const dims = creatureDimensions(state.spawn.species, state.spawn.individual.sizeFactor);
	const slope = Math.tan(resolveTerrainLocomotion(state.spawn.species).maxWalkSlope);
	const distance = speed * elapsed;
	const steps = Math.max(1, Math.ceil(distance / Math.max(0.1, dims.radius * 0.35)));
	const stepLength = distance / steps;
	let moved = false;
	for (let i = 0; i < steps; i++) {
		const next = stepFrom(state, stepLength, dims, slope, access, obstacles);
		if (!next) break;
		state.position = next;
		moved = true;
	}
	return moved;
}

function stepFrom(
	state: CreatureRuntimeDefinition,
	length: number,
	dims: { radius: number; height: number },
	slope: number,
	access: CreatureWorldAccess,
	obstacles: readonly RideObstacle[]
): { x: number; y: number; z: number } | null {
	for (const offset of [0, ...SLIDE_ANGLES]) {
		const heading = state.heading + offset;
		// Sliding along a wall covers less ground than heading straight on.
		const reach = length * Math.cos(offset);
		const x = state.position.x + Math.sin(heading) * reach,
			z = state.position.z + Math.cos(heading) * reach;
		const y = walkableSurface(state, x, z, dims, slope, access, obstacles);
		if (y !== undefined) return { x, y, z };
	}
	return null;
}

/** The ground height at (x, z) when the creature may stand there, otherwise undefined. */
function walkableSurface(
	state: CreatureRuntimeDefinition,
	x: number,
	z: number,
	dims: { radius: number; height: number },
	slope: number,
	access: CreatureWorldAccess,
	obstacles: readonly RideObstacle[]
): number | undefined {
	if (access.standable && !access.standable(x, z)) return undefined;
	for (const o of obstacles) {
		const clearance = o.radius + dims.radius * 0.6;
		const after = Math.hypot(x - o.x, z - o.z);
		// Already overlapping (it walked into us): moving apart is always allowed.
		if (after < clearance && after < Math.hypot(state.position.x - o.x, state.position.z - o.z))
			return undefined;
	}
	return creatureSurface(access, x, z, dims.radius, dims.height, slope);
}
