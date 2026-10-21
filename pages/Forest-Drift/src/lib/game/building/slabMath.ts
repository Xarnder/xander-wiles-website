/**
 * Pure 2D polygon math for horizontal slabs (ceilings/floors/flat roofs) — validation, winding
 * normalization, and point-in-polygon containment. Framework- and Three.js-free, same rule as
 * wallPathMath.ts, which this reuses directly for self-intersection (a slab polygon is exactly a
 * *closed* wall path's point list, geometrically) rather than re-implementing it.
 */

import { pathSelfIntersects } from './wallPathMath';
import type { Point2D } from './wallPathMath';

const EPSILON = 1e-6;

/** Signed area via the shoelace formula — positive for a "math-CCW" winding (X right, Z as the "up" axis of a standard 2D plot), negative for CW. Magnitude is twice the polygon's true area. */
export function signedArea2D(points: readonly Point2D[]): number {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		sum += a.x * b.z - b.x * a.z;
	}
	return sum / 2;
}

/**
 * Returns the polygon with math-CCW winding (positive signed area), reversing it if necessary.
 * `SlabGeometryBuilder` requires this fixed winding so a fixed set of triangle-index rules produces
 * correct up/down-facing normals regardless of which direction the user drew the polygon in.
 */
export function ensureCCW(points: readonly Point2D[]): Point2D[] {
	return signedArea2D(points) < 0 ? [...points].reverse() : [...points];
}

/** Standard ray-casting point-in-polygon test (even-odd rule) — works for convex and concave simple polygons alike. Points exactly on an edge are treated as inside (small epsilon tolerance). */
export function pointInPolygon2D(point: Point2D, polygon: readonly Point2D[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const pi = polygon[i];
		const pj = polygon[j];
		const onEdgeX =
			Math.min(pi.x, pj.x) - EPSILON <= point.x && point.x <= Math.max(pi.x, pj.x) + EPSILON;
		const onEdgeZ =
			Math.min(pi.z, pj.z) - EPSILON <= point.z && point.z <= Math.max(pi.z, pj.z) + EPSILON;
		if (onEdgeX && onEdgeZ) {
			// Close enough to the segment itself to just call it "inside" — avoids edge-case flicker
			// exactly on a boundary (e.g. a query point sitting right on a slab's own perimeter).
			const cross = (pj.x - pi.x) * (point.z - pi.z) - (pj.z - pi.z) * (point.x - pi.x);
			if (Math.abs(cross) < EPSILON * Math.max(1, Math.hypot(pj.x - pi.x, pj.z - pi.z)))
				return true;
		}

		const crossesZ = pi.z > point.z !== pj.z > point.z;
		if (crossesZ) {
			const xIntersect = ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z) + pi.x;
			if (point.x < xIntersect) inside = !inside;
		}
	}
	return inside;
}

/** True if a *closed* simple polygon's own edges cross each other — reuses wallPathMath's closed-path self-intersection check directly (a polygon is a closed point loop, geometrically identical to a closed wall path for this purpose). */
export function polygonSelfIntersects(points: readonly Point2D[]): boolean {
	return pathSelfIntersects(points, true);
}

/**
 * True only when two simple polygons share interior area. Shared edges and corners
 * are legal slab seams. Keep pointInPolygon2D boundary-inclusive for surface queries.
 */
export function polygonsOverlap(a: readonly Point2D[], b: readonly Point2D[]): boolean {
	if (a.length < 3 || b.length < 3) return false;
	const cross = (p: Point2D, q: Point2D, r: Point2D) =>
		(q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
	const opposite = (x: number, y: number) =>
		(x > EPSILON && y < -EPSILON) || (x < -EPSILON && y > EPSILON);

	// A proper edge crossing necessarily creates shared area. Touching endpoints
	// or collinear edges do not, so those are resolved by the interior test below.
	for (let i = 0; i < a.length; i++) {
		const p = a[i],
			q = a[(i + 1) % a.length];
		for (let j = 0; j < b.length; j++) {
			const r = b[j],
				s = b[(j + 1) % b.length];
			if (opposite(cross(p, q, r), cross(p, q, s)) && opposite(cross(r, s, p), cross(r, s, q)))
				return true;
		}
	}

	// Without proper crossings, edge ordering is fixed between consecutive vertex
	// heights. One scanline per band therefore covers containment, identical shapes,
	// concave polygons, and overlaps whose vertices all lie on the other boundary.
	const heights = [...new Set([...a, ...b].map((p) => p.z))].sort((x, y) => x - y);
	function crossings(polygon: readonly Point2D[], z: number): number[] {
		const xs: number[] = [];
		for (let i = 0; i < polygon.length; i++) {
			const p = polygon[i],
				q = polygon[(i + 1) % polygon.length];
			if (p.z > z !== q.z > z) {
				xs.push(p.x + ((z - p.z) * (q.x - p.x)) / (q.z - p.z));
			}
		}
		return xs.sort((x, y) => x - y);
	}
	for (let i = 1; i < heights.length; i++) {
		if (heights[i] - heights[i - 1] <= EPSILON) continue;
		const z = (heights[i] + heights[i - 1]) / 2;
		const ax = crossings(a, z),
			bx = crossings(b, z);
		for (let j = 0; j + 1 < ax.length; j += 2) {
			for (let k = 0; k + 1 < bx.length; k += 2) {
				if (Math.min(ax[j + 1], bx[k + 1]) - Math.max(ax[j], bx[k]) > EPSILON) return true;
			}
		}
	}
	return false;
}

export interface SlabPolygonValidationResult {
	valid: boolean;
	reason?: string;
}

/** Rejects fewer than 3 points, duplicate consecutive points (including the implicit closing pair), a degenerate (near-zero-area) polygon, and self-intersection — the full set of "is this a usable simple polygon" checks, independent of foundation bounds/overlap (those are checked separately since they need context this function doesn't have). */
export function validateSlabPolygon(points: readonly Point2D[]): SlabPolygonValidationResult {
	if (points.length < 3) {
		return { valid: false, reason: 'Need at least 3 points' };
	}

	for (let i = 0; i < points.length; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		if (Math.abs(a.x - b.x) < EPSILON && Math.abs(a.z - b.z) < EPSILON) {
			return { valid: false, reason: 'Duplicate point — a polygon edge cannot have zero length' };
		}
	}

	if (Math.abs(signedArea2D(points)) < EPSILON) {
		return { valid: false, reason: 'Polygon has zero area' };
	}

	if (polygonSelfIntersects(points)) {
		return { valid: false, reason: 'Polygon self-intersects' };
	}

	return { valid: true };
}
