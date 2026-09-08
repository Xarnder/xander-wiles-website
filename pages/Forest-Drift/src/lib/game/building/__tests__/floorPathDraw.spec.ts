import { describe, expect, it } from 'vitest';
import {
	cycleFloorPathDrawMode,
	floorPathDrawModeBadge,
	floorPathDrawModeLabel
} from '../floorPathDraw';

describe('cycleFloorPathDrawMode', () => {
	it('cycles axis → free → bezier → axis', () => {
		expect(cycleFloorPathDrawMode('axis')).toBe('free');
		expect(cycleFloorPathDrawMode('free')).toBe('bezier');
		expect(cycleFloorPathDrawMode('bezier')).toBe('axis');
	});
});

describe('floorPathDrawMode labels', () => {
	it('uses a crosshair badge for every mode so C is visible', () => {
		expect(floorPathDrawModeBadge('axis')).toBe('AXIS SNAP');
		expect(floorPathDrawModeBadge('free')).toBe('FREE PATH');
		expect(floorPathDrawModeBadge('bezier')).toBe('BEZIER PATH');
		expect(floorPathDrawModeLabel('bezier')).toBe('Bezier');
	});
});
