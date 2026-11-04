import * as THREE from 'three';
import { compileCreature, type CompiledCreature } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import type { CreatureDefinition } from './CreatureTypes';

/** How the carried creature is shown this frame. */
export type HeldCreatureMode =
	| { kind: 'hidden' }
	/** Lower-left of the first-person view (ranged weapons Q22). */
	| { kind: 'first-person'; camera: THREE.Camera }
	/** Under the character's left arm: `anchor` is the world transform from CharacterInstance. */
	| { kind: 'third-person'; anchor: THREE.Matrix4 };

/** Longest body dimension in first person, metres (scaled down so it never fills the view). */
const VIEW_LENGTH = 0.42;
/** Longest body dimension under the arm, metres. */
const ARM_LENGTH = 0.75;
/** Distance in front of the camera, metres. */
const VIEW_DEPTH = 0.62;
/**
 * Where the creature's centre sits, as a fraction of the visible half-width/half-height at that
 * depth (lower left), so phones in portrait see it as well as wide screens.
 */
const VIEW_FRACTION_X = -0.5;
const VIEW_FRACTION_Y = -0.62;
/** Turned in toward the crosshair, and tipped so its back faces the viewer a little. */
const VIEW_YAW = Math.PI - 0.5;
const VIEW_PITCH = 0.12;
const RECOIL_MS = 80;

const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchVec = new THREE.Vector3();

/**
 * The creature a player is carrying, drawn in front of the camera (first person) or under the arm
 * (third person). It is its own compiled copy: the herd's copy is unloaded while it's carried.
 * Visual only; the projectile's origin comes from `muzzleWorld`.
 */
export class HeldCreatureView {
	private readonly holder = new THREE.Group();
	private readonly inner = new THREE.Group();
	private creature: CompiledCreature | null = null;
	private definition: CreatureDefinition | null = null;
	/** Muzzle tip in the compiled creature's model space. */
	private readonly muzzleModel = new THREE.Vector3();
	private time = 0;
	private recoilUntil = 0;
	private recoilStart = 0;

	constructor(
		/** Where the creature is added: the scene, or a group in it. */
		private readonly scene: THREE.Object3D,
		private readonly registerMaterial: (m: THREE.Material) => void
	) {
		this.holder.name = 'held-creature';
		this.holder.add(this.inner);
		this.holder.visible = false;
		this.scene.add(this.holder);
	}

	get attached(): CreatureDefinition | null {
		return this.definition;
	}

	attach(definition: CreatureDefinition): void {
		this.detach();
		const compiled = compileCreature(definition, 1);
		for (const mesh of compiled.skinnedMeshes) {
			for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
				this.registerMaterial(m);
			mesh.castShadow = false;
			mesh.receiveShadow = true;
			// The holder moves every frame and sits close to the camera.
			mesh.frustumCulled = false;
		}
		const { bounds, skeleton } = compiled.compilation;
		const length = Math.max(
			bounds.max.x - bounds.min.x,
			bounds.max.y - bounds.min.y,
			bounds.max.z - bounds.min.z,
			1e-3
		);
		// Centre the body on the holder; the root is at the creature's feet.
		this.inner.userData.length = length;
		compiled.object.position.set(
			-(bounds.min.x + bounds.max.x) / 2,
			-(bounds.min.y + bounds.max.y) / 2,
			-(bounds.min.z + bounds.max.z) / 2
		);
		const face = skeleton.face;
		if (face)
			this.muzzleModel.set(
				face.centre.x + face.forward.x * face.radii.z * 1.1,
				face.centre.y + face.forward.y * face.radii.z * 1.1,
				face.centre.z + face.forward.z * face.radii.z * 1.1
			);
		else this.muzzleModel.set(0, (bounds.min.y + bounds.max.y) / 2, bounds.max.z);
		this.inner.add(compiled.object);
		this.creature = compiled;
		this.definition = definition;
	}

	detach(): void {
		if (this.creature) {
			this.creature.object.removeFromParent();
			this.creature.dispose();
		}
		this.creature = null;
		this.definition = null;
		this.holder.visible = false;
	}

	/** A short kick back and head nod for one shot (skipped with reduced motion). */
	recoil(nowMs: number): void {
		this.recoilStart = nowMs;
		this.recoilUntil = nowMs + RECOIL_MS;
	}

	update(mode: HeldCreatureMode, dt: number, nowMs: number, reducedMotion: boolean): void {
		const creature = this.creature;
		if (!creature || mode.kind === 'hidden') {
			this.holder.visible = false;
			return;
		}
		this.time += Math.min(dt, 0.1);
		const length = this.inner.userData.length as number;
		if (mode.kind === 'first-person') {
			mode.camera.updateMatrixWorld();
			scratchEuler.set(VIEW_PITCH, VIEW_YAW, 0, 'YXZ');
			scratchQuat.setFromEuler(scratchEuler);
			const camera = mode.camera as THREE.PerspectiveCamera;
			const halfHeight = Math.tan(THREE.MathUtils.degToRad((camera.fov ?? 70) / 2)) * VIEW_DEPTH;
			const aspect = camera.aspect ?? 16 / 9;
			const halfWidth = halfHeight * aspect;
			scratchVec.set(halfWidth * VIEW_FRACTION_X, halfHeight * VIEW_FRACTION_Y, -VIEW_DEPTH);
			if (!reducedMotion) scratchVec.y += Math.sin(this.time * 1.9) * 0.004;
			scratchMatrix.compose(scratchVec, scratchQuat, new THREE.Vector3(1, 1, 1));
			this.holder.matrix.multiplyMatrices(mode.camera.matrixWorld, scratchMatrix);
			// Narrow (portrait) views get a smaller creature so it still fits beside the crosshair.
			const fit = Math.min(1, Math.max(0.55, aspect / 1.4));
			this.inner.scale.setScalar(Math.min(1, VIEW_LENGTH / length) * fit);
		} else {
			this.holder.matrix.copy(mode.anchor);
			this.inner.scale.setScalar(Math.min(1, ARM_LENGTH / length));
		}
		this.holder.matrix.decompose(this.holder.position, this.holder.quaternion, this.holder.scale);
		// Recoil: back along the creature's own axis, then settle.
		const recoil =
			!reducedMotion && nowMs < this.recoilUntil
				? Math.sin(((nowMs - this.recoilStart) / RECOIL_MS) * Math.PI)
				: 0;
		this.inner.position.set(0, 0, -0.035 * recoil);
		this.inner.rotation.set(-0.12 * recoil, 0, 0);
		this.holder.updateMatrix();
		this.holder.visible = true;
		// Breathing and a slow tail sway come from the idle animation (no ground, no grounding).
		creature.object.rotation.set(0, 0, 0);
		animateCreature(
			creature,
			{
				velocity: { x: 0, y: 0, z: 0 },
				heading: 0,
				angularVelocity: 0,
				gait: 'idle'
			},
			this.time,
			Math.min(dt, 0.1),
			undefined,
			{ lod: 1 }
		);
		this.holder.updateMatrixWorld(true);
	}

	/** Where pellets leave the mouth, in world space. Only valid after `update` this frame. */
	muzzleWorld(out: THREE.Vector3): THREE.Vector3 | null {
		if (!this.creature || !this.holder.visible) return null;
		return this.creature.object.localToWorld(out.copy(this.muzzleModel));
	}

	dispose(): void {
		this.detach();
		this.holder.removeFromParent();
	}
}
