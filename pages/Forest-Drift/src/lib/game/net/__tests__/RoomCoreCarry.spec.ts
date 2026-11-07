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
	CLIENT_LEAVE_CODE,
	GENERATOR_VERSION,
	POSE_FLAGS,
	PROTOCOL_VERSION,
	encodePose,
	type HelloMessage,
	type ServerJsonMessage,
	type SharedEnvironment
} from '../protocol';
import { generatePopulationCell, regionSpecies } from '../../creatures/CreaturePopulationSystem';
import { generateIndividual } from '../../creatures/IndividualGenerator';
import { WorldStore, publishedRows } from '../WorldStore';
import { flattenWorld, type AuthoredContent } from '../worldEntities';
import { abilityFor } from '../../creatures/creatureAbilities';
import type { CreatureWorldAccess } from '../../creatures/CreatureTypes';

/** Ranged weapons Phase 2: the room decides who carries which creature. */

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

const SEED = 'forest';
const flat: CreatureWorldAccess = { surface: () => 0, blocked: () => false };

/** Real carryable and too-big ambient creatures of the test world, with where they spawn. */
function creatures() {
	const small: { id: string; x: number; z: number }[] = [];
	const big: { id: string; x: number; z: number }[] = [];
	for (let x = 0; x < 6; x++)
		for (const spawn of generatePopulationCell(SEED, x, 1, 1, flat)) {
			const entry = { id: spawn.id, x: spawn.position.x, z: spawn.position.z };
			(abilityFor({ species: spawn.species, individual: spawn.individual }) ? small : big).push(
				entry
			);
		}
	if (small.length < 2 || big.length < 1) throw new Error('test world lacks creatures');
	return { small, big };
}

function setup(
	options: {
		seed?: string | null;
		persistence?: MemoryPersistence;
		session?: RoomSessionState | null;
		store?: WorldStore;
	} = {}
) {
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
		fallDamage: true,
		authorize: fakeAuthorize,
		persistence,
		worldSeed: options.seed === undefined ? () => SEED : (options.seed ?? undefined),
		...(options.store ? { store: options.store } : {}),
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
			yaw: 0.5,
			pitch: 0
		})
	);
}

let messageId = 1;
function carry(room: RoomCore, conn: FakeConnection, creature: string) {
	const id = messageId++;
	room.onMessage(conn, JSON.stringify({ t: 'carry', id, creature }));
	return conn.all('carryResult').find((m) => m.id === id);
}
function drop(room: RoomCore, conn: FakeConnection, at: [number, number, number, number]) {
	room.onMessage(conn, JSON.stringify({ t: 'drop', id: messageId++, at }));
}

const env = (creatureProjectiles: boolean): SharedEnvironment => ({
	anchor: { roomSeconds: 0, timeOfDay: 0.4, weatherTime: 0 },
	sky: {},
	weather: {},
	rules: { creatureProjectiles }
});

describe('RoomCore — carrying creatures', () => {
	it('grants a nearby carryable creature and tells everyone, including late joiners', async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		standAt(room, a, small[0].x, small[0].z, now());
		expect(carry(room, a, small[0].id)).toMatchObject({ ok: true });
		const slotA = a.last('welcome')!.slot;
		expect(b.last('carried')).toEqual({ t: 'carried', slot: slotA, creature: small[0].id });
		expect(a.all('carried')).toHaveLength(0);
		const c = await join(room, 'player-cccc');
		expect(c.last('welcome')!.carries).toEqual([{ slot: slotA, creature: small[0].id }]);
		expect(room.stats.carriesGranted).toBe(1);
	});

	it('gives a creature to the first claim only', async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		standAt(room, a, small[0].x, small[0].z, now());
		standAt(room, b, small[0].x + 1, small[0].z, now());
		expect(carry(room, a, small[0].id)?.ok).toBe(true);
		expect(carry(room, b, small[0].id)).toMatchObject({ ok: false, reason: 'taken' });
	});

	it('refuses creatures that are too big, malformed or from another world', async () => {
		const { room, now } = setup();
		const { small, big } = creatures();
		const a = await join(room, 'player-aaaa');
		standAt(room, a, big[0].x, big[0].z, now());
		expect(carry(room, a, big[0].id)).toMatchObject({ ok: false, reason: 'ineligible' });
		expect(carry(room, a, 'group:forest:nonsense')).toMatchObject({ reason: 'ineligible' });
		expect(carry(room, a, small[0].id.replace(':forest:', ':other:'))).toMatchObject({
			reason: 'ineligible'
		});
		// Lab-placed creatures arrive with Phase 2b.
		expect(carry(room, a, 'placed_x_1')).toMatchObject({ reason: 'ineligible' });
		expect(room.stats.carriesRefused).toBe(4);
	});

	it('lets a player carry wherever they are: herds differ between browsers, and the room sleeps', async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		standAt(room, a, small[0].x + 500, small[0].z, now());
		expect(carry(room, a, small[0].id)?.ok).toBe(true);
	});

	it('refuses everything when the room has no world seed', async () => {
		const { room, now } = setup({ seed: null });
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		standAt(room, a, small[0].x, small[0].z, now());
		expect(carry(room, a, small[0].id)).toMatchObject({ ok: false, reason: 'ineligible' });
	});

	it('allows one creature per player, needs a known position, and lets viewers carry', async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const v = await join(room, 'player-vvvv', 'viewer-token-00000');
		expect(carry(room, v, small[0].id)).toMatchObject({ ok: false, reason: 'state' });
		standAt(room, v, small[0].x, small[0].z, now());
		expect(carry(room, v, small[0].id)?.ok).toBe(true);
		standAt(room, v, small[1].x, small[1].z, now());
		expect(carry(room, v, small[1].id)).toMatchObject({ ok: false, reason: 'state' });
	});

	it('ignores repeated or old message ids', async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		standAt(room, a, small[0].x, small[0].z, now());
		room.onMessage(a, JSON.stringify({ t: 'carry', id: 10_000, creature: small[0].id }));
		room.onMessage(a, JSON.stringify({ t: 'carry', id: 9_999, creature: small[1].id }));
		expect(a.all('carryResult')).toHaveLength(1);
		messageId = 10_001;
	});

	it('puts a creature down near the player, or at their feet when the spot is too far', async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		const { x, z } = small[0];
		standAt(room, a, x, z, now());
		carry(room, a, small[0].id);
		drop(room, a, [x + 1, 0, z, 1.2]);
		expect(a.last('carried')).toMatchObject({ creature: null, at: [x + 1, 0, z, 1.2] });
		expect(b.last('carried')).toMatchObject({ creature: null, at: [x + 1, 0, z, 1.2] });
		carry(room, a, small[0].id);
		drop(room, a, [x + 50, 0, z, 0]);
		const feet = b.last('carried')!;
		expect(feet.creature).toBeNull();
		[x, 0, z, 0.5].forEach((value, i) => expect(feet.at![i]).toBeCloseTo(value, 3));
	});

	it('lets a creature carried far from home be picked up again where it was put down', async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		const { x, z } = small[0];
		standAt(room, a, x, z, now());
		carry(room, a, small[0].id);
		standAt(room, a, x + 300, z, now() + 1);
		drop(room, a, [x + 300.5, 0, z, 0]);
		expect(carry(room, a, small[0].id)?.ok).toBe(true);
	});

	it('puts the creature down when its carrier is knocked out', async () => {
		const { room, now, advance } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		standAt(room, a, small[0].x, small[0].z, now());
		carry(room, a, small[0].id);
		advance(2500);
		room.onMessage(a, JSON.stringify({ t: 'fall', id: 1, d: 40, at: now() }));
		expect(a.last('health')!.state.dead).toBe(true);
		expect(b.last('carried')).toMatchObject({ creature: null });
	});

	it('keeps a carry through a dropped connection, and releases it when the grace period ends', async () => {
		const { room, now, advance } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		standAt(room, a, small[0].x, small[0].z, now());
		carry(room, a, small[0].id);
		room.onClose(a, 1006);
		expect(b.all('carried')).toHaveLength(1);
		advance(31_000);
		room.onAlarm();
		expect(b.last('carried')).toMatchObject({ creature: null });
	});

	it('releases at once on a deliberate leave', async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		standAt(room, a, small[0].x, small[0].z, now());
		carry(room, a, small[0].id);
		room.onClose(a, CLIENT_LEAVE_CODE);
		expect(b.last('carried')).toMatchObject({ creature: null });
	});

	it("follows the owner's rule: off refuses pick-ups and puts every creature down", async () => {
		const { room, now } = setup();
		const { small } = creatures();
		const owner = await join(room, 'player-oooo', 'owner-token-000000');
		const a = await join(room, 'player-aaaa');
		standAt(room, a, small[0].x, small[0].z, now());
		carry(room, a, small[0].id);
		room.onMessage(owner, JSON.stringify({ t: 'env', env: env(false) }));
		expect(a.last('carried')).toMatchObject({ creature: null });
		expect(carry(room, a, small[0].id)).toMatchObject({ ok: false, reason: 'rule' });
		room.onMessage(owner, JSON.stringify({ t: 'env', env: env(true) }));
		expect(carry(room, a, small[0].id)?.ok).toBe(true);
	});

	it('survives the room sleeping: carries come back for players still here', async () => {
		const first = setup();
		const { small } = creatures();
		const a = await join(first.room, 'player-aaaa');
		standAt(first.room, a, small[0].x, small[0].z, first.now());
		carry(first.room, a, small[0].id);
		const saved = first.persistence.session!;
		expect(saved.carries).toEqual([{ playerId: 'player-aaaa', creature: small[0].id }]);

		const woken = setup({ session: saved });
		woken.room.restore([{ conn: a, attachment: a.attachment }]);
		const b = await join(woken.room, 'player-bbbb');
		expect(b.last('welcome')!.carries).toEqual([
			{ slot: a.attachment!.slot, creature: small[0].id }
		]);

		// Nobody reconnected: the stale carry is dropped.
		const empty = setup({ session: saved });
		empty.room.restore([]);
		const c = await join(empty.room, 'player-cccc');
		expect(c.last('welcome')!.carries).toEqual([]);
	});

	it('lets nothing fire without a carry', async () => {
		const { room, now } = setup();
		const a = await join(room, 'player-aaaa');
		room.onMessage(
			a,
			JSON.stringify({ t: 'shoot', shot: 1, origin: [0, 1.6, 0], dir: [0, 0, -1], at: now() })
		);
		expect(a.last('shotResult')).toMatchObject({ shot: 1, hit: false, refused: true });
		expect(room.stats.shotsRefused).toBe(1);
	});
});

describe('RoomCore — creature pellets', () => {
	/** Carrier A holds a creature at its spawn; target B stands 10 m in front (−Z). */
	async function duel() {
		const ctx = setup();
		const { room, now, advance } = ctx;
		const { small } = creatures();
		const { x, z } = small[0];
		const owner = await join(room, 'player-oooo', 'owner-token-000000');
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		standAt(room, a, x, z, now());
		standAt(room, b, x, z - 10, now());
		carry(room, a, small[0].id);
		advance(2500); // past the join grace period
		let shot = 0;
		const shoot = (at = now(), origin: number[] = [x, 1.3, z], dir: number[] = [0, 0, -1]) => {
			shot++;
			room.onMessage(a, JSON.stringify({ t: 'shoot', shot, origin, dir, at }));
			return shot;
		};
		const hit = (id: number, target: number, at: number) =>
			room.onMessage(
				a,
				JSON.stringify({ t: 'shotHit', shot: id, target, at, point: [x, 1, z - 10] })
			);
		const slotB = b.last('welcome')!.slot;
		const slotA = a.last('welcome')!.slot;
		return { ...ctx, owner, a, b, x, z, shoot, hit, slotA, slotB, creature: small[0].id };
	}

	it('tells everyone else to draw an accepted pellet, in the creature colour', async () => {
		const { a, b, shoot, room, slotA } = await duel();
		const id = shoot();
		expect(b.last('shot')).toMatchObject({ slot: slotA, shot: id, dir: [0, 0, -1] });
		expect(b.last('shot')!.colour).toMatch(/^#[0-9a-f]{6}$/);
		expect(a.all('shot')).toHaveLength(0);
		expect(room.stats.shotsFired).toBe(1);
	});

	it('costs the target 3 points for a hit on its path, and tells only the shooter it landed', async () => {
		const { a, b, shoot, hit, slotA, slotB, now } = await duel();
		const at = now();
		const id = shoot(at);
		hit(id, slotB, at + 290);
		expect(a.last('shotResult')).toMatchObject({ shot: id, hit: true });
		const health = b.last('health')!;
		expect(health.state.base).toBe(33);
		expect(health.source).toMatchObject({ kind: 'projectile', by: slotA });
		expect(typeof (health.source as { species: string }).species).toBe('string');
		// The same shot can't land twice.
		hit(id, slotB, at + 290);
		expect(b.all('health')).toHaveLength(1);
	});

	it("doesn't believe hits far from the pellet's path, too late, or on the shooter", async () => {
		const { a, b, shoot, hit, slotA, slotB, now, room, x, z } = await duel();
		const at = now();
		const sideways = shoot(at, [x, 1.3, z], [1, 0, 0]);
		hit(sideways, slotB, at + 290);
		expect(a.last('shotResult')).toMatchObject({ shot: sideways, hit: false });
		const late = shoot(at + 400);
		hit(late, slotB, at + 400 + 3000);
		expect(a.last('shotResult')).toMatchObject({ shot: late, hit: false });
		const self = shoot(at + 800);
		hit(self, slotA, at + 800 + 10);
		expect(a.last('shotResult')).toMatchObject({ shot: self, hit: false });
		expect(b.all('health')).toHaveLength(0);
		expect(room.stats.shotHitsRejected).toBe(2);
	});

	it('refuses pellets from far off, off the clock, or after the charges run out', async () => {
		const { a, shoot, now, x, z, room, advance } = await duel();
		shoot(now(), [x + 20, 1.3, z]);
		expect(a.last('shotResult')).toMatchObject({ refused: true });
		shoot(now() + 5000);
		expect(a.last('shotResult')).toMatchObject({ refused: true });
		// The room clock moves with the shots, as it would in play.
		for (let i = 0; i < 5; i++) {
			shoot(now());
			advance(350);
		}
		advance(-250);
		shoot(now()); // 100 ms after the fifth: inside the 350 ms gap, refused
		// One charge has come back by 1.5 s; the room says so, for the HUD.
		expect(a.last('shotResult')).toMatchObject({ refused: true, charges: 1 });
		advance(250);
		shoot(now()); // allowed: the regenerated charge
		const refusedBefore = room.stats.shotsRefused;
		advance(350);
		shoot(now()); // the next charge isn't back yet
		expect(room.stats.shotsRefused).toBe(refusedBefore + 1);
		expect(room.stats.shotsFired).toBe(6);
	});

	it('refuses pellets once the owner switches the rule off, or the creature is put down', async () => {
		const { a, owner, shoot, now, room, x, z } = await duel();
		room.onMessage(owner, JSON.stringify({ t: 'env', env: env(false) }));
		shoot(now());
		expect(a.last('shotResult')).toMatchObject({ refused: true });
		room.onMessage(owner, JSON.stringify({ t: 'env', env: env(true) }));
		shoot(now() + 400);
		expect(a.last('shotResult')).toMatchObject({ refused: true }); // the rule put it down
		drop(room, a, [x, 0, z, 0]);
		expect(room.stats.shotsFired).toBe(0);
	});

	it('still counts a pellet that lands after its creature was put down', async () => {
		const { a, b, shoot, hit, slotB, now, room, x, z } = await duel();
		const at = now();
		const id = shoot(at);
		drop(room, a, [x, 0, z, 0]);
		hit(id, slotB, at + 290);
		expect(a.last('shotResult')).toMatchObject({ shot: id, hit: true });
		expect(b.last('health')!.state.base).toBe(33);
	});
});

describe('RoomCore — carrying Lab-placed creatures (F2)', () => {
	const small = regionSpecies(SEED, 0, 0)[0];
	const placed = {
		id: 'placed_cr_test_1',
		species: small,
		individual: generateIndividual(small, 5),
		position: { x: 10, y: 0, z: 10 },
		heading: 0,
		state: 'IDLE'
	};
	function world() {
		const content = {
			foundations: [],
			buildings: [],
			buildingLevels: [],
			barriers: [],
			furniture: [],
			miniBuilds: { definitions: [], instances: [] },
			musicTrees: [],
			musicPlants: [],
			proceduralOverrides: { removedTreeIds: [] },
			placedCreatures: [placed]
		} as unknown as AuthoredContent;
		const store = new WorldStore({ rows: publishedRows(flattenWorld(content)), seq: 1, epoch: 1 });
		return setup({ store });
	}

	it('lets an editor near its saved spot carry it', async () => {
		const { room, now } = world();
		const a = await join(room, 'player-aaaa');
		standAt(room, a, 12, 10, now());
		expect(carry(room, a, placed.id)).toMatchObject({ ok: true });
	});

	it('lets viewers carry it too (their put-down just isn’t saved)', async () => {
		const { room, now } = world();
		const v = await join(room, 'player-vvvv', 'viewer-token-00000');
		standAt(room, v, 12, 10, now());
		expect(carry(room, v, placed.id)?.ok).toBe(true);
	});

	it('takes it from the carrier when someone removes it from the world', async () => {
		const { room, now } = world();
		const owner = await join(room, 'player-oooo', 'owner-token-000000');
		const a = await join(room, 'player-aaaa');
		standAt(room, a, 12, 10, now());
		carry(room, a, placed.id);
		room.onMessage(
			owner,
			JSON.stringify({
				t: 'ops',
				batchId: 'batch-remove-0001',
				ops: [{ op: 'del', kind: 'creature', id: placed.id }]
			})
		);
		expect(owner.last('commit')).toBeDefined();
		expect(a.last('carried')).toMatchObject({ creature: null });
	});

	it("refuses rows that aren't creatures", async () => {
		const { room } = world();
		const owner = await join(room, 'player-oooo', 'owner-token-000000');
		room.onMessage(
			owner,
			JSON.stringify({
				t: 'ops',
				batchId: 'batch-bad-000001',
				ops: [{ op: 'add', kind: 'creature', id: 'placed_bad', data: { id: 'placed_bad' } }]
			})
		);
		expect(owner.last('reject')).toBeDefined();
	});
});

describe('RoomCore — robustness of carrying and firing', () => {
	it('accepts a reloaded page whose message ids start again, inside the grace period', async () => {
		const { room, now, advance } = setup();
		const { small } = creatures();
		const { x, z } = small[0];
		const first = await join(room, 'player-aaaa');
		standAt(room, first, x, z, now());
		carry(room, first, small[0].id);
		advance(2500);
		for (let shot = 1; shot <= 3; shot++) {
			room.onMessage(
				first,
				JSON.stringify({
					t: 'shoot',
					shot: shot * 10,
					origin: [x, 1.3, z],
					dir: [0, 0, -1],
					at: now()
				})
			);
			advance(400);
		}
		expect(room.stats.shotsFired).toBe(3);
		room.onClose(first, 1006); // the page reloads: the socket drops, the slot is held

		const second = await join(room, 'player-aaaa');
		standAt(room, second, x, z, now());
		// The reloaded page numbers from 1 again; the room must not ignore it.
		room.onMessage(
			second,
			JSON.stringify({ t: 'shoot', shot: 1, origin: [x, 1.3, z], dir: [0, 0, -1], at: now() })
		);
		expect(room.stats.shotsFired).toBe(4);
		// Its carry and drop ids start from 1 too (one counter for both, as MultiplayerSession has).
		room.onMessage(second, JSON.stringify({ t: 'drop', id: 1, at: [x, 0, z, 0] }));
		expect(second.last('carried')).toMatchObject({ creature: null });
		room.onMessage(second, JSON.stringify({ t: 'carry', id: 2, creature: small[0].id }));
		expect(second.last('carryResult')).toMatchObject({ id: 2, ok: true });
	});

	it('forgives a few ms of clock wobble between two quick shots, but not a burst', async () => {
		const { room, now, advance } = setup();
		const { small } = creatures();
		const { x, z } = small[0];
		const a = await join(room, 'player-aaaa');
		standAt(room, a, x, z, now());
		carry(room, a, small[0].id);
		advance(2500);
		const shoot = (shot: number, at: number) =>
			room.onMessage(
				a,
				JSON.stringify({ t: 'shoot', shot, origin: [x, 1.3, z], dir: [0, 0, -1], at })
			);
		const t0 = now();
		shoot(1, t0);
		shoot(2, t0 + 320); // the client waited 350 ms; its clock estimate moved 30 ms
		expect(room.stats.shotsFired).toBe(2);
		shoot(3, t0 + 320 + 200); // a real burst
		expect(room.stats.shotsFired).toBe(2);
	});

	it('checks hits against where a moving target was when the shooter saw it (lag compensation)', async () => {
		const { room, now, advance } = setup();
		const { small } = creatures();
		const { x, z } = small[0];
		const a = await join(room, 'player-aaaa');
		const b = await join(room, 'player-bbbb');
		standAt(room, a, x, z, now());
		standAt(room, b, x, z - 10, now());
		carry(room, a, small[0].id);
		advance(2500);
		const slotB = b.last('welcome')!.slot;
		const fire = (shot: number, at: number) =>
			room.onMessage(
				a,
				JSON.stringify({ t: 'shoot', shot, origin: [x, 1.3, z], dir: [0, 0, -1], at })
			);
		const walk = (dx: number, at: number) =>
			room.onMessage(
				b,
				encodePose({
					flags: POSE_FLAGS.grounded | POSE_FLAGS.moving | POSE_FLAGS.running,
					seq: 0,
					sampleTime: at,
					x: x + dx,
					y: 0,
					z: z - 10,
					yaw: 0,
					pitch: 0
				})
			);
		// B is on the pellet's path at t0, then runs 7 m sideways before the hit report arrives.
		const t0 = now();
		walk(0, t0);
		fire(1, t0 - 286);
		for (let i = 1; i <= 7; i++) walk(i, t0 + i * 100);
		advance(700);
		room.onMessage(
			a,
			JSON.stringify({ t: 'shotHit', shot: 1, target: slotB, at: t0, point: [x, 1, z - 10] })
		);
		expect(a.last('shotResult')).toMatchObject({ shot: 1, hit: true });

		// A target that was never near the path still can't be hit.
		advance(400);
		fire(2, now());
		room.onMessage(
			a,
			JSON.stringify({
				t: 'shotHit',
				shot: 2,
				target: slotB,
				at: now() + 286,
				point: [x, 1, z - 10]
			})
		);
		expect(a.last('shotResult')).toMatchObject({ shot: 2, hit: false });
	});
});
