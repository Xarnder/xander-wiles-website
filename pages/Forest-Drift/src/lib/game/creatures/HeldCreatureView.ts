import * as THREE from 'three';
import { compileCreature, type CompiledCreature } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import { jointWorldPositions } from './SkeletonGenerator';
import type {
	CreatureBounds,
	CreatureDefinition,
	ProceduralSkeletonDefinition
} from './CreatureTypes';

/** How the carried creature is shown this frame. */
export type HeldCreatureMode =
	| { kind: 'hidden' }
	/** First person: just its head and neck, large, in the lower-left corner of the view. */
	| { kind: 'first-person'; camera: THREE.Camera }
	/**
	 * Under the character's left arm, at its real size: `anchor` is the world transform for the
	 * centre of its body, from `CharacterInstance.carryAnchor`.
	 */
	| { kind: 'third-person'; anchor: THREE.Matrix4 };

/** First person: the head's height as a fraction of the view's height (it's held up close). */
const VIEW_HEAD_FRACTION = 0.3;
/** Nearest and furthest the head is held from the camera, metres. */
const VIEW_DEPTH_MIN = 0.2;
const VIEW_DEPTH_MAX = 0.7;
/**
 * Where the head sits, as a fraction of the visible half-width/half-height at its depth (lower
 * left). The neck and body run back and down out of the corner of the view.
 */
const VIEW_FRACTION_X = -0.56;
const VIEW_FRACTION_Y = -0.5;
/** Turned in toward the crosshair, and lifted a little so the neck rises out of the corner. */
const VIEW_YAW = Math.PI - 0.42;
const VIEW_PITCH = -0.2;
const RECOIL_MS = 80;

const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchVec = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * The creature a player is carrying, always at its real size: tucked under the character's arm
 * (third person, and how everyone else sees it), or as its head and neck in the corner of a
 * first-person view. It is its own compiled copy: the herd's copy is unloaded while it's carried.
 * Visual only; the projectile's origin comes from `muzzleWorld`.
 */
export class HeldCreatureView {
	private readonly holder = new THREE.Group();
	private readonly inner = new THREE.Group();
	private creature: CompiledCreature | null = null;
	private definition: CreatureDefinition | null = null;
	/** Muzzle tip in the compiled creature's model space. */
	private readonly muzzleModel = new THREE.Vector3();
	/**
	 * Half the size of the body (torso), metres: across, up and along. The holder's origin is the
	 * body's centre, so `CharacterInstance` can press it against the ribs and wrap the arm over it.
	 */
	readonly bodyHalfSize = new THREE.Vector3(0.1, 0.08, 0.2);
	/** The head's centre relative to the body's centre, and its radius (first person). */
	private readonly headOffset = new THREE.Vector3();
	private headRadius = 0.06;
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
		const body = carriedBody(skeleton, bounds);
		this.bodyHalfSize.copy(body.half);
		// The holder's origin is the body's centre; the model's root is at its feet.
		compiled.object.position.copy(body.centre).negate();
		const face = skeleton.face;
		if (face) {
			this.headOffset.set(face.centre.x, face.centre.y, face.centre.z).sub(body.centre);
			this.headRadius = Math.max(face.radii.x, face.radii.y, face.radii.z, 0.02);
			this.muzzleModel.set(
				face.centre.x + face.forward.x * face.radii.z * 1.1,
				face.centre.y + face.forward.y * face.radii.z * 1.1,
				face.centre.z + face.forward.z * face.radii.z * 1.1
			);
		} else {
			this.muzzleModel.set(0, (bounds.min.y + bounds.max.y) / 2, bounds.max.z);
			this.headOffset.copy(this.muzzleModel).sub(body.centre);
			this.headRadius = Math.max(0.03, body.half.y * 0.6);
		}
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
		if (mode.kind === 'first-person') {
			mode.camera.updateMatrixWorld();
			const camera = mode.camera as THREE.PerspectiveCamera;
			const tanHalf = Math.tan(THREE.MathUtils.degToRad((camera.fov ?? 70) / 2));
			const aspect = camera.aspect ?? 16 / 9;
			// Narrow (portrait) views hold it a little further away so it stays beside the crosshair.
			const fit = Math.min(1, Math.max(0.6, aspect / 1.4));
			const depth = THREE.MathUtils.clamp(
				this.headRadius / (VIEW_HEAD_FRACTION * fit * tanHalf),
				VIEW_DEPTH_MIN,
				VIEW_DEPTH_MAX
			);
			const halfHeight = tanHalf * depth;
			scratchEuler.set(VIEW_PITCH, VIEW_YAW, 0, 'YXZ');
			scratchQuat.setFromEuler(scratchEuler);
			// Put the head at the corner point; the body follows wherever that leaves it.
			scratchVec.copy(this.headOffset).applyQuaternion(scratchQuat).negate();
			scratchVec.x += halfHeight * aspect * VIEW_FRACTION_X;
			scratchVec.y += halfHeight * VIEW_FRACTION_Y;
			scratchVec.z -= depth;
			if (!reducedMotion) scratchVec.y += Math.sin(this.time * 1.9) * 0.004;
			scratchMatrix.compose(scratchVec, scratchQuat, ONE);
			this.holder.matrix.multiplyMatrices(mode.camera.matrixWorld, scratchMatrix);
		} else {
			this.holder.matrix.copy(mode.anchor);
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

/**
 * The body's (torso's) centre and half-size in model space, from the torso volume's path and
 * cross-sections; the whole bounds when a plan has no torso volume.
 */
export function carriedBody(
	skeleton: ProceduralSkeletonDefinition,
	bounds: CreatureBounds
): { centre: THREE.Vector3; half: THREE.Vector3 } {
	const torso = skeleton.volumes.find((v) => v.part === 'torso');
	const min = new THREE.Vector3(Infinity, Infinity, Infinity);
	const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
	if (torso) {
		const joints = jointWorldPositions(skeleton);
		let across = 0;
		let up = 0;
		let down = 0;
		for (const section of torso.sections) {
			across = Math.max(across, section.radiusX);
			up = Math.max(up, section.radiusY + (section.offsetY ?? 0));
			down = Math.max(down, (section.radiusYLower ?? section.radiusY) - (section.offsetY ?? 0));
		}
		torso.jointIds.forEach((id, n) => {
			const p = joints.get(id);
			if (!p) return;
			const o = torso.pointOffsets?.[n];
			scratchVec.set(p.x + (o?.x ?? 0), p.y + (o?.y ?? 0), p.z + (o?.z ?? 0));
			min.min(scratchVec);
			max.max(scratchVec);
		});
		if (Number.isFinite(min.x) && across > 0) {
			min.x -= across;
			max.x += across;
			min.y -= down;
			max.y += up;
			// The domed ends reach a little past the first and last path points.
			min.z -= Math.max(up, down) * 0.5;
			max.z += Math.max(up, down) * 0.5;
		} else min.set(Infinity, Infinity, Infinity);
	}
	if (!Number.isFinite(min.x)) {
		min.set(bounds.min.x, bounds.min.y, bounds.min.z);
		max.set(bounds.max.x, bounds.max.y, bounds.max.z);
	}
	return {
		centre: new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5),
		half: new THREE.Vector3()
			.subVectors(max, min)
			.multiplyScalar(0.5)
			.max(new THREE.Vector3(0.02, 0.02, 0.02))
	};
}
