import { describe, expect, it } from 'vitest';
import { resolveCircleAgainstLocalRect, resolvePlayerPositionAgainstWalls } from '../wallCollision';
import type { WallCollisionRect } from '../wallCollision';

describe('resolveCircleAgainstLocalRect', () => {
	it('returns null when the circle is clear of the rectangle', () => {
		expect(resolveCircleAgainstLocalRect(5, 5, 0.3, 2, 0.1)).toBeNull();
	});

	it('pushes a circle approaching from the thickness face straight back out', () => {
		// Rect spans u in [-2, 2], t in [-0.1, 0.1]. Circle sits just inside collision range on +t side.
		const result = resolveCircleAgainstLocalRect(0, 0.25, 0.3, 2, 0.1);
		expect(result).not.toBeNull();
		expect(result!.t).toBeCloseTo(0.1 + 0.3);
		expect(result!.u).toBeCloseTo(0);
	});

	it('pushes a circle near the rectangle end outward along the corner normal', () => {
		const result = resolveCircleAgainstLocalRect(2.15, 0.15, 0.3, 2, 0.1);
		expect(result).not.toBeNull();
		// Should end up outside both the U and T half-extents.
		expect(Math.abs(result!.u)).toBeGreaterThanOrEqual(2 - 1e-6);
		expect(Math.abs(result!.t)).toBeGreaterThanOrEqual(0.1 - 1e-6);
	});

	it('escapes a circle whose center is exactly inside the (thin) rectangle along the shallow thickness axis', () => {
		const result = resolveCircleAgainstLocalRect(0, 0, 0.3, 2, 0.1);
		expect(result).not.toBeNull();
		// halfThickness (0.1) is far shallower than halfLength (2), so it should escape via t.
		expect(Math.abs(result!.t)).toBeCloseTo(0.1 + 0.3);
		expect(result!.u).toBeCloseTo(0);
	});
});

function makeRect(overrides: Partial<WallCollisionRect> = {}): WallCollisionRect {
	return {
		centerX: 0,
		centerZ: 0,
		halfLength: 2,
		halfThickness: 0.075,
		dirX: 1,
		dirZ: 0,
		minWorldY: 17.4,
		maxWorldY: 20.4,
		...overrides
	};
}

describe('resolvePlayerPositionAgainstWalls', () => {
	it('leaves the player untouched far from any wall', () => {
		const result = resolvePlayerPositionAgainstWalls(50, 50, 17.5, 19, 0.35, [makeRect()]);
		expect(result.x).toBeCloseTo(50);
		expect(result.z).toBeCloseTo(50);
	});

	it('blocks the player from walking through a solid wall segment', () => {
		// Approaching the wall centered at (0,0) running along X, from just inside collision range on +Z.
		const result = resolvePlayerPositionAgainstWalls(0, 0.2, 17.5, 19, 0.35, [makeRect()]);
		// Player should be pushed to the +Z side of the wall, outside its thickness.
		expect(result.z).toBeGreaterThanOrEqual(0.075 + 0.35 - 1e-6);
	});

	it('ignores a rect whose vertical range does not overlap the player (e.g. above their head)', () => {
		const highRect = makeRect({ minWorldY: 30, maxWorldY: 33 });
		const result = resolvePlayerPositionAgainstWalls(0, 0.05, 17.5, 19, 0.35, [highRect]);
		expect(result.x).toBeCloseTo(0);
		expect(result.z).toBeCloseTo(0.05);
	});

	it('does not block the centre of a valid door opening', () => {
		// A wall with a door cut in the middle produces two solid rects (left/right of the door)
		// with a gap where the door is — exactly what WallManager derives from computeSolidWallSegments.
		const leftOfDoor = makeRect({ centerX: -2, halfLength: 1 }); // spans x in [-3, -1]
		const rightOfDoor = makeRect({ centerX: 2, halfLength: 1 }); // spans x in [1, 3]
		// Door gap is x in [-1, 1] — standing at the exact centre of the doorway.
		const result = resolvePlayerPositionAgainstWalls(0, 0, 17.5, 19, 0.35, [
			leftOfDoor,
			rightOfDoor
		]);
		expect(result.x).toBeCloseTo(0);
		expect(result.z).toBeCloseTo(0);
	});

	it('still blocks the solid parts beside a door opening', () => {
		const leftOfDoor = makeRect({ centerX: -2, halfLength: 1 });
		const rightOfDoor = makeRect({ centerX: 2, halfLength: 1 });
		// Standing right at the inner edge of the right-hand solid segment, just off centre-line.
		const result = resolvePlayerPositionAgainstWalls(1.1, 0.05, 17.5, 19, 0.35, [
			leftOfDoor,
			rightOfDoor
		]);
		expect(result.z).toBeGreaterThanOrEqual(0.075 + 0.35 - 1e-6);
	});
});
