import { describe, expect, it } from 'vitest';
import {
	RoomCore,
	type AuthResult,
	type GraceEntry,
	type PlayerAttachment,
	type RoomConnection,
	type RoomPersistence,
	type RoomSessionState
} from '../RoomCore';
import {
	GENERATOR_VERSION,
	POSE_FLAGS,
	PROTOCOL_VERSION,
	encodePose,
	parseClientMessage,
	parseServerMessage,
	parseSharedEnvironment,
	type HelloMessage,
	type ServerJsonMessage,
	type SharedEnvironment
} from '../protocol';

/** Fast travel Phase 2: the room checks each trip and tells everyone else (plan §6). */

class FakeConnection implements RoomConnection {
	readonly json: ServerJsonMessage[] = [];
	closed: { code: number; reason: string } | null = null;
	attachment: PlayerAttachment | null = null;
	send(data: string | ArrayBuffer): void {
		if (typeof data === 'string') this.json.push(JSON.parse(data) as ServerJsonMessage);
	}
	close(code: number, reason: string): void {
		this.closed = { code, reason };
	}
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
	const role =
		hello.invite === 'owner-token-000000'
			? 'owner'
			: hello.invite === 'viewer-token-00000'
				? 'viewer'
				: 'editor';
	return { ok: true, role, capability: `cap.${hello.playerId}.${role}`, via: 'invite' };
}

function setup() {
	let now = 1_000_000;
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
		persistence: new MemoryPersistence(),
		restored: { session: null }
	});
	return { room, advance: (ms: number) => (now += ms), now: () => now };
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

function standAt(room: RoomCore, conn: RoomConnection, x: number, z: number, now: number) {
	room.onMessage(
		conn,
		encodePose({
			flags: POSE_FLAGS.grounded | POSE_FLAGS.teleport,
			seq: 0,
			sampleTime: now,
			x,
			y: 0,
			z,
			yaw: 0,
			pitch: 0
		})
	);
}

let messageId = 1;
function travel(
	room: RoomCore,
	conn: FakeConnection,
	from: [number, number, number],
	to: [number, number, number],
	id = messageId++
) {
	room.onMessage(conn, JSON.stringify({ t: 'travel', id, from, to }));
	return conn.all('travelResult').find((m) => m.id === id);
}

const rules = (fastTravel: boolean): SharedEnvironment => ({
	anchor: { roomSeconds: 0, timeOfDay: 0.4, weatherTime: 0 },
	sky: {},
	weather: {},
	rules: { fastTravel }
});

describe('RoomCore — fast travel', () => {
	it('lets a trip through and tells everyone else where it went', async () => {
		const { room, now } = setup();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		standAt(room, a, 10, 20, now());
		expect(travel(room, a, [11, 0, 20], [3000, 12, -400])).toMatchObject({ ok: true });
		const slotA = a.last('welcome')!.slot;
		expect(b.last('travelled')).toEqual({
			t: 'travelled',
			slot: slotA,
			from: [11, 0, 20],
			to: [3000, 12, -400]
		});
		// Not echoed to the traveller.
		expect(a.all('travelled')).toHaveLength(0);
		expect(room.stats.travelsGranted).toBe(1);
	});

	it("follows the owner's rule, which never stops the owner", async () => {
		const { room, advance, now } = setup();
		const owner = await join(room, 'player-owner', 'owner-token-000000');
		const editor = await join(room, 'player-edit');
		const viewer = await join(room, 'player-view', 'viewer-token-00000');
		for (const conn of [owner, editor, viewer]) standAt(room, conn, 0, 0, now());
		room.onMessage(owner, JSON.stringify({ t: 'env', env: rules(false) }));
		expect(travel(room, editor, [0, 0, 0], [500, 0, 0])).toMatchObject({
			ok: false,
			reason: 'rule'
		});
		expect(travel(room, viewer, [0, 0, 0], [500, 0, 0])).toMatchObject({
			ok: false,
			reason: 'rule'
		});
		expect(travel(room, owner, [0, 0, 0], [500, 0, 0])).toMatchObject({ ok: true });
		// Nobody hears about refused trips.
		expect(owner.all('travelled')).toHaveLength(0);
		expect(editor.all('travelled')).toHaveLength(1);
		advance(1500);
		room.onMessage(owner, JSON.stringify({ t: 'env', env: rules(true) }));
		expect(travel(room, viewer, [0, 0, 0], [500, 0, 0])).toMatchObject({ ok: true });
		expect(room.stats.travelsRefused).toBe(2);
	});

	it('is on by default, before the owner has changed any rule', async () => {
		const { room, now } = setup();
		const viewer = await join(room, 'player-view', 'viewer-token-00000');
		standAt(room, viewer, 0, 0, now());
		expect(travel(room, viewer, [0, 0, 0], [-800, 0, 900])).toMatchObject({ ok: true });
	});

	it('refuses a trip that starts away from the player, before any pose, or off the world', async () => {
		const { room, now } = setup();
		const a = await join(room, 'player-aaaa');
		expect(travel(room, a, [0, 0, 0], [500, 0, 0])).toMatchObject({ ok: false, reason: 'state' });
		standAt(room, a, 0, 0, now());
		expect(travel(room, a, [45, 0, 0], [500, 0, 0])).toMatchObject({
			ok: false,
			reason: 'state'
		});
		expect(travel(room, a, [0, 0, 0], [6e6, 0, 0])).toMatchObject({ ok: false, reason: 'state' });
		expect(travel(room, a, [20, 0, 10], [500, 0, 0])).toMatchObject({ ok: true });
	});

	it('refuses while knocked out', async () => {
		const { room, advance, now } = setup();
		const a = await join(room, 'player-aaaa');
		standAt(room, a, 0, 0, now());
		advance(2500);
		room.onMessage(a, JSON.stringify({ t: 'fall', id: 1, d: 40, at: now() }));
		expect(a.last('health')!.state.dead).toBe(true);
		expect(travel(room, a, [0, 0, 0], [500, 0, 0])).toMatchObject({ ok: false, reason: 'state' });
	});

	it('allows one trip a second, and ignores repeated or old message ids', async () => {
		const { room, advance, now } = setup();
		const a = await join(room, 'player-aaaa');
		standAt(room, a, 0, 0, now());
		expect(travel(room, a, [0, 0, 0], [500, 0, 0], 100)).toMatchObject({ ok: true });
		expect(travel(room, a, [0, 0, 0], [900, 0, 0], 101)).toMatchObject({
			ok: false,
			reason: 'busy'
		});
		// A resend of an id already answered gets no second answer.
		const answered = a.all('travelResult').length;
		travel(room, a, [0, 0, 0], [900, 0, 0], 101);
		travel(room, a, [0, 0, 0], [900, 0, 0], 50);
		expect(a.all('travelResult')).toHaveLength(answered);
		advance(1000);
		expect(travel(room, a, [0, 0, 0], [900, 0, 0], 102)).toMatchObject({ ok: true });
	});
});

describe('protocol — fast travel messages', () => {
	it('parses a trip and refuses malformed ones', () => {
		expect(
			parseClientMessage(JSON.stringify({ t: 'travel', id: 3, from: [1, 2, 3], to: [4, 5, 6] }))
		).toEqual({ t: 'travel', id: 3, from: [1, 2, 3], to: [4, 5, 6] });
		for (const bad of [
			{ t: 'travel', id: -1, from: [1, 2, 3], to: [4, 5, 6] },
			{ t: 'travel', id: 1, from: [1, 2], to: [4, 5, 6] },
			{ t: 'travel', id: 1, from: [1, 2, 3], to: [4, 'x', 6] },
			{ t: 'travel', id: 1, from: [1, 2, 3] }
		])
			expect(parseClientMessage(JSON.stringify(bad))).toBeNull();
	});

	it('reads the room answers and the owner rule', () => {
		expect(parseServerMessage(JSON.stringify({ t: 'travelResult', id: 1, ok: true }))?.t).toBe(
			'travelResult'
		);
		expect(
			parseServerMessage(
				JSON.stringify({ t: 'travelled', slot: 2, from: [0, 0, 0], to: [1, 1, 1] })
			)?.t
		).toBe('travelled');
		expect(parseSharedEnvironment(rules(false))?.rules).toEqual({ fastTravel: false });
	});
});
