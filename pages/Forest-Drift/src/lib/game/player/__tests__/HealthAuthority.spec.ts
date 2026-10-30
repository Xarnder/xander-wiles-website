import { describe, expect, it } from 'vitest';
import { LocalHealthAuthority, type HealthEvents } from '../HealthAuthority';
import type { DamageSource, HealthSnapshot } from '../PlayerHealth';

function setup(saved?: unknown) {
	const clock = { now: 0 };
	const log = {
		changes: [] as HealthSnapshot[],
		damage: [] as { amount: number; source: DamageSource }[],
		deaths: [] as (DamageSource | null)[]
	};
	const events: HealthEvents = {
		change: (snapshot) => log.changes.push(snapshot),
		damaged: (amount, source) => log.damage.push({ amount, source }),
		death: (source) => log.deaths.push(source)
	};
	const authority = new LocalHealthAuthority(() => clock.now, events, saved);
	return { authority, clock, log };
}

describe('LocalHealthAuthority', () => {
	it('publishes the first snapshot and then only real changes', () => {
		const { authority, clock, log } = setup();
		authority.poll();
		authority.poll();
		clock.now = 5000;
		authority.poll();
		expect(log.changes).toHaveLength(1);
		expect(log.changes[0].current).toBe(36);
	});

	it('applies the fall curve after the grace period', () => {
		const { authority, clock, log } = setup();
		authority.reportFall(10);
		expect(log.damage).toHaveLength(0);
		clock.now = 2000;
		authority.reportFall(10);
		expect(log.damage).toEqual([{ amount: 12, source: { kind: 'fall', distance: 10 } }]);
		expect(authority.snapshot().current).toBe(24);
	});

	it('fires death once, ignores falls while dead, and respawns full with grace', () => {
		const { authority, clock, log } = setup();
		clock.now = 2000;
		authority.reportFall(30);
		authority.reportFall(30);
		authority.poll();
		expect(log.deaths).toEqual([{ kind: 'fall', distance: 30 }]);
		expect(authority.snapshot().dead).toBe(true);

		authority.requestRespawn();
		expect(authority.snapshot()).toMatchObject({ current: 36, dead: false });
		authority.reportFall(30);
		expect(authority.snapshot().current).toBe(36);
	});

	it('restores and saves whole points, saving a death as full health', () => {
		const { authority, clock } = setup(20);
		expect(authority.savedValue()).toBe(20);
		clock.now = 2000;
		authority.reportFall(100);
		expect(authority.savedValue()).toBe(36);
	});

	it('only respawns when dead', () => {
		const { authority, clock } = setup();
		clock.now = 2000;
		authority.reportFall(10);
		authority.requestRespawn();
		expect(authority.snapshot().current).toBe(24);
	});
});
