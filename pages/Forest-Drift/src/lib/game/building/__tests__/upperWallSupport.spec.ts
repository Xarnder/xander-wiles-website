import { describe, expect, it } from 'vitest';
import { wallSupportFor } from '../upperWallSupport';
import type { FoundationBuildingDefinition } from '../WallTypes';
import type { SlabDefinition } from '../SlabTypes';
import type { WallPathDefinition } from '../WallPathTypes';

const GRID = 0.25;
const STOREY = 2.6;
const p = (gridX: number, gridZ: number) => ({ gridX, gridZ });

/** A 4 × 3 m room (grid 0–16 × 0–12) of 0.2 m walls on the ground floor. */
const room: WallPathDefinition = {
	id: 'room',
	foundationId: 'f',
	points: [p(0, 0), p(16, 0), p(16, 12), p(0, 12)],
	closed: true,
	baseY: 0,
	wallHeight: STOREY,
	wallThickness: 0.2,
	joinStyle: 'miter',
	miterLimit: 4,
	segments: []
};

/** A ceiling over the room's left half (grid 0–8 × 0–12), with a stair hole at 2–4 × 4–8. */
const ceiling: SlabDefinition = {
	id: 'ceiling',
	foundationId: 'f',
	type: 'ceiling',
	levelIndex: 0,
	localY: STOREY,
	thickness: 0.2,
	points: [p(0, 0), p(8, 0), p(8, 12), p(0, 12)],
	openings: [{ id: 'hole', type: 'stairs', minGridX: 2, maxGridX: 4, minGridZ: 4, maxGridZ: 8 }]
};

const building = (
	parts: Partial<FoundationBuildingDefinition> = {}
): FoundationBuildingDefinition => ({
	foundationId: 'f',
	walls: [],
	wallPaths: [room],
	slabs: [ceiling],
	stairs: [],
	roofs: [],
	...parts
});

const firstFloor = (b = building()) => wallSupportFor(b, STOREY, GRID, 0.2);

describe('walls on upper floors need something under them', () => {
	it('lets ground-floor walls go anywhere on the foundation', () => {
		const support = wallSupportFor(building(), 0, GRID, 0.2);
		expect(support.segmentSupported(p(40, 40), p(60, 40))).toBe(true);
		expect(wallSupportFor(undefined, 0, GRID, 0.2).segmentSupported(p(0, 0), p(8, 0))).toBe(true);
	});

	it('stands walls on top of the walls below, all the way round and at the corners', () => {
		const support = firstFloor(building({ slabs: [] }));
		expect(support.runSupported(room.points, true)).toBe(true);
		expect(support.segmentSupported(p(16, 0), p(16, 12))).toBe(true);
	});

	it('stands walls on a ceiling or floor below, edges included, but not over its stair hole', () => {
		const support = firstFloor();
		// Across the ceiling, and along its open (inner) edge.
		expect(support.segmentSupported(p(0, 2), p(8, 2))).toBe(true);
		expect(support.segmentSupported(p(8, 0), p(8, 12))).toBe(true);
		// Over the stair opening.
		expect(support.segmentSupported(p(1, 6), p(6, 6))).toBe(false);
	});

	it('refuses walls over thin air: past the building, or over the room with no ceiling', () => {
		const support = firstFloor();
		expect(support.segmentSupported(p(16, 0), p(24, 0))).toBe(false);
		expect(support.segmentSupported(p(17, 4), p(17, 8))).toBe(false);
		// The right half of the room has walls round it but no ceiling: across it is unsupported.
		expect(support.segmentSupported(p(12, 0), p(12, 12))).toBe(false);
		// With nothing built at all, an upper floor has nothing to stand on.
		expect(wallSupportFor(undefined, STOREY, GRID, 0.2).segmentSupported(p(0, 0), p(4, 0))).toBe(
			false
		);
	});

	it('accepts a ceiling set a little lower, but not supports from a different storey', () => {
		const lowered = { ...ceiling, localY: STOREY - 0.3 };
		expect(firstFloor(building({ slabs: [lowered] })).segmentSupported(p(0, 2), p(8, 2))).toBe(
			true
		);
		// Half-height walls end well below the next floor: they don't hold it up.
		const short = { ...room, wallHeight: 1.2 };
		expect(
			firstFloor(building({ wallPaths: [short], slabs: [] })).segmentSupported(p(0, 0), p(16, 0))
		).toBe(false);
		// The second floor stands on the first floor's walls, not the ground floor's.
		const secondFloor = wallSupportFor(building(), STOREY * 2, GRID, 0.2);
		expect(secondFloor.segmentSupported(p(0, 0), p(16, 0))).toBe(false);
	});

	it('uses straight walls below as well as wall runs', () => {
		const support = firstFloor(
			building({
				wallPaths: [],
				slabs: [],
				walls: [
					{
						id: 'w',
						foundationId: 'f',
						startGridX: 0,
						startGridZ: 0,
						endGridX: 12,
						endGridZ: 0,
						baseY: 0,
						height: STOREY,
						thickness: 0.2,
						openings: []
					}
				]
			})
		);
		expect(support.segmentSupported(p(0, 0), p(12, 0))).toBe(true);
		expect(support.segmentSupported(p(0, 0), p(14, 0))).toBe(false);
	});
});
