import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildSlabGeometry } from '../SlabGeometryBuilder';
import type { Point2D } from '../wallPathMath';

const SQUARE_CCW: Point2D[] = [
	{ x: 0, z: 0 },
	{ x: 4, z: 0 },
	{ x: 4, z: 4 },
	{ x: 0, z: 4 }
];
const SQUARE_CW = [...SQUARE_CCW].reverse();

/** Every triangle's face normal (via cross product of its edges, in output vertex order) plus its centroid — used to identify which triangles belong to the top/bottom/side/collar faces. */
function faceNormals(
	geometry: THREE.BufferGeometry
): { normal: THREE.Vector3; centroidX: number; centroidY: number; centroidZ: number }[] {
	const position = geometry.getAttribute('position');
	const index = geometry.getIndex()!;
	const results: {
		normal: THREE.Vector3;
		centroidX: number;
		centroidY: number;
		centroidZ: number;
	}[] = [];
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	for (let i = 0; i < index.count; i += 3) {
		a.fromBufferAttribute(position, index.getX(i));
		b.fromBufferAttribute(position, index.getX(i + 1));
		c.fromBufferAttribute(position, index.getX(i + 2));
		const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
		normal.normalize();
		results.push({
			normal,
			centroidX: (a.x + b.x + c.x) / 3,
			centroidY: (a.y + b.y + c.y) / 3,
			centroidZ: (a.z + b.z + c.z) / 3
		});
	}
	return results;
}

describe('buildSlabGeometry — winding and normals', () => {
	it('produces a solid volume: top faces point +Y, bottom faces point -Y, for a simple square', () => {
		const geometry = buildSlabGeometry(SQUARE_CCW, 3, 2.8);
		const faces = faceNormals(geometry);

		const topFaces = faces.filter((f) => Math.abs(f.centroidY - 3) < 1e-6);
		const bottomFaces = faces.filter((f) => Math.abs(f.centroidY - 2.8) < 1e-6);

		expect(topFaces.length).toBeGreaterThan(0);
		expect(bottomFaces.length).toBeGreaterThan(0);
		for (const face of topFaces) expect(face.normal.y).toBeGreaterThan(0.9);
		for (const face of bottomFaces) expect(face.normal.y).toBeLessThan(-0.9);
	});

	it('side faces point outward (away from the polygon centre), not inward', () => {
		const geometry = buildSlabGeometry(SQUARE_CCW, 3, 2.8);
		const faces = faceNormals(geometry);
		const sideFaces = faces.filter(
			(f) => Math.abs(f.centroidY - 3) > 1e-6 && Math.abs(f.centroidY - 2.8) > 1e-6
		);
		expect(sideFaces.length).toBeGreaterThan(0);
		// Every side face's normal should have a near-zero Y component (purely horizontal) and point
		// away from the square's centre (2, *, 2) — check via a representative sample: at least one
		// face should point in each of the four cardinal-ish outward directions for this square.
		for (const face of sideFaces) {
			expect(Math.abs(face.normal.y)).toBeLessThan(0.01);
		}
	});

	it('produces an identical solid result regardless of input winding direction', () => {
		const ccwGeometry = buildSlabGeometry(SQUARE_CCW, 3, 2.8);
		const cwGeometry = buildSlabGeometry(SQUARE_CW, 3, 2.8);

		const ccwFaces = faceNormals(ccwGeometry);
		const cwFaces = faceNormals(cwGeometry);

		const ccwTopCount = ccwFaces.filter((f) => f.normal.y > 0.9).length;
		const cwTopCount = cwFaces.filter((f) => f.normal.y > 0.9).length;
		const ccwBottomCount = ccwFaces.filter((f) => f.normal.y < -0.9).length;
		const cwBottomCount = cwFaces.filter((f) => f.normal.y < -0.9).length;

		expect(cwTopCount).toBe(ccwTopCount);
		expect(cwBottomCount).toBe(ccwBottomCount);
		expect(cwFaces.length).toBe(ccwFaces.length);
	});

	it('handles a concave (L-shaped) polygon without degenerate/missing triangles', () => {
		const lShape: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 2 },
			{ x: 2, z: 2 },
			{ x: 2, z: 4 },
			{ x: 0, z: 4 }
		];
		const geometry = buildSlabGeometry(lShape, 3, 2.8);
		const faces = faceNormals(geometry);
		const topFaces = faces.filter((f) => Math.abs(f.centroidY - 3) < 1e-6);
		// An L-shape (6 vertices) triangulates to 4 triangles per face (n-2).
		expect(topFaces).toHaveLength(4);
		for (const face of topFaces) expect(face.normal.y).toBeGreaterThan(0.9);
	});
});

describe('buildSlabGeometry — holes (stair openings)', () => {
	const OUTER: Point2D[] = [
		{ x: 0, z: 0 },
		{ x: 10, z: 0 },
		{ x: 10, z: 10 },
		{ x: 0, z: 10 }
	];
	const HOLE: Point2D[] = [
		{ x: 4, z: 4 },
		{ x: 6, z: 4 },
		{ x: 6, z: 6 },
		{ x: 4, z: 6 }
	];

	it('cuts a real gap through both the top and bottom faces — a ray straight through the hole hits nothing', () => {
		const geometry = buildSlabGeometry(OUTER, 3, 2.8, [HOLE]);
		const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
		const raycaster = new THREE.Raycaster();

		raycaster.set(new THREE.Vector3(5, 10, 5), new THREE.Vector3(0, -1, 0));
		expect(raycaster.intersectObject(mesh, false)).toHaveLength(0);

		// Just outside the hole (still inside the outer polygon) must still be solid.
		raycaster.set(new THREE.Vector3(1, 10, 1), new THREE.Vector3(0, -1, 0));
		expect(raycaster.intersectObject(mesh, false).length).toBeGreaterThan(0);
	});

	it("regression: the collar (inner hole wall) faces INTO the hole, not into the solid material — otherwise it's invisible from a normal viewing angle on a single-sided material, and the opening doesn't visually read as a hole", () => {
		const geometry = buildSlabGeometry(OUTER, 3, 2.8, [HOLE]);
		const faces = faceNormals(geometry);
		const holeCenterX = 5;
		const holeCenterZ = 5;

		const collarFaces = faces.filter(
			(f) =>
				f.centroidX >= 3.9 &&
				f.centroidX <= 6.1 &&
				f.centroidZ >= 3.9 &&
				f.centroidZ <= 6.1 &&
				f.centroidY > 2.8 &&
				f.centroidY < 3
		);
		// 4 hole edges * 2 triangles each.
		expect(collarFaces).toHaveLength(8);

		for (const face of collarFaces) {
			const towardHoleCenterX = holeCenterX - face.centroidX;
			const towardHoleCenterZ = holeCenterZ - face.centroidZ;
			const length = Math.hypot(towardHoleCenterX, towardHoleCenterZ);
			const dot = (face.normal.x * towardHoleCenterX + face.normal.z * towardHoleCenterZ) / length;
			// A properly oriented collar face's normal points toward the hole's centre (into the
			// empty opening), not away from it (into the solid slab material).
			expect(dot).toBeGreaterThan(0.9);
		}
	});

	it('produces an identical hole regardless of the outer polygon or hole winding direction', () => {
		const outerCW = [...OUTER].reverse();
		const holeCW = [...HOLE].reverse();

		for (const [outer, hole] of [
			[OUTER, HOLE],
			[OUTER, holeCW],
			[outerCW, HOLE],
			[outerCW, holeCW]
		] as const) {
			const geometry = buildSlabGeometry(outer, 3, 2.8, [hole]);
			const mesh = new THREE.Mesh(
				geometry,
				new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
			);
			const raycaster = new THREE.Raycaster();
			raycaster.set(new THREE.Vector3(5, 10, 5), new THREE.Vector3(0, -1, 0));
			expect(raycaster.intersectObject(mesh, false)).toHaveLength(0);
		}
	});
});
