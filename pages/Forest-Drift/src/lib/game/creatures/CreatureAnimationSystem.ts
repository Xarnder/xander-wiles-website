import { Bone, Quaternion, Vector3 } from 'three';
import type { CompiledCreature } from './CreatureCompiler';
import type { CreatureIntent, LimbRigDefinition } from './CreatureTypes';

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
interface PoseScratch {
	previousHeading: number;
	a: Vector3;
	b: Vector3;
	c: Vector3;
	d: Vector3;
	e: Vector3;
	q: Quaternion;
}
const poses = new WeakMap<CompiledCreature, PoseScratch>();
function scratch(creature: CompiledCreature): PoseScratch {
	let result = poses.get(creature);
	if (!result) {
		result = {
			previousHeading: creature.object.rotation.y,
			a: new Vector3(),
			b: new Vector3(),
			c: new Vector3(),
			d: new Vector3(),
			e: new Vector3(),
			q: new Quaternion()
		};
		poses.set(creature, result);
	}
	return result;
}

/** Reach a creature-local foot target without stretching either bone. Terrain is sampled in world space. */
function placeFoot(
	creature: CompiledCreature,
	limb: LimbRigDefinition,
	target: Vector3,
	s: PoseScratch
) {
	const hip = creature.bonesById.get(limb.hipId);
	const knee = creature.bonesById.get(limb.kneeId);
	const foot = creature.bonesById.get(limb.footId);
	if (!hip || !knee || !foot || !hip.parent) return;
	creature.object.localToWorld(target);
	hip.parent.worldToLocal(target);
	target.sub(hip.position);
	const upper = knee.position.length();
	const lower = foot.position.length();
	if (upper < 1e-8 || lower < 1e-8) return;
	const distance = clamp(target.length(), Math.abs(upper - lower) + 1e-6, upper + lower - 1e-6);
	const direction = s.b.copy(target).normalize();
	if (direction.lengthSq() < 0.1) direction.set(0, -1, 0);
	// A stable forward bend plane avoids the arbitrary-axis flips of unconstrained IK.
	const bend = s.c.set(0, 0, limb.pair === 0 ? -1 : 1);
	bend.addScaledVector(direction, -bend.dot(direction));
	if (bend.lengthSq() < 1e-6)
		bend.set(limb.side, 0, 0).addScaledVector(direction, -limb.side * direction.x);
	bend.normalize();
	const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
	const height = Math.sqrt(Math.max(0, upper * upper - along * along));
	const kneeDirection = s.d.copy(direction).multiplyScalar(along).addScaledVector(bend, height);
	hip.quaternion.setFromUnitVectors(s.e.copy(knee.position).normalize(), kneeDirection.normalize());
	// Both desired vectors are in the hip's parent space. Undo the upper rotation for the lower joint.
	const lowerDirection = target
		.copy(direction)
		.multiplyScalar(distance)
		.addScaledVector(kneeDirection, -upper);
	lowerDirection.applyQuaternion(s.q.copy(hip.quaternion).invert()).normalize();
	knee.quaternion.setFromUnitVectors(s.e.copy(foot.position).normalize(), lowerDirection);
}

/** Semantic direct posing: no clips, mixers, global randomness, or persistent renderer state. */
export function animateCreature(
	creature: CompiledCreature,
	intent: CreatureIntent,
	time: number,
	delta: number,
	surface?: (x: number, z: number) => number
): void {
	if (!Number.isFinite(time) || !Number.isFinite(intent.heading)) return;
	const s = scratch(creature);
	const { skeleton, definition } = creature.compilation;
	const gait = definition.species.locomotion.gait;
	const serpentine = definition.species.bodyPlan.id === 'serpentine';
	let spineIndex = 0;
	const moving = intent.gait !== 'idle';
	const running = intent.gait === 'run';
	const frequency = running ? gait.runFrequency : gait.walkFrequency;
	const cycle = time * frequency * TAU;
	const strength = moving ? 1 : 0;
	const turn = Math.atan2(
		Math.sin(intent.heading - s.previousHeading),
		Math.cos(intent.heading - s.previousHeading)
	);
	s.previousHeading = intent.heading;
	creature.object.rotation.y = intent.heading;
	if (surface) {
		const ground = surface(creature.object.position.x, creature.object.position.z);
		if (Number.isFinite(ground)) creature.object.position.y = ground;
	}
	for (const joint of skeleton.joints) {
		const bone = creature.bonesById.get(joint.id);
		if (!bone) continue;
		bone.position.copy(joint.localPosition);
		bone.quaternion.identity();
		bone.scale.set(1, 1, 1);
		if (joint.semantic === 'root') {
			bone.position.y += serpentine
				? 0
				: moving
					? -gait.bodyBob * (0.5 + 0.5 * Math.cos(cycle * 2))
					: Math.sin(time * 1.8) * gait.bodyBob * 0.12;
			bone.rotation.z =
				Math.sin(cycle) * gait.bodySway * strength -
				clamp(turn / Math.max(delta, 0.016), -2, 2) * 0.035;
		} else if (
			serpentine &&
			(joint.semantic === 'spine' ||
				joint.semantic === 'tail' ||
				joint.semantic === 'pelvis' ||
				joint.semantic === 'chest')
		) {
			// Curvature travels down the connected chain; local rotations deform the continuous skin.
			bone.rotation.y =
				Math.sin((moving ? cycle : time * 0.7) - spineIndex++ * 0.65) * (moving ? 0.14 : 0.025);
		} else if (joint.semantic === 'head' || joint.semantic === 'neck') {
			bone.rotation.x = Math.sin(moving ? cycle : time * 1.3) * gait.headBob * (moving ? 1 : 0.25);
		} else if (joint.semantic === 'tail') {
			bone.rotation.y =
				Math.sin((moving ? cycle : time * 1.1) - skeleton.joints.indexOf(joint) * 0.35) *
				gait.tailSway;
		}
	}
	if (intent.lookTarget) {
		s.a.copy(intent.lookTarget).sub(creature.object.position);
		const yaw = Math.atan2(s.a.x, s.a.z) - intent.heading;
		for (const joint of skeleton.joints)
			if (joint.semantic === 'head' || joint.semantic === 'neck') {
				const bone = creature.bonesById.get(joint.id) as Bone;
				bone.rotation.y += clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -0.85, 0.85) * 0.5;
				bone.rotation.x -=
					clamp(Math.atan2(s.a.y - skeleton.groundOffset, Math.hypot(s.a.x, s.a.z)), -0.6, 0.6) *
					0.5;
			}
	}
	creature.object.updateMatrixWorld(true);
	for (const limb of skeleton.limbs) {
		if (limb.arm) {
			const hip = creature.bonesById.get(limb.hipId);
			const knee = creature.bonesById.get(limb.kneeId);
			// Arms counter-swing against the same-side leg, with a soft elbow curl.
			const armPhase = cycle + (limb.side === -1 ? 0 : Math.PI);
			if (hip) hip.rotation.x = -Math.cos(armPhase) * (running ? 0.65 : 0.35) * strength;
			if (knee) knee.rotation.x = -0.12 - (running ? 0.28 : 0.1) * strength;
			continue;
		}
		const phase = cycle + limb.phase * TAU;
		const reach = (limb.upperLength + limb.lowerLength) * 0.24;
		const stride = Math.min(gait.strideLength * (running ? 1.4 : 1), reach);
		const lift = Math.min(gait.strideLift * (running ? 1.3 : 1), reach);
		s.a.copy(limb.restFoot);
		s.a.z += Math.cos(phase) * stride * strength;
		const raised = Math.pow(Math.max(0, Math.sin(phase)), 2) * lift * strength;
		if (surface) {
			creature.object.localToWorld(s.a);
			const ground = surface(s.a.x, s.a.z);
			if (Number.isFinite(ground)) s.a.y = ground + limb.restFoot.y * creature.object.scale.y;
			creature.object.worldToLocal(s.a);
		}
		s.a.y += raised;
		placeFoot(creature, limb, s.a, s);
	}
	creature.object.updateMatrixWorld(true);
	creature.skeleton.update();
}
