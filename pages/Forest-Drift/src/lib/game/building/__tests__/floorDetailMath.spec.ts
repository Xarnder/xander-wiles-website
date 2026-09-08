import { describe, expect, it } from 'vitest';
import {
	axisAlignedRectFromPoints,
	buildFloorDetailBoxes,
	floorDetailMeshMinY,
	floorDetailThickness,
	pathStripLocalCorners,
	rectanglePointsFromCorners,
	validateFloorDetailFootprint
} from '../floorDetailMath';
import type { FloorDetailDefinition } from '../FloorDetailTypes';
import { FLOOR_DETAIL_HOST_LIFT, FLOOR_DETAIL_2D_THICKNESS } from '../FloorDetailTypes';

const GRID = 0.25;

function detail(overrides: Partial<FloorDetailDefinition> = {}): FloorDetailDefinition {
	return {
		id: 'd1',
		foundationId: 'f1',
		levelIndex: 0,
		kind: 'planks',
		hostY: 0,
		renderMode: '3d',
		points: rectanglePointsFromCorners({ gridX: 0, gridZ: 0 }, { gridX: 4, gridZ: 4 }),
		colors: ['#8B5A2B', '#C4A574'],
		plankWidth: 0.2,
		plankDirection: 'x',
		tileSize: 0.4,
		tilePattern: 'checker',
		pathWidth: 1,
		pathFraming: true,
		...overrides
	};
}

describe('floorDetailThickness / host lift', () => {
	it('uses a thin plane in 2d and a thicker board in 3d', () => {
		expect(floorDetailThickness('planks', '2d')).toBe(FLOOR_DETAIL_2D_THICKNESS);
		expect(floorDetailThickness('planks', '3d')).toBeGreaterThan(FLOOR_DETAIL_2D_THICKNESS);
		expect(floorDetailMeshMinY(0)).toBe(FLOOR_DETAIL_HOST_LIFT);
		expect(floorDetailMeshMinY(3)).toBe(3 + FLOOR_DETAIL_HOST_LIFT);
	});
});

describe('validateFloorDetailFootprint', () => {
	it('rejects a zero-area rectangle', () => {
		const check = validateFloorDetailFootprint(
			'carpet',
			rectanglePointsFromCorners({ gridX: 2, gridZ: 2 }, { gridX: 2, gridZ: 5 }),
			1,
			GRID
		);
		expect(check.valid).toBe(false);
	});

	it('accepts a one-cell rectangle', () => {
		const check = validateFloorDetailFootprint(
			'tiles',
			rectanglePointsFromCorners({ gridX: 0, gridZ: 0 }, { gridX: 1, gridZ: 1 }),
			1,
			GRID
		);
		expect(check.valid).toBe(true);
	});

	it('rejects a path whose ends coincide', () => {
		const check = validateFloorDetailFootprint(
			'path',
			[
				{ gridX: 1, gridZ: 1 },
				{ gridX: 1, gridZ: 1 }
			],
			1,
			GRID
		);
		expect(check.valid).toBe(false);
	});

	it('accepts a diagonal path of at least one cell', () => {
		const check = validateFloorDetailFootprint(
			'path',
			[
				{ gridX: 0, gridZ: 0 },
				{ gridX: 3, gridZ: 4 }
			],
			1,
			GRID
		);
		expect(check.valid).toBe(true);
	});
});

describe('pathStripLocalCorners', () => {
	it('keeps a constant width on a diagonal, not a grid-snapped quad', () => {
		const corners = pathStripLocalCorners(
			{ gridX: 0, gridZ: 0 },
			{ gridX: 4, gridZ: 4 },
			1,
			GRID
		);
		expect(corners).toHaveLength(4);
		const widthA = Math.hypot(corners[0].x - corners[3].x, corners[0].z - corners[3].z);
		const widthB = Math.hypot(corners[1].x - corners[2].x, corners[1].z - corners[2].z);
		expect(widthA).toBeCloseTo(1, 5);
		expect(widthB).toBeCloseTo(1, 5);
	});
});

describe('buildFloorDetailBoxes', () => {
	it('lifts every box above the host plane', () => {
		const boxes = buildFloorDetailBoxes(detail({ hostY: 3 }), GRID);
		expect(boxes.length).toBeGreaterThan(0);
		for (const box of boxes) {
			expect(box.minY).toBeCloseTo(3 + FLOOR_DETAIL_HOST_LIFT, 5);
			expect(box.maxY).toBeGreaterThan(box.minY);
		}
	});

	it('alternates plank colours along the chosen axis', () => {
		const boxes = buildFloorDetailBoxes(
			detail({ kind: 'planks', plankDirection: 'x', plankWidth: 0.25 }),
			GRID
		);
		const colors = new Set(boxes.map((box) => box.color));
		expect(colors.size).toBe(2);
		expect(boxes.length).toBeGreaterThan(1);
	});

	it('builds a checker of two colours for tiles', () => {
		const boxes = buildFloorDetailBoxes(
			detail({
				kind: 'tiles',
				tilePattern: 'checker',
				tileSize: 0.25,
				points: rectanglePointsFromCorners({ gridX: 0, gridZ: 0 }, { gridX: 4, gridZ: 4 })
			}),
			GRID
		);
		expect(new Set(boxes.map((box) => box.color)).size).toBe(2);
	});

	it('adds framed path edges as extra yawed boxes', () => {
		const framed = buildFloorDetailBoxes(
			detail({
				kind: 'path',
				pathFraming: true,
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: 8, gridZ: 0 }
				]
			}),
			GRID
		);
		const bare = buildFloorDetailBoxes(
			detail({
				kind: 'path',
				pathFraming: false,
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: 8, gridZ: 0 }
				]
			}),
			GRID
		);
		expect(framed.length).toBe(bare.length + 2);
		expect(framed[0].yaw).toBeDefined();
	});

	it('2d tiles are thinner than 3d tiles', () => {
		const thick = buildFloorDetailBoxes(detail({ kind: 'tiles', renderMode: '3d' }), GRID);
		const thin = buildFloorDetailBoxes(detail({ kind: 'tiles', renderMode: '2d' }), GRID);
		const t3 = thick[0].maxY - thick[0].minY;
		const t2 = thin[0].maxY - thin[0].minY;
		expect(t3).toBeGreaterThan(t2);
	});
});

describe('axisAlignedRectFromPoints', () => {
	it('normalises opposite corners', () => {
		expect(axisAlignedRectFromPoints([{ gridX: 4, gridZ: 1 }, { gridX: 0, gridZ: 5 }])).toEqual({
			minGridX: 0,
			maxGridX: 4,
			minGridZ: 1,
			maxGridZ: 5
		});
	});
});
