import * as THREE from 'three';
import type { WallCollisionRect } from './wallCollision';

export interface CreatureColliderSource {
	x: number;
	y: number;
	z: number;
	radius: number;
	height: number;
}

export interface CollisionVisualizerSources {
	getWallRects: () => readonly WallCollisionRect[];
	getWallPathRects: () => readonly WallCollisionRect[];
	getStairRects: () => readonly WallCollisionRect[];
	getDoorRects: () => readonly WallCollisionRect[];
	getFurnitureRects: () => readonly WallCollisionRect[];
	getCreatureColliders?: () => readonly CreatureColliderSource[];
}

interface CategoryMaterial {
	solid: THREE.MeshBasicMaterial;
	wire: THREE.LineBasicMaterial;
}

/**
 * Visualizes all active collision objects in the world for debugging.
 * Note: Does not render the player's own collision capsule to avoid obstructing the camera.
 *
 * Distinct color-coding per category:
 * - Walls: Coral Red (#FF4444)
 * - Wall Paths / Polywalls: Amber Orange (#FF8800)
 * - Stairs: Golden Yellow (#FFCC00)
 * - Doors: Sky Cyan (#00D4FF)
 * - Furniture: Vivid Purple (#CC33FF)
 * - Creatures: Rose Pink (#FF4488)
 */
export class CollisionVisualizer {
	private readonly scene: THREE.Scene;
	private readonly sources: CollisionVisualizerSources;
	private readonly rootGroup = new THREE.Group();

	private readonly wallsGroup = new THREE.Group();
	private readonly wallPathsGroup = new THREE.Group();
	private readonly stairsGroup = new THREE.Group();
	private readonly doorsGroup = new THREE.Group();
	private readonly furnitureGroup = new THREE.Group();
	private readonly creaturesGroup = new THREE.Group();

	private enabled = false;
	private dirty = true;
	private lastCountHash = '';

	private readonly materials = {
		wall: this.createMaterialPair(0xff4444),
		wallPath: this.createMaterialPair(0xff8800),
		stair: this.createMaterialPair(0xffcc00),
		door: this.createMaterialPair(0x00d4ff),
		furniture: this.createMaterialPair(0xcc33ff),
		creature: this.createMaterialPair(0xff4488)
	};

	constructor(scene: THREE.Scene, sources: CollisionVisualizerSources) {
		this.scene = scene;
		this.sources = sources;

		this.rootGroup.name = 'collision-visualizer';
		this.rootGroup.visible = false;
		this.rootGroup.renderOrder = 9999;

		this.rootGroup.add(this.wallsGroup);
		this.rootGroup.add(this.wallPathsGroup);
		this.rootGroup.add(this.stairsGroup);
		this.rootGroup.add(this.doorsGroup);
		this.rootGroup.add(this.furnitureGroup);
		this.rootGroup.add(this.creaturesGroup);

		this.scene.add(this.rootGroup);
	}

	private createMaterialPair(color: number): CategoryMaterial {
		return {
			solid: new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 0.35,
				depthWrite: false,
				depthTest: true,
				polygonOffset: true,
				polygonOffsetFactor: -4,
				polygonOffsetUnits: -4,
				side: THREE.DoubleSide
			}),
			wire: new THREE.LineBasicMaterial({
				color,
				transparent: true,
				opacity: 0.95,
				depthWrite: false,
				depthTest: false
			})
		};
	}

	setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) return;
		this.enabled = enabled;
		this.rootGroup.visible = enabled;
		if (enabled) {
			this.dirty = true;
			this.rebuildAll();
			this.updateCreatures();
		}
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	markDirty(): void {
		this.dirty = true;
	}

	update(): void {
		if (!this.enabled) return;

		const wallCount = this.sources.getWallRects().length;
		const wallPathCount = this.sources.getWallPathRects().length;
		const stairCount = this.sources.getStairRects().length;
		const furnitureCount = this.sources.getFurnitureRects().length;
		const currentHash = `${wallCount}:${wallPathCount}:${stairCount}:${furnitureCount}`;
		if (this.lastCountHash !== currentHash) {
			this.lastCountHash = currentHash;
			this.dirty = true;
		}

		if (this.dirty) {
			this.rebuildAll();
			this.dirty = false;
		} else {
			// Doors can swing dynamically; refresh door colliders
			this.rebuildRectGroup(this.doorsGroup, this.sources.getDoorRects(), this.materials.door);
		}

		this.updateCreatures();
	}

	private rebuildAll(): void {
		this.rebuildRectGroup(this.wallsGroup, this.sources.getWallRects(), this.materials.wall);
		this.rebuildRectGroup(
			this.wallPathsGroup,
			this.sources.getWallPathRects(),
			this.materials.wallPath
		);
		this.rebuildRectGroup(this.stairsGroup, this.sources.getStairRects(), this.materials.stair);
		this.rebuildRectGroup(this.doorsGroup, this.sources.getDoorRects(), this.materials.door);
		this.rebuildRectGroup(
			this.furnitureGroup,
			this.sources.getFurnitureRects(),
			this.materials.furniture
		);
	}

	private rebuildRectGroup(
		group: THREE.Group,
		rects: readonly WallCollisionRect[],
		materials: CategoryMaterial
	): void {
		this.disposeGroupGeometries(group);
		group.clear();

		for (const rect of rects) {
			const length = Math.max(0.01, rect.halfLength * 2);
			const thickness = Math.max(0.01, rect.halfThickness * 2);
			const height = Math.max(0.01, rect.maxWorldY - rect.minWorldY);

			const boxGeom = new THREE.BoxGeometry(length, height, thickness);
			const edgesGeom = new THREE.EdgesGeometry(boxGeom);

			const solidMesh = new THREE.Mesh(boxGeom, materials.solid);
			solidMesh.renderOrder = 9998;
			const lineMesh = new THREE.LineSegments(edgesGeom, materials.wire);
			lineMesh.renderOrder = 9999;

			const itemGroup = new THREE.Group();
			itemGroup.renderOrder = 9999;
			itemGroup.add(solidMesh);
			itemGroup.add(lineMesh);

			// WallCollisionRect orientation:
			// Length axis along (dirX, 0, dirZ)
			// Thickness axis along (-dirZ, 0, dirX)
			// Rotation angle around Y is atan2(-dirZ, dirX)
			const heading = Math.atan2(-rect.dirZ, rect.dirX);
			itemGroup.position.set(rect.centerX, (rect.minWorldY + rect.maxWorldY) / 2, rect.centerZ);
			itemGroup.rotation.set(0, heading, 0);

			group.add(itemGroup);
		}
	}

	private updateCreatures(): void {
		const creatures = this.sources.getCreatureColliders?.() ?? [];
		if (creatures.length === 0) {
			this.disposeGroupGeometries(this.creaturesGroup);
			this.creaturesGroup.clear();
			return;
		}

		this.disposeGroupGeometries(this.creaturesGroup);
		this.creaturesGroup.clear();

		for (const creature of creatures) {
			const height = Math.max(0.1, creature.height);
			const radius = Math.max(0.05, creature.radius);

			const cylinderGeom = new THREE.CylinderGeometry(radius, radius, height, 16);
			const edgesGeom = new THREE.EdgesGeometry(cylinderGeom);

			const solidMesh = new THREE.Mesh(cylinderGeom, this.materials.creature.solid);
			solidMesh.renderOrder = 9998;
			const lineMesh = new THREE.LineSegments(edgesGeom, this.materials.creature.wire);
			lineMesh.renderOrder = 9999;

			const group = new THREE.Group();
			group.renderOrder = 9999;
			group.add(solidMesh);
			group.add(lineMesh);
			group.position.set(creature.x, creature.y + height / 2, creature.z);

			this.creaturesGroup.add(group);
		}
	}

	private disposeGroupGeometries(group: THREE.Group): void {
		group.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
				obj.geometry.dispose();
			}
		});
	}

	dispose(): void {
		this.setEnabled(false);
		this.disposeGroupGeometries(this.rootGroup);
		this.rootGroup.clear();
		this.scene.remove(this.rootGroup);

		for (const mat of Object.values(this.materials)) {
			mat.solid.dispose();
			mat.wire.dispose();
		}
	}
}
