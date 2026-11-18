import { describe, expect, it } from 'vitest';
import type { FoundationDefinition } from '../FoundationTypes';
import {
	MAX_JOINED_FOUNDATIONS,
	anchorOf,
	canJoin,
	frameOffset,
	joinGridAligned,
	joinIdsAfterSeparating,
	joinedBuildings,
	mergedJoinId,
	pointInRects,
	polygonInRects,
	segmentInRects,
	sharedEdge,
	unionOutline,
	type GridRect
} from '../foundationJoinMath';
import { signedArea2D } from '../slabMath';

function f(
	id: string,
	minGridX: number,
	minGridZ: number,
	maxGridX: number,
	maxGridZ: number,
	extra: Partial<FoundationDefinition> = {}
): FoundationDefinition {
	return { id, minGridX, maxGridX, minGridZ, maxGridZ, topY: 5, bottomY: 3, ...extra };
}

const rect = (minX: number, minZ: number, maxX: number, maxZ: number): GridRect => ({
	minX,
	maxX,
	minZ,
	maxZ
});

describe('sharedEdge', () => {
	it('finds a full shared edge on either axis, either way round', () => {
		expect(sharedEdge(f('a', 0, 0, 4, 4), f('b', 4, 0, 8, 4))).toEqual({
			axis: 'x',
			at: 4,
			from: 0,
			to: 4
		});
		expect(sharedEdge(f('b', 4, 0, 8, 4), f('a', 0, 0, 4, 4))).toEqual({
			axis: 'x',
			at: 4,
			from: 0,
			to: 4
		});
		expect(sharedEdge(f('a', 0, 0, 4, 4), f('b', 0, -3, 4, 0))).toEqual({
			axis: 'z',
			at: 0,
			from: 0,
			to: 4
		});
	});
	it('finds a partial shared edge (an L)', () => {
		expect(sharedEdge(f('a', 0, 0, 4, 4), f('b', 4, 2, 9, 10))).toEqual({
			axis: 'x',
			at: 4,
			from: 2,
			to: 4
		});
	});
	it('gives nothing for corners, gaps and overlaps', () => {
		expect(sharedEdge(f('a', 0, 0, 4, 4), f('b', 4, 4, 8, 8))).toBeNull();
		expect(sharedEdge(f('a', 0, 0, 4, 4), f('b', 5, 0, 8, 4))).toBeNull();
		expect(sharedEdge(f('a', 0, 0, 4, 4), f('b', 3, 0, 8, 4))).toBeNull();
	});
});

describe('canJoin', () => {
	it('needs a shared edge and the same height', () => {
		expect(canJoin(f('a', 0, 0, 4, 4), f('b', 4, 0, 8, 4))).toBe(true);
		expect(canJoin(f('a', 0, 0, 4, 4), f('b', 4, 0, 8, 4, { topY: 5.0009 }))).toBe(true);
		expect(canJoin(f('a', 0, 0, 4, 4), f('b', 4, 0, 8, 4, { topY: 5.01 }))).toBe(false);
		expect(canJoin(f('a', 0, 0, 4, 4), f('b', 4, 4, 8, 8))).toBe(false);
	});
});

describe('joinedBuildings', () => {
	it('groups touching, level foundations with the same joinId', () => {
		const buildings = joinedBuildings([
			f('a', 0, 0, 4, 4, { joinId: 'a' }),
			f('b', 4, 0, 8, 4, { joinId: 'a' }),
			f('c', 8, 0, 12, 4, { joinId: 'a' }),
			f('d', 0, 4, 4, 8)
		]);
		expect(buildings).toEqual([
			{ anchorId: 'a', memberIds: ['a', 'b', 'c'] },
			{ anchorId: 'd', memberIds: ['d'] }
		]);
	});

	it('never joins without a matching joinId, even when touching and level', () => {
		const buildings = joinedBuildings([
			f('a', 0, 0, 4, 4, { joinId: 'a' }),
			f('b', 4, 0, 8, 4, { joinId: 'x' }),
			f('c', 0, 4, 4, 8)
		]);
		expect(buildings.map((b) => b.memberIds)).toEqual([['a'], ['b'], ['c']]);
	});

	it('drops stale members: moved away, raised, or only touching at a corner', () => {
		const buildings = joinedBuildings([
			f('a', 0, 0, 4, 4, { joinId: 'a' }),
			f('b', 10, 0, 12, 4, { joinId: 'a' }), // gap
			f('c', 0, 4, 4, 8, { joinId: 'a', topY: 6 }), // raised
			f('d', 4, 4, 8, 8, { joinId: 'a' }) // corner only
		]);
		expect(buildings.map((b) => b.memberIds)).toEqual([['a'], ['b'], ['c'], ['d']]);
	});

	it('keeps a building whose anchor was deleted, anchored on its smallest id', () => {
		const buildings = joinedBuildings([
			f('m', 0, 0, 4, 4, { joinId: 'gone' }),
			f('k', 4, 0, 8, 4, { joinId: 'gone' })
		]);
		expect(buildings).toEqual([{ anchorId: 'k', memberIds: ['k', 'm'] }]);
	});

	it('splits when the middle of a chain is removed', () => {
		const buildings = joinedBuildings([
			f('a', 0, 0, 4, 4, { joinId: 'a' }),
			f('c', 8, 0, 12, 4, { joinId: 'a' })
		]);
		expect(buildings.map((b) => b.memberIds)).toEqual([['a'], ['c']]);
	});

	it('gives the same answer whatever order the foundations come in', () => {
		const list = [
			f('a', 0, 0, 4, 4, { joinId: 'b' }),
			f('b', 4, 0, 8, 4, { joinId: 'b' }),
			f('c', 4, 4, 8, 8, { joinId: 'b' }),
			f('d', 20, 0, 24, 4, { joinId: 'b' })
		];
		const expected = joinedBuildings(list);
		for (let i = 0; i < 8; i++) {
			const shuffled = [...list].sort(() => Math.sin(i * 7 + list.length) - 0.1);
			expect(joinedBuildings(shuffled)).toEqual(expected);
		}
		expect(expected).toEqual([
			{ anchorId: 'b', memberIds: ['a', 'b', 'c'] },
			{ anchorId: 'd', memberIds: ['d'] }
		]);
	});
});

describe('choosing joinIds', () => {
	it('anchors on the member named by joinId', () => {
		expect(
			anchorOf([f('z', 0, 0, 1, 1, { joinId: 'z' }), f('a', 1, 0, 2, 1, { joinId: 'z' })])
		).toBe('z');
		expect(anchorOf([f('z', 0, 0, 1, 1), f('a', 1, 0, 2, 1)])).toBe('a');
	});

	it('merges into the bigger building, ties to the smaller anchor id', () => {
		expect(
			mergedJoinId([
				{ anchorId: 'q', memberIds: ['p', 'q', 'r'] },
				{ anchorId: 'a', memberIds: ['a'] }
			])
		).toBe('q');
		expect(
			mergedJoinId([
				{ anchorId: 'q', memberIds: ['q', 'r'] },
				{ anchorId: 'b', memberIds: ['a', 'b'] }
			])
		).toBe('b');
	});

	it('separates: the anchor side keeps it, the other takes its smallest id, a lone side drops it', () => {
		const ids = joinIdsAfterSeparating([['a', 'b'], ['d', 'c'], ['e']], 'b');
		expect(Object.fromEntries(ids)).toEqual({
			a: 'b',
			b: 'b',
			c: 'c',
			d: 'c',
			e: undefined
		});
	});

	it('limits a building to eight foundations', () => {
		expect(MAX_JOINED_FOUNDATIONS).toBe(8);
	});
});

describe('frames', () => {
	it('lines up on the default grids (2 m terrain, 0.25 m building grid)', () => {
		expect(joinGridAligned(2, 0.25)).toBe(true);
		expect(joinGridAligned(1.5, 0.25)).toBe(true);
		expect(joinGridAligned(1.3, 0.25)).toBe(false);
	});
	it('gives the offset between two frames in building-grid steps', () => {
		expect(frameOffset(f('a', 10, -4, 15, 0), f('b', 15, -6, 20, 0), 2, 0.25)).toEqual({
			dx: 40,
			dz: -16
		});
		expect(frameOffset(f('a', 0, 0, 1, 1), f('b', 1, 0, 2, 1), 1.3, 0.25)).toBeNull();
	});
});

// An L: a 4 × 4 square with a 4 × 2 wing to its right along the bottom.
const L = [rect(0, 0, 4, 4), rect(4, 0, 8, 2)];

describe('inside tests', () => {
	it('points: inside, on edges, in the notch', () => {
		expect(pointInRects(2, 2, L)).toBe(true);
		expect(pointInRects(8, 1, L)).toBe(true);
		expect(pointInRects(4, 3, L)).toBe(true); // on the inner edge
		expect(pointInRects(6, 3, L)).toBe(false); // in the notch
	});

	it('segments: across the seam yes, through the notch no', () => {
		expect(segmentInRects(1, 1, 7, 1, L)).toBe(true);
		expect(segmentInRects(1, 2, 8, 2, L)).toBe(true); // along the wing's top edge
		expect(segmentInRects(1, 3, 7, 1, L)).toBe(true); // passes the notch's corner exactly
		expect(segmentInRects(1, 3.5, 7, 1.5, L)).toBe(false); // cuts the notch's corner
		expect(segmentInRects(5, 1, 5, 3, L)).toBe(false); // ends in the notch
		expect(segmentInRects(2, 3, 2, 3, L)).toBe(true); // a point
	});

	it('polygons: an L-shaped room yes, a box over the notch no', () => {
		const room = [
			{ x: 0, z: 0 },
			{ x: 8, z: 0 },
			{ x: 8, z: 2 },
			{ x: 4, z: 2 },
			{ x: 4, z: 4 },
			{ x: 0, z: 4 }
		];
		expect(polygonInRects(room, L)).toBe(true);
		expect(
			polygonInRects(
				[
					{ x: 0, z: 0 },
					{ x: 8, z: 0 },
					{ x: 8, z: 4 },
					{ x: 0, z: 4 }
				],
				L
			)
		).toBe(false);
	});

	it('polygons: a slab round a courtyard is refused, one beside it is fine', () => {
		// A ring of four foundations round a 2 × 2 courtyard.
		const ring = [rect(0, 0, 6, 2), rect(0, 4, 6, 6), rect(0, 2, 2, 4), rect(4, 2, 6, 4)];
		const square = (a: number, b: number) => [
			{ x: a, z: a },
			{ x: b, z: a },
			{ x: b, z: b },
			{ x: a, z: b }
		];
		expect(polygonInRects(square(0, 6), ring)).toBe(false);
		expect(polygonInRects(square(0, 2), ring)).toBe(true);
	});
});

describe('unionOutline', () => {
	it('merges two footprints side by side into one rectangle', () => {
		expect(unionOutline([rect(0, 0, 4, 4), rect(4, 0, 8, 4)])).toEqual([
			[
				{ x: 0, z: 0 },
				{ x: 8, z: 0 },
				{ x: 8, z: 4 },
				{ x: 0, z: 4 }
			]
		]);
	});

	it('traces an L with six corners, math-CCW', () => {
		const [loop, ...rest] = unionOutline(L);
		expect(rest).toEqual([]);
		expect(loop).toEqual([
			{ x: 0, z: 0 },
			{ x: 8, z: 0 },
			{ x: 8, z: 2 },
			{ x: 4, z: 2 },
			{ x: 4, z: 4 },
			{ x: 0, z: 4 }
		]);
		expect(signedArea2D(loop)).toBeGreaterThan(0);
	});

	it('traces T and U shapes', () => {
		const T = unionOutline([rect(0, 0, 6, 2), rect(2, 2, 4, 6)]);
		expect(T).toHaveLength(1);
		expect(T[0]).toHaveLength(8);
		const U = unionOutline([rect(0, 0, 6, 2), rect(0, 2, 2, 5), rect(4, 2, 6, 5)]);
		expect(U).toHaveLength(1);
		expect(U[0]).toHaveLength(8);
		expect(signedArea2D(U[0])).toBe(12 + 6 + 6);
	});

	it('gives a ring an outer loop and a clockwise hole', () => {
		const loops = unionOutline([
			rect(0, 0, 6, 2),
			rect(0, 4, 6, 6),
			rect(0, 2, 2, 4),
			rect(4, 2, 6, 4)
		]);
		expect(loops).toHaveLength(2);
		const areas = loops.map((loop) => signedArea2D(loop)).sort((a, b) => a - b);
		expect(areas).toEqual([-4, 36]);
	});

	it('keeps two squares that only touch at a corner as two loops', () => {
		const loops = unionOutline([rect(0, 0, 2, 2), rect(2, 2, 4, 4)]);
		expect(loops).toHaveLength(2);
		for (const loop of loops) {
			expect(loop).toHaveLength(4);
			expect(signedArea2D(loop)).toBe(4);
		}
	});

	it('is empty for nothing', () => {
		expect(unionOutline([])).toEqual([]);
	});
});
