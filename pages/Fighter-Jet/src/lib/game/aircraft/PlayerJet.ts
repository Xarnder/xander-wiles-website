import {
	BoxGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Object3D,
	Quaternion,
	SphereGeometry,
	Vector3,
	type Material
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_PATHS } from '../config/assetPaths';
import { disposeObject3D } from '../utils/dispose';

/** Lift exported GLB materials so they read closer to Blender's brighter viewport look. */
const FIGHTER_MATERIAL_BRIGHTNESS = 1.55;
const FIGHTER_METALNESS_SCALE = 0.28;
const FIGHTER_EMISSIVE_LIFT = 0.14;

const _worldPosition = new Vector3();
const _worldQuaternion = new Quaternion();

export class PlayerJet extends Group {
	readonly hardpoints: readonly [Object3D, Object3D];
	readonly cockpitCamera: Object3D;
	usedFallback = false;
	private readonly modelRoot = new Group();
	private readonly engineEffects = new Group();
	private readonly engineGlows: Mesh[] = [];
	private readonly trails: Mesh[] = [];
	private readonly smoke: Mesh[] = [];

	constructor() {
		super();
		this.name = 'PlayerJet';
		this.add(this.modelRoot, this.engineEffects);
		const left = new Object3D();
		left.name = 'MissileLeft';
		left.position.set(-4.2, -1.2, 0.8);
		const right = new Object3D();
		right.name = 'MissileRight';
		right.position.set(4.2, -1.2, 0.8);
		this.hardpoints = [left, right];
		this.add(left, right);
		this.cockpitCamera = new Object3D();
		this.cockpitCamera.name = 'CockpitCamera';
		this.cockpitCamera.position.set(0, 2.05, -1.2);
		this.add(this.cockpitCamera);
	}

	async initialize(): Promise<boolean> {
		try {
			const gltf = await new GLTFLoader().loadAsync(ASSET_PATHS.fighterJet);
			const model = gltf.scene;
			model.name = 'FighterJetModel';
			model.traverse((child) => {
				if (child instanceof Mesh) {
					child.castShadow = true;
					child.receiveShadow = true;
					this.brightenMaterial(child.material);
				}
			});
			this.modelRoot.add(model);
			this.adoptSocket(model, 'MissileLeft', this.hardpoints[0]);
			this.adoptSocket(model, 'MissileRight', this.hardpoints[1]);
			this.adoptSocket(model, 'CockpitCamera', this.cockpitCamera);
			const engineLeft = model.getObjectByName('EngineLeft') ?? null;
			const engineRight = model.getObjectByName('EngineRight') ?? null;
			this.createEngineEffects(engineLeft, engineRight);
			return true;
		} catch {
			this.usedFallback = true;
			this.modelRoot.add(this.createFallback());
			this.createEngineEffects(null, null);
			return false;
		}
	}

	updateEffects(afterburner: number, healthRatio: number, elapsed: number): void {
		const thrust = 0.62 + afterburner * 1.65;
		for (let index = 0; index < this.engineGlows.length; index += 1) {
			const glow = this.engineGlows[index];
			glow.scale.setScalar(thrust * (0.92 + Math.sin(elapsed * 24 + index) * 0.08));
			const material = glow.material as MeshBasicMaterial;
			material.color.setHex(afterburner > 0.25 ? 0x8edfff : 0xff7a32);
		}
		for (const trail of this.trails) {
			trail.scale.z = 0.7 + afterburner * 2.7;
			(trail.material as MeshBasicMaterial).opacity = 0.22 + afterburner * 0.33;
		}
		const smokeAmount = Math.max(0, 0.48 - healthRatio) / 0.48;
		for (let index = 0; index < this.smoke.length; index += 1) {
			const puff = this.smoke[index];
			puff.visible = smokeAmount > index / this.smoke.length;
			puff.position.z = 7 + ((elapsed * 18 + index * 5) % 24);
			puff.position.y = Math.sin(elapsed * 2.1 + index) * 1.4;
			puff.scale.setScalar(1.4 + smokeAmount * 2.8 + (puff.position.z - 7) * 0.08);
			(puff.material as MeshBasicMaterial).opacity =
				smokeAmount * (1 - (puff.position.z - 7) / 30) * 0.32;
		}
	}

	getHardpointWorldPosition(index: number, out: Vector3): Vector3 {
		return this.hardpoints[index % 2].getWorldPosition(out);
	}

	getForward(out: Vector3): Vector3 {
		this.getWorldQuaternion(_worldQuaternion);
		return out.set(0, 0, -1).applyQuaternion(_worldQuaternion).normalize();
	}

	dispose(): void {
		disposeObject3D(this);
		this.removeFromParent();
	}

	private adoptSocket(model: Object3D, name: string, fallback: Object3D): void {
		const socket = model.getObjectByName(name);
		if (!socket) return;
		socket.getWorldPosition(_worldPosition);
		this.worldToLocal(_worldPosition);
		fallback.position.copy(_worldPosition);
	}

	private brightenMaterial(material: Material | Material[]): void {
		if (Array.isArray(material)) {
			for (const entry of material) this.brightenMaterial(entry);
			return;
		}
		if (!(material instanceof MeshStandardMaterial)) return;

		// Blender metal/rough PBR often looks much darker in Three.js without an HDR env map;
		// metals reflect empty black sky. Soften metalness and lift albedo/emissive for readability.
		material.color.multiplyScalar(FIGHTER_MATERIAL_BRIGHTNESS);
		material.color.r = Math.min(1, material.color.r);
		material.color.g = Math.min(1, material.color.g);
		material.color.b = Math.min(1, material.color.b);
		material.metalness = Math.min(0.45, material.metalness * FIGHTER_METALNESS_SCALE);
		material.roughness = Math.min(0.92, Math.max(0.28, material.roughness * 0.9 + 0.12));
		material.envMapIntensity = Math.max(material.envMapIntensity, 1.15);

		const lift = new Color().copy(material.color).multiplyScalar(FIGHTER_EMISSIVE_LIFT);
		if (material.emissive.getHex() === 0) {
			material.emissive.copy(lift);
			material.emissiveIntensity = 1;
		} else {
			material.emissive.add(lift);
			material.emissiveIntensity = Math.max(material.emissiveIntensity, 1);
		}
		material.needsUpdate = true;
	}

	private createEngineEffects(left: Object3D | null, right: Object3D | null): void {
		const sockets: Array<{ socket: Object3D | null; x: number }> = [
			{ socket: left, x: -1.55 },
			{ socket: right, x: 1.55 }
		];
		for (const { socket, x } of sockets) {
			const glow = new Mesh(
				new SphereGeometry(0.65, 8, 6),
				new MeshBasicMaterial({ color: 0xff7a32, transparent: true, opacity: 0.86 })
			);
			const trail = new Mesh(
				new ConeGeometry(0.68, 7, 8, 1, true),
				new MeshBasicMaterial({
					color: 0x72cfff,
					transparent: true,
					opacity: 0.3,
					depthWrite: false
				})
			);
			glow.position.set(x, 0, 6.5);
			trail.position.set(x, 0, 10);
			trail.rotation.x = Math.PI / 2;
			if (socket) {
				socket.getWorldPosition(_worldPosition);
				this.worldToLocal(_worldPosition);
				glow.position.copy(_worldPosition);
				trail.position.copy(_worldPosition).add(new Vector3(0, 0, 3.5));
			}
			this.engineGlows.push(glow);
			this.trails.push(trail);
			this.engineEffects.add(glow, trail);
		}
		const smokeMaterial = new MeshBasicMaterial({
			color: 0x252525,
			transparent: true,
			opacity: 0,
			depthWrite: false
		});
		for (let index = 0; index < 7; index += 1) {
			const puff = new Mesh(new SphereGeometry(1, 6, 5), smokeMaterial.clone());
			puff.visible = false;
			this.smoke.push(puff);
			this.engineEffects.add(puff);
		}
	}

	private createFallback(): Group {
		const jet = new Group();
		const bodyMaterial = new MeshStandardMaterial({
			color: 0x8c9595,
			metalness: 0.72,
			roughness: 0.32,
			flatShading: true
		});
		const darkMaterial = new MeshStandardMaterial({
			color: 0x18272c,
			metalness: 0.6,
			roughness: 0.22
		});
		const fuselage = new Mesh(new CylinderGeometry(1.45, 2.15, 14, 8), bodyMaterial);
		fuselage.rotation.x = Math.PI / 2;
		const nose = new Mesh(new ConeGeometry(1.46, 7, 8), bodyMaterial);
		nose.rotation.x = -Math.PI / 2;
		nose.position.z = -10.4;
		const wings = new Mesh(new BoxGeometry(13.5, 0.32, 5.4), bodyMaterial);
		wings.position.z = 1.2;
		wings.rotation.y = -0.04;
		const tailWing = new Mesh(new BoxGeometry(6.4, 0.26, 2.5), bodyMaterial);
		tailWing.position.z = 6;
		const fin = new Mesh(new BoxGeometry(0.28, 3.2, 3.4), bodyMaterial);
		fin.position.set(0, 1.65, 5.3);
		fin.rotation.x = -0.18;
		const cockpit = new Mesh(new SphereGeometry(1.5, 10, 7), darkMaterial);
		cockpit.scale.set(0.72, 0.55, 1.5);
		cockpit.position.set(0, 1.2, -3.1);
		jet.add(fuselage, nose, wings, tailWing, fin, cockpit);
		return jet;
	}
}
