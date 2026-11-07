import type { PlayerInteractionPose } from '../player/PlayerInteractionPoseResolver';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CharacterAnimationState } from './CharacterAnimationState';
import { TwoBoneIK } from './twoBoneIK';
import manifest from './assets/character.manifest.json';
import { POSE_FLAGS } from '../net/protocol';
import type { MotionFrame } from '../net/RemoteMotion';
import type { RideSeatKind } from '../creatures/creatureRiding';

export type CharacterSurface = (x: number, z: number, referenceY: number) => number;
interface RestBone {
	bone: THREE.Bone;
	position: THREE.Vector3;
	rotation: THREE.Quaternion;
}
interface Leg {
	hip: THREE.Bone;
	knee: THREE.Bone;
	foot: THREE.Bone;
	ankle: THREE.Vector3;
	rotation: THREE.Quaternion;
	target: THREE.Vector3;
	start: THREE.Vector3;
	end: THREE.Vector3;
	swing: boolean;
	initialized: boolean;
	surfaceY: number | null;
	plantedYaw: number;
	normal: THREE.Vector3;
}
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const TAU = Math.PI * 2;
/** How far a carried creature's head turns out from straight ahead, radians. */
const CARRY_OUTWARD = 0.08;
/** The ribs' half-width as a fraction of half the shoulder span: the creature presses against them. */
const CARRY_RIBS = 0.78;
/** How far below the shoulder joint the creature's back sits (under the armpit), metres. */
const CARRY_ARMPIT = 0.1;
/** How far forward of the shoulders the creature's body centre sits, metres. */
const CARRY_FORWARD = 0.05;
/** Gap between the creature's far side and the palm, metres (the hand's own thickness). */
const CARRY_HAND_CLEARANCE = 0.035;
/** Small creatures sit lower, until the arm is this much of its full reach (not folded up). */
const CARRY_COMFORT = 0.8;
/** …but never more than this much lower than just under the armpit, metres. */
const CARRY_MAX_EXTRA_DROP = 0.18;
/** Hand under the far flank: this far down from the middle, as a fraction of the half-height. */
const CARRY_HAND_BELOW = 0.35;

/** How far each thigh turns out round a small mount's neck, radians. */
const RIDE_STRADDLE_SPREAD = 0.5;

/** How the rider sits (see `CharacterInstance.poseRide`). */
export interface CharacterRidePose {
	kind: RideSeatKind;
	/** Pelvis height above the support point (the seated-pose maths seats use). */
	pelvisSupportOffset: number;
	/** World-space hand holds; null rests that hand on the thigh. */
	hands: { left: THREE.Vector3 | null; right: THREE.Vector3 | null };
	/** 0 standing … 1 fully seated (climbing on and off). */
	blend: number;
}

/** Where a carried body sits and the hand goes, from the carrying shoulder (see `carryHold`). */
export interface CarryHold {
	/** How far the body's centre is below the shoulder joint. */
	drop: number;
	/** The hand target: out from the shoulder (away from the body), up, and forward. */
	handOut: number;
	handUp: number;
	handForward: number;
}

/**
 * Where a creature's body sits under the arm and where the hand goes, measured from the shoulder
 * joint in the carrying side's axes. The body's back sits just under the armpit (small ones a
 * little lower, so the arm hangs rather than folds), and the hand reaches over and down the far
 * side to just under its middle — or as far down that side as the arm reaches, for wide ones.
 * `centreOut`: the body centre's distance out from the shoulder; `half`: the body's half-size
 * (across, up, along); `reach`: upper arm + forearm. Writes `out`; allocation-free.
 */
export function carryHold(
	centreOut: number,
	forward: number,
	half: { x: number; y: number; z: number },
	reach: number,
	out: CarryHold
): CarryHold {
	const across = half.x + CARRY_HAND_CLEARANCE;
	const upDown = half.y + CARRY_HAND_CLEARANCE;
	const handForward = forward + Math.min(half.z * 0.3, 0.08);
	const lowest = -CARRY_HAND_BELOW;
	const farOut = centreOut + across * Math.sqrt(1 - lowest * lowest);
	const comfortable = reach * CARRY_COMFORT;
	const spare = comfortable * comfortable - farOut * farOut - handForward * handForward;
	const handDrop = spare > 0 ? Math.sqrt(spare) : 0;
	const armpit = CARRY_ARMPIT + half.y;
	out.drop = Math.min(armpit + CARRY_MAX_EXTRA_DROP, Math.max(armpit, handDrop + upDown * lowest));
	out.handForward = handForward;
	const limit = reach * 0.97;
	// Up the far side from under the middle toward the top, until the hand can reach.
	for (let step = 0; step <= 8; step++) {
		const sin = lowest + (1 - lowest) * (step / 8);
		out.handOut = centreOut + across * Math.sqrt(Math.max(0, 1 - sin * sin));
		out.handUp = -out.drop + upDown * sin;
		const distanceSq = out.handOut ** 2 + out.handUp ** 2 + handForward ** 2;
		if (distanceSq <= limit * limit) break;
	}
	return out;
}

/** Cosmetic animation only. Network root and player collisions are never modified by IK. */
export class CharacterInstance {
	readonly object: THREE.Object3D;
	private readonly rest: RestBone[] = [];
	private readonly bones = new Map<string, THREE.Bone>();
	private readonly legs: Leg[];
	private readonly materials: THREE.MeshStandardMaterial[] = [];
	private readonly meshes: THREE.SkinnedMesh[] = [];
	private readonly solver = new TwoBoneIK();
	private readonly previous = new THREE.Vector3();
	private readonly movement = new THREE.Vector3();
	private readonly localMovement = new THREE.Vector3();
	private readonly point = new THREE.Vector3();
	private readonly pole = new THREE.Vector3();
	private readonly rotation = new THREE.Quaternion();
	private readonly rootRotation = new THREE.Quaternion();
	private readonly footRotation = new THREE.Quaternion();
	private phase = 0;
	private runJumpSpeed = 0;
	private wasGrounded = true;
	private time = 0;
	private blend = 0;
	private initialized = false;
	private lastDiscontinuity = 0;
	private probeTime = 0;
	readonly animation = new CharacterAnimationState();
	private readonly aimRotation = new THREE.Quaternion();
	private readonly aimParent = new THREE.Quaternion();
	private readonly aimAxis = new THREE.Vector3();
	private readonly armTarget = new THREE.Vector3();
	private readonly armCurrent = new THREE.Vector3();
	private disposed = false;
	/**
	 * Holding a creature under the left arm (ranged weapons). Set by the owner each frame; the pose
	 * blends in and out, and `carryAnchor` says where the creature sits.
	 */
	carrying = false;
	/**
	 * Half the size of the carried creature's body, metres (across, up, along), from
	 * `HeldCreatureView.bodyHalfSize`. Set by the owner; the creature keeps its real size, so where
	 * it sits and how far the arm reaches round it depend on this.
	 */
	readonly carryBody = new THREE.Vector3(0.1, 0.08, 0.2);
	private carry = 0;
	private readonly carryMatrix = new THREE.Matrix4();
	private carryValid = false;
	private readonly carryLeft = new THREE.Vector3();
	private readonly carryForward = new THREE.Vector3();
	private readonly carryShoulder = new THREE.Vector3();
	private readonly carryOther = new THREE.Vector3();
	private readonly carryPoint = new THREE.Vector3();
	private readonly hold: CarryHold = { drop: 0, handOut: 0, handUp: 0, handForward: 0 };
	/** Upper arm + forearm, measured from the rig once. */
	private armReach = 0;

	constructor(
		template: THREE.Object3D,
		colour: string,
		registerMaterial: (m: THREE.Material) => void
	) {
		this.object = clone(template);
		this.object.name = 'character-model';
		this.object.userData.animationState = this.animation;
		this.object.traverse((object) => {
			if (object instanceof THREE.Bone) {
				this.bones.set(object.name, object);
				this.rest.push({
					bone: object,
					position: object.position.clone(),
					rotation: object.quaternion.clone()
				});
			}
			if (object instanceof THREE.SkinnedMesh) {
				// GLTF splits primitives. Each instance owns its tint materials and its cloned skeletons.
				object.material = (object.material as THREE.MeshStandardMaterial).clone();
				const material = object.material as THREE.MeshStandardMaterial;
				this.materials.push(material);
				registerMaterial(material);
				object.castShadow = object.receiveShadow = true;
				// Bounds are assigned below in each mesh's bind-space coordinates.
				object.frustumCulled = true;
				this.meshes.push(object);
			}
		});
		this.object.updateMatrixWorld(true);
		// A fixed envelope around the normalized 1.8 m character includes arm swings, foot IK,
		// breathing and airborne poses. Convert to mesh space once: no per-frame vertex scans,
		// and off-screen meshes can be rejected in the camera, AO and each shadow cascade.
		for (const mesh of this.meshes) {
			const modelToMesh = new THREE.Matrix4()
				.copy(mesh.matrixWorld)
				.invert()
				.multiply(this.object.matrixWorld);
			mesh.boundingSphere = new THREE.Sphere(
				new THREE.Vector3(0, manifest.height / 2, 0),
				1.6
			).applyMatrix4(modelToMesh);
		}
		this.legs = ['Left', 'Right'].map((side) => {
			const foot = this.bone(`${side}Foot`);
			const ankle = this.object.worldToLocal(foot.getWorldPosition(new THREE.Vector3()));
			return {
				hip: this.bone(`${side}UpLeg`),
				knee: this.bone(`${side}Leg`),
				foot,
				ankle,
				rotation: foot.getWorldQuaternion(new THREE.Quaternion()),
				target: new THREE.Vector3(),
				start: new THREE.Vector3(),
				end: new THREE.Vector3(),
				swing: false,
				initialized: false,
				surfaceY: null,
				plantedYaw: 0,
				normal: new THREE.Vector3(0, 1, 0)
			};
		});
		this.setColour(colour);
	}
	/**
	 * World transform for the centre of a creature's body held under the left arm: pressed against
	 * the ribs just below the armpit, facing the way the body faces (+Z of the result is forward,
	 * +Y up). False until the pose has run once.
	 */
	carryAnchor(out: THREE.Matrix4): boolean {
		if (!this.carryValid) return false;
		out.copy(this.carryMatrix);
		return true;
	}

	/**
	 * Body axes from the bones, so the rig's own axis conventions never matter. The upper arm lies
	 * over the creature's back and the forearm wraps down its far side, the hand under its flank.
	 */
	private updateCarry(): void {
		const leftArm = this.bone('LeftArm'),
			elbow = this.bone('LeftForeArm'),
			hand = this.bone('LeftHand');
		if (this.armReach === 0) {
			leftArm.getWorldPosition(this.carryShoulder);
			elbow.getWorldPosition(this.carryOther);
			hand.getWorldPosition(this.carryPoint);
			this.armReach =
				this.carryShoulder.distanceTo(this.carryOther) +
				this.carryOther.distanceTo(this.carryPoint);
		}
		leftArm.getWorldPosition(this.carryShoulder);
		this.bone('RightArm').getWorldPosition(this.carryOther);
		this.carryLeft.subVectors(this.carryShoulder, this.carryOther).setY(0);
		const shoulderSpan = this.carryLeft.length();
		if (shoulderSpan < 1e-4) return;
		this.carryLeft.divideScalar(shoulderSpan);
		// left × up = forward
		this.carryForward.crossVectors(this.carryLeft, UP).normalize();
		// Pressed against the ribs: in from the shoulder joint, then out by half the creature's width.
		const centreOut = (shoulderSpan / 2) * (CARRY_RIBS - 1) + this.carryBody.x;
		const hold = carryHold(centreOut, CARRY_FORWARD, this.carryBody, this.armReach, this.hold);
		this.carryPoint
			.copy(this.carryShoulder)
			.addScaledVector(this.carryLeft, centreOut)
			.addScaledVector(this.carryForward, CARRY_FORWARD);
		this.carryPoint.y = this.carryShoulder.y - hold.drop;
		// Head turned out just a touch, so it reads from the usual camera behind the player.
		this.armCurrent
			.copy(this.carryForward)
			.multiplyScalar(Math.cos(CARRY_OUTWARD))
			.addScaledVector(this.carryLeft, Math.sin(CARRY_OUTWARD));
		this.armTarget.crossVectors(UP, this.armCurrent).normalize();
		this.carryMatrix.makeBasis(this.armTarget, UP, this.armCurrent);
		this.carryMatrix.setPosition(this.carryPoint);
		this.carryValid = true;
		if (this.carry < 0.001) return;
		this.armTarget
			.copy(this.carryShoulder)
			.addScaledVector(this.carryLeft, hold.handOut)
			.addScaledVector(UP, hold.handUp)
			.addScaledVector(this.carryForward, hold.handForward);
		hand.getWorldPosition(this.armCurrent);
		this.armTarget.lerpVectors(this.armCurrent, this.armTarget, this.carry);
		// Elbow up and out, so the arm arches over the creature's back rather than through it.
		this.pole.copy(this.carryLeft).addScaledVector(UP, 0.9);
		this.solver.solve(leftArm, elbow, hand, this.armTarget, this.pole);
	}

	private bone(name: string): THREE.Bone {
		const bone = this.bones.get(`mixamorig${name}`);
		if (!bone) throw new Error(`Character rig missing ${name}`);
		return bone;
	}
	setColour(colour: string): void {
		for (const material of this.materials)
			if (material.name === 'Clothing') material.color.set(colour);
	}
	update(frame: MotionFrame, dt: number, distance: number, surface?: CharacterSurface): void {
		if (this.disposed) return;
		const rawDt = dt;
		dt = Math.max(0, Math.min(dt, 0.05));
		this.time += dt;
		this.probeTime += dt;
		const previousBodyYaw = this.animation.bodyYaw;
		this.point.set(frame.x, frame.y, frame.z);
		this.movement.subVectors(this.point, this.previous);
		const reset =
			!this.initialized ||
			rawDt > 0.25 ||
			this.movement.length() > 2 ||
			(frame.discontinuity ?? 0) !== this.lastDiscontinuity;
		if (reset) {
			this.movement.set(0, 0, 0);
			for (const leg of this.legs) {
				leg.initialized = false;
				leg.surfaceY = null;
				leg.normal.set(0, 1, 0);
			}
		}
		const horizontalSpeed = dt > 0 ? Math.hypot(this.movement.x, this.movement.z) / dt : 0;
		this.animation.update(
			frame,
			dt,
			reset,
			this.movement.y,
			horizontalSpeed,
			horizontalSpeed > 0.2 ? Math.atan2(-this.movement.x, -this.movement.z) : undefined
		);
		const yawDelta = Math.atan2(
			Math.sin(this.animation.bodyYaw - previousBodyYaw),
			Math.cos(this.animation.bodyYaw - previousBodyYaw)
		);
		// The parent may face the camera yaw; this mesh independently follows the body heading.
		if (this.object.parent) this.object.parent.getWorldQuaternion(this.aimParent);
		else this.aimParent.identity();
		this.aimAxis.set(0, 0, -1).applyQuaternion(this.aimParent);
		const parentYaw = Math.atan2(-this.aimAxis.x, -this.aimAxis.z);
		this.object.rotation.y = this.animation.bodyYaw - parentYaw;
		this.previous.copy(this.point);
		this.lastDiscontinuity = frame.discontinuity ?? 0;
		this.initialized = true;
		const flying = !!(frame.flags & POSE_FLAGS.flying);
		const grounded = !!(frame.flags & POSE_FLAGS.grounded) && !flying;
		const inactive = frame.stale || !!(frame.flags & POSE_FLAGS.away);
		const travelled = inactive ? 0 : Math.hypot(this.movement.x, this.movement.z);
		const speed = dt > 0 ? travelled / dt : 0;
		// Running flags are ground-only on the network. Retain the take-off cadence locally
		// so both local and remote running jumps continue their stride without protocol changes.
		if (reset || flying || inactive) this.runJumpSpeed = 0;
		if (grounded) this.runJumpSpeed = frame.flags & POSE_FLAGS.running ? speed : 0;
		const runningJump = !grounded && !flying && !inactive && this.runJumpSpeed > 0.08;
		const running = !!(frame.flags & POSE_FLAGS.running) || runningJump;
		const moving = (grounded && speed > 0.08) || runningJump;
		const gaitSpeed = runningJump ? this.runJumpSpeed : speed;
		if (grounded && !this.wasGrounded) {
			for (const leg of this.legs) {
				leg.initialized = false;
				leg.surfaceY = null;
			}
		}
		this.wasGrounded = grounded;
		this.blend +=
			((moving ? Math.min(1, gaitSpeed / 1.2) : 0) - this.blend) * (1 - Math.exp(-dt / 0.1));
		const stride = running ? 2.4 : 1.6;
		if (grounded || runningJump)
			this.phase = (this.phase + ((runningJump ? gaitSpeed * dt : travelled) / stride) * TAU) % TAU;

		for (const rest of this.rest) {
			rest.bone.position.copy(rest.position);
			rest.bone.quaternion.copy(rest.rotation);
		}
		// Only the root transform is needed here; descendants update after posing below.
		this.object.updateWorldMatrix(true, false);
		this.object.getWorldQuaternion(this.rootRotation);
		this.localMovement
			.copy(this.movement)
			.applyQuaternion(this.rotation.copy(this.rootRotation).invert());
		this.localMovement.y = 0;
		if (this.localMovement.lengthSq() > 1e-10) this.localMovement.normalize();
		else this.localMovement.set(0, 0, -1);
		// The V2 armature is Z-up locally. Convert world displacement through its parent
		// instead of assuming a bone's local Y axis is vertical (including imported scale).
		const hips = this.bone('Hips');
		hips.getWorldPosition(this.point);
		this.point.y += Math.sin(this.time * 1.8) * 0.004 - this.animation.compression;
		hips.position.copy(hips.parent!.worldToLocal(this.point));
		this.object.updateWorldMatrix(true, true);
		const swing = Math.sin(this.phase) * this.blend * 0.65 * (this.animation.backpedaling ? -1 : 1);
		this.aimAxis.copy(X).applyQuaternion(this.rootRotation);
		this.carry += ((this.carrying ? 1 : 0) - this.carry) * (1 - Math.exp(-dt * 10));
		this.offsetWorld('LeftArm', this.aimAxis, (swing + (flying ? -0.25 : 0)) * (1 - this.carry));
		this.offsetWorld(
			'RightArm',
			this.aimAxis,
			-swing * (1 - this.animation.reach) + (flying ? -0.25 : 0)
		);
		// Keep the elbows and hands clear of the jacket throughout the stride, in body axes.
		// The building arm blends back to its dedicated reach pose; seated poses are separate.
		const armSpread = 0.24 + this.blend * (running ? 0.08 : 0.04);
		this.aimAxis.set(0, 0, 1).applyQuaternion(this.rootRotation);
		this.offsetWorld('LeftArm', this.aimAxis, -armSpread);
		this.offsetWorld('RightArm', this.aimAxis, armSpread * (1 - this.animation.reach));
		// Rotate in body/world axes rather than assuming the imported bones use Three's axes.
		this.aimAxis.copy(X).applyQuaternion(this.rootRotation);
		this.offsetWorld('Spine2', this.aimAxis, -this.animation.compression * 0.7);
		this.offsetWorld('Spine2', UP, this.animation.torsoYaw);
		this.offsetWorld('Neck', UP, this.animation.headYaw * 0.25);
		this.offsetWorld('Head', UP, this.animation.headYaw * 0.75);
		this.aimAxis.copy(X).applyAxisAngle(UP, frame.yaw);
		this.offsetWorld('Neck', this.aimAxis, this.animation.pitch * 0.25);
		this.offsetWorld('Head', this.aimAxis, this.animation.pitch * 0.75);
		if (this.animation.reach > 0.001) {
			const arm = this.bone('RightArm'),
				elbow = this.bone('RightForeArm'),
				hand = this.bone('RightHand');
			arm.getWorldPosition(this.armTarget);
			this.aimAxis
				.set(0, 0, -1)
				.applyAxisAngle(X, this.animation.pitch)
				.applyAxisAngle(UP, frame.yaw);
			this.armTarget.addScaledVector(this.aimAxis, 0.48);
			this.armTarget.y -= 0.08;
			hand.getWorldPosition(this.armCurrent);
			this.armTarget.lerpVectors(this.armCurrent, this.armTarget, this.animation.reach);
			this.pole.set(1, -0.7, 0).applyQuaternion(this.rootRotation);
			this.solver.solve(arm, elbow, hand, this.armTarget, this.pole);
		}
		this.updateCarry();
		const probe = this.probeTime >= (distance < 15 ? 1 / 30 : 1 / 15);
		if (probe) this.probeTime = 0;
		this.pole.set(0, 0, -1).applyQuaternion(this.rootRotation);
		for (let i = 0; i < 2; i++) {
			const leg = this.legs[i];
			const cycle = (this.phase / TAU + i * 0.5) % 1;
			const stance = running ? 0.5 : 0.6;
			const swinging = moving && cycle >= stance;
			this.point.copy(leg.ankle);
			if ((distance > 40 && grounded) || runningJump) {
				this.point.addScaledVector(this.localMovement, Math.cos(cycle * TAU) * 0.24 * this.blend);
				this.point.y += Math.max(0, Math.sin(cycle * TAU)) * 0.12 * this.blend;
			}
			if (!grounded) this.point.z += flying ? 0.12 : 0.08;
			this.object.localToWorld(this.point);
			const plantedTurn = Math.atan2(
				Math.sin(this.animation.bodyYaw - leg.plantedYaw),
				Math.cos(this.animation.bodyYaw - leg.plantedYaw)
			);
			if (
				!leg.initialized ||
				!grounded ||
				Math.abs(yawDelta) > 0.12 ||
				Math.abs(plantedTurn) > 0.3 ||
				distance > 40
			) {
				leg.plantedYaw = this.animation.bodyYaw;
				leg.target.copy(this.point);
				leg.start.copy(this.point);
				leg.end.copy(this.point);
				leg.swing = false;
				leg.initialized = true;
			}
			if (grounded && distance <= 40) {
				if (swinging) {
					if (!leg.swing) {
						leg.start.copy(leg.target);
						leg.plantedYaw = this.animation.bodyYaw;
					}
					leg.end
						.copy(leg.ankle)
						.addScaledVector(this.localMovement, Math.min(0.36, stride * 0.16) * this.blend);
					this.object.localToWorld(leg.end);
					if (probe || !leg.swing || reset) this.support(leg.end, frame.y, leg, surface);
					else if (leg.surfaceY !== null) leg.end.y = leg.surfaceY + leg.ankle.y;
					const u = (cycle - stance) / (1 - stance);
					const ease = u * u * (3 - 2 * u);
					leg.target.lerpVectors(leg.start, leg.end, ease);
					leg.target.y += Math.sin(Math.PI * u) * (running ? 0.2 : 0.13);
				} else {
					if (leg.swing) leg.target.copy(leg.end);
					if (reset || leg.target.distanceTo(this.point) > 0.5) leg.target.copy(this.point);
					if (probe || reset) this.support(leg.target, frame.y, leg, surface);
				}
				leg.swing = swinging;
			}
			this.solver.solve(leg.hip, leg.knee, leg.foot, leg.target, this.pole);
			// Retain the calibrated ankle orientation after IK, including model/root facing.
			this.footRotation
				.setFromUnitVectors(UP, grounded ? leg.normal : UP)
				.multiply(this.rootRotation)
				.multiply(leg.rotation);
			leg.foot.parent!.getWorldQuaternion(this.rotation).invert();
			leg.foot.quaternion.copy(this.rotation.multiply(this.footRotation));
		}
		for (const mesh of this.meshes) mesh.castShadow = distance < 40;
		this.object.updateWorldMatrix(false, true);
		this.object.userData.animation = grounded
			? moving
				? 'moving'
				: 'idle'
			: flying
				? 'flight'
				: 'airborne';
	}
	/** Pose the same calibrated skeleton used for walking; no furniture-specific bones. */
	poseInteraction(pose: PlayerInteractionPose, blend = 1): void {
		for (const rest of this.rest) {
			rest.bone.position.copy(rest.position);
			rest.bone.quaternion.copy(rest.rotation);
		}
		this.object.rotation.set(0, 0, 0);
		this.object.position.set(0, 0, 0);
		this.object.updateWorldMatrix(true, true);
		if (pose.action === 'sit') {
			this.aimAxis.copy(X);
			if (this.object.parent)
				this.aimAxis.applyQuaternion(this.object.parent.getWorldQuaternion(this.rotation));
			for (const side of ['Left', 'Right']) {
				this.offsetWorld(`${side}UpLeg`, this.aimAxis, (Math.PI / 2) * blend);
				this.offsetWorld(`${side}Leg`, this.aimAxis, (-Math.PI / 2) * blend);
			}
			// Solve in body space so both hands rest on the thighs for any seat heading.
			this.object.getWorldQuaternion(this.rootRotation);
			const hips = this.bone('Hips').getWorldPosition(this.point);
			for (const [side, sign] of [
				['Left', -1],
				['Right', 1]
			] as const) {
				this.armTarget
					.set(sign * 0.13, 0.08, -0.23)
					.applyQuaternion(this.rootRotation)
					.add(hips);
				const arm = this.bone(`${side}Arm`),
					elbow = this.bone(`${side}ForeArm`),
					hand = this.bone(`${side}Hand`);
				hand.getWorldPosition(this.armCurrent);
				this.armTarget.lerpVectors(this.armCurrent, this.armTarget, blend);
				this.pole.set(sign, -0.3, 0).applyQuaternion(this.rootRotation);
				this.solver.solve(arm, elbow, hand, this.armTarget, this.pole);
			}
		}
		this.object.rotation.x = pose.bodyTilt * blend;
		this.object.rotation.y = pose.bodyYawOffset * blend;
		this.object.updateWorldMatrix(true, true);
		const hips = this.bone('Hips').getWorldPosition(this.point);
		if (this.object.parent) this.object.parent.worldToLocal(hips);
		this.object.position.set(-hips.x, pose.pelvisSupportOffset - hips.y, -hips.z);
		this.object.updateWorldMatrix(true, true);
		this.object.userData.animation = pose.action;
	}

	/**
	 * Seated on a creature (riding, docs/2026/11-07/bipedal-speed-creature §4.7): astride its neck
	 * with the knees spread round it, or side-saddle on a shoulder with the legs hanging forward.
	 * Hands reach for `pose.hands` (world space) or rest on the thighs; while `carrying`, the left
	 * arm holds the carried creature instead (Q12 C). The parent sits at the pelvis support point.
	 */
	poseRide(pose: CharacterRidePose, dt: number): void {
		if (this.disposed) return;
		const blend = Math.max(0, Math.min(1, pose.blend));
		this.carry += ((this.carrying ? 1 : 0) - this.carry) * (1 - Math.exp(-Math.max(0, dt) * 10));
		for (const rest of this.rest) {
			rest.bone.position.copy(rest.position);
			rest.bone.quaternion.copy(rest.rotation);
		}
		this.object.rotation.set(0, 0, 0);
		this.object.position.set(0, 0, 0);
		this.object.updateWorldMatrix(true, true);
		const straddle = pose.kind === 'neck';
		this.aimAxis.copy(X);
		if (this.object.parent)
			this.aimAxis.applyQuaternion(this.object.parent.getWorldQuaternion(this.rotation));
		for (const [side, sign] of [
			['Left', 1],
			['Right', -1]
		] as const) {
			this.offsetWorld(`${side}UpLeg`, this.aimAxis, (straddle ? 1.3 : Math.PI / 2) * blend);
			// Astride: thighs open round the neck (left thigh turns toward the body's left).
			if (straddle) this.offsetWorld(`${side}UpLeg`, UP, sign * RIDE_STRADDLE_SPREAD * blend);
			this.offsetWorld(`${side}Leg`, this.aimAxis, -(straddle ? 1.65 : 1.45) * blend);
		}
		// Sit the hips on the support point, then reach for world-space holds.
		this.object.updateWorldMatrix(true, true);
		const hips = this.bone('Hips').getWorldPosition(this.point);
		if (this.object.parent) this.object.parent.worldToLocal(hips);
		this.object.position.set(-hips.x, pose.pelvisSupportOffset - hips.y, -hips.z);
		this.object.updateWorldMatrix(true, true);
		this.object.getWorldQuaternion(this.rootRotation);
		const hipsWorld = this.bone('Hips').getWorldPosition(this.point);
		for (const [side, sign] of [
			['Left', -1],
			['Right', 1]
		] as const) {
			if (side === 'Left' && this.carry > 0.001) continue;
			const hold = side === 'Left' ? pose.hands.left : pose.hands.right;
			if (hold) this.armTarget.copy(hold);
			else
				this.armTarget
					.set(sign * 0.13, 0.08, -0.23)
					.applyQuaternion(this.rootRotation)
					.add(hipsWorld);
			const arm = this.bone(`${side}Arm`),
				elbow = this.bone(`${side}ForeArm`),
				hand = this.bone(`${side}Hand`);
			hand.getWorldPosition(this.armCurrent);
			this.armTarget.lerpVectors(this.armCurrent, this.armTarget, blend);
			this.pole.set(sign, -0.3, 0).applyQuaternion(this.rootRotation);
			this.solver.solve(arm, elbow, hand, this.armTarget, this.pole);
		}
		this.updateCarry();
		this.object.updateWorldMatrix(true, true);
		this.object.userData.animation = 'ride';
	}

	private support(
		target: THREE.Vector3,
		feetY: number,
		leg: Leg,
		surface?: CharacterSurface
	): void {
		if (!surface) return;
		const y = surface(target.x, target.z, feetY);
		// Never pull a leg onto an upstairs floor or distant terrain.
		if (!Number.isFinite(y) || y < feetY - 0.35 || y > feetY + 0.32) {
			leg.surfaceY = null;
			leg.normal.set(0, 1, 0);
			return;
		}
		leg.surfaceY = y;
		target.y = y + leg.ankle.y;
		// Small, bounded probes. Reject discontinuities at tread/platform edges rather than tilting
		// the ankle across two floors. No scene-wide raycast or per-frame skinned-mesh query.
		const dx = surface(target.x + 0.08, target.z, feetY) - y;
		const dz = surface(target.x, target.z + 0.08, feetY) - y;
		if (Number.isFinite(dx) && Number.isFinite(dz) && Math.abs(dx) < 0.04 && Math.abs(dz) < 0.04)
			leg.normal.set(-dx / 0.08, 1, -dz / 0.08).normalize();
		else leg.normal.set(0, 1, 0);
	}
	private offsetWorld(name: string, axis: THREE.Vector3, radians: number): void {
		const bone = this.bone(name);
		bone.getWorldQuaternion(this.aimRotation);
		this.rotation.setFromAxisAngle(axis, radians).multiply(this.aimRotation);
		bone.parent!.getWorldQuaternion(this.aimParent).invert();
		bone.quaternion.copy(this.aimParent.multiply(this.rotation));
		bone.updateWorldMatrix(false, true);
	}
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.object.removeFromParent();
		for (const skeleton of new Set(this.meshes.map((mesh) => mesh.skeleton))) skeleton.dispose();
		for (const material of this.materials) material.dispose();
	}
}
