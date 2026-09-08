import * as THREE from 'three';
import { BuildingMaterialManager } from './BuildingMaterialManager';
import { foundationLocalFrame } from './FoundationLocalMath';
import { FoundationRootRegistry } from './FoundationRootRegistry';
import type { BuildingSettings, FoundationDefinition } from './FoundationTypes';
import { createDefaultBuildingSettings } from './FoundationTypes';
import type { MaterialKind } from './MaterialTypes';
import { pointInPolygon2D, polygonsOverlap } from './slabMath';
import {
	buildSlabGeometry,
	slabLocalPolygon,
	slabOpeningLocalPolygon
} from './SlabGeometryBuilder';
import { buildSlabOpeningFrame, disposeSlabOpeningFrame } from './SlabOpeningFrameBuilder';
import type { SlabDefinition, SlabOpeningDefinition } from './SlabTypes';
import { slabBottomY } from './SlabTypes';
import type { Point2D } from './wallPathMath';

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0xffa64d });

/** Ceilings and floors share one look; only a flat roof looks different — see MaterialTypes.ts's MaterialKind doc comment. */
function materialKindFor(type: SlabDefinition['type']): MaterialKind {
	return type === 'flat-roof' ? 'slab-roof' : 'slab-floor';
}

interface SlabEntry {
	definition: SlabDefinition;
	mesh: THREE.Mesh;
	boundsHelper: THREE.LineSegments | null;
	/** Sibling groups on the foundation root — one timber trim per opening, never part of slab collision. */
	openingFrames: THREE.Group[];
	/** World-space X/Z polygon + world Y extents, cached alongside the mesh so point queries never re-derive them per call. */
	worldPolygon: Point2D[];
	/** World-space hole polygons (openings) — a point inside one of these is NOT covered by the slab, even though it's inside `worldPolygon`. */
	worldHoles: Point2D[][];
	topWorldY: number;
	bottomWorldY: number;
}

export interface SlabManagerOptions {
	getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
	/** Optional — see FoundationManager's constructor doc comment for why tests can omit this and ThreeScene never does. */
	materialManager?: BuildingMaterialManager;
	/** Live opening-frame toggles/sizes, read at every rebuild. Optional so existing tests keep compiling. */
	buildingSettings?: BuildingSettings;
}

/**
 * Owns every placed slab's solid extruded mesh and derived world-space collision data. One
 * BuildingRoot per foundation (via FoundationRootRegistry), same pattern WallManager/
 * WallPathManager use for their own meshes — a slab's mesh is positioned in foundation-local X/Y/Z
 * relative to that root, so it moves for free if the foundation's world position ever changed.
 */
export class SlabManager {
	readonly group: THREE.Group;

	private readonly getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	private readonly getVertexSpacing: () => number;
	private readonly getBuildingGridSize: () => number;
	private readonly materialManager: BuildingMaterialManager;
	private readonly buildingSettings: BuildingSettings;
	private readonly roots: FoundationRootRegistry;

	private readonly slabs = new Map<string, SlabEntry>();
	private showBounds = false;

	constructor(options: SlabManagerOptions) {
		this.getFoundation = options.getFoundation;
		this.getVertexSpacing = options.getVertexSpacing;
		this.getBuildingGridSize = options.getBuildingGridSize;
		this.materialManager = options.materialManager ?? new BuildingMaterialManager();
		this.buildingSettings = options.buildingSettings ?? createDefaultBuildingSettings();
		this.roots = new FoundationRootRegistry(this.getFoundation, this.getVertexSpacing);
		this.group = this.roots.group;
	}

	private buildEntry(definition: SlabDefinition, existing?: SlabEntry): SlabEntry | null {
		const foundation = this.getFoundation(definition.foundationId);
		const root = this.roots.getOrCreate(definition.foundationId);
		if (!foundation || !root) return null;

		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		const buildingGridSize = this.getBuildingGridSize();
		const localPolygon = slabLocalPolygon(definition, buildingGridSize);
		const localHoles = definition.openings.map((opening) =>
			slabOpeningLocalPolygon(opening, buildingGridSize)
		);
		const bottomLocalY = slabBottomY(definition);

		const geometry = buildSlabGeometry(localPolygon, definition.localY, bottomLocalY, localHoles);

		const material = this.materialManager.getMaterial(
			materialKindFor(definition.type),
			definition.material
		);
		let mesh = existing?.mesh;
		if (mesh) {
			mesh.geometry.dispose();
			mesh.geometry = geometry;
			mesh.material = material;
		} else {
			mesh = new THREE.Mesh(geometry, material);
			mesh.userData.foundationId = definition.foundationId;
			mesh.userData.slabId = definition.id;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			root.add(mesh);
		}

		const worldPolygon = localPolygon.map((p) => ({
			x: frame.originWorldX + p.x,
			z: frame.originWorldZ + p.z
		}));
		const worldHoles = localHoles.map((hole) =>
			hole.map((p) => ({ x: frame.originWorldX + p.x, z: frame.originWorldZ + p.z }))
		);

		if (existing?.openingFrames) {
			for (const group of existing.openingFrames) disposeSlabOpeningFrame(group);
		}
		const openingFrames: THREE.Group[] = [];
		for (const hole of localHoles) {
			const xs = hole.map((p) => p.x);
			const zs = hole.map((p) => p.z);
			const frameGroup = buildSlabOpeningFrame(
				{
					minX: Math.min(...xs),
					maxX: Math.max(...xs),
					minZ: Math.min(...zs),
					maxZ: Math.max(...zs)
				},
				definition.localY,
				bottomLocalY,
				this.buildingSettings,
				this.materialManager
			);
			if (frameGroup) {
				root.add(frameGroup);
				openingFrames.push(frameGroup);
			}
		}

		const entry: SlabEntry = {
			definition,
			mesh,
			boundsHelper: existing?.boundsHelper ?? null,
			openingFrames,
			worldPolygon,
			worldHoles,
			topWorldY: frame.originWorldY + definition.localY,
			bottomWorldY: frame.originWorldY + bottomLocalY
		};
		this.refreshBoundsHelper(entry);
		return entry;
	}

	/** Rebuild every slab in place — used when live opening-frame settings change. */
	rebuildAllSlabs(): void {
		for (const entry of this.slabs.values()) {
			const rebuilt = this.buildEntry(entry.definition, entry);
			if (rebuilt) this.slabs.set(entry.definition.id, rebuilt);
		}
	}

	addSlab(definition: SlabDefinition): void {
		const entry = this.buildEntry(definition);
		if (entry) this.slabs.set(definition.id, entry);
	}

	/**
	 * Adds `opening` to `slabId`'s definition and rebuilds its mesh + collision data — used
	 * exclusively by BuildingManager's automatic stair-opening logic (see addStair); there is no
	 * user-facing "cut a hole" tool yet. A no-op if the slab already has an opening with this id.
	 */
	addOpening(slabId: string, opening: SlabOpeningDefinition): boolean {
		const entry = this.slabs.get(slabId);
		if (!entry) return false;
		if (entry.definition.openings.some((o) => o.id === opening.id)) return false;
		const definition: SlabDefinition = {
			...entry.definition,
			openings: [...entry.definition.openings, opening]
		};
		const rebuilt = this.buildEntry(definition, entry);
		if (rebuilt) this.slabs.set(slabId, rebuilt);
		return true;
	}

	/**
	 * Removes `openingId` from `slabId`'s definition and rebuilds its mesh + collision data — the
	 * mirror of `addOpening`, used by BuildingManager.removeStair to restore solid floor where a
	 * stair-owned opening used to be. A no-op (returns `false`) if the slab or the opening isn't
	 * found.
	 */
	removeOpening(slabId: string, openingId: string): boolean {
		const entry = this.slabs.get(slabId);
		if (!entry) return false;
		const openings = entry.definition.openings.filter((o) => o.id !== openingId);
		if (openings.length === entry.definition.openings.length) return false;
		const definition: SlabDefinition = { ...entry.definition, openings };
		const rebuilt = this.buildEntry(definition, entry);
		if (rebuilt) this.slabs.set(slabId, rebuilt);
		return true;
	}

	/** Sets (or, given `undefined`, clears) `slabId`'s material override and rebuilds its mesh — used by BuildingManager.paintSlab. A no-op returning `false` if the slab isn't found. */
	setMaterial(slabId: string, material: SlabDefinition['material']): boolean {
		const entry = this.slabs.get(slabId);
		if (!entry) return false;
		const definition: SlabDefinition = { ...entry.definition, material };
		const rebuilt = this.buildEntry(definition, entry);
		if (rebuilt) this.slabs.set(slabId, rebuilt);
		return true;
	}

	getMeshForSlab(slabId: string): THREE.Mesh | undefined {
		return this.slabs.get(slabId)?.mesh;
	}

	/** Every slab's real mesh, for Paint Mode's raycasting — already carries `userData.slabId`/`userData.foundationId` (see `buildEntry`). */
	getMeshesForRaycast(): THREE.Object3D[] {
		return Array.from(this.slabs.values(), (entry) => entry.mesh);
	}

	removeSlab(id: string): boolean {
		const entry = this.slabs.get(id);
		if (!entry) return false;
		entry.mesh.geometry.dispose();
		entry.mesh.removeFromParent();
		entry.boundsHelper?.geometry.dispose();
		for (const group of entry.openingFrames) disposeSlabOpeningFrame(group);
		this.slabs.delete(id);
		return true;
	}

	removeSlabsForFoundation(foundationId: string): void {
		for (const [id, entry] of this.slabs) {
			if (entry.definition.foundationId === foundationId) this.removeSlab(id);
		}
		this.roots.remove(foundationId);
	}

	getSlab(id: string): SlabDefinition | undefined {
		return this.slabs.get(id)?.definition;
	}

	getSlabsForFoundation(foundationId: string): SlabDefinition[] {
		return Array.from(this.slabs.values(), (entry) => entry.definition).filter(
			(slab) => slab.foundationId === foundationId
		);
	}

	getAllSlabs(): SlabDefinition[] {
		return Array.from(this.slabs.values(), (entry) => entry.definition);
	}

	/**
	 * Every existing slab on `foundationId` at `localY` whose foundation-local polygon overlaps
	 * `localPolygon` — the "same level, overlapping footprint" duplicate-prevention check. Slabs at
	 * a *different* localY are never considered, regardless of polygon shape (see the README —
	 * different floors are meant to overlap in X/Z).
	 */
	findOverlappingSlabAtLevel(
		foundationId: string,
		localY: number,
		localPolygon: readonly Point2D[]
	): SlabDefinition | undefined {
		const buildingGridSize = this.getBuildingGridSize();
		const EPS = 1e-6;
		for (const entry of this.slabs.values()) {
			if (entry.definition.foundationId !== foundationId) continue;
			if (Math.abs(entry.definition.localY - localY) > EPS) continue;
			const existingLocal = slabLocalPolygon(entry.definition, buildingGridSize);
			if (polygonsOverlap(existingLocal, localPolygon)) return entry.definition;
		}
		return undefined;
	}

	/** True if (worldX, worldZ) falls inside the slab's outer polygon but NOT inside any of its openings — i.e. the slab is actually physically present there. */
	private isCoveredBy(entry: SlabEntry, point: Point2D): boolean {
		if (!pointInPolygon2D(point, entry.worldPolygon)) return false;
		return !entry.worldHoles.some((hole) => pointInPolygon2D(point, hole));
	}

	/** Every placed slab's top (walkable) world Y at (worldX, worldZ) — a point can be above several stacked slabs, hence an array; see WorldSurfaceSampler for how the right one is chosen. Excludes any slab whose opening (e.g. a stair opening) covers this point. */
	getTopSurfacesAt(worldX: number, worldZ: number): number[] {
		const point = { x: worldX, z: worldZ };
		const tops: number[] = [];
		for (const entry of this.slabs.values()) {
			if (this.isCoveredBy(entry, point)) tops.push(entry.topWorldY);
		}
		return tops;
	}

	/** Every placed slab's underside world Y at (worldX, worldZ) — used to block upward movement into a ceiling from below. Excludes any slab whose opening covers this point. */
	getUndersidesAt(worldX: number, worldZ: number): number[] {
		const point = { x: worldX, z: worldZ };
		const undersides: number[] = [];
		for (const entry of this.slabs.values()) {
			if (this.isCoveredBy(entry, point)) undersides.push(entry.bottomWorldY);
		}
		return undersides;
	}

	setShowBounds(visible: boolean): void {
		this.showBounds = visible;
		for (const entry of this.slabs.values()) this.refreshBoundsHelper(entry);
	}

	private refreshBoundsHelper(entry: SlabEntry): void {
		entry.boundsHelper?.geometry.dispose();
		if (entry.boundsHelper) entry.mesh.remove(entry.boundsHelper);
		entry.boundsHelper = null;
		if (!this.showBounds) return;
		const edges = new THREE.EdgesGeometry(entry.mesh.geometry);
		entry.boundsHelper = new THREE.LineSegments(edges, boundsMaterial);
		entry.mesh.add(entry.boundsHelper);
	}

	/** Plain, serializable world-state — never Three.js objects. */
	serialize(): SlabDefinition[] {
		return this.getAllSlabs();
	}

	/** Replaces all current slabs with the given definitions — trusts the input, same as FoundationManager.load(). */
	load(definitions: readonly SlabDefinition[]): void {
		for (const id of Array.from(this.slabs.keys())) this.removeSlab(id);
		for (const definition of definitions) this.addSlab(definition);
	}

	dispose(): void {
		for (const id of Array.from(this.slabs.keys())) this.removeSlab(id);
		this.roots.dispose();
	}
}
