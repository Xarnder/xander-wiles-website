/**
 * Hand-drawn skirting boards (hotbar 2 → Skirting). Framework- and Three.js-free: the saved shape,
 * the wall-thickness lookup, and the board footprints are all pure and unit-tested.
 *
 * The player draws along a wall's centre line exactly like drawing the wall itself (building-grid
 * points on one foundation and storey). Each segment's board sits on one face of that wall:
 * `side` is which side of the drawn line it is on (+1 = left of start→end), chosen from where the
 * player stands, and `offset` is how far that face is from the drawn line — half the wall's
 * thickness, found automatically from the wall drawn on that line, or a manual value.
 */

import type { BuildingGridPoint } from './FoundationLocalMath';
import type { BuildingMaterialDefinition } from './MaterialTypes';
import { lineIntersection2D, normalize2D, perpLeft, sub, type Point2D } from './wallPathMath';

export interface SkirtingRunSegment {
	/** Which side of the drawn line the board is on: +1 = left of this segment's start→end. */
	side: 1 | -1;
	/** Drawn line → wall face, metres (half the wall thickness in auto mode). */
	offset: number;
}

export interface SkirtingRunDefinition {
	id: string;
	foundationId: string;
	levelIndex: number;
	/** Foundation-local floor elevation the board stands on (the storey's `baseY`). */
	baseY: number;
	/** The drawn wall line, building-grid integers in the foundation's frame (like a wall path). */
	points: BuildingGridPoint[];
	closed: boolean;
	/** One per segment — `closed ? points.length : points.length - 1`. */
	segments: SkirtingRunSegment[];
	height: number;
	depth: number;
	/** Paint override; `undefined` = the shared skirting timber look. */
	material?: BuildingMaterialDefinition;
}

export type SkirtingOffsetMode = 'auto' | 'manual';

/** Skirting tool next-placement settings (`E` panel). Per session, never saved. */
export interface SkirtingDraftSettings {
	offsetMode: SkirtingOffsetMode;
	/** Used in manual mode, and in auto mode where no wall is found on the drawn line. */
	manualOffset: number;
	height: number;
	depth: number;
	/** `#RRGGBB`, or `null` for the default skirting timber. */
	color: string | null;
}

export const SKIRTING_LIMITS = {
	offset: { min: 0, max: 0.5, step: 0.005 },
	height: { min: 0.03, max: 0.4, step: 0.005 },
	depth: { min: 0.008, max: 0.08, step: 0.002 }
} as const;

export function createDefaultSkirtingDraftSettings(): SkirtingDraftSettings {
	return { offsetMode: 'auto', manualOffset: 0.075, height: 0.1, depth: 0.02, color: null };
}

/** A wall's centre line on a foundation, for the auto-offset lookup. */
export interface WallLine {
	start: Point2D;
	end: Point2D;
	baseY: number;
	thickness: number;
}

/** How far the drawn line may sit from a wall's centre line and still be "that wall". */
const LINE_MATCH_DISTANCE = 0.06;
/** |cross| below this (~3°) counts as parallel. */
const PARALLEL_CROSS = 0.05;
const MIN_OVERLAP = 0.05;
const EPSILON = 1e-6;

/**
 * Half the thickness of the wall drawn along `a → b` on the storey at `baseY`, or `null` when no
 * wall runs there. Where several overlap (a path segment over a straight wall), the longest overlap
 * wins.
 */
export function findWallHalfThickness(
	a: Point2D,
	b: Point2D,
	baseY: number,
	walls: readonly WallLine[]
): number | null {
	const length = Math.hypot(b.x - a.x, b.z - a.z);
	if (length < EPSILON) return null;
	const dir = normalize2D(sub(b, a));
	let best: { overlap: number; half: number } | null = null;
	for (const wall of walls) {
		if (Math.abs(wall.baseY - baseY) > 0.01) continue;
		const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
		if (wallLength < EPSILON) continue;
		const wallDir = normalize2D(sub(wall.end, wall.start));
		if (Math.abs(dir.x * wallDir.z - dir.z * wallDir.x) > PARALLEL_CROSS) continue;
		// Both drawn ends must lie on the wall's centre line (within snap slop)...
		const distance = (p: Point2D) =>
			Math.abs((p.x - wall.start.x) * -wallDir.z + (p.z - wall.start.z) * wallDir.x);
		if (distance(a) > LINE_MATCH_DISTANCE || distance(b) > LINE_MATCH_DISTANCE) continue;
		// ...and the two must overlap along it.
		const along = (p: Point2D) =>
			(p.x - wall.start.x) * wallDir.x + (p.z - wall.start.z) * wallDir.z;
		const lo = Math.max(0, Math.min(along(a), along(b)));
		const hi = Math.min(wallLength, Math.max(along(a), along(b)));
		const overlap = hi - lo;
		if (overlap < MIN_OVERLAP) continue;
		if (!best || overlap > best.overlap) best = { overlap, half: wall.thickness / 2 };
	}
	return best?.half ?? null;
}

/** Which side of `a → b` a point is on: +1 left, −1 right (exactly on the line counts as left). */
export function sideOfLine(a: Point2D, b: Point2D, point: Point2D): 1 | -1 {
	const cross = (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
	return cross >= 0 ? 1 : -1;
}

/**
 * Each segment's board footprint (foundation-local X/Z quads: face-start, face-end, outer-end,
 * outer-start). The face line is the drawn line moved `side · offset`; the board runs `depth`
 * further out. At a shared vertex, consecutive boards on the same side meet in a mitre (their
 * offset lines intersect); a sharp corner (mitre longer than 4 board depths) or a side flip ends
 * both boards square instead.
 */
export function skirtingRunFootprints(
	points: readonly Point2D[],
	closed: boolean,
	segments: readonly SkirtingRunSegment[],
	depth: number
): Point2D[][] {
	const n = points.length;
	const count = closed ? n : n - 1;
	if (n < 2 || segments.length < count) return [];
	const dirs: Point2D[] = [];
	for (let i = 0; i < count; i++) dirs.push(normalize2D(sub(points[(i + 1) % n], points[i])));

	/** Segment `i`'s board edge `distance` out on its side, at the segment's start or end. */
	const at = (i: number, distance: number, end: 0 | 1): Point2D => {
		const p = end === 0 ? points[i] : points[(i + 1) % n];
		const normal = perpLeft(dirs[i]);
		const s = segments[i].side * distance;
		return { x: p.x + normal.x * s, z: p.z + normal.z * s };
	};
	/** Mitre points (face, outer) where segment `i` meets `j` at their shared vertex, or null. */
	const mitre = (i: number, j: number): { face: Point2D; outer: Point2D } | null => {
		if (segments[i].side !== segments[j].side) return null;
		const hit = (di: number, dj: number) =>
			lineIntersection2D(at(i, di, 0), dirs[i], at(j, dj, 0), dirs[j]);
		const face = hit(segments[i].offset, segments[j].offset);
		const outer = hit(segments[i].offset + depth, segments[j].offset + depth);
		if (!face || !outer) return null;
		const vertex = points[(i + 1) % n];
		const limit = 4 * (Math.max(segments[i].offset, segments[j].offset) + depth);
		if (Math.hypot(outer.x - vertex.x, outer.z - vertex.z) > limit) return null;
		return { face, outer };
	};
	const joins = Array.from({ length: n }, (_, v) => {
		const into = closed || v > 0 ? (v - 1 + count) % count : -1;
		const out = closed || v < count ? v % count : -1;
		return into >= 0 && out >= 0 && into !== out && (closed || v < n - 1) ? mitre(into, out) : null;
	});

	const quads: Point2D[][] = [];
	for (let i = 0; i < count; i++) {
		const face = segments[i].offset;
		const outer = face + depth;
		const start = joins[i];
		const end = joins[(i + 1) % n];
		quads.push([
			start?.face ?? at(i, face, 0),
			end?.face ?? at(i, face, 1),
			end?.outer ?? at(i, outer, 1),
			start?.outer ?? at(i, outer, 0)
		]);
	}
	return quads;
}

/** Shape check for one saved run (an imported save is untrusted). Returns the problem, or null. */
export function validateSkirtingRun(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return 'skirting run must be an object';
	const run = value as Record<string, unknown>;
	const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
	if (typeof run.id !== 'string' || !run.id) return 'skirting run id missing';
	if (typeof run.foundationId !== 'string' || !run.foundationId)
		return 'skirting run foundationId missing';
	if (![run.levelIndex, run.baseY, run.height, run.depth].every(finite))
		return 'skirting run numbers must be finite';
	if ((run.height as number) <= 0 || (run.depth as number) <= 0)
		return 'skirting run height and depth must be positive';
	if (typeof run.closed !== 'boolean') return 'skirting run closed must be a boolean';
	const points = run.points;
	if (!Array.isArray(points) || points.length < 2 || points.length > 256)
		return 'skirting run needs 2–256 points';
	for (const p of points) {
		const point = p as Record<string, unknown>;
		if (!p || !Number.isInteger(point.gridX) || !Number.isInteger(point.gridZ))
			return 'skirting run points must be grid integers';
	}
	const count = run.closed ? points.length : points.length - 1;
	const segments = run.segments;
	if (!Array.isArray(segments) || segments.length !== count)
		return 'skirting run needs one segment per edge';
	for (const s of segments) {
		const segment = s as Record<string, unknown>;
		if (!s || (segment.side !== 1 && segment.side !== -1) || !finite(segment.offset))
			return 'skirting run segment is invalid';
	}
	const material = run.material as Record<string, unknown> | undefined;
	if (
		material !== undefined &&
		(material?.type !== 'color' ||
			typeof material.color !== 'string' ||
			!/^#[0-9a-fA-F]{6}$/.test(material.color))
	)
		return 'skirting run material is invalid';
	return null;
}
