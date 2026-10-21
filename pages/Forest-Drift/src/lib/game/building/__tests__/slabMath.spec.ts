import { describe, expect, it } from 'vitest';
import {
	ensureCCW,
	pointInPolygon2D,
	polygonSelfIntersects,
	polygonsOverlap,
	signedArea2D,
	validateSlabPolygon
} from '../slabMath';
import type { Point2D } from '../wallPathMath';

const SQUARE_CCW: Point2D[] = [
	{ x: 0, z: 0 },
	{ x: 4, z: 0 },
	{ x: 4, z: 4 },
	{ x: 0, z: 4 }
];
const SQUARE_CW = [...SQUARE_CCW].reverse();

describe('signedArea2D / ensureCCW', () => {
	it('is positive for the reference winding and negative for its reverse', () => {
		const areaA = signedArea2D(SQUARE_CCW);
		const areaB = signedArea2D(SQUARE_CW);
		expect(Math.sign(areaA)).not.toBe(Math.sign(areaB));
		expect(Math.abs(areaA)).toBeCloseTo(16);
	});

	it('ensureCCW always returns the same winding regardless of input order', () => {
		const a = ensureCCW(SQUARE_CCW);
		const b = ensureCCW(SQUARE_CW);
		expect(Math.sign(signedArea2D(a))).toBe(Math.sign(signedArea2D(b)));
	});
});

describe('pointInPolygon2D', () => {
	it('accepts a point clearly inside a square', () => {
		expect(pointInPolygon2D({ x: 2, z: 2 }, SQUARE_CCW)).toBe(true);
	});

	it('rejects a point clearly outside', () => {
		expect(pointInPolygon2D({ x: 10, z: 10 }, SQUARE_CCW)).toBe(false);
	});

	it('gives the same answer regardless of polygon winding', () => {
		const inside = { x: 2, z: 2 };
		const outside = { x: 10, z: 10 };
		expect(pointInPolygon2D(inside, SQUARE_CCW)).toBe(pointInPolygon2D(inside, SQUARE_CW));
		expect(pointInPolygon2D(outside, SQUARE_CCW)).toBe(pointInPolygon2D(outside, SQUARE_CW));
	});

	it('handles a concave (L-shaped) polygon correctly', () => {
		// L-shape: full 4x4 square minus the top-right 2x2 quadrant.
		const lShape: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 2 },
			{ x: 2, z: 2 },
			{ x: 2, z: 4 },
			{ x: 0, z: 4 }
		];
		expect(pointInPolygon2D({ x: 1, z: 1 }, lShape)).toBe(true); // inside the solid leg
		expect(pointInPolygon2D({ x: 3, z: 3 }, lShape)).toBe(false); // inside the notch (removed area)
		expect(pointInPolygon2D({ x: 3, z: 1 }, lShape)).toBe(true); // inside the other leg
	});
});

describe('polygonSelfIntersects', () => {
	it('allows a simple closed rectangle', () => {
		expect(polygonSelfIntersects(SQUARE_CCW)).toBe(false);
	});

	it('detects an obvious bow-tie polygon', () => {
		const bowtie: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 4 },
			{ x: 4, z: 0 },
			{ x: 0, z: 4 }
		];
		expect(polygonSelfIntersects(bowtie)).toBe(true);
	});
});

describe('polygonsOverlap', () => {
	const squareA: Point2D[] = [
		{ x: 0, z: 0 },
		{ x: 4, z: 0 },
		{ x: 4, z: 4 },
		{ x: 0, z: 4 }
	];

	it('detects two overlapping (partially intersecting) polygons', () => {
		const squareB: Point2D[] = [
			{ x: 2, z: 2 },
			{ x: 6, z: 2 },
			{ x: 6, z: 6 },
			{ x: 2, z: 6 }
		];
		expect(polygonsOverlap(squareA, squareB)).toBe(true);
	});

	it.each([
		[
			'partial shared edge',
			[
				[4, 1],
				[6, 1],
				[6, 3],
				[4, 3]
			],
			false
		],
		[
			'shared corner',
			[
				[4, 4],
				[6, 4],
				[6, 6],
				[4, 6]
			],
			false
		],
		[
			'horizontal shared edge',
			[
				[0, 4],
				[4, 4],
				[4, 8],
				[0, 8]
			],
			false
		],
		[
			'identical footprint',
			[
				[0, 0],
				[4, 0],
				[4, 4],
				[0, 4]
			],
			true
		],
		[
			'overlapping collinear edges',
			[
				[2, 0],
				[6, 0],
				[6, 4],
				[2, 4]
			],
			true
		],
		[
			'contained with all vertices on boundary',
			[
				[2, 0],
				[4, 2],
				[2, 4],
				[0, 2]
			],
			true
		]
	] as const)('%s', (_name, coordinates, expected) => {
		const other = coordinates.map(([x, z]) => ({ x, z }));
		for (const polygon of [other, [...other].reverse()]) {
			expect(polygonsOverlap(squareA, polygon)).toBe(expected);
			expect(polygonsOverlap(polygon, squareA)).toBe(expected);
		}
	});

	it('allows a piece to fill a concave notch with shared edges', () => {
		const l = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 2 },
			{ x: 2, z: 2 },
			{ x: 2, z: 4 },
			{ x: 0, z: 4 }
		];
		const notch = [
			{ x: 2, z: 2 },
			{ x: 4, z: 2 },
			{ x: 4, z: 4 },
			{ x: 2, z: 4 }
		];
		expect(polygonsOverlap(l, notch)).toBe(false);
		expect(
			polygonsOverlap(
				l,
				notch.map((p) => ({ x: p.x - 0.25, z: p.z }))
			)
		).toBe(true);
	});

	it('allows triangles to share a diagonal', () => {
		const lower = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 4 }
		];
		const upper = [
			{ x: 0, z: 0 },
			{ x: 4, z: 4 },
			{ x: 0, z: 4 }
		];
		expect(polygonsOverlap(lower, upper)).toBe(false);
		expect(polygonsOverlap(lower, [...upper].reverse())).toBe(false);
	});

	it('detects full containment (nesting) with no edge crossings', () => {
		const inner: Point2D[] = [
			{ x: 1, z: 1 },
			{ x: 2, z: 1 },
			{ x: 2, z: 2 },
			{ x: 1, z: 2 }
		];
		expect(polygonsOverlap(squareA, inner)).toBe(true);
		expect(polygonsOverlap(inner, squareA)).toBe(true);
	});

	it('does not flag two separate, non-overlapping polygons', () => {
		const squareC: Point2D[] = [
			{ x: 10, z: 10 },
			{ x: 14, z: 10 },
			{ x: 14, z: 14 },
			{ x: 10, z: 14 }
		];
		expect(polygonsOverlap(squareA, squareC)).toBe(false);
	});

	it('does not flag two polygons that merely touch at an edge', () => {
		const adjacent: Point2D[] = [
			{ x: 4, z: 0 },
			{ x: 8, z: 0 },
			{ x: 8, z: 4 },
			{ x: 4, z: 4 }
		];
		expect(polygonsOverlap(squareA, adjacent)).toBe(false);
		expect(polygonsOverlap(adjacent, [...squareA].reverse())).toBe(false);
	});
});

describe('validateSlabPolygon', () => {
	it('accepts a valid rectangle', () => {
		expect(validateSlabPolygon(SQUARE_CCW).valid).toBe(true);
	});

	it('accepts a valid concave polygon', () => {
		const lShape: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 2 },
			{ x: 2, z: 2 },
			{ x: 2, z: 4 },
			{ x: 0, z: 4 }
		];
		expect(validateSlabPolygon(lShape).valid).toBe(true);
	});

	it('rejects fewer than 3 points', () => {
		expect(
			validateSlabPolygon([
				{ x: 0, z: 0 },
				{ x: 4, z: 0 }
			]).valid
		).toBe(false);
	});

	it('rejects a duplicate consecutive point', () => {
		const points: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 4 }
		];
		expect(validateSlabPolygon(points).valid).toBe(false);
	});

	it('rejects a self-intersecting bow-tie polygon', () => {
		const bowtie: Point2D[] = [
			{ x: 0, z: 0 },
			{ x: 4, z: 4 },
			{ x: 4, z: 0 },
			{ x: 0, z: 4 }
		];
		expect(validateSlabPolygon(bowtie).valid).toBe(false);
	});

	it('accepts both clockwise and counter-clockwise winding equally', () => {
		expect(validateSlabPolygon(SQUARE_CCW).valid).toBe(true);
		expect(validateSlabPolygon(SQUARE_CW).valid).toBe(true);
	});
});
