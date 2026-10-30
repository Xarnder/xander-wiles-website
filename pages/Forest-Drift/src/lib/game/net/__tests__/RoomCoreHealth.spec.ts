import { describe, expect, it } from 'vitest';
import {
	RoomCore,
	type AuthResult,
	type GraceEntry,
	type RoomConnection,
	type RoomPersistence,
	type StoredHealth
} from '../RoomCore';
import {
	CLIENT_LEAVE_CODE,
	GENERATOR_VERSION,
	POSE_FLAGS,
	PROTOCOL_VERSION,
	encodePose,
	type HelloMessage,
	type PlayerBookmark,
	type ServerJsonMessage,
	type SharedEnvironment
} from '../protocol';
import { healthAt } from '../../player/PlayerHealth';

/** Same fakes as RoomCore.spec.ts, trimmed to what health needs. */
class FakeConnection implements RoomConnection {
	readonly json: ServerJsonMessage[] = [];
	closed: { code: number; reason: string } | null = null;
	send(data: string | ArrayBuffer): void {
		if (typeof data === 'string') this.json.push(JSON.parse(data) as ServerJsonMessage);
	}
	close(code: number, reason: string): void {
		this.closed = { code, reason };
	}
	setAttachment(): void {}
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
	health = new Map<string, StoredHealth>();
	bookmarks = new Map<string, PlayerBookmark | null>();
	healthWrites = 0;
	saveGrace(entries: GraceEntry[]): void {
		this.grace = entries;
	}
	saveClock(): void {}
	saveEnv(): void {}
	savePlayer(playerId: string, _name: string, bookmark: PlayerBookmark | null): void {
		this.bookmarks.set(playerId, bookmark);
	}
	loadPlayer(playerId: string) {
		return this.bookmarks.has(playerId)
			? { name: 'x', bookmark: this.bookmarks.get(playerId) ?? null }
			: null;
	}
	savePlayerHealth(playerId: string, health: StoredHealth | null): void {
		this.healthWrites++;
		if (health) this.health.set(playerId, { ...health });
		else this.health.delete(playerId);
	}
	loadPlayerHealth(playerId: string): StoredHealth | null {
		return this.health.get(playerId) ?? null;
	}
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

function setup(options: { fallDamage?: boolean; persistence?: MemoryPersistence } = {}) {
	let now = 1_000_000;
	const persistence = options.persistence ?? new MemoryPersistence();
	const room = new RoomCore({
		world: {
			worldId: 'world-1234',
			name: 'Test',
			schemaVersion: 9,
			generatorVersion: GENERATOR_VERSION
		},
		now: () => now,
		fallDamage: options.fallDamage ?? true,
		authorize: fakeAuthorize,
		persistence
	});
	return { room, persistence, advance: (ms: number) => (now += ms), now: () => now };
}

async function join(room: RoomCore, playerId: string, owner = false) {
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
			invite: owner ? 'owner-token-000000' : 'editor-token-00000',
			capability: null
		})
	);
	return conn;
}

function pose(room: RoomCore, conn: RoomConnection, sampleTime: number, y: number, flags: number) {
	room.onMessage(conn, encodePose({ flags, seq: 0, sampleTime, x: 0, y, z: 0, yaw: 0, pitch: 0 }));
}

function fall(room: RoomCore, conn: RoomConnection, id: number, d: number, at: number) {
	room.onMessage(conn, JSON.stringify({ t: 'fall', id, d, at }));
}

const points = (conn: FakeConnection, now: number) => healthAt(conn.last('health')!.state, now);

describe('RoomCore — player health', () => {
	it('welcomes a player with full health and the world rule', async () => {
		const { room, now } = setup();
		const a = await join(room, 'player-aaaa');
		const welcome = a.last('welcome')!;
		expect(welcome.rules.fallDamage).toBe(true);
		expect(healthAt(welcome.health!, now())).toBe(36);
	});

	it('applies a reported fall after the join grace period, privately', async () => {
		const { room, advance, now } = setup();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		fall(room, a, 1, 10, now());
		expect(points(a, now())).toBe(36);
		advance(2500);
		fall(room, a, 2, 10, now());
		const reply = a.last('health')!;
		expect(reply.ack).toBe(2);
		expect(healthAt(reply.state, now())).toBe(24);
		expect(room.stats.fallsApplied).toBe(1);
		// Nobody else ever hears about it: B's only health is its own, in its own welcome.
		expect(JSON.stringify(b.json.filter((m) => m.t !== 'welcome'))).not.toContain('health');
		expect(healthAt(b.last('welcome')!.health!, now())).toBe(36);
		expect(b.all('health')).toHaveLength(0);
	});

	it('ignores falls when the rule is off, repeats, bursts and nonsense distances', async () => {
		const off = setup({ fallDamage: false });
		const a = await join(off.room, 'player-aaaa');
		off.advance(2500);
		fall(off.room, a, 1, 30, off.now());
		expect(points(a, off.now())).toBe(36);

		const { room, advance, now } = setup();
		const b = await join(room, 'player-bbbb');
		advance(2500);
		fall(room, b, 5, 10, now());
		fall(room, b, 5, 10, now()); // same id
		fall(room, b, 4, 10, now()); // older id
		fall(room, b, 6, 10, now()); // inside the burst limit
		expect(points(b, now())).toBe(24);
		advance(300);
		fall(room, b, 7, 5000, now());
		expect(points(b, now())).toBe(24);
		room.onMessage(b, JSON.stringify({ t: 'fall', id: 8, d: Number.NaN, at: now() }));
		room.onMessage(b, JSON.stringify({ t: 'fall', id: 9, d: -3, at: now() }));
		expect(points(b, now())).toBe(24);
	});

	it('caps a report that is longer than the drop seen in the poses, and counts it', async () => {
		const { room, advance, now } = setup();
		const a = await join(room, 'player-aaaa');
		advance(2500);
		const t = now();
		pose(room, a, t, 11.7, POSE_FLAGS.grounded);
		pose(room, a, t + 100, 11, 0);
		pose(room, a, t + 600, 4, 0);
		pose(room, a, t + 900, 1.7, POSE_FLAGS.grounded);
		advance(1000);
		// 10 m seen; a 30 m report is capped to 11.5 m → 15 points.
		fall(room, a, 1, 30, t + 900);
		expect(room.stats.fallMismatches).toBe(1);
		expect(points(a, now())).toBe(21);
	});

	it('trusts a report when no landing was seen, and ignores flight in the poses', async () => {
		const { room, advance, now } = setup();
		const a = await join(room, 'player-aaaa');
		advance(2500);
		const t = now();
		pose(room, a, t, 50, POSE_FLAGS.flying);
		pose(room, a, t + 200, 1.7, POSE_FLAGS.grounded);
		fall(room, a, 1, 10, t + 200);
		expect(room.stats.fallMismatches).toBe(0);
		expect(points(a, now())).toBe(24);
	});

	it('regenerates from timestamps, with no messages', async () => {
		const { room, advance, now } = setup();
		const a = await join(room, 'player-aaaa');
		advance(2500);
		fall(room, a, 1, 10, now());
		const sent = a.json.length;
		advance(11_000);
		expect(points(a, now())).toBe(25);
		expect(a.json.length).toBe(sent);
	});

	it('dies, ignores respawn while alive, and respawns only when dead', async () => {
		const { room, advance, now } = setup();
		const a = await join(room, 'player-aaaa');
		advance(2500);
		room.onMessage(a, JSON.stringify({ t: 'respawn' }));
		expect(points(a, now())).toBe(36);
		fall(room, a, 1, 10, now());
		room.onMessage(a, JSON.stringify({ t: 'respawn' }));
		expect(points(a, now())).toBe(24);

		advance(300);
		fall(room, a, 2, 40, now());
		expect(a.last('health')!.state.dead).toBe(true);
		advance(300);
		fall(room, a, 3, 40, now());
		expect(a.last('health')!.state.dead).toBe(true);
		room.onMessage(a, JSON.stringify({ t: 'respawn' }));
		expect(a.last('health')!.state.dead).toBe(false);
		expect(points(a, now())).toBe(36);
	});

	it('keeps health across leaving and rejoining, without healing while away', async () => {
		const { room, advance, now, persistence } = setup();
		const a = await join(room, 'player-aaaa');
		advance(2500);
		pose(room, a, now(), 1.7, POSE_FLAGS.grounded);
		fall(room, a, 1, 10, now());
		room.onClose(a, CLIENT_LEAVE_CODE);
		expect(persistence.health.get('player-aaaa')?.base).toBe(24);
		expect(persistence.bookmarks.get('player-aaaa')).not.toBeNull();

		advance(60 * 60 * 1000);
		const again = await join(room, 'player-aaaa');
		expect(healthAt(again.last('welcome')!.health!, now())).toBe(24);
		// Regeneration restarts on the join: 11 s later the first point is back.
		advance(11_000);
		expect(healthAt(again.last('welcome')!.health!, now())).toBe(25);
	});

	it('brings a player who left dead back at the world spawn with full health', async () => {
		const { room, advance, now, persistence } = setup();
		const a = await join(room, 'player-aaaa');
		advance(2500);
		pose(room, a, now(), 1.7, POSE_FLAGS.grounded);
		fall(room, a, 1, 40, now());
		room.onClose(a, CLIENT_LEAVE_CODE);
		expect(persistence.health.has('player-aaaa')).toBe(false);
		expect(persistence.bookmarks.get('player-aaaa')).toBeNull();
		const again = await join(room, 'player-aaaa');
		expect(again.last('welcome')!.bookmark).toBeNull();
		expect(healthAt(again.last('welcome')!.health!, now())).toBe(36);
	});

	it('survives the room hibernating mid-session with the exact health', async () => {
		const persistence = new MemoryPersistence();
		const first = setup({ persistence });
		const a = await join(first.room, 'player-aaaa');
		first.advance(2500);
		fall(first.room, a, 1, 10, first.now());

		const second = setup({ persistence });
		second.advance(first.now() - second.now());
		second.room.restore([
			{
				conn: a,
				attachment: {
					playerId: 'player-aaaa',
					slot: 0,
					name: 'player-aaaa',
					colour: '#336699',
					role: 'editor',
					away: false
				}
			}
		]);
		second.advance(300);
		fall(second.room, a, 2, 5, second.now());
		// 24 − 2, with the earlier hit's regeneration clock intact.
		expect(points(a, second.now())).toBe(22);
	});

	it("follows the owner's shared rule over the published one", async () => {
		const { room, advance, now } = setup({ fallDamage: true });
		const owner = await join(room, 'player-owner', true);
		const env: SharedEnvironment = {
			anchor: { roomSeconds: 0, timeOfDay: 0.5, weatherTime: 0 },
			sky: {},
			weather: {},
			rules: { fallDamage: false }
		};
		room.onMessage(owner, JSON.stringify({ t: 'env', env }));
		const b = await join(room, 'player-bbbb');
		expect(b.last('welcome')!.env?.rules).toEqual({ fallDamage: false });
		advance(2500);
		fall(room, b, 1, 30, now());
		expect(points(b, now())).toBe(36);
	});
});

/** Two players standing `gap` metres apart along −Z, A at the origin facing B (yaw 0). */
async function face(gap: number, options: { owner?: boolean } = {}) {
	const room = setup();
	const a = await join(room.room, 'player-aaaa', options.owner);
	const b = await join(room.room, 'player-bbbb');
	room.advance(2500);
	const t = room.now();
	room.room.onMessage(
		a,
		encodePose({
			flags: POSE_FLAGS.grounded,
			seq: 0,
			sampleTime: t,
			x: 0,
			y: 0,
			z: 0,
			yaw: 0,
			pitch: 0
		})
	);
	room.room.onMessage(
		b,
		encodePose({
			flags: POSE_FLAGS.grounded,
			seq: 0,
			sampleTime: t,
			x: 0,
			y: 0,
			z: -gap,
			yaw: 0,
			pitch: 0
		})
	);
	return { ...room, a, b };
}

function punch(room: RoomCore, conn: RoomConnection, id: number, target: number) {
	room.onMessage(conn, JSON.stringify({ t: 'punch', id, target }));
}

describe('RoomCore — punching', () => {
	it('lands a punch in reach: 2 points off the target, told only to the target', async () => {
		const { room, a, b, now } = await face(1.5);
		punch(room, a, 1, 1);
		expect(a.last('punchResult')).toEqual({ t: 'punchResult', id: 1, hit: true });
		const hit = b.last('health')!;
		expect(hit.source).toEqual({ kind: 'player', by: 0 });
		expect(healthAt(hit.state, now())).toBe(34);
		// The attacker learns that it landed, never the target's health.
		expect(a.all('health')).toHaveLength(0);
		expect(room.stats.punchesLanded).toBe(1);
	});

	it('enforces the cooldown and ignores repeated ids', async () => {
		const { room, a, b, advance, now } = await face(1.5);
		punch(room, a, 1, 1);
		punch(room, a, 2, 1);
		punch(room, a, 2, 1);
		expect(healthAt(b.last('health')!.state, now())).toBe(34);
		expect(a.last('punchResult')).toMatchObject({ id: 2, hit: false });
		advance(500);
		punch(room, a, 3, 1);
		expect(healthAt(b.last('health')!.state, now())).toBe(32);
	});

	it('refuses punches from too far away and counts them', async () => {
		const { room, a, b } = await face(8);
		punch(room, a, 1, 1);
		expect(a.last('punchResult')!.hit).toBe(false);
		expect(b.all('health')).toHaveLength(0);
		expect(room.stats.punchesRejected).toBe(1);
	});

	it('refuses punches at yourself, an unknown slot, or a target in its grace period', async () => {
		const { room, a, advance, now } = await face(1.5);
		punch(room, a, 1, 0);
		advance(600);
		punch(room, a, 2, 9);
		expect(a.all('punchResult').map((r) => r.hit)).toEqual([false, false]);
		// A third player who just joined is protected for 2 s.
		const c = await join(room, 'player-cccc');
		room.onMessage(
			c,
			encodePose({
				flags: POSE_FLAGS.grounded,
				seq: 0,
				sampleTime: now(),
				x: 0,
				y: 0,
				z: -1,
				yaw: 0,
				pitch: 0
			})
		);
		advance(600);
		punch(room, a, 3, 2);
		expect(a.last('punchResult')!.hit).toBe(false);
	});

	it('knocks a player out after eighteen punches, with the attacker as the cause', async () => {
		const { room, a, b, advance } = await face(1.5);
		for (let id = 1; id <= 18; id++) {
			punch(room, a, id, 1);
			advance(500);
		}
		const last = b.last('health')!;
		expect(last.state.dead).toBe(true);
		expect(last.source).toEqual({ kind: 'player', by: 0 });
		punch(room, a, 19, 1);
		expect(a.last('punchResult')!.hit).toBe(false);
	});

	it("follows the owner's player-damage rule", async () => {
		const { room, a, b } = await face(1.5, { owner: true });
		const env: SharedEnvironment = {
			anchor: { roomSeconds: 0, timeOfDay: 0.5, weatherTime: 0 },
			sky: {},
			weather: {},
			rules: { playerDamage: false }
		};
		room.onMessage(a, JSON.stringify({ t: 'env', env }));
		punch(room, a, 1, 1);
		expect(a.last('punchResult')!.hit).toBe(false);
		expect(b.all('health')).toHaveLength(0);
	});

	it('does not let viewers punch', async () => {
		const room = setup();
		const viewer = new FakeConnection();
		await room.room.onMessage(
			viewer,
			JSON.stringify({
				t: 'hello',
				protocol: PROTOCOL_VERSION,
				schemaVersion: 9,
				generatorVersion: GENERATOR_VERSION,
				build: 'test',
				playerId: 'player-view',
				name: 'viewer',
				colour: '#336699',
				invite: 'viewer-token-00000',
				capability: null
			})
		);
		expect(viewer.last('welcome')!.role).toBe('viewer');
		punch(room.room, viewer, 1, 0);
		expect(viewer.last('punchResult')!.hit).toBe(false);
	});
});
