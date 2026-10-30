import { describe, expect, it } from 'vitest';
import { RoomHealthAuthority, type RoomHealthPort } from '../RoomHealthAuthority';
import { createHealthState, damageHealth, type HealthSnapshot } from '../../player/PlayerHealth';

function setup() {
	const net = {
		now: Number.NaN,
		connected: true,
		falls: [] as { id: number; distance: number; at: number }[],
		respawns: 0
	};
	const port: RoomHealthPort = {
		connected: () => net.connected,
		serverNow: () => net.now,
		sendFall: (id, distance, at) => {
			if (!net.connected) return false;
			net.falls.push({ id, distance, at });
			return true;
		},
		sendRespawn: () => {
			net.respawns++;
			return true;
		}
	};
	const changes: HealthSnapshot[] = [];
	const deaths: unknown[] = [];
	const authority = new RoomHealthAuthority(port, {
		change: (snapshot) => changes.push(snapshot),
		damaged: () => {},
		death: (source) => deaths.push(source)
	});
	return { authority, net, changes, deaths };
}

describe('RoomHealthAuthority', () => {
	it('shows full health before the room has said anything, even with no clock yet', () => {
		const { authority } = setup();
		expect(authority.snapshot()).toMatchObject({ current: 36, dead: false });
		expect(authority.savedValue()).toBeUndefined();
	});

	it('predicts a hit at once, reports it on the room clock, then takes the room value', () => {
		const { authority, net } = setup();
		net.now = 10_000;
		authority.applyServer(createHealthState(0));
		authority.reportFall(10);
		expect(authority.snapshot().current).toBe(24);
		expect(net.falls).toEqual([{ id: 1, distance: 10, at: 10_000 }]);

		// The room capped it (say it saw a shorter drop): its value wins.
		authority.applyServer(damageHealth(createHealthState(0), 4, 10_000).state);
		expect(authority.snapshot().current).toBe(32);
	});

	it('forgives falls while disconnected and sends nothing', () => {
		const { authority, net } = setup();
		net.now = 10_000;
		authority.applyServer(createHealthState(0));
		net.connected = false;
		authority.reportFall(30);
		expect(authority.snapshot().current).toBe(36);
		expect(net.falls).toHaveLength(0);
	});

	it('does not report falls that cost nothing (grace, short drops)', () => {
		const { authority, net } = setup();
		net.now = 1000;
		authority.applyServer(createHealthState(0));
		authority.reportFall(10);
		authority.reportFall(3);
		expect(net.falls).toHaveLength(0);
	});

	it('dies on the predicted hit, respawns optimistically, and only asks the room when dead', () => {
		const { authority, net, deaths } = setup();
		net.now = 10_000;
		authority.applyServer(createHealthState(0));
		authority.requestRespawn();
		expect(net.respawns).toBe(0);
		authority.reportFall(40);
		expect(authority.snapshot().dead).toBe(true);
		expect(deaths).toHaveLength(1);
		// Not before the 3 s respawn delay (on the room clock).
		expect(authority.requestRespawn()).toBe(false);
		expect(net.respawns).toBe(0);
		net.now = 13_000;
		expect(authority.requestRespawn()).toBe(true);
		expect(net.respawns).toBe(1);
		expect(authority.snapshot()).toMatchObject({ current: 36, dead: false });
	});

	it('closes a predicted death when the room says the player is alive', () => {
		const { authority, net } = setup();
		net.now = 10_000;
		authority.applyServer(createHealthState(0));
		authority.reportFall(40);
		authority.applyServer(createHealthState(0));
		expect(authority.snapshot().dead).toBe(false);
	});

	it('regenerates on the room clock without any messages', () => {
		const { authority, net } = setup();
		net.now = 10_000;
		authority.applyServer(damageHealth(createHealthState(0), 12, 10_000).state);
		net.now = 21_000;
		expect(authority.snapshot().current).toBe(25);
	});
});

describe('RoomHealthAuthority — hits from other players', () => {
	it('reports a punch from the room as damage with its source, and the knockout as death', () => {
		const damage: { amount: number; by?: number }[] = [];
		const deaths: unknown[] = [];
		const net = { now: 10_000 };
		const authority = new RoomHealthAuthority(
			{
				connected: () => true,
				serverNow: () => net.now,
				sendFall: () => true,
				sendRespawn: () => true
			},
			{
				change: () => {},
				damaged: (amount, source) =>
					damage.push({ amount, by: source.kind === 'player' ? source.by : undefined }),
				death: (source) => deaths.push(source)
			}
		);
		authority.applyServer(createHealthState(0));
		const punched = damageHealth(createHealthState(0), 2, 10_000).state;
		authority.applyServer(punched, { kind: 'player', by: 3 });
		expect(damage).toEqual([{ amount: 2, by: 3 }]);

		const out = damageHealth(punched, 40, 10_000).state;
		authority.applyServer(out, { kind: 'player', by: 3 });
		expect(deaths).toEqual([{ kind: 'player', by: 3 }]);
	});
});
