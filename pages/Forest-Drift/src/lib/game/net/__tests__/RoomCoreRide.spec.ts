import { describe, expect, it } from 'vitest';
import {
	RoomCore,
	maxSpeedForRunSpeed,
	type AuthResult,
	type GraceEntry,
	type PlayerAttachment,
	type RoomConnection,
	type RoomPersistence,
	type RoomSessionState
} from '../RoomCore';
import {
	CLIENT_LEAVE_CODE,
	GENERATOR_VERSION,
	POSE_FLAGS,
	PROTOCOL_VERSION,
	encodePose,
	type HelloMessage,
	type ServerJsonMessage
} from '../protocol';
import { generatePopulationCell } from '../../creatures/CreaturePopulationSystem';
import { abilityFor } from '../../creatures/creatureAbilities';
import { rideFor, rideTopSpeed } from '../../creatures/creatureRiding';
import type { CreatureWorldAccess } from '../../creatures/CreatureTypes';

/** Riding, Phase 3 (docs/2026/11-07/bipedal-speed-creature): the room decides who rides what. */

class FakeConnection implements RoomConnection {
	readonly json: ServerJsonMessage[] = [];
	attachment: PlayerAttachment | null = null;
	send(data: string | ArrayBuffer): void {
		if (typeof data === 'string') this.json.push(JSON.parse(data) as ServerJsonMessage);
	}
	close(): void {}
	setAttachment(attachment: PlayerAttachment | null): void {
		this.attachment = attachment;
	}
	last<T extends ServerJsonMessage['t']>(t: T): Extract<ServerJsonMessage, { t: T }> | undefined {
		return [...this.json].reverse().find((m) => m.t === t) as
			Extract<ServerJsonMessage, { t: T }> | undefined;
	}
	all<T extends ServerJsonMessage['t']>(t: T): Extract<ServerJsonMessage, { t: T }>[] {
		return this.json.filter((m) => m.t === t) as Extract<ServerJsonMessage, { t: T }>[];
	}
}

class MemoryPersistence implements RoomPersistence {
	grace: GraceEntry[] = [];
	session: RoomSessionState | null = null;
	saveGrace(entries: GraceEntry[]): void {
		this.grace = entries;
	}
	saveSessionState(state: RoomSessionState): void {
		this.session = structuredClone(state);
	}
	saveClock(): void {}
	saveEnv(): void {}
}

async function fakeAuthorize(hello: HelloMessage): Promise<AuthResult> {
	const role = hello.invite === 'viewer-token-00000' ? 'viewer' : 'editor';
	return { ok: true, role, capability: `cap.${hello.playerId}.${role}`, via: 'invite' };
}

const SEED = 'forest';
const RUN = 12;
const flat: CreatureWorldAccess = { surface: () => 0, blocked: () => false };

/** Real rideable (biped) and carryable ambient creatures of the test world, where they spawn. */
function creatures() {
	const bipeds: { id: string; x: number; z: number; height: number; sprint: number }[] = [];
	const small: { id: string; x: number; z: number }[] = [];
	for (let x = -8; x < 8 && bipeds.length < 4; x++)
		for (let z = -8; z < 8; z++)
			for (const spawn of generatePopulationCell(SEED, x, z, 1, flat)) {
				const definition = { species: spawn.species, individual: spawn.individual };
				const at = { id: spawn.id, x: spawn.position.x, z: spawn.position.z };
				const ride = rideFor(definition);
				if (ride)
					bipeds.push({ ...at, height: ride.height, sprint: rideTopSpeed(ride, RUN, true) });
				else if (abilityFor(definition)) small.push(at);
			}
	if (bipeds.length < 2 || small.length < 1) throw new Error('test world lacks creatures');
	return { bipeds, small };
}

function setup(options: { session?: RoomSessionState | null } = {}) {
	let now = 1_000_000;
	const persistence = new MemoryPersistence();
	const room = new RoomCore({
		world: {
			worldId: 'world-1234',
			name: 'Test',
			schemaVersion: 9,
			generatorVersion: GENERATOR_VERSION
		},
		now: () => now,
		fallDamage: true,
		authorize: fakeAuthorize,
		persistence,
		worldSeed: () => SEED,
		maxSpeed: maxSpeedForRunSpeed(RUN),
		restored: { session: options.session ?? null }
	});
	return { room, persistence, advance: (ms: number) => (now += ms), now: () => now };
}

async function join(room: RoomCore, playerId: string, invite = 'editor-token-00000') {
	const conn = new FakeConnection();
	await room.onMessage(
		conn,
		JSON.stringify({
			t: 'hello',
			protocol: PROTOCOL_VERSION,
			schemaVersion: 9,
			generatorVersion: GENERATOR_VERSION,
			build: 'test',
			playerId,
			name: playerId,
			colour: '#336699',
			invite,
			capability: null
		})
	);
	return conn;
}

function pose(
	room: RoomCore,
	conn: RoomConnection,
	x: number,
	z: number,
	at: number,
	teleport = false
) {
	room.onMessage(
		conn,
		encodePose({
			flags: POSE_FLAGS.grounded | (teleport ? POSE_FLAGS.teleport : POSE_FLAGS.moving),
			seq: 0,
			sampleTime: at,
			x,
			y: 0,
			z,
			yaw: 0,
			pitch: 0
		})
	);
}

let messageId = 1;
function ride(room: RoomCore, conn: FakeConnection, creature: string) {
	const id = messageId++;
	room.onMessage(conn, JSON.stringify({ t: 'ride', id, creature }));
	return conn.all('rideResult').find((m) => m.id === id);
}
function dismount(room: RoomCore, conn: FakeConnection, at: [number, number, number, number]) {
	room.onMessage(conn, JSON.stringify({ t: 'dismount', id: messageId++, at }));
}
function carry(room: RoomCore, conn: FakeConnection, creature: string) {
	const id = messageId++;
	room.onMessage(conn, JSON.stringify({ t: 'carry', id, creature }));
	return conn.all('carryResult').find((m) => m.id === id);
}

describe('RoomCore — riding creatures', () => {
	it('grants a nearby biped and tells everyone, including late joiners', async () => {
		const { room, now } = setup();
		const { bipeds } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		pose(room, a, bipeds[0].x, bipeds[0].z, now(), true);
		expect(ride(room, a, bipeds[0].id)).toMatchObject({ ok: true });
		const slotA = a.last('welcome')!.slot;
		expect(b.last('ridden')).toEqual({ t: 'ridden', slot: slotA, creature: bipeds[0].id });
		expect(a.all('ridden')).toHaveLength(0);
		const c = await join(room, 'player-cccc');
		expect(c.last('welcome')!.rides).toEqual([{ slot: slotA, creature: bipeds[0].id }]);
		expect(room.stats.ridesGranted).toBe(1);
	});

	it('gives a creature to the first claim only, and one mount per player', async () => {
		const { room, now } = setup();
		const { bipeds } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		pose(room, a, bipeds[0].x, bipeds[0].z, now(), true);
		pose(room, b, bipeds[0].x + 1, bipeds[0].z, now(), true);
		expect(ride(room, a, bipeds[0].id)?.ok).toBe(true);
		expect(ride(room, b, bipeds[0].id)).toMatchObject({ ok: false, reason: 'taken' });
		pose(room, a, bipeds[1].x, bipeds[1].z, now() + 1, true);
		expect(ride(room, a, bipeds[1].id)).toMatchObject({ ok: false, reason: 'state' });
	});

	it('refuses creatures that are far away, not bipeds, or malformed; viewers ride ambient ones', async () => {
		const { room, now } = setup();
		const { bipeds, small } = creatures();
		const v = await join(room, 'player-vvvv', 'viewer-token-00000');
		expect(ride(room, v, bipeds[0].id)).toMatchObject({ ok: false, reason: 'state' });
		pose(room, v, bipeds[0].x + 2000, bipeds[0].z, now(), true);
		expect(ride(room, v, bipeds[0].id)).toMatchObject({ ok: false, reason: 'far' });
		pose(room, v, small[0].x, small[0].z, now() + 1, true);
		expect(ride(room, v, small[0].id)).toMatchObject({ ok: false, reason: 'ineligible' });
		expect(ride(room, v, 'group:forest:nonsense')).toMatchObject({ reason: 'ineligible' });
		pose(room, v, bipeds[0].x, bipeds[0].z, now() + 2, true);
		expect(ride(room, v, bipeds[0].id)?.ok).toBe(true);
		expect(room.stats.ridesRefused).toBe(4);
	});

	it('lets a rider carry, and a carrier climb on (Q12 C), but never punch (Q13 A)', async () => {
		const { room, now, advance } = setup();
		const { bipeds, small } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		pose(room, a, small[0].x, small[0].z, now(), true);
		expect(carry(room, a, small[0].id)?.ok).toBe(true);
		pose(room, a, bipeds[0].x, bipeds[0].z, now() + 1, true);
		expect(ride(room, a, bipeds[0].id)?.ok).toBe(true);
		advance(3000);
		pose(room, b, bipeds[0].x + 1, bipeds[0].z, now(), true);
		room.onMessage(a, JSON.stringify({ t: 'punch', id: 1, target: b.last('welcome')!.slot }));
		expect(a.last('punchResult')).toMatchObject({ hit: false });
	});

	it('leaves the creature where the rider got off, or under the rider when that spot is too far', async () => {
		const { room, now } = setup();
		const { bipeds } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		const { x, z } = bipeds[0];
		pose(room, a, x, z, now(), true);
		ride(room, a, bipeds[0].id);
		dismount(room, a, [x + 4, 0, z, 1.2]);
		expect(a.last('ridden')).toMatchObject({ creature: null, at: [x + 4, 0, z, 1.2] });
		expect(b.last('ridden')).toMatchObject({ creature: null, at: [x + 4, 0, z, 1.2] });
		ride(room, a, bipeds[0].id);
		dismount(room, a, [x + 100, 0, z, 0]);
		// Poses travel as 32-bit floats.
		expect(b.last('ridden')!.at?.[0]).toBeCloseTo(x, 3);
		expect(room.stats.ridesReleased).toBe(2);
	});

	it('lets a creature ridden far from home be climbed onto again where it was left', async () => {
		const { room, now } = setup();
		const { bipeds } = creatures();
		const a = await join(room, 'player-aaaa');
		pose(room, a, bipeds[0].x, bipeds[0].z, now(), true);
		ride(room, a, bipeds[0].id);
		pose(room, a, bipeds[0].x + 3000, bipeds[0].z, now() + 1, true);
		dismount(room, a, [bipeds[0].x + 3000, 0, bipeds[0].z, 0]);
		expect(ride(room, a, bipeds[0].id)?.ok).toBe(true);
	});

	it('ends the ride when the rider is knocked out, sits down, or leaves after the grace period', async () => {
		const { room, now, advance } = setup();
		const { bipeds } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		pose(room, a, bipeds[0].x, bipeds[0].z, now(), true);
		ride(room, a, bipeds[0].id);
		advance(2500);
		room.onMessage(a, JSON.stringify({ t: 'fall', id: 1, d: 40, at: now() }));
		expect(a.last('health')!.state.dead).toBe(true);
		expect(b.last('ridden')).toMatchObject({ creature: null });

		const c = await join(room, 'player-cccc');
		pose(room, c, bipeds[1].x, bipeds[1].z, now(), true);
		ride(room, c, bipeds[1].id);
		room.onClose(c, 1006);
		expect(b.all('ridden').filter((m) => m.creature === null)).toHaveLength(1);
		advance(31_000);
		room.onAlarm();
		expect(b.all('ridden').filter((m) => m.creature === null)).toHaveLength(2);
	});

	it('releases at once on a deliberate leave', async () => {
		const { room, now } = setup();
		const { bipeds } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		pose(room, a, bipeds[0].x, bipeds[0].z, now(), true);
		ride(room, a, bipeds[0].id);
		room.onClose(a, CLIENT_LEAVE_CODE);
		expect(b.last('ridden')).toMatchObject({ creature: null });
	});

	it('survives the room sleeping: rides come back for players still here', async () => {
		const first = setup();
		const { bipeds } = creatures();
		const a = await join(first.room, 'player-aaaa');
		pose(first.room, a, bipeds[0].x, bipeds[0].z, first.now(), true);
		ride(first.room, a, bipeds[0].id);
		const saved = first.persistence.session!;
		expect(saved.rides).toEqual([{ playerId: 'player-aaaa', creature: bipeds[0].id }]);
		const woken = setup({ session: saved });
		woken.room.restore([{ conn: a, attachment: a.attachment }]);
		const b = await join(woken.room, 'player-bbbb');
		expect(b.last('welcome')!.rides).toEqual([
			{ slot: a.attachment!.slot, creature: bipeds[0].id }
		]);
		const empty = setup({ session: saved });
		empty.room.restore([]);
		const c = await join(empty.room, 'player-cccc');
		expect(c.last('welcome')!.rides).toEqual([]);
	});

	it("never rejects a giant's rider for speed at full sprint (Q3 B)", async () => {
		const { room, now } = setup();
		const { bipeds } = creatures();
		const fastest = Math.max(...bipeds.map((b) => b.sprint));
		expect(fastest).toBeLessThanOrEqual(maxSpeedForRunSpeed(RUN) - 4 + 1e-9);
		const a = await join(room, 'player-aaaa');
		const start = now();
		pose(room, a, 0, 0, start, true);
		// Ten poses a second for 20 s, each stamped up to 10 ms off.
		for (let i = 1; i <= 200; i++) {
			const t = start + i * 100;
			pose(room, a, (fastest * (t - start)) / 1000, 0, t + ((i * 37) % 21) - 10);
		}
		expect(room.stats.posesRejected).toBe(0);
	});

	it('checks a sprinting rider’s pellets against where they had got to, not where they were', async () => {
		const { room, now, advance } = setup();
		const { bipeds, small } = creatures();
		const a = await join(room, 'player-aaaa');
		const walker = await join(room, 'player-wwww');
		const shootAhead = async (conn: FakeConnection, rides: boolean) => {
			const base = rides ? bipeds[0] : small[0];
			pose(room, conn, small[0].x, small[0].z, now(), true);
			carry(room, conn, conn === a ? small[0].id : (small[1] ?? small[0]).id);
			if (rides) {
				pose(room, conn, base.x, base.z, now() + 1, true);
				ride(room, conn, bipeds[0].id);
			}
			advance(2500);
			// Running along +X at 18 m/s; the pellet leaves 250 ms after the last pose.
			const t0 = now();
			for (let i = 0; i <= 5; i++) pose(room, conn, base.x + 1.8 * i, base.z, t0 + i * 100);
			const last = t0 + 500;
			const x = base.x + 1.8 * 5 + 18 * 0.25;
			room.onMessage(
				conn,
				JSON.stringify({
					t: 'shoot',
					shot: 1,
					origin: [x, 1.4, base.z],
					dir: [1, 0, 0],
					at: last + 250
				})
			);
			return conn.last('shotResult');
		};
		expect(await shootAhead(a, true)).toBeUndefined();
		expect(room.stats.mountedShots).toBe(1);
		// The same lead from a shooter on foot is too far from their last pose.
		expect(await shootAhead(walker, false)).toMatchObject({ refused: true });
	});
});
