import { describe, expect, it } from 'vitest';
import {
	LANDING_RINGS,
	LANDING_RING_STEP,
	TRAVEL_REFUSAL_TEXT,
	TravelMemory,
	findLanding,
	landingNote,
	travelPermission,
	type LandingWater,
	type TravelState
} from '../FastTravel';

const alone: TravelState = { knockedOut: false, travelling: false, mounting: false };

describe('travelPermission', () => {
	it('allows a trip when playing alone', () => {
		expect(travelPermission(alone)).toEqual({ ok: true });
	});

	it('refuses while knocked out, mid-trip or climbing on/off, in that order', () => {
		expect(travelPermission({ ...alone, knockedOut: true, travelling: true })).toEqual({
			ok: false,
			reason: 'knockedOut'
		});
		expect(travelPermission({ ...alone, travelling: true, mounting: true })).toEqual({
			ok: false,
			reason: 'busy'
		});
		expect(travelPermission({ ...alone, mounting: true })).toEqual({
			ok: false,
			reason: 'mounting'
		});
	});

	it("online: the owner's rule stops everyone but the owner", () => {
		const online = { connected: true, owner: false, ruleOn: false };
		expect(travelPermission({ ...alone, online })).toEqual({ ok: false, reason: 'ruleOff' });
		expect(travelPermission({ ...alone, online: { ...online, owner: true } })).toEqual({
			ok: true
		});
		expect(travelPermission({ ...alone, online: { ...online, ruleOn: true } })).toEqual({
			ok: true
		});
	});

	it('online: waits for the connection', () => {
		expect(
			travelPermission({ ...alone, online: { connected: false, owner: true, ruleOn: true } })
		).toEqual({ ok: false, reason: 'connecting' });
	});

	it('has a label for every refusal', () => {
		for (const text of Object.values(TRAVEL_REFUSAL_TEXT)) expect(text.length).toBeGreaterThan(3);
	});
});

/** A round lake of `radius` at (cx, cz): deep inside, dry from `radius` out. */
function lake(cx: number, cz: number, radius: number): LandingWater {
	const inside = (x: number, z: number) => Math.hypot(x - cx, z - cz) < radius;
	return { deep: inside, dry: (x, z) => !inside(x, z) };
}

describe('findLanding', () => {
	it('lands on the pin when it is not in deep water', () => {
		expect(findLanding(120, -40, lake(0, 0, 50))).toEqual({ x: 120, z: -40, moved: false });
	});

	it('moves to the nearest ring of dry ground', () => {
		const landing = findLanding(0, 0, lake(0, 0, 50));
		expect(landing.moved).toBe(true);
		const distance = Math.hypot(landing.x, landing.z);
		// The first ring past the shore: 56 m (four 14 m steps).
		expect(distance).toBeCloseTo(4 * LANDING_RING_STEP, 6);
	});

	it('finds the shore of an off-centre pin on the near side', () => {
		const landing = findLanding(30, 0, lake(0, 0, 50));
		expect(landing.moved).toBe(true);
		expect(Math.hypot(landing.x, landing.z)).toBeGreaterThanOrEqual(50);
		expect(Math.hypot(landing.x - 30, landing.z)).toBeLessThanOrEqual(3 * LANDING_RING_STEP + 1e-9);
	});

	it('stays on the pin past the last ring (open sea)', () => {
		const sea = lake(0, 0, LANDING_RINGS * LANDING_RING_STEP + 10);
		expect(findLanding(0, 0, sea)).toEqual({ x: 0, z: 0, moved: false });
	});

	it('works at very large coordinates', () => {
		const landing = findLanding(-200_000, 200_000, lake(-200_000, 200_000, 30));
		expect(landing.moved).toBe(true);
		expect(Math.hypot(landing.x + 200_000, landing.z - 200_000)).toBeCloseTo(42, 6);
	});
});

describe('landingNote', () => {
	it('warns only when the landing moved more than 10 m', () => {
		expect(landingNote({ x: 0, z: 0 }, { x: 0, z: 0, moved: false })).toBeNull();
		expect(landingNote({ x: 0, z: 0 }, { x: 6, z: 0, moved: true })).toBeNull();
		expect(landingNote({ x: 0, z: 0 }, { x: 56, z: 0, moved: true })).toBe('Lands on the shore');
	});
});

describe('TravelMemory', () => {
	const here = { x: 1, y: 2, z: 3, yaw: 0.5, pitch: -0.1, flying: false };

	it('remembers only the last trip, as a copy', () => {
		const memory = new TravelMemory();
		expect(memory.last).toBeNull();
		memory.remember(here);
		memory.remember({ ...here, x: 9, flying: true });
		expect(memory.last).toEqual({ ...here, x: 9, flying: true });
		const copy = { ...here };
		memory.remember(copy);
		copy.x = 100;
		expect(memory.last?.x).toBe(1);
	});

	it('ignores non-finite positions and can be cleared', () => {
		const memory = new TravelMemory();
		memory.remember(here);
		memory.remember({ ...here, y: Number.NaN });
		expect(memory.last).toEqual(here);
		memory.clear();
		expect(memory.last).toBeNull();
	});
});
