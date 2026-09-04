import { describe, expect, it } from 'vitest';
import {
	computeFoundationSelection,
	gridToWorldCoord,
	vertexSpacingFor,
	worldToGridCoord
} from '../foundationMath';

const CHUNK_SIZE = 96;
const CHUNK_RESOLUTION = 48;
const SPACING = vertexSpacingFor(CHUNK_SIZE, CHUNK_RESOLUTION); // 2 world units per grid cell

/** A deterministic mock height field: height(x, z) = x * 0.1 + z * 0.2, easy to reason about by hand. */
function mockSample(worldX: number, worldZ: number): number {
	return worldX * 0.1 + worldZ * 0.2;
}

describe('vertexSpacingFor', () => {
	it('matches chunkSize / chunkResolution', () => {
		expect(SPACING).toBe(2);
	});
});

describe('grid snapping', () => {
	it('snaps world coordinates to the nearest global grid vertex', () => {
		expect(worldToGridCoord(0, SPACING)).toBe(0);
		expect(worldToGridCoord(1.9, SPACING)).toBe(1);
		expect(worldToGridCoord(2.1, SPACING)).toBe(1);
		expect(worldToGridCoord(3.1, SPACING)).toBe(2);
	});

	it('snaps correctly on the negative side of zero', () => {
		expect(worldToGridCoord(-1.9, SPACING)).toBe(-1);
		expect(worldToGridCoord(-2.1, SPACING)).toBe(-1);
		expect(worldToGridCoord(-3.1, SPACING)).toBe(-2);
		expect(worldToGridCoord(-0.1, SPACING)).toBe(0);
	});

	it('round-trips grid <-> world exactly for integer grid coordinates', () => {
		for (const gridX of [-37, -1, 0, 1, 12, 500]) {
			const worldX = gridToWorldCoord(gridX, SPACING);
			expect(worldToGridCoord(worldX, SPACING)).toBe(gridX);
		}
	});
});

describe('rectangle normalization', () => {
	it('produces the same footprint regardless of which corner was clicked first', () => {
		const a = { gridX: 4, gridZ: -2 };
		const b = { gridX: 10, gridZ: 6 };

		const forward = computeFoundationSelection(a, b, SPACING, mockSample, 64, 1);
		const backward = computeFoundationSelection(b, a, SPACING, mockSample, 64, 1);

		expect(forward.valid).toBe(true);
		expect(backward).toEqual(forward);
	});

	it('produces the same footprint for all four corner-order permutations', () => {
		const topLeft = { gridX: -5, gridZ: 10 };
		const bottomRight = { gridX: 5, gridZ: -10 };
		const topRight = { gridX: 5, gridZ: 10 };
		const bottomLeft = { gridX: -5, gridZ: -10 };

		const results = [
			computeFoundationSelection(topLeft, bottomRight, SPACING, mockSample, 64, 1),
			computeFoundationSelection(bottomRight, topLeft, SPACING, mockSample, 64, 1),
			computeFoundationSelection(topRight, bottomLeft, SPACING, mockSample, 64, 1),
			computeFoundationSelection(bottomLeft, topRight, SPACING, mockSample, 64, 1)
		];

		for (const result of results) {
			expect(result.minGridX).toBe(-5);
			expect(result.maxGridX).toBe(5);
			expect(result.minGridZ).toBe(-10);
			expect(result.maxGridZ).toBe(10);
		}
	});
});

describe('highest / lowest point', () => {
	it('topY is the maximum terrain grid vertex height in the footprint', () => {
		// height increases with both x and z here, so the far corner (maxGridX, maxGridZ) is highest.
		const result = computeFoundationSelection(
			{ gridX: 0, gridZ: 0 },
			{ gridX: 5, gridZ: 5 },
			SPACING,
			mockSample,
			64,
			1
		);

		expect(result.valid).toBe(true);
		const expectedMax = mockSample(5 * SPACING, 5 * SPACING);
		expect(result.topY).toBeCloseTo(expectedMax);
		expect(result.highestPoint.gridX).toBe(5);
		expect(result.highestPoint.gridZ).toBe(5);
	});

	it('identifies the highest vertex from an explicit height table, not just the corners', () => {
		const heights = new Map<string, number>([
			['0,0', 4.2],
			['1,0', 5.1],
			['0,1', 3.8],
			['1,1', 6.4],
			['2,0', 5.9]
		]);
		const sample = (worldX: number, worldZ: number) => {
			const gx = worldToGridCoord(worldX, SPACING);
			const gz = worldToGridCoord(worldZ, SPACING);
			return heights.get(`${gx},${gz}`) ?? 0;
		};

		const result = computeFoundationSelection(
			{ gridX: 0, gridZ: 0 },
			{ gridX: 2, gridZ: 1 },
			SPACING,
			sample,
			64,
			1
		);

		expect(result.valid).toBe(true);
		expect(result.topY).toBe(6.4);
		expect(result.highestPoint).toMatchObject({ gridX: 1, gridZ: 1 });
	});
});

describe('minimum height / bottomY', () => {
	it('bottomY is the minimum terrain height in the footprint minus foundationUndergroundDepth', () => {
		const undergroundDepth = 1.5;
		const result = computeFoundationSelection(
			{ gridX: 0, gridZ: 0 },
			{ gridX: 4, gridZ: 4 },
			SPACING,
			mockSample,
			64,
			undergroundDepth
		);

		expect(result.valid).toBe(true);
		const expectedMin = mockSample(0, 0); // lowest at the near corner, since height grows with x and z
		expect(result.bottomY).toBeCloseTo(expectedMin - undergroundDepth);
	});
});

describe('chunk-crossing footprints', () => {
	it('produces correct min/max height for a footprint spanning a chunk boundary', () => {
		// chunkSize=96 means grid cell 48 sits exactly on a chunk boundary; span across it.
		const cellsPerChunk = CHUNK_SIZE / SPACING; // 48
		const result = computeFoundationSelection(
			{ gridX: cellsPerChunk - 3, gridZ: 0 },
			{ gridX: cellsPerChunk + 3, gridZ: 2 },
			SPACING,
			mockSample,
			64,
			1
		);

		expect(result.valid).toBe(true);
		expect(result.topY).toBeCloseTo(mockSample((cellsPerChunk + 3) * SPACING, 2 * SPACING));
		expect(result.bottomY).toBeCloseTo(mockSample((cellsPerChunk - 3) * SPACING, 0) - 1);
	});
});

describe('negative world coordinates', () => {
	it('computes correctly for a footprint entirely in negative grid coordinates', () => {
		const result = computeFoundationSelection(
			{ gridX: -10, gridZ: -8 },
			{ gridX: -4, gridZ: -2 },
			SPACING,
			mockSample,
			64,
			1
		);

		expect(result.valid).toBe(true);
		expect(result.minGridX).toBe(-10);
		expect(result.maxGridX).toBe(-4);
		// height grows with x/z, so within an all-negative footprint the *least negative* corner is highest.
		expect(result.highestPoint).toMatchObject({ gridX: -4, gridZ: -2 });
		expect(result.topY).toBeCloseTo(mockSample(-4 * SPACING, -2 * SPACING));
	});
});

describe('crossing world zero', () => {
	it('computes correctly for a footprint spanning negative to positive X and Z', () => {
		const result = computeFoundationSelection(
			{ gridX: -5, gridZ: -3 },
			{ gridX: 5, gridZ: 8 },
			SPACING,
			mockSample,
			64,
			1
		);

		expect(result.valid).toBe(true);
		expect(result.minGridX).toBe(-5);
		expect(result.maxGridX).toBe(5);
		expect(result.minGridZ).toBe(-3);
		expect(result.maxGridZ).toBe(8);
		expect(result.highestPoint).toMatchObject({ gridX: 5, gridZ: 8 });
		expect(result.topY).toBeCloseTo(mockSample(5 * SPACING, 8 * SPACING));
	});
});

describe('minimum size', () => {
	it('rejects a zero-width selection (same gridX)', () => {
		const result = computeFoundationSelection(
			{ gridX: 3, gridZ: 0 },
			{ gridX: 3, gridZ: 5 },
			SPACING,
			mockSample,
			64,
			1
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toMatch(/width|depth/i);
	});

	it('rejects a zero-depth selection (same gridZ)', () => {
		const result = computeFoundationSelection(
			{ gridX: 0, gridZ: 7 },
			{ gridX: 5, gridZ: 7 },
			SPACING,
			mockSample,
			64,
			1
		);
		expect(result.valid).toBe(false);
	});

	it('rejects a single-point selection (same gridX and gridZ)', () => {
		const result = computeFoundationSelection(
			{ gridX: 2, gridZ: 2 },
			{ gridX: 2, gridZ: 2 },
			SPACING,
			mockSample,
			64,
			1
		);
		expect(result.valid).toBe(false);
	});
});

describe('maximum size', () => {
	it('accepts a selection exactly at maxFoundationCells', () => {
		const result = computeFoundationSelection(
			{ gridX: 0, gridZ: 0 },
			{ gridX: 64, gridZ: 64 },
			SPACING,
			mockSample,
			64,
			1
		);
		expect(result.valid).toBe(true);
	});

	it('rejects a selection exceeding maxFoundationCells on either axis', () => {
		const tooWide = computeFoundationSelection(
			{ gridX: 0, gridZ: 0 },
			{ gridX: 65, gridZ: 10 },
			SPACING,
			mockSample,
			64,
			1
		);
		expect(tooWide.valid).toBe(false);
		expect(tooWide.reason).toMatch(/large/i);

		const tooDeep = computeFoundationSelection(
			{ gridX: 0, gridZ: 0 },
			{ gridX: 10, gridZ: 65 },
			SPACING,
			mockSample,
			64,
			1
		);
		expect(tooDeep.valid).toBe(false);
	});
});
