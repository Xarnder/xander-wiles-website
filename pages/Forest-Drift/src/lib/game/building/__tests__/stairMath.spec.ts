import { describe, expect, it } from 'vitest';
import {
	computeStairMetrics,
	cycleStairDirection,
	stairCanonicalToLocalXZ,
	stairDirectionFlipsWinding,
	stairSideRectsLocal,
	stairTreadRectsLocal,
	validateStairFootprint,
	validDirectionsForFootprint
} from '../stairMath';

describe('computeStairMetrics — the core grid-driven rule', () => {
	it('1 grid cell of run = 1 step = 1 grid cell of rise', () => {
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		expect(metrics.stepCount).toBe(12);
		expect(metrics.stepRise).toBe(0.25);
		expect(metrics.stepRun).toBe(0.25);
		expect(metrics.totalRise).toBeCloseTo(3.0);
	});

	it.each([
		[4, 1.0],
		[8, 2.0],
		[12, 3.0]
	])('a %i-cell run at 0.25m grid rises %fm', (cells, expectedRise) => {
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: cells,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		expect(metrics.totalRise).toBeCloseTo(expectedRise);
	});

	it('the topmost tread reaches exactly baseY + totalRise, never one riser short', () => {
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		expect(metrics.topLocalY).toBeCloseTo(3.0);
		// The convention: step i's walkable surface is at (i + 1) * stepRise — the LAST step
		// (i = stepCount - 1 = 11) must land exactly on topLocalY, not one riser short (2.75).
		const lastStepSurface = (metrics.stepCount - 1 + 1) * metrics.stepRise;
		expect(lastStepSurface).toBeCloseTo(3.0);
		expect(lastStepSurface).not.toBeCloseTo(2.75, 5);
	});

	it('reflects a non-zero baseY (starting from an upper level)', () => {
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 3
		});
		expect(metrics.topLocalY).toBeCloseTo(6);
	});

	it('run/width axes swap correctly for a Z-direction stair', () => {
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 4,
			minGridZ: 0,
			maxGridZ: 12,
			direction: '+z',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		expect(metrics.runAxis).toBe('z');
		expect(metrics.runCells).toBe(12);
		expect(metrics.widthCells).toBe(4);
		expect(metrics.stepCount).toBe(12);
	});
});

describe('validDirectionsForFootprint / cycleStairDirection', () => {
	it('a footprint longer in X only allows +x/-x', () => {
		expect(validDirectionsForFootprint(12, 4)).toEqual(['+x', '-x']);
	});

	it('a footprint longer in Z only allows +z/-z', () => {
		expect(validDirectionsForFootprint(4, 12)).toEqual(['+z', '-z']);
	});

	it('a square footprint allows all four directions', () => {
		expect(validDirectionsForFootprint(8, 8)).toEqual(['+x', '-x', '+z', '-z']);
	});

	it('cycles forward and backward, wrapping', () => {
		expect(cycleStairDirection('+x', 12, 4, 1)).toBe('-x');
		expect(cycleStairDirection('-x', 12, 4, 1)).toBe('+x');
		expect(cycleStairDirection('+x', 12, 4, -1)).toBe('-x');
	});

	it('cycles through all four axes for a square footprint, in order', () => {
		let direction: '+x' | '-x' | '+z' | '-z' = '+x';
		const seen: ('+x' | '-x' | '+z' | '-z')[] = [direction];
		for (let i = 0; i < 3; i++) {
			direction = cycleStairDirection(direction, 8, 8, 1);
			seen.push(direction);
		}
		expect(seen).toEqual(['+x', '-x', '+z', '-z']);
		// One more step wraps back to the start.
		expect(cycleStairDirection(direction, 8, 8, 1)).toBe('+x');
	});

	it('falls back to the first valid direction if the current one no longer matches the footprint', () => {
		// e.g. footprint changed shape while a Z direction was selected.
		expect(cycleStairDirection('+z', 12, 4, 1)).toBe('-x');
	});
});

describe('validateStairFootprint', () => {
	const MIN_WIDTH = 2;
	const MIN_RUN = 2;

	it('accepts a valid long-X footprint with +x', () => {
		const result = validateStairFootprint(
			{ minGridX: 0, maxGridX: 12, minGridZ: 0, maxGridZ: 4 },
			'+x',
			MIN_WIDTH,
			MIN_RUN
		);
		expect(result.valid).toBe(true);
	});

	it('rejects a direction that runs along the short axis', () => {
		const result = validateStairFootprint(
			{ minGridX: 0, maxGridX: 12, minGridZ: 0, maxGridZ: 4 },
			'+z',
			MIN_WIDTH,
			MIN_RUN
		);
		expect(result.valid).toBe(false);
	});

	it('rejects a footprint narrower than the minimum width', () => {
		const result = validateStairFootprint(
			{ minGridX: 0, maxGridX: 12, minGridZ: 0, maxGridZ: 1 },
			'+x',
			MIN_WIDTH,
			MIN_RUN
		);
		expect(result.valid).toBe(false);
	});

	it('rejects a footprint shorter than the minimum run', () => {
		const result = validateStairFootprint(
			{ minGridX: 0, maxGridX: 1, minGridZ: 0, maxGridZ: 4 },
			'+x',
			MIN_WIDTH,
			MIN_RUN
		);
		expect(result.valid).toBe(false);
	});

	it('rejects a zero-area footprint', () => {
		const result = validateStairFootprint(
			{ minGridX: 0, maxGridX: 0, minGridZ: 0, maxGridZ: 4 },
			'+x',
			MIN_WIDTH,
			MIN_RUN
		);
		expect(result.valid).toBe(false);
	});
});

describe('stairCanonicalToLocalXZ — direction bottom/top placement', () => {
	const bounds = { minLocalX: 0, maxLocalX: 3, minLocalZ: 0, maxLocalZ: 1 };

	it('+x: bottom at minLocalX, top at maxLocalX', () => {
		expect(stairCanonicalToLocalXZ(bounds, '+x', 0, 0)).toEqual({ x: 0, z: 0 });
		expect(stairCanonicalToLocalXZ(bounds, '+x', 3, 0)).toEqual({ x: 3, z: 0 });
	});

	it('-x: bottom at maxLocalX, top at minLocalX', () => {
		expect(stairCanonicalToLocalXZ(bounds, '-x', 0, 0)).toEqual({ x: 3, z: 0 });
		expect(stairCanonicalToLocalXZ(bounds, '-x', 3, 0)).toEqual({ x: 0, z: 0 });
	});

	it('+z: bottom at minLocalZ, top at maxLocalZ', () => {
		const zBounds = { minLocalX: 0, maxLocalX: 1, minLocalZ: 0, maxLocalZ: 3 };
		expect(stairCanonicalToLocalXZ(zBounds, '+z', 0, 0)).toEqual({ x: 0, z: 0 });
		expect(stairCanonicalToLocalXZ(zBounds, '+z', 3, 0)).toEqual({ x: 0, z: 3 });
	});

	it('-z: bottom at maxLocalZ, top at minLocalZ', () => {
		const zBounds = { minLocalX: 0, maxLocalX: 1, minLocalZ: 0, maxLocalZ: 3 };
		expect(stairCanonicalToLocalXZ(zBounds, '-z', 0, 0)).toEqual({ x: 0, z: 3 });
		expect(stairCanonicalToLocalXZ(zBounds, '-z', 3, 0)).toEqual({ x: 0, z: 0 });
	});

	it('reversed direction on the SAME footprint keeps dimensions but swaps bottom/top', () => {
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		const reversedMetrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '-x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		expect(reversedMetrics.stepCount).toBe(metrics.stepCount);
		expect(reversedMetrics.totalRise).toBeCloseTo(metrics.totalRise);

		const localBounds = { minLocalX: 0, maxLocalX: 3, minLocalZ: 0, maxLocalZ: 1 };
		const forwardBottom = stairCanonicalToLocalXZ(localBounds, '+x', 0, 0);
		const reversedBottom = stairCanonicalToLocalXZ(localBounds, '-x', 0, 0);
		expect(forwardBottom.x).not.toBeCloseTo(reversedBottom.x);
	});
});

describe('stairTreadRectsLocal', () => {
	it('produces one rect per step, each topLocalY (i + 1) * stepRise above baseY', () => {
		const bounds = { minLocalX: 0, maxLocalX: 1, minLocalZ: 0, maxLocalZ: 1 };
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 4,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		const rects = stairTreadRectsLocal(bounds, '+x', 0, metrics);
		expect(rects).toHaveLength(4);
		expect(rects[0].topLocalY).toBeCloseTo(0.25);
		expect(rects[3].topLocalY).toBeCloseTo(1.0);
	});

	it('the last tread rect reaches the footprint edge (flush with an upper floor)', () => {
		const bounds = { minLocalX: 0, maxLocalX: 1, minLocalZ: 0, maxLocalZ: 1 };
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 4,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		const rects = stairTreadRectsLocal(bounds, '+x', 0, metrics);
		expect(rects[rects.length - 1].maxX).toBeCloseTo(1.0);
	});
});

describe('stairSideRectsLocal', () => {
	it('runs the full length for an X-axis stair, independent of direction sign', () => {
		const bounds = { minLocalX: 0, maxLocalX: 3, minLocalZ: 0, maxLocalZ: 1 };
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		const rects = stairSideRectsLocal(bounds, metrics);
		expect(rects).toHaveLength(2);
		for (const rect of rects) {
			expect(rect.halfLength).toBeCloseTo(1.5);
			expect(rect.dirX).toBe(1);
			expect(rect.dirZ).toBe(0);
		}
	});

	it('sits entirely OUTSIDE the footprint width, never encroaching on the walkable tread area (regression: previously centered ON the boundary, narrowing every stair by 2 * (halfThickness + player radius) and making narrow stairs unwalkable)', () => {
		const bounds = { minLocalX: 0, maxLocalX: 3, minLocalZ: 0, maxLocalZ: 1 };
		const metrics = computeStairMetrics({
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			direction: '+x',
			gridSizeAtCreation: 0.25,
			baseY: 0
		});
		const [near, far] = stairSideRectsLocal(bounds, metrics);
		// The near strip's inner face (closest to the footprint) must be at or outside minLocalZ —
		// never intruding past it.
		expect(near.centerZ + near.halfThickness).toBeLessThanOrEqual(bounds.minLocalZ + 1e-9);
		// The far strip's inner face must be at or outside maxLocalZ.
		expect(far.centerZ - far.halfThickness).toBeGreaterThanOrEqual(bounds.maxLocalZ - 1e-9);
	});
});

describe('stairDirectionFlipsWinding', () => {
	it('flags exactly the two directions whose remap is a reflection', () => {
		expect(stairDirectionFlipsWinding('+x')).toBe(false);
		expect(stairDirectionFlipsWinding('-x')).toBe(true);
		expect(stairDirectionFlipsWinding('+z')).toBe(true);
		expect(stairDirectionFlipsWinding('-z')).toBe(false);
	});
});
