import * as THREE from 'three';
import { BuildingMaterialManager } from './BuildingMaterialManager';
import { foundationLocalFrame } from './FoundationLocalMath';
import type { BuildingSettings } from './FoundationTypes';
import { createDefaultBuildingSettings } from './FoundationTypes';
import type { FoundationDefinition } from './FoundationTypes';
import { buildOpeningVisual, disposeOpeningVisual, getGlassMaterial } from './OpeningVisualBuilder';
import type { WallCollisionRect } from './wallCollision';
import {
	applyWallTransform,
	buildWallCollisionRects,
	buildWallGeometry
} from './WallGeometryBuilder';
import { computeSolidWallSegments, computeWallTransform } from './wallGeometryMath';
import type { WallTransform } from './wallGeometryMath';
import type { WallDefinition } from './WallTypes';

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0x7fe0ff });

interface WallEntry {
	definition: WallDefinition;
	mesh: THREE.Mesh;
	collisionRects: WallCollisionRect[];
	boundsHelper: THREE.LineSegments | null;
	/** Child of `mesh`, positioned/oriented for free by inheriting its parent's transform — holds one procedural window/door visual per opening (see OpeningVisualBuilder.ts). Rebuilt from scratch alongside the wall's own geometry, never incrementally patched, same convention as everything else here. */
	openingVisuals: THREE.Group;
}

export interface WallManagerOptions {
	getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
	/** Optional — see FoundationManager's constructor doc comment for why tests can omit this and ThreeScene never does. */
	materialManager?: BuildingMaterialManager;
	/** Live settings this manager reads at every rebuild for procedural opening-visual sizing — optional, defaulting to `createDefaultBuildingSettings()`, so existing test call sites that construct this manager without one keep compiling. */
	buildingSettings?: BuildingSettings;
	/** The one shared window-glass material — optional, defaulting to `getGlassMaterial()`'s own lazily-created singleton. */
	glassMaterial?: THREE.Material;
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
	private readonly materialManager: BuildingMaterialManager;
	private readonly buildingSettings: BuildingSettings;
	private readonly glassMaterial: THREE.Material;

	private readonly buildingRoots = new Map<string, THREE.Group>();
	private readonly walls = new Map<string, WallEntry>();
	/** openingId -> its door's hingePivot — `DoorInteractionController` reads this to swing leaves. */
	private readonly doorHingePivots = new Map<string, THREE.Object3D>();
	private showBounds = false;

	constructor(options: WallManagerOptions) {
		this.getFoundation = options.getFoundation;
		this.getVertexSpacing = options.getVertexSpacing;
		this.getBuildingGridSize = options.getBuildingGridSize;
		this.materialManager = options.materialManager ?? new BuildingMaterialManager();
		this.buildingSettings = options.buildingSettings ?? createDefaultBuildingSettings();
		this.glassMaterial = options.glassMaterial ?? getGlassMaterial();
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
		const transform = computeWallTransform(
			definition,
			frame,
			this.getBuildingGridSize(),
			definition.baseY
		);
		const segments = computeSolidWallSegments(
			transform.length,
			definition.height,
			definition.openings
		);
		const geometry = buildWallGeometry(segments, definition.thickness);
		const collisionRects = buildWallCollisionRects(segments, definition.thickness, transform);

		const material = this.materialManager.getMaterial('wall', definition.material);
		let mesh = existing?.mesh;
		if (mesh) {
			mesh.geometry.dispose();
			mesh.geometry = geometry;
			mesh.material = material;
		} else {
			mesh = new THREE.Mesh(geometry, material);
			mesh.userData.foundationId = definition.foundationId;
			mesh.userData.wallId = definition.id;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
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

		const openingVisuals = this.rebuildOpeningVisuals(definition, mesh, existing?.openingVisuals);

		const entry: WallEntry = {
			definition,
			mesh,
			collisionRects,
			boundsHelper: existing?.boundsHelper ?? null,
			openingVisuals
		};
		this.refreshBoundsHelper(entry);
		return entry;
	}

	/**
	 * Rebuilds every procedural window/door visual for one wall from scratch, exactly like its own
	 * solid geometry is rebuilt above — never incrementally patched, so an opening that resized or
	 * disappeared can never leave a stale frame/glass/leaf behind. Parented as a CHILD of the wall's
	 * own `mesh` (always `visible = true`, unlike the invisible picking meshes elsewhere in this
	 * codebase), which is what lets every child below be positioned in the SAME absolute wall-local
	 * (U, Y, thickness) coordinates `WallOpeningDefinition` itself already uses — `mesh`'s own
	 * `applyWallTransform` call already carries the wall's position/heading, so nothing here has to
	 * re-derive it. Never added to `getWallMeshesForRaycast()` (or any other raycast candidate list),
	 * so it's invisible to Window/Door/Remove/Paint targeting regardless (those all use
	 * non-recursive `intersectObjects`, which never descends into a hit candidate's own children).
	 */
	private rebuildOpeningVisuals(
		definition: WallDefinition,
		mesh: THREE.Mesh,
		existing: THREE.Group | undefined
	): THREE.Group {
		if (existing) {
			clearDoorHingePivotsFrom(existing, this.doorHingePivots);
			disposeOpeningVisual(existing);
		}

		const group = new THREE.Group();
		group.name = 'opening-visuals';
		for (const opening of definition.openings) {
			const result = buildOpeningVisual(
				opening,
				definition.thickness,
				this.buildingSettings,
				this.materialManager,
				this.glassMaterial
			);
			if (!result) continue;
			group.add(result.object);
			if (result.hingePivot) this.doorHingePivots.set(opening.id, result.hingePivot);
		}
		mesh.add(group);
		return group;
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
		disposeOpeningVisual(entry.openingVisuals);
		for (const opening of entry.definition.openings) this.doorHingePivots.delete(opening.id);
		entry.mesh.geometry.dispose();
		entry.mesh.removeFromParent();
		entry.boundsHelper?.geometry.dispose();
		this.walls.delete(wallId);
		return true;
	}

	/** Rebuilds every wall's opening visuals — used when a global `BuildingSettings` opening-visual default (frame width/depth, glass on/off, ...) changes in the debug GUI, per the class's "never incrementally patched" rebuild convention. */
	rebuildAllWalls(): void {
		for (const wallId of Array.from(this.walls.keys())) this.rebuildWall(wallId);
	}

	/** The hinge pivot for a door opening, if it has one — `undefined` for a window opening, a disabled/frame-less door, or an unknown id. */
	getDoorHingePivot(openingId: string): THREE.Object3D | undefined {
		return this.doorHingePivots.get(openingId);
	}

	getDoorHingePivots(): ReadonlyMap<string, THREE.Object3D> {
		return this.doorHingePivots;
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
		return computeWallTransform(
			entry.definition,
			frame,
			this.getBuildingGridSize(),
			entry.definition.baseY
		);
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

function clearDoorHingePivotsFrom(root: THREE.Object3D, pivots: Map<string, THREE.Object3D>): void {
	root.traverse((child) => {
		if (child.name === 'door-hinge-pivot' && typeof child.userData.openingId === 'string') {
			pivots.delete(child.userData.openingId);
		}
	});
}
