import { describe, expect, it } from 'vitest';
import {
	RoomCore,
	type AuthResult,
	type PlayerAttachment,
	type RoomConnection,
	type RoomPersistence
} from '../RoomCore';
import {
	GENERATOR_VERSION,
	POSE_FLAGS,
	PROTOCOL_VERSION,
	encodePose,
	type HelloMessage,
	type ServerJsonMessage
} from '../protocol';
import { PUNCH_COOLDOWN_MS, PUNCH_DAMAGE } from '../../player/punch';
import { HEALTH_MAX } from '../../player/PlayerHealth';

/** Multiplayer stats: the room credits hits and knockouts, shares them and keeps them. */

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
	all<T extends ServerJsonMessage['t']>(t: T): Extract<ServerJsonMessage, { t: T }>[] {
		return this.json.filter((m) => m.t === t) as Extract<ServerJsonMessage, { t: T }>[];
	}
	last<T extends ServerJsonMessage['t']>(t: T): Extract<ServerJsonMessage, { t: T }> | undefined {
		return this.all(t).at(-1);
	}
}

class MemoryPersistence implements RoomPersistence {
	scores: string | null = null;
	saveGrace(): void {}
	saveClock(): void {}
	saveEnv(): void {}
	saveSessionState(): void {}
	saveScores(json: string): void {
		this.scores = json;
	}
}

async function authorize(hello: HelloMessage): Promise<AuthResult> {
	const role = hello.invite === 'owner-token-000000' ? 'owner' : 'editor';
	return { ok: true, role, capability: null, via: 'invite' };
}

function setup(persistence = new MemoryPersistence()) {
	let now = 1_000_000;
	const room = new RoomCore({
		world: {
			worldId: 'world-1234',
			name: 'Test',
			schemaVersion: 9,
			generatorVersion: GENERATOR_VERSION
		},
		now: () => now,
		authorize,
		persistence,
		restored: { scoresJson: persistence.scores }
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
			name: playerId.replace('player-', ''),
			colour: '#336699',
			invite: owner ? 'owner-token-000000' : 'editor-token-00000',
			capability: null
		})
	);
	return conn;
}

/** A (owner) at the origin facing B, 1.5 m away: close enough to punch. */
async function face() {
	const ctx = setup();
	const a = await join(ctx.room, 'player-olive', true);
	const b = await join(ctx.room, 'player-bob');
	ctx.advance(2500); // past the newcomers' grace period
	for (const [conn, z] of [
		[a, 0],
		[b, -1.5]
	] as const)
		ctx.room.onMessage(
			conn,
			encodePose({
				flags: POSE_FLAGS.grounded,
				seq: 0,
				sampleTime: ctx.now(),
				x: 0,
				y: 0,
				z,
				yaw: 0,
				pitch: 0
			})
		);
	return { ...ctx, a, b };
}

let punchId = 1;
const punch = (room: RoomCore, conn: FakeConnection) =>
	room.onMessage(conn, JSON.stringify({ t: 'punch', id: punchId++, target: 1 }));

describe('RoomCore — multiplayer stats', () => {
	it('credits each landed punch as a hit, and the last one as a knockout, for everyone to see', async () => {
		const { room, a, b, advance, persistence } = await face();
		punch(room, a);
		expect(b.last('scores')).toEqual({
			t: 'scores',
			entries: [{ playerId: 'player-olive', name: 'olive', hits: 1, knockouts: 0, knockedOut: 0 }]
		});
		const toKnockOut = HEALTH_MAX / PUNCH_DAMAGE;
		for (let i = 1; i < toKnockOut; i++) {
			advance(PUNCH_COOLDOWN_MS);
			punch(room, a);
		}
		expect(a.last('scores')!.entries).toEqual([
			{ playerId: 'player-olive', name: 'olive', hits: toKnockOut, knockouts: 1, knockedOut: 0 },
			{ playerId: 'player-bob', name: 'bob', hits: 0, knockouts: 0, knockedOut: 1 }
		]);
		// Punching someone already knocked out isn't a hit.
		advance(PUNCH_COOLDOWN_MS);
		const sent = a.all('scores').length;
		punch(room, a);
		expect(a.all('scores')).toHaveLength(sent);
		expect(JSON.parse(persistence.scores!)).toHaveLength(2);
	});

	it('shows the stats to people who join later, and after the room restarts', async () => {
		const { room, a, persistence } = await face();
		punch(room, a);
		const late = await join(room, 'player-late');
		expect(late.last('welcome')!.scores).toEqual([
			{ playerId: 'player-olive', name: 'olive', hits: 1, knockouts: 0, knockedOut: 0 }
		]);
		const restarted = setup(persistence);
		const back = await join(restarted.room, 'player-bob');
		expect(back.last('welcome')!.scores).toHaveLength(1);
	});

	it("lets only the world's owner reset everyone's stats", async () => {
		const { room, a, b, persistence } = await face();
		punch(room, a);
		room.onMessage(b, JSON.stringify({ t: 'resetScores' }));
		expect(b.last('scores')!.replace).toBeUndefined();
		room.onMessage(a, JSON.stringify({ t: 'resetScores' }));
		expect(b.last('scores')).toEqual({ t: 'scores', entries: [], replace: true });
		expect(JSON.parse(persistence.scores!)).toEqual([]);
	});
});
