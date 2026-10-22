import type { PlayerInteractionPose } from '../player/PlayerInteractionPoseResolver';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CharacterAnimationState } from './CharacterAnimationState';
import { TwoBoneIK } from './twoBoneIK';
import manifest from './assets/character.manifest.json';
import { POSE_FLAGS } from '../net/protocol';
import type { MotionFrame } from '../net/RemoteMotion';

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
		this.offsetWorld('LeftArm', this.aimAxis, swing + (flying ? -0.25 : 0));
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
