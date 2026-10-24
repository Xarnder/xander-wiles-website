import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import { buildSlabGeometry } from './SlabGeometryBuilder';
import type { ExposedSlabEdge } from './slabOverhangFrameMath';
import type { Point2D } from './wallPathMath';

/** A timber fascia at the slab rim: 3.5cm proud of the edge, 4cm below the underside. */
export function buildSlabOverhangFrame(
	edges: readonly ExposedSlabEdge[],
	topY: number,
	bottomY: number,
	materialManager: BuildingMaterialManager
): THREE.Group | null {
	if (edges.length === 0) return null;
	const projection = 0.035;
	const top = topY + 0.01;
	const bottom = bottomY - 0.04;
	const coincides = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.z - b.z) < 1e-6;
	const offsetCorner = (
		point: Point2D,
		normal: Point2D,
		adjacent: Point2D | undefined,
		offset: number
	) => {
		let x = normal.x * offset;
		let z = normal.z * offset;
		if (adjacent) {
			const denominator = 1 + normal.x * adjacent.x + normal.z * adjacent.z;
			if (denominator > 1e-6) {
				x = ((normal.x + adjacent.x) * offset) / denominator;
				z = ((normal.z + adjacent.z) * offset) / denominator;
				const scale = Math.min(1, (4 * Math.abs(offset)) / Math.max(1e-6, Math.hypot(x, z)));
				x *= scale;
				z *= scale;
			}
		}
		return { x: point.x + x, z: point.z + z };
	};
	const pieces = edges.map(({ start, end, outward }) => {
		const previous = edges.find((edge) => coincides(edge.end, start));
		const next = edges.find((edge) => coincides(edge.start, end));
		// Mitred corners meet exactly, avoiding overlapping top faces and flickering timber seams.
		// Keep the entire fascia outside the slab footprint. An inset strip overlaps the slab's
		// top/underside, whose material depth bias can pull those surfaces through the timber.
		return buildSlabGeometry(
			[
				offsetCorner(start, outward, previous?.outward, projection),
				offsetCorner(end, outward, next?.outward, projection),
				offsetCorner(end, outward, next?.outward, 0),
				offsetCorner(start, outward, previous?.outward, 0)
			],
			top,
			bottom
		);
	});
	const geometry = mergeGeometries(pieces, false);
	for (const piece of pieces) piece.dispose();
	if (!geometry) return null;
	const mesh = new THREE.Mesh(geometry, materialManager.getMaterial('wall-frame', undefined));
	mesh.name = 'slab-overhang-frame-solid';
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	const group = new THREE.Group();
	group.name = 'slab-overhang-frame';
	group.add(mesh);
	return group;
}
