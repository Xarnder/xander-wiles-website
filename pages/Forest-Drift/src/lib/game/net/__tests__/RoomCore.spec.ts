import { testDefinition } from '../../miniBuild/__tests__/miniBuildFixtures';
import { createInteraction } from '../../miniBuild/MiniBuildInteractions';
import { describe, expect, it } from 'vitest';
import { WorldStore, publishedRows } from '../WorldStore';
import { flattenWorld } from '../worldEntities';
import {
	CLOCK_CHECKPOINT_MS,
	RoomCore,
	type CommitRecord,
	maxSpeedForRunSpeed,
	type AuthResult,
	type GraceEntry,
	type PlayerAttachment,
	type RoomClockRecord,
	type RoomConnection,
	type RoomPersistence
} from '../RoomCore';
import {
	CLIENT_LEAVE_CODE,
	CLOSE_CODES,
	GENERATOR_VERSION,
	GRACE_PERIOD_MS,
	PLAYER_COLOURS,
	MESSAGE_TYPE,
	POSE_FLAGS,
	PROTOCOL_VERSION,
	binaryMessageType,
	decodeSnapshot,
	encodePose,
	type CommitMessage,
	type HelloMessage,
	type PlayerBookmark,
	type PlayerRole,
	type ServerJsonMessage,
	type SharedEnvironment
} from '../protocol';

class FakeConnection implements RoomConnection {
	readonly json: ServerJsonMessage[] = [];
	readonly binary: ArrayBuffer[] = [];
	closed: { code: number; reason: string } | null = null;
	attachment: PlayerAttachment | null = null;

	send(data: string | ArrayBuffer): void {
		if (typeof data === 'string') this.json.push(JSON.parse(data) as ServerJsonMessage);
		else this.binary.push(data);
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
	snapshots() {
		return this.binary
			.filter((b) => binaryMessageType(b) === MESSAGE_TYPE.snapshot)
			.map((b) => decodeSnapshot(b)!);
	}
}

const WORLD = {
	worldId: 'world-1234',
	name: 'Test',
	schemaVersion: 9,
	generatorVersion: GENERATOR_VERSION
};

const INVITES: Record<string, PlayerRole> = {
	'invite-owner-token-000': 'owner',
	'invite-editor-token-00': 'editor',
	'invite-viewer-token-00': 'viewer'
};

/** Capabilities in tests are `cap.<playerId>.<role>`; the real ones are HMAC-signed (capability.ts). */
async function fakeAuthorize(hello: HelloMessage): Promise<AuthResult> {
	if (hello.capability?.startsWith(`cap.${hello.playerId}.`)) {
		const role = hello.capability.split('.').pop() as PlayerRole;
		return { ok: true, role, capability: hello.capability, via: 'capability' };
	}
	const role = hello.invite ? INVITES[hello.invite] : undefined;
	if (!role) return { ok: false };
	return { ok: true, role, capability: `cap.${hello.playerId}.${role}`, via: 'invite' };
}

class MemoryPersistence implements RoomPersistence {
	grace: GraceEntry[] = [];
	clock: RoomClockRecord | null = null;
	env: string | null = null;
	saveGrace(entries: GraceEntry[]): void {
		this.grace = entries.map((entry) => ({ ...entry }));
	}
	saveClock(clock: RoomClockRecord): void {
		this.clock = { ...clock };
	}
	saveEnv(envJson: string): void {
		this.env = envJson;
	}
}

function setup(maxPlayers = 20, start = 1_000_000) {
	let now = start;
	const persistence = new MemoryPersistence();
	const room = new RoomCore({
		world: WORLD,
		now: () => now,
		maxPlayers,
		maxSpeed: maxSpeedForRunSpeed(12),
		authorize: fakeAuthorize,
		persistence
	});
	return {
		room,
		persistence,
		advance: (ms: number) => (now += ms),
		now: () => now
	};
}

async function hello(
	room: RoomCore,
	conn: FakeConnection,
	playerId: string,
	options: { name?: string; invite?: string | null; capability?: string | null } = {}
) {
	await room.onMessage(
		conn,
		JSON.stringify({
			t: 'hello',
			protocol: PROTOCOL_VERSION,
			schemaVersion: 9,
			generatorVersion: GENERATOR_VERSION,
			build: 'test',
			playerId,
			name: options.name ?? 'Player',
			colour: '#336699',
			invite: options.invite === undefined ? 'invite-editor-token-00' : options.invite,
			capability: options.capability ?? null
		})
	);
}

function pose(
	room: RoomCore,
	conn: FakeConnection,
	sampleTime: number,
	x: number,
	flags = POSE_FLAGS.moving
) {
	room.onMessage(conn, encodePose({ flags, seq: 0, sampleTime, x, y: 1, z: 0, yaw: 0, pitch: 0 }));
}

const ENV: SharedEnvironment = {
	anchor: { roomSeconds: 12, timeOfDay: 0.75, weatherTime: 300 },
	sky: { dayCycle: { timeOfDay: 0.75, enabled: true } },
	weather: { selection: 'rain', intensity: 0.8 }
};

describe('RoomCore handshake', () => {
	it('welcomes a player with a slot, a role and a capability, and tells others they joined', async () => {
		const { room } = setup();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa', { name: 'Alex', invite: 'invite-owner-token-000' });
		await hello(room, b, 'player-bbbb', { name: 'Bea', invite: 'invite-viewer-token-00' });
		expect(a.last('welcome')!.slot).toBe(0);
		expect(a.last('welcome')!.role).toBe('owner');
		expect(b.last('welcome')!.slot).toBe(1);
		expect(b.last('welcome')!.role).toBe('viewer');
		expect(b.last('welcome')!.capability).toBe('cap.player-bbbb.viewer');
		expect(b.last('welcome')!.rules).toEqual({ maxSpeed: maxSpeedForRunSpeed(12), flight: false });
		expect(b.last('welcome')!.players.map((p) => [p.name, p.role])).toEqual([
			['Alex', 'owner'],
			['Bea', 'viewer']
		]);
		expect(a.last('joined')!.player.name).toBe('Bea');
		expect(b.attachment).toEqual({
			playerId: 'player-bbbb',
			slot: 1,
			name: 'Bea',
			// Alex already has the test colour, so Bea gets the first free palette colour.
			colour: PLAYER_COLOURS[0],
			role: 'viewer',
			away: false
		});
	});

	it('refuses a missing or wrong invite (invite-only, Q7)', async () => {
		const { room } = setup();
		const noInvite = new FakeConnection();
		await hello(room, noInvite, 'player-aaaa', { invite: null });
		expect(noInvite.closed?.code).toBe(CLOSE_CODES.accessDenied);
		const wrong = new FakeConnection();
		await hello(room, wrong, 'player-bbbb', { invite: 'invite-made-up-token-0' });
		expect(wrong.closed?.code).toBe(CLOSE_CODES.accessDenied);
		expect(wrong.last('error')!.code).toBe('access');
		expect(room.playerCount).toBe(0);
	});

	it('refuses stale builds: mismatched protocol and game versions', async () => {
		const { room } = setup();
		const old = new FakeConnection();
		await room.onMessage(
			old,
			JSON.stringify({
				t: 'hello',
				protocol: PROTOCOL_VERSION - 1,
				schemaVersion: 9,
				generatorVersion: 1,
				playerId: 'player-x1',
				name: 'Old',
				colour: '#000000',
				invite: 'invite-editor-token-00'
			})
		);
		expect(old.closed?.code).toBe(CLOSE_CODES.protocolMismatch);

		const otherBuild = new FakeConnection();
		await room.onMessage(
			otherBuild,
			JSON.stringify({
				t: 'hello',
				protocol: PROTOCOL_VERSION,
				schemaVersion: 8,
				generatorVersion: GENERATOR_VERSION,
				playerId: 'player-x2',
				name: 'New',
				colour: '#000000',
				invite: 'invite-editor-token-00'
			})
		);
		expect(otherBuild.closed?.code).toBe(CLOSE_CODES.versionMismatch);
		expect(room.playerCount).toBe(0);
	});

	it('closes the room to a player beyond the cap', async () => {
		const { room } = setup(2);
		await hello(room, new FakeConnection(), 'player-0001');
		await hello(room, new FakeConnection(), 'player-0002');
		const third = new FakeConnection();
		await hello(room, third, 'player-0003');
		expect(third.closed?.code).toBe(CLOSE_CODES.worldFull);
	});

	it('lets the same player (proved by capability) replace an older connection and keep the slot', async () => {
		const { room } = setup();
		const other = new FakeConnection();
		const firstTab = new FakeConnection();
		const secondTab = new FakeConnection();
		await hello(room, other, 'player-other');
		await hello(room, firstTab, 'player-same');
		const capability = firstTab.last('welcome')!.capability;
		await hello(room, secondTab, 'player-same', { capability });
		expect(firstTab.closed?.code).toBe(CLOSE_CODES.replaced);
		expect(secondTab.last('welcome')!.slot).toBe(1);
		expect(room.playerCount).toBe(2);
		// No leave-and-join for the others: just the same player again.
		expect(other.all('left')).toHaveLength(0);
	});

	it("won't let someone with only the shared link take over a connected player's id", async () => {
		const { room } = setup();
		const victim = new FakeConnection();
		const impostor = new FakeConnection();
		await hello(room, victim, 'player-victim');
		await hello(room, impostor, 'player-victim', { name: 'Impostor' });
		expect(impostor.closed?.code).toBe(CLOSE_CODES.alreadyConnected);
		expect(victim.closed).toBeNull();
	});

	it('gives a player whose colour is taken the first free palette colour', async () => {
		const { room } = setup();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		const colours = b.last('welcome')!.players.map((player) => player.colour);
		expect(colours[0]).toBe('#336699');
		expect(colours[1]).toBe(PLAYER_COLOURS[0]);
		expect(new Set(colours).size).toBe(2);
		// The same player coming back keeps their own colour.
		room.onClose(a, 1006);
		const again = new FakeConnection();
		await hello(room, again, 'player-aaaa', { capability: a.last('welcome')!.capability });
		expect(again.last('welcome')!.players.find((p) => p.playerId === 'player-aaaa')!.colour).toBe(
			'#336699'
		);
	});

	it('assigns distinct colours to a full room even when every player requests the same colour', async () => {
		const { room } = setup();
		let last = new FakeConnection();
		for (let i = 0; i < 20; i++) {
			last = new FakeConnection();
			await hello(room, last, `crowd-player-${i}`);
		}
		const colours = last.last('welcome')!.players.map((player) => player.colour);
		expect(colours).toHaveLength(20);
		expect(new Set(colours).size).toBe(20);
	});

	it('gives duplicate names a suffix', async () => {
		const { room } = setup();
		await hello(room, new FakeConnection(), 'player-0001', { name: 'Sam' });
		const second = new FakeConnection();
		await hello(room, second, 'player-0002', { name: 'Sam' });
		expect(second.last('welcome')!.players[1]!.name).toBe('Sam (2)');
	});

	it('ignores a connection that closed while its hello was being checked', async () => {
		const { room } = setup();
		const conn = new FakeConnection();
		const pending = hello(room, conn, 'player-aaaa');
		room.onClose(conn, 1006);
		await pending;
		expect(conn.last('welcome')).toBeUndefined();
		expect(room.playerCount).toBe(0);
	});
});

describe('RoomCore grace period (Q21)', () => {
	it('holds a dropped player for 30 s, shown offline, then lets them go', async () => {
		const { room, advance, persistence } = setup();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		room.onClose(b, 1006);
		expect(a.last('presence')).toEqual({ t: 'presence', slot: 1, away: false, offline: true });
		expect(a.all('left')).toHaveLength(0);
		expect(room.playerCount).toBe(2);
		expect(persistence.grace.map((entry) => entry.playerId)).toEqual(['player-bbbb']);
		expect(room.nextAlarmAt()).toBe(persistence.grace[0]!.expiresAt);

		advance(GRACE_PERIOD_MS - 1);
		room.onAlarm();
		expect(room.playerCount).toBe(2);
		advance(1);
		room.onAlarm();
		expect(a.last('left')).toEqual({ t: 'left', slot: 1, playerId: 'player-bbbb' });
		expect(room.playerCount).toBe(1);
		expect(persistence.grace).toEqual([]);
	});

	it('resumes a dropped player into the same slot without a leave or join', async () => {
		const { room, advance } = setup();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		const capability = b.last('welcome')!.capability;
		room.onClose(b, 1006);
		advance(20_000);
		const back = new FakeConnection();
		await hello(room, back, 'player-bbbb', { capability, invite: null });
		expect(back.last('welcome')!.slot).toBe(1);
		expect(a.all('left')).toHaveLength(0);
		expect(a.last('joined')!.player).toMatchObject({ slot: 1, offline: false });
		expect(room.nextAlarmAt()).not.toBe(null); // the clock checkpoint, not a grace expiry
		advance(GRACE_PERIOD_MS);
		room.onAlarm();
		expect(room.playerCount).toBe(2);
	});

	it('lets a deliberate leave go at once', async () => {
		const { room } = setup();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		room.onClose(b, CLIENT_LEAVE_CODE);
		expect(a.last('left')).toEqual({ t: 'left', slot: 1, playerId: 'player-bbbb' });
		expect(room.playerCount).toBe(1);
	});

	it('keeps a held slot when the room restarts, and expires it after', async () => {
		const first = setup();
		const a = new FakeConnection();
		await hello(first.room, a, 'player-aaaa');
		first.room.onClose(a, 1006);
		const saved = first.persistence;

		let now = first.now() + 1000;
		const restarted = new RoomCore({
			world: WORLD,
			now: () => now,
			authorize: fakeAuthorize,
			persistence: saved,
			restored: { grace: saved.grace, clock: saved.clock }
		});
		restarted.restore([]);
		expect(restarted.listPlayers()).toMatchObject([{ playerId: 'player-aaaa', offline: true }]);
		const watcher = new FakeConnection();
		await hello(restarted, watcher, 'player-wwww');
		expect(watcher.last('welcome')!.slot).toBe(1);
		now += GRACE_PERIOD_MS;
		restarted.onAlarm();
		expect(watcher.last('left')!.playerId).toBe('player-aaaa');
	});
});

describe('RoomCore room clock (Q11-A)', () => {
	it('runs only while the world is occupied, including the grace period', async () => {
		const { room, advance } = setup();
		expect(room.clockState()).toEqual({ elapsedMs: 0, running: false });
		const a = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		advance(10_000);
		expect(room.clockState()).toEqual({ elapsedMs: 10_000, running: true });
		room.onClose(a, 1006);
		advance(GRACE_PERIOD_MS);
		room.onAlarm(); // grace over → empty → clock stops
		expect(room.clockState()).toEqual({ elapsedMs: 10_000 + GRACE_PERIOD_MS, running: false });
		advance(3_600_000);
		expect(room.clockState().elapsedMs).toBe(10_000 + GRACE_PERIOD_MS);
		const b = new FakeConnection();
		await hello(room, b, 'player-bbbb');
		expect(b.last('welcome')!.clock).toEqual({
			elapsedMs: 10_000 + GRACE_PERIOD_MS,
			running: true
		});
	});

	it('checkpoints the clock while occupied', async () => {
		const { room, advance, persistence } = setup();
		await hello(room, new FakeConnection(), 'player-aaaa');
		const startedAt = persistence.clock!.checkpointAt;
		expect(room.nextAlarmAt()).toBe(startedAt + CLOCK_CHECKPOINT_MS);
		advance(CLOCK_CHECKPOINT_MS);
		room.onAlarm();
		expect(persistence.clock!.checkpointAt).toBe(startedAt + CLOCK_CHECKPOINT_MS);
	});

	it('after a crash with nobody coming back, stops the clock at the last checkpoint', () => {
		let now = 5_000_000;
		const clock: RoomClockRecord = {
			accumulatedMs: 1000,
			runningSince: 4_000_000,
			checkpointAt: 4_600_000
		};
		const persistence = new MemoryPersistence();
		const room = new RoomCore({
			world: WORLD,
			now: () => now,
			authorize: fakeAuthorize,
			persistence,
			restored: { clock }
		});
		room.restore([]);
		expect(room.clockState().running).toBe(true);
		now += GRACE_PERIOD_MS;
		room.onAlarm();
		expect(room.clockState()).toEqual({ elapsedMs: 1000 + 600_000, running: false });
	});

	it('after a restart, players reconnecting in time keep the clock running', async () => {
		let now = 5_000_000;
		const room = new RoomCore({
			world: WORLD,
			now: () => now,
			authorize: fakeAuthorize,
			restored: { clock: { accumulatedMs: 0, runningSince: 4_000_000, checkpointAt: 4_990_000 } }
		});
		room.restore([]);
		now += 3000;
		const back = new FakeConnection();
		await hello(room, back, 'player-aaaa');
		expect(back.last('welcome')!.clock).toEqual({ elapsedMs: 1_003_000, running: true });
	});
});

describe('RoomCore shared environment (Q14-A)', () => {
	it("stores and relays the owner's sky, weather and time", async () => {
		const { room, persistence } = setup();
		const owner = new FakeConnection();
		const guest = new FakeConnection();
		await hello(room, owner, 'player-owner', { invite: 'invite-owner-token-000' });
		await hello(room, guest, 'player-guest');
		room.onMessage(owner, JSON.stringify({ t: 'env', env: ENV }));
		expect(guest.last('env')).toEqual({ t: 'env', env: ENV, by: 0 });
		expect(owner.last('env')).toBeUndefined();
		expect(JSON.parse(persistence.env!)).toEqual(ENV);
		const late = new FakeConnection();
		await hello(room, late, 'player-late');
		expect(late.last('welcome')!.env).toEqual(ENV);
	});

	it("refuses anyone else's changes", async () => {
		const { room } = setup();
		const owner = new FakeConnection();
		const editor = new FakeConnection();
		await hello(room, owner, 'player-owner', { invite: 'invite-owner-token-000' });
		await hello(room, editor, 'player-editor');
		room.onMessage(editor, JSON.stringify({ t: 'env', env: ENV }));
		expect(owner.last('env')).toBeUndefined();
		expect(editor.last('error')!.code).toBe('role');
	});

	it('drops malformed environments', async () => {
		const { room } = setup();
		const owner = new FakeConnection();
		const guest = new FakeConnection();
		await hello(room, owner, 'player-owner', { invite: 'invite-owner-token-000' });
		await hello(room, guest, 'player-guest');
		room.onMessage(owner, JSON.stringify({ t: 'env', env: { anchor: { roomSeconds: -1 } } }));
		expect(guest.last('env')).toBeUndefined();
	});
});

describe('RoomCore relay', () => {
	it('batches changed poses into one snapshot per receiver per tick', async () => {
		const { room, advance, now } = setup();
		const a = new FakeConnection();
		const b = new FakeConnection();
		const c = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		await hello(room, c, 'player-cccc');

		pose(room, a, now() - 20, 1);
		pose(room, b, now() - 10, 2);
		expect(room.needsTick()).toBe(true);
		room.tick();

		const forC = c.snapshots();
		expect(forC).toHaveLength(1);
		expect(forC[0]!.entries.map((e) => e.slot).sort()).toEqual([0, 1]);
		expect(forC[0]!.entries.find((e) => e.slot === 0)!.sampleAgeMs).toBe(20);
		expect(a.snapshots()[0]!.entries.map((e) => e.slot)).toEqual([1]);

		// Nothing changed since: the next tick sends nothing.
		advance(50);
		room.tick();
		expect(c.snapshots()).toHaveLength(1);
	});

	it("sends a joiner everyone's current position straight away", async () => {
		const { room, now } = setup();
		const a = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		pose(room, a, now(), 5, 0);
		const late = new FakeConnection();
		await hello(room, late, 'player-late');
		const snapshots = late.snapshots();
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]!.entries[0]!.x).toBe(5);
	});

	it('rejects implausible poses and faster-than-running speeds, but allows a teleport', async () => {
		const { room, advance, now } = setup();
		const a = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		pose(room, a, now(), 0);
		advance(100);
		pose(room, a, now(), 1.5); // 15 m/s: a sprint, fine
		advance(100);
		pose(room, a, now(), 6); // 45 m/s: flight speed (F3-C), refused
		expect(room.stats.posesRejected).toBe(1);
		pose(room, a, now(), 1000, POSE_FLAGS.teleport);
		expect(room.stats.posesAccepted).toBe(3);
		room.onMessage(
			a,
			encodePose({
				flags: 0,
				seq: 0,
				sampleTime: now(),
				x: Number.NaN,
				y: 0,
				z: 0,
				yaw: 0,
				pitch: 0
			})
		);
		expect(room.stats.posesRejected).toBe(2);
	});

	it('accepts a position it keeps refusing after two seconds, so an avatar never freezes', async () => {
		const { room, advance, now } = setup();
		const a = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		pose(room, a, now(), 0);
		for (let i = 0; i < 25; i++) {
			advance(100);
			pose(room, a, now(), 500 + i);
		}
		expect(room.stats.posesAccepted).toBeGreaterThan(1);
	});

	it('tells everyone when a player goes away and comes back (Q12)', async () => {
		const { room, now, advance } = setup();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		pose(room, b, now(), 0, POSE_FLAGS.away);
		expect(a.last('presence')).toEqual({ t: 'presence', slot: 1, away: true, offline: false });
		expect(b.attachment!.away).toBe(true);
		advance(100);
		pose(room, b, now(), 0, 0);
		expect(a.last('presence')).toEqual({ t: 'presence', slot: 1, away: false, offline: false });
	});

	it('stops needing ticks two seconds after the last pose, so the room can hibernate', async () => {
		const { room, advance, now } = setup();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		pose(room, a, now(), 0);
		expect(room.needsTick()).toBe(true);
		advance(2100);
		expect(room.needsTick()).toBe(false);
	});

	it('answers pings with the room clock', async () => {
		const { room, now } = setup();
		const a = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		room.onMessage(a, JSON.stringify({ t: 'ping', c: 123 }));
		expect(a.last('pong')).toEqual({ t: 'pong', c: 123, s: now() });
	});

	it('rebuilds its player list from attachments after hibernation', async () => {
		const { room } = setup();
		const a = new FakeConnection();
		room.restore([
			{
				conn: a,
				attachment: {
					playerId: 'player-aaaa',
					slot: 3,
					name: 'Alex',
					colour: '#112233',
					role: 'editor',
					away: true
				}
			}
		]);
		expect(room.listPlayers()).toEqual([
			{
				playerId: 'player-aaaa',
				slot: 3,
				name: 'Alex',
				colour: '#112233',
				role: 'editor',
				away: true,
				offline: false
			}
		]);
		const b = new FakeConnection();
		await hello(room, b, 'player-bbbb');
		expect(b.last('welcome')!.slot).toBe(0);
	});
});

describe('RoomCore shared building (Phase 3)', () => {
	class BuildPersistence extends MemoryPersistence {
		commits: CommitMessage[] = [];
		batches = new Map<string, number>();
		players = new Map<string, { name: string; bookmark: PlayerBookmark | null }>();
		retainedFrom = 0;
		saveCommit(record: CommitRecord): void {
			this.commits.push(record.commit);
			this.batches.set(`${record.playerId}|${record.commit.batchId}`, record.commit.seq);
		}
		loadCommitsSince(afterSeq: number): CommitMessage[] | null {
			if (afterSeq < this.retainedFrom) return null;
			return this.commits.filter((commit) => commit.seq > afterSeq);
		}
		findBatchSeq(playerId: string, batchId: string): number | null {
			return this.batches.get(`${playerId}|${batchId}`) ?? null;
		}
		savePlayer(playerId: string, name: string, bookmark: PlayerBookmark | null): void {
			this.players.set(playerId, { name, bookmark });
		}
		loadPlayer(playerId: string) {
			return this.players.get(playerId) ?? null;
		}
		playerNames(): Record<string, string> {
			return Object.fromEntries([...this.players].map(([id, value]) => [id, value.name]));
		}
	}

	function buildRoom() {
		let now = 1_000_000;
		const persistence = new BuildPersistence();
		const store = new WorldStore({
			rows: publishedRows(
				flattenWorld({
					foundations: [
						{ id: 'f1', minGridX: 0, maxGridX: 10, minGridZ: 0, maxGridZ: 10, topY: 1, bottomY: 0 }
					],
					buildings: [],
					buildingLevels: [],
					barriers: [],
					furniture: [],
					miniBuilds: { definitions: [], instances: [] },
					musicTrees: [],
					musicPlants: [],
					proceduralOverrides: { removedTreeIds: [] }
				})
			),
			seq: 1,
			epoch: 1
		});
		const room = new RoomCore({
			world: WORLD,
			now: () => now,
			authorize: fakeAuthorize,
			persistence,
			store
		});
		return { room, store, persistence, advance: (ms: number) => (now += ms) };
	}

	const addFurniture = (id: string) =>
		JSON.stringify({
			t: 'ops',
			batchId: `batch-${id}`,
			ops: [
				{
					op: 'add',
					kind: 'furniture',
					id,
					data: { id, kind: 'chair', foundationId: 'f1', x: 1, y: 1, z: 1, nx: 0, ny: 1, nz: 0 }
				}
			]
		});

	it('commits a batch and tells everyone, the builder included', async () => {
		const { room } = buildRoom();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa', { name: 'Alex' });
		await hello(room, b, 'player-bbbb', { name: 'Bea' });
		room.onMessage(a, addFurniture('chair-1'));
		for (const conn of [a, b]) {
			expect(conn.last('commit')).toMatchObject({
				seq: 2,
				epoch: 1,
				batchId: 'batch-chair-1',
				by: 'player-aaaa',
				byName: 'Alex'
			});
		}
	});

	it('refuses visitors, and answers a resent batch with an ack instead of a second commit', async () => {
		const { room, persistence } = buildRoom();
		const visitor = new FakeConnection();
		await hello(room, visitor, 'player-vvvv', { invite: 'invite-viewer-token-00' });
		room.onMessage(visitor, addFurniture('chair-v'));
		expect(visitor.last('reject')).toMatchObject({ reason: 'role' });

		const editor = new FakeConnection();
		await hello(room, editor, 'player-eeee');
		room.onMessage(editor, addFurniture('chair-e'));
		room.onMessage(editor, addFurniture('chair-e'));
		expect(editor.all('commit')).toHaveLength(1);
		expect(editor.last('ack')).toEqual({ t: 'ack', batchId: 'batch-chair-e', seq: 2 });
		expect(persistence.commits).toHaveLength(1);
	});

	it('catches a reconnecting player up from the log, or asks for a resync', async () => {
		const { room, persistence } = buildRoom();
		const a = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		room.onMessage(a, addFurniture('chair-1'));
		room.onMessage(a, addFurniture('chair-2'));

		const behind = new FakeConnection();
		await room.onMessage(
			behind,
			JSON.stringify({
				t: 'hello',
				protocol: PROTOCOL_VERSION,
				schemaVersion: 9,
				generatorVersion: GENERATOR_VERSION,
				build: 'test',
				playerId: 'player-late',
				name: 'Late',
				colour: '#336699',
				invite: 'invite-editor-token-00',
				epoch: 1,
				lastSeq: 2
			})
		);
		expect(behind.last('welcome')).toMatchObject({ epoch: 1, seq: 3, resync: false });
		expect(behind.all('commit').map((commit) => commit.seq)).toEqual([3]);
		expect(behind.last('synced')).toEqual({ t: 'synced', seq: 3 });

		persistence.retainedFrom = 3;
		const tooFar = new FakeConnection();
		await room.onMessage(
			tooFar,
			JSON.stringify({
				t: 'hello',
				protocol: PROTOCOL_VERSION,
				schemaVersion: 9,
				generatorVersion: GENERATOR_VERSION,
				build: 'test',
				playerId: 'player-old1',
				name: 'Old',
				colour: '#336699',
				invite: 'invite-editor-token-00',
				epoch: 1,
				lastSeq: 1
			})
		);
		expect(tooFar.last('welcome')!.resync).toBe(true);
		expect(tooFar.all('commit')).toHaveLength(0);
	});

	it('shares doors live and closes them all when the world empties (Q13-A)', async () => {
		const { room } = buildRoom();
		const a = new FakeConnection();
		const b = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		room.onMessage(a, JSON.stringify({ t: 'door', id: 'door-1', open: true }));
		expect(b.last('door')).toEqual({ t: 'door', id: 'door-1', open: true, by: 0 });
		const c = new FakeConnection();
		await hello(room, c, 'player-cccc');
		expect(c.last('welcome')!.doors).toEqual(['door-1']);
		for (const conn of [a, b, c]) room.onClose(conn, CLIENT_LEAVE_CODE);
		const d = new FakeConnection();
		await hello(room, d, 'player-dddd');
		expect(d.last('welcome')!.doors).toEqual([]);
	});

	it('remembers where a player left, and their name for notices (Q18)', async () => {
		const { room, advance } = buildRoom();
		const a = new FakeConnection();
		await hello(room, a, 'player-aaaa', { name: 'Alex' });
		room.onMessage(
			a,
			encodePose({ flags: 0, seq: 1, sampleTime: 1_000_000, x: 12, y: 3, z: -4, yaw: 1, pitch: 0 })
		);
		room.onClose(a, CLIENT_LEAVE_CODE);
		advance(1000);
		const back = new FakeConnection();
		await hello(room, back, 'player-aaaa', { name: 'Alex' });
		const welcome = back.last('welcome')!;
		expect(welcome.bookmark).toMatchObject({ x: 12, y: 3, z: -4 });
		expect(welcome.names['player-aaaa']).toBe('Alex');
	});
});

describe('Mini Build interaction occupancy', () => {
	it('allows one player per authored location, rejects missing anchors, and releases on disconnect', async () => {
		const definition = testDefinition([[0, 0, 0, 32, 16, 32]], { unit: 1 });
		const location = createInteraction('sit', { x: 16, y: 16, z: 16 });
		definition.interactionLocations = [location];
		const { id, ...data } = definition;
		const store = new WorldStore({
			rows: publishedRows([
				{ kind: 'miniBuildDefinition', id, data },
				{
					kind: 'miniBuildInstance',
					id: 'seat',
					data: { designId: id, position: { x: 0, y: 0, z: 0 }, rotationY: 0 }
				}
			]),
			seq: 1,
			epoch: 1
		});
		const room = new RoomCore({
			world: WORLD,
			now: () => 1_000_000,
			authorize: fakeAuthorize,
			persistence: new MemoryPersistence(),
			store
		});
		const a = new FakeConnection(),
			b = new FakeConnection();
		await hello(room, a, 'player-aaaa');
		await hello(room, b, 'player-bbbb');
		pose(room, a, 1, 0);
		pose(room, b, 1, 1);
		const request = { t: 'interaction', location: { instanceId: 'seat', locationId: location.id } };
		await room.onMessage(a, JSON.stringify(request));
		expect(a.last('interactions')?.locations).toEqual([
			{ ...request.location, playerId: 'player-aaaa' }
		]);
		await room.onMessage(b, JSON.stringify(request));
		expect(b.last('interactions')?.locations).toHaveLength(1);
		expect(b.last('interactions')?.replyTo).toBe('player-bbbb');
		room.onClose(a);
		expect(b.last('interactions')?.locations).toHaveLength(0);
		await room.onMessage(
			b,
			JSON.stringify({ ...request, location: { ...request.location, locationId: 'missing' } })
		);
		expect(b.last('interactions')?.locations).toHaveLength(0);
		await room.onMessage(b, JSON.stringify(request));
		expect(b.last('interactions')?.locations[0].playerId).toBe('player-bbbb');
		await room.onMessage(b, JSON.stringify({ t: 'interaction', location: null }));
		expect(b.last('interactions')?.locations).toEqual([]);
	});
});
