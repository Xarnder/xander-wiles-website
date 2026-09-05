import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeStairMetrics } from '../stairMath';
import type { StairLocalBounds } from '../stairMath';
import { buildStairGeometry } from '../StairGeometryBuilder';
import type { StairDirection } from '../StairTypes';

/** Every triangle's GEOMETRIC face normal (cross product of its edges, in output vertex order — i.e. what actually determines front-facing/culling, unlike the smoothed vertex-normal attribute) plus its centroid Y. Mirrors SlabGeometryBuilder.spec.ts's technique. */
function faceNormals(
	geometry: THREE.BufferGeometry
): { normal: THREE.Vector3; centroidY: number }[] {
	const position = geometry.getAttribute('position');
	const index = geometry.getIndex()!;
	const results: { normal: THREE.Vector3; centroidY: number }[] = [];
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	for (let i = 0; i < index.count; i += 3) {
		a.fromBufferAttribute(position, index.getX(i));
		b.fromBufferAttribute(position, index.getX(i + 1));
		c.fromBufferAttribute(position, index.getX(i + 2));
		const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
		normal.normalize();
		results.push({ normal, centroidY: (a.y + b.y + c.y) / 3 });
	}
	return results;
}

function boundingBox(positions: Float32Array): {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
} {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	for (let i = 0; i < positions.length; i += 3) {
		const x = positions[i];
		const y = positions[i + 1];
		const z = positions[i + 2];
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
		minZ = Math.min(minZ, z);
		maxZ = Math.max(maxZ, z);
	}
	return { minX, maxX, minY, maxY, minZ, maxZ };
}

const BOUNDS_X: StairLocalBounds = { minLocalX: 0, maxLocalX: 3, minLocalZ: 0, maxLocalZ: 1 };
const BOUNDS_Z: StairLocalBounds = { minLocalX: 0, maxLocalX: 1, minLocalZ: 0, maxLocalZ: 3 };

function build(direction: StairDirection, baseY: number, bounds: StairLocalBounds) {
	const footprint =
		direction === '+x' || direction === '-x'
			? { minGridX: 0, maxGridX: 12, minGridZ: 0, maxGridZ: 4 }
			: { minGridX: 0, maxGridX: 4, minGridZ: 0, maxGridZ: 12 };
	const metrics = computeStairMetrics({
		...footprint,
		direction,
		gridSizeAtCreation: 0.25,
		baseY
	});
	const geometry = buildStairGeometry(bounds, direction, baseY, metrics);
	const positions = geometry.getAttribute('position').array as Float32Array;
	return { geometry, positions, metrics };
}

describe('buildStairGeometry — top step convention', () => {
	it('the highest vertex reaches exactly baseY + totalRise, not one riser short', () => {
		const { positions, metrics } = build('+x', 0, BOUNDS_X);
		const box = boundingBox(positions);
		expect(box.maxY).toBeCloseTo(metrics.totalRise);
		expect(box.maxY).not.toBeCloseTo(metrics.totalRise - metrics.stepRise, 5);
	});

	it('reflects a non-zero baseY', () => {
		const { positions, metrics } = build('+x', 3, BOUNDS_X);
		const box = boundingBox(positions);
		expect(box.maxY).toBeCloseTo(3 + metrics.totalRise);
		expect(box.minY).toBeCloseTo(3);
	});
});

describe('buildStairGeometry — bottom convention', () => {
	it('the lowest vertex sits exactly at baseY (first tread rises from the base floor)', () => {
		const { positions } = build('+x', 0, BOUNDS_X);
		const box = boundingBox(positions);
		expect(box.minY).toBeCloseTo(0);
	});
});

describe('buildStairGeometry — direction placement', () => {
	it('+x spans from minLocalX to maxLocalX', () => {
		const { positions } = build('+x', 0, BOUNDS_X);
		const box = boundingBox(positions);
		expect(box.minX).toBeCloseTo(BOUNDS_X.minLocalX);
		expect(box.maxX).toBeCloseTo(BOUNDS_X.maxLocalX);
	});

	it('-x spans the same X range (mirrored internally, same bounding box)', () => {
		const { positions } = build('-x', 0, BOUNDS_X);
		const box = boundingBox(positions);
		expect(box.minX).toBeCloseTo(BOUNDS_X.minLocalX);
		expect(box.maxX).toBeCloseTo(BOUNDS_X.maxLocalX);
	});

	it('+z spans from minLocalZ to maxLocalZ', () => {
		const { positions } = build('+z', 0, BOUNDS_Z);
		const box = boundingBox(positions);
		expect(box.minZ).toBeCloseTo(BOUNDS_Z.minLocalZ);
		expect(box.maxZ).toBeCloseTo(BOUNDS_Z.maxLocalZ);
	});

	it('-z spans the same Z range', () => {
		const { positions } = build('-z', 0, BOUNDS_Z);
		const box = boundingBox(positions);
		expect(box.minZ).toBeCloseTo(BOUNDS_Z.minLocalZ);
		expect(box.maxZ).toBeCloseTo(BOUNDS_Z.maxLocalZ);
	});

	it('all four directions produce a non-degenerate mesh (indices and vertices present)', () => {
		for (const direction of ['+x', '-x', '+z', '-z'] as const) {
			const bounds = direction === '+x' || direction === '-x' ? BOUNDS_X : BOUNDS_Z;
			const { geometry } = build(direction, 0, bounds);
			expect(geometry.getIndex()!.count).toBeGreaterThan(0);
			expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
		}
	});
});

describe('buildStairGeometry — winding correctness (geometric face normals, not just the smoothed vertex attribute)', () => {
	it('every direction produces a topmost, fully-exposed tread whose face winding is genuinely upward-facing', () => {
		// The highest box's top face is never covered by anything else, so it must show up as an
		// upward-facing (+Y) triangle in every direction, including the two (`-x`, `+z`) whose
		// canonical→local remap is a reflection — this is what `stairDirectionFlipsWinding`'s
		// index-reversal exists to guarantee (see StairGeometryBuilder.ts's doc comment). A bug there
		// would silently invert this face's WINDING (backface-culled from outside) even though the
		// stored normal ATTRIBUTE still points the "right" way, which is exactly why this checks the
		// geometric (cross-product) normal rather than the attribute.
		for (const direction of ['+x', '-x', '+z', '-z'] as const) {
			const bounds = direction === '+x' || direction === '-x' ? BOUNDS_X : BOUNDS_Z;
			const { geometry, metrics } = build(direction, 0, bounds);
			const faces = faceNormals(geometry);
			const topFaces = faces.filter((f) => Math.abs(f.centroidY - metrics.totalRise) < 1e-6);
			expect(topFaces.length).toBeGreaterThan(0);
			for (const face of topFaces) expect(face.normal.y).toBeGreaterThan(0.9);
		}
	});

	it('the very bottom face (the underside) is genuinely downward-facing in every direction', () => {
		for (const direction of ['+x', '-x', '+z', '-z'] as const) {
			const bounds = direction === '+x' || direction === '-x' ? BOUNDS_X : BOUNDS_Z;
			const { geometry } = build(direction, 0, bounds);
			const faces = faceNormals(geometry);
			const bottomFaces = faces.filter((f) => Math.abs(f.centroidY - 0) < 1e-6);
			expect(bottomFaces.length).toBeGreaterThan(0);
			for (const face of bottomFaces) expect(face.normal.y).toBeLessThan(-0.9);
		}
	});
});
