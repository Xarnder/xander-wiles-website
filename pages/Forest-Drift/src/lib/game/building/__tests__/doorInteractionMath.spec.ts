import { describe, expect, it } from 'vitest';
import {
	CLOSED_DOOR_COLLISION_ANGLE,
	doorCollisionRect,
	doorLeafCollisionRect,
	doorOpenAngle,
	doorTargetAngle,
	pickDoorAlongRay,
	stepAngleToward
} from '../doorInteractionMath';
import { resolvePlayerPositionAgainstWalls } from '../wallCollision';

describe('doorOpenAngle', () => {
	it('swings left- and right-hinged leaves toward the same side of the wall', () => {
		expect(doorOpenAngle('left')).toBeCloseTo(Math.PI / 2, 9);
		expect(doorOpenAngle('right')).toBeCloseTo(-Math.PI / 2, 9);
	});

	it('closed target is always 0', () => {
		expect(doorTargetAngle('left', false)).toBe(0);
		expect(doorTargetAngle('right', false)).toBe(0);
		expect(doorTargetAngle('left', true)).toBe(doorOpenAngle('left'));
	});
});

describe('pickDoorAlongRay', () => {
	const origin = { x: 0, y: 1, z: 2 };
	const direction = { x: 0, y: 0, z: -1 };

	it('picks the nearest door on the look ray', () => {
		const id = pickDoorAlongRay(origin, direction, [
			{ id: 'far', aim: { x: 0, y: 1, z: -3 } },
			{ id: 'near', aim: { x: 0, y: 1, z: 0 } }
		]);
		expect(id).toBe('near');
	});

	it('ignores a door behind the camera or too far off to the side', () => {
		expect(
			pickDoorAlongRay(origin, direction, [{ id: 'behind', aim: { x: 0, y: 1, z: 4 } }])
		).toBeNull();
		expect(
			pickDoorAlongRay(origin, direction, [{ id: 'beside', aim: { x: 5, y: 1, z: 0 } }])
		).toBeNull();
	});
});

describe('stepAngleToward', () => {
	it('reaches the target when the remaining delta fits in one step', () => {
		expect(stepAngleToward(0, 1, 2)).toBe(1);
	});

	it('steps by at most maxStep', () => {
		expect(stepAngleToward(0, 2, 0.5)).toBeCloseTo(0.5, 9);
		expect(stepAngleToward(1, 0, 0.25)).toBeCloseTo(0.75, 9);
	});
});

describe('doorLeafCollisionRect', () => {
	it('closed leaf fills the span from the hinge along the wall', () => {
		const rect = doorLeafCollisionRect({
			hingeX: 1,
			hingeY: 10,
			hingeZ: 0,
			leafDirX: 1,
			leafDirZ: 0,
			width: 1,
			height: 2.1,
			halfThickness: 0.1
		});
		expect(rect).not.toBeNull();
		expect(rect!.centerX).toBeCloseTo(1.5);
		expect(rect!.centerZ).toBeCloseTo(0);
		expect(rect!.halfLength).toBeCloseTo(0.5);
		expect(rect!.dirX).toBeCloseTo(1);
		expect(rect!.dirZ).toBeCloseTo(0);
		expect(rect!.minWorldY).toBe(10);
		expect(rect!.maxWorldY).toBeCloseTo(12.1);
	});

	it('open leaf sits perpendicular to the wall', () => {
		const rect = doorLeafCollisionRect({
			hingeX: 1,
			hingeY: 10,
			hingeZ: 0,
			leafDirX: 0,
			leafDirZ: -1,
			width: 1,
			height: 2.1,
			halfThickness: 0.02
		});
		expect(rect).not.toBeNull();
		expect(rect!.centerX).toBeCloseTo(1);
		expect(rect!.centerZ).toBeCloseTo(-0.5);
		expect(rect!.dirX).toBeCloseTo(0);
		expect(rect!.dirZ).toBeCloseTo(-1);
	});

	it('returns null for a degenerate leaf', () => {
		expect(
			doorLeafCollisionRect({
				hingeX: 1,
				hingeY: 10,
				hingeZ: 0,
				leafDirX: 0,
				leafDirZ: 0,
				width: 1,
				height: 2.1,
				halfThickness: 0.1
			})
		).toBeNull();
	});
});

describe('doorCollisionRect', () => {
	const opening = {
		hingeX: 1,
		hingeY: 10,
		hingeZ: 0,
		leafDirX: 1,
		leafDirZ: 0,
		openingCenterX: 1.5,
		openingCenterZ: 0,
		openingMinY: 10,
		wallDirX: 1,
		wallDirZ: 0,
		openingWidth: 1,
		openingHeight: 2.1,
		leafWidth: 0.82,
		leafHeight: 2.0,
		wallHalfThickness: 0.1,
		leafHalfThickness: 0.02
	};

	it('seals the doorway while the leaf is still closed', () => {
		const rect = doorCollisionRect({ ...opening, angle: 0 });
		expect(rect).not.toBeNull();
		expect(rect!.centerX).toBeCloseTo(1.5);
		expect(rect!.centerZ).toBeCloseTo(0);
		expect(rect!.halfLength).toBeCloseTo(0.5);
		expect(rect!.halfThickness).toBeCloseTo(0.1);

		const blocked = resolvePlayerPositionAgainstWalls(1.5, 0, 10, 11.7, 0.35, [rect!]);
		expect(Math.abs(blocked.z)).toBeGreaterThan(0.05);
	});

	it('uses the swung leaf once the door is open so the hole is walkable', () => {
		const rect = doorCollisionRect({
			...opening,
			angle: Math.PI / 2,
			leafDirX: 0,
			leafDirZ: -1
		});
		expect(rect).not.toBeNull();
		expect(rect!.centerX).toBeCloseTo(1);
		expect(rect!.centerZ).toBeCloseTo(-0.41);

		const through = resolvePlayerPositionAgainstWalls(1.5, 0, 10, 11.7, 0.35, [rect!]);
		expect(through.x).toBeCloseTo(1.5);
		expect(through.z).toBeCloseTo(0);
	});

	it('keeps the doorway sealed until the hinge passes CLOSED_DOOR_COLLISION_ANGLE', () => {
		const stillClosed = doorCollisionRect({
			...opening,
			angle: CLOSED_DOOR_COLLISION_ANGLE
		});
		expect(stillClosed!.centerX).toBeCloseTo(1.5);
		expect(stillClosed!.halfThickness).toBeCloseTo(0.1);

		const openingUp = doorCollisionRect({
			...opening,
			angle: CLOSED_DOOR_COLLISION_ANGLE + 0.01,
			leafDirX: 0,
			leafDirZ: -1
		});
		expect(openingUp!.centerZ).toBeCloseTo(-0.41);
	});
});
