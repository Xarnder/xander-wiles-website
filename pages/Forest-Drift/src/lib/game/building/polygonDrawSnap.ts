import type { BuildingGridPoint } from './FoundationLocalMath';

/**
 * Shared "press C to snap" behavior for every tool that draws a sequence of foundation-local grid
 * points — Wall Tool, Polygon/Continuous Wall Tool, and the Ceiling/Floor/Flat Roof tools (all
 * three via `SlabToolBase`). Framework- and Three.js-free, same rule as every other math module in
 * this project, so the snapping decision is directly unit-testable independent of any one tool's
 * raycasting/rendering.
 *
 * Four modes, cycled by repeatedly pressing `C`:
 * - `'off'` — the raw grid-snapped hover point is used as-is (today's behavior).
 * - `'axis'` — the segment from the last confirmed point is forced to be perfectly horizontal or
 *   vertical (whichever the raw drag direction is closer to), instead of an arbitrary diagonal.
 * - `'axis-inline'` — the same axis constraint, PLUS: if the point's "moving" coordinate (the one
 *   not locked by the axis constraint) is close to matching an EARLIER confirmed point's
 *   corresponding coordinate, it snaps exactly to that value instead of the raw one — e.g. so the
 *   last wall of a room can close flush with the very first corner, or a new wall can line up with
 *   one built several segments ago. Only meaningfully different from `'axis'` once at least 3
 *   points have already been confirmed (an "earlier point" to align with has to exist at all,
 *   distinct from the immediately-previous point the axis constraint already locks against).
 * - `'wall-corners'` — snaps to the nearest corner of a wall/wall-path on the SAME level, so a
 *   Ceiling/Floor/Roof polygon can be traced exactly over the room it covers instead of eyeballing
 *   where a wall corner sits on an otherwise-invisible plane above it (see
 *   `snapToNearestCorner` below). Only meaningful for the slab tools — Wall/Polygon Wall Tool never
 *   offer it (see `cycleSnapMode`'s `wallCornersAvailable` parameter) since a wall has no "wall
 *   below itself" to align with.
 */
export type SnapMode = 'off' | 'axis' | 'axis-inline' | 'wall-corners';

/**
 * Cycles `off -> axis -> axis-inline -> wall-corners -> off`, skipping any step that wouldn't
 * currently do anything different from `'off'`: `'axis-inline'` needs at least 3 confirmed points
 * to be distinguishable from plain `'axis'`, and `'wall-corners'` only makes sense for a caller that
 * passes `wallCornersAvailable: true` (the slab tools, and only when there's at least one wall
 * corner on the current level to actually snap to) — Wall/Polygon Wall Tool never pass it, so they
 * keep their original `off -> axis -> off` (or `-> axis-inline ->`) cycle unchanged.
 */
export function cycleSnapMode(
	current: SnapMode,
	confirmedPointCount: number,
	wallCornersAvailable = false
): SnapMode {
	if (current === 'off') return 'axis';
	if (current === 'axis') {
		if (confirmedPointCount >= 3) return 'axis-inline';
		return wallCornersAvailable ? 'wall-corners' : 'off';
	}
	if (current === 'axis-inline') return wallCornersAvailable ? 'wall-corners' : 'off';
	return 'off'; // 'wall-corners' -> 'off'
}

/** How close (in grid cells) an "inline" candidate coordinate must be to snap to it — small enough that it only fires for a clearly-intended alignment, not any nearby point. */
const INLINE_SNAP_TOLERANCE_CELLS = 6;

/** How close (in grid cells, Euclidean) a wall corner must be to snap to it — a bit more generous than the inline tolerance since aiming at an invisible plane above a room is naturally less precise than aiming at the ground. */
const WALL_CORNER_SNAP_TOLERANCE_CELLS = 10;

/**
 * Snaps a raw (already grid-quantized) hover point against the points already confirmed in the
 * current path, per `mode` — see the module doc comment. `points` must be in drawing order; the
 * LAST entry is what the axis constraint locks against, and is excluded from the "earlier point"
 * search `'axis-inline'` performs (aligning with itself would be a no-op, and `'axis'` already
 * privileges it exclusively). `'wall-corners'` is intentionally NOT handled here — unlike the other
 * modes, it needs external wall data this module doesn't have, so it passes the raw point through
 * unchanged; callers apply `snapToNearestCorner` themselves instead when that mode is active (see
 * `SlabToolBase.update()`).
 */
export function snapDrawingPoint(
	points: readonly BuildingGridPoint[],
	raw: BuildingGridPoint,
	mode: SnapMode
): BuildingGridPoint {
	if (mode === 'off' || mode === 'wall-corners' || points.length === 0) return raw;

	const last = points[points.length - 1];
	const dx = raw.gridX - last.gridX;
	const dz = raw.gridZ - last.gridZ;
	if (dx === 0 && dz === 0) return raw;

	// Whichever axis the raw drag is closer to wins; ties favor X. Locking the OTHER axis to the
	// last point's own coordinate is what forces the segment to be perfectly horizontal/vertical.
	const runsAlongX = Math.abs(dx) >= Math.abs(dz);
	let snapped: BuildingGridPoint = runsAlongX
		? { gridX: raw.gridX, gridZ: last.gridZ }
		: { gridX: last.gridX, gridZ: raw.gridZ };

	if (mode === 'axis-inline' && points.length >= 3) {
		const earlierPoints = points.slice(0, -1);
		if (runsAlongX) {
			const inlineX = closestMatchingCoordinate(earlierPoints, (p) => p.gridX, snapped.gridX);
			if (inlineX !== null) snapped = { gridX: inlineX, gridZ: last.gridZ };
		} else {
			const inlineZ = closestMatchingCoordinate(earlierPoints, (p) => p.gridZ, snapped.gridZ);
			if (inlineZ !== null) snapped = { gridX: last.gridX, gridZ: inlineZ };
		}
	}

	return snapped;
}

/** The value of `extract(p)`, among `points`, closest to `target` and within `INLINE_SNAP_TOLERANCE_CELLS` — or `null` if none qualify. */
function closestMatchingCoordinate(
	points: readonly BuildingGridPoint[],
	extract: (p: BuildingGridPoint) => number,
	target: number
): number | null {
	let best: number | null = null;
	let bestDistance = Infinity;
	for (const point of points) {
		const value = extract(point);
		const distance = Math.abs(value - target);
		if (distance <= INLINE_SNAP_TOLERANCE_CELLS && distance < bestDistance) {
			best = value;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * The corner in `corners` closest to `raw` (Euclidean distance in grid cells), or `raw` unchanged
 * if none fall within `WALL_CORNER_SNAP_TOLERANCE_CELLS` — used by the slab tools' `'wall-corners'`
 * mode. Kept as a plain nearest-point search (no axis constraint) since a wall corner is a specific
 * point to land on exactly, not a direction to align with.
 */
export function snapToNearestCorner(
	raw: BuildingGridPoint,
	corners: readonly BuildingGridPoint[]
): BuildingGridPoint {
	let best: BuildingGridPoint | null = null;
	let bestDistanceSquared = WALL_CORNER_SNAP_TOLERANCE_CELLS * WALL_CORNER_SNAP_TOLERANCE_CELLS;
	for (const corner of corners) {
		const dx = corner.gridX - raw.gridX;
		const dz = corner.gridZ - raw.gridZ;
		const distanceSquared = dx * dx + dz * dz;
		if (distanceSquared <= bestDistanceSquared) {
			best = corner;
			bestDistanceSquared = distanceSquared;
		}
	}
	return best ?? raw;
}

/** Short label for the current mode, for the build-tool HUD. */
export function snapModeLabel(mode: SnapMode): string | null {
	switch (mode) {
		case 'off':
			return null;
		case 'axis':
			return 'Snap: Axis';
		case 'axis-inline':
			return 'Snap: Axis + Inline';
		case 'wall-corners':
			return 'Snap: Wall Corners';
	}
}
