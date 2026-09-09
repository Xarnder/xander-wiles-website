import type { StairFootprint, StairValidationResult } from './stairMath';
import { validateStairFootprint } from './stairMath';
import type { StairDirection } from './StairTypes';

/**
 * How far (in building-grid cells) past a foundation's footprint the stair tool will still
 * target and snap. Generous enough for a tall pad (rise = run), not so large that a look-ray
 * at distant terrain steals a foundation the player isn't building on.
 */
export const MAX_STAIR_EXTERIOR_CELLS = 48;

export function foundationGridCellCounts(
	width: number,
	depth: number,
	buildingGridSize: number
): { cellsX: number; cellsZ: number } {
	return {
		cellsX: Math.round(width / buildingGridSize),
		cellsZ: Math.round(depth / buildingGridSize)
	};
}

/** Entirely on (or on the edge of) the foundation's building-grid rectangle. */
export function isStairFootprintInterior(
	footprint: StairFootprint,
	cellsX: number,
	cellsZ: number
): boolean {
	return (
		footprint.minGridX >= 0 &&
		footprint.maxGridX <= cellsX &&
		footprint.minGridZ >= 0 &&
		footprint.maxGridZ <= cellsZ &&
		footprint.maxGridX > footprint.minGridX &&
		footprint.maxGridZ > footprint.minGridZ
	);
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
	return Math.min(a1, b1) - Math.max(a0, b0) > 0;
}

/**
 * If this footprint is a valid *approach* stair (body outside, landing line flush with one
 * foundation edge), the direction the stairs must ascend — onto the pad. `null` when the
 * rectangle is interior, degenerate, or not flush with exactly one edge.
 */
export function approachDirectionForFootprint(
	footprint: StairFootprint,
	cellsX: number,
	cellsZ: number
): StairDirection | null {
	const zOnEdge = rangesOverlap(footprint.minGridZ, footprint.maxGridZ, 0, cellsZ);
	const xOnEdge = rangesOverlap(footprint.minGridX, footprint.maxGridX, 0, cellsX);
	const matches: StairDirection[] = [];
	if (footprint.maxGridX === 0 && footprint.minGridX < 0 && zOnEdge) matches.push('+x');
	if (footprint.minGridX === cellsX && footprint.maxGridX > cellsX && zOnEdge) matches.push('-x');
	if (footprint.maxGridZ === 0 && footprint.minGridZ < 0 && xOnEdge) matches.push('+z');
	if (footprint.minGridZ === cellsZ && footprint.maxGridZ > cellsZ && xOnEdge) matches.push('-z');
	return matches.length === 1 ? matches[0] : null;
}

function slideRangeOnto(
	min: number,
	max: number,
	lo: number,
	hi: number
): { min: number; max: number } {
	const span = max - min;
	if (span <= 0) return { min, max };
	if (max > lo && min < hi) return { min, max };
	if (max <= lo) return { min: lo, max: lo + span };
	return { min: hi - span, max: hi };
}

function snapToApproach(
	footprint: StairFootprint,
	approach: StairDirection,
	cellsX: number,
	cellsZ: number
): StairFootprint {
	switch (approach) {
		case '+x': {
			const dx = 0 - footprint.maxGridX;
			const z = slideRangeOnto(footprint.minGridZ, footprint.maxGridZ, 0, cellsZ);
			return {
				minGridX: footprint.minGridX + dx,
				maxGridX: 0,
				minGridZ: z.min,
				maxGridZ: z.max
			};
		}
		case '-x': {
			const dx = cellsX - footprint.minGridX;
			const z = slideRangeOnto(footprint.minGridZ, footprint.maxGridZ, 0, cellsZ);
			return {
				minGridX: cellsX,
				maxGridX: footprint.maxGridX + dx,
				minGridZ: z.min,
				maxGridZ: z.max
			};
		}
		case '+z': {
			const dz = 0 - footprint.maxGridZ;
			const x = slideRangeOnto(footprint.minGridX, footprint.maxGridX, 0, cellsX);
			return {
				minGridX: x.min,
				maxGridX: x.max,
				minGridZ: footprint.minGridZ + dz,
				maxGridZ: 0
			};
		}
		case '-z': {
			const dz = cellsZ - footprint.minGridZ;
			const x = slideRangeOnto(footprint.minGridX, footprint.maxGridX, 0, cellsX);
			return {
				minGridX: x.min,
				maxGridX: x.max,
				minGridZ: cellsZ,
				maxGridZ: footprint.maxGridZ + dz
			};
		}
	}
}

/** Translates a straddling/overhanging rectangle fully onto the pad, preserving span. */
function clampInside(
	footprint: StairFootprint,
	cellsX: number,
	cellsZ: number
): StairFootprint | null {
	const spanX = footprint.maxGridX - footprint.minGridX;
	const spanZ = footprint.maxGridZ - footprint.minGridZ;
	if (spanX > cellsX || spanZ > cellsZ || spanX <= 0 || spanZ <= 0) return null;

	let minX = footprint.minGridX;
	let maxX = footprint.maxGridX;
	let minZ = footprint.minGridZ;
	let maxZ = footprint.maxGridZ;

	if (minX < 0) {
		maxX -= minX;
		minX = 0;
	}
	if (maxX > cellsX) {
		minX -= maxX - cellsX;
		maxX = cellsX;
	}
	if (minZ < 0) {
		maxZ -= minZ;
		minZ = 0;
	}
	if (maxZ > cellsZ) {
		minZ -= maxZ - cellsZ;
		maxZ = cellsZ;
	}
	return { minGridX: minX, maxGridX: maxX, minGridZ: minZ, maxGridZ: maxZ };
}

function translationCost(a: StairFootprint, b: StairFootprint): number {
	return (
		Math.abs(a.minGridX - b.minGridX) +
		Math.abs(a.maxGridX - b.maxGridX) +
		Math.abs(a.minGridZ - b.minGridZ) +
		Math.abs(a.maxGridZ - b.maxGridZ)
	);
}

/**
 * Magnets a live stair rectangle onto the foundation: interior footprints are left alone;
 * a small overshoot clamps back onto the pad; a rectangle that is mostly outside (or already
 * flush with an edge) snaps so its landing line sits on that edge and the flight sits on the
 * ground beside it.
 */
export function snapStairFootprintToFoundation(
	footprint: StairFootprint,
	cellsX: number,
	cellsZ: number
): { footprint: StairFootprint; approach: StairDirection | null } {
	if (footprint.maxGridX <= footprint.minGridX || footprint.maxGridZ <= footprint.minGridZ) {
		return { footprint, approach: null };
	}
	if (isStairFootprintInterior(footprint, cellsX, cellsZ)) {
		return { footprint, approach: null };
	}

	const already = approachDirectionForFootprint(footprint, cellsX, cellsZ);
	if (already) return { footprint, approach: already };

	const candidates: {
		footprint: StairFootprint;
		approach: StairDirection | null;
		cost: number;
	}[] = [];

	const clamped = clampInside(footprint, cellsX, cellsZ);
	if (clamped && isStairFootprintInterior(clamped, cellsX, cellsZ)) {
		candidates.push({
			footprint: clamped,
			approach: null,
			cost: translationCost(footprint, clamped)
		});
	}

	for (const approach of ['+x', '-x', '+z', '-z'] as const) {
		const snapped = snapToApproach(footprint, approach, cellsX, cellsZ);
		if (approachDirectionForFootprint(snapped, cellsX, cellsZ) === approach) {
			candidates.push({
				footprint: snapped,
				approach,
				cost: translationCost(footprint, snapped)
			});
		}
	}

	if (candidates.length === 0) return { footprint, approach: null };
	candidates.sort((a, b) => {
		if (a.cost !== b.cost) return a.cost - b.cost;
		if (a.approach === null && b.approach !== null) return -1;
		if (a.approach !== null && b.approach === null) return 1;
		return 0;
	});
	return { footprint: candidates[0].footprint, approach: candidates[0].approach };
}

export function isStairGridPointNearFoundation(
	gridX: number,
	gridZ: number,
	cellsX: number,
	cellsZ: number,
	maxExteriorCells = MAX_STAIR_EXTERIOR_CELLS
): boolean {
	const dx = gridX < 0 ? -gridX : gridX > cellsX ? gridX - cellsX : 0;
	const dz = gridZ < 0 ? -gridZ : gridZ > cellsZ ? gridZ - cellsZ : 0;
	return dx <= maxExteriorCells && dz <= maxExteriorCells;
}

/** Signed distance to the foundation AABB in foundation-local metres (0 = inside / on edge). */
export function distanceToFoundationLocal(
	localX: number,
	localZ: number,
	width: number,
	depth: number
): number {
	const dx = localX < 0 ? -localX : localX > width ? localX - width : 0;
	const dz = localZ < 0 ? -localZ : localZ > depth ? localZ - depth : 0;
	return Math.hypot(dx, dz);
}

/**
 * Interior stairs use the existing long-axis footprint rules. Approach stairs may run along
 * the short axis (a wide, short flight up onto a pad) but must be flush with one edge and
 * ascend toward the foundation.
 */
export function validateStairFoundationPlacement(
	footprint: StairFootprint,
	direction: StairDirection,
	cellsX: number,
	cellsZ: number,
	minimumWidthCells: number,
	minimumRunCells: number
): StairValidationResult {
	if (isStairFootprintInterior(footprint, cellsX, cellsZ)) {
		return validateStairFootprint(footprint, direction, minimumWidthCells, minimumRunCells);
	}

	const approach = approachDirectionForFootprint(footprint, cellsX, cellsZ);
	if (!approach) {
		return {
			valid: false,
			reason: 'Stair must sit on the foundation or snap to one of its edges'
		};
	}
	if (direction !== approach) {
		return { valid: false, reason: 'Approach stairs must ascend onto the foundation' };
	}

	const xCells = footprint.maxGridX - footprint.minGridX;
	const zCells = footprint.maxGridZ - footprint.minGridZ;
	const runAxis: 'x' | 'z' = approach === '+x' || approach === '-x' ? 'x' : 'z';
	const runCells = runAxis === 'x' ? xCells : zCells;
	const widthCells = runAxis === 'x' ? zCells : xCells;
	if (widthCells < minimumWidthCells) {
		return { valid: false, reason: `Stair width must be at least ${minimumWidthCells} grid cells` };
	}
	if (runCells < minimumRunCells) {
		return { valid: false, reason: `Stair run must be at least ${minimumRunCells} grid cells` };
	}
	return { valid: true };
}

/** Foundation-local centre of the bottom (lowest) end of the run. */
export function stairBottomCenterLocal(
	footprint: StairFootprint,
	direction: StairDirection,
	buildingGridSize: number
): { x: number; z: number } {
	const minX = footprint.minGridX * buildingGridSize;
	const maxX = footprint.maxGridX * buildingGridSize;
	const minZ = footprint.minGridZ * buildingGridSize;
	const maxZ = footprint.maxGridZ * buildingGridSize;
	const midX = (minX + maxX) / 2;
	const midZ = (minZ + maxZ) / 2;
	switch (direction) {
		case '+x':
			return { x: minX, z: midZ };
		case '-x':
			return { x: maxX, z: midZ };
		case '+z':
			return { x: midX, z: minZ };
		case '-z':
			return { x: midX, z: maxZ };
	}
}

/** Foundation-local Y of an approach stair's first tread, from terrain height at the bottom. */
export function approachStairBaseY(bottomWorldY: number, foundationTopY: number): number {
	return bottomWorldY - foundationTopY;
}
