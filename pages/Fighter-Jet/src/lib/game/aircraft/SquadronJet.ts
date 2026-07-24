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
	SphereGeometry,
	Vector3,
	type Material
} from 'three';
import type { SquadronState } from '../types';

/** Match PlayerJet material lift so squadron jets read the same as the lead aircraft. */
const FIGHTER_MATERIAL_BRIGHTNESS = 1.55;
const FIGHTER_METALNESS_SCALE = 0.28;
const FIGHTER_EMISSIVE_LIFT = 0.14;

const _local = new Vector3();

export class SquadronJet extends Group {
	state: SquadronState = 'formation';
	health = 100;
	active = true;
	readonly velocity = new Vector3();
	readonly targetPosition = new Vector3();
	private readonly modelRoot = new Group();
	private readonly engineEffects = new Group();
	private readonly engineGlows: Mesh[] = [];
	private readonly trails: Mesh[] = [];
	private ready = false;

	constructor(readonly callsign: string) {
		super();
		this.name = callsign;
		this.add(this.modelRoot, this.engineEffects);
	}

	/** Install a prepared fighter mesh (cloned GLB or procedural fallback). */
	applyModel(model: Object3D, usedFallback = false): void {
		while (this.modelRoot.children.length > 0) {
			this.modelRoot.remove(this.modelRoot.children[0]);
		}
		for (const glow of this.engineGlows) {
			glow.geometry.dispose();
			(glow.material as MeshBasicMaterial).dispose();
			this.engineEffects.remove(glow);
		}
		for (const trail of this.trails) {
			trail.geometry.dispose();
			(trail.material as MeshBasicMaterial).dispose();
			this.engineEffects.remove(trail);
		}
		this.engineGlows.length = 0;
		this.trails.length = 0;

		model.name = usedFallback ? 'SquadronFallback' : 'SquadronFighterModel';
		this.modelRoot.add(model);
		const engineLeft = model.getObjectByName('EngineLeft') ?? null;
		const engineRight = model.getObjectByName('EngineRight') ?? null;
		this.createEngineEffects(engineLeft, engineRight);
		this.ready = true;
	}

	updateVisual(elapsed: number, intensity: number): void {
		this.visible = this.active;
		if (!this.ready) return;
		const thrust = 0.55 + intensity * 1.2;
		for (let index = 0; index < this.engineGlows.length; index += 1) {
			const glow = this.engineGlows[index];
			glow.visible = this.active;
			glow.scale.setScalar(thrust * (0.92 + Math.sin(elapsed * 24 + this.id + index) * 0.08));
			const material = glow.material as MeshBasicMaterial;
			material.color.setHex(intensity > 0.7 ? 0x8edfff : 0xff7a32);
		}
		for (const trail of this.trails) {
			trail.visible = this.active;
			trail.scale.z = 0.65 + intensity * 2.2;
			(trail.material as MeshBasicMaterial).opacity = 0.2 + intensity * 0.28;
		}
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
				socket.getWorldPosition(_local);
				this.worldToLocal(_local);
				glow.position.copy(_local);
				trail.position.copy(_local).add(new Vector3(0, 0, 3.5));
			}
			this.engineGlows.push(glow);
			this.trails.push(trail);
			this.engineEffects.add(glow, trail);
		}
	}
}

/** Brighten fighter materials the same way as the player jet. */
export function prepareFighterMaterials(root: Object3D): void {
	root.traverse((child) => {
		if (!(child instanceof Mesh)) return;
		child.castShadow = true;
		child.receiveShadow = true;
		brightenMaterial(child.material);
	});
}

export function createSquadronFallbackModel(): Group {
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

function brightenMaterial(material: Material | Material[]): void {
	if (Array.isArray(material)) {
		for (const entry of material) brightenMaterial(entry);
		return;
	}
	if (!(material instanceof MeshStandardMaterial)) return;
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
