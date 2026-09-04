import { describe, expect, it } from 'vitest';
import {
	buildingGridToLocal,
	foundationLocalFrame,
	foundationLocalSize,
	foundationLocalToWorld,
	isBuildingGridPointInsideFoundation,
	snapLocalToBuildingGrid,
	worldToFoundationLocal
} from '../FoundationLocalMath';
import type { FoundationDefinition } from '../FoundationTypes';

const SPACING = 2;

function makeFoundation(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'foundation-1',
		minGridX: 5,
		maxGridX: 15,
		minGridZ: -3,
		maxGridZ: 7,
		topY: 17.4,
		bottomY: 12,
		...overrides
	};
}

describe('foundationLocalFrame / foundationLocalToWorld / worldToFoundationLocal round trip', () => {
	it('round-trips arbitrary local points through world space', () => {
		const foundation = makeFoundation();
		const frame = foundationLocalFrame(foundation, SPACING);

		for (const [localX, localY, localZ] of [
			[0, 0, 0],
			[3.5, 1.2, 4.1],
			[-1, 0, -1],
			[20, 3, 20]
		]) {
			const world = foundationLocalToWorld(frame, localX, localY, localZ);
			const back = worldToFoundationLocal(frame, world.worldX, world.worldY, world.worldZ);
			expect(back.localX).toBeCloseTo(localX);
			expect(back.localY).toBeCloseTo(localY);
			expect(back.localZ).toBeCloseTo(localZ);
		}
	});

	it('places local Y=0 exactly at the foundation top surface', () => {
		const foundation = makeFoundation({ topY: 17.4 });
		const frame = foundationLocalFrame(foundation, SPACING);
		const world = foundationLocalToWorld(frame, 0, 0, 0);
		expect(world.worldY).toBeCloseTo(17.4);
	});

	it('a wall from local Y=0 to Y=3 renders 17.4..20.4 on one foundation and 42..45 on another', () => {
		const foundationLow = makeFoundation({ topY: 17.4 });
		const foundationHigh = makeFoundation({ topY: 42 });

		const frameLow = foundationLocalFrame(foundationLow, SPACING);
		const frameHigh = foundationLocalFrame(foundationHigh, SPACING);

		expect(foundationLocalToWorld(frameLow, 0, 0, 0).worldY).toBeCloseTo(17.4);
		expect(foundationLocalToWorld(frameLow, 0, 3, 0).worldY).toBeCloseTo(20.4);
		expect(foundationLocalToWorld(frameHigh, 0, 0, 0).worldY).toBeCloseTo(42);
		expect(foundationLocalToWorld(frameHigh, 0, 3, 0).worldY).toBeCloseTo(45);
	});

	it('uses the min-X/min-Z corner as the local origin', () => {
		const foundation = makeFoundation({ minGridX: 5, minGridZ: -3 });
		const frame = foundationLocalFrame(foundation, SPACING);
		expect(frame.originWorldX).toBeCloseTo(5 * SPACING);
		expect(frame.originWorldZ).toBeCloseTo(-3 * SPACING);
	});
});

describe('foundationLocalSize', () => {
	it('derives width/depth from the grid footprint and spacing', () => {
		const foundation = makeFoundation({ minGridX: 0, maxGridX: 10, minGridZ: 0, maxGridZ: 4 });
		const size = foundationLocalSize(foundation, SPACING);
		expect(size.width).toBeCloseTo(20);
		expect(size.depth).toBeCloseTo(8);
	});
});

describe('snapLocalToBuildingGrid', () => {
	const GRID = 0.25;

	it('snaps positive local coordinates to the nearest grid integer', () => {
		expect(snapLocalToBuildingGrid(0, 0, GRID)).toEqual({ gridX: 0, gridZ: 0 });
		expect(snapLocalToBuildingGrid(0.1, 0.1, GRID)).toEqual({ gridX: 0, gridZ: 0 });
		expect(snapLocalToBuildingGrid(0.2, 0.4, GRID)).toEqual({ gridX: 1, gridZ: 2 });
		expect(snapLocalToBuildingGrid(1.13, 2.9, GRID)).toEqual({ gridX: 5, gridZ: 12 });
	});

	it('snaps negative local coordinates symmetrically', () => {
		expect(snapLocalToBuildingGrid(-0.1, -0.1, GRID)).toEqual({ gridX: 0, gridZ: 0 });
		expect(snapLocalToBuildingGrid(-0.2, -0.4, GRID)).toEqual({ gridX: -1, gridZ: -2 });
		expect(snapLocalToBuildingGrid(-1.13, -2.9, GRID)).toEqual({ gridX: -5, gridZ: -12 });
	});

	it('round-trips grid <-> local exactly for integer grid coordinates', () => {
		for (const gridX of [-40, -1, 0, 1, 17, 200]) {
			const { localX } = buildingGridToLocal({ gridX, gridZ: 0 }, GRID);
			expect(snapLocalToBuildingGrid(localX, 0, GRID).gridX).toBe(gridX);
		}
	});
});

describe('isBuildingGridPointInsideFoundation', () => {
	const GRID = 0.25;
	const WIDTH = 5;
	const DEPTH = 3;

	it('accepts points strictly inside the footprint', () => {
		expect(isBuildingGridPointInsideFoundation({ gridX: 4, gridZ: 4 }, GRID, WIDTH, DEPTH)).toBe(
			true
		);
	});

	it('accepts points exactly on the footprint edge', () => {
		expect(isBuildingGridPointInsideFoundation({ gridX: 0, gridZ: 0 }, GRID, WIDTH, DEPTH)).toBe(
			true
		);
		expect(
			isBuildingGridPointInsideFoundation(
				{ gridX: WIDTH / GRID, gridZ: DEPTH / GRID },
				GRID,
				WIDTH,
				DEPTH
			)
		).toBe(true);
	});

	it('rejects points outside the footprint on any side', () => {
		expect(isBuildingGridPointInsideFoundation({ gridX: -1, gridZ: 4 }, GRID, WIDTH, DEPTH)).toBe(
			false
		);
		expect(
			isBuildingGridPointInsideFoundation({ gridX: WIDTH / GRID + 4, gridZ: 4 }, GRID, WIDTH, DEPTH)
		).toBe(false);
		expect(isBuildingGridPointInsideFoundation({ gridX: 4, gridZ: -1 }, GRID, WIDTH, DEPTH)).toBe(
			false
		);
	});
});
