import * as THREE from 'three';
import {
	flashEnvelope,
	generateLightningBolt,
	lightningPulses,
	type LightningEvent,
	type LightningPulse
} from './LightningController';

const MAX_SEGMENTS = 64;
/** Bolts are visible this long (s); the flash itself may linger a little longer. */
const BOLT_LIFETIME = 0.3;

/**
 * One reusable mesh that shows the most recent lightning bolt: a jagged ribbon (16-segment main
 * channel plus a few branches) built once per strike into preallocated buffers, turned to face the
 * camera, additive and unlit, flickering with the strike's own flash pulses and gone after ~0.3 s.
 * Nothing persists and nothing is allocated per strike beyond the small path arrays.
 */
export class LightningBoltRenderer {
	readonly mesh: THREE.Mesh;
	private readonly geometry = new THREE.BufferGeometry();
	private readonly material: THREE.MeshBasicMaterial;
	private readonly positions = new Float32Array(MAX_SEGMENTS * 4 * 3);
	private pulses: LightningPulse[] = [];
	private age = Number.POSITIVE_INFINITY;
	private strength = 0;

	constructor() {
		const index: number[] = [];
		for (let s = 0; s < MAX_SEGMENTS; s++) {
			const o = s * 4;
			index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
		}
		this.geometry.setIndex(index);
		const attribute = new THREE.BufferAttribute(this.positions, 3);
		attribute.setUsage(THREE.DynamicDrawUsage);
		this.geometry.setAttribute('position', attribute);
		this.geometry.setDrawRange(0, 0);
		this.material = new THREE.MeshBasicMaterial({
			color: new THREE.Color(0.86, 0.9, 1).multiplyScalar(3),
			transparent: true,
			opacity: 0,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			fog: false,
			side: THREE.DoubleSide,
			toneMapped: false
		});
		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.name = 'lightning-bolt';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 4;
		this.mesh.visible = false;
	}

	/**
	 * Builds the bolt for `event`, from the ground (`groundY`) to the cloud base (`topY`), turned
	 * toward the camera. Width grows with distance so far bolts stay a few pixels wide.
	 */
	show(event: LightningEvent, groundY: number, topY: number, camera: THREE.Vector3): void {
		const height = Math.max(40, topY - groundY);
		const path = generateLightningBolt(event.seed, height);
		const width = Math.max(1.4, event.distance * 0.0038);
		let segment = 0;
		const add = (line: Float32Array, scale: number) => {
			for (let i = 0; i + 5 < line.length && segment < MAX_SEGMENTS; i += 3) {
				this.writeSegment(
					segment++,
					event.x + line[i],
					groundY + line[i + 1],
					event.z + line[i + 2],
					event.x + line[i + 3],
					groundY + line[i + 4],
					event.z + line[i + 5],
					width * scale,
					camera
				);
			}
		};
		add(path.main, 1);
		for (const branch of path.branches) add(branch, 0.45);
		const attribute = this.geometry.getAttribute('position') as THREE.BufferAttribute;
		attribute.clearUpdateRanges();
		attribute.addUpdateRange(0, segment * 12);
		attribute.needsUpdate = true;
		this.geometry.setDrawRange(0, segment * 6);
		this.geometry.computeBoundingSphere();
		this.pulses = lightningPulses(event.seed);
		this.strength = Math.min(1, 0.45 + 0.55 * event.intensity);
		this.age = 0;
		this.mesh.visible = true;
	}

	update(deltaSeconds: number): void {
		if (!this.mesh.visible) return;
		this.age += deltaSeconds;
		if (this.age > BOLT_LIFETIME) {
			this.mesh.visible = false;
			return;
		}
		const flicker = Math.min(1, flashEnvelope(this.pulses, this.age));
		this.material.opacity = this.strength * Math.max(0.15, flicker);
	}

	hide(): void {
		this.mesh.visible = false;
		this.age = Number.POSITIVE_INFINITY;
	}

	dispose(): void {
		this.mesh.removeFromParent();
		this.geometry.dispose();
		this.material.dispose();
	}

	private writeSegment(
		index: number,
		ax: number,
		ay: number,
		az: number,
		bx: number,
		by: number,
		bz: number,
		width: number,
		camera: THREE.Vector3
	): void {
		// Side vector: perpendicular to the segment and to the view direction.
		const dx = bx - ax;
		const dy = by - ay;
		const dz = bz - az;
		const vx = camera.x - (ax + bx) * 0.5;
		const vy = camera.y - (ay + by) * 0.5;
		const vz = camera.z - (az + bz) * 0.5;
		let sx = dy * vz - dz * vy;
		let sy = dz * vx - dx * vz;
		let sz = dx * vy - dy * vx;
		const length = Math.hypot(sx, sy, sz) || 1;
		const half = width * 0.5;
		sx = (sx / length) * half;
		sy = (sy / length) * half;
		sz = (sz / length) * half;
		const p = this.positions;
		const o = index * 12;
		p[o] = ax - sx;
		p[o + 1] = ay - sy;
		p[o + 2] = az - sz;
		p[o + 3] = ax + sx;
		p[o + 4] = ay + sy;
		p[o + 5] = az + sz;
		p[o + 6] = bx - sx;
		p[o + 7] = by - sy;
		p[o + 8] = bz - sz;
		p[o + 9] = bx + sx;
		p[o + 10] = by + sy;
		p[o + 11] = bz + sz;
	}
}
