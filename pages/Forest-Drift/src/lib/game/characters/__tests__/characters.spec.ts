import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CharacterInstance } from '../CharacterInstance';
import { TwoBoneIK } from '../twoBoneIK';
import { POSE_FLAGS } from '../../net/protocol';
import type { MotionFrame } from '../../net/RemoteMotion';

let template: THREE.Group;
beforeAll(async () => {
	const bytes = await readFile(new URL('../assets/character.glb', import.meta.url));
	template = (
		await new GLTFLoader().parseAsync(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
			''
		)
	).scene;
});
const frame = (z = 0, flags = POSE_FLAGS.grounded): MotionFrame => ({
	x: 0,
	y: 0,
	z,
	yaw: 0,
	pitch: 0,
	speed: 0,
	stale: false,
	flags
});
const bone = (character: CharacterInstance, name: string) =>
	character.object.getObjectByName(`mixamorig${name}`) as THREE.Bone;

describe('runtime character asset and ownership', () => {
	it('loads the real skinned asset with two draw primitives and independent poses/colours', () => {
		const a = new CharacterInstance(template, '#ff0000', () => {});
		const b = new CharacterInstance(template, '#0000ff', () => {});
		const meshes: THREE.SkinnedMesh[] = [];
		a.object.traverse((o) => {
			if (o instanceof THREE.SkinnedMesh) meshes.push(o);
		});
		expect(meshes).toHaveLength(2);
		expect(meshes.reduce((n, m) => n + m.geometry.index!.count / 3, 0)).toBe(5848);
		const before = bone(b, 'LeftUpLeg').quaternion.clone();
		for (let i = 0; i < 60; i++) {
			a.object.position.z = -i / 60;
			a.update(frame(-i / 60), 1 / 60, 4, () => 0);
		}
		expect(bone(a, 'LeftUpLeg')).not.toBe(bone(b, 'LeftUpLeg'));
		expect(bone(b, 'LeftUpLeg').quaternion.equals(before)).toBe(true);
		expect(bone(a, 'LeftUpLeg').quaternion.equals(before)).toBe(false);
		a.dispose();
		b.update(frame(), 1 / 60, 4, () => 0);
		expect(b.object.children.length).toBeGreaterThan(0);
		b.dispose();
	});
	it('keeps animated vertices inside fixed per-instance culling bounds', () => {
		const a = new CharacterInstance(template, '#ffffff', () => {});
		const b = new CharacterInstance(template, '#000000', () => {});
		const meshes: THREE.SkinnedMesh[] = [];
		a.object.traverse((o) => {
			if (o instanceof THREE.SkinnedMesh) meshes.push(o);
		});
		const other = b.object.getObjectByName(meshes[0].name) as THREE.SkinnedMesh;
		expect(meshes[0].boundingSphere).not.toBe(other.boundingSphere);
		const vertex = new THREE.Vector3();
		for (let step = 0; step < 24; step++) {
			const flags =
				step < 8
					? POSE_FLAGS.grounded
					: step < 16
						? POSE_FLAGS.grounded | POSE_FLAGS.running
						: POSE_FLAGS.flying;
			a.object.position.z = -step * 0.15;
			a.object.rotation.y = step * 0.1;
			a.update(
				{ ...frame(a.object.position.z, flags), yaw: step * 0.1, pitch: 0.6 },
				1 / 60,
				8,
				() => 0
			);
			a.object.updateMatrixWorld(true);
			for (const mesh of meshes) {
				expect(mesh.frustumCulled).toBe(true);
				for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
					mesh.getVertexPosition(i, vertex);
					expect(mesh.boundingSphere!.containsPoint(vertex)).toBe(true);
				}
			}
		}
		const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
		camera.position.z = 5;
		camera.updateMatrixWorld();
		const frustum = new THREE.Frustum().setFromProjectionMatrix(
			new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
		);
		expect(meshes.every((mesh) => frustum.intersectsObject(mesh))).toBe(true);
		a.object.position.x = 100;
		a.object.updateMatrixWorld(true);
		expect(meshes.some((mesh) => frustum.intersectsObject(mesh))).toBe(false);
		a.dispose();
		b.dispose();
	});

	it('keeps a planted ankle stationary and rejects an upstairs support surface', () => {
		const a = new CharacterInstance(template, '#ffffff', () => {});
		a.update(frame(), 1 / 60, 4, () => 0);
		const before = bone(a, 'LeftFoot').getWorldPosition(new THREE.Vector3());
		// Left foot is in stance for this short displacement.
		a.object.position.z = -0.03;
		a.update(frame(-0.03), 1 / 30, 4, () => 3);
		const after = bone(a, 'LeftFoot').getWorldPosition(new THREE.Vector3());
		expect(after.distanceTo(before)).toBeLessThan(0.02);
		a.dispose();
	});
	it('remains finite through teleports, hitches, airborne and flight states', () => {
		const a = new CharacterInstance(template, '#ffffff', () => {});
		for (const flags of [POSE_FLAGS.grounded, 0, POSE_FLAGS.flying, POSE_FLAGS.grounded]) {
			a.object.position.z -= 100;
			a.update({ ...frame(a.object.position.z, flags), discontinuity: 1 }, 2, 4, () => 500);
		}
		expect(
			bone(a, 'LeftFoot').getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite)
		).toBe(true);
		expect(a.object.userData.animation).toBe('idle');
		a.dispose();
	});
});

describe('analytic leg solver', () => {
	it('handles rotated parents and unreachable/coincident targets without changing bone lengths', () => {
		const root = new THREE.Group();
		root.rotation.set(0.2, 0.7, -0.3);
		const hip = new THREE.Bone(),
			knee = new THREE.Bone(),
			foot = new THREE.Bone();
		root.add(hip);
		hip.add(knee);
		knee.add(foot);
		knee.position.y = -1;
		foot.position.y = -1;
		const solver = new TwoBoneIK();
		for (const target of [
			new THREE.Vector3(0, -1.5, 0.2),
			new THREE.Vector3(0, -50, 0),
			new THREE.Vector3()
		]) {
			root.updateMatrixWorld(true);
			solver.solve(hip, knee, foot, target, new THREE.Vector3(0, 0, -1));
			expect(foot.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite)).toBe(
				true
			);
			expect(knee.position.length()).toBe(1);
			expect(foot.position.length()).toBe(1);
		}
	});
});
