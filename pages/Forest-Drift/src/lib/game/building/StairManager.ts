import * as THREE from 'three';
import { buildingGridToLocal, foundationLocalFrame } from './FoundationLocalMath';
import { FoundationRootRegistry } from './FoundationRootRegistry';
import type { FoundationDefinition } from './FoundationTypes';
import { buildStairGeometry } from './StairGeometryBuilder';
import { computeStairMetrics, stairSideRectsLocal, stairTreadRectsLocal } from './stairMath';
import type { StairLocalBounds, StairTreadRect } from './stairMath';
import type { StairDefinition } from './StairTypes';
import type { WallCollisionRect } from './wallCollision';

const stairMaterial = new THREE.MeshStandardMaterial({
	color: 0xb9ac95,
	roughness: 0.85,
	metalness: 0.02,
	side: THREE.DoubleSide,
	flatShading: true
});
const boundsMaterial = new THREE.LineBasicMaterial({ color: 0xff9d4d });

/** Vertical extent (world units, above/below the run) each side-collision strip covers — generous enough to block a player at any point of the ascent, well past typical eye height. */
const SIDE_RECT_VERTICAL_MARGIN = 2.5;

interface StairEntry {
	definition: StairDefinition;
	mesh: THREE.Mesh;
	boundsHelper: THREE.LineSegments | null;
	/** World-space tread rects (top surface only) — the authoritative "where can the player stand/climb" data. */
	worldTreads: StairTreadRect[];
	/** World-space side-edge collision rects, in the same shape wall collision already uses. */
	collisionRects: WallCollisionRect[];
}

export interface StairManagerOptions {
	getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
}

/**
 * A stair's footprint is stored as grid-integer coordinates, exactly like a wall's endpoints — but
 * unlike a wall (which always converts via the LIVE building grid size), a stair's bounds must use
 * its OWN frozen `gridSizeAtCreation`, matching `computeStairMetrics`. Using the live setting here
 * instead would silently desync a stair's positioned bounds from its own step metrics the moment
 * the GUI's building grid size default changed after the stair was placed — the exact bug this
 * function's existence guards against.
 */
function localBoundsOf(definition: StairDefinition): StairLocalBounds {
	const gridSize = definition.gridSizeAtCreation;
	const min = buildingGridToLocal(
		{ gridX: definition.minGridX, gridZ: definition.minGridZ },
		gridSize
	);
	const max = buildingGridToLocal(
		{ gridX: definition.maxGridX, gridZ: definition.maxGridZ },
		gridSize
	);
	return {
		minLocalX: min.localX,
		maxLocalX: max.localX,
		minLocalZ: min.localZ,
		maxLocalZ: max.localZ
	};
}

/**
 * Owns every placed staircase's solid mesh + derived tread/collision data. One BuildingRoot per
 * foundation (via FoundationRootRegistry), same pattern SlabManager uses — see its doc comment.
 *
 * Unlike SlabManager, this never reads a *live* building grid size — a stair's footprint bounds AND
 * its step dimensions both always come from `definition.gridSizeAtCreation` (frozen at placement),
 * so an existing stair never resizes or shifts if the GUI default changes later.
 */
export class StairManager {
	readonly group: THREE.Group;

	private readonly getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	private readonly getVertexSpacing: () => number;
	private readonly roots: FoundationRootRegistry;

	private readonly stairs = new Map<string, StairEntry>();
	private showBounds = false;

	constructor(options: StairManagerOptions) {
		this.getFoundation = options.getFoundation;
		this.getVertexSpacing = options.getVertexSpacing;
		this.roots = new FoundationRootRegistry(this.getFoundation, this.getVertexSpacing);
		this.group = this.roots.group;
	}

	private buildEntry(definition: StairDefinition, existing?: StairEntry): StairEntry | null {
		const foundation = this.getFoundation(definition.foundationId);
		const root = this.roots.getOrCreate(definition.foundationId);
		if (!foundation || !root) return null;

		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		const bounds = localBoundsOf(definition);
		const metrics = computeStairMetrics(definition);

		const geometry = buildStairGeometry(bounds, definition.direction, definition.baseY, metrics);

		let mesh = existing?.mesh;
		if (mesh) {
			mesh.geometry.dispose();
			mesh.geometry = geometry;
		} else {
			mesh = new THREE.Mesh(geometry, stairMaterial);
			mesh.userData.foundationId = definition.foundationId;
			mesh.userData.stairId = definition.id;
			root.add(mesh);
		}

		const localTreads = stairTreadRectsLocal(
			bounds,
			definition.direction,
			definition.baseY,
			metrics
		);
		const worldTreads: StairTreadRect[] = localTreads.map((t) => ({
			minX: frame.originWorldX + t.minX,
			maxX: frame.originWorldX + t.maxX,
			minZ: frame.originWorldZ + t.minZ,
			maxZ: frame.originWorldZ + t.maxZ,
			topLocalY: frame.originWorldY + t.topLocalY
		}));

		const localSides = stairSideRectsLocal(bounds, metrics);
		const minWorldY = frame.originWorldY + definition.baseY - SIDE_RECT_VERTICAL_MARGIN;
		const maxWorldY =
			frame.originWorldY + definition.baseY + metrics.totalRise + SIDE_RECT_VERTICAL_MARGIN;
		const collisionRects: WallCollisionRect[] = localSides.map((s) => ({
			centerX: frame.originWorldX + s.centerX,
			centerZ: frame.originWorldZ + s.centerZ,
			halfLength: s.halfLength,
			halfThickness: s.halfThickness,
			dirX: s.dirX,
			dirZ: s.dirZ,
			minWorldY,
			maxWorldY
		}));

		const entry: StairEntry = {
			definition,
			mesh,
			boundsHelper: existing?.boundsHelper ?? null,
			worldTreads,
			collisionRects
		};
		this.refreshBoundsHelper(entry);
		return entry;
	}

	addStair(definition: StairDefinition): void {
		const entry = this.buildEntry(definition);
		if (entry) this.stairs.set(definition.id, entry);
	}

	removeStair(id: string): boolean {
		const entry = this.stairs.get(id);
		if (!entry) return false;
		entry.mesh.geometry.dispose();
		entry.mesh.removeFromParent();
		entry.boundsHelper?.geometry.dispose();
		this.stairs.delete(id);
		return true;
	}

	removeStairsForFoundation(foundationId: string): void {
		for (const [id, entry] of this.stairs) {
			if (entry.definition.foundationId === foundationId) this.removeStair(id);
		}
		this.roots.remove(foundationId);
	}

	getStair(id: string): StairDefinition | undefined {
		return this.stairs.get(id)?.definition;
	}

	getStairsForFoundation(foundationId: string): StairDefinition[] {
		return Array.from(this.stairs.values(), (entry) => entry.definition).filter(
			(stair) => stair.foundationId === foundationId
		);
	}

	getAllStairs(): StairDefinition[] {
		return Array.from(this.stairs.values(), (entry) => entry.definition);
	}

	/**
	 * Every tread top surface at (worldX, worldZ) — used by WorldSurfaceSampler with a wider
	 * "maxStepHeight" tolerance (rather than its usual small epsilon) so walking horizontally into a
	 * step within reach auto-climbs it, the same way a real staircase works, without jumping.
	 */
	getStepSurfacesAt(worldX: number, worldZ: number): number[] {
		const tops: number[] = [];
		for (const entry of this.stairs.values()) {
			for (const tread of entry.worldTreads) {
				if (
					worldX >= tread.minX &&
					worldX <= tread.maxX &&
					worldZ >= tread.minZ &&
					worldZ <= tread.maxZ
				) {
					tops.push(tread.topLocalY);
				}
			}
		}
		return tops;
	}

	/** Every stair's side-edge collision rects, in the same shape/consumer (`resolvePlayerPositionAgainstWalls`) wall collision already uses — see StairManager's class doc comment for why only the sides (not the full stepped volume) are represented this way. */
	getAllCollisionRects(): WallCollisionRect[] {
		const rects: WallCollisionRect[] = [];
		for (const entry of this.stairs.values()) rects.push(...entry.collisionRects);
		return rects;
	}

	setShowBounds(visible: boolean): void {
		this.showBounds = visible;
		for (const entry of this.stairs.values()) this.refreshBoundsHelper(entry);
	}

	private refreshBoundsHelper(entry: StairEntry): void {
		entry.boundsHelper?.geometry.dispose();
		if (entry.boundsHelper) entry.mesh.remove(entry.boundsHelper);
		entry.boundsHelper = null;
		if (!this.showBounds) return;
		const edges = new THREE.EdgesGeometry(entry.mesh.geometry);
		entry.boundsHelper = new THREE.LineSegments(edges, boundsMaterial);
		entry.mesh.add(entry.boundsHelper);
	}

	/** Plain, serializable world-state — never Three.js objects. */
	serialize(): StairDefinition[] {
		return this.getAllStairs();
	}

	/** Replaces all current stairs with the given definitions — trusts the input, same as SlabManager.load(). */
	load(definitions: readonly StairDefinition[]): void {
		for (const id of Array.from(this.stairs.keys())) this.removeStair(id);
		for (const definition of definitions) this.addStair(definition);
	}

	dispose(): void {
		for (const id of Array.from(this.stairs.keys())) this.removeStair(id);
		this.roots.dispose();
	}
}
