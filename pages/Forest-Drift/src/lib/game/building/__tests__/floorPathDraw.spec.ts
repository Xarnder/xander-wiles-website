import { describe, expect, it } from 'vitest';
import type { BuildingGridPoint } from '../FoundationLocalMath';
import {
	bezierArmAngleDegrees,
	constrainEqualArmEnd,
	cycleFloorPathDrawMode,
	floorPathDrawModeBadge,
	floorPathDrawModeLabel
} from '../floorPathDraw';

const point = (gridX: number, gridZ: number): BuildingGridPoint => ({ gridX, gridZ });

function armLength(from: BuildingGridPoint, to: BuildingGridPoint): number {
	return Math.hypot(to.gridX - from.gridX, to.gridZ - from.gridZ);
}

describe('cycleFloorPathDrawMode', () => {
	it('cycles axis → free → bezier → equal arms → equal 30° → axis', () => {
		expect(cycleFloorPathDrawMode('axis')).toBe('free');
		expect(cycleFloorPathDrawMode('free')).toBe('bezier');
		expect(cycleFloorPathDrawMode('bezier')).toBe('bezier-equal');
		expect(cycleFloorPathDrawMode('bezier-equal')).toBe('bezier-equal-30');
		expect(cycleFloorPathDrawMode('bezier-equal-30')).toBe('axis');
	});
});

describe('floorPathDrawMode labels', () => {
	it('uses a crosshair badge for every mode so B is visible', () => {
		expect(floorPathDrawModeBadge('axis')).toBe('AXIS SNAP');
		expect(floorPathDrawModeBadge('free')).toBe('FREE PATH');
		expect(floorPathDrawModeBadge('bezier')).toBe('BEZIER PATH');
		expect(floorPathDrawModeBadge('bezier-equal')).toBe('EQUAL ARMS');
		expect(floorPathDrawModeBadge('bezier-equal-30')).toBe('EQUAL 30°');
		expect(floorPathDrawModeLabel('bezier')).toBe('Bezier');
		expect(floorPathDrawModeLabel('bezier-equal')).toBe('Equal arms');
		expect(floorPathDrawModeLabel('bezier-equal-30')).toBe('Equal arms 30°');
	});
});

describe('constrainEqualArmEnd', () => {
	const start = point(0, 0);
	const middle = point(4, 0);

	it('keeps the last arm as long as the first and follows the mouse', () => {
		const end = constrainEqualArmEnd(start, middle, point(8, 4), null);
		expect(armLength(middle, end)).toBeCloseTo(armLength(middle, start));
		expect(end.gridX).toBeGreaterThan(middle.gridX);
		expect(end.gridZ).toBeGreaterThan(0);

		const otherSide = constrainEqualArmEnd(start, middle, point(8, -4), null);
		expect(otherSide.gridZ).toBeLessThan(0);
		expect(armLength(middle, otherSide)).toBeCloseTo(armLength(middle, start));
	});

	it('snaps the last point to 30° steps, including a right angle either way', () => {
		const right = constrainEqualArmEnd(start, middle, point(4, 6), 30);
		expect(right.gridX).toBeCloseTo(4);
		expect(right.gridZ).toBeCloseTo(4);
		expect(bezierArmAngleDegrees(start, right, middle)).toBeCloseTo(90);
		expect(armLength(middle, right)).toBeCloseTo(armLength(middle, start));

		const otherWay = constrainEqualArmEnd(start, middle, point(4, -6), 30);
		expect(otherWay.gridX).toBeCloseTo(4);
		expect(otherWay.gridZ).toBeCloseTo(-4);
		expect(bezierArmAngleDegrees(start, otherWay, middle)).toBeCloseTo(90);

		const nearThirty = constrainEqualArmEnd(start, middle, point(1, 1), 30);
		expect(bezierArmAngleDegrees(start, nearThirty, middle)).toBeCloseTo(30);
		expect(armLength(middle, nearThirty)).toBeCloseTo(4);
	});

	it('builds a right angle after a diagonal first arm', () => {
		const diagonalMiddle = point(4, 4);
		const end = constrainEqualArmEnd(start, diagonalMiddle, point(8, 0), 30);
		expect(end.gridX).toBeCloseTo(8);
		expect(end.gridZ).toBeCloseTo(0);
		expect(armLength(diagonalMiddle, end)).toBeCloseTo(armLength(diagonalMiddle, start));
		expect(bezierArmAngleDegrees(start, end, diagonalMiddle)).toBeCloseTo(90);
	});

	it('continues straight when the mouse aims past the corner', () => {
		const straight = constrainEqualArmEnd(start, middle, point(10, 0.05), 30);
		expect(straight.gridX).toBeCloseTo(8);
		expect(straight.gridZ).toBeCloseTo(0);
		expect(bezierArmAngleDegrees(start, straight, middle)).toBeCloseTo(180);
	});
});
