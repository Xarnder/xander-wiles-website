import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ThirdPersonCamera, type CameraObstacles } from '../ThirdPersonCamera';
import type { WallCollisionRect } from '../../building/wallCollision';
const wall = (z = 1): WallCollisionRect => ({
	centerX: 0,
	centerZ: z,
	halfLength: 2,
	halfThickness: 0.025,
	dirX: 1,
	dirZ: 0,
	minWorldY: 0,
	maxWorldY: 4
});
const empty = (): CameraObstacles => ({ walls: [], meshes: [], terrain: () => 0 });
function setup() {
	const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100);
	const boom = new ThirdPersonCamera();
	const eye = new THREE.Vector3(0, 1.7, 0);
	const settle = (o = empty()) => {
		for (let i = 0; i < 120; i++) boom.update(camera, eye, 1 / 60, o);
	};
	return { camera, boom, eye, settle };
}
describe('third-person camera', () => {
	it('sits above the head and keeps the centre ray at the rendered camera', () => {
		const { camera, settle } = setup();
		settle();
		expect(camera.position.y).toBeCloseTo(2.25);
		expect(camera.position.z).toBeCloseTo(3.2);
		const ray = new THREE.Raycaster();
		ray.setFromCamera(new THREE.Vector2(), camera);
		expect(ray.ray.origin.distanceTo(camera.position)).toBeLessThan(1e-8);
		expect(ray.ray.direction.distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-8);
	});
	it('retracts immediately against thin walls and eases out after removal', () => {
		const { camera, boom, eye, settle } = setup();
		settle();
		boom.update(camera, eye, 1 / 60, { ...empty(), walls: [wall()] });
		expect(camera.position.z).toBeGreaterThan(0.5);
		expect(camera.position.z).toBeLessThan(0.8);
		const previous = camera.position.z;
		boom.update(camera, eye, 1 / 60, empty());
		expect(camera.position.z).toBeGreaterThan(previous);
		expect(camera.position.z).toBeLessThan(1.2);
	});
	it('protects the upward offset from ceilings and camera corners from walls', () => {
		const { camera, settle } = setup();
		const ceiling = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 10));
		ceiling.position.y = 2.1;
		settle({ ...empty(), meshes: [ceiling] });
		expect(camera.position.y).toBeLessThan(1.88);
		ceiling.geometry.dispose();
	});
	it('handles rotated walls, steep terrain, teleports and wide near planes', () => {
		const { camera, boom, eye, settle } = setup();
		camera.aspect = 3;
		camera.near = 0.2;
		camera.updateProjectionMatrix();
		settle({ ...empty(), walls: [{ ...wall(), dirX: Math.SQRT1_2, dirZ: Math.SQRT1_2 }] });
		expect(camera.position.z).toBeLessThan(0.5);
		settle({ ...empty(), terrain: (_x, z) => (z > 1 ? 3 : 0) });
		expect(camera.position.z).toBeLessThan(1);
		eye.set(100, 1.7, 100);
		boom.update(camera, eye, 1 / 60, empty());
		expect(camera.position.distanceTo(eye)).toBeLessThan(1);
	});
});
