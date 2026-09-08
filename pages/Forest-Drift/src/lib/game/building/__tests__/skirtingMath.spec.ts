import { describe, expect, it } from 'vitest';
import {
	roomLidsFromSlabs,
	skirtingStripsForWall,
	slabIsLidOverWallTop,
	subtractDoorwaysFromStrips,
	type RoomLid
} from '../skirtingMath';

function lid(points: { x: number; z: number }[], localY = 3): RoomLid {
	return { localY, thickness: 0.1, polygon: points };
}

/** Axis-aligned 4×4 room, CCW: (0,0)→(4,0)→(4,4)→(0,4). Interior is +Z on the south edge. */
const ROOM = lid([
	{ x: 0, z: 0 },
	{ x: 4, z: 0 },
	{ x: 4, z: 4 },
	{ x: 0, z: 4 }
]);

describe('slabIsLidOverWallTop', () => {
	it('matches a slab whose top sits at the wall top (default ceiling placement)', () => {
		expect(slabIsLidOverWallTop(3, 0.1, 0, 3)).toBe(true);
	});

	it('matches a slab whose underside sits on the wall top', () => {
		expect(slabIsLidOverWallTop(3.1, 0.1, 0, 3)).toBe(true);
	});

	it('rejects a floor at the wall base, or a lid on another storey', () => {
		expect(slabIsLidOverWallTop(0.1, 0.1, 0, 3)).toBe(false);
		expect(slabIsLidOverWallTop(6, 0.1, 0, 3)).toBe(false);
	});
});

describe('skirtingStripsForWall', () => {
	it('puts skirting on the interior face of a wall under a ceiling edge', () => {
		// South wall along the room's bottom edge, start→end same as the CCW edge.
		const strips = skirtingStripsForWall({ x: 0, z: 0 }, { x: 4, z: 0 }, 0, 3, [ROOM]);
		expect(strips).toHaveLength(1);
		expect(strips[0].minU).toBeCloseTo(0);
		expect(strips[0].maxU).toBeCloseTo(4);
		// CCW edge (0,0)→(4,0) has interior +Z; wall +Z is also +Z → faceSign +1.
		expect(strips[0].faceSign).toBe(1);
	});

	it('uses the opposite face when the wall is drawn the other way', () => {
		const strips = skirtingStripsForWall({ x: 4, z: 0 }, { x: 0, z: 0 }, 0, 3, [ROOM]);
		expect(strips).toHaveLength(1);
		expect(strips[0].faceSign).toBe(-1);
	});

	it('does not skirt the exterior side — an outdoor wall past the lid gets nothing', () => {
		const strips = skirtingStripsForWall({ x: 0, z: -2 }, { x: 4, z: -2 }, 0, 3, [ROOM]);
		expect(strips).toHaveLength(0);
	});

	it('does not skirt a wall that is not under any lid edge', () => {
		const strips = skirtingStripsForWall({ x: 1, z: 2 }, { x: 3, z: 2 }, 0, 3, [ROOM]);
		expect(strips).toHaveLength(0);
	});

	it('only covers the overlapping span when the wall is longer than the lid edge', () => {
		const strips = skirtingStripsForWall({ x: -1, z: 0 }, { x: 6, z: 0 }, 0, 3, [ROOM]);
		expect(strips).toHaveLength(1);
		expect(strips[0].minU).toBeCloseTo(1);
		expect(strips[0].maxU).toBeCloseTo(5);
	});

	it('ignores a lid on a different storey', () => {
		const upstairs = lid(ROOM.polygon, 6);
		const strips = skirtingStripsForWall({ x: 0, z: 0 }, { x: 4, z: 0 }, 0, 3, [upstairs]);
		expect(strips).toHaveLength(0);
	});

	it('skirts every side of a closed room that has walls under the lid', () => {
		const walls: [{ x: number; z: number }, { x: number; z: number }][] = [
			[
				{ x: 0, z: 0 },
				{ x: 4, z: 0 }
			],
			[
				{ x: 4, z: 0 },
				{ x: 4, z: 4 }
			],
			[
				{ x: 4, z: 4 },
				{ x: 0, z: 4 }
			],
			[
				{ x: 0, z: 4 },
				{ x: 0, z: 0 }
			]
		];
		for (const [start, end] of walls) {
			expect(skirtingStripsForWall(start, end, 0, 3, [ROOM])).toHaveLength(1);
		}
	});
});

describe('subtractDoorwaysFromStrips', () => {
	it('cuts a floor-reaching door out of the strip and leaves windows alone', () => {
		const strips = subtractDoorwaysFromStrips([{ minU: 0, maxU: 4, faceSign: 1 }], [
			{ minU: 1.5, maxU: 2.4, minY: 0 },
			{ minU: 3, maxU: 3.5, minY: 0.9 }
		]);
		expect(strips).toHaveLength(2);
		expect(strips[0].minU).toBeCloseTo(0);
		expect(strips[0].maxU).toBeCloseTo(1.5);
		expect(strips[1].minU).toBeCloseTo(2.4);
		expect(strips[1].maxU).toBeCloseTo(4);
	});
});

describe('roomLidsFromSlabs', () => {
	it('normalizes a clockwise floor the same way as a counter-clockwise ceiling', () => {
		const cw = roomLidsFromSlabs(
			[
				{
					localY: 3,
					thickness: 0.1,
					points: [
						{ gridX: 0, gridZ: 0 },
						{ gridX: 0, gridZ: 8 },
						{ gridX: 8, gridZ: 8 },
						{ gridX: 8, gridZ: 0 }
					]
				}
			],
			0.5
		);
		const south = skirtingStripsForWall({ x: 0, z: 0 }, { x: 4, z: 0 }, 0, 3, cw);
		expect(south).toHaveLength(1);
		expect(south[0].faceSign).toBe(1);
	});
});
