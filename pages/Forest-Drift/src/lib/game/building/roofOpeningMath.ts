/**
 * Windows and doors in a roof's vertical faces — gable ends, a shed's tall wall, a dutch gable's
 * small cap. Framework- and Three.js-free like every other *Math.ts here: which faces a roof has and
 * where, the (U, Y) frame an opening is stored in, whether one fits, and the solid pieces left once
 * the holes are cut. RoofGeometryBuilder (mesh), RoofManager (visuals, targeting) and
 * BuildingManager (authoritative validation) all read faces from here, and here reads them from
 * `pitchedRoofFaces` — the same face list the mesh is built from — so the preview, the saved data
 * and the hole in the mesh can never disagree.
 *
 * A face's frame is deliberately wall-shaped: `dir` is U, and the outward normal is the wall-local
 * +thickness axis (`wallGeometryMath.wallLocalToWorld`'s perpendicular). That lets the preview box,
 * the window/door visuals and the door's swing (towards −thickness: inward, into the roof space)
 * reuse the wall code unchanged. Y is foundation-local height, not relative to the roof, so one tall
 * gable can take openings on several floors.
 *
 * A face may be concave (M-shaped's end is three coplanar triangles), so it is kept as the convex
 * pieces roofMath.ts already builds rather than one outline: containment is "the pieces' clipped
 * areas add up to the whole rectangle", and cutting clips each piece against the rectangles left
 * around the holes. Both stay exact when an opening straddles two pieces or sits on the face's
 * bottom edge, which an outline-plus-holes triangulation would not.
 */
import {
	pitchedRoofFaces,
	type AxisAlignedRect,
	type PitchedRoofShape,
	type RoofFace,
	type RoofVertex
} from './roofMath';
import { ROOF_FACE_SIDES, type RoofDefinition, type RoofFaceSide } from './RoofTypes';
import { computeSolidWallSegments, doOpeningsOverlap, type OpeningRect } from './wallGeometryMath';
import type { WallOpeningType } from './WallTypes';

const EPSILON = 1e-6;
/** How far (metres) a raycast hit may sit off a face's plane and still count as on it — the plane itself is exact; this only absorbs float error in the hit point. */
const PLANE_HIT_TOLERANCE = 0.01;
/** In-plane slack for "is this hit inside the face" — a hit exactly on an edge still counts. */
const POINT_IN_FACE_TOLERANCE = 1e-4;

export interface FacePoint {
	u: number;
	y: number;
}

export interface RoofFaceFrame {
	side: RoofFaceSide;
	/** Foundation-local axis the face's normal runs along. */
	axis: 'x' | 'z';
	/** The face's foundation-local coordinate along `axis`. */
	plane: number;
	normalX: number;
	normalZ: number;
	/** Unit U direction in foundation-local X/Z. */
	dirX: number;
	dirZ: number;
	/** Foundation-local X/Z where U = 0 — the footprint corner the wall below starts from. */
	originX: number;
	originZ: number;
	/** Footprint span along U — the wall below this face runs U ∈ [0, length]. */
	length: number;
}

/** One straight stretch of the roof's top surface, where it crosses a face's plane. */
export interface RoofLineSegment {
	a: FacePoint;
	b: FacePoint;
}

export interface RoofVerticalFace extends RoofFaceFrame {
	/** `'end wall'` for a shed's tall side, `'gable'` for every other vertical face — player-facing text only. */
	label: 'gable' | 'end wall';
	/** Convex, coplanar, non-overlapping pieces in (U, Y) — one for most types, three for M-shaped's concave end. */
	polygons: FacePoint[][];
	/** The roof's top surface along this face's plane (sorted, `a.u <= b.u`); the roof slab fills `roofThickness` below it. */
	roofLine: RoofLineSegment[];
	roofThickness: number;
	bounds: OpeningRect;
}

/**
 * The (U, Y) frame for a face on `side`, lying in `plane`, of a roof whose footprint is `rect`.
 * U = 0 sits on the footprint corner that is on the left when looking at the face from outside, so
 * U ∈ [0, length] lines up with the wall underneath and the outward normal is wall-local +Z.
 */
export function roofFaceFrame(
	side: RoofFaceSide,
	plane: number,
	rect: AxisAlignedRect
): RoofFaceFrame {
	const depth = rect.maxZ - rect.minZ;
	const width = rect.maxX - rect.minX;
	switch (side) {
		case '+x':
			return frame(side, 'x', plane, 1, 0, 0, -1, plane, rect.maxZ, depth);
		case '-x':
			return frame(side, 'x', plane, -1, 0, 0, 1, plane, rect.minZ, depth);
		case '+z':
			return frame(side, 'z', plane, 0, 1, 1, 0, rect.minX, plane, width);
		case '-z':
			return frame(side, 'z', plane, 0, -1, -1, 0, rect.maxX, plane, width);
	}
}

function frame(
	side: RoofFaceSide,
	axis: 'x' | 'z',
	plane: number,
	normalX: number,
	normalZ: number,
	dirX: number,
	dirZ: number,
	originX: number,
	originZ: number,
	length: number
): RoofFaceFrame {
	return { side, axis, plane, normalX, normalZ, dirX, dirZ, originX, originZ, length };
}

/** `atan2(dirZ, dirX)` — the `headingRadians` a `WallTransform` / `applyWallTransform` expects. */
export function roofFaceHeading(face: RoofFaceFrame): number {
	return Math.atan2(face.dirZ, face.dirX);
}

export function toFacePoint(
	face: RoofFaceFrame,
	p: { x: number; y: number; z: number }
): FacePoint {
	return { u: (p.x - face.originX) * face.dirX + (p.z - face.originZ) * face.dirZ, y: p.y };
}

export function fromFacePoint(face: RoofFaceFrame, q: FacePoint): RoofVertex {
	return { x: face.originX + face.dirX * q.u, y: q.y, z: face.originZ + face.dirZ * q.u };
}

/** Which way a vertical `RoofFace` faces, judged against the footprint's centre. */
export function verticalFaceSide(face: RoofFace, rect: AxisAlignedRect): RoofFaceSide {
	const n = newell(face.points);
	const axis: 'x' | 'z' = Math.abs(n.x) >= Math.abs(n.z) ? 'x' : 'z';
	const plane = face.points[0][axis];
	const centre = axis === 'x' ? (rect.minX + rect.maxX) / 2 : (rect.minZ + rect.maxZ) / 2;
	return `${plane >= centre ? '+' : '-'}${axis}` as RoofFaceSide;
}

/**
 * Every vertical face of `roof` that can take an opening, in foundation-local metres — `[]` for flat
 * and hip/mansard roofs (no vertical faces) or a footprint pitched roofs can't build on.
 * `endWallOffset` must be the one the mesh was built with (see RoofGeometryOptions).
 *
 * Every pitched type has at most one vertical plane per direction, so grouping by `side` is exact;
 * a piece off that side's plane would be a new shape this module doesn't know, and is ignored
 * rather than merged into the wrong face.
 */
export function roofVerticalFaces(
	roof: PitchedRoofShape & Pick<RoofDefinition, 'thickness'>,
	buildingGridSize: number,
	endWallOffset: number
): RoofVerticalFace[] {
	const built = pitchedRoofFaces(roof, buildingGridSize, endWallOffset);
	if (!built) return [];
	const slopes = built.faces.filter((face) => !face.vertical);

	const bySide = new Map<RoofFaceSide, RoofFace[]>();
	for (const face of built.faces) {
		if (!face.vertical) continue;
		const side = verticalFaceSide(face, built.rect);
		const list = bySide.get(side) ?? [];
		list.push(face);
		bySide.set(side, list);
	}

	const result: RoofVerticalFace[] = [];
	for (const side of ROOF_FACE_SIDES) {
		const faces = bySide.get(side);
		if (!faces) continue;
		const axis: 'x' | 'z' = side === '+x' || side === '-x' ? 'x' : 'z';
		const plane = faces[0].points[0][axis];
		const faceFrame = roofFaceFrame(side, plane, built.rect);
		const polygons = faces
			.filter((face) => face.points.every((p) => Math.abs(p[axis] - plane) < EPSILON))
			.map((face) => face.points.map((p) => toFacePoint(faceFrame, p)))
			.filter((polygon) => polygonArea(polygon) > EPSILON);
		if (polygons.length === 0) continue;
		result.push({
			...faceFrame,
			label: roof.type === 'shed' && side === roof.shedDirection ? 'end wall' : 'gable',
			polygons,
			roofLine: roofLineOnPlane(slopes, faceFrame),
			roofThickness: roof.thickness,
			bounds: polygonsBounds(polygons)
		});
	}
	return result;
}

/**
 * Where each slope crosses the face's plane, as (U, Y) segments. Slopes never overlap in plan, so
 * the segments only ever meet end to end and their upper envelope is the roof's top along the
 * plane, with corners only at segment ends — which is all `roofTopRange` needs to sample.
 */
function roofLineOnPlane(slopes: readonly RoofFace[], face: RoofFaceFrame): RoofLineSegment[] {
	const segments: RoofLineSegment[] = [];
	for (const slope of slopes) {
		const hits: FacePoint[] = [];
		const n = slope.points.length;
		for (let i = 0; i < n; i++) {
			const a = slope.points[i];
			const b = slope.points[(i + 1) % n];
			const da = a[face.axis] - face.plane;
			const db = b[face.axis] - face.plane;
			if (Math.abs(da) <= EPSILON) {
				hits.push(toFacePoint(face, a));
			} else if (Math.abs(db) > EPSILON && da * db < 0) {
				const t = da / (da - db);
				hits.push(
					toFacePoint(face, {
						x: a.x + (b.x - a.x) * t,
						y: a.y + (b.y - a.y) * t,
						z: a.z + (b.z - a.z) * t
					})
				);
			}
		}
		if (hits.length < 2) continue;
		hits.sort((p, q) => p.u - q.u);
		const first = hits[0];
		const last = hits[hits.length - 1];
		if (last.u - first.u <= EPSILON) continue;
		segments.push({ a: first, b: last });
	}
	return segments.sort((p, q) => p.a.u - q.a.u);
}

/** The roof's top surface height at `u` along the face — `-Infinity` where no slope crosses the plane. */
export function roofTopAt(face: Pick<RoofVerticalFace, 'roofLine'>, u: number): number {
	let best = -Infinity;
	for (const { a, b } of face.roofLine) {
		if (u < a.u - EPSILON || u > b.u + EPSILON) continue;
		const span = b.u - a.u;
		const y = a.y + ((b.y - a.y) * Math.min(Math.max(u - a.u, 0), span)) / span;
		if (y > best) best = y;
	}
	return best;
}

/** Lowest and highest roof-top height over U ∈ [u0, u1] — sampled at both ends and every corner between, which is exact for a piecewise-linear line. */
export function roofTopRange(
	face: Pick<RoofVerticalFace, 'roofLine'>,
	u0: number,
	u1: number
): { min: number; max: number } | null {
	const samples = [u0, u1];
	for (const { a, b } of face.roofLine) {
		if (a.u > u0 && a.u < u1) samples.push(a.u);
		if (b.u > u0 && b.u < u1) samples.push(b.u);
	}
	let min = Infinity;
	let max = -Infinity;
	for (const u of samples) {
		const y = roofTopAt(face, u);
		if (!Number.isFinite(y)) continue;
		min = Math.min(min, y);
		max = Math.max(max, y);
	}
	return min <= max ? { min, max } : null;
}

/**
 * The stretch of U that `C`-snap divisions span: the face's own part of the footprint edge. For a
 * gable that's the whole wall below ([0, length]), so "half" lands on the same centre line as that
 * wall's own openings; a dutch gable's inset cap divides only its own width.
 */
export function roofFaceDivisionSpan(face: RoofVerticalFace): { start: number; length: number } {
	const start = Math.max(face.bounds.minU, 0);
	const end = Math.min(face.bounds.maxU, face.length);
	if (end - start > EPSILON) return { start, length: end - start };
	return { start: face.bounds.minU, length: face.bounds.maxU - face.bounds.minU };
}

/** The face's vertical extent at `u` (bottom and top of its outline there), or `null` outside it. */
export function roofFaceSpanAt(
	face: RoofVerticalFace,
	u: number
): { minY: number; maxY: number } | null {
	let minY = Infinity;
	let maxY = -Infinity;
	for (const polygon of face.polygons) {
		const n = polygon.length;
		for (let i = 0; i < n; i++) {
			const a = polygon[i];
			const b = polygon[(i + 1) % n];
			const lo = Math.min(a.u, b.u);
			const hi = Math.max(a.u, b.u);
			if (u < lo - EPSILON || u > hi + EPSILON) continue;
			if (hi - lo <= EPSILON) {
				minY = Math.min(minY, a.y, b.y);
				maxY = Math.max(maxY, a.y, b.y);
				continue;
			}
			const y = a.y + ((b.y - a.y) * (u - a.u)) / (b.u - a.u);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		}
	}
	return minY <= maxY ? { minY, maxY } : null;
}

/** The face's outline as (U, Y) segments — every piece's edges except the ones two pieces share. For highlighting only. */
export function roofFaceOutline(face: RoofVerticalFace): [FacePoint, FacePoint][] {
	const edges: [FacePoint, FacePoint][] = [];
	for (const polygon of face.polygons) {
		for (let i = 0; i < polygon.length; i++) {
			edges.push([polygon[i], polygon[(i + 1) % polygon.length]]);
		}
	}
	return edges.filter((edge, i) => !edges.some((other, j) => j !== i && sameSegment(edge, other)));
}

/** Finds the face a foundation-local point lies on (within float tolerance), and where on it. */
export function locateOnRoofFace(
	faces: readonly RoofVerticalFace[],
	local: { x: number; y: number; z: number }
): { face: RoofVerticalFace; point: FacePoint } | null {
	for (const face of faces) {
		const coord = face.axis === 'x' ? local.x : local.z;
		if (Math.abs(coord - face.plane) > PLANE_HIT_TOLERANCE) continue;
		const point = toFacePoint(face, local);
		if (face.polygons.some((polygon) => pointInConvexPolygon(polygon, point))) {
			return { face, point };
		}
	}
	return null;
}

export type RoofOpeningIssue =
	'face' | 'size' | 'below' | 'above' | 'edge' | 'slope' | 'roof' | 'overlap';

export type RoofOpeningFit =
	{ valid: true } | { valid: false; issue: RoofOpeningIssue; reason: string; hint?: string };

export interface RoofOpeningFitOptions {
	/** Clearance from the face's sides and sloping edges — the wall tools' `openingEdgeMargin`. */
	edgeMargin: number;
	/** Minimum gap to another opening on the same face — the wall tools' `openingSpacing`. */
	spacing: number;
	/** Openings already in this face. */
	existing: readonly (OpeningRect & { type: WallOpeningType })[];
}

/**
 * Whether `opening` can be cut into `face` — the one rule both the live preview and
 * `BuildingManager.addRoofOpening` apply. Mirrors a wall opening's rules where they carry over:
 * `edgeMargin` from the sides (and from every sloping edge, which plays the part of a wall's top),
 * the bottom may sit flush on the face's lowest edge (a door on the attic floor), and `spacing`
 * between openings. Two things are roof-specific:
 *  - the whole padded rectangle must lie inside the face's outline — crossing a sloping edge, a
 *    ridge or a valley is rejected, not clipped;
 *  - it must stay clear of the roof slab itself, which hangs `roofThickness` below the top surface
 *    the face's sloping edges follow — a hole there would cut through the roof.
 * Failures carry player-facing text, with a `[`/`]` hint when changing floor is what would fix it.
 */
export function checkRoofOpeningFit(
	face: RoofVerticalFace,
	opening: OpeningRect,
	options: RoofOpeningFitOptions
): RoofOpeningFit {
	const label = face.label;
	if (opening.maxU - opening.minU <= EPSILON || opening.maxY - opening.minY <= EPSILON) {
		return { valid: false, issue: 'size', reason: 'Opening has no size' };
	}
	const { bounds } = face;
	if (opening.minY < bounds.minY - EPSILON) {
		return {
			valid: false,
			issue: 'below',
			reason: `Opening is below this ${label}`,
			hint: '] to go up a floor'
		};
	}
	if (opening.minY >= bounds.maxY - EPSILON) {
		return {
			valid: false,
			issue: 'above',
			reason: `Opening is above this ${label}`,
			hint: '[ to go down a floor'
		};
	}

	const margin = Math.max(0, options.edgeMargin);
	const padded: OpeningRect = {
		minU: opening.minU - margin,
		maxU: opening.maxU + margin,
		minY: opening.minY,
		maxY: opening.maxY + margin
	};
	if (padded.minU < bounds.minU - EPSILON || padded.maxU > bounds.maxU + EPSILON) {
		return { valid: false, issue: 'edge', reason: `Too close to the edge of the ${label}` };
	}
	if (!rectCoveredByPolygons(face.polygons, padded)) {
		return {
			valid: false,
			issue: 'slope',
			reason: `Opening crosses the sloping edge of the ${label}`
		};
	}
	if (runsIntoRoof(face, padded, margin)) {
		return { valid: false, issue: 'roof', reason: 'Opening runs into the roof above' };
	}

	const overlap = options.existing.find((existing) =>
		doOpeningsOverlap(opening, existing, options.spacing)
	);
	if (overlap) {
		return { valid: false, issue: 'overlap', reason: `Opening overlaps existing ${overlap.type}` };
	}
	return { valid: true };
}

/**
 * Whether `rect` reaches into the roof slab (top surface down to `roofThickness` below it, plus
 * `margin` either side) anywhere along its width. For a face under the roof (every gable) that's
 * "the top comes within thickness + margin of the roof's underside"; for butterfly's end, which
 * sits above its V, it's "the bottom comes within margin of the roof".
 */
function runsIntoRoof(face: RoofVerticalFace, rect: OpeningRect, margin: number): boolean {
	const range = roofTopRange(face, rect.minU, rect.maxU);
	if (!range) return false;
	return range.max > rect.minY - margin && range.min < rect.maxY + face.roofThickness;
}

/** Whether `rect` lies entirely inside the union of `polygons` (non-overlapping, convex). */
export function rectCoveredByPolygons(
	polygons: readonly FacePoint[][],
	rect: OpeningRect
): boolean {
	const area = (rect.maxU - rect.minU) * (rect.maxY - rect.minY);
	let covered = 0;
	for (const polygon of polygons) covered += polygonArea(clipPolygonToRect(polygon, rect));
	return covered >= area - Math.max(1e-7, area * 1e-6);
}

/**
 * `polygon` (convex) minus every rectangle in `openings`, as convex pieces ready to fan-triangulate.
 * The area around the holes is split into rectangles exactly like a wall's solid segments
 * (`computeSolidWallSegments`, over the polygon's bounding box), and the polygon is clipped to each
 * one. Returns the polygon itself, untouched, when no opening reaches it.
 */
export function cutOpeningsFromPolygon(
	polygon: readonly FacePoint[],
	openings: readonly OpeningRect[]
): FacePoint[][] {
	const box = polygonsBounds([polygon]);
	const relevant = openings.filter(
		(o) =>
			o.maxU > box.minU + EPSILON &&
			o.minU < box.maxU - EPSILON &&
			o.maxY > box.minY + EPSILON &&
			o.minY < box.maxY - EPSILON
	);
	if (relevant.length === 0) return [polygon.slice()];

	const solids = computeSolidWallSegments(
		box.maxU - box.minU,
		box.maxY - box.minY,
		relevant.map((o) => ({
			minU: o.minU - box.minU,
			maxU: o.maxU - box.minU,
			minY: o.minY - box.minY,
			maxY: o.maxY - box.minY
		}))
	);
	const pieces: FacePoint[][] = [];
	for (const solid of solids) {
		const piece = clipPolygonToRect(polygon, {
			minU: solid.minU + box.minU,
			maxU: solid.maxU + box.minU,
			minY: solid.minY + box.minY,
			maxY: solid.maxY + box.minY
		});
		if (piece.length >= 3 && polygonArea(piece) > 1e-9) pieces.push(piece);
	}
	return pieces;
}

/** Sutherland–Hodgman: a convex polygon clipped to an axis-aligned (U, Y) rectangle. */
export function clipPolygonToRect(polygon: readonly FacePoint[], rect: OpeningRect): FacePoint[] {
	let result = polygon.slice();
	result = clipByLinear(result, (p) => p.u - rect.minU);
	result = clipByLinear(result, (p) => rect.maxU - p.u);
	result = clipByLinear(result, (p) => p.y - rect.minY);
	result = clipByLinear(result, (p) => rect.maxY - p.y);
	return result.filter((p, i) => {
		const prev = result[(i + result.length - 1) % result.length];
		return result.length === 1 || Math.hypot(p.u - prev.u, p.y - prev.y) > 1e-9;
	});
}

function clipByLinear(polygon: FacePoint[], inside: (p: FacePoint) => number): FacePoint[] {
	const out: FacePoint[] = [];
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const fa = inside(a);
		const fb = inside(b);
		if (fa >= 0) out.push(a);
		if (fa >= 0 !== fb >= 0) {
			const t = fa / (fa - fb);
			out.push({ u: a.u + (b.u - a.u) * t, y: a.y + (b.y - a.y) * t });
		}
	}
	return out;
}

export function polygonArea(polygon: readonly FacePoint[]): number {
	let twice = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		twice += a.u * b.y - b.u * a.y;
	}
	return Math.abs(twice) / 2;
}

function polygonsBounds(polygons: readonly (readonly FacePoint[])[]): OpeningRect {
	let minU = Infinity;
	let maxU = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const polygon of polygons) {
		for (const p of polygon) {
			minU = Math.min(minU, p.u);
			maxU = Math.max(maxU, p.u);
			minY = Math.min(minY, p.y);
			maxY = Math.max(maxY, p.y);
		}
	}
	return { minU, maxU, minY, maxY };
}

function pointInConvexPolygon(polygon: readonly FacePoint[], p: FacePoint): boolean {
	let sign = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const length = Math.hypot(b.u - a.u, b.y - a.y);
		if (length <= EPSILON) continue;
		const distance = ((b.u - a.u) * (p.y - a.y) - (b.y - a.y) * (p.u - a.u)) / length;
		if (Math.abs(distance) <= POINT_IN_FACE_TOLERANCE) continue;
		const current = distance > 0 ? 1 : -1;
		if (sign === 0) sign = current;
		else if (sign !== current) return false;
	}
	return true;
}

function sameSegment(a: [FacePoint, FacePoint], b: [FacePoint, FacePoint]): boolean {
	const near = (p: FacePoint, q: FacePoint) => Math.hypot(p.u - q.u, p.y - q.y) < 1e-5;
	return (near(a[0], b[0]) && near(a[1], b[1])) || (near(a[0], b[1]) && near(a[1], b[0]));
}

function newell(points: readonly RoofVertex[]): RoofVertex {
	const n = { x: 0, y: 0, z: 0 };
	for (let i = 0; i < points.length; i++) {
		const c = points[i];
		const d = points[(i + 1) % points.length];
		n.x += (c.y - d.y) * (c.z + d.z);
		n.y += (c.z - d.z) * (c.x + d.x);
		n.z += (c.x - d.x) * (c.y + d.y);
	}
	return n;
}
