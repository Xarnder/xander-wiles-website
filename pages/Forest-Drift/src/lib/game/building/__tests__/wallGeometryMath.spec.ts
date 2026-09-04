import { describe, expect, it } from 'vitest';
import type { FoundationLocalFrame } from '../FoundationLocalMath';
import {
	computeSolidWallSegments,
	computeWallLength,
	computeWallTransform,
	doOpeningsOverlap,
	findOverlappingOpening,
	isOpeningWithinWallBounds,
	validateWallLength,
	wallLocalToWorld,
	worldToWallLocal
} from '../wallGeometryMath';
import type { WallOpeningDefinition } from '../WallTypes';

const GRID = 0.5;

describe('computeWallLength / computeWallTransform', () => {
	it('computes length via hypot of the grid-derived local delta', () => {
		const length = computeWallLength(
			{ startGridX: 0, startGridZ: 0, endGridX: 6, endGridZ: 8 },
			GRID
		);
		// dx = 3, dz = 4 in world units -> 3-4-5 triangle
		expect(length).toBeCloseTo(5);
	});

	it('computes rotation as atan2(dz, dx)', () => {
		const frame: FoundationLocalFrame = { originWorldX: 0, originWorldY: 0, originWorldZ: 0 };
		const straightAlongX = computeWallTransform(
			{ startGridX: 0, startGridZ: 0, endGridX: 4, endGridZ: 0 },
			frame,
			GRID
		);
		expect(straightAlongX.headingRadians).toBeCloseTo(0);

		const straightAlongZ = computeWallTransform(
			{ startGridX: 0, startGridZ: 0, endGridX: 0, endGridZ: 4 },
			frame,
			GRID
		);
		expect(straightAlongZ.headingRadians).toBeCloseTo(Math.PI / 2);
	});

	it('bakes the foundation origin into originWorldX/Y/Z', () => {
		const frame: FoundationLocalFrame = {
			originWorldX: 100,
			originWorldY: 17.4,
			originWorldZ: -50
		};
		const transform = computeWallTransform(
			{ startGridX: 2, startGridZ: 0, endGridX: 4, endGridZ: 0 },
			frame,
			GRID
		);
		expect(transform.originWorldX).toBeCloseTo(100 + 2 * GRID);
		expect(transform.originWorldY).toBeCloseTo(17.4);
		expect(transform.originWorldZ).toBeCloseTo(-50);
	});
});

describe('wallLocalToWorld / worldToWallLocal round trip', () => {
	it('round-trips for an axis-aligned wall', () => {
		const frame: FoundationLocalFrame = { originWorldX: 10, originWorldY: 17.4, originWorldZ: 5 };
		const transform = computeWallTransform(
			{ startGridX: 0, startGridZ: 0, endGridX: 8, endGridZ: 0 },
			frame,
			GRID
		);

		for (const [u, y] of [
			[0, 0],
			[2.5, 1.5],
			[4, 3]
		]) {
			const world = wallLocalToWorld(transform, u, y);
			const back = worldToWallLocal(transform, world.worldX, world.worldY, world.worldZ);
			expect(back.u).toBeCloseTo(u);
			expect(back.y).toBeCloseTo(y);
		}
	});

	it('round-trips correctly for a diagonal wall', () => {
		const frame: FoundationLocalFrame = { originWorldX: 0, originWorldY: 17.4, originWorldZ: 0 };
		const transform = computeWallTransform(
			{ startGridX: 0, startGridZ: 0, endGridX: 6, endGridZ: 8 },
			frame,
			GRID
		);

		for (const [u, y] of [
			[0, 0],
			[2.5, 1.7],
			[5, 3]
		]) {
			const world = wallLocalToWorld(transform, u, y);
			const back = worldToWallLocal(transform, world.worldX, world.worldY, world.worldZ);
			expect(back.u).toBeCloseTo(u);
			expect(back.y).toBeCloseTo(y);
		}
	});

	it('a diagonal wall opening lands at the correct world position, offset from the wall origin along its true direction', () => {
		const frame: FoundationLocalFrame = { originWorldX: 0, originWorldY: 17.4, originWorldZ: 0 };
		// 3-4-5 diagonal: direction is (0.6, 0.8)
		const transform = computeWallTransform(
			{ startGridX: 0, startGridZ: 0, endGridX: 6, endGridZ: 8 },
			frame,
			GRID
		);
		const world = wallLocalToWorld(transform, 5, 1, 0);
		expect(world.worldX).toBeCloseTo(5 * 0.6);
		expect(world.worldZ).toBeCloseTo(5 * 0.8);
		expect(world.worldY).toBeCloseTo(17.4 + 1);
	});
});

describe('computeSolidWallSegments', () => {
	it('produces one full segment for a wall with no openings', () => {
		const segments = computeSolidWallSegments(6, 3, []);
		expect(segments).toEqual([{ minU: 0, maxU: 6, minY: 0, maxY: 3 }]);
	});

	it('produces solid left/right/above/below around a centred window', () => {
		const segments = computeSolidWallSegments(6, 3, [{ minU: 2, maxU: 4, minY: 1, maxY: 2 }]);

		// Left strip (0..2) and right strip (4..6) are fully solid floor-to-ceiling; the middle
		// strip (2..4) is solid below (0..1) and above (2..3) the window, with a gap at 1..2.
		const totalSolidArea = segments.reduce(
			(sum, s) => sum + (s.maxU - s.minU) * (s.maxY - s.minY),
			0
		);
		const wallArea = 6 * 3;
		const openingArea = 2 * 1;
		expect(totalSolidArea).toBeCloseTo(wallArea - openingArea);

		// No segment should cover any point inside the opening rectangle.
		for (const segment of segments) {
			const overlapsOpeningU = segment.minU < 4 && segment.maxU > 2;
			const overlapsOpeningY = segment.minY < 2 && segment.maxY > 1;
			expect(overlapsOpeningU && overlapsOpeningY).toBe(false);
		}

		// The middle strip must have nothing below Y=0..1 merged with above 2..3 — i.e. there is a
		// segment ending at Y=1 and one starting at Y=2 within U=2..4.
		const middleStripSegments = segments.filter((s) => s.minU >= 2 - 1e-9 && s.maxU <= 4 + 1e-9);
		expect(middleStripSegments.some((s) => s.minY === 0 && s.maxY === 1)).toBe(true);
		expect(middleStripSegments.some((s) => s.minY === 2 && s.maxY === 3)).toBe(true);
	});

	it('produces no segment below a door (minY = 0)', () => {
		const segments = computeSolidWallSegments(6, 3, [{ minU: 2, maxU: 3, minY: 0, maxY: 2.1 }]);
		const doorStripSegments = segments.filter((s) => s.minU >= 2 - 1e-9 && s.maxU <= 3 + 1e-9);
		// Only the segment above the door remains — nothing starting at Y=0.
		expect(doorStripSegments.every((s) => s.minY >= 2.1 - 1e-9)).toBe(true);
		expect(doorStripSegments.some((s) => s.minY === 0)).toBe(false);
	});

	it('handles two non-overlapping windows, leaving three solid vertical strips plus above/below', () => {
		const segments = computeSolidWallSegments(10, 3, [
			{ minU: 1, maxU: 2, minY: 1, maxY: 2 },
			{ minU: 6, maxU: 7, minY: 1, maxY: 2 }
		]);

		const totalSolidArea = segments.reduce(
			(sum, s) => sum + (s.maxU - s.minU) * (s.maxY - s.minY),
			0
		);
		expect(totalSolidArea).toBeCloseTo(10 * 3 - 2 * (1 * 1));

		for (const opening of [
			{ minU: 1, maxU: 2, minY: 1, maxY: 2 },
			{ minU: 6, maxU: 7, minY: 1, maxY: 2 }
		]) {
			for (const segment of segments) {
				const overlapsU = segment.minU < opening.maxU && segment.maxU > opening.minU;
				const overlapsY = segment.minY < opening.maxY && segment.maxY > opening.minY;
				expect(overlapsU && overlapsY).toBe(false);
			}
		}
	});

	it('supports a window stacked above a door in the same U strip', () => {
		const segments = computeSolidWallSegments(6, 3, [
			{ minU: 2, maxU: 3, minY: 0, maxY: 2.1 }, // door
			{ minU: 2, maxU: 3, minY: 2.3, maxY: 2.8 } // small window above it
		]);
		const stripSegments = segments.filter((s) => s.minU >= 2 - 1e-9 && s.maxU <= 3 + 1e-9);
		// Solid remains only between the door top and window bottom, and above the window.
		expect(
			stripSegments.some((s) => Math.abs(s.minY - 2.1) < 1e-9 && Math.abs(s.maxY - 2.3) < 1e-9)
		).toBe(true);
		expect(
			stripSegments.some((s) => Math.abs(s.minY - 2.8) < 1e-9 && Math.abs(s.maxY - 3) < 1e-9)
		).toBe(true);
	});
});

describe('validateWallLength', () => {
	it('rejects a zero-length wall', () => {
		const result = validateWallLength(
			{ startGridX: 2, startGridZ: 2, endGridX: 2, endGridZ: 2 },
			GRID,
			0.25
		);
		expect(result.valid).toBe(false);
	});

	it('rejects a wall shorter than the configured minimum', () => {
		const result = validateWallLength(
			{ startGridX: 0, startGridZ: 0, endGridX: 1, endGridZ: 0 },
			GRID, // 1 grid cell = 0.5m
			1 // minimum 1m
		);
		expect(result.valid).toBe(false);
	});

	it('accepts a wall at or above the minimum length', () => {
		const result = validateWallLength(
			{ startGridX: 0, startGridZ: 0, endGridX: 4, endGridZ: 0 },
			GRID, // 4 cells = 2m
			1
		);
		expect(result.valid).toBe(true);
	});
});

describe('isOpeningWithinWallBounds', () => {
	const wallLength = 6;
	const wallHeight = 3;
	const margin = 0.1;

	it('accepts an opening comfortably inside the wall', () => {
		expect(
			isOpeningWithinWallBounds(
				{ minU: 1, maxU: 2, minY: 0.5, maxY: 1.5 },
				wallLength,
				wallHeight,
				margin
			)
		).toBe(true);
	});

	it('rejects an opening extending past the wall end', () => {
		expect(
			isOpeningWithinWallBounds(
				{ minU: 5.95, maxU: 6.5, minY: 0, maxY: 2 },
				wallLength,
				wallHeight,
				margin
			)
		).toBe(false);
	});

	it('rejects an opening closer to the wall edge than the margin', () => {
		expect(
			isOpeningWithinWallBounds(
				{ minU: 0.05, maxU: 1, minY: 0, maxY: 2 },
				wallLength,
				wallHeight,
				margin
			)
		).toBe(false);
	});

	it('rejects an opening taller than the wall', () => {
		expect(
			isOpeningWithinWallBounds(
				{ minU: 1, maxU: 2, minY: 0, maxY: 3.5 },
				wallLength,
				wallHeight,
				margin
			)
		).toBe(false);
	});
});

describe('doOpeningsOverlap / findOverlappingOpening', () => {
	const existing: WallOpeningDefinition[] = [
		{ id: 'w1', type: 'window', minU: 2, maxU: 3, minY: 1, maxY: 2 }
	];

	it('detects a directly overlapping rectangle', () => {
		expect(doOpeningsOverlap({ minU: 2.5, maxU: 3.5, minY: 1.5, maxY: 2.5 }, existing[0])).toBe(
			true
		);
	});

	it('does not flag two rectangles that merely touch (no spacing required)', () => {
		expect(doOpeningsOverlap({ minU: 3, maxU: 4, minY: 1, maxY: 2 }, existing[0], 0)).toBe(false);
	});

	it('flags rectangles that are too close together when spacing is required', () => {
		expect(doOpeningsOverlap({ minU: 3.05, maxU: 4, minY: 1, maxY: 2 }, existing[0], 0.2)).toBe(
			true
		);
	});

	it('rejects a candidate overlapping any existing opening', () => {
		const overlap = findOverlappingOpening(
			{ minU: 2.2, maxU: 2.8, minY: 1.2, maxY: 1.8 },
			existing,
			0
		);
		expect(overlap).toBe(existing[0]);
	});

	it('accepts a candidate that does not overlap', () => {
		const overlap = findOverlappingOpening({ minU: 4, maxU: 5, minY: 0, maxY: 1 }, existing, 0);
		expect(overlap).toBeUndefined();
	});
});
