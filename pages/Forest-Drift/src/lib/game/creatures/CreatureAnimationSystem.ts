import { Bone, Quaternion, Vector3 } from 'three';
import type { CompiledCreature } from './CreatureCompiler';
import type { CreatureIntent, CreatureLod, LimbRigDefinition } from './CreatureTypes';
import { groundingStats, type CreatureGroundingController } from './CreatureGrounding';

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
interface PoseScratch {
	a: Vector3;
	b: Vector3;
	c: Vector3;
	d: Vector3;
	e: Vector3;
	q: Quaternion;
	r: Quaternion;
	foot: Quaternion;
	up: Vector3;
}
const poses = new WeakMap<CompiledCreature, PoseScratch>();
function scratch(creature: CompiledCreature): PoseScratch {
	let result = poses.get(creature);
	if (!result) {
		result = {
			a: new Vector3(),
			b: new Vector3(),
			c: new Vector3(),
			d: new Vector3(),
			e: new Vector3(),
			q: new Quaternion(),
			r: new Quaternion(),
			foot: new Quaternion(),
			up: new Vector3()
		};
		poses.set(creature, result);
	}
	return result;
}

/**
 * Analytic two-bone IK: reach a foot target without stretching either bone. The target is
 * creature-local unless `world` is set. Distance is clamped to the reachable range, so unreachable
 * targets never produce NaNs or hyperextension. `footWorld` (optional) sets the foot's world
 * orientation; otherwise the foot stays level with the body.
 */
function placeFoot(
	creature: CompiledCreature,
	limb: LimbRigDefinition,
	target: Vector3,
	s: PoseScratch,
	world = false,
	footWorld?: Quaternion
) {
	const hip = creature.bonesById.get(limb.hipId);
	const knee = creature.bonesById.get(limb.kneeId);
	const foot = creature.bonesById.get(limb.footId);
	if (!hip || !knee || !foot || !hip.parent) return;
	groundingStats.ikSolves++;
	if (!world) creature.object.localToWorld(target);
	hip.parent.worldToLocal(target);
	target.sub(hip.position);
	const upper = knee.position.length();
	const lower = foot.position.length();
	if (upper < 1e-8 || lower < 1e-8) return;
	const distance = clamp(target.length(), Math.abs(upper - lower) + 1e-6, upper + lower - 1e-6);
	const direction = s.b.copy(target).normalize();
	if (!(direction.lengthSq() > 0.1)) direction.set(0, -1, 0);
	// Bend toward the knee side the skin was bound with; a stable plane avoids unconstrained IK flips.
	const bend = s.c;
	if (limb.bendHint) {
		// Creature space → hip-parent space (spine/root sway can rotate the parent).
		hip.parent.getWorldQuaternion(s.r).invert();
		creature.object.getWorldQuaternion(s.q);
		bend.copy(limb.bendHint).applyQuaternion(s.q).applyQuaternion(s.r);
	} else bend.set(0, 0, limb.pair === 0 ? -1 : 1);
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
	// Feet stay level with the body (or partially aligned to the ground) instead of following the shin.
	hip.updateMatrixWorld(true);
	knee.getWorldQuaternion(s.q).invert();
	foot.quaternion.copy(s.q.multiply(footWorld ?? creature.object.getWorldQuaternion(s.r)));
}

export interface AnimateOptions {
	/** Terrain conformation state for this runtime creature; enables planted feet and body tilt. */
	grounding?: CreatureGroundingController;
	/** Grounding detail: 0 full, 1 simplified, 2 body alignment only. */
	lod?: CreatureLod;
	/** Rejects foot targets (e.g. deep water). */
	standable?: (x: number, z: number) => boolean;
	/** The caller already ran `grounding.update` this frame (benchmarks time it separately). */
	skipGroundingUpdate?: boolean;
}

/** Semantic direct posing: no clips, mixers, global randomness, or persistent renderer state. */
export function animateCreature(
	creature: CompiledCreature,
	intent: CreatureIntent,
	time: number,
	delta: number,
	surface?: (x: number, z: number) => number,
	options: AnimateOptions = {}
): void {
	if (!Number.isFinite(time) || !Number.isFinite(intent.heading)) return;
	const grounding = options.grounding;
	const lod = options.lod ?? 0;
	const s = scratch(creature);
	const { skeleton, definition } = creature.compilation;
	const gait = definition.species.locomotion.gait;
	const serpentine = definition.species.bodyPlan.id === 'serpentine';
	let spineIndex = 0;
	const moving = intent.gait !== 'idle';
	const running = intent.gait === 'run';
	const frequency = running ? gait.runFrequency : gait.walkFrequency;
	const strength = moving ? 1 : 0;
	if (grounding) {
		// Body pose from the support plane; heading from intent. Gait offsets are applied on top.
		if (!options.skipGroundingUpdate)
			grounding.update(
				{
					x: creature.object.position.x,
					z: creature.object.position.z,
					heading: intent.heading,
					velocityX: intent.velocity.x,
					velocityZ: intent.velocity.z,
					gait: intent.gait,
					dt: delta,
					lod
				},
				surface ?? (() => 0),
				options.standable
			);
		creature.object.position.copy(grounding.position);
		creature.object.quaternion.copy(grounding.quaternion);
	} else {
		creature.object.rotation.y = intent.heading;
		if (surface) {
			const ground = surface(creature.object.position.x, creature.object.position.z);
			if (Number.isFinite(ground)) creature.object.position.y = ground;
		}
	}
	// Grounded gaits advance their own phase (cadence follows speed), so steps and bob agree.
	const cycle = grounding && moving ? grounding.phase * TAU : time * frequency * TAU;
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
				Math.sin(cycle) * gait.bodySway * strength - clamp(intent.angularVelocity, -2, 2) * 0.035;
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
	if (grounding) applyTerrainCompensation(creature, grounding);
	creature.object.updateMatrixWorld(true);
	if (grounding && (lod < 2 || serpentine)) {
		for (const leg of grounding.legs) {
			// Each foot solves to its own contact; the body only follows the overall support plane.
			grounding.footTarget(leg, s.a);
			let footWorld: Quaternion | undefined;
			if (lod === 0) {
				grounding.footUp(leg, s.up);
				footWorld = s.foot
					.setFromUnitVectors(s.e.copy(grounding.up), s.up)
					.multiply(creature.object.quaternion);
			}
			placeFoot(creature, leg.limb, s.a, s, true, footWorld);
		}
	}
	for (const limb of skeleton.limbs) {
		if (grounding && (lod < 2 || serpentine) && !limb.arm) continue;
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
		if (surface && !grounding) {
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

/**
 * Terrain-driven bone offsets: serpent spines follow their smoothed support curve; neck, head and
 * (for upright plans) the upper torso partly counter the body's slope pitch/roll so heads stay level.
 */
function applyTerrainCompensation(
	creature: CompiledCreature,
	grounding: CreatureGroundingController
) {
	const terrain = grounding.terrain;
	if (grounding.serpentine) {
		const ids = grounding.serpentJointIds,
			z = grounding.serpentJointZ,
			offsets = grounding.serpentOffsets;
		const limit = terrain.maxWalkSlope;
		let previous = 0;
		for (let j = 0; j < ids.length; j++) {
			const bone = creature.bonesById.get(ids[j]);
			if (!bone) continue;
			if (j === 0) bone.position.y += offsets[0];
			if (j === ids.length - 1) break;
			const slope = clamp(
				Math.atan2(offsets[j + 1] - offsets[j], Math.max(1e-5, z[j + 1] - z[j])),
				-limit,
				limit
			);
			// Absolute segment pitch accumulates down the chain: local = this pitch minus the parent's.
			bone.rotation.x += -(slope - previous);
			previous = slope;
		}
	}
	const pitch = grounding.bodyPitch,
		roll = grounding.bodyRoll;
	if (!pitch && !roll) return;
	const neck = creature.bonesById.get('neck'),
		head = creature.bonesById.get('head'),
		spine = creature.bonesById.get('spine');
	if (neck) {
		neck.rotation.x += pitch * terrain.neckSlopeCompensation;
		neck.rotation.z -= roll * terrain.neckSlopeCompensation;
	}
	if (head) {
		head.rotation.x += pitch * terrain.headSlopeCompensation;
		head.rotation.z -= roll * terrain.headSlopeCompensation;
	}
	if (spine && terrain.spineSlopeCompensation)
		spine.rotation.x += pitch * terrain.spineSlopeCompensation;
}
