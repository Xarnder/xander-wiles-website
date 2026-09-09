import { describe, expect, it } from 'vitest';
import {
	approachDirectionForFootprint,
	approachStairBaseY,
	foundationGridCellCounts,
	isStairFootprintInterior,
	isStairGridPointNearFoundation,
	snapStairFootprintToFoundation,
	stairBottomCenterLocal,
	validateStairFoundationPlacement
} from '../stairPlacementMath';

const CELLS_X = 40;
const CELLS_Z = 24;

describe('foundationGridCellCounts', () => {
	it('rounds the metre span onto the building grid', () => {
		expect(foundationGridCellCounts(20, 12, 0.5)).toEqual({ cellsX: 40, cellsZ: 24 });
	});
});

describe('isStairFootprintInterior', () => {
	it('accepts a rectangle on the pad, including the far-edge grid line', () => {
		expect(
			isStairFootprintInterior({ minGridX: 0, maxGridX: 12, minGridZ: 0, maxGridZ: 4 }, CELLS_X, CELLS_Z)
		).toBe(true);
		expect(
			isStairFootprintInterior(
				{ minGridX: 36, maxGridX: 40, minGridZ: 20, maxGridZ: 24 },
				CELLS_X,
				CELLS_Z
			)
		).toBe(true);
	});

	it('rejects a rectangle that hangs off any edge', () => {
		expect(
			isStairFootprintInterior(
				{ minGridX: -8, maxGridX: 0, minGridZ: 4, maxGridZ: 8 },
				CELLS_X,
				CELLS_Z
			)
		).toBe(false);
	});
});

describe('approachDirectionForFootprint', () => {
	it('detects a min-X landing (flight in -X, ascending +x onto the pad)', () => {
		expect(
			approachDirectionForFootprint(
				{ minGridX: -8, maxGridX: 0, minGridZ: 4, maxGridZ: 8 },
				CELLS_X,
				CELLS_Z
			)
		).toBe('+x');
	});

	it('detects a max-X landing', () => {
		expect(
			approachDirectionForFootprint(
				{ minGridX: 40, maxGridX: 52, minGridZ: 2, maxGridZ: 6 },
				CELLS_X,
				CELLS_Z
			)
		).toBe('-x');
	});

	it('detects min-Z and max-Z landings', () => {
		expect(
			approachDirectionForFootprint(
				{ minGridX: 4, maxGridX: 8, minGridZ: -6, maxGridZ: 0 },
				CELLS_X,
				CELLS_Z
			)
		).toBe('+z');
		expect(
			approachDirectionForFootprint(
				{ minGridX: 4, maxGridX: 8, minGridZ: 24, maxGridZ: 32 },
				CELLS_X,
				CELLS_Z
			)
		).toBe('-z');
	});

	it('rejects a dangling rectangle that does not share an edge', () => {
		expect(
			approachDirectionForFootprint(
				{ minGridX: -20, maxGridX: -8, minGridZ: 4, maxGridZ: 8 },
				CELLS_X,
				CELLS_Z
			)
		).toBeNull();
	});

	it('rejects a rectangle that straddles the pad interior', () => {
		expect(
			approachDirectionForFootprint(
				{ minGridX: -4, maxGridX: 8, minGridZ: 4, maxGridZ: 8 },
				CELLS_X,
				CELLS_Z
			)
		).toBeNull();
	});
});

describe('snapStairFootprintToFoundation', () => {
	it('leaves an interior rectangle alone', () => {
		const footprint = { minGridX: 2, maxGridX: 14, minGridZ: 4, maxGridZ: 8 };
		expect(snapStairFootprintToFoundation(footprint, CELLS_X, CELLS_Z)).toEqual({
			footprint,
			approach: null
		});
	});

	it('clamps a 1-cell overshoot back onto the pad rather than inventing an approach stair', () => {
		const result = snapStairFootprintToFoundation(
			{ minGridX: 0, maxGridX: 12, minGridZ: -1, maxGridZ: 3 },
			12,
			4
		);
		expect(result.approach).toBeNull();
		expect(result.footprint).toEqual({ minGridX: 0, maxGridX: 12, minGridZ: 0, maxGridZ: 4 });
	});

	it('snaps a fully-outside rectangle flush to the nearest edge, preserving run length', () => {
		const result = snapStairFootprintToFoundation(
			{ minGridX: -12, maxGridX: -4, minGridZ: 6, maxGridZ: 10 },
			CELLS_X,
			CELLS_Z
		);
		expect(result.approach).toBe('+x');
		expect(result.footprint).toEqual({ minGridX: -8, maxGridX: 0, minGridZ: 6, maxGridZ: 10 });
	});

	it('snaps a mostly-outside straddle onto the crossed edge', () => {
		const result = snapStairFootprintToFoundation(
			{ minGridX: -10, maxGridX: 2, minGridZ: 4, maxGridZ: 8 },
			CELLS_X,
			CELLS_Z
		);
		expect(result.approach).toBe('+x');
		expect(result.footprint.maxGridX).toBe(0);
		expect(result.footprint.maxGridX - result.footprint.minGridX).toBe(12);
	});

	it('snaps to the +X face when the rectangle sits beyond cellsX', () => {
		const result = snapStairFootprintToFoundation(
			{ minGridX: 44, maxGridX: 56, minGridZ: 8, maxGridZ: 12 },
			CELLS_X,
			CELLS_Z
		);
		expect(result.approach).toBe('-x');
		expect(result.footprint.minGridX).toBe(CELLS_X);
		expect(result.footprint.maxGridX).toBe(52);
	});
});

describe('validateStairFoundationPlacement', () => {
	it('accepts an interior long-axis stair', () => {
		expect(
			validateStairFoundationPlacement(
				{ minGridX: 0, maxGridX: 12, minGridZ: 0, maxGridZ: 4 },
				'+x',
				CELLS_X,
				CELLS_Z,
				2,
				2
			).valid
		).toBe(true);
	});

	it('accepts a wide, short approach stair (run along the short axis)', () => {
		const result = validateStairFoundationPlacement(
			{ minGridX: -4, maxGridX: 0, minGridZ: 4, maxGridZ: 12 },
			'+x',
			CELLS_X,
			CELLS_Z,
			2,
			2
		);
		expect(result.valid).toBe(true);
	});

	it('rejects an approach stair that would ascend away from the pad', () => {
		const result = validateStairFoundationPlacement(
			{ minGridX: -8, maxGridX: 0, minGridZ: 4, maxGridZ: 8 },
			'-x',
			CELLS_X,
			CELLS_Z,
			2,
			2
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toMatch(/ascend onto the foundation/);
	});

	it('rejects a rectangle that is neither on the pad nor flush with an edge', () => {
		const result = validateStairFoundationPlacement(
			{ minGridX: 0, maxGridX: 9999, minGridZ: 0, maxGridZ: 4 },
			'+x',
			CELLS_X,
			CELLS_Z,
			2,
			2
		);
		expect(result.valid).toBe(false);
	});
});

describe('stairBottomCenterLocal / approachStairBaseY', () => {
	it('puts the +x bottom at the min-X end', () => {
		expect(
			stairBottomCenterLocal({ minGridX: -8, maxGridX: 0, minGridZ: 4, maxGridZ: 8 }, '+x', 0.5)
		).toEqual({ x: -4, z: 3 });
	});

	it('measures approach baseY from terrain down to the foundation top', () => {
		expect(approachStairBaseY(10, 17.4)).toBeCloseTo(-7.4);
	});
});

describe('isStairGridPointNearFoundation', () => {
	it('accepts points on the pad and just outside, rejects far-away ones', () => {
		expect(isStairGridPointNearFoundation(20, 12, CELLS_X, CELLS_Z)).toBe(true);
		expect(isStairGridPointNearFoundation(-8, 12, CELLS_X, CELLS_Z)).toBe(true);
		expect(isStairGridPointNearFoundation(-80, 12, CELLS_X, CELLS_Z)).toBe(false);
	});
});
