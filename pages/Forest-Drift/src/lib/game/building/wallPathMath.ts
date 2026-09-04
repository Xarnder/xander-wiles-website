/**
 * Pure 2D math for continuous "polygon wall" paths — computing clean miter/bevel corner joins
 * between connected wall segments, building each segment's join-aware footprint polygon, and
 * clipping/extruding that polygon into wall geometry. Framework- and Three.js-free, same rule as
 * every other math module in this project, so the join geometry is directly unit-testable.
 *
 * All of this operates in foundation-local X/Z (the same plane BuildingGridPoint/foundation-local
 * coordinates already live in) — see WallPathGeometryBuilder.ts for how a segment's resulting
 * footprint (still in that shared plane) gets projected into ITS OWN wall-local (U, T) space for
 * geometry generation, reusing the exact same wall-local convention wallGeometryMath.ts already
 * established for standalone walls.
 */

export interface Point2D {
	x: number;
	z: number;
}

const EPSILON = 1e-6;

export function add(a: Point2D, b: Point2D): Point2D {
	return { x: a.x + b.x, z: a.z + b.z };
}

export function sub(a: Point2D, b: Point2D): Point2D {
	return { x: a.x - b.x, z: a.z - b.z };
}

export function scale(a: Point2D, s: number): Point2D {
	return { x: a.x * s, z: a.z * s };
}

export function length2D(a: Point2D): number {
	return Math.hypot(a.x, a.z);
}

export function distance2D(a: Point2D, b: Point2D): number {
	return length2D(sub(a, b));
}

export function normalize2D(a: Point2D): Point2D {
	const len = length2D(a);
	return len > EPSILON ? { x: a.x / len, z: a.z / len } : { x: 1, z: 0 };
}

/** 90° left rotation of a direction vector — the consistent "left offset" convention every join/footprint calculation below is built on, regardless of overall path winding. */
export function perpLeft(dir: Point2D): Point2D {
	return { x: -dir.z, z: dir.x };
}

function offsetPoint(base: Point2D, direction: Point2D, distance: number): Point2D {
	return { x: base.x + direction.x * distance, z: base.z + direction.z * distance };
}

/** Intersection of line (p1 + t*dir1) and (p2 + s*dir2), or null if the lines are parallel. */
export function lineIntersection2D(
	p1: Point2D,
	dir1: Point2D,
	p2: Point2D,
	dir2: Point2D
): Point2D | null {
	const denom = dir1.x * dir2.z - dir1.z * dir2.x;
	if (Math.abs(denom) < EPSILON) return null;
	const t = ((p2.x - p1.x) * dir2.z - (p2.z - p1.z) * dir2.x) / denom;
	return { x: p1.x + t * dir1.x, z: p1.z + t * dir1.z };
}

export type WallJoinStyle = 'miter' | 'bevel';

export interface JoinPoints {
	/** 1 point for a miter (or a straight-through point); 2 points, in [incoming-side, outgoing-side] order, for a bevel. */
	left: Point2D[];
	right: Point2D[];
}

/**
 * The core corner-join calculation. Given the incoming segment's direction, the outgoing
 * segment's direction, the shared corner point, and half the wall thickness, returns the point(s)
 * each side (left/right, per perpLeft's fixed convention) should route through — a single shared
 * point for a clean miter or a near-collinear straight-through, or two points bridged by a flat
 * bevel edge when the miter would exceed `miterLimit` (measured as miterDistance / halfThickness,
 * the standard SVG/canvas-style ratio) or the two directions are exactly opposite (undefined miter).
 *
 * Symmetric in prevDir/nextDir and independent of overall path winding — this is what makes left
 * turns, right turns, and either drawing direction (CW/CCW) all produce identical-looking joins
 * without any special-casing.
 */
export function computeJoinAt(
	prevDir: Point2D,
	nextDir: Point2D,
	corner: Point2D,
	halfThickness: number,
	joinStyle: WallJoinStyle,
	miterLimit: number,
	angularEpsilonRadians = 0.01
): JoinPoints {
	const cross = prevDir.x * nextDir.z - prevDir.z * nextDir.x;
	const dot = prevDir.x * nextDir.x + prevDir.z * nextDir.z;
	const turnAngle = Math.atan2(Math.abs(cross), dot); // 0 = straight through, PI = full reversal

	if (turnAngle < angularEpsilonRadians) {
		const pl = perpLeft(prevDir);
		return {
			left: [offsetPoint(corner, pl, halfThickness)],
			right: [offsetPoint(corner, pl, -halfThickness)]
		};
	}

	const leftBevel = [
		offsetPoint(corner, perpLeft(prevDir), halfThickness),
		offsetPoint(corner, perpLeft(nextDir), halfThickness)
	];
	const rightBevel = [
		offsetPoint(corner, perpLeft(prevDir), -halfThickness),
		offsetPoint(corner, perpLeft(nextDir), -halfThickness)
	];

	if (joinStyle === 'bevel') return { left: leftBevel, right: rightBevel };

	const leftMiter = lineIntersection2D(leftBevel[0], prevDir, leftBevel[1], nextDir);
	const rightMiter = lineIntersection2D(rightBevel[0], prevDir, rightBevel[1], nextDir);

	const leftOk = leftMiter !== null && distance2D(leftMiter, corner) / halfThickness <= miterLimit;
	const rightOk =
		rightMiter !== null && distance2D(rightMiter, corner) / halfThickness <= miterLimit;

	if (leftOk && rightOk) {
		return { left: [leftMiter], right: [rightMiter] };
	}
	// Either side exceeding the limit (or an undefined intersection, e.g. a near-180° reversal)
	// falls both sides back to a bevel — a lopsided miter-one-side/bevel-the-other corner would
	// look worse than a consistently beveled one.
	return { left: leftBevel, right: rightBevel };
}

/** A join's points, in the order a segment should walk them depending on whether this joint is that segment's start or end — see WallPathGeometryBuilder.ts. */
export function orientJoinForSegmentEnd(join: JoinPoints, isSegmentStart: boolean): JoinPoints {
	if (!isSegmentStart) return join;
	return { left: [...join.left].reverse(), right: [...join.right].reverse() };
}

/**
 * Computes the join (or `null` for an open path's very first/last point, which has no neighbour
 * to join against) at every path point in one pass. Segment `i` (points[i] -> points[i+1], wrapping
 * for the closing segment when `closed`) then looks up `joints[i]` for its start and `joints[(i+1)
 * % points.length]` for its end — see WallPathGeometryBuilder.ts.
 */
export function computeWallPathJoints(
	points: readonly Point2D[],
	closed: boolean,
	halfThickness: number,
	joinStyle: WallJoinStyle,
	miterLimit: number
): (JoinPoints | null)[] {
	const n = points.length;
	const joints: (JoinPoints | null)[] = new Array(n).fill(null);

	for (let i = 0; i < n; i++) {
		const hasPrev = closed || i > 0;
		const hasNext = closed || i < n - 1;
		if (!hasPrev || !hasNext) continue; // open path endpoint — no join

		const prevPoint = points[(i - 1 + n) % n];
		const nextPoint = points[(i + 1) % n];
		const prevDir = normalize2D(sub(points[i], prevPoint));
		const nextDir = normalize2D(sub(nextPoint, points[i]));
		joints[i] = computeJoinAt(prevDir, nextDir, points[i], halfThickness, joinStyle, miterLimit);
	}

	return joints;
}

/**
 * Builds one segment's full local-plane footprint polygon (foundation-local X/Z, NOT yet projected
 * into wall-local U/T — see projectFootprintToLocal below) from its own start/end points plus the
 * (already join-oriented) point lists at each end. A plain segment with no join at either end
 * degenerates to exactly the same rectangle a standalone wall already uses — see
 * wallPathMath.spec.ts's "matches a plain wall when unjoined" case.
 */
export function buildSegmentFootprint(
	start: Point2D,
	end: Point2D,
	startJoin: JoinPoints | null,
	endJoin: JoinPoints | null,
	halfThickness: number
): Point2D[] {
	const dir = normalize2D(sub(end, start));
	const pl = perpLeft(dir);

	const startLeft = startJoin ? startJoin.left : [offsetPoint(start, pl, halfThickness)];
	const startRight = startJoin ? startJoin.right : [offsetPoint(start, pl, -halfThickness)];
	const endLeft = endJoin ? endJoin.left : [offsetPoint(end, pl, halfThickness)];
	const endRight = endJoin ? endJoin.right : [offsetPoint(end, pl, -halfThickness)];

	return [...startLeft, ...endLeft, ...[...endRight].reverse(), ...[...startRight].reverse()];
}

/**
 * The local-U range a join's points actually span, in ONE segment's own (start, dir) frame,
 * measured from `referenceU` (0 for that segment's start joint, `length` for its end joint). This
 * is the join's true geometric footprint — for any non-collinear corner, the *outer* edge's miter
 * point necessarily extends past the plain endpoint (referenceU), which is exactly why clipping a
 * join's cap polygon to a range that stops AT referenceU (e.g. `[length - margin, length]` for an
 * end joint) is wrong: it chops off the very extension that closes the gap with the neighbouring
 * segment. Callers must clip to this full `[minU, maxU]` range — which straddles `referenceU`, not
 * stops at it — to render the join's true shape with no gap and no artificial spike.
 */
export function computeJoinUBounds(
	join: JoinPoints,
	segmentStart: Point2D,
	dir: Point2D,
	referenceU: number
): { minU: number; maxU: number } {
	const us = [...join.left, ...join.right].map((p) => {
		const rel = sub(p, segmentStart);
		return rel.x * dir.x + rel.z * dir.z;
	});
	return { minU: Math.min(referenceU, ...us), maxU: Math.max(referenceU, ...us) };
}

/** Projects a footprint polygon (foundation-local X/Z) into the segment's own wall-local (U, T) plane — U along the wall from `start`, T perpendicular (thickness) offset. */
export function projectFootprintToLocal(
	polygon: readonly Point2D[],
	start: Point2D,
	dir: Point2D
): Point2D[] {
	const perp = perpLeft(dir);
	return polygon.map((p) => {
		const rel = sub(p, start);
		return { x: rel.x * dir.x + rel.z * dir.z, z: rel.x * perp.x + rel.z * perp.z };
	});
}

/** Sutherland-Hodgman clip of a (convex-ish) polygon against one U half-plane. */
function clipHalfPlane(
	polygon: readonly Point2D[],
	keep: (p: Point2D) => boolean,
	intersectAtU: number
): Point2D[] {
	if (polygon.length === 0) return [];
	const result: Point2D[] = [];
	for (let i = 0; i < polygon.length; i++) {
		const curr = polygon[i];
		const prev = polygon[(i - 1 + polygon.length) % polygon.length];
		const currIn = keep(curr);
		const prevIn = keep(prev);
		if (currIn !== prevIn) {
			const denom = curr.x - prev.x;
			const t = Math.abs(denom) > EPSILON ? (intersectAtU - prev.x) / denom : 0;
			result.push({ x: intersectAtU, z: prev.z + t * (curr.z - prev.z) });
		}
		if (currIn) result.push(curr);
	}
	return result;
}

/** Clips a wall-local (U, T) footprint polygon to a [uMin, uMax] range — used to isolate a corner's join-cap region from the rest of a segment's footprint. */
export function clipPolygonToURange(
	polygon: readonly Point2D[],
	uMin: number,
	uMax: number
): Point2D[] {
	const clippedMin = clipHalfPlane(polygon, (p) => p.x >= uMin - EPSILON, uMin);
	return clipHalfPlane(clippedMin, (p) => p.x <= uMax + EPSILON, uMax);
}

/** True if two 2D segments (a0-a1, b0-b1) properly intersect (crossing, not merely touching at a shared endpoint) — used to reject self-intersecting wall paths. */
export function segmentsIntersect(a0: Point2D, a1: Point2D, b0: Point2D, b1: Point2D): boolean {
	function orientation(p: Point2D, q: Point2D, r: Point2D): number {
		const val = (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
		if (Math.abs(val) < EPSILON) return 0;
		return val > 0 ? 1 : -1;
	}
	function onSegment(p: Point2D, q: Point2D, r: Point2D): boolean {
		return (
			Math.min(p.x, r.x) - EPSILON <= q.x &&
			q.x <= Math.max(p.x, r.x) + EPSILON &&
			Math.min(p.z, r.z) - EPSILON <= q.z &&
			q.z <= Math.max(p.z, r.z) + EPSILON
		);
	}

	const o1 = orientation(a0, a1, b0);
	const o2 = orientation(a0, a1, b1);
	const o3 = orientation(b0, b1, a0);
	const o4 = orientation(b0, b1, a1);

	if (o1 !== o2 && o3 !== o4) return true;

	if (o1 === 0 && onSegment(a0, b0, a1)) return true;
	if (o2 === 0 && onSegment(a0, b1, a1)) return true;
	if (o3 === 0 && onSegment(b0, a0, b1)) return true;
	if (o4 === 0 && onSegment(b0, a1, b1)) return true;

	return false;
}

/**
 * Rejects a wall path whose newly-added final segment crosses any earlier, non-adjacent segment —
 * "obvious" self-intersection only, per the brief; genuinely self-overlapping/degenerate paths
 * beyond that aren't attempted yet. Adjacent segments (sharing an endpoint) are always skipped —
 * they're expected to touch at their shared joint, that's not an intersection.
 */
export function pathSelfIntersects(points: readonly Point2D[], closed: boolean): boolean {
	const segmentCount = closed ? points.length : points.length - 1;
	if (segmentCount < 2) return false;

	for (let i = 0; i < segmentCount; i++) {
		const a0 = points[i];
		const a1 = points[(i + 1) % points.length];
		for (let j = i + 1; j < segmentCount; j++) {
			// Skip segments that share an endpoint with segment i (adjacent, including the
			// closing wrap-around pair when the path is closed).
			const isAdjacent = j === i + 1 || (closed && i === 0 && j === segmentCount - 1) || j === i;
			if (isAdjacent) continue;

			const b0 = points[j];
			const b1 = points[(j + 1) % points.length];
			if (segmentsIntersect(a0, a1, b0, b1)) return true;
		}
	}
	return false;
}

/** Total path length — sum of every segment's length (including the closing segment when closed). */
export function computePathLength(points: readonly Point2D[], closed: boolean): number {
	const segmentCount = closed ? points.length : points.length - 1;
	let total = 0;
	for (let i = 0; i < segmentCount; i++) {
		total += distance2D(points[i], points[(i + 1) % points.length]);
	}
	return total;
}
