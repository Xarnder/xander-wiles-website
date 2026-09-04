import * as THREE from 'three';
import { foundationLocalFrame } from './FoundationLocalMath';
import type { FoundationDefinition } from './FoundationTypes';
import type { WallCollisionRect } from './wallCollision';
import {
	applyWallTransform,
	buildWallCollisionRects,
	buildWallGeometry
} from './WallGeometryBuilder';
import { computeSolidWallSegments, computeWallTransform } from './wallGeometryMath';
import type { WallTransform } from './wallGeometryMath';
import type { WallDefinition } from './WallTypes';

const wallMaterial = new THREE.MeshStandardMaterial({
	color: 0xcfc6b3,
	roughness: 0.88,
	metalness: 0.02
});

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0x7fe0ff });

interface WallEntry {
	definition: WallDefinition;
	mesh: THREE.Mesh;
	collisionRects: WallCollisionRect[];
	boundsHelper: THREE.LineSegments | null;
}

export interface WallManagerOptions {
	getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
}

/**
 * Owns every placed wall's Three.js mesh + derived collision rects, grouped one "BuildingRoot" per
 * foundation — positioned at that foundation's world origin (see FoundationLocalMath), with every
 * wall mesh a child positioned in foundation-LOCAL coordinates. This directly represents the
 * architecture: if a foundation's world position ever changed, every attached wall would move with
 * it for free via the scene graph, without touching a single WallDefinition (see the README).
 *
 * Mirrors FoundationManager's shape (a Map + a THREE.Group), added alongside it as its own
 * top-level scene child rather than nested inside FoundationManager/FoundationMesh — the terrain's
 * foundation system stays completely untouched.
 */
export class WallManager {
	readonly group = new THREE.Group();

	private readonly getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	private readonly getVertexSpacing: () => number;
	private readonly getBuildingGridSize: () => number;

	private readonly buildingRoots = new Map<string, THREE.Group>();
	private readonly walls = new Map<string, WallEntry>();
	private showBounds = false;

	constructor(options: WallManagerOptions) {
		this.getFoundation = options.getFoundation;
		this.getVertexSpacing = options.getVertexSpacing;
		this.getBuildingGridSize = options.getBuildingGridSize;
	}

	private getOrCreateBuildingRoot(foundationId: string): THREE.Group | null {
		const existing = this.buildingRoots.get(foundationId);
		if (existing) return existing;

		const foundation = this.getFoundation(foundationId);
		if (!foundation) return null;

		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		const root = new THREE.Group();
		root.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		root.userData.foundationId = foundationId;
		this.group.add(root);
		this.buildingRoots.set(foundationId, root);
		return root;
	}

	/** Rebuilds one wall's mesh + collision rects from its current definition — the only path geometry is ever produced through, whether adding a wall, adding an opening, or removing one. */
	private rebuildEntry(definition: WallDefinition, existing?: WallEntry): WallEntry | null {
		const foundation = this.getFoundation(definition.foundationId);
		const buildingRoot = this.getOrCreateBuildingRoot(definition.foundationId);
		if (!foundation || !buildingRoot) return null;

		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		const transform = computeWallTransform(definition, frame, this.getBuildingGridSize());
		const segments = computeSolidWallSegments(
			transform.length,
			definition.height,
			definition.openings
		);
		const geometry = buildWallGeometry(segments, definition.thickness);
		const collisionRects = buildWallCollisionRects(segments, definition.thickness, transform);

		let mesh = existing?.mesh;
		if (mesh) {
			mesh.geometry.dispose();
			mesh.geometry = geometry;
		} else {
			mesh = new THREE.Mesh(geometry, wallMaterial);
			mesh.userData.foundationId = definition.foundationId;
			mesh.userData.wallId = definition.id;
			buildingRoot.add(mesh);
		}

		// Wall meshes are children of buildingRoot, which already carries the foundation's world
		// origin — so the mesh's own position/rotation only needs to be relative to that origin.
		applyWallTransform(
			mesh,
			transform.originWorldX - frame.originWorldX,
			transform.originWorldY - frame.originWorldY,
			transform.originWorldZ - frame.originWorldZ,
			transform.headingRadians
		);

		const entry: WallEntry = {
			definition,
			mesh,
			collisionRects,
			boundsHelper: existing?.boundsHelper ?? null
		};
		this.refreshBoundsHelper(entry);
		return entry;
	}

	addWall(definition: WallDefinition): void {
		const entry = this.rebuildEntry(definition);
		if (entry) this.walls.set(definition.id, entry);
	}

	/** Call after mutating a WallDefinition already owned by this manager (e.g. BuildingManager adding an opening) to regenerate just that wall's mesh + collision. */
	rebuildWall(wallId: string): void {
		const existing = this.walls.get(wallId);
		if (!existing) return;
		const rebuilt = this.rebuildEntry(existing.definition, existing);
		if (rebuilt) this.walls.set(wallId, rebuilt);
	}

	removeWall(wallId: string): boolean {
		const entry = this.walls.get(wallId);
		if (!entry) return false;
		entry.mesh.geometry.dispose();
		entry.mesh.removeFromParent();
		entry.boundsHelper?.geometry.dispose();
		this.walls.delete(wallId);
		return true;
	}

	/** Cascade delete: removes every wall belonging to a foundation, and that foundation's now-empty BuildingRoot. */
	removeWallsForFoundation(foundationId: string): void {
		for (const [wallId, entry] of this.walls) {
			if (entry.definition.foundationId === foundationId) this.removeWall(wallId);
		}
		const root = this.buildingRoots.get(foundationId);
		if (root) {
			this.group.remove(root);
			this.buildingRoots.delete(foundationId);
		}
	}

	getWall(wallId: string): WallDefinition | undefined {
		return this.walls.get(wallId)?.definition;
	}

	getWallsForFoundation(foundationId: string): WallDefinition[] {
		return Array.from(this.walls.values(), (entry) => entry.definition).filter(
			(wall) => wall.foundationId === foundationId
		);
	}

	getAllWalls(): WallDefinition[] {
		return Array.from(this.walls.values(), (entry) => entry.definition);
	}

	/** Every wall mesh, for tool raycasting (Window/Door target walls, never terrain) — see BuildToolManager's per-tool raycast targets. */
	getWallMeshesForRaycast(): THREE.Object3D[] {
		return Array.from(this.walls.values(), (entry) => entry.mesh);
	}

	getMeshForWall(wallId: string): THREE.Mesh | undefined {
		return this.walls.get(wallId)?.mesh;
	}

	/** Recomputes the given wall's world-space transform on demand — used by Window/Door tools to convert a raycast hit into wall-local (U, Y) coordinates. */
	getWallTransform(wallId: string): WallTransform | undefined {
		const entry = this.walls.get(wallId);
		if (!entry) return undefined;
		const foundation = this.getFoundation(entry.definition.foundationId);
		if (!foundation) return undefined;
		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		return computeWallTransform(entry.definition, frame, this.getBuildingGridSize());
	}

	/**
	 * Every solid wall segment's collision rect, across every wall. A flat scan is fine at this
	 * prototype's expected wall counts — same acceptable simplification FoundationManager.getTopYAt
	 * already documents; a spatial index would slot in behind this unchanged if wall counts grow.
	 */
	getAllCollisionRects(): WallCollisionRect[] {
		const rects: WallCollisionRect[] = [];
		for (const entry of this.walls.values()) rects.push(...entry.collisionRects);
		return rects;
	}

	setShowBounds(visible: boolean): void {
		this.showBounds = visible;
		for (const entry of this.walls.values()) this.refreshBoundsHelper(entry);
	}

	private refreshBoundsHelper(entry: WallEntry): void {
		if (!this.showBounds) {
			entry.boundsHelper?.geometry.dispose();
			if (entry.boundsHelper) {
				entry.mesh.remove(entry.boundsHelper);
				entry.boundsHelper = null;
			}
			return;
		}
		entry.boundsHelper?.geometry.dispose();
		if (entry.boundsHelper) entry.mesh.remove(entry.boundsHelper);
		const edges = new THREE.EdgesGeometry(entry.mesh.geometry);
		entry.boundsHelper = new THREE.LineSegments(edges, boundsMaterial);
		entry.mesh.add(entry.boundsHelper);
	}

	dispose(): void {
		for (const wallId of Array.from(this.walls.keys())) this.removeWall(wallId);
		this.buildingRoots.clear();
		this.group.clear();
	}
}
