import * as THREE from 'three';
import { buildingGridToLocal } from './FoundationLocalMath';
import { ensureCCW } from './slabMath';
import type { Point2D } from './wallPathMath';
import type { SlabDefinition } from './SlabTypes';
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
 */
export function buildSlabGeometry(
	points: readonly Point2D[],
	topY: number,
	bottomY: number
): THREE.BufferGeometry {
	const ccw = ensureCCW(points);
	const n = ccw.length;
	if (n < 3) return new THREE.BufferGeometry();

	const shapePoints = ccw.map((p) => new THREE.Vector2(p.x, p.z));
	const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);

	const positions: number[] = [];
	for (const p of ccw) positions.push(p.x, bottomY, p.z); // bottom ring: indices [0, n)
	for (const p of ccw) positions.push(p.x, topY, p.z); // top ring: indices [n, 2n)

	const indices: number[] = [];
	// Bottom face (-Y normal): triangulation order as-is.
	for (const [a, b, c] of triangles) indices.push(a, b, c);
	// Top face (+Y normal): b/c swapped relative to the bottom face's winding.
	for (const [a, b, c] of triangles) indices.push(n + a, n + c, n + b);
	// Sides (outward normal) — for a CCW-ordered polygon, (bottom_i, top_i, top_{i+1}) and
	// (bottom_i, top_{i+1}, bottom_{i+1}) both face outward; see SlabGeometryBuilder.spec.ts.
	for (let i = 0; i < n; i++) {
		const a = i;
		const b = (i + 1) % n;
		const aTop = n + i;
		const bTop = n + ((i + 1) % n);
		indices.push(a, aTop, bTop, a, bTop, b);
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
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
