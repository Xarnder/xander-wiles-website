import { describe, expect, it } from 'vitest';
import type { SurfaceMappingMode } from '../ProceduralMaterialTypes';
import { computeSurfaceMapping } from '../surfaceMapping';

type V3 = [number, number, number];

/** Two triangles for the quad a-b-c-d (counter-clockwise when seen from the front). */
function quad(a: V3, b: V3, c: V3, d: V3): number[] {
	return [...a, ...b, ...c, ...a, ...c, ...d];
}

function map(positions: number[], mode: SurfaceMappingMode, seed = 1) {
	return computeSurfaceMapping({
		positions: new Float32Array(positions),
		modeForTriangle: () => mode,
		seed,
		weathering: true
	});
}

/** UV extent (max − min) along each axis over a set of vertices. */
function uvExtent(uv: Float32Array): [number, number] {
	let minU = Infinity;
	let maxU = -Infinity;
	let minV = Infinity;
	let maxV = -Infinity;
	for (let i = 0; i < uv.length; i += 2) {
		minU = Math.min(minU, uv[i]);
		maxU = Math.max(maxU, uv[i]);
		minV = Math.min(minV, uv[i + 1]);
		maxV = Math.max(maxV, uv[i + 1]);
	}
	return [maxU - minU, maxV - minV];
}

describe('computeSurfaceMapping', () => {
	it('maps walls in real-world metres regardless of wall size', () => {
		for (const length of [2, 20]) {
			const wall = quad([0, 0, 0], [length, 0, 0], [length, 3, 0], [0, 3, 0]);
			const [du, dv] = uvExtent(map(wall, 'planar').uv);
			expect(du).toBeCloseTo(length, 4);
			expect(dv).toBeCloseTo(3, 4);
		}
	});

	it('does not stretch a wall at an arbitrary angle', () => {
		const angle = 0.6;
		const dx = Math.cos(angle) * 5;
		const dz = Math.sin(angle) * 5;
		const wall = quad([0, 0, 0], [dx, 0, dz], [dx, 2, dz], [0, 2, 0]);
		const [du, dv] = uvExtent(map(wall, 'planar').uv);
		expect(du).toBeCloseTo(5, 4);
		expect(dv).toBeCloseTo(2, 4);
	});

	it('keeps a quad continuous: shared vertices get identical UVs from both triangles', () => {
		const wall = quad([0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]);
		const { uv } = map(wall, 'planar');
		// Vertex a appears at indices 0 and 3, c at 2 and 4.
		expect(uv[0]).toBeCloseTo(uv[6], 5);
		expect(uv[1]).toBeCloseTo(uv[7], 5);
		expect(uv[4]).toBeCloseTo(uv[8], 5);
		expect(uv[5]).toBeCloseTo(uv[9], 5);
	});

	it('runs wood grain (U) along the long axis of posts, beams and braces', () => {
		const cases: { face: number[]; length: number }[] = [
			{ face: quad([0, 0, 0], [0.2, 0, 0], [0.2, 3, 0], [0, 3, 0]), length: 3 }, // vertical post
			{ face: quad([0, 0, 0], [6, 0, 0], [6, 0.3, 0], [0, 0.3, 0]), length: 6 }, // horizontal beam
			{
				// diagonal brace: 2.5 m long, 0.15 m wide, at 40°
				face: (() => {
					const c = Math.cos(0.7);
					const s = Math.sin(0.7);
					const L = 2.5;
					const W = 0.15;
					return quad(
						[0, 0, 0],
						[c * L, s * L, 0],
						[c * L - s * W, s * L + c * W, 0],
						[-s * W, c * W, 0]
					);
				})(),
				length: 2.5
			}
		];
		for (const { face, length } of cases) {
			const [du] = uvExtent(map(face, 'grain').uv);
			expect(du).toBeCloseTo(length, 3);
		}
	});

	it('starts roof V at the eave of each roof plane', () => {
		// A 45° roof plane rising from y = 3 (eave) toward +z.
		const roof = quad([0, 3, 0], [8, 3, 0], [8, 6, 3], [0, 6, 3]);
		const { uv } = map(roof, 'roof');
		let minV = Infinity;
		let maxV = -Infinity;
		for (let i = 1; i < uv.length; i += 2) {
			minV = Math.min(minV, uv[i]);
			maxV = Math.max(maxV, uv[i]);
		}
		expect(minV).toBeCloseTo(0, 4);
		expect(maxV).toBeCloseTo(Math.hypot(3, 3), 4);
	});

	it('is deterministic per seed and varies between buildings', () => {
		const floor = quad([0, 0, 0], [0, 0, 4], [4, 0, 4], [4, 0, 0]);
		const a = map(floor, 'planar', 5);
		const b = map(floor, 'planar', 5);
		const c = map(floor, 'planar', 6);
		expect(Array.from(a.uv)).toEqual(Array.from(b.uv));
		expect(Array.from(a.color)).toEqual(Array.from(b.color));
		expect(Array.from(c.uv)).not.toEqual(Array.from(a.uv));
	});

	it('produces finite colours near 1 and darkens walls toward the ground', () => {
		const wall = quad([0, -1.5, 0], [4, -1.5, 0], [4, 3, 0], [0, 3, 0]);
		const { color } = map(wall, 'planar');
		for (const value of color) {
			expect(Number.isFinite(value)).toBe(true);
			expect(value).toBeGreaterThan(0.5);
			expect(value).toBeLessThan(1.4);
		}
		// Vertex 0 is at the bottom, vertex 2 at the top.
		expect(color[0]).toBeLessThan(color[6]);
	});
});
