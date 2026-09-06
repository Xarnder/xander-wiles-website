import * as THREE from 'three';
import { BuildingMaterialManager } from './BuildingMaterialManager';
import { foundationLocalFrame } from './FoundationLocalMath';
import { FoundationRootRegistry } from './FoundationRootRegistry';
import type { FoundationDefinition } from './FoundationTypes';
import {
	axisAlignedRectangleOf,
	buildRoofFaces,
	expandRect,
	type RoofFace,
	type RoofVertex
} from './roofMath';
import { buildRoofGeometry, RoofFootprintError } from './RoofGeometryBuilder';
import type { RoofDefinition } from './RoofTypes';
import { pointInPolygon2D } from './slabMath';
import type { Point2D } from './wallPathMath';

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0xff9d4d });

interface RoofEntry {
	definition: RoofDefinition;
	mesh: THREE.Mesh;
	boundsHelper: THREE.LineSegments | null;
	/** World-space (post foundation-origin-offset) copies of every generated face — the source of truth `getTopSurfacesAt`/`getUndersidesAt` evaluate against; `null` for `'flat'` roofs, which use the constant `topWorldY`/`bottomWorldY` pair instead, exactly like a slab. */
	worldFaces: RoofFace[] | null;
	/** Only set for `'flat'` roofs. */
	topWorldY: number | null;
	bottomWorldY: number | null;
	/** World-space footprint polygon (including overhang) — a cheap first-pass rejection before the more expensive per-face test. */
	worldFootprint: Point2D[];
}

export interface RoofManagerOptions {
	getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
	materialManager?: BuildingMaterialManager;
}

export type RoofBuildResult = { ok: true; roof: RoofDefinition } | { ok: false; reason: string };

/**
 * Owns every placed roof's solid mesh and the world-space plane data `getTopSurfacesAt`/
 * `getUndersidesAt` evaluate against for player collision — the pitched-roof analogue of
 * `SlabManager`, following the exact same one-`FoundationRootRegistry`-per-manager /
 * rebuild-the-whole-mesh-on-any-change conventions (see SlabManager's own doc comments for why).
 *
 * The one genuinely new problem relative to `SlabManager` is that a roof's top/underside is NOT a
 * constant Y across its footprint — see `getTopSurfacesAt`'s doc comment for how that's resolved
 * without needing any change to `WorldSurfaceSampler` itself.
 */
export class RoofManager {
	readonly group: THREE.Group;

	private readonly getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	private readonly getVertexSpacing: () => number;
	private readonly getBuildingGridSize: () => number;
	private readonly materialManager: BuildingMaterialManager;
	private readonly roots: FoundationRootRegistry;

	private readonly roofs = new Map<string, RoofEntry>();
	private showBounds = false;

	constructor(options: RoofManagerOptions) {
		this.getFoundation = options.getFoundation;
		this.getVertexSpacing = options.getVertexSpacing;
		this.getBuildingGridSize = options.getBuildingGridSize;
		this.materialManager = options.materialManager ?? new BuildingMaterialManager();
		this.roots = new FoundationRootRegistry(this.getFoundation, this.getVertexSpacing);
		this.group = this.roots.group;
	}

	private buildEntry(definition: RoofDefinition, existing?: RoofEntry): RoofEntry | null {
		const foundation = this.getFoundation(definition.foundationId);
		const root = this.roots.getOrCreate(definition.foundationId);
		if (!foundation || !root) return null;

		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		const buildingGridSize = this.getBuildingGridSize();

		const geometry = buildRoofGeometry(definition, buildingGridSize);

		const material = this.materialManager.getMaterial('slab-roof', definition.material);
		let mesh = existing?.mesh;
		if (mesh) {
			mesh.geometry.dispose();
			mesh.geometry = geometry;
			mesh.material = material;
		} else {
			mesh = new THREE.Mesh(geometry, material);
			mesh.userData.foundationId = definition.foundationId;
			mesh.userData.roofId = definition.id;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			root.add(mesh);
		}

		const localFootprint: Point2D[] = definition.points.map((p) => ({
			x: p.gridX * buildingGridSize,
			z: p.gridZ * buildingGridSize
		}));

		let worldFaces: RoofFace[] | null = null;
		let topWorldY: number | null = null;
		let bottomWorldY: number | null = null;
		let worldFootprint: Point2D[];

		if (definition.type === 'flat') {
			topWorldY = frame.originWorldY + definition.baseY;
			bottomWorldY = frame.originWorldY + definition.baseY - definition.thickness;
			worldFootprint = localFootprint.map((p) => ({
				x: frame.originWorldX + p.x,
				z: frame.originWorldZ + p.z
			}));
		} else {
			const rect = axisAlignedRectangleOf(localFootprint);
			if (!rect) return null; // Should already be prevented by validation before this is ever called.
			const overhungRect = definition.overhang > 0 ? expandRect(rect, definition.overhang) : rect;
			const localFaces = buildRoofFaces(
				definition.type,
				overhungRect,
				definition.direction,
				definition.shedDirection,
				definition.baseY,
				definition.rise,
				definition.profileSettings
			);
			worldFaces = localFaces
				.filter((face) => !face.vertical)
				.map((face) => ({
					points: face.points.map((p) => toWorld(frame, p)),
					fasciaEdges: face.fasciaEdges
				}));
			worldFootprint = [
				{ x: frame.originWorldX + overhungRect.minX, z: frame.originWorldZ + overhungRect.minZ },
				{ x: frame.originWorldX + overhungRect.maxX, z: frame.originWorldZ + overhungRect.minZ },
				{ x: frame.originWorldX + overhungRect.maxX, z: frame.originWorldZ + overhungRect.maxZ },
				{ x: frame.originWorldX + overhungRect.minX, z: frame.originWorldZ + overhungRect.maxZ }
			];
		}

		const entry: RoofEntry = {
			definition,
			mesh,
			boundsHelper: existing?.boundsHelper ?? null,
			worldFaces,
			topWorldY,
			bottomWorldY,
			worldFootprint
		};
		this.refreshBoundsHelper(entry);
		return entry;
	}

	/** Validates the footprint against `definition.type` and, if compatible, builds and stores the roof. Mirrors `BuildingManager.addSlab`'s "validate, then delegate" shape — the actual grid/overlap/within-foundation checks live in `BuildingManager.addRoof`, this only owns "can THIS geometry algorithm actually build this shape". */
	addRoof(definition: RoofDefinition): RoofBuildResult {
		try {
			const entry = this.buildEntry(definition);
			if (!entry) return { ok: false, reason: 'Foundation not found' };
			this.roofs.set(definition.id, entry);
			return { ok: true, roof: definition };
		} catch (error) {
			if (error instanceof RoofFootprintError) return { ok: false, reason: error.message };
			throw error;
		}
	}

	/** Sets (or, given `undefined`, clears) `roofId`'s material override and rebuilds its mesh — used by BuildingManager.paintRoof. A no-op returning `false` if the roof isn't found. */
	setMaterial(roofId: string, material: RoofDefinition['material']): boolean {
		const entry = this.roofs.get(roofId);
		if (!entry) return false;
		const definition: RoofDefinition = { ...entry.definition, material };
		const rebuilt = this.buildEntry(definition, entry);
		if (rebuilt) this.roofs.set(roofId, rebuilt);
		return true;
	}

	getMeshForRoof(roofId: string): THREE.Mesh | undefined {
		return this.roofs.get(roofId)?.mesh;
	}

	/** Every roof's real mesh, for Remove/Paint Mode raycasting — already carries `userData.roofId`/`userData.foundationId` (see `buildEntry`). */
	getMeshesForRaycast(): THREE.Object3D[] {
		return Array.from(this.roofs.values(), (entry) => entry.mesh);
	}

	removeRoof(id: string): boolean {
		const entry = this.roofs.get(id);
		if (!entry) return false;
		entry.mesh.geometry.dispose();
		entry.mesh.removeFromParent();
		entry.boundsHelper?.geometry.dispose();
		this.roofs.delete(id);
		return true;
	}

	removeRoofsForFoundation(foundationId: string): void {
		for (const [id, entry] of this.roofs) {
			if (entry.definition.foundationId === foundationId) this.removeRoof(id);
		}
		this.roots.remove(foundationId);
	}

	getRoof(id: string): RoofDefinition | undefined {
		return this.roofs.get(id)?.definition;
	}

	getRoofsForFoundation(foundationId: string): RoofDefinition[] {
		return Array.from(this.roofs.values(), (entry) => entry.definition).filter(
			(roof) => roof.foundationId === foundationId
		);
	}

	getAllRoofs(): RoofDefinition[] {
		return Array.from(this.roofs.values(), (entry) => entry.definition);
	}

	/**
	 * Every placed roof's walkable top-surface world Y at (worldX, worldZ) — the sloped-roof
	 * counterpart to `SlabManager.getTopSurfacesAt`. `WorldSurfaceSampler` needed NO changes to
	 * consume this: its contract was already "a function of (worldX, worldZ) returning zero or more
	 * Y candidates", which a flat slab satisfies with a cached constant and a sloped roof satisfies
	 * by evaluating the actual plane at that exact point instead — the caller can't tell the
	 * difference and doesn't need to.
	 *
	 * For a `'flat'` roof this is the same constant-Y lookup a slab uses. For every pitched type,
	 * this finds which of the roof's (few, always-convex) faces contains `(worldX, worldZ)` in plan
	 * projection and evaluates that face's own plane equation for the exact Y there — never the
	 * roof's highest point, which would make walking near an eave feel like standing on a ledge that
	 * isn't really there.
	 */
	getTopSurfacesAt(worldX: number, worldZ: number): number[] {
		const results: number[] = [];
		for (const entry of this.roofs.values()) {
			if (!pointInPolygon2D({ x: worldX, z: worldZ }, entry.worldFootprint)) continue;
			if (entry.topWorldY !== null) {
				results.push(entry.topWorldY);
				continue;
			}
			const y = evaluateFacesAt(entry.worldFaces!, worldX, worldZ);
			if (y !== null) results.push(y);
		}
		return results;
	}

	/** The underside counterpart to `getTopSurfacesAt` — used to block upward movement into a sloped roof from below, exactly like `SlabManager.getUndersidesAt`. */
	getUndersidesAt(worldX: number, worldZ: number): number[] {
		const results: number[] = [];
		for (const entry of this.roofs.values()) {
			if (!pointInPolygon2D({ x: worldX, z: worldZ }, entry.worldFootprint)) continue;
			if (entry.bottomWorldY !== null) {
				results.push(entry.bottomWorldY);
				continue;
			}
			const y = evaluateFacesAt(entry.worldFaces!, worldX, worldZ);
			if (y !== null) results.push(y - entry.definition.thickness);
		}
		return results;
	}

	setShowBounds(visible: boolean): void {
		this.showBounds = visible;
		for (const entry of this.roofs.values()) this.refreshBoundsHelper(entry);
	}

	private refreshBoundsHelper(entry: RoofEntry): void {
		entry.boundsHelper?.geometry.dispose();
		if (entry.boundsHelper) entry.mesh.remove(entry.boundsHelper);
		entry.boundsHelper = null;
		if (!this.showBounds) return;
		const edges = new THREE.EdgesGeometry(entry.mesh.geometry);
		entry.boundsHelper = new THREE.LineSegments(edges, boundsMaterial);
		entry.mesh.add(entry.boundsHelper);
	}

	/** Plain, serializable world-state — never Three.js objects. */
	serialize(): RoofDefinition[] {
		return this.getAllRoofs();
	}

	/** Replaces all current roofs with the given definitions — trusts the input, same as SlabManager.load(). */
	load(definitions: readonly RoofDefinition[]): void {
		for (const id of Array.from(this.roofs.keys())) this.removeRoof(id);
		for (const definition of definitions) this.addRoof(definition);
	}

	dispose(): void {
		for (const id of Array.from(this.roofs.keys())) this.removeRoof(id);
		this.roots.dispose();
	}
}

function toWorld(
	frame: { originWorldX: number; originWorldY: number; originWorldZ: number },
	p: RoofVertex
): RoofVertex {
	return { x: frame.originWorldX + p.x, y: frame.originWorldY + p.y, z: frame.originWorldZ + p.z };
}

/**
 * Finds the (first) face whose 2D (X/Z) projection contains `(worldX, worldZ)` and evaluates that
 * face's own plane equation there. Faces are authored convex and (per `RoofFace`'s contract) never
 * meaningfully overlap in projection except along a shared, coincident edge, so "first match" is
 * always the geometrically correct one, not an arbitrary pick among competing candidates.
 */
function evaluateFacesAt(faces: RoofFace[], worldX: number, worldZ: number): number | null {
	for (const face of faces) {
		const projected = face.points.map((p) => ({ x: p.x, z: p.z }));
		if (!pointInPolygon2D({ x: worldX, z: worldZ }, projected)) continue;
		const y = planeYAt(face.points, worldX, worldZ);
		if (y !== null) return y;
	}
	return null;
}

/** Solves the plane through the face's first 3 (non-collinear) points for Y at a given (x, z) — every face this system builds is planar by construction, so any 3 of its points determine the same plane the rest lie on. */
function planeYAt(points: RoofVertex[], x: number, z: number): number | null {
	if (points.length < 3) return null;
	const [a, b, c] = points;
	const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
	const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
	// Plane normal via cross product; if the first three points happen to be (near-)collinear, fall
	// back to the next point along rather than reporting a bogus vertical plane.
	const normal = {
		x: ab.y * ac.z - ab.z * ac.y,
		y: ab.z * ac.x - ab.x * ac.z,
		z: ab.x * ac.y - ab.y * ac.x
	};
	if (Math.abs(normal.y) < 1e-9) {
		if (points.length > 3) return planeYAt([points[0], points[2], points[3]], x, z);
		return a.y;
	}
	// normal · (P - a) = 0  =>  y = a.y - (normal.x*(x-a.x) + normal.z*(z-a.z)) / normal.y
	return a.y - (normal.x * (x - a.x) + normal.z * (z - a.z)) / normal.y;
}
