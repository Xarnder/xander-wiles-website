import type { FoundationDefinition } from './FoundationTypes';

/**
 * Every foundation defines its own building-local coordinate system: origin at the footprint's
 * min-X/min-Z corner, local Y=0 at the foundation's top surface (`foundation.topY`). All building
 * elements (walls, and later floors/roofs/etc.) are authored and stored in THIS space, never in
 * arbitrary world coordinates — see the README's "Building system" section for why. This is the
 * one place that conversion happens, reused by every tool/manager instead of being duplicated.
 */
export interface FoundationLocalFrame {
	originWorldX: number;
	originWorldY: number;
	originWorldZ: number;
}

export function foundationLocalFrame(
	foundation: FoundationDefinition,
	vertexSpacing: number
): FoundationLocalFrame {
	return {
		originWorldX: foundation.minGridX * vertexSpacing,
		originWorldY: foundation.topY,
		originWorldZ: foundation.minGridZ * vertexSpacing
	};
}

/** The foundation footprint's size in the local X/Z plane — the building grid must stay within [0, width] x [0, depth]. */
export function foundationLocalSize(
	foundation: FoundationDefinition,
	vertexSpacing: number
): { width: number; depth: number } {
	return {
		width: (foundation.maxGridX - foundation.minGridX) * vertexSpacing,
		depth: (foundation.maxGridZ - foundation.minGridZ) * vertexSpacing
	};
}

export function foundationLocalToWorld(
	frame: FoundationLocalFrame,
	localX: number,
	localY: number,
	localZ: number
): { worldX: number; worldY: number; worldZ: number } {
	return {
		worldX: frame.originWorldX + localX,
		worldY: frame.originWorldY + localY,
		worldZ: frame.originWorldZ + localZ
	};
}

export function worldToFoundationLocal(
	frame: FoundationLocalFrame,
	worldX: number,
	worldY: number,
	worldZ: number
): { localX: number; localY: number; localZ: number } {
	return {
		localX: worldX - frame.originWorldX,
		localY: worldY - frame.originWorldY,
		localZ: worldZ - frame.originWorldZ
	};
}

/** One vertex of the fine, foundation-local building grid. Integer grid coordinates are authoritative — see snapLocalToBuildingGrid. */
export interface BuildingGridPoint {
	gridX: number;
	gridZ: number;
}

/** Snaps a foundation-local X/Z position to the nearest building-grid integer coordinate. Math.round (not floor) keeps it symmetric on both sides of the foundation origin. */
export function snapLocalToBuildingGrid(
	localX: number,
	localZ: number,
	buildingGridSize: number
): BuildingGridPoint {
	const gridX = Math.round(localX / buildingGridSize);
	const gridZ = Math.round(localZ / buildingGridSize);
	// Math.round can return -0 for small negative inputs — canonicalize so grid coordinates near
	// zero compare/serialize predictably (same reasoning as foundationMath.worldToGridCoord).
	return { gridX: gridX === 0 ? 0 : gridX, gridZ: gridZ === 0 ? 0 : gridZ };
}

export function buildingGridToLocal(
	point: BuildingGridPoint,
	buildingGridSize: number
): { localX: number; localZ: number } {
	return { localX: point.gridX * buildingGridSize, localZ: point.gridZ * buildingGridSize };
}

const BOUNDS_EPSILON = 1e-6;

/** Whether a building-grid point falls within (or on the edge of) the foundation's local footprint. */
export function isBuildingGridPointInsideFoundation(
	point: BuildingGridPoint,
	buildingGridSize: number,
	footprintWidth: number,
	footprintDepth: number
): boolean {
	const { localX, localZ } = buildingGridToLocal(point, buildingGridSize);
	return (
		localX >= -BOUNDS_EPSILON &&
		localX <= footprintWidth + BOUNDS_EPSILON &&
		localZ >= -BOUNDS_EPSILON &&
		localZ <= footprintDepth + BOUNDS_EPSILON
	);
}
