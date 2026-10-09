import * as THREE from 'three';
import type { PrecipitationShelter } from './PrecipitationController';

const RING_SEGMENTS = 48;

/**
 * Developer overlay (Settings → Weather): the camera-local precipitation volume as two rings (top
 * and bottom), the shelter box when the camera is indoors, and the last representative rain
 * impact points. Built once; per frame only positions and visibility change.
 */
export class WeatherDebugView {
	readonly group = new THREE.Group();
	private readonly volume: THREE.LineSegments;
	private readonly shelter: THREE.LineSegments;
	private readonly impacts: THREE.Points;
	private readonly impactPositions: Float32Array;

	constructor() {
		this.group.name = 'weather-debug';
		const ring: number[] = [];
		for (const y of [-0.5, 0.5]) {
			for (let i = 0; i < RING_SEGMENTS; i++) {
				const a = (i / RING_SEGMENTS) * Math.PI * 2;
				const b = ((i + 1) / RING_SEGMENTS) * Math.PI * 2;
				ring.push(Math.sin(a), y, Math.cos(a), Math.sin(b), y, Math.cos(b));
			}
		}
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2;
			ring.push(Math.sin(a), -0.5, Math.cos(a), Math.sin(a), 0.5, Math.cos(a));
		}
		const ringGeometry = new THREE.BufferGeometry();
		ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
		this.volume = new THREE.LineSegments(
			ringGeometry,
			new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.6, fog: false })
		);
		this.volume.frustumCulled = false;

		const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
		box.translate(0.5, 0.5, 0.5);
		this.shelter = new THREE.LineSegments(
			box,
			new THREE.LineBasicMaterial({ color: 0xffaa33, fog: false })
		);
		this.shelter.frustumCulled = false;

		this.impactPositions = new Float32Array(32 * 3);
		const impactGeometry = new THREE.BufferGeometry();
		impactGeometry.setAttribute('position', new THREE.BufferAttribute(this.impactPositions, 3));
		this.impacts = new THREE.Points(
			impactGeometry,
			new THREE.PointsMaterial({ color: 0xff3355, size: 6, sizeAttenuation: false, fog: false })
		);
		this.impacts.frustumCulled = false;

		this.group.add(this.volume, this.shelter, this.impacts);
		this.group.visible = false;
	}

	update(
		options: { showVolume: boolean; showImpacts: boolean },
		center: THREE.Vector3,
		radius: number,
		height: number,
		shelter: PrecipitationShelter,
		impactPoints: Float32Array
	): void {
		this.volume.visible = options.showVolume;
		this.shelter.visible = options.showVolume && shelter.active;
		this.impacts.visible = options.showImpacts;
		this.group.visible = options.showVolume || options.showImpacts;
		if (!this.group.visible) return;
		if (this.volume.visible) {
			this.volume.position.set(center.x, center.y + height * 0.18, center.z);
			this.volume.scale.set(radius, height, radius);
		}
		if (this.shelter.visible) {
			this.shelter.position.set(shelter.minX, shelter.topY - 6, shelter.minZ);
			this.shelter.scale.set(shelter.maxX - shelter.minX, 6, shelter.maxZ - shelter.minZ);
		}
		if (this.impacts.visible) {
			this.impactPositions.set(impactPoints);
			const attribute = this.impacts.geometry.getAttribute('position') as THREE.BufferAttribute;
			attribute.needsUpdate = true;
		}
	}

	dispose(): void {
		this.group.removeFromParent();
		for (const object of [this.volume, this.shelter, this.impacts]) {
			object.geometry.dispose();
			(object.material as THREE.Material).dispose();
		}
	}
}
