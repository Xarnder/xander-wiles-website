import * as THREE from 'three';
import { buildingGridToLocal } from './FoundationLocalMath';
import { ensureCCW, signedArea2D } from './slabMath';
import type { Point2D } from './wallPathMath';
import type { SlabDefinition, SlabOpeningDefinition } from './SlabTypes';
import { slabBottomY } from './SlabTypes';

/**
 * Builds one slab's solid prism geometry: a real extruded volume (top surface, underside, and
 * vertical side walls) — never a single-sided flat `ShapeGeometry` — so the underside is visible
 * from inside a room and collision can treat it as an actual solid. Supports concave simple
 * polygons via `THREE.ShapeUtils.triangulateShape` (Earcut-based ear-clipping), not just convex fans.
 *
 * Winding is normalized to a fixed convention (`ensureCCW`) before triangulating, so the resulting
 * top/bottom/side faces always end up correctly oriented (verified directly in
 * SlabGeometryBuilder.spec.ts by computing each face's actual normal from the output buffer)
 * regardless of which direction the user drew the polygon in — clockwise and counter-clockwise
 * input always produce an identical, correctly-lit result.
 *
 * `holes` (e.g. a stair opening — see SlabTypes.SlabOpeningDefinition) punches an ACTUAL physical
 * hole: `THREE.ShapeUtils.triangulateShape` cuts them out of the top/bottom faces, and this
 * function additionally builds an inward-facing "collar" wall around each hole's boundary
 * connecting the top and bottom rings — the hole is a real gap, not just a texture/visual trick, so
 * collision built from this geometry naturally has an opening too.
 */
export function buildSlabGeometry(
	points: readonly Point2D[],
	topY: number,
	bottomY: number,
	holes: readonly (readonly Point2D[])[] = []
): THREE.BufferGeometry {
	const ccw = ensureCCW(points);
	const n = ccw.length;
	if (n < 3) return new THREE.BufferGeometry();

	// Hole winding is normalized opposite the outer contour purely so this function's own collar-
	// wall winding logic (mirrored from the outer wall's, but facing inward) stays consistent;
	// triangulateShape/earcut itself doesn't require any particular hole winding.
	const normalizedHoles = holes
		.filter((hole) => hole.length >= 3)
		.map((hole) => (signedArea2D(hole) > 0 ? [...hole].reverse() : [...hole]));

	const shapePoints = ccw.map((p) => new THREE.Vector2(p.x, p.z));
	const holePointSets = normalizedHoles.map((hole) => hole.map((p) => new THREE.Vector2(p.x, p.z)));
	const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, holePointSets);

	// triangulateShape's returned indices reference the OUTER contour points followed by each
	// hole's points, in order, concatenated into one flat list — so the combined point list below
	// must match that exact order.
	const allPoints: Point2D[] = [...ccw, ...normalizedHoles.flat()];
	const totalN = allPoints.length;

	const positions: number[] = [];
	for (const p of allPoints) positions.push(p.x, bottomY, p.z); // bottom ring: indices [0, totalN)
	for (const p of allPoints) positions.push(p.x, topY, p.z); // top ring: indices [totalN, 2*totalN)

	const indices: number[] = [];
	// Bottom face (-Y normal): triangulation order as-is.
	for (const [a, b, c] of triangles) indices.push(a, b, c);
	// Top face (+Y normal): b/c swapped relative to the bottom face's winding.
	for (const [a, b, c] of triangles) indices.push(totalN + a, totalN + c, totalN + b);
	// Outer side walls (outward normal) — for a CCW-ordered polygon, (bottom_i, top_i, top_{i+1})
	// and (bottom_i, top_{i+1}, bottom_{i+1}) both face outward; see SlabGeometryBuilder.spec.ts.
	for (let i = 0; i < n; i++) {
		const a = i;
		const b = (i + 1) % n;
		const aTop = totalN + i;
		const bTop = totalN + ((i + 1) % n);
		indices.push(a, aTop, bTop, a, bTop, b);
	}
	// Inner "collar" walls around each hole (inward-facing normal, into the hole's empty interior).
	// `normalizedHoles` already reversed each hole's point order (CW) relative to the outer
	// contour's CCW — that reversed LOOP direction is what flips the result to face inward, so this
	// uses the exact same (a, aTop, bTop), (a, bTop, b) pattern the outer wall does. An earlier
	// version additionally reversed the triangle index order here too, on top of the already-reversed
	// loop, which cancelled out and pointed every collar face into the solid material instead of into
	// the hole — invisible from inside the opening looking up/down, on any single-sided material (see
	// the regression test that computes each collar triangle's actual geometric normal).
	let holeOffset = n;
	for (const hole of normalizedHoles) {
		const hn = hole.length;
		for (let i = 0; i < hn; i++) {
			const a = holeOffset + i;
			const b = holeOffset + ((i + 1) % hn);
			const aTop = totalN + a;
			const bTop = totalN + b;
			indices.push(a, aTop, bTop, a, bTop, b);
		}
		holeOffset += hn;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

/** One opening's foundation-local rectangle, as a 4-point CCW polygon — the plain-data `holes` input `buildSlabGeometry` needs. */
export function slabOpeningLocalPolygon(
	opening: Pick<SlabOpeningDefinition, 'minGridX' | 'maxGridX' | 'minGridZ' | 'maxGridZ'>,
	buildingGridSize: number
): Point2D[] {
	const min = buildingGridToLocal(
		{ gridX: opening.minGridX, gridZ: opening.minGridZ },
		buildingGridSize
	);
	const max = buildingGridToLocal(
		{ gridX: opening.maxGridX, gridZ: opening.maxGridZ },
		buildingGridSize
	);
	return [
		{ x: min.localX, z: min.localZ },
		{ x: max.localX, z: min.localZ },
		{ x: max.localX, z: max.localZ },
		{ x: min.localX, z: max.localZ }
	];
}

/** One slab's local (foundation-local X/Z) point list, top Y and bottom Y — the plain-data input `buildSlabGeometry` needs, derived once from a `SlabDefinition` plus the current building grid size. */
export function slabLocalPolygon(
	slab: Pick<SlabDefinition, 'points'>,
	buildingGridSize: number
): Point2D[] {
	return slab.points.map((p) => {
		const local = buildingGridToLocal(p, buildingGridSize);
		return { x: local.localX, z: local.localZ };
	});
}

export { slabBottomY };
