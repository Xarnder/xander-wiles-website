import {
	BoxGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	DodecahedronGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Object3D,
	RingGeometry,
	SphereGeometry,
	TorusGeometry,
	Vector3
} from 'three';
import type { TargetType } from '../types';

export class EnemyBase extends Group {
	private readonly concrete = new MeshStandardMaterial({
		color: 0x77756a,
		roughness: 0.82,
		metalness: 0.16
	});
	private readonly darkMetal = new MeshStandardMaterial({
		color: 0x313a39,
		roughness: 0.45,
		metalness: 0.72
	});
	private readonly hazard = new MeshStandardMaterial({
		color: 0xa8492e,
		roughness: 0.62,
		metalness: 0.35
	});
	private readonly emissive = new MeshBasicMaterial({ color: 0xff5238 });
	private readonly targetRoots = new Map<string, Object3D>();

	constructor() {
		super();
		this.name = 'EnemyInstallation';
		this.addPerimeter();
	}

	createTargetVisual(id: string, type: TargetType): Object3D {
		const root = new Group();
		root.name = `TargetVisual:${id}`;
		switch (type) {
			case 'radar':
				this.buildRadar(root);
				break;
			case 'sam':
				this.buildSam(root);
				break;
			case 'fuel':
				this.buildFuel(root);
				break;
			case 'hangar':
				this.buildHangar(root);
				break;
			case 'command':
				this.buildCommand(root);
				break;
			case 'weak-point':
				this.buildWeakPoint(root);
				break;
		}
		root.traverse((child) => {
			if (child instanceof Mesh) {
				child.castShadow = true;
				child.receiveShadow = true;
			}
		});
		this.targetRoots.set(id, root);
		this.add(root);
		return root;
	}

	markDestroyed(id: string, position: Vector3, type: TargetType): void {
		const root = this.targetRoots.get(id);
		if (root) root.visible = false;
		const remnant = new Group();
		const charred = new MeshStandardMaterial({
			color: new Color(0x171612),
			roughness: 1,
			metalness: 0.2
		});
		const rubbleCount = type === 'command' || type === 'fuel' ? 10 : 6;
		for (let index = 0; index < rubbleCount; index += 1) {
			const rubble = new Mesh(new DodecahedronGeometry(2 + (index % 3) * 1.6, 0), charred);
			const angle = index * 2.399;
			const radius = 5 + index * 1.9;
			rubble.position.set(Math.cos(angle) * radius, 1.3, Math.sin(angle) * radius);
			rubble.scale.y = 0.45;
			remnant.add(rubble);
		}
		const scorch = new Mesh(
			new RingGeometry(4, type === 'command' ? 36 : 24, 28),
			new MeshBasicMaterial({
				color: 0x17120d,
				transparent: true,
				opacity: 0.78,
				depthWrite: false
			})
		);
		scorch.rotation.x = -Math.PI / 2;
		scorch.position.y = 0.2;
		remnant.add(scorch);
		remnant.position.copy(position);
		this.add(remnant);
	}

	private buildRadar(root: Group): void {
		const tower = new Mesh(new CylinderGeometry(6, 9, 30, 8), this.darkMetal);
		tower.position.y = 15;
		const dish = new Mesh(
			new SphereGeometry(16, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.44),
			this.concrete
		);
		dish.position.y = 37;
		dish.rotation.x = -Math.PI * 0.25;
		dish.scale.z = 0.3;
		root.add(tower, dish);
	}

	private buildSam(root: Group): void {
		const base = new Mesh(new CylinderGeometry(11, 14, 5, 8), this.concrete);
		base.position.y = 2.5;
		const turret = new Mesh(new BoxGeometry(14, 7, 11), this.darkMetal);
		turret.position.y = 9;
		root.add(base, turret);
		for (let side = -1; side <= 1; side += 2) {
			const launcher = new Mesh(new CylinderGeometry(2.2, 2.2, 19, 8), this.hazard);
			launcher.position.set(side * 6, 15, -3);
			launcher.rotation.x = Math.PI * 0.35;
			root.add(launcher);
		}
	}

	private buildFuel(root: Group): void {
		for (let side = -1; side <= 1; side += 2) {
			const tank = new Mesh(new CylinderGeometry(10, 10, 25, 18), this.concrete);
			tank.position.set(side * 13, 12.5, 0);
			const cap = new Mesh(new SphereGeometry(10, 18, 8), this.hazard);
			cap.position.set(side * 13, 25, 0);
			cap.scale.y = 0.35;
			root.add(tank, cap);
		}
	}

	private buildHangar(root: Group): void {
		const shell = new Mesh(new BoxGeometry(56, 18, 42), this.concrete);
		shell.position.y = 9;
		const roof = new Mesh(
			new CylinderGeometry(28, 28, 42, 16, 1, false, 0, Math.PI),
			this.darkMetal
		);
		roof.rotation.set(0, 0, Math.PI / 2);
		roof.position.y = 18;
		const door = new Mesh(new BoxGeometry(31, 12, 1), this.hazard);
		door.position.set(0, 8, 21.1);
		root.add(shell, roof, door);
	}

	private buildCommand(root: Group): void {
		const lower = new Mesh(new BoxGeometry(72, 18, 58), this.concrete);
		lower.position.y = 9;
		const upper = new Mesh(new BoxGeometry(44, 16, 36), this.darkMetal);
		upper.position.y = 25;
		const mast = new Mesh(new CylinderGeometry(2.2, 3.4, 30, 8), this.hazard);
		mast.position.y = 48;
		const beacon = new Mesh(new SphereGeometry(2.8, 10, 8), this.emissive);
		beacon.position.y = 64;
		root.add(lower, upper, mast, beacon);
	}

	private buildWeakPoint(root: Group): void {
		const ring = new Mesh(new TorusGeometry(7, 1.1, 8, 24), this.emissive);
		ring.rotation.x = Math.PI / 2;
		const core = new Mesh(new ConeGeometry(4, 8, 8), this.hazard);
		core.rotation.x = Math.PI;
		core.position.y = -2;
		root.add(ring, core);
	}

	private addPerimeter(): void {
		for (let index = 0; index < 24; index += 1) {
			const angle = (index / 24) * Math.PI * 2;
			const barrier = new Mesh(new BoxGeometry(48, 8, 9), this.concrete);
			barrier.position.set(Math.cos(angle) * 790, 4, Math.sin(angle) * 600 - 3600);
			barrier.rotation.y = -angle;
			this.add(barrier);
		}
	}
}
