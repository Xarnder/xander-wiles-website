import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
	CollisionVisualizer,
	type CollisionVisualizerSources,
	type CreatureColliderSource
} from '../CollisionVisualizer';
import type { WallCollisionRect } from '../wallCollision';

function makeRect(overrides: Partial<WallCollisionRect> = {}): WallCollisionRect {
	return {
		centerX: 2,
		centerZ: 5,
		halfLength: 1.5,
		halfThickness: 0.1,
		dirX: 1,
		dirZ: 0,
		minWorldY: 0,
		maxWorldY: 3,
		...overrides
	};
}

describe('CollisionVisualizer', () => {
	let scene: THREE.Scene;
	let wallRects: WallCollisionRect[];
	let wallPathRects: WallCollisionRect[];
	let stairRects: WallCollisionRect[];
	let doorRects: WallCollisionRect[];
	let furnitureRects: WallCollisionRect[];
	let creatureColliders: CreatureColliderSource[];
	let sources: CollisionVisualizerSources;
	let visualizer: CollisionVisualizer;

	beforeEach(() => {
		scene = new THREE.Scene();
		wallRects = [];
		wallPathRects = [];
		stairRects = [];
		doorRects = [];
		furnitureRects = [];
		creatureColliders = [];

		sources = {
			getWallRects: () => wallRects,
			getWallPathRects: () => wallPathRects,
			getStairRects: () => stairRects,
			getDoorRects: () => doorRects,
			getFurnitureRects: () => furnitureRects,
			getCreatureColliders: () => creatureColliders
		};

		visualizer = new CollisionVisualizer(scene, sources);
	});

	afterEach(() => {
		visualizer.dispose();
	});

	it('initializes with visualizer hidden and disabled', () => {
		expect(visualizer.isEnabled()).toBe(false);
		const root = scene.getObjectByName('collision-visualizer');
		expect(root).toBeDefined();
		expect(root?.visible).toBe(false);
	});

	it('toggling enabled shows the root group and builds meshes without player obstruction', () => {
		wallRects.push(makeRect());
		furnitureRects.push(
			makeRect({
				centerX: 4,
				centerZ: -2,
				halfLength: 0.5,
				halfThickness: 0.4,
				minWorldY: 1,
				maxWorldY: 2
			})
		);

		visualizer.setEnabled(true);
		expect(visualizer.isEnabled()).toBe(true);

		const root = scene.getObjectByName('collision-visualizer') as THREE.Group;
		expect(root.visible).toBe(true);

		// 6 groups inside rootGroup (walls, wallPaths, stairs, doors, furniture, creatures) — no player group to obstruct camera
		expect(root.children).toHaveLength(6);

		const wallsGroup = root.children[0] as THREE.Group;
		expect(wallsGroup.children).toHaveLength(1);

		const wallMeshGroup = wallsGroup.children[0] as THREE.Group;
		expect(wallMeshGroup.position.x).toBeCloseTo(2);
		expect(wallMeshGroup.position.y).toBeCloseTo(1.5); // (0 + 3) / 2
		expect(wallMeshGroup.position.z).toBeCloseTo(5);

		const furnitureGroup = root.children[4] as THREE.Group;
		expect(furnitureGroup.children).toHaveLength(1);
		const furnMeshGroup = furnitureGroup.children[0] as THREE.Group;
		expect(furnMeshGroup.position.x).toBeCloseTo(4);
		expect(furnMeshGroup.position.y).toBeCloseTo(1.5); // (1 + 2) / 2
		expect(furnMeshGroup.position.z).toBeCloseTo(-2);
	});

	it('handles rotated collision rects correctly', () => {
		// Wall along Z (dirX = 0, dirZ = 1)
		wallRects.push(
			makeRect({
				centerX: 10,
				centerZ: 10,
				dirX: 0,
				dirZ: 1
			})
		);

		visualizer.setEnabled(true);
		const root = scene.getObjectByName('collision-visualizer') as THREE.Group;
		const wallsGroup = root.children[0] as THREE.Group;
		const itemGroup = wallsGroup.children[0] as THREE.Group;

		// Heading for dirX=0, dirZ=1 is atan2(-1, 0) = -PI / 2
		expect(itemGroup.rotation.y).toBeCloseTo(-Math.PI / 2);
	});

	it('does not create any player collision meshes to avoid covering camera', () => {
		visualizer.setEnabled(true);
		const root = scene.getObjectByName('collision-visualizer') as THREE.Group;

		// Confirm none of the groups represent a player collision model
		let hasPlayer = false;
		root.traverse((obj) => {
			if (obj.name === 'player-collider') hasPlayer = true;
		});
		expect(hasPlayer).toBe(false);
	});

	it('detects changes in object counts and triggers rebuild', () => {
		visualizer.setEnabled(true);
		const root = scene.getObjectByName('collision-visualizer') as THREE.Group;
		const wallsGroup = root.children[0] as THREE.Group;
		expect(wallsGroup.children).toHaveLength(0);

		// Add 2 walls
		wallRects.push(makeRect({ centerX: 1 }));
		wallRects.push(makeRect({ centerX: 2 }));

		visualizer.update();
		expect(wallsGroup.children).toHaveLength(2);
	});

	it('rebuilds creatures when creature colliders are present', () => {
		creatureColliders.push({
			x: 5,
			y: 0,
			z: 3,
			radius: 0.6,
			height: 1.2
		});

		visualizer.setEnabled(true);
		const root = scene.getObjectByName('collision-visualizer') as THREE.Group;
		const creaturesGroup = root.children[5] as THREE.Group;
		expect(creaturesGroup.children).toHaveLength(1);

		const creatureMeshGroup = creaturesGroup.children[0] as THREE.Group;
		expect(creatureMeshGroup.position.x).toBeCloseTo(5);
		expect(creatureMeshGroup.position.y).toBeCloseTo(0.6); // 0 + 1.2 / 2
		expect(creatureMeshGroup.position.z).toBeCloseTo(3);
	});

	it('cleans up all resources on dispose', () => {
		wallRects.push(makeRect());
		visualizer.setEnabled(true);

		visualizer.dispose();
		expect(scene.getObjectByName('collision-visualizer')).toBeUndefined();
		expect(visualizer.isEnabled()).toBe(false);
	});
});
