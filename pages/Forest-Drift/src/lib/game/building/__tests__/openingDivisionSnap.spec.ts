import { describe, expect, it } from 'vitest';
import {
	cycleOpeningDivisionSnap,
	openingDivisionPoints,
	openingDivisionSnapBadge,
	snapOpeningCenterU,
	snapOpeningCoord
} from '../openingDivisionSnap';

describe('cycleOpeningDivisionSnap', () => {
	it('walks grid through sixteenths, then back to grid', () => {
		expect(cycleOpeningDivisionSnap('grid')).toBe('half');
		expect(cycleOpeningDivisionSnap('half')).toBe('thirds');
		expect(cycleOpeningDivisionSnap('thirds')).toBe('quarters');
		expect(cycleOpeningDivisionSnap('quarters')).toBe('fifths');
		expect(cycleOpeningDivisionSnap('fifths')).toBe('sixths');
		expect(cycleOpeningDivisionSnap('sixths')).toBe('sevenths');
		expect(cycleOpeningDivisionSnap('sevenths')).toBe('eighths');
		expect(cycleOpeningDivisionSnap('eighths')).toBe('ninths');
		expect(cycleOpeningDivisionSnap('ninths')).toBe('tenths');
		expect(cycleOpeningDivisionSnap('tenths')).toBe('elevenths');
		expect(cycleOpeningDivisionSnap('elevenths')).toBe('twelfths');
		expect(cycleOpeningDivisionSnap('twelfths')).toBe('thirteenths');
		expect(cycleOpeningDivisionSnap('thirteenths')).toBe('fourteenths');
		expect(cycleOpeningDivisionSnap('fourteenths')).toBe('fifteenths');
		expect(cycleOpeningDivisionSnap('fifteenths')).toBe('sixteenths');
		expect(cycleOpeningDivisionSnap('sixteenths')).toBe('grid');
	});
});

describe('openingDivisionPoints', () => {
	it('half is the wall midpoint, quarters are 1/4 1/2 3/4', () => {
		expect(openingDivisionPoints(4, 'half')).toEqual([2]);
		expect(openingDivisionPoints(4, 'quarters')).toEqual([1, 2, 3]);
	});

	it('sixteenths are every 1/16 of this wall’s length, excluding the ends', () => {
		expect(openingDivisionPoints(16, 'sixteenths')).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
		]);
	});

	it('grid and a zero-length wall produce no points', () => {
		expect(openingDivisionPoints(4, 'grid')).toEqual([]);
		expect(openingDivisionPoints(0, 'quarters')).toEqual([]);
	});
});

describe('snapOpeningCoord', () => {
	it('rounds to openingGridSize', () => {
		expect(snapOpeningCoord(1.24, 0.1)).toBeCloseTo(1.2);
		expect(snapOpeningCoord(1.26, 0.1)).toBeCloseTo(1.3);
	});
});

describe('snapOpeningCenterU', () => {
	it('grid snap rounds to openingGridSize', () => {
		expect(snapOpeningCenterU(1.24, 4, 'grid', 0.1)).toBeCloseTo(1.2);
		expect(snapOpeningCenterU(1.26, 4, 'grid', 0.1)).toBeCloseTo(1.3);
	});

	it('half snap locks to the midpoint even when the look point is off-centre', () => {
		expect(snapOpeningCenterU(0.4, 4, 'half', 0.1)).toBeCloseTo(2);
		expect(snapOpeningCenterU(3.9, 4, 'half', 0.1)).toBeCloseTo(2);
	});

	it('quarter snap picks the nearest quarter point of this wall', () => {
		expect(snapOpeningCenterU(0.2, 4, 'quarters', 0.1)).toBeCloseTo(1);
		expect(snapOpeningCenterU(1.6, 4, 'quarters', 0.1)).toBeCloseTo(2);
		expect(snapOpeningCenterU(3.4, 4, 'quarters', 0.1)).toBeCloseTo(3);
	});

	it('thirds snap uses this wall’s own length, not a global metre grid', () => {
		expect(snapOpeningCenterU(2, 6, 'thirds', 0.1)).toBeCloseTo(2);
		expect(snapOpeningCenterU(5, 6, 'thirds', 0.1)).toBeCloseTo(4);
	});

	it('sixteenths snap picks the nearest 1/16 of this wall', () => {
		expect(snapOpeningCenterU(0.2, 16, 'sixteenths', 0.1)).toBeCloseTo(1);
		expect(snapOpeningCenterU(7.6, 16, 'sixteenths', 0.1)).toBeCloseTo(8);
		expect(snapOpeningCenterU(15.4, 16, 'sixteenths', 0.1)).toBeCloseTo(15);
	});
});

describe('openingDivisionSnapBadge', () => {
	it('is silent for grid snap and names every division mode', () => {
		expect(openingDivisionSnapBadge('grid')).toBeNull();
		expect(openingDivisionSnapBadge('quarters')).toBe('QUARTER SNAP');
		expect(openingDivisionSnapBadge('half')).toBe('HALF SNAP');
		expect(openingDivisionSnapBadge('sixteenths')).toBe('SIXTEENTHS SNAP');
	});
});
