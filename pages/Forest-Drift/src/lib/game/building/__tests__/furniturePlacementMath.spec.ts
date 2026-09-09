import { describe, expect, it } from 'vitest';
import {
	aabbOverlap,
	aabbOverlapsWallRect,
	cycleFurnitureRotation,
	furnitureCollisionRect,
	furnitureFootprintCorners,
	furnitureWorldAabb,
	rotatedFootprint,
	snapFurnitureRotation,
	snapWorldToGrid,
	supportSpreadOk
} from '../furniturePlacementMath';
import type { WallCollisionRect } from '../wallCollision';

describe('furniture placement math', () => {
	it('snaps X/Z to the building grid', () => {
		expect(snapWorldToGrid(1.12, 0.25)).toBeCloseTo(1.0);
		expect(snapWorldToGrid(1.13, 0.25)).toBeCloseTo(1.25);
	});

	it('cycles yaw through 0/90/180/270', () => {
		let yaw = 0;
		const degrees: number[] = [];
		for (let i = 0; i < 4; i++) {
			yaw = cycleFurnitureRotation(yaw);
			degrees.push((((snapFurnitureRotation(yaw) * 180) / Math.PI) % 360 + 360) % 360);
		}
		expect(degrees).toEqual([90, 180, 270, 0]);
	});

	it('swaps width and depth at 90°', () => {
		const aligned = rotatedFootprint(2, 0.6, 0);
		const rotated = rotatedFootprint(2, 0.6, Math.PI / 2);
		expect(aligned.halfX).toBeCloseTo(1);
		expect(aligned.halfZ).toBeCloseTo(0.3);
		expect(rotated.halfX).toBeCloseTo(0.3);
		expect(rotated.halfZ).toBeCloseTo(1);
	});

	it('rejects overlapping furniture AABBs and allows a small gap', () => {
		const a = furnitureWorldAabb(0, 0, 0, 1, 1, 1, 0);
		const overlapping = furnitureWorldAabb(0.2, 0, 0, 1, 1, 1, 0);
		const beside = furnitureWorldAabb(1.2, 0, 0, 1, 1, 1, 0);
		expect(aabbOverlap(a, overlapping, 0.03)).toBe(true);
		expect(aabbOverlap(a, beside, 0.03)).toBe(false);
	});

	it('lets furniture sit against a wall with tiny clearance', () => {
		const wall: WallCollisionRect = {
			centerX: 0,
			centerZ: -0.5,
			halfLength: 2,
			halfThickness: 0.075,
			dirX: 1,
			dirZ: 0,
			minWorldY: 0,
			maxWorldY: 3
		};
		const flushBed = furnitureWorldAabb(0, 0, 0.3, 1.4, 0.55, 0.55, 0);
		expect(aabbOverlapsWallRect(flushBed, wall, 0.02)).toBe(false);
		const intersecting = furnitureWorldAabb(0, 0, -0.5, 1.4, 1, 0.55, 0);
		expect(aabbOverlapsWallRect(intersecting, wall, 0.02)).toBe(true);
	});

	it('treats four-corner support as valid when the spread is small', () => {
		expect(supportSpreadOk([10, 10.05, 10.1, 10.02], 0.22)).toBe(true);
		expect(supportSpreadOk([10, 10.5, 10.1, 10.02], 0.22)).toBe(false);
	});

	it('builds a player collision rect for solid furniture and skips lights', () => {
		const rect = furnitureCollisionRect(2, 1, 3, 1.4, 0.8, 0.75, 0, 'box');
		expect(rect).not.toBeNull();
		expect(rect!.centerX).toBe(2);
		expect(rect!.maxWorldY).toBeCloseTo(1.75);
		expect(furnitureCollisionRect(0, 0, 0, 0.2, 0.2, 0.4, 0, 'none')).toBeNull();
	});

	it('returns four footprint corners', () => {
		expect(furnitureFootprintCorners(0, 0, 2, 1, 0)).toHaveLength(4);
	});
});
