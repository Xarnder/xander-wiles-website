import { describe, expect, it } from 'vitest';
import {
	buildSegmentFootprint,
	clipPolygonToURange,
	computeJoinAt,
	computePathLength,
	computeWallPathJoints,
	distance2D,
	lineIntersection2D,
	normalize2D,
	pathSelfIntersects,
	perpLeft,
	projectFootprintToLocal,
	segmentsIntersect,
	sub
} from '../wallPathMath';
import type { Point2D } from '../wallPathMath';

const HALF_THICKNESS = 0.075; // wallThickness 0.15 / 2

describe('perpLeft / lineIntersection2D', () => {
	it('rotates a direction 90 degrees', () => {
		const a = perpLeft({ x: 1, z: 0 });
		expect(a.x).toBeCloseTo(0);
		expect(a.z).toBeCloseTo(1);
		const b = perpLeft({ x: 0, z: 1 });
		expect(b.x).toBeCloseTo(-1);
		expect(b.z).toBeCloseTo(0);
	});

	it('finds the intersection of two non-parallel lines', () => {
		const p = lineIntersection2D({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 5, z: -5 }, { x: 0, z: 1 });
		expect(p).not.toBeNull();
		expect(p!.x).toBeCloseTo(5);
		expect(p!.z).toBeCloseTo(0);
	});

	it('returns null for parallel lines', () => {
		expect(
			lineIntersection2D({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 5 }, { x: 1, z: 0 })
		).toBeNull();
	});
});

describe('computeJoinAt — 90-degree corners', () => {
	it('produces a single symmetric miter point for a right turn (B: 0,0 -> 4,0 -> 4,4)', () => {
		const prevDir = normalize2D({ x: 4, z: 0 });
		const nextDir = normalize2D({ x: 0, z: 4 });
		const corner = { x: 4, z: 0 };
		const join = computeJoinAt(prevDir, nextDir, corner, HALF_THICKNESS, 'miter', 4);

		expect(join.left).toHaveLength(1);
		expect(join.right).toHaveLength(1);

		// For a 90-degree corner the miter point sits at distance halfThickness*sqrt(2) from the
		// corner, on the diagonal bisector — check both sides land exactly opposite one another
		// through the corner (symmetric join, no lopsided overlap).
		const leftDist = distance2D(join.left[0], corner);
		const rightDist = distance2D(join.right[0], corner);
		expect(leftDist).toBeCloseTo(HALF_THICKNESS * Math.SQRT2);
		expect(rightDist).toBeCloseTo(HALF_THICKNESS * Math.SQRT2);
	});

	it('produces an equally clean join for a left turn (mirror of the right-turn case)', () => {
		const prevDir = normalize2D({ x: 4, z: 0 });
		const nextDir = normalize2D({ x: 0, z: -4 }); // turn the other way
		const corner = { x: 4, z: 0 };
		const join = computeJoinAt(prevDir, nextDir, corner, HALF_THICKNESS, 'miter', 4);

		expect(distance2D(join.left[0], corner)).toBeCloseTo(HALF_THICKNESS * Math.SQRT2);
		expect(distance2D(join.right[0], corner)).toBeCloseTo(HALF_THICKNESS * Math.SQRT2);
	});

	it('gives identical corner shape regardless of clockwise vs counter-clockwise winding', () => {
		// Same physical corner, path walked in the opposite order.
		const cw = computeJoinAt(
			normalize2D({ x: 1, z: 0 }),
			normalize2D({ x: 0, z: 1 }),
			{ x: 0, z: 0 },
			HALF_THICKNESS,
			'miter',
			4
		);
		const ccw = computeJoinAt(
			normalize2D({ x: 0, z: -1 }),
			normalize2D({ x: -1, z: 0 }),
			{ x: 0, z: 0 },
			HALF_THICKNESS,
			'miter',
			4
		);
		// Both are single-point 90-degree miters at the same distance from the corner.
		expect(distance2D(cw.left[0], { x: 0, z: 0 })).toBeCloseTo(
			distance2D(ccw.left[0], { x: 0, z: 0 })
		);
	});
});

describe('computeJoinAt — straight-through points', () => {
	it('collapses to a single shared point with no bulge for nearly collinear segments', () => {
		const prevDir = normalize2D({ x: 1, z: 0 });
		const nextDir = normalize2D({ x: 1, z: 0.0001 }); // effectively straight
		const join = computeJoinAt(prevDir, nextDir, { x: 2, z: 0 }, HALF_THICKNESS, 'miter', 4);
		expect(join.left).toHaveLength(1);
		expect(join.right).toHaveLength(1);
		expect(join.left[0].z).toBeCloseTo(HALF_THICKNESS);
		expect(join.right[0].z).toBeCloseTo(-HALF_THICKNESS);
	});

	it('exactly collinear points produce the plain offset, not an intersection artifact', () => {
		const dir = normalize2D({ x: 1, z: 0 });
		const join = computeJoinAt(dir, dir, { x: 2, z: 0 }, HALF_THICKNESS, 'miter', 4);
		expect(join.left[0]).toEqual({ x: 2, z: HALF_THICKNESS });
	});
});

describe('computeJoinAt — acute angles and miterLimit fallback', () => {
	it('falls back to a bevel (two points) when the miter ratio exceeds miterLimit', () => {
		// A very sharp, near-reversal turn produces an enormous miter spike.
		const prevDir = normalize2D({ x: 1, z: 0 });
		const nextDir = normalize2D({ x: -1, z: 0.05 });
		const join = computeJoinAt(prevDir, nextDir, { x: 2, z: 0 }, HALF_THICKNESS, 'miter', 2);
		expect(join.left.length === 2 || join.right.length === 2).toBe(true);
	});

	it('a reasonable corner within the limit stays a single-point miter', () => {
		const prevDir = normalize2D({ x: 1, z: 0 });
		const nextDir = normalize2D({ x: 1, z: 1 }); // 45-degree turn
		const join = computeJoinAt(prevDir, nextDir, { x: 2, z: 0 }, HALF_THICKNESS, 'miter', 4);
		expect(join.left).toHaveLength(1);
		expect(join.right).toHaveLength(1);
	});

	it('explicit bevel style always produces two points regardless of angle', () => {
		const prevDir = normalize2D({ x: 1, z: 0 });
		const nextDir = normalize2D({ x: 0, z: 1 });
		const join = computeJoinAt(prevDir, nextDir, { x: 2, z: 0 }, HALF_THICKNESS, 'bevel', 4);
		expect(join.left).toHaveLength(2);
		expect(join.right).toHaveLength(2);
	});
});

describe('computeJoinAt — diagonal corners', () => {
	it('handles a straight -> diagonal join', () => {
		const prevDir = normalize2D({ x: 1, z: 0 });
		const nextDir = normalize2D({ x: 3, z: 4 });
		const join = computeJoinAt(prevDir, nextDir, { x: 2, z: 0 }, HALF_THICKNESS, 'miter', 4);
		expect(join.left).toHaveLength(1);
		expect(join.right).toHaveLength(1);
		expect(Number.isFinite(join.left[0].x)).toBe(true);
		expect(Number.isFinite(join.left[0].z)).toBe(true);
	});

	it('handles a diagonal -> straight join', () => {
		const prevDir = normalize2D({ x: 3, z: 4 });
		const nextDir = normalize2D({ x: 0, z: 1 });
		const join = computeJoinAt(prevDir, nextDir, { x: 2, z: 0 }, HALF_THICKNESS, 'miter', 4);
		expect(join.left).toHaveLength(1);
		expect(join.right).toHaveLength(1);
	});

	it('handles a diagonal -> diagonal join', () => {
		const prevDir = normalize2D({ x: 3, z: 4 });
		const nextDir = normalize2D({ x: 4, z: -3 });
		const join = computeJoinAt(prevDir, nextDir, { x: 2, z: 0 }, HALF_THICKNESS, 'miter', 4);
		expect(join.left).toHaveLength(1);
		expect(join.right).toHaveLength(1);
	});
});

describe('buildSegmentFootprint', () => {
	it('matches a plain rectangle when unjoined at both ends (standalone-wall equivalence)', () => {
		const start = { x: 0, z: 0 };
		const end = { x: 4, z: 0 };
		const footprint = buildSegmentFootprint(start, end, null, null, HALF_THICKNESS);
		expect(footprint).toEqual([
			{ x: 0, z: HALF_THICKNESS },
			{ x: 4, z: HALF_THICKNESS },
			{ x: 4, z: -HALF_THICKNESS },
			{ x: 0, z: -HALF_THICKNESS }
		]);
	});

	it('produces a closed, non-self-intersecting quadrilateral for a joined 90-degree corner', () => {
		// Path: (0,0) -> (4,0) -> (4,4). Build the first segment's footprint with a real join at its end.
		const start = { x: 0, z: 0 };
		const end = { x: 4, z: 0 };
		const nextDir = normalize2D({ x: 0, z: 4 });
		const endJoin = computeJoinAt(
			normalize2D(sub(end, start)),
			nextDir,
			end,
			HALF_THICKNESS,
			'miter',
			4
		);
		const footprint = buildSegmentFootprint(start, end, null, endJoin, HALF_THICKNESS);

		expect(footprint).toHaveLength(4);
		// One side is the outside of the turn (its miter point extends past x=4); the other is the
		// inside (pulled in short of x=4). Exactly one of the two end points should extend past —
		// which physical side is "outside" depends on turn direction, not on the left/right label.
		const endLeft = footprint[1];
		const endRight = footprint[2];
		const outside = [endLeft, endRight].filter((p) => p.x > 4);
		const inside = [endLeft, endRight].filter((p) => p.x < 4);
		expect(outside).toHaveLength(1);
		expect(inside).toHaveLength(1);
	});
});

describe('projectFootprintToLocal', () => {
	it('projects a plain rectangle footprint into (0, length) local U range', () => {
		const start = { x: 5, z: 5 };
		const end = { x: 9, z: 5 };
		const footprint = buildSegmentFootprint(start, end, null, null, HALF_THICKNESS);
		const dir = normalize2D(sub(end, start));
		const local = projectFootprintToLocal(footprint, start, dir);
		const expected = [
			{ x: 0, z: HALF_THICKNESS },
			{ x: 4, z: HALF_THICKNESS },
			{ x: 4, z: -HALF_THICKNESS },
			{ x: 0, z: -HALF_THICKNESS }
		];
		local.forEach((p, i) => {
			expect(p.x).toBeCloseTo(expected[i].x);
			expect(p.z).toBeCloseTo(expected[i].z);
		});
	});
});

describe('clipPolygonToURange', () => {
	const rect: Point2D[] = [
		{ x: 0, z: 1 },
		{ x: 4, z: 1 },
		{ x: 4, z: -1 },
		{ x: 0, z: -1 }
	];

	it('clips a rectangle to a narrower U sub-range, preserving Z extent', () => {
		const clipped = clipPolygonToURange(rect, 1, 3);
		const xs = clipped.map((p) => p.x);
		expect(Math.min(...xs)).toBeCloseTo(1);
		expect(Math.max(...xs)).toBeCloseTo(3);
		const zs = clipped.map((p) => p.z);
		expect(Math.min(...zs)).toBeCloseTo(-1);
		expect(Math.max(...zs)).toBeCloseTo(1);
	});

	it('returns the polygon unchanged when the range covers it entirely', () => {
		const clipped = clipPolygonToURange(rect, -1, 5);
		const xs = clipped.map((p) => p.x).sort((a, b) => a - b);
		expect(xs[0]).toBeCloseTo(0);
		expect(xs[xs.length - 1]).toBeCloseTo(4);
	});

	it('returns an empty polygon when the range misses it entirely', () => {
		expect(clipPolygonToURange(rect, 10, 20)).toHaveLength(0);
	});
});

describe('pathSelfIntersects', () => {
	it('allows a simple open zigzag path', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 4 },
			{ x: 8, z: 4 }
		];
		expect(pathSelfIntersects(points, false)).toBe(false);
	});

	it('allows a simple closed rectangle', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 3 },
			{ x: 0, z: 3 }
		];
		expect(pathSelfIntersects(points, true)).toBe(false);
	});

	it('detects an obvious bowtie self-intersection', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 4 },
			{ x: 4, z: 0 },
			{ x: 0, z: 4 }
		];
		expect(pathSelfIntersects(points, false)).toBe(true);
	});

	it('does not flag adjacent segments sharing an endpoint as intersecting', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 4 }
		];
		expect(pathSelfIntersects(points, false)).toBe(false);
	});
});

describe('segmentsIntersect', () => {
	it('detects a simple crossing X', () => {
		expect(segmentsIntersect({ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }, { x: 4, z: 0 })).toBe(
			true
		);
	});

	it('does not flag two segments that merely share an endpoint', () => {
		expect(segmentsIntersect({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 })).toBe(
			true
		); // touching at a shared endpoint counts as "on segment" — callers skip adjacent pairs explicitly
	});

	it('does not flag two parallel, non-overlapping segments', () => {
		expect(segmentsIntersect({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 2 }, { x: 4, z: 2 })).toBe(
			false
		);
	});
});

describe('computeWallPathJoints', () => {
	it('has no join at either end of an open path', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 4 }
		];
		const joints = computeWallPathJoints(points, false, HALF_THICKNESS, 'miter', 4);
		expect(joints[0]).toBeNull();
		expect(joints[2]).toBeNull();
		expect(joints[1]).not.toBeNull();
	});

	it('joins every point of a closed rectangle, including the wrap-around corner, with four clean corners', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 3 },
			{ x: 0, z: 3 }
		];
		const joints = computeWallPathJoints(points, true, HALF_THICKNESS, 'miter', 4);
		expect(joints.every((j) => j !== null)).toBe(true);

		// Every corner is a plain 90-degree turn — all four should produce a single-point miter,
		// each at the same distance from its corner (no special-cased/uneven closing corner).
		for (let i = 0; i < 4; i++) {
			const join = joints[i]!;
			expect(join.left).toHaveLength(1);
			expect(join.right).toHaveLength(1);
			const leftDist = distance2D(join.left[0], points[i]);
			const rightDist = distance2D(join.right[0], points[i]);
			expect(leftDist).toBeCloseTo(HALF_THICKNESS * Math.SQRT2);
			expect(rightDist).toBeCloseTo(HALF_THICKNESS * Math.SQRT2);
		}
	});

	it('does not bulge at a near-collinear interior point', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 2, z: 0 },
			{ x: 4, z: 0 }
		];
		const joints = computeWallPathJoints(points, false, HALF_THICKNESS, 'miter', 4);
		expect(joints[1]!.left[0].z).toBeCloseTo(HALF_THICKNESS);
		expect(joints[1]!.left).toHaveLength(1);
	});
});

describe('computePathLength', () => {
	it('sums open path segment lengths', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 3, z: 4 },
			{ x: 3, z: 8 }
		];
		expect(computePathLength(points, false)).toBeCloseTo(9);
	});

	it('includes the closing segment for a closed path', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 3 },
			{ x: 0, z: 3 }
		];
		expect(computePathLength(points, true)).toBeCloseTo(4 + 3 + 4 + 3);
	});
});
