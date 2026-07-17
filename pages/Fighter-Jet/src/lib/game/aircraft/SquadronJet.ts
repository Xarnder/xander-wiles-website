import {
	BoxGeometry,
	ConeGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Vector3
} from 'three';
import type { SquadronState } from '../types';

export class SquadronJet extends Group {
	state: SquadronState = 'formation';
	health = 100;
	active = true;
	readonly velocity = new Vector3();
	private readonly glow: Mesh;

	constructor(
		readonly callsign: string,
		color: number
	) {
		super();
		this.name = callsign;
		const body = new MeshStandardMaterial({
			color,
			metalness: 0.68,
			roughness: 0.36,
			flatShading: true
		});
		const dark = new MeshStandardMaterial({ color: 0x273236, roughness: 0.4, metalness: 0.65 });
		const fuselage = new Mesh(new CylinderGeometry(0.65, 1.05, 8, 7), body);
		fuselage.rotation.x = Math.PI / 2;
		const nose = new Mesh(new ConeGeometry(0.66, 3.4, 7), body);
		nose.rotation.x = -Math.PI / 2;
		nose.position.z = -5.7;
		const wing = new Mesh(new BoxGeometry(7.2, 0.2, 3.2), body);
		wing.position.z = 0.7;
		const tail = new Mesh(new BoxGeometry(3.2, 0.18, 1.4), body);
		tail.position.z = 3.4;
		const cockpit = new Mesh(new ConeGeometry(0.65, 2.5, 8), dark);
		cockpit.rotation.x = -Math.PI / 2;
		cockpit.position.set(0, 0.66, -2.3);
		this.glow = new Mesh(
			new ConeGeometry(0.42, 3, 7, 1, true),
			new MeshBasicMaterial({
				color: 0x72cfff,
				transparent: true,
				opacity: 0.42,
				depthWrite: false
			})
		);
		this.glow.rotation.x = Math.PI / 2;
		this.glow.position.z = 5.3;
		this.add(fuselage, nose, wing, tail, cockpit, this.glow);
		this.scale.setScalar(0.8);
		this.traverse((child) => {
			if (child instanceof Mesh) child.castShadow = true;
		});
	}

	updateVisual(elapsed: number, intensity: number): void {
		const flicker = 0.9 + Math.sin(elapsed * 25 + this.id) * 0.1;
		this.glow.scale.z = flicker * (0.75 + intensity);
		this.glow.visible = this.active;
		this.visible = this.active;
	}
}
