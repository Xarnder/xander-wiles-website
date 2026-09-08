import { describe, expect, it } from 'vitest';
import {
	FURNITURE_SURFACE_OFFSET,
	TORCH_FLAME_HEIGHT,
	facingNormal,
	furnitureBasis,
	furnitureOrigin,
	torchLightWorldPosition
} from '../furnitureMath';

describe('facingNormal', () => {
	it('keeps a hit normal that already faces the player', () => {
		const n = facingNormal({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 });
		expect(n).toEqual({ x: 0, y: 0, z: 1 });
	});

	it('flips a hit normal that points into the surface (away from the player)', () => {
		const n = facingNormal({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -1 });
		expect(n).not.toBeNull();
		expect(n!.x).toBeCloseTo(0);
		expect(n!.y).toBeCloseTo(0);
		expect(n!.z).toBeCloseTo(1);
	});
});

describe('furnitureBasis', () => {
	it('stands a floor torch along the surface normal', () => {
		const basis = furnitureBasis({ x: 0, y: 1, z: 0 });
		expect(basis).not.toBeNull();
		expect(basis!.y.y).toBeCloseTo(1);
	});

	it('keeps a wall torch world-up with its back toward the wall', () => {
		const basis = furnitureBasis({ x: 0, y: 0, z: 1 });
		expect(basis).not.toBeNull();
		expect(basis!.y).toEqual({ x: 0, y: 1, z: 0 });
		expect(basis!.z.z).toBeCloseTo(-1);
	});
});

describe('furnitureOrigin', () => {
	it('offsets the mount along the facing normal', () => {
		const origin = furnitureOrigin({ x: 10, y: 4, z: 2 }, { x: 0, y: 0, z: 1 });
		expect(origin.x).toBeCloseTo(10);
		expect(origin.y).toBeCloseTo(4);
		expect(origin.z).toBeCloseTo(2 + FURNITURE_SURFACE_OFFSET);
	});
});

describe('torchLightWorldPosition', () => {
	it('sits the light at the flame on a floor mount', () => {
		const light = torchLightWorldPosition({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 });
		expect(light.y).toBeCloseTo(1 + TORCH_FLAME_HEIGHT);
	});

	it('sits the light above a wall mount, not into the wall', () => {
		const light = torchLightWorldPosition({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 1 });
		expect(light.x).toBeCloseTo(0);
		expect(light.y).toBeCloseTo(2 + TORCH_FLAME_HEIGHT);
		expect(light.z).toBeCloseTo(0);
	});
});
