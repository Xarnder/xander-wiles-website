import { buildingGridToLocal } from './FoundationLocalMath';
import type { FoundationLocalFrame } from './FoundationLocalMath';
import type { WallOpeningDefinition } from './WallTypes';

const EPSILON = 1e-6;

export interface WallEndpoints {
	startGridX: number;
	startGridZ: number;
	endGridX: number;
	endGridZ: number;
}

/** Wall length in world units, derived from its grid endpoints — never stored directly. */
export function computeWallLength(endpoints: WallEndpoints, buildingGridSize: number): number {
	const start = buildingGridToLocal(
		{ gridX: endpoints.startGridX, gridZ: endpoints.startGridZ },
		buildingGridSize
	);
	const end = buildingGridToLocal(
		{ gridX: endpoints.endGridX, gridZ: endpoints.endGridZ },
		buildingGridSize
	);
	return Math.hypot(end.localX - start.localX, end.localZ - start.localZ);
}

/**
 * A wall's placement in world space, derived entirely from its foundation-local endpoints plus
 * the foundation's own frame — never stored. `headingRadians` is the wall's direction as
 * `atan2(dz, dx)` in foundation-local (== world, since foundations are axis-aligned) X/Z space;
 * `dirX/dirZ` is the corresponding unit vector, reused by every world-space conversion below so
 * nothing has to re-derive it (or fight Three.js's Y-rotation matrix sign convention — see
 * WallGeometryBuilder.ts for the one place that does).
 */
export interface WallTransform {
	originWorldX: number;
	originWorldY: number;
	originWorldZ: number;
	headingRadians: number;
	dirX: number;
	dirZ: number;
	length: number;
}

/**
 * `baseY` shifts the wall's local Y=0 origin above the foundation top — 0 for a ground-floor wall
 * (the historical, still-default behaviour), a building level's `baseY` for an upper-storey one.
 * Still measured from the same foundation-local Y=0 the frame itself is anchored to — see
 * BuildingLevelManager's doc comment.
 */
export function computeWallTransform(
	wall: WallEndpoints,
	frame: FoundationLocalFrame,
	buildingGridSize: number,
	baseY = 0
): WallTransform {
	const start = buildingGridToLocal(
		{ gridX: wall.startGridX, gridZ: wall.startGridZ },
		buildingGridSize
	);
	const end = buildingGridToLocal({ gridX: wall.endGridX, gridZ: wall.endGridZ }, buildingGridSize);
	const dx = end.localX - start.localX;
	const dz = end.localZ - start.localZ;
	const length = Math.hypot(dx, dz);
	const headingRadians = Math.atan2(dz, dx);

	return {
		originWorldX: frame.originWorldX + start.localX,
		originWorldY: frame.originWorldY + baseY,
		originWorldZ: frame.originWorldZ + start.localZ,
		headingRadians,
		dirX: length > EPSILON ? dx / length : Math.cos(headingRadians),
		dirZ: length > EPSILON ? dz / length : Math.sin(headingRadians),
		length
	};
}

/** Converts a wall-local (U along the wall, Y vertical, thickness offset perpendicular to the wall) point to world space. */
export function wallLocalToWorld(
	transform: WallTransform,
	u: number,
	y: number,
	thicknessOffset = 0
): { worldX: number; worldY: number; worldZ: number } {
	// Perpendicular = 90° rotation of (dirX, dirZ) in the X/Z plane — matches the local +Z axis of
	// the mesh built by WallGeometryBuilder (see its rotation.y derivation for why this is the pair
	// that stays consistent with Three.js's actual rotation matrix).
	const perpX = -transform.dirZ;
	const perpZ = transform.dirX;
	return {
		worldX: transform.originWorldX + transform.dirX * u + perpX * thicknessOffset,
		worldY: transform.originWorldY + y,
		worldZ: transform.originWorldZ + transform.dirZ * u + perpZ * thicknessOffset
	};
}

/** Converts a world point into a wall's local (U, Y) coordinates — the inverse of wallLocalToWorld's U/Y axes. */
export function worldToWallLocal(
	transform: WallTransform,
	worldX: number,
	worldY: number,
	worldZ: number
): { u: number; y: number } {
	const relX = worldX - transform.originWorldX;
	const relZ = worldZ - transform.originWorldZ;
	return {
		u: relX * transform.dirX + relZ * transform.dirZ,
		y: worldY - transform.originWorldY
	};
}

export interface OpeningRect {
	minU: number;
	maxU: number;
	minY: number;
	maxY: number;
}

/** Merges overlapping/touching intervals and sorts them — the shared building block for interval subtraction below. */
function mergeIntervals(intervals: readonly [number, number][]): [number, number][] {
	if (intervals.length === 0) return [];
	const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		const last = merged[merged.length - 1];
		const [start, end] = sorted[i];
		if (start <= last[1] + EPSILON) {
			last[1] = Math.max(last[1], end);
		} else {
			merged.push([start, end]);
		}
	}
	return merged;
}

/** [base] minus every interval in [cuts], both as [start, end) pairs — the remaining solid Y-spans in one wall strip. */
function subtractIntervals(
	base: readonly [number, number][],
	cuts: readonly [number, number][]
): [number, number][] {
	const mergedCuts = mergeIntervals(cuts);
	let remaining = base.map((interval): [number, number] => [...interval]);

	for (const [cutStart, cutEnd] of mergedCuts) {
		const next: [number, number][] = [];
		for (const [start, end] of remaining) {
			if (cutEnd <= start + EPSILON || cutStart >= end - EPSILON) {
				// No overlap with this cut.
				next.push([start, end]);
				continue;
			}
			if (cutStart > start + EPSILON) next.push([start, cutStart]);
			if (cutEnd < end - EPSILON) next.push([cutEnd, end]);
		}
		remaining = next;
	}

	return remaining;
}

export interface SolidWallSegment {
	minU: number;
	maxU: number;
	minY: number;
	maxY: number;
}

/**
 * The core "no destructive CSG" algorithm: given a wall's length/height and its (already-valid,
 * non-overlapping) openings, returns the rectangular solid regions that remain. Strategy —
 * 1. collect every opening's minU/maxU plus the wall's own 0/length as strip boundaries
 * 2. sort + dedupe them into vertical strips
 * 3. for each strip, find openings that fully span it and subtract their Y-ranges from [0, height]
 * 4. emit one solid segment per remaining Y-interval per strip
 *
 * This supports any number of non-overlapping openings (including stacked ones at different U
 * ranges within the same strip) without ever mutating wall geometry destructively — the wall mesh
 * and its collision are always rebuilt fresh from this function. Deterministic and pure, so it's
 * directly unit-testable without Three.js.
 */
export function computeSolidWallSegments(
	wallLength: number,
	wallHeight: number,
	openings: readonly OpeningRect[]
): SolidWallSegment[] {
	if (wallLength <= EPSILON || wallHeight <= EPSILON) return [];

	const boundarySet = new Set<number>([0, wallLength]);
	for (const opening of openings) {
		boundarySet.add(Math.min(Math.max(opening.minU, 0), wallLength));
		boundarySet.add(Math.min(Math.max(opening.maxU, 0), wallLength));
	}
	const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

	const segments: SolidWallSegment[] = [];
	for (let i = 0; i < boundaries.length - 1; i++) {
		const stripStart = boundaries[i];
		const stripEnd = boundaries[i + 1];
		if (stripEnd - stripStart <= EPSILON) continue;

		const stripMid = (stripStart + stripEnd) / 2;
		const spanningCuts: [number, number][] = [];
		for (const opening of openings) {
			if (opening.minU <= stripMid && opening.maxU >= stripMid) {
				spanningCuts.push([Math.max(0, opening.minY), Math.min(wallHeight, opening.maxY)]);
			}
		}

		const solidYIntervals = subtractIntervals([[0, wallHeight]], spanningCuts);
		for (const [minY, maxY] of solidYIntervals) {
			if (maxY - minY > EPSILON) {
				segments.push({ minU: stripStart, maxU: stripEnd, minY, maxY });
			}
		}
	}

	return segments;
}

export interface WallFootprintValidationResult {
	valid: boolean;
	reason?: string;
}

/** Rejects zero-length walls and anything shorter than the configured minimum — checked before ever constructing a WallDefinition. */
export function validateWallLength(
	endpoints: WallEndpoints,
	buildingGridSize: number,
	minimumWallLength: number
): WallFootprintValidationResult {
	const length = computeWallLength(endpoints, buildingGridSize);
	if (length <= EPSILON) return { valid: false, reason: 'Start and end point are the same' };
	if (length < minimumWallLength - EPSILON) {
		return { valid: false, reason: `Wall must be at least ${minimumWallLength.toFixed(2)}m` };
	}
	return { valid: true };
}

/**
 * An opening must sit fully inside the wall, with clearance from both ends and top/bottom.
 * `startMargin`/`endMargin` can differ — a wall-path segment's joined end needs the wider
 * `cornerOpeningMargin` while its unjoined end (an open path's bare endpoint) only needs the plain
 * `openingEdgeMargin`; a standalone wall (or a call that only passes one margin) uses the same
 * value for both, unchanged from before this had two parameters.
 */
export function isOpeningWithinWallBounds(
	opening: OpeningRect,
	wallLength: number,
	wallHeight: number,
	startMargin: number,
	endMargin: number = startMargin
): boolean {
	return (
		opening.minU >= startMargin - EPSILON &&
		opening.maxU <= wallLength - endMargin + EPSILON &&
		opening.minY >= -EPSILON &&
		opening.maxY <= wallHeight + EPSILON
	);
}

/** Rectangle-intersection test in wall-local U/Y space, with an optional required clearance between the two openings. */
export function doOpeningsOverlap(a: OpeningRect, b: OpeningRect, spacing = 0): boolean {
	const overlapsU = a.minU - spacing < b.maxU && a.maxU + spacing > b.minU;
	const overlapsY = a.minY - spacing < b.maxY && a.maxY + spacing > b.minY;
	return overlapsU && overlapsY;
}

/** Every one of `existingOpenings` must not overlap `candidate`, honoring the configured minimum spacing. */
export function findOverlappingOpening(
	candidate: OpeningRect,
	existingOpenings: readonly WallOpeningDefinition[],
	spacing: number
): WallOpeningDefinition | undefined {
	return existingOpenings.find((existing) => doOpeningsOverlap(candidate, existing, spacing));
}
