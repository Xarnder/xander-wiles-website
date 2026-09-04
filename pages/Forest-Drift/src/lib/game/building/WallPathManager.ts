import * as THREE from 'three';
import { foundationLocalFrame } from './FoundationLocalMath';
import type { FoundationDefinition } from './FoundationTypes';
import type { WallCollisionRect } from './wallCollision';
import { computeWallTransform } from './wallGeometryMath';
import { buildWallPath } from './WallPathGeometryBuilder';
import type { WallPathDefinition, WallPathSegmentDefinition } from './WallPathTypes';
import type { WallDefinition } from './WallTypes';

const wallMaterial = new THREE.MeshStandardMaterial({
	color: 0xcfc6b3,
	roughness: 0.88,
	metalness: 0.02
});

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0x7fe0ff });

export interface SegmentJoinReach {
	startJoinReach: number;
	endJoinReach: number;
}

interface PathEntry {
	definition: WallPathDefinition;
	visibleMesh: THREE.Mesh;
	pickingMeshes: Map<string, THREE.Mesh>; // segmentId -> invisible raycast target
	collisionRects: WallCollisionRect[];
	boundsHelper: THREE.LineSegments | null;
	/** segmentId -> how far that segment's start/end join actually reaches into it — computed once per rebuild by buildWallPath, cached here rather than recomputed by every getSegmentJoinInfo call. */
	joinReach: Map<string, SegmentJoinReach>;
}

export interface WallPathManagerOptions {
	getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
}

/**
 * Owns every placed wall path's merged visible mesh, per-segment invisible picking meshes, and
 * derived collision rects — the "Continuous/Polygon Wall" counterpart to WallManager, kept as a
 * separate parallel manager (not merged into WallManager) so the existing standalone-wall system
 * stays completely untouched. Each foundation gets its own BuildingRoot group here too, positioned
 * at the same foundation-local origin WallManager's BuildingRoots use — the two managers' roots are
 * independent objects, which is fine, since both just need to sit at the same world position.
 */
export class WallPathManager {
	readonly group = new THREE.Group();

	private readonly getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	private readonly getVertexSpacing: () => number;
	private readonly getBuildingGridSize: () => number;

	private readonly buildingRoots = new Map<string, THREE.Group>();
	private readonly paths = new Map<string, PathEntry>();
	/** segmentId -> owning path id, so a raycast hit's segmentId resolves back to its path in O(1). */
	private readonly segmentToPath = new Map<string, string>();
	private showBounds = false;

	constructor(options: WallPathManagerOptions) {
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

	private rebuildEntry(definition: WallPathDefinition, existing?: PathEntry): PathEntry | null {
		const foundation = this.getFoundation(definition.foundationId);
		const buildingRoot = this.getOrCreateBuildingRoot(definition.foundationId);
		if (!foundation || !buildingRoot) return null;

		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		const buildingGridSize = this.getBuildingGridSize();
		const result = buildWallPath(definition, frame, buildingGridSize);

		let visibleMesh = existing?.visibleMesh;
		if (visibleMesh) {
			visibleMesh.geometry.dispose();
			visibleMesh.geometry = result.visibleGeometry;
		} else {
			visibleMesh = new THREE.Mesh(result.visibleGeometry, wallMaterial);
			visibleMesh.userData.foundationId = definition.foundationId;
			visibleMesh.userData.wallPathId = definition.id;
			buildingRoot.add(visibleMesh);
		}

		const pickingMeshes = new Map<string, THREE.Mesh>();
		const collisionRects: WallCollisionRect[] = [];
		const joinReach = new Map<string, SegmentJoinReach>();
		for (const segment of result.segments) {
			const existingMesh = existing?.pickingMeshes.get(segment.segmentId);
			const geometry = new THREE.BoxGeometry(
				segment.length,
				definition.wallHeight,
				definition.wallThickness
			);
			geometry.translate(segment.length / 2, definition.wallHeight / 2, 0);

			let pickingMesh = existingMesh;
			if (pickingMesh) {
				pickingMesh.geometry.dispose();
				pickingMesh.geometry = geometry;
			} else {
				pickingMesh = new THREE.Mesh(geometry, wallMaterial);
				pickingMesh.visible = false;
				pickingMesh.userData.foundationId = definition.foundationId;
				pickingMesh.userData.wallPathId = definition.id;
				pickingMesh.userData.wallId = segment.segmentId;
				buildingRoot.add(pickingMesh);
			}
			pickingMesh.position.set(segment.localX, 0, segment.localZ);
			pickingMesh.rotation.set(0, -segment.headingRadians, 0);
			pickingMeshes.set(segment.segmentId, pickingMesh);
			this.segmentToPath.set(segment.segmentId, definition.id);
			collisionRects.push(...segment.collisionRects);
			joinReach.set(segment.segmentId, {
				startJoinReach: segment.startJoinReach,
				endJoinReach: segment.endJoinReach
			});
		}

		// Drop picking meshes for segments that no longer exist (shouldn't normally happen — paths
		// aren't edited after creation yet — but keeps rebuildEntry safe to call unconditionally).
		if (existing) {
			for (const [segmentId, mesh] of existing.pickingMeshes) {
				if (!pickingMeshes.has(segmentId)) {
					mesh.geometry.dispose();
					mesh.removeFromParent();
					this.segmentToPath.delete(segmentId);
				}
			}
		}

		const entry: PathEntry = {
			definition,
			visibleMesh,
			pickingMeshes,
			collisionRects,
			boundsHelper: existing?.boundsHelper ?? null,
			joinReach
		};
		this.refreshBoundsHelper(entry);
		return entry;
	}

	addPath(definition: WallPathDefinition): void {
		const entry = this.rebuildEntry(definition);
		if (entry) this.paths.set(definition.id, entry);
	}

	/** Call after mutating a WallPathSegmentDefinition's openings (e.g. from BuildingManager) — rebuilds the whole path's merged geometry, per the "acceptable to rebuild the whole path, never unrelated buildings" rule. */
	rebuildPath(pathId: string): void {
		const existing = this.paths.get(pathId);
		if (!existing) return;
		const rebuilt = this.rebuildEntry(existing.definition, existing);
		if (rebuilt) this.paths.set(pathId, rebuilt);
	}

	removePath(pathId: string): boolean {
		const entry = this.paths.get(pathId);
		if (!entry) return false;
		entry.visibleMesh.geometry.dispose();
		entry.visibleMesh.removeFromParent();
		entry.boundsHelper?.geometry.dispose();
		for (const [segmentId, mesh] of entry.pickingMeshes) {
			mesh.geometry.dispose();
			mesh.removeFromParent();
			this.segmentToPath.delete(segmentId);
		}
		this.paths.delete(pathId);
		return true;
	}

	removePathsForFoundation(foundationId: string): void {
		for (const [pathId, entry] of this.paths) {
			if (entry.definition.foundationId === foundationId) this.removePath(pathId);
		}
		const root = this.buildingRoots.get(foundationId);
		if (root) {
			this.group.remove(root);
			this.buildingRoots.delete(foundationId);
		}
	}

	getPath(pathId: string): WallPathDefinition | undefined {
		return this.paths.get(pathId)?.definition;
	}

	getPathsForFoundation(foundationId: string): WallPathDefinition[] {
		return Array.from(this.paths.values(), (entry) => entry.definition).filter(
			(path) => path.foundationId === foundationId
		);
	}

	getAllPaths(): WallPathDefinition[] {
		return Array.from(this.paths.values(), (entry) => entry.definition);
	}

	/** Finds which path+segment owns a given segment id — the raycast-resolution entry point Window/Door tools use. */
	findSegment(
		segmentId: string
	): { path: WallPathDefinition; segment: WallPathSegmentDefinition } | undefined {
		const pathId = this.segmentToPath.get(segmentId);
		if (!pathId) return undefined;
		const path = this.paths.get(pathId)?.definition;
		const segment = path?.segments.find((s) => s.id === segmentId);
		return path && segment ? { path, segment } : undefined;
	}

	/**
	 * Synthesizes a WallDefinition-shaped view of one path segment — a segment behaves exactly like
	 * a standalone wall for every purpose except how its visible geometry joins its neighbours, so
	 * OpeningToolBase/BuildingManager can treat both uniformly without knowing paths exist. The two
	 * grid points come straight from the owning path (wrapping for the closing segment).
	 */
	getSegmentAsWallView(segmentId: string): WallDefinition | undefined {
		const found = this.findSegment(segmentId);
		if (!found) return undefined;
		const { path, segment } = found;
		const index = path.segments.findIndex((s) => s.id === segmentId);
		const start = path.points[index];
		const end = path.points[(index + 1) % path.points.length];
		return {
			id: segment.id,
			foundationId: path.foundationId,
			startGridX: start.gridX,
			startGridZ: start.gridZ,
			endGridX: end.gridX,
			endGridZ: end.gridZ,
			baseY: path.baseY,
			height: path.wallHeight,
			thickness: path.wallThickness,
			openings: segment.openings
		};
	}

	/**
	 * How far a segment's start/end join actually reaches into it — 0 means that end is a bare,
	 * unjoined open-path endpoint. Computed once by buildWallPath alongside the geometry itself
	 * (see WallPathGeometryBuilder's doc comment for why this must be the join's *true* geometric
	 * extent, not a fixed guess) and cached here; BuildingManager combines it with the configured
	 * `cornerOpeningMargin` to get the actual minimum clearance an opening must keep. Returns
	 * undefined for a non-path-segment id (a standalone wall, or an unknown id).
	 */
	getSegmentJoinInfo(segmentId: string): SegmentJoinReach | undefined {
		const pathId = this.segmentToPath.get(segmentId);
		if (!pathId) return undefined;
		return this.paths.get(pathId)?.joinReach.get(segmentId);
	}

	/** A path segment's world transform — reuses wallGeometryMath's standalone-wall transform math directly, since a segment's two endpoints work exactly the same way. */
	getSegmentTransform(segmentId: string) {
		const view = this.getSegmentAsWallView(segmentId);
		const found = this.findSegment(segmentId);
		if (!view || !found) return undefined;
		const foundation = this.getFoundation(found.path.foundationId);
		if (!foundation) return undefined;
		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		return computeWallTransform(view, frame, this.getBuildingGridSize(), view.baseY);
	}

	/** Every path's picking meshes, for tool raycasting — merged with WallManager's standalone wall meshes by the caller. */
	getPickingMeshesForRaycast(): THREE.Object3D[] {
		const meshes: THREE.Object3D[] = [];
		for (const entry of this.paths.values()) meshes.push(...entry.pickingMeshes.values());
		return meshes;
	}

	getAllCollisionRects(): WallCollisionRect[] {
		const rects: WallCollisionRect[] = [];
		for (const entry of this.paths.values()) rects.push(...entry.collisionRects);
		return rects;
	}

	setShowBounds(visible: boolean): void {
		this.showBounds = visible;
		for (const entry of this.paths.values()) this.refreshBoundsHelper(entry);
	}

	private refreshBoundsHelper(entry: PathEntry): void {
		entry.boundsHelper?.geometry.dispose();
		if (entry.boundsHelper) entry.visibleMesh.remove(entry.boundsHelper);
		entry.boundsHelper = null;
		if (!this.showBounds) return;
		const edges = new THREE.EdgesGeometry(entry.visibleMesh.geometry);
		entry.boundsHelper = new THREE.LineSegments(edges, boundsMaterial);
		entry.visibleMesh.add(entry.boundsHelper);
	}

	dispose(): void {
		for (const pathId of Array.from(this.paths.keys())) this.removePath(pathId);
		this.buildingRoots.clear();
		this.group.clear();
	}
}
