import { describe, expect, it } from 'vitest';
import {
	beamAlongWallSize,
	beamExtentForOrientation,
	computeBeamVerticalExtent,
	cycleBeamOrientation
} from '../beamMath';

describe('computeBeamVerticalExtent', () => {
	it('snaps look-Y to the opening grid and centres the timber there', () => {
		const extent = computeBeamVerticalExtent(1.24, 0.16, 3, 0.1);
		expect(extent.minY).toBeCloseTo(1.12);
		expect(extent.maxY).toBeCloseTo(1.28);
	});

	it('clamps to the wall so a look near the floor or ceiling still fits', () => {
		const low = computeBeamVerticalExtent(0.02, 0.16, 3, 0.1);
		expect(low.minY).toBeCloseTo(0);
		expect(low.maxY).toBeCloseTo(0.16);

		const high = computeBeamVerticalExtent(2.99, 0.16, 3, 0.1);
		expect(high.minY).toBeCloseTo(2.84);
		expect(high.maxY).toBeCloseTo(3);
	});
});

describe('beam orientation', () => {
	it('uses the short face for a vertical post and the long face for a horizontal board', () => {
		expect(beamAlongWallSize('vertical', 1.2, 0.16)).toBeCloseTo(0.16);
		expect(beamAlongWallSize('horizontal', 1.2, 0.16)).toBeCloseTo(1.2);
	});

	it('spans the wall when vertical and follows look-Y when horizontal', () => {
		const wall = beamExtentForOrientation('vertical', 1.24, 0.16, 3, 0.1);
		expect(wall).toEqual({ minY: 0, maxY: 3 });
		const strip = beamExtentForOrientation('horizontal', 1.24, 0.16, 3, 0.1);
		expect(strip.minY).toBeCloseTo(1.12);
		expect(strip.maxY).toBeCloseTo(1.28);
	});

	it('defaults the cycle from vertical to horizontal', () => {
		expect(cycleBeamOrientation('vertical')).toBe('horizontal');
		expect(cycleBeamOrientation('horizontal')).toBe('vertical');
	});
});
