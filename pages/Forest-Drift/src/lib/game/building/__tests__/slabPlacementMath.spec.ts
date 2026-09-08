import { describe, expect, it } from 'vitest';
import {
	clampSlabPlacementHeight,
	resolveSlabPlacementHeightAboveFloor,
	resolveSlabPlacementLocalY,
	SLAB_PLACEMENT_HEIGHT_MAX,
	SLAB_PLACEMENT_HEIGHT_MIN
} from '../slabPlacementMath';

describe('clampSlabPlacementHeight', () => {
	it('clamps to 0–12 and treats non-finite values as the minimum', () => {
		expect(clampSlabPlacementHeight(-1)).toBe(SLAB_PLACEMENT_HEIGHT_MIN);
		expect(clampSlabPlacementHeight(20)).toBe(SLAB_PLACEMENT_HEIGHT_MAX);
		expect(clampSlabPlacementHeight(Number.NaN)).toBe(SLAB_PLACEMENT_HEIGHT_MIN);
		expect(clampSlabPlacementHeight(2.5)).toBe(2.5);
	});
});

describe('resolveSlabPlacementHeightAboveFloor', () => {
	it('follows wall height when slabPlacementFollowWalls is true', () => {
		expect(
			resolveSlabPlacementHeightAboveFloor(3, {
				slabPlacementFollowWalls: true,
				slabPlacementHeight: 1
			})
		).toBe(3);
	});

	it('uses the custom height when follow-walls is off', () => {
		expect(
			resolveSlabPlacementHeightAboveFloor(3, {
				slabPlacementFollowWalls: false,
				slabPlacementHeight: 1.25
			})
		).toBe(1.25);
	});

	it('never returns a negative wall-follow height', () => {
		expect(
			resolveSlabPlacementHeightAboveFloor(-2, {
				slabPlacementFollowWalls: true,
				slabPlacementHeight: 4
			})
		).toBe(0);
	});
});

describe('resolveSlabPlacementLocalY', () => {
	it('is the storey floor plus the resolved height', () => {
		expect(
			resolveSlabPlacementLocalY(
				{ baseY: 3, wallHeight: 2.5 },
				{ slabPlacementFollowWalls: true, slabPlacementHeight: 9 }
			)
		).toBe(5.5);
		expect(
			resolveSlabPlacementLocalY(
				{ baseY: 3, wallHeight: 2.5 },
				{ slabPlacementFollowWalls: false, slabPlacementHeight: 0.5 }
			)
		).toBe(3.5);
	});
});
