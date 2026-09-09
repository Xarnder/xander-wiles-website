import { createNamedRandom } from '../terrain/seededRandom';
import type {
	CreatureRuntimeDefinition,
	CreatureSpawnDefinition,
	CreatureWorldAccess,
	Vec3
} from './CreatureTypes';
import { creatureDimensions, creatureSurface } from './CreaturePopulationSystem';
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
				dims.height
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
/** Bounded substeps prevent tunnelling through obstacles when frame time spikes. */
export function advanceCreature(
	state: CreatureRuntimeDefinition,
	dt: number,
	access: CreatureWorldAccess
): void {
	if (!Number.isFinite(dt) || dt <= 0) return;
	const dims = creatureDimensions(state.spawn.species, state.spawn.individual.sizeFactor);
	const v = state.intent.velocity;
	const elapsed = Math.min(dt, 0.25),
		speed = Math.hypot(v.x, v.z);
	const steps = Math.max(1, Math.ceil((speed * elapsed) / Math.max(0.1, dims.radius * 0.35)));
	for (let i = 0; i < steps; i++) {
		const x = state.position.x + (v.x * elapsed) / steps,
			z = state.position.z + (v.z * elapsed) / steps;
		const y = creatureSurface(access, x, z, dims.radius, dims.height);
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
	const delta = Math.atan2(
		Math.sin(state.intent.heading - state.heading),
		Math.cos(state.intent.heading - state.heading)
	);
	const turn = delta * Math.min(1, elapsed * 6);
	state.heading += turn;
	// Derived from this physics step, not the render cadence, so lean stays stable regardless of frame rate.
	state.intent.angularVelocity = elapsed > 0 ? turn / elapsed : 0;
}
