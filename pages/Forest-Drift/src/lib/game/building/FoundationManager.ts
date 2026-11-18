import {
	EarthFoundationField,
	earthFoundationBounds,
	type EarthBounds
} from './EarthFoundationField';
import * as THREE from 'three';
import { BuildingMaterialManager } from './BuildingMaterialManager';
import { FoundationMesh } from './FoundationMesh';
import type { BuildingSettings, FoundationDefinition } from './FoundationTypes';
import { createDefaultBuildingSettings } from './FoundationTypes';
import type { BuildingMaterialDefinition } from './MaterialTypes';
import { buildFoundationFrame, disposeWallFrame } from './WallFrameBuilder';
import {
	basementDeckUndersideY,
	basementInteriorRect,
	basementLowestFloorY,
	basementRegionAt,
	basementRetainingWallRects,
	foundationWorldRect
} from './basementMath';
import type { WallCollisionRect } from './wallCollision';
import type { TerrainHoleRect } from '../terrain/terrainHoles';

/** World-unit tolerance on the containment test, so the player never flickers between terrain and foundation height right at an edge. */
const EDGE_TOLERANCE = 0.001;

/** Feet this close below a deck's underside still count as on the deck, not in the basement. */
const BASEMENT_FEET_EPSILON = 0.05;

interface FoundationEntry {
	definition: FoundationDefinition;
	mesh: FoundationMesh;
	/** Sibling of the cuboid in `group` — same timber recipe as wall/path framing. `null` when off. */
	frame: THREE.Group | null;
}

/**
 * Stores placed foundations and their Three.js representations. Foundations are persistent world
 * objects — independent of terrain chunk lifetime, never owned by TerrainChunk/TerrainManager.
 *
 * Uses a simple Map for now (the prototype's foundation counts are tiny); getTopYAt() is the one
 * hot path a future spatial index (grid buckets, quadtree) would slot in behind unchanged.
 *
 * Vertex spacing is read live (via getVertexSpacing) rather than frozen at construction, so a
 * foundation placed after a live chunkSize/chunkResolution change uses the *current* grid — see
 * the "Terrain settings changes" note in the README for the accepted limitation this implies for
 * foundations placed before such a change.
 */
export class FoundationManager {
	readonly group = new THREE.Group();

	private readonly getVertexSpacing: () => number;
	private readonly materialManager: BuildingMaterialManager;
	private readonly buildingSettings: BuildingSettings;
	private readonly foundations = new Map<string, FoundationEntry>();
	private readonly earthField = new EarthFoundationField();
	private onTerrainEdit: ((bounds: EarthBounds) => void) | null = null;
	private readonly earthProxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
	setTerrainEditHandler(handler: (bounds: EarthBounds) => void): void {
		this.onTerrainEdit = handler;
	}
	constrainTerrainHeight = (x: number, z: number, base: number, height: number): number =>
		this.earthField.constrainManual(x, z, base, height);
	sampleEarthHeight = (x: number, z: number, base: number): number =>
		this.earthField.sample(x, z, base);
	private onHolesChanged: ((rects: TerrainHoleRect[]) => void) | null = null;
	private holesKey = '';
	/**
	 * Called with every basement footprint whenever they change (TerrainManager cuts those cells out
	 * of the terrain mesh). Fires before the terrain-edit handler, so the chunks rebuilt for that
	 * edit are already cut.
	 */
	setTerrainHolesHandler(handler: (rects: TerrainHoleRect[]) => void): void {
		this.onHolesChanged = handler;
		this.holesKey = '';
		this.publishHoles();
	}
	private publishHoles(): void {
		if (!this.onHolesChanged) return;
		const rects = this.getBasementHoleRects();
		const key = JSON.stringify(rects);
		if (key === this.holesKey) return;
		this.holesKey = key;
		this.onHolesChanged(rects);
	}
	private refreshEarth(definition: FoundationDefinition): void {
		this.earthField.rebuild(this.getFoundations(), this.getVertexSpacing());
		this.publishHoles();
		this.onTerrainEdit?.(earthFoundationBounds(definition, this.getVertexSpacing()));
	}
	private showBounds = false;
	/** Monotonic change counter polled by world persistence — see BuildingManager.revision for why this exists rather than re-serializing to detect changes. */
	private revision = 0;

	/**
	 * `materialManager` is optional — most tests exercising this class care about foundation
	 * placement/collision math, not painting, so they shouldn't have to construct one; a fresh
	 * private instance here is functionally identical to a shared one for a manager that never
	 * paints anything itself (see BuildingMaterialManager's own caching, which is per-instance).
	 * ThreeScene always passes the real shared one, so a foundation's material cache is shared with
	 * every other building manager, per the README's "Paint Tool" section.
	 * `buildingSettings` is the same live object WallManager reads for edge framing, so toggling
	 * wall framing rebuilds foundation timber too.
	 */
	constructor(
		getVertexSpacing: () => number,
		materialManager?: BuildingMaterialManager,
		buildingSettings?: BuildingSettings
	) {
		this.getVertexSpacing = getVertexSpacing;
		this.materialManager = materialManager ?? new BuildingMaterialManager();
		this.buildingSettings = buildingSettings ?? createDefaultBuildingSettings();
	}

	addFoundation(definition: FoundationDefinition): void {
		this.revision++;
		this.foundations.set(definition.id, this.createEntry(definition));
		this.refreshEarth(definition);
	}

	/** An earth pad is drawn by the terrain itself, unless it has a basement (stone walls, footing). */
	private materialsFor(definition: FoundationDefinition): THREE.Material | THREE.Material[] {
		return definition.style === 'earth' && !definition.basement
			? this.earthProxyMaterial
			: this.materialManager.getFoundationMaterials(definition.material);
	}

	private createEntry(definition: FoundationDefinition): FoundationEntry {
		const mesh = new FoundationMesh(
			definition,
			this.getVertexSpacing(),
			this.materialsFor(definition)
		);
		mesh.setBoundsVisible(this.showBounds);
		this.group.add(mesh.object);
		const entry: FoundationEntry = { definition, mesh, frame: null };
		this.rebuildFrame(entry);
		return entry;
	}

	private disposeEntry(entry: FoundationEntry): void {
		if (entry.frame) disposeWallFrame(entry.frame);
		this.group.remove(entry.mesh.object);
		entry.mesh.dispose();
	}

	/**
	 * Replaces a foundation's definition in place (adding or removing a basement, for example) and
	 * rebuilds its mesh and frame. Its id stays, so everything built on it stays with it. Returns
	 * `false` if no such foundation exists.
	 */
	updateFoundation(definition: FoundationDefinition): boolean {
		const existing = this.foundations.get(definition.id);
		if (!existing) return false;
		this.revision++;
		this.disposeEntry(existing);
		this.foundations.set(definition.id, this.createEntry(definition));
		this.refreshEarth(definition);
		return true;
	}

	/** Every basement's stone walls as collision rects: the camera keeps itself out of them. */
	getAllBasementWallRects(): WallCollisionRect[] {
		const spacing = this.getVertexSpacing();
		const rects: WallCollisionRect[] = [];
		for (const { definition } of this.foundations.values())
			if (definition.basement) rects.push(...basementRetainingWallRects(definition, spacing));
		return rects;
	}

	/** Sets (or, given `undefined`, clears) a foundation's material override — visual only, never touching its grid footprint, `topY`/`bottomY`, or collision. A no-op returning `false` if the foundation isn't found. */
	setMaterial(id: string, material: BuildingMaterialDefinition | undefined): boolean {
		this.revision++;
		const entry = this.foundations.get(id);
		if (!entry) return false;
		entry.definition = { ...entry.definition, material };
		entry.mesh.setMaterial(this.materialsFor(entry.definition));
		return true;
	}

	removeFoundation(id: string): boolean {
		this.revision++;
		const entry = this.foundations.get(id);
		if (!entry) return false;
		this.disposeEntry(entry);
		this.foundations.delete(id);
		this.refreshEarth(entry.definition);
		return true;
	}

	/** Retaining-wall geometry is derived, never written into the authored bottomY. */
	refreshTerrainSupport(bounds: EarthBounds, sample: (x: number, z: number) => number): void {
		const s = this.getVertexSpacing();
		for (const entry of this.foundations.values()) {
			const d = entry.definition;
			if (d.style === 'earth' && !d.basement) continue;
			const minX = d.minGridX * s,
				maxX = d.maxGridX * s,
				minZ = d.minGridZ * s,
				maxZ = d.maxGridZ * s;
			if (maxX < bounds.minX || minX > bounds.maxX || maxZ < bounds.minZ || minZ > bounds.maxZ)
				continue;
			let bottom = d.bottomY;
			for (let x = minX; x <= maxX + 0.001; x += s / 2)
				bottom = Math.min(bottom, sample(x, minZ) - 0.5, sample(x, maxZ) - 0.5);
			for (let z = minZ; z <= maxZ + 0.001; z += s / 2)
				bottom = Math.min(bottom, sample(minX, z) - 0.5, sample(maxX, z) - 0.5);
			entry.mesh.setSupportDepth(d.topY, bottom);
		}
	}

	placementConflict(candidate: FoundationDefinition): string | null {
		const s = this.getVertexSpacing();
		for (const { definition: d } of this.foundations.values()) {
			const dx = Math.max(d.minGridX - candidate.maxGridX, candidate.minGridX - d.maxGridX, 0) * s;
			const dz = Math.max(d.minGridZ - candidate.maxGridZ, candidate.minGridZ - d.maxGridZ, 0) * s;
			if (
				candidate.minGridX < d.maxGridX &&
				candidate.maxGridX > d.minGridX &&
				candidate.minGridZ < d.maxGridZ &&
				candidate.maxGridZ > d.minGridZ
			)
				return 'Foundation interiors cannot overlap.';
			if (candidate.style === 'earth' || d.style === 'earth') {
				const distance = Math.hypot(dx, dz);
				const reveal = candidate.style === d.style ? 0 : 0.05;
				if (
					Math.abs(candidate.topY - d.topY) + reveal > distance * 0.65 + 0.001 &&
					distance < (candidate.blendWidth ?? 6)
				)
					return 'Not enough room for a safe bank between these foundations.';
			}
		}
		return null;
	}

	getRevision(): number {
		return this.revision;
	}

	getFoundation(id: string): FoundationDefinition | undefined {
		return this.foundations.get(id)?.definition;
	}

	getFoundations(): FoundationDefinition[] {
		return Array.from(this.foundations.values(), (entry) => entry.definition);
	}

	/** Every foundation's mesh, for tools that raycast against foundation surfaces (e.g. Wall Tool targeting the top face) rather than terrain — mirrors TerrainManager.getActiveMeshes(). */
	getMeshes(): THREE.Object3D[] {
		return Array.from(this.foundations.values(), (entry) => entry.mesh.object);
	}

	/** One foundation's own mesh — for PaintTool's live hover preview (material swap + outline). */
	getMeshForFoundation(id: string): THREE.Mesh | undefined {
		return this.foundations.get(id)?.mesh.object;
	}

	setShowBounds(visible: boolean): void {
		this.showBounds = visible;
		for (const entry of this.foundations.values()) entry.mesh.setBoundsVisible(visible);
	}

	/**
	 * Rebuilds every foundation's edge framing from the live wall-frame settings — same trigger as
	 * `WallManager.rebuildAllWalls` when the Framing GUI changes. Does not recreate the cuboid.
	 */
	rebuildAllFrames(): void {
		for (const entry of this.foundations.values()) this.rebuildFrame(entry);
	}

	private rebuildFrame(entry: FoundationEntry): void {
		if (entry.frame) {
			disposeWallFrame(entry.frame);
			entry.frame = null;
		}
		const spacing = this.getVertexSpacing();
		const { definition } = entry;
		if (definition.style === 'earth') return;
		const frame = buildFoundationFrame(
			{
				id: definition.id,
				minX: definition.minGridX * spacing,
				maxX: definition.maxGridX * spacing,
				minZ: definition.minGridZ * spacing,
				maxZ: definition.maxGridZ * spacing,
				bottomY: definition.bottomY,
				topY: definition.topY
			},
			this.buildingSettings,
			this.buildingSettings.wallThickness,
			this.buildingSettings.miterLimit,
			this.materialManager
		);
		if (frame) {
			this.group.add(frame);
			entry.frame = frame;
		}
	}

	/** Highest foundation top surface covering (worldX, worldZ), or null if no foundation covers it. */
	/**
	 * Every foundation's world-space footprint (the same rectangle `getTopYAt` tests). Ground cover
	 * (grass) uses these as exclusion rects, so nothing grows through a floor.
	 */
	getFootprints(): { id: string; minX: number; minZ: number; maxX: number; maxZ: number }[] {
		const spacing = this.getVertexSpacing();
		return [...this.foundations.values()].map(({ definition }) => ({
			id: definition.id,
			minX: definition.minGridX * spacing - EDGE_TOLERANCE,
			minZ: definition.minGridZ * spacing - EDGE_TOLERANCE,
			maxX: definition.maxGridX * spacing + EDGE_TOLERANCE,
			maxZ: definition.maxGridZ * spacing + EDGE_TOLERANCE
		}));
	}

	getTopYAt(worldX: number, worldZ: number): number | null {
		const spacing = this.getVertexSpacing();
		let best: number | null = null;
		for (const { definition } of this.foundations.values()) {
			const minX = definition.minGridX * spacing - EDGE_TOLERANCE;
			const maxX = definition.maxGridX * spacing + EDGE_TOLERANCE;
			const minZ = definition.minGridZ * spacing - EDGE_TOLERANCE;
			const maxZ = definition.maxGridZ * spacing + EDGE_TOLERANCE;
			if (worldX < minX || worldX > maxX || worldZ < minZ || worldZ > maxZ) continue;
			if (best === null || definition.topY > best) best = definition.topY;
		}
		return best;
	}

	/**
	 * Like `getTopYAt`, but a basement's interior has no solid top: there the deck is an ordinary
	 * slab and the ground is the basement's lowest floor (`getBasementFloorAt`). The ring of stone
	 * walls round a basement still counts, so walking up to a house from lower ground steps onto it
	 * exactly as onto a solid foundation. Used for walking (WorldSurfaceSampler).
	 */
	getSolidTopYAt(worldX: number, worldZ: number): number | null {
		const spacing = this.getVertexSpacing();
		let best: number | null = null;
		for (const { definition } of this.foundations.values()) {
			const region = basementRegionAt(definition, spacing, worldX, worldZ);
			if (region === 'interior') continue;
			if (region === null && !this.covers(definition, spacing, worldX, worldZ)) continue;
			if (best === null || definition.topY > best) best = definition.topY;
		}
		return best;
	}

	/** The lowest floor of the basement whose interior covers (worldX, worldZ), or null. */
	getBasementFloorAt(worldX: number, worldZ: number): number | null {
		const spacing = this.getVertexSpacing();
		let best: number | null = null;
		for (const { definition } of this.foundations.values()) {
			if (basementRegionAt(definition, spacing, worldX, worldZ) !== 'interior') continue;
			const floor = basementLowestFloorY(definition)!;
			if (best === null || floor > best) best = floor;
		}
		return best;
	}

	/**
	 * Keeps a player who is standing in a basement inside it: when their current position (`fromX`,
	 * `fromZ`) is in a basement's interior with their feet below its deck, the proposed position is
	 * clamped to the interior, `radius` in from the stone walls. A clamp rather than wall collision,
	 * so a long step at a low frame rate can't carry them through 0.3 m of stone onto the rim (which
	 * would lift them through the deck). A player outside, or on the deck, is never affected, so they
	 * step up onto the house over its rim as onto any foundation.
	 */
	containInBasement(
		fromX: number,
		fromZ: number,
		feetY: number,
		x: number,
		z: number,
		radius: number
	): { x: number; z: number } {
		const spacing = this.getVertexSpacing();
		for (const { definition } of this.foundations.values()) {
			if (basementRegionAt(definition, spacing, fromX, fromZ) !== 'interior') continue;
			if (feetY >= basementDeckUndersideY(definition) - BASEMENT_FEET_EPSILON) continue;
			const i = basementInteriorRect(definition, spacing);
			const clamp = (v: number, min: number, max: number) =>
				min > max ? (min + max) / 2 : Math.min(max, Math.max(min, v));
			return {
				x: clamp(x, i.minX + radius, i.maxX - radius),
				z: clamp(z, i.minZ + radius, i.maxZ - radius)
			};
		}
		return { x, z };
	}

	/** Every basement foundation's footprint, in world metres: the terrain under them is cut away. */
	getBasementHoleRects(): TerrainHoleRect[] {
		const spacing = this.getVertexSpacing();
		const rects: TerrainHoleRect[] = [];
		for (const { definition } of this.foundations.values())
			if (definition.basement) rects.push(foundationWorldRect(definition, spacing));
		return rects.sort((a, b) => a.minX - b.minX || a.minZ - b.minZ);
	}

	private covers(
		d: FoundationDefinition,
		spacing: number,
		worldX: number,
		worldZ: number
	): boolean {
		return (
			worldX >= d.minGridX * spacing - EDGE_TOLERANCE &&
			worldX <= d.maxGridX * spacing + EDGE_TOLERANCE &&
			worldZ >= d.minGridZ * spacing - EDGE_TOLERANCE &&
			worldZ <= d.maxGridZ * spacing + EDGE_TOLERANCE
		);
	}

	/**
	 * The (highest, if several overlap) foundation whose footprint covers (worldX, worldZ) — used to
	 * resolve which foundation an elevated building level's construction plane belongs to when the
	 * player is looking up/sideways rather than directly at a foundation's top mesh (see
	 * foundationTopTargeting.raycastLevelConstructionPlane).
	 */
	getFoundationContaining(worldX: number, worldZ: number): FoundationDefinition | undefined {
		const spacing = this.getVertexSpacing();
		let best: FoundationDefinition | undefined;
		for (const { definition } of this.foundations.values()) {
			const minX = definition.minGridX * spacing - EDGE_TOLERANCE;
			const maxX = definition.maxGridX * spacing + EDGE_TOLERANCE;
			const minZ = definition.minGridZ * spacing - EDGE_TOLERANCE;
			const maxZ = definition.maxGridZ * spacing + EDGE_TOLERANCE;
			if (worldX < minX || worldX > maxX || worldZ < minZ || worldZ > maxZ) continue;
			if (!best || definition.topY > best.topY) best = definition;
		}
		return best;
	}

	/** Plain, serializable world-state — never Three.js objects. */
	serialize(): FoundationDefinition[] {
		return this.getFoundations();
	}

	/** Replaces all current foundations with the given definitions (e.g. loaded from a future server/database). */
	load(definitions: FoundationDefinition[]): void {
		this.revision++;
		for (const id of Array.from(this.foundations.keys())) this.removeFoundation(id);
		for (const definition of definitions) this.addFoundation(definition);
	}

	dispose(): void {
		for (const entry of this.foundations.values()) {
			if (entry.frame) disposeWallFrame(entry.frame);
			entry.mesh.dispose();
		}
		this.foundations.clear();
		this.group.clear();
		this.earthProxyMaterial.dispose();
		this.earthField.rebuild([], this.getVertexSpacing());
		this.onTerrainEdit = null;
	}
}
