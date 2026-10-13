import { createNamedRandom } from '../terrain/seededRandom';
import type {
	CreatureRuntimeDefinition,
	CreatureSpawnDefinition,
	CreatureWorldAccess,
	Vec3
} from './CreatureTypes';
import { creatureDimensions, creatureSurface } from './CreaturePopulationSystem';
import { resolveTerrainLocomotion } from './CreatureTerrainProfile';
/** Movement rejects ground steeper than the species can stand on (its body tilt is limited too). */
const slopeLimit = (state: CreatureRuntimeDefinition) =>
	Math.tan(resolveTerrainLocomotion(state.spawn.species).maxWalkSlope);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
export function createCreatureState(spawn: CreatureSpawnDefinition): CreatureRuntimeDefinition {
	return {
		spawn,
		position: { ...spawn.position },
		heading: spawn.heading,
		state: 'IDLE',
		intent: {
			velocity: { x: 0, y: 0, z: 0 },
			heading: spawn.heading,
			angularVelocity: 0,
			gait: 'idle'
		},
		target: { ...spawn.position },
		nextDecision: 0,
		decisionIndex: 0
	};
}
/** Decisions have deterministic timers; callers may invoke freely, but work runs at 2–5 Hz. */
export function decideCreature(
	state: CreatureRuntimeDefinition,
	player: Vec3,
	neighbors: readonly CreatureRuntimeDefinition[],
	time: number,
	access: CreatureWorldAccess
): void {
	if (time < state.nextDecision) return;
	const rng = createNamedRandom(
		String(state.spawn.individual.seed),
		`decision:${state.decisionIndex++}`
	);
	state.nextDecision = time + 0.2 + rng() * 0.3;
	const b = state.spawn.species.behaviour,
		variation = state.spawn.individual.behaviouralVariation;
	const fear = Math.max(0, Math.min(1, b.fear + variation.fear)),
		curiosity = Math.max(0, Math.min(1, b.curiosity + variation.curiosity));
	const playerDistance = distance(state.position, player),
		home = state.spawn.groupCentre;
	const dims = creatureDimensions(state.spawn.species, state.spawn.individual.sizeFactor);
	const limit = Math.max(b.wanderRadius, dims.radius * 3);
	const homeDistance = distance(state.position, home);
	let speed = b.wanderSpeed * variation.speed;
	let target: Vec3 = { ...state.target };
	if (
		playerDistance < b.awarenessRadius &&
		fear > 0.45 &&
		playerDistance < b.comfortDistance * (1 + fear * 3)
	) {
		state.state = 'FLEE';
		speed = b.fleeSpeed * variation.speed;
		let dx = state.position.x - player.x,
			dz = state.position.z - player.z;
		if (Math.hypot(dx, dz) < 0.001) {
			dx = Math.sin(state.heading);
			dz = Math.cos(state.heading);
		}
		const d = Math.hypot(dx, dz);
		target = {
			x: state.position.x + (dx / d) * limit,
			y: state.position.y,
			z: state.position.z + (dz / d) * limit
		};
	} else if (homeDistance > limit * 0.85) {
		state.state = 'RETURN_TO_GROUP';
		target = { ...home };
	} else if (
		playerDistance < b.awarenessRadius &&
		curiosity > 0.5 &&
		playerDistance > b.comfortDistance * 1.3
	) {
		state.state = 'APPROACH';
		target = { ...player };
	} else if (playerDistance < b.awarenessRadius) {
		state.state = 'LOOK';
		target = { ...state.position };
	} else if (state.state === 'WANDER' && distance(state.position, target) > 0.4) {
		/* retain destination until reached */
	} else if (rng() < 0.35) {
		state.state = 'IDLE';
		target = { ...state.position };
	} else {
		state.state = 'WANDER';
		const angle = rng() * Math.PI * 2,
			r = Math.sqrt(rng()) * limit * 0.75;
		target = { x: home.x + Math.sin(angle) * r, y: home.y, z: home.z + Math.cos(angle) * r };
	}
	// Flee and approach also respect a finite home range: streaming cannot strand a population.
	const targetHome = distance(target, home);
	if (targetHome > limit) {
		const ratio = limit / targetHome;
		target.x = home.x + (target.x - home.x) * ratio;
		target.z = home.z + (target.z - home.z) * ratio;
	}
	state.target = target;
	state.intent.lookTarget = playerDistance < b.awarenessRadius ? { ...player } : undefined;
	if (state.state === 'IDLE' || state.state === 'LOOK') {
		state.intent.velocity = { x: 0, y: 0, z: 0 };
		state.intent.gait = 'idle';
		return;
	}
	let dx = target.x - state.position.x,
		dz = target.z - state.position.z;
	const targetDistance = Math.hypot(dx, dz);
	if (targetDistance > 0) {
		dx /= targetDistance;
		dz /= targetDistance;
	}
	let cx = 0,
		cz = 0,
		count = 0;
	for (const other of neighbors) {
		if (other === state) continue;
		const ox = state.position.x - other.position.x,
			oz = state.position.z - other.position.z,
			d = Math.hypot(ox, oz);
		const clearance =
			dims.radius +
			creatureDimensions(other.spawn.species, other.spawn.individual.sizeFactor).radius +
			0.5;
		if (d > 0 && d < clearance * 1.5) {
			dx += (ox / d) * (1 - d / (clearance * 1.5)) * 2;
			dz += (oz / d) * (1 - d / (clearance * 1.5)) * 2;
		}
		if (other.spawn.groupId === state.spawn.groupId) {
			cx += other.position.x;
			cz += other.position.z;
			count++;
		}
	}
	if (count && state.state === 'WANDER') {
		const ox = cx / count - state.position.x,
			oz = cz / count - state.position.z,
			d = Math.hypot(ox, oz);
		if (d > 2) {
			dx += (ox / d) * b.sociality * 0.25;
			dz += (oz / d) * b.sociality * 0.25;
		}
	}
	const length = Math.hypot(dx, dz);
	speed = Math.min(speed, targetDistance * 3);
	let velocity = {
		x: length ? (dx / length) * speed : 0,
		y: 0,
		z: length ? (dz / length) * speed : 0
	};
	// Try a short local detour before waiting, without teleporting or advancing through walls.
	let safe = false;
	for (const angle of [0, 0.65, -0.65, 1.2, -1.2]) {
		const vx = velocity.x * Math.cos(angle) - velocity.z * Math.sin(angle),
			vz = velocity.x * Math.sin(angle) + velocity.z * Math.cos(angle);
		if (
			creatureSurface(
				access,
				state.position.x + vx * 0.5,
				state.position.z + vz * 0.5,
				dims.radius,
				dims.height,
				slopeLimit(state)
			) !== undefined
		) {
			velocity = { x: vx, y: 0, z: vz };
			safe = true;
			break;
		}
	}
	if (!safe) velocity = { x: 0, y: 0, z: 0 };
	state.intent.velocity = velocity;
	if (Math.hypot(velocity.x, velocity.z) > 0.001)
		state.intent.heading = Math.atan2(velocity.x, velocity.z);
	state.intent.gait = safe ? (state.state === 'FLEE' ? 'run' : 'walk') : 'idle';
}
/**
 * Fastest yaw (rad/s) that still reads as a step, not a spin.
 * Longer bodies take a wider arc. Serpents steer the head; the body has to be able to follow
 * that curve, so their radius stays about half a body length.
 */
export function maxYawRate(state: CreatureRuntimeDefinition): number {
	const dims = creatureDimensions(state.spawn.species, state.spawn.individual.sizeFactor);
	const length = Math.max(0.45, dims.radius * 2);
	const speed = Math.hypot(state.intent.velocity.x, state.intent.velocity.z);
	const serpent = state.spawn.species.bodyPlan.id === 'serpentine';
	const pace = state.intent.gait === 'run' ? 1.7 : state.intent.gait === 'walk' ? 1.05 : 0.65;
	const minRadius = serpent ? Math.max(0.35, length * 0.48) : Math.max(0.22, length * 0.2);
	const moving = speed > 0.04 ? speed / minRadius : pace * 0.55;
	const limit = Math.min(pace, Math.max(serpent ? 0.28 : 0.4, moving));
	return serpent ? Math.min(limit, 0.85) : limit;
}

/** Shortest-angle turn toward `intent.heading`, capped so a new direction is an arc. */
export function turnCreature(state: CreatureRuntimeDefinition, dt: number): void {
	if (!Number.isFinite(dt) || dt <= 0) return;
	if (!Number.isFinite(state.heading) || !Number.isFinite(state.intent.heading)) return;
	const speed = Math.hypot(state.intent.velocity.x, state.intent.velocity.z);
	// Standing still does not swivel the whole body. The head still looks via `lookTarget`.
	if (speed < 0.02) {
		state.intent.angularVelocity = 0;
		return;
	}
	const delta = Math.atan2(
		Math.sin(state.intent.heading - state.heading),
		Math.cos(state.intent.heading - state.heading)
	);
	const maxStep = maxYawRate(state) * dt;
	const eased = delta * (1 - Math.exp(-3 * dt));
	const turn = Math.max(-maxStep, Math.min(maxStep, eased));
	const next = state.heading + turn;
	state.heading = Math.atan2(Math.sin(next), Math.cos(next));
	state.intent.angularVelocity = turn / dt;
}

/** Bounded substeps prevent tunnelling through obstacles when frame time spikes. */
export function advanceCreature(
	state: CreatureRuntimeDefinition,
	dt: number,
	access: CreatureWorldAccess,
	/** Position-only when the caller turns every rendered frame itself. */
	turn = true
): void {
	if (!Number.isFinite(dt) || dt <= 0) return;
	const dims = creatureDimensions(state.spawn.species, state.spawn.individual.sizeFactor);
	const v = state.intent.velocity;
	const elapsed = Math.min(dt, 0.25),
		speed = Math.hypot(v.x, v.z);
	// Travel where the body is facing. `intent.velocity` is only the direction being steered toward,
	// so a new target becomes a curve instead of a sideways slide while the mesh yaws.
	const moveX = Math.sin(state.heading) * speed,
		moveZ = Math.cos(state.heading) * speed;
	const steps = Math.max(1, Math.ceil((speed * elapsed) / Math.max(0.1, dims.radius * 0.35)));
	for (let i = 0; i < steps; i++) {
		const x = state.position.x + (moveX * elapsed) / steps,
			z = state.position.z + (moveZ * elapsed) / steps;
		const y = creatureSurface(access, x, z, dims.radius, dims.height, slopeLimit(state));
		const radius = Math.max(state.spawn.species.behaviour.wanderRadius, dims.radius * 3);
		if (
			y === undefined ||
			(Math.hypot(x - state.spawn.groupCentre.x, z - state.spawn.groupCentre.z) > radius * 1.02 &&
				Math.hypot(x - state.spawn.groupCentre.x, z - state.spawn.groupCentre.z) >=
					distance(state.position, state.spawn.groupCentre))
		) {
			state.intent.velocity = { x: 0, y: 0, z: 0 };
			state.intent.gait = 'idle';
			break;
		}
		state.position = { x, y, z };
	}
	if (turn) turnCreature(state, elapsed);
}
