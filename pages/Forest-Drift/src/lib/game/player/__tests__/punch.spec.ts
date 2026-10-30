import { describe, expect, it } from 'vitest';
import { PUNCH_REACH, findPunchTarget, punchPlausible } from '../punch';

/** Yaw 0 faces −Z (FirstPersonController convention). Eye at 1.7 m above feet at the origin. */
const EYE = { x: 0, y: 1.7, z: 0 };
const ahead = (distance: number, slot = 1, sideways = 0, y = 0) => ({
	slot,
	x: sideways,
	y,
	z: -distance
});

describe('findPunchTarget', () => {
	it('connects with a player straight ahead within reach', () => {
		expect(findPunchTarget(EYE, 0, 0, [ahead(1.5)])).toBe(1);
	});

	it('misses players out of reach, behind, or off to the side', () => {
		expect(findPunchTarget(EYE, 0, 0, [ahead(PUNCH_REACH + 0.6)])).toBeNull();
		expect(findPunchTarget(EYE, Math.PI, 0, [ahead(1.5)])).toBeNull();
		expect(findPunchTarget(EYE, 0, 0, [ahead(1.5, 1, 1.2)])).toBeNull();
	});

	it('connects with a level look at someone standing a little downhill', () => {
		// The case that failed in the two-browser test: 1.5 m away, 0.45 m lower, looking slightly up.
		expect(findPunchTarget(EYE, 0, 0.07, [ahead(1.5, 2, 0, -0.45)])).toBe(2);
	});

	it('picks the nearest of two players in line', () => {
		expect(findPunchTarget(EYE, 0, 0, [ahead(2.2, 7), ahead(1.2, 3)])).toBe(3);
	});

	it('can punch a player a step below when looking down at them', () => {
		const below = ahead(1.2, 4, 0, -0.8);
		expect(findPunchTarget(EYE, 0, 0, [below])).toBeNull();
		expect(findPunchTarget(EYE, 0, -0.6, [below])).toBe(4);
	});
});

describe('punchPlausible', () => {
	const attacker = { x: 0, y: 0, z: 0, yaw: 0 };

	it('accepts a target in front, allowing for pose lag', () => {
		expect(punchPlausible(attacker, { x: 0, y: 0, z: -2 })).toBe(true);
		expect(punchPlausible(attacker, { x: 0, y: 0, z: -4.4 })).toBe(true);
	});

	it('refuses targets far away, far above or below, or behind', () => {
		expect(punchPlausible(attacker, { x: 0, y: 0, z: -6 })).toBe(false);
		expect(punchPlausible(attacker, { x: 0, y: 3, z: -1.5 })).toBe(false);
		expect(punchPlausible(attacker, { x: 0, y: 0, z: 2 })).toBe(false);
	});

	it("doesn't care about facing when the players overlap", () => {
		expect(punchPlausible(attacker, { x: 0, y: 0, z: 0.6 })).toBe(true);
	});
});
