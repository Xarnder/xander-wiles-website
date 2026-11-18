/**
 * Pure basement maths (Basements and Joined Foundations, technical plan §4.1). Everything here is
 * derived from a foundation's `basement` field: no Three.js, no managers, so the walls, floors,
 * footing, storeys and collision all come out of one place and agree.
 *
 * Local coordinates are the foundation's own frame (FoundationLocalMath): origin at the footprint's
 * min corner, Y = 0 at `topY`. A basement with `storeys` n and `storeyHeight` h is `D = n × h` deep:
 *
 * ```text
 *   Y = 0          ┌──────── deck (slab, role 'deck') ────────┐   foundation top: Ground Floor
 *   Y = −0.25      │ retaining walls ↓                        │
 *   Y = −h         ├──── basement floor (slab) ───────────────┤   level −1 base (n ≥ 2)
 *   Y = −2h        ├──── basement floor (slab) ───────────────┤   level −2 base (n = 3)
 *   Y = −D         └──────────── footing top: lowest floor ───┘   level −n base
 *   bottomY ≤ −D − 0.5   footing
 * ```
 *
 * Storeys follow the rules of storeys above ground: level −k's walls are `h` tall, and the slab
 * over it has its top at that level's wall top, so a basement storey behaves like any other.
 */

import type { BuildingGridPoint } from './FoundationLocalMath';
import type { FoundationDefinition } from './FoundationTypes';
import type { SlabType } from './SlabTypes';
import type { WallCollisionRect } from './wallCollision';
import {
	DECK_THICKNESS,
	FOOTING_DEPTH,
	RETAINING_WALL_THICKNESS,
	type BasementDefinition,
	type BasementSlabRole
} from './basementTypes';

/** Matches FoundationManager's containment tolerance, so the two never disagree at an edge. */
const EDGE_TOLERANCE = 0.001;

export interface WorldRect {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

/** Total depth from the foundation top to the lowest floor. */
export function basementDepth(basement: BasementDefinition): number {
	return basement.storeys * basement.storeyHeight;
}

/** Level −k of a basement (k = 1 … storeys), or `null` for any other index. */
export function basementLevel(
	basement: BasementDefinition,
	index: number
): { baseY: number; wallHeight: number } | null {
	if (!Number.isInteger(index) || index >= 0 || -index > basement.storeys) return null;
	return { baseY: index * basement.storeyHeight, wallHeight: basement.storeyHeight };
}

const BASEMENT_LEVEL_NAMES = ['Basement', 'Lower Basement', 'Deep Basement'];

/** "Basement", "Lower Basement", "Deep Basement" for levels −1, −2, −3; `null` otherwise. */
export function basementLevelName(index: number): string | null {
	if (!Number.isInteger(index) || index >= 0) return null;
	return BASEMENT_LEVEL_NAMES[-index - 1] ?? null;
}

/** World Y of the lowest floor (the footing's top). */
export function basementLowestFloorY(foundation: FoundationDefinition): number | null {
	if (!foundation.basement) return null;
	return foundation.topY - basementDepth(foundation.basement);
}

/** World Y of the deck's underside: anyone below it in the interior is in the basement. */
export function basementDeckUndersideY(foundation: FoundationDefinition): number {
	return foundation.topY - DECK_THICKNESS;
}

/**
 * The bottom the footing needs: the authored `bottomY`, lowered to at least `FOOTING_DEPTH` below
 * the lowest floor. Derived, never written into `bottomY` (which is re-grounded locally and never
 * travels online as a patch).
 */
export function basementFootingBottomY(foundation: FoundationDefinition): number {
	const lowest = basementLowestFloorY(foundation);
	if (lowest === null) return foundation.bottomY;
	return Math.min(foundation.bottomY, lowest - FOOTING_DEPTH);
}

/** A slab a basement creates, in the foundation's local frame (building-grid points). */
export interface BasementSlabPlan {
	type: SlabType;
	role: BasementSlabRole;
	levelIndex: number;
	localY: number;
	thickness: number;
	points: BuildingGridPoint[];
}

/**
 * The deck and the floors between storeys. Each covers the whole footprint (math-CCW, as
 * `slabMath.normalizeWinding` gives), with `levelIndex` set as the Ceiling and Floor tools set it:
 * the storey the slab was drawn from, whose wall top is the slab's top.
 *
 * Returns `[]` when the footprint isn't a whole number of building-grid steps (a world whose terrain
 * spacing doesn't divide by the building grid). Basements are then not offered.
 */
export function basementSlabPlans(
	foundation: FoundationDefinition,
	vertexSpacing: number,
	buildingGridSize: number,
	floorThickness: number
): BasementSlabPlan[] {
	const basement = foundation.basement;
	if (!basement) return [];
	const cellsX = ((foundation.maxGridX - foundation.minGridX) * vertexSpacing) / buildingGridSize;
	const cellsZ = ((foundation.maxGridZ - foundation.minGridZ) * vertexSpacing) / buildingGridSize;
	const gridX = Math.round(cellsX);
	const gridZ = Math.round(cellsZ);
	if (Math.abs(cellsX - gridX) > 1e-6 || Math.abs(cellsZ - gridZ) > 1e-6) return [];
	const points = (): BuildingGridPoint[] => [
		{ gridX: 0, gridZ: 0 },
		{ gridX: gridX, gridZ: 0 },
		{ gridX: gridX, gridZ: gridZ },
		{ gridX: 0, gridZ: gridZ }
	];
	const plans: BasementSlabPlan[] = [
		{
			type: 'ceiling',
			role: 'deck',
			levelIndex: -1,
			localY: 0,
			thickness: DECK_THICKNESS,
			points: points()
		}
	];
	for (let k = 1; k < basement.storeys; k++) {
		plans.push({
			type: 'floor',
			role: 'basement-floor',
			levelIndex: -(k + 1),
			localY: -k * basement.storeyHeight,
			thickness: floorThickness,
			points: points()
		});
	}
	return plans;
}

/** The footprint in world metres. */
export function foundationWorldRect(
	foundation: Pick<FoundationDefinition, 'minGridX' | 'maxGridX' | 'minGridZ' | 'maxGridZ'>,
	vertexSpacing: number
): WorldRect {
	return {
		minX: foundation.minGridX * vertexSpacing,
		maxX: foundation.maxGridX * vertexSpacing,
		minZ: foundation.minGridZ * vertexSpacing,
		maxZ: foundation.maxGridZ * vertexSpacing
	};
}

/** Inside the retaining walls, in world metres. */
export function basementInteriorRect(
	foundation: FoundationDefinition,
	vertexSpacing: number
): WorldRect {
	const r = foundationWorldRect(foundation, vertexSpacing);
	const t = RETAINING_WALL_THICKNESS;
	return { minX: r.minX + t, maxX: r.maxX - t, minZ: r.minZ + t, maxZ: r.maxZ - t };
}

/**
 * Where (worldX, worldZ) falls on a basement foundation:
 * - `'interior'`: inside the retaining walls, where the lowest floor replaces terrain and the
 *   foundation top as unconditional ground, and the deck is an ordinary slab;
 * - `'ring'`: on top of the retaining walls, which stay unconditional foundation-top ground as on
 *   a solid foundation, so walking up to a house from lower ground still steps onto it;
 * - `null`: off the footprint, or the foundation has no basement.
 */
export function basementRegionAt(
	foundation: FoundationDefinition,
	vertexSpacing: number,
	worldX: number,
	worldZ: number
): 'interior' | 'ring' | null {
	if (!foundation.basement) return null;
	// Allocation-free: this runs for every foundation on every walking query.
	const minX = foundation.minGridX * vertexSpacing;
	const maxX = foundation.maxGridX * vertexSpacing;
	const minZ = foundation.minGridZ * vertexSpacing;
	const maxZ = foundation.maxGridZ * vertexSpacing;
	if (
		worldX < minX - EDGE_TOLERANCE ||
		worldX > maxX + EDGE_TOLERANCE ||
		worldZ < minZ - EDGE_TOLERANCE ||
		worldZ > maxZ + EDGE_TOLERANCE
	)
		return null;
	const t = RETAINING_WALL_THICKNESS;
	return worldX > minX + t && worldX < maxX - t && worldZ > minZ + t && worldZ < maxZ - t
		? 'interior'
		: 'ring';
}

/**
 * The four retaining walls as rects, from the lowest floor to the deck's underside: drawn as the
 * basement's stone, and kept out of by the camera. A player standing in the basement is kept in by
 * `FoundationManager.containInBasement` instead (a clamp can't be stepped through at a low frame
 * rate); a player outside never meets them, and steps up onto the house over the ring.
 */
export function basementRetainingWallRects(
	foundation: FoundationDefinition,
	vertexSpacing: number
): WallCollisionRect[] {
	const lowest = basementLowestFloorY(foundation);
	if (lowest === null) return [];
	const r = foundationWorldRect(foundation, vertexSpacing);
	const half = RETAINING_WALL_THICKNESS / 2;
	const minWorldY = lowest;
	const maxWorldY = basementDeckUndersideY(foundation);
	const width = r.maxX - r.minX;
	const depth = r.maxZ - r.minZ;
	const midX = (r.minX + r.maxX) / 2;
	const midZ = (r.minZ + r.maxZ) / 2;
	const along = (centerX: number, centerZ: number, halfLength: number, dirX: number) => ({
		centerX,
		centerZ,
		halfLength,
		halfThickness: half,
		dirX,
		dirZ: dirX === 1 ? 0 : 1,
		minWorldY,
		maxWorldY
	});
	return [
		along(midX, r.minZ + half, width / 2, 1),
		along(midX, r.maxZ - half, width / 2, 1),
		along(r.minX + half, midZ, depth / 2, 0),
		along(r.maxX - half, midZ, depth / 2, 0)
	];
}

/** A little below the foundation top, so pieces on the Ground Floor never count as in the basement. */
const BELOW_TOP = -1e-3;

/**
 * How many pieces stand in a foundation's basement: anything whose base is below the foundation
 * top (stairs: on a basement storey), except the deck and basement floors the basement came with. A basement can only be removed
 * when this is 0 ("Empty the basement first").
 */
export function basementOccupantCount(building: {
	walls: readonly { baseY: number }[];
	wallPaths: readonly { baseY: number }[];
	slabs: readonly { localY: number; role?: BasementSlabRole }[];
	stairs: readonly { levelIndex: number }[];
	roofs: readonly { baseY: number }[];
	floorDetails?: readonly { hostY: number }[];
	skirtingRuns?: readonly { baseY: number }[];
}): number {
	let count = 0;
	for (const w of building.walls) if (w.baseY < BELOW_TOP) count++;
	for (const p of building.wallPaths) if (p.baseY < BELOW_TOP) count++;
	for (const s of building.slabs) if (!s.role && s.localY < BELOW_TOP) count++;
	// By storey, not height: an approach stair beside the house starts below its top on the Ground Floor.
	for (const s of building.stairs) if (s.levelIndex < 0) count++;
	for (const r of building.roofs) if (r.baseY < BELOW_TOP) count++;
	for (const d of building.floorDetails ?? []) if (d.hostY < BELOW_TOP) count++;
	for (const r of building.skirtingRuns ?? []) if (r.baseY < BELOW_TOP) count++;
	return count;
}
