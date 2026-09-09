import * as THREE from 'three';
import { BuildingMaterialManager } from './BuildingMaterialManager';
import { FoundationMesh } from './FoundationMesh';
import type { BuildingSettings, FoundationDefinition } from './FoundationTypes';
import { createDefaultBuildingSettings } from './FoundationTypes';
import type { BuildingMaterialDefinition } from './MaterialTypes';
import { buildFoundationFrame, disposeWallFrame } from './WallFrameBuilder';

/** World-unit tolerance on the containment test, so the player never flickers between terrain and foundation height right at an edge. */
const EDGE_TOLERANCE = 0.001;

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
		const material = this.materialManager.getMaterial('foundation', definition.material);
		const mesh = new FoundationMesh(definition, this.getVertexSpacing(), material);
		mesh.setBoundsVisible(this.showBounds);
		this.group.add(mesh.object);
		const entry: FoundationEntry = { definition, mesh, frame: null };
		this.rebuildFrame(entry);
		this.foundations.set(definition.id, entry);
	}

	/** Sets (or, given `undefined`, clears) a foundation's material override — visual only, never touching its grid footprint, `topY`/`bottomY`, or collision. A no-op returning `false` if the foundation isn't found. */
	setMaterial(id: string, material: BuildingMaterialDefinition | undefined): boolean {
		this.revision++;
		const entry = this.foundations.get(id);
		if (!entry) return false;
		entry.definition = { ...entry.definition, material };
		entry.mesh.setMaterial(this.materialManager.getMaterial('foundation', material));
		return true;
	}

	removeFoundation(id: string): boolean {
		this.revision++;
		const entry = this.foundations.get(id);
		if (!entry) return false;
		if (entry.frame) disposeWallFrame(entry.frame);
		this.group.remove(entry.mesh.object);
		entry.mesh.dispose();
		this.foundations.delete(id);
		return true;
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
	}
}
