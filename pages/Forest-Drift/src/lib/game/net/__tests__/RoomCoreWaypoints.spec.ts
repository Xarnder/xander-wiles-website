import { describe, expect, it } from 'vitest';
import {
	RoomCore,
	type AuthResult,
	type PlayerAttachment,
	type RoomConnection,
	type RoomPersistence
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
import type { WaypointDraft } from '../sharedWaypoints';

/** Public waypoints: the room keeps them, shares them, applies the rules and saves them. */

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
	waypoints: string | null = null;
	saves = 0;
	saveGrace(): void {}
	saveClock(): void {}
	saveEnv(): void {}
	saveSessionState(): void {}
	saveWaypoints(json: string): void {
		this.waypoints = json;
		this.saves++;
	}
}

async function authorize(hello: HelloMessage): Promise<AuthResult> {
	const role =
		hello.invite === 'owner-token-000000'
			? 'owner'
			: hello.invite === 'viewer-token-00000'
				? 'viewer'
				: 'editor';
	return { ok: true, role, capability: null, via: 'invite' };
}

function room(persistence = new MemoryPersistence()) {
	return new RoomCore({
		world: {
			worldId: 'world-1234',
			name: 'Test',
			schemaVersion: 9,
			generatorVersion: GENERATOR_VERSION
		},
		now: () => 1_000_000,
		authorize,
		persistence,
		restored: { waypointsJson: persistence.waypoints }
	});
}

async function join(core: RoomCore, playerId: string, invite = 'editor-token-00000') {
	const conn = new FakeConnection();
	await core.onMessage(
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
			invite,
			capability: null
		})
	);
	core.onMessage(
		conn,
		encodePose({
			flags: POSE_FLAGS.grounded | POSE_FLAGS.teleport,
			seq: 0,
			sampleTime: 1_000_000,
			x: 0,
			y: 0,
			z: 0,
			yaw: 0,
			pitch: 0
		})
	);
	return conn;
}

const camp: WaypointDraft = {
	id: 'wp-camp',
	name: 'Camp',
	colour: '#4fb3ff',
	x: 12,
	y: 1,
	z: -4,
	on: true,
	othersCanControl: false
};
const send = (core: RoomCore, conn: FakeConnection, message: object) =>
	core.onMessage(conn, JSON.stringify({ t: 'waypoint', ...message }));

describe('RoomCore — public waypoints', () => {
	it('shares a published waypoint with everyone now, and everyone who joins later', async () => {
		const persistence = new MemoryPersistence();
		const core = room(persistence);
		const sam = await join(core, 'player-sam');
		const alex = await join(core, 'player-alex', 'viewer-token-00000');
		send(core, sam, { op: 'put', waypoint: camp });
		const stamped = { ...camp, owner: 'player-sam', ownerName: 'sam' };
		expect(alex.last('waypoints')).toEqual({ t: 'waypoints', put: [stamped] });
		// The sender gets the room's stamped copy too.
		expect(sam.last('waypoints')).toEqual({ t: 'waypoints', put: [stamped] });
		const late = await join(core, 'player-late');
		expect(late.last('welcome')!.waypoints).toEqual([stamped]);
		expect(JSON.parse(persistence.waypoints!)).toEqual([stamped]);
	});

	it('lets others control it only when allowed, and only ever its creator manage it', async () => {
		const core = room();
		const sam = await join(core, 'player-sam');
		const alex = await join(core, 'player-alex', 'viewer-token-00000');
		send(core, sam, { op: 'put', waypoint: camp });
		send(core, alex, { op: 'set', id: 'wp-camp', on: false });
		expect(alex.last('waypoints')).toMatchObject({
			put: [{ on: true }],
			refused: { id: 'wp-camp', reason: 'rights' }
		});
		// The refusal went to Alex alone.
		expect(sam.all('waypoints').some((m) => m.refused)).toBe(false);
		send(core, sam, { op: 'put', waypoint: { ...camp, othersCanControl: true } });
		send(core, alex, { op: 'set', id: 'wp-camp', on: false, name: 'Old oak' });
		expect(sam.last('waypoints')).toMatchObject({
			put: [{ on: false, name: 'Old oak', changedBy: 'alex' }]
		});
		send(core, alex, { op: 'remove', id: 'wp-camp' });
		expect(alex.last('waypoints')?.refused?.reason).toBe('rights');
		send(core, sam, { op: 'remove', id: 'wp-camp' });
		expect(alex.last('waypoints')).toEqual({ t: 'waypoints', remove: ['wp-camp'] });
		expect(core.stats.waypointsRefused).toBe(2);
	});

	it('keeps public waypoints when everyone leaves and after the room restarts', async () => {
		const persistence = new MemoryPersistence();
		const first = room(persistence);
		const sam = await join(first, 'player-sam');
		send(first, sam, { op: 'put', waypoint: camp });
		first.onClose(sam, CLIENT_LEAVE_CODE);
		const again = await join(first, 'player-alex');
		expect(again.last('welcome')!.waypoints).toHaveLength(1);
		// A fresh room (restart or wake) restores them from storage.
		const restarted = room(persistence);
		const back = await join(restarted, 'player-sam');
		expect(back.last('welcome')!.waypoints).toEqual([
			{ ...camp, owner: 'player-sam', ownerName: 'sam' }
		]);
	});

	it("lets the world's owner remove anyone's public waypoint", async () => {
		const core = room();
		const sam = await join(core, 'player-sam');
		const olive = await join(core, 'player-olive', 'owner-token-000000');
		send(core, sam, { op: 'put', waypoint: camp });
		send(core, olive, { op: 'remove', id: 'wp-camp' });
		expect(sam.last('waypoints')).toEqual({ t: 'waypoints', remove: ['wp-camp'] });
	});
});
