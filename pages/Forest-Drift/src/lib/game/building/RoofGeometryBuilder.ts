import * as THREE from 'three';
import { buildSlabGeometry } from './SlabGeometryBuilder';
import {
	axisAlignedRectangleOf,
	buildRoofFaces,
	expandRect,
	type RoofFace,
	type RoofVertex
} from './roofMath';
import { ensureCCW } from './slabMath';
import type { Point2D } from './wallPathMath';
import type { RoofDefinition } from './RoofTypes';

/**
 * Turns a `RoofDefinition` into a solid, foundation-local `THREE.BufferGeometry` — the one place a
 * logical roof becomes a mesh. Nothing here is persisted; `WorldDefinition` stores only the
 * `RoofDefinition`, and loading a world calls straight back into this function, exactly like
 * `SlabGeometryBuilder.buildSlabGeometry` for slabs — see the README's "World persistence" section.
 *
 * `'flat'` is handled separately, by delegating to `buildSlabGeometry` directly: unlike every other
 * roof type it supports an arbitrary simple polygon, not just a rectangle, and its geometry (a flat
 * extruded prism) is already exactly what that function builds. Every pitched type requires an
 * axis-aligned rectangular footprint (see `roofMath.ts`'s `axisAlignedRectangleOf` for why) — if the
 * footprint isn't one, this throws `RoofFootprintError`, which callers (the live preview, and
 * `RoofManager.buildEntry`) turn into "Gable roof requires a compatible footprint"-style messages
 * rather than ever producing corrupt geometry.
 */
export class RoofFootprintError extends Error {}

export function buildRoofGeometry(
	roof: Pick<
		RoofDefinition,
		| 'points'
		| 'type'
		| 'direction'
		| 'shedDirection'
		| 'baseY'
		| 'rise'
		| 'thickness'
		| 'overhang'
		| 'profileSettings'
	>,
	buildingGridSize: number
): THREE.BufferGeometry {
	const footprint: Point2D[] = roof.points.map((p) => ({
		x: p.gridX * buildingGridSize,
		z: p.gridZ * buildingGridSize
	}));

	if (roof.type === 'flat') {
		return buildSlabGeometry(footprint, roof.baseY, roof.baseY - roof.thickness);
	}

	const rect = axisAlignedRectangleOf(footprint);
	if (!rect) {
		throw new RoofFootprintError(
			`${roof.type} roof requires a rectangular footprint (axis-aligned, 4 corners)`
		);
	}
	const overhungRect = roof.overhang > 0 ? expandRect(rect, roof.overhang) : rect;

	const faces = buildRoofFaces(
		roof.type,
		overhungRect,
		roof.direction,
		roof.shedDirection,
		roof.baseY,
		roof.rise,
		roof.profileSettings
	);
	return buildRoofSolidGeometry(faces, roof.thickness);
}

/** Whether `footprint` is compatible with `type` — used by the live preview to show "invalid" without needing to catch an exception on every mouse-move. */
export function isFootprintCompatibleWithRoofType(
	footprint: readonly Point2D[],
	type: RoofDefinition['type']
): boolean {
	if (type === 'flat') return footprint.length >= 3;
	return axisAlignedRectangleOf(footprint) !== null;
}

/**
 * Builds the solid from a list of planar top faces (see `RoofFace`'s own doc comment for the
 * fascia-edge convention). For each face:
 *  - the TOP skin is fan-triangulated from `points[0]` (valid because every face this module
 *    produces is convex — rectangles, trapezoids, triangles), with winding corrected so its normal
 *    points upward (`normal.y >= 0`) — every sloped face this system builds is a "roof skin" that
 *    should face up-and-out, never down, so this single check is sufficient rather than needing a
 *    per-type outward-direction table.
 *  - the BOTTOM skin reuses the SAME (now-corrected) point order, offset straight down by
 *    `thickness` and reversed — reversing a corrected upward-facing loop always yields a
 *    downward-facing one, so no separate check is needed there.
 *  - a FASCIA quad per edge flagged `true`, connecting that top edge to the matching bottom edge,
 *    wound so its normal points away from the face centroid (the upward-winding pass often
 *    reverses the boundary walk, which would otherwise point every strip into the roof).
 *  - a VERTICAL gable-end wall is not extruded downward (that offset would lie in the same plane).
 *    It is emitted twice in place: once wound outward, then again reversed so the attic side has a
 *    real inward normal (FrontSide materials otherwise show the inside as a back-face). Flagged
 *    edges still get a fascia strip (the band under a gable's eave-to-eave line).
 *
 * Vertices are NOT deduplicated across faces even where two faces share an edge (a ridge, hip, or
 * valley) — positions coincide exactly (so there's no visible gap), but each face gets its own,
 * independently-computed normal, which is what keeps ridges looking like sharp architectural edges
 * instead of being smoothed across by `computeVertexNormals` (see the README's "Normals" section).
 */
function buildRoofSolidGeometry(faces: RoofFace[], thickness: number): THREE.BufferGeometry {
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];

	const pushTriangle = (a: RoofVertex, b: RoofVertex, c: RoofVertex) => {
		const normal = triangleNormal(a, b, c);
		for (const p of [a, b, c]) {
			positions.push(p.x, p.y, p.z);
			normals.push(normal.x, normal.y, normal.z);
			// A cheap planar UV (world-ish XZ projection) — not textured today, but real coordinates
			// rather than an empty attribute, so a future roof-material texture has something usable
			// to sample instead of needing this geometry rebuilt from scratch — see the README's "UV
			// strategy" section.
			uvs.push(p.x, p.z);
		}
	};

	const pushFan = (points: RoofVertex[]) => {
		for (let i = 1; i < points.length - 1; i++) {
			pushTriangle(points[0], points[i], points[i + 1]);
		}
	};

	const interior = faceCentroid(faces.flatMap((face) => face.points));

	for (const face of faces) {
		const vertical = face.vertical === true;
		const top = vertical
			? ensureOutwardWinding(face.points, interior)
			: ensureUpwardWinding(face.points);
		pushFan(top);

		if (vertical) {
			pushFan(top.slice().reverse());
		} else {
			const bottom = top
				.slice()
				.reverse()
				.map((p) => ({ x: p.x, y: p.y - thickness, z: p.z }));
			pushFan(bottom);
		}

		const n = top.length;
		const fascia = reindexFasciaForWinding(face.points, face.fasciaEdges, top);
		for (let i = 0; i < n; i++) {
			if (!fascia[i]) continue;
			const topA = top[i];
			const topB = top[(i + 1) % n];
			const bottomA: RoofVertex = { x: topA.x, y: topA.y - thickness, z: topA.z };
			const bottomB: RoofVertex = { x: topB.x, y: topB.y - thickness, z: topB.z };
			// Face-centroid vs. strip-midpoint is degenerate on a vertical gable wall (both sit in
			// the same plane), so every fascia is wound against the roof interior instead.
			const tentative = triangleNormal(topA, topB, bottomB);
			const awayX = (topA.x + topB.x) * 0.5 - interior.x;
			const awayY = (topA.y + topB.y) * 0.5 - thickness * 0.5 - interior.y;
			const awayZ = (topA.z + topB.z) * 0.5 - interior.z;
			const facesOutward = tentative.x * awayX + tentative.y * awayY + tentative.z * awayZ >= 0;
			if (facesOutward) {
				pushTriangle(topA, topB, bottomB);
				pushTriangle(topA, bottomB, bottomA);
			} else {
				pushTriangle(topA, bottomB, topB);
				pushTriangle(topA, bottomA, bottomB);
			}
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	return geometry;
}

function triangleNormal(a: RoofVertex, b: RoofVertex, c: RoofVertex): THREE.Vector3 {
	const ab = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
	const ac = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z);
	const normal = ab.cross(ac);
	if (normal.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
	return normal.normalize();
}

/** Reverses point order (and, via `triangleNormal`'s cross product, the resulting winding) whenever the face's own Newell-style normal points downward — see `buildRoofSolidGeometry`'s doc comment. */
function ensureUpwardWinding(points: RoofVertex[]): RoofVertex[] {
	const normal = newellNormal(points);
	return normal.y < 0 ? points.slice().reverse() : points;
}

/** Vertical gable ends have ~zero Y normal, so the upward-skin rule cannot orient them. Reverse whenever the Newell normal points toward the roof interior. */
function ensureOutwardWinding(points: RoofVertex[], interior: RoofVertex): RoofVertex[] {
	const normal = newellNormal(points);
	const centroid = faceCentroid(points);
	const awayX = centroid.x - interior.x;
	const awayY = centroid.y - interior.y;
	const awayZ = centroid.z - interior.z;
	const facesOutward = normal.x * awayX + normal.y * awayY + normal.z * awayZ >= 0;
	return facesOutward ? points : points.slice().reverse();
}

function faceCentroid(points: RoofVertex[]): RoofVertex {
	let x = 0;
	let y = 0;
	let z = 0;
	for (const point of points) {
		x += point.x;
		y += point.y;
		z += point.z;
	}
	const n = points.length;
	return { x: x / n, y: y / n, z: z / n };
}

function newellNormal(points: RoofVertex[]): THREE.Vector3 {
	const normal = new THREE.Vector3();
	for (let i = 0; i < points.length; i++) {
		const current = points[i];
		const next = points[(i + 1) % points.length];
		normal.x += (current.y - next.y) * (current.z + next.z);
		normal.y += (current.z - next.z) * (current.x + next.x);
		normal.z += (current.x - next.x) * (current.y + next.y);
	}
	return normal;
}

/** Maps `fasciaEdges` (indexed against the ORIGINAL point order) onto whatever order `ensureUpwardWinding` ended up using — a straight pass-through if the winding wasn't reversed, or the standard "reversed polygon" edge-index remap if it was (edge `j` of a reversed N-gon is original edge `(N - 2 - j) mod N`, traversed backward). */
function reindexFasciaForWinding(
	originalPoints: RoofVertex[],
	fasciaEdges: boolean[],
	finalPoints: RoofVertex[]
): boolean[] {
	if (finalPoints === originalPoints) return fasciaEdges;
	const n = fasciaEdges.length;
	return fasciaEdges.map((_, j) => fasciaEdges[(((n - 2 - j) % n) + n) % n]);
}

/** Re-exported so callers that only have a raw point list (the tool's live preview) can normalize winding the same way `roofMath.ts` itself does. */
export { ensureCCW };
