import { describe, expect, it } from 'vitest';
import {
	CHARGES_MAX,
	CHARGE_REGEN_MS,
	MIN_SHOT_GAP_MS,
	PROJECTILE_GRAVITY,
	PROJECTILE_SPEED,
	canSpendCharge,
	chargesAt,
	createChargeState,
	nextChargeInMs,
	projectileLifetimeMs,
	projectilePositionAt,
	shotHitPlausible,
	shotOriginPlausible,
	spendCharge,
	sweepBody,
	type ChargeState
} from '../creatureProjectile';

const origin = { x: 0, y: 1.5, z: 0 };
const forward = { x: 0, y: 0, z: -1 };

describe('pellet flight', () => {
	it('follows a closed-form light arc', () => {
		const p = projectilePositionAt(origin, forward, 1000);
		expect(p.z).toBeCloseTo(-PROJECTILE_SPEED);
		expect(p.y).toBeCloseTo(1.5 - PROJECTILE_GRAVITY / 2);
		expect(projectilePositionAt(origin, forward, -50)).toEqual({ x: 0, y: 1.5, z: 0 });
	});

	it('lives for 30 m of flight', () => {
		expect(projectileLifetimeMs()).toBeCloseTo((30 / PROJECTILE_SPEED) * 1000);
	});
});

describe('pellet vs body', () => {
	const feet = { x: 0, y: 0, z: -10 };

	it('hits a body straight ahead at about the right time', () => {
		const t = sweepBody(origin, forward, 0, 1000, feet);
		expect(t).not.toBeNull();
		expect(t!).toBeGreaterThan(250);
		expect(t!).toBeLessThan(290);
	});

	it("can't tunnel through a body in one long (15 fps) step", () => {
		expect(sweepBody(origin, forward, 270, 270 + 1000 / 15, feet)).not.toBeNull();
	});

	it('misses beside, above and behind', () => {
		expect(sweepBody(origin, forward, 0, 1000, { x: 0.7, y: 0, z: -10 })).toBeNull();
		expect(sweepBody({ x: 0, y: 2.6, z: 0 }, forward, 0, 1000, feet)).toBeNull();
		expect(sweepBody(origin, forward, 0, 1000, { x: 0, y: 0, z: 10 })).toBeNull();
	});

	it('counts a graze within the generous radius', () => {
		expect(sweepBody(origin, forward, 0, 1000, { x: 0.5, y: 0, z: -10 })).not.toBeNull();
	});
});

describe('charges', () => {
	it('starts full and allows the first shot at once', () => {
		const state = createChargeState(0);
		expect(chargesAt(state, 0)).toBe(CHARGES_MAX);
		expect(canSpendCharge(state, 0)).toBe(true);
	});

	it('enforces the minimum gap between shots', () => {
		const one = spendCharge(createChargeState(0), 0)!;
		expect(spendCharge(one, MIN_SHOT_GAP_MS - 1)).toBeNull();
		expect(spendCharge(one, MIN_SHOT_GAP_MS)).not.toBeNull();
	});

	it('empties after five shots, then regains one every 1.5 s without losing phase', () => {
		let state: ChargeState = createChargeState(0);
		let now = 0;
		for (let i = 0; i < CHARGES_MAX; i++) {
			state = spendCharge(state, now)!;
			now += MIN_SHOT_GAP_MS;
		}
		const emptyAt = now - MIN_SHOT_GAP_MS;
		expect(chargesAt(state, emptyAt)).toBe(0);
		expect(canSpendCharge(state, emptyAt + MIN_SHOT_GAP_MS - 1)).toBe(false);
		// Regeneration counts from the first shot that left the bar below full.
		expect(chargesAt(state, CHARGE_REGEN_MS - 1)).toBe(0);
		expect(chargesAt(state, CHARGE_REGEN_MS)).toBe(1);
		const later = CHARGE_REGEN_MS + 300; // past the minimum gap after the fifth shot
		expect(nextChargeInMs(state, later)).toBe(CHARGE_REGEN_MS - 300);
		const after = spendCharge(state, later)!;
		expect(chargesAt(after, later)).toBe(0);
		expect(chargesAt(after, 2 * CHARGE_REGEN_MS)).toBe(1);
		expect(chargesAt(after, 100 * CHARGE_REGEN_MS)).toBe(CHARGES_MAX);
	});
});

describe("the room's checks", () => {
	it('accepts a pellet leaving from near the eye, not from across the field', () => {
		const feet = { x: 0, y: 0, z: 0 };
		expect(shotOriginPlausible(feet, { x: -0.3, y: 1.2, z: -0.5 })).toBe(true);
		expect(shotOriginPlausible(feet, { x: 0, y: 1.6, z: -3.4 })).toBe(true);
		expect(shotOriginPlausible(feet, { x: 0, y: 1.6, z: -5 })).toBe(false);
		expect(shotOriginPlausible(feet, { x: 0, y: 8, z: 0 })).toBe(false);
	});

	it('believes hits where the path met the body, with slack for lag', () => {
		const shot = { origin: { x: 0, y: 1.5, z: 0 }, dir: { x: 0, y: 0, z: -1 }, firedAt: 1000 };
		const at10m = 1000 + (10 / PROJECTILE_SPEED) * 1000;
		expect(shotHitPlausible(shot, { x: 0, y: 0, z: -10 }, at10m)).toBe(true);
		expect(shotHitPlausible(shot, { x: 2.5, y: 0, z: -10 }, at10m)).toBe(true);
		expect(shotHitPlausible(shot, { x: 6, y: 0, z: -10 }, at10m)).toBe(false);
		expect(shotHitPlausible(shot, { x: 0, y: 6, z: -10 }, at10m)).toBe(false);
		expect(shotHitPlausible(shot, { x: 0, y: 0, z: -10 }, 900)).toBe(false);
		expect(shotHitPlausible(shot, { x: 0, y: 0, z: -10 }, 1000 + 5000)).toBe(false);
	});
});
