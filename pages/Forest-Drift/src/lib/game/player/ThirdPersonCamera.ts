import * as THREE from 'three';
import type { WallCollisionRect } from '../building/wallCollision';

export interface CameraObstacles {
	walls: readonly WallCollisionRect[];
	/** Conservative solid bounds for foundations, slabs and roof volumes. */
	meshes: readonly THREE.Object3D[];
	terrain: (x: number, z: number) => number;
}

/** Bounded camera boom; collision contracts are shared with player/building geometry. */
export class ThirdPersonCamera {
	private distance = 0;
	private readonly direction = new THREE.Vector3();
	private readonly desired = new THREE.Vector3();
	private readonly pivot = new THREE.Vector3();
	private readonly point = new THREE.Vector3();
	private readonly ray = new THREE.Ray();
	private readonly box = new THREE.Box3();
	private readonly localOrigin = new THREE.Vector3();
	private readonly localDirection = new THREE.Vector3();
	private readonly previous = new THREE.Vector3(Infinity, 0, 0);
	reset(): void {
		this.distance = 0;
		this.previous.set(Infinity, 0, 0);
	}

	update(
		camera: THREE.PerspectiveCamera,
		eye: THREE.Vector3,
		dt: number,
		obstacles: CameraObstacles
	): number {
		// Enclose the near plane, including wide aspect ratios/FOVs, in a collision sphere.
		const halfHeight = camera.near * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
		const radius = Math.max(
			0.18,
			Math.hypot(halfHeight * camera.aspect, halfHeight, camera.near) + 0.04
		);
		this.pivot.copy(eye);
		this.desired.copy(eye);
		this.desired.y += 0.55;
		// Sweep the upward shoulder offset too, so a low ceiling cannot put the pivot through it.
		this.direction.subVectors(this.desired, eye).normalize();
		const lift = this.clearance(eye, this.direction, 0.55, radius, obstacles);
		this.pivot.y += lift;
		camera.getWorldDirection(this.direction).negate();
		const allowed = this.clearance(this.pivot, this.direction, 3.2, radius, obstacles);
		if (this.previous.distanceToSquared(eye) > 4) this.distance = 0;
		this.previous.copy(eye);
		// Never interpolate through a new obstruction. Only outward recovery is smoothed.
		this.distance = Math.min(
			allowed,
			this.distance + (allowed - this.distance) * (1 - Math.exp(-Math.min(dt, 0.1) * 7))
		);
		camera.position.copy(this.pivot).addScaledVector(this.direction, this.distance);
		camera.updateMatrixWorld(true);
		return camera.position.distanceTo(eye);
	}

	private clearance(
		origin: THREE.Vector3,
		direction: THREE.Vector3,
		length: number,
		radius: number,
		o: CameraObstacles
	): number {
		let limit = length;
		for (const wall of o.walls) {
			const x = origin.x - wall.centerX,
				z = origin.z - wall.centerZ;
			this.localOrigin.set(x * wall.dirX + z * wall.dirZ, origin.y, -x * wall.dirZ + z * wall.dirX);
			this.localDirection.set(
				direction.x * wall.dirX + direction.z * wall.dirZ,
				direction.y,
				-direction.x * wall.dirZ + direction.z * wall.dirX
			);
			this.box.min.set(
				-wall.halfLength - radius,
				wall.minWorldY - radius,
				-wall.halfThickness - radius
			);
			this.box.max.set(
				wall.halfLength + radius,
				wall.maxWorldY + radius,
				wall.halfThickness + radius
			);
			limit = Math.min(limit, this.boxDistance(this.localOrigin, this.localDirection, limit));
		}
		for (const object of o.meshes) {
			const mesh = object as THREE.Mesh;
			if (!mesh.geometry) continue;
			if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
			mesh.updateWorldMatrix(true, false);
			this.box
				.copy(mesh.geometry.boundingBox!)
				.applyMatrix4(mesh.matrixWorld)
				.expandByScalar(radius);
			limit = Math.min(limit, this.boxDistance(origin, direction, limit));
		}
		// A maximum of 33 samples for the short boom; same height field as walking.
		const steps = Math.max(1, Math.ceil(limit / 0.1));
		for (let i = 0; i <= steps; i++) {
			const d = (limit * i) / steps;
			this.point.copy(origin).addScaledVector(direction, d);
			for (const [dx, dz] of FOOTPRINT) {
				if (
					this.point.y - radius <=
					o.terrain(this.point.x + dx * radius, this.point.z + dz * radius)
				)
					return Math.max(0, (limit * (i - 1)) / steps - 0.03);
			}
		}
		return limit;
	}
	private boxDistance(origin: THREE.Vector3, direction: THREE.Vector3, max: number): number {
		if (this.box.containsPoint(origin)) return 0;
		this.ray.set(origin, direction);
		const hit = this.ray.intersectBox(this.box, this.point);
		return hit ? Math.min(max, Math.max(0, origin.distanceTo(hit) - 0.03)) : max;
	}
}
const FOOTPRINT = [
	[0, 0],
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1]
] as const;
