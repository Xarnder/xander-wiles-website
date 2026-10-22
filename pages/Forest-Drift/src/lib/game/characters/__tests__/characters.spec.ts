import { createHash } from 'node:crypto';
import manifest from '../assets/character.manifest.json';
import { createInteraction } from '../../miniBuild/MiniBuildInteractions';
import { MINI_BUILD_LIMITS } from '../../miniBuild/MiniBuildTypes';
import { resolvePlayerInteractionPose } from '../../player/PlayerInteractionPoseResolver';
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
	it('was generated from the supplied V2 source', async () => {
		const source = await readFile(
			new URL(
				'../../../../../assets/Character Model/New Forest Drift Charachter V2.fbx',
				import.meta.url
			)
		);
		expect(manifest.sha256).toBe(createHash('sha256').update(source).digest('hex'));
	});
	it('breathes vertically despite the imported Z-up armature', () => {
		const c = new CharacterInstance(template, '#ffffff', () => {});
		const before = bone(c, 'Hips').getWorldPosition(new THREE.Vector3());
		for (let i = 0; i < 30; i++) c.update(frame(), 1 / 60, 4);
		const after = bone(c, 'Hips').getWorldPosition(new THREE.Vector3());
		expect(after.x).toBeCloseTo(before.x, 6);
		expect(after.z).toBeCloseTo(before.z, 6);
		expect(after.y - before.y).toBeCloseTo(Math.sin(0.5 * 1.8) * 0.004, 6);
		c.dispose();
	});
	it('loads the real skinned asset with two draw primitives and independent poses/colours', () => {
		const a = new CharacterInstance(template, '#ff0000', () => {});
		const b = new CharacterInstance(template, '#0000ff', () => {});
		const meshes: THREE.SkinnedMesh[] = [];
		a.object.traverse((o) => {
			if (o instanceof THREE.SkinnedMesh) meshes.push(o);
		});
		expect(meshes).toHaveLength(2);
		expect(meshes.reduce((n, m) => n + m.geometry.index!.count / 3, 0)).toBe(manifest.triangles);
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
	it.each([0, 1.5, 4])('keeps both arms away from the torso at speed %s', (speed) => {
		const c = new CharacterInstance(template, '#ffffff', () => {});
		const rest = ['Left', 'Right'].map((side) =>
			Math.abs(bone(c, `${side}Hand`).getWorldPosition(new THREE.Vector3()).x)
		);
		for (let i = 0; i < 90; i++) {
			c.object.position.z = (-i * speed) / 60;
			c.update(
				frame(c.object.position.z, POSE_FLAGS.grounded | (speed > 2 ? POSE_FLAGS.running : 0)),
				1 / 60,
				4,
				() => 0
			);
			for (const [index, side] of ['Left', 'Right'].entries()) {
				const hand = bone(c, `${side}Hand`).getWorldPosition(new THREE.Vector3());
				expect(Math.abs(hand.x)).toBeGreaterThan(rest[index] + 0.05);
			}
		}
		c.dispose();
	});

	it.each([-1, 1])(
		'turns the lower body toward sideways travel while looking forward (%s)',
		(side) => {
			const c = new CharacterInstance(template, '#ffffff', () => {});
			c.update(frame(), 1 / 60, 4);
			const head = bone(c, 'Head').getWorldQuaternion(new THREE.Quaternion());
			for (let i = 1; i <= 120; i++) {
				c.object.position.x = (side * i) / 60;
				c.update({ ...frame(), x: c.object.position.x }, 1 / 60, 4);
			}
			expect(c.animation.bodyYaw).toBeCloseTo((-side * Math.PI) / 2, 2);
			const headDelta = bone(c, 'Head')
				.getWorldQuaternion(new THREE.Quaternion())
				.multiply(head.invert());
			const look = new THREE.Vector3(0, 0, -1).applyQuaternion(headDelta);
			expect(look.x).toBeCloseTo(0, 2);
			expect(look.z).toBeCloseTo(-1, 2);
			expect(Math.abs(c.animation.headYaw)).toBeLessThan(1.1);
			c.dispose();
		}
	);

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
						? POSE_FLAGS.grounded | POSE_FLAGS.running | POSE_FLAGS.building
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
				let outsideBounds = 0;
				for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
					mesh.getVertexPosition(i, vertex);
					if (!mesh.boundingSphere!.containsPoint(vertex)) outsideBounds++;
				}
				expect(outsideBounds).toBe(0);
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

	it('aims the actual head in world axes and extends the building hand without turning the feet', () => {
		const c = new CharacterInstance(template, '#ffffff', () => {});
		c.update(frame(), 1 / 60, 4, () => 0);
		const head = bone(c, 'Head').getWorldQuaternion(new THREE.Quaternion());
		const hand = bone(c, 'RightHand').getWorldPosition(new THREE.Vector3());
		const foot = bone(c, 'LeftFoot').getWorldPosition(new THREE.Vector3());
		for (let i = 0; i < 60; i++)
			c.update(
				{ ...frame(), yaw: 0.4, pitch: 0.5, flags: POSE_FLAGS.grounded | POSE_FLAGS.building },
				1 / 60,
				4,
				() => 0
			);
		const delta = bone(c, 'Head')
			.getWorldQuaternion(new THREE.Quaternion())
			.multiply(head.invert());
		const look = new THREE.Vector3(0, 0, -1).applyQuaternion(delta);
		expect(Math.atan2(-look.x, -look.z)).toBeCloseTo(0.4, 2);
		expect(Math.asin(look.y)).toBeCloseTo(0.5, 2);
		expect(c.animation.bodyYaw).toBe(0);
		expect(bone(c, 'RightHand').getWorldPosition(new THREE.Vector3()).z).toBeLessThan(
			hand.z - 0.15
		);
		expect(bone(c, 'LeftFoot').getWorldPosition(new THREE.Vector3()).distanceTo(foot)).toBeLessThan(
			0.02
		);
		c.dispose();
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

describe('authored player poses on the real character skeleton', () => {
	it.each([0, Math.PI / 2, Math.PI, Math.PI * 1.5])(
		'seats the hips and bends both knees in the authored facing direction at %s',
		(yaw) => {
			const c = new CharacterInstance(template, '#ffffff', () => {});
			const root = new THREE.Group();
			root.rotation.y = yaw;
			root.add(c.object);
			const pose = resolvePlayerInteractionPose('sit', { x: 0, y: 0, z: 0 }, yaw);
			c.poseInteraction(pose);
			const hips = bone(c, 'Hips').getWorldPosition(new THREE.Vector3());
			expect(hips.y).toBeCloseTo(pose.pelvisSupportOffset);
			const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
			for (const side of ['Left', 'Right']) {
				const knee = bone(c, `${side}Leg`).getWorldPosition(new THREE.Vector3());
				const ankle = bone(c, `${side}Foot`).getWorldPosition(new THREE.Vector3());
				expect(knee.clone().sub(hips).dot(forward)).toBeGreaterThan(0.15);
				expect(ankle.y).toBeLessThan(knee.y - 0.15);
				const hand = bone(c, `${side}Hand`).getWorldPosition(new THREE.Vector3());
				const lap = new THREE.Vector3(side === 'Left' ? -0.13 : 0.13, 0.08, -0.23)
					.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
					.add(hips);
				expect(hand.distanceTo(lap)).toBeLessThan(0.08);
			}
			c.dispose();
		}
	);
	it.each(['sit', 'lie'] as const)(
		'fits the actual %s skinned body inside its generated occupancy box',
		(action) => {
			const c = new CharacterInstance(template, '#ffffff', () => {});
			const root = new THREE.Group();
			root.add(c.object);
			c.poseInteraction(resolvePlayerInteractionPose(action, { x: 0, y: 0, z: 0 }, 0));
			root.updateMatrixWorld(true);
			const bounds = new THREE.Box3().makeEmpty(),
				point = new THREE.Vector3();
			c.object.traverse((object) => {
				if (object instanceof THREE.SkinnedMesh)
					for (let i = 0; i < object.geometry.attributes.position.count; i++) {
						object.getVertexPosition(i, point);
						object.localToWorld(point);
						bounds.expandByPoint(point);
					}
			});
			const box = createInteraction(action, { x: 0, y: 0, z: 0 }).collider,
				g = MINI_BUILD_LIMITS.gridSize;
			for (const axis of ['x', 'y', 'z'] as const) {
				expect(bounds.min[axis], `${action} ${axis} lower`).toBeGreaterThanOrEqual(
					(box.centerOffsetGrid[axis] - box.sizeGrid[axis] / 2) * g - 0.015
				);
				expect(bounds.max[axis], `${action} ${axis} upper`).toBeLessThanOrEqual(
					(box.centerOffsetGrid[axis] + box.sizeGrid[axis] / 2) * g + 0.015
				);
			}
			c.dispose();
		}
	);

	it('lies face-up with the head along the authored -Z arrow', () => {
		const c = new CharacterInstance(template, '#ffffff', () => {});
		const root = new THREE.Group();
		root.add(c.object);
		const pose = resolvePlayerInteractionPose('lie', { x: 0, y: 0, z: 0 }, 0);
		c.poseInteraction(pose);
		const hips = bone(c, 'Hips').getWorldPosition(new THREE.Vector3()),
			head = bone(c, 'Head').getWorldPosition(new THREE.Vector3());
		expect(hips.y).toBeCloseTo(pose.pelvisSupportOffset);
		expect(head.z).toBeLessThan(hips.z - 0.4);
		expect(new THREE.Vector3(0, 0, -1).applyQuaternion(c.object.quaternion).y).toBeGreaterThan(
			0.99
		);
		c.dispose();
	});
});

it.each([-1, 1])('animates actual left/right stride under a moving player parent (%s)', (side) => {
	const c = new CharacterInstance(template, '#ffffff', () => {});
	const root = new THREE.Group();
	root.add(c.object);
	const heights: number[] = [];
	for (let i = 0; i < 180; i++) {
		root.position.x = (side * i * 3) / 60;
		c.object.rotation.set(0, 0, 0);
		c.update({ ...frame(), x: root.position.x }, 1 / 60, 0);
		if (i > 60) heights.push(bone(c, 'LeftFoot').getWorldPosition(new THREE.Vector3()).y);
	}
	expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.06);
	c.dispose();
});

it('continues alternating leg motion during a running jump without airborne running flags', () => {
	const c = new CharacterInstance(template, '#ffffff', () => {});
	for (let i = 0; i < 30; i++) {
		c.object.position.z = -i * 0.08;
		c.update(frame(c.object.position.z, POSE_FLAGS.grounded | POSE_FLAGS.running), 1 / 60, 4);
	}
	const left: number[] = [],
		right: number[] = [];
	const surface = () => {
		throw new Error('Airborne gait must not probe the ground');
	};
	for (let i = 0; i < 40; i++) {
		c.object.position.z -= 0.08;
		c.object.position.y = 0.5;
		c.update({ ...frame(c.object.position.z, 0), y: 0.5 }, 1 / 60, 4, surface);
		left.push(bone(c, 'LeftFoot').getWorldPosition(new THREE.Vector3()).y);
		right.push(bone(c, 'RightFoot').getWorldPosition(new THREE.Vector3()).y);
	}
	expect(Math.max(...left) - Math.min(...left)).toBeGreaterThan(0.06);
	expect(Math.max(...right) - Math.min(...right)).toBeGreaterThan(0.06);
	expect(left.some((y, i) => y > right[i] + 0.04)).toBe(true);
	expect(right.some((y, i) => y > left[i] + 0.04)).toBe(true);
	c.object.position.y = 0;
	for (let i = 0; i < 60; i++) c.update(frame(c.object.position.z), 1 / 60, 4, () => 0);
	expect(c.object.userData.animation).toBe('idle');
	c.dispose();
});
