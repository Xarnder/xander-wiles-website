import { describe, expect, it } from 'vitest';
import {
	axisAlignedRectFromPoints,
	buildFloorDetailBoxes,
	floorDetailMeshMinY,
	floorDetailThickness,
	pathBendIsStraight,
	pathCenterlineLocalSamples,
	pathStripLocalCorners,
	quadraticBezierPoint,
	rectanglePointsFromCorners,
	validateFloorDetailFootprint
} from '../floorDetailMath';
import type { FloorDetailDefinition } from '../FloorDetailTypes';
import {
	FLOOR_DETAIL_2D_THICKNESS,
	FLOOR_DETAIL_HOST_LIFT,
	FLOOR_DETAIL_PATH_FRAME_WIDTH
} from '../FloorDetailTypes';

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

	it('accepts a quadratic Bezier path', () => {
		const check = validateFloorDetailFootprint(
			'path',
			[
				{ gridX: 0, gridZ: 0 },
				{ gridX: 4, gridZ: 8 },
				{ gridX: 8, gridZ: 0 }
			],
			1,
			GRID
		);
		expect(check.valid).toBe(true);
	});

	it('rejects a path with more than a start, bend, and end', () => {
		const check = validateFloorDetailFootprint(
			'path',
			[
				{ gridX: 0, gridZ: 0 },
				{ gridX: 2, gridZ: 2 },
				{ gridX: 4, gridZ: 0 },
				{ gridX: 6, gridZ: 2 }
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

describe('quadraticBezierPoint', () => {
	it('starts and ends on the authored points and bows toward the handle', () => {
		const start = { x: 0, z: 0 };
		const handle = { x: 0, z: 2 };
		const end = { x: 2, z: 0 };
		expect(quadraticBezierPoint(start, handle, end, 0)).toEqual(start);
		expect(quadraticBezierPoint(start, handle, end, 1)).toEqual(end);
		const mid = quadraticBezierPoint(start, handle, end, 0.5);
		expect(mid.x).toBeCloseTo(0.5, 5);
		expect(mid.z).toBeCloseTo(1, 5);
	});
});

describe('pathCenterlineLocalSamples', () => {
	it('keeps a straight path as two samples', () => {
		const samples = pathCenterlineLocalSamples(
			[
				{ gridX: 0, gridZ: 0 },
				{ gridX: 8, gridZ: 0 }
			],
			GRID
		);
		expect(samples).toHaveLength(2);
	});

	it('tessellates a bent path and treats a handle on the chord as straight', () => {
		const bent = pathCenterlineLocalSamples(
			[
				{ gridX: 0, gridZ: 0 },
				{ gridX: 4, gridZ: 8 },
				{ gridX: 8, gridZ: 0 }
			],
			GRID
		);
		expect(bent.length).toBeGreaterThan(2);
		expect(pathBendIsStraight({ gridX: 0, gridZ: 0 }, { gridX: 4, gridZ: 0 }, { gridX: 8, gridZ: 0 }, GRID)).toBe(
			true
		);
		expect(pathBendIsStraight({ gridX: 0, gridZ: 0 }, { gridX: 4, gridZ: 8 }, { gridX: 8, gridZ: 0 }, GRID)).toBe(
			false
		);
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

	it('breaks each plank row into a staggered mosaic instead of one long board', () => {
		const boxes = buildFloorDetailBoxes(
			detail({
				kind: 'planks',
				plankDirection: 'x',
				plankWidth: 0.2,
				points: rectanglePointsFromCorners({ gridX: 0, gridZ: 0 }, { gridX: 12, gridZ: 8 })
			}),
			GRID
		);
		const rows = new Map<number, typeof boxes>();
		for (const box of boxes) {
			const key = Math.round(box.minZ * 1000);
			const row = rows.get(key) ?? [];
			row.push(box);
			rows.set(key, row);
		}
		expect(rows.size).toBeGreaterThan(1);
		expect(boxes.length).toBeGreaterThan(rows.size);
		const firstLengths = [...rows.values()].map((row) => {
			const first = [...row].sort((a, b) => a.minX - b.minX)[0];
			return first.maxX - first.minX;
		});
		expect(new Set(firstLengths.map((len) => len.toFixed(3))).size).toBeGreaterThan(1);
		expect(Math.min(...boxes.map((box) => box.minX))).toBeCloseTo(0, 5);
		expect(Math.max(...boxes.map((box) => box.maxX))).toBeCloseTo(12 * GRID, 5);
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

	it('keeps diagonal path rails on the long edges from start to end', () => {
		const pathWidth = 1;
		const boxes = buildFloorDetailBoxes(
			detail({
				kind: 'path',
				pathFraming: true,
				pathWidth,
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: 8, gridZ: 8 }
				]
			}),
			GRID
		);
		expect(boxes).toHaveLength(3);
		const [bed, ...rails] = boxes;
		const bedCx = (bed.minX + bed.maxX) / 2;
		const bedCz = (bed.minZ + bed.maxZ) / 2;
		const dirX = Math.sin(bed.yaw ?? 0);
		const dirZ = Math.cos(bed.yaw ?? 0);
		const expectedOffset = pathWidth / 2 - FLOOR_DETAIL_PATH_FRAME_WIDTH / 2;
		const bedLength = bed.maxZ - bed.minZ;

		for (const rail of rails) {
			expect(rail.yaw).toBeCloseTo(bed.yaw ?? 0, 5);
			expect(rail.maxZ - rail.minZ).toBeCloseTo(bedLength, 5);
			const rcx = (rail.minX + rail.maxX) / 2;
			const rcz = (rail.minZ + rail.maxZ) / 2;
			const along = (rcx - bedCx) * dirX + (rcz - bedCz) * dirZ;
			const side = (rcx - bedCx) * -dirZ + (rcz - bedCz) * dirX;
			expect(along).toBeCloseTo(0, 5);
			expect(Math.abs(side)).toBeCloseTo(expectedOffset, 5);
		}
		const sides = rails.map((rail) => {
			const rcx = (rail.minX + rail.maxX) / 2;
			const rcz = (rail.minZ + rail.maxZ) / 2;
			return (rcx - bedCx) * -dirZ + (rcz - bedCz) * dirX;
		});
		expect(Math.sign(sides[0])).not.toBe(Math.sign(sides[1]));
	});

	it('builds a curved path from a start, handle, and end', () => {
		const straight = buildFloorDetailBoxes(
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
		const bent = buildFloorDetailBoxes(
			detail({
				kind: 'path',
				pathFraming: true,
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: 4, gridZ: 8 },
					{ gridX: 8, gridZ: 0 }
				]
			}),
			GRID
		);
		expect(straight).toHaveLength(1);
		expect(bent.length).toBeGreaterThan(straight.length + 2);
	});

	it('builds a carpet rim that does not sit under the field', () => {
		const boxes = buildFloorDetailBoxes(
			detail({
				kind: 'carpet',
				colors: ['#6B2E1F', '#4A1F14'],
				points: rectanglePointsFromCorners({ gridX: 0, gridZ: 0 }, { gridX: 8, gridZ: 8 })
			}),
			GRID
		);
		expect(boxes).toHaveLength(5);
		const field = boxes[boxes.length - 1];
		const rim = boxes.slice(0, -1);
		expect(field.color).toBe('#6B2E1F');
		expect(field.maxY).toBeGreaterThan(rim[0].maxY);
		for (const edge of rim) {
			expect(edge.color).toBe('#4A1F14');
			const overlapX = field.minX < edge.maxX - 1e-6 && field.maxX > edge.minX + 1e-6;
			const overlapZ = field.minZ < edge.maxZ - 1e-6 && field.maxZ > edge.minZ + 1e-6;
			expect(overlapX && overlapZ).toBe(false);
		}
	});

	it('keeps a 2d carpet rim and field from sharing an xz footprint', () => {
		const boxes = buildFloorDetailBoxes(
			detail({
				kind: 'carpet',
				renderMode: '2d',
				colors: ['#6B2E1F', '#4A1F14'],
				points: rectanglePointsFromCorners({ gridX: 0, gridZ: 0 }, { gridX: 8, gridZ: 8 })
			}),
			GRID
		);
		expect(boxes).toHaveLength(5);
		const field = boxes[boxes.length - 1];
		for (const edge of boxes.slice(0, -1)) {
			const overlapX = field.minX < edge.maxX - 1e-6 && field.maxX > edge.minX + 1e-6;
			const overlapZ = field.minZ < edge.maxZ - 1e-6 && field.maxZ > edge.minZ + 1e-6;
			expect(overlapX && overlapZ).toBe(false);
		}
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
