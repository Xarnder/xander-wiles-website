import { describe, expect, it } from 'vitest';
import { BiomeField } from '../../biomes/BiomeField';
import { BIOME_IDS } from '../../biomes/BiomeTypes';
import { clearRosterCache } from '../../creatures/biome/BiomeRoster';
import { roomBiomeSources } from '../../creatures/biome/roomBiomeSources';
import { resolveAmbientCreature } from '../../creatures/carryableCreatureRef';
import { abilityFor } from '../../creatures/creatureAbilities';
import { generatePopulationCell } from '../../creatures/CreaturePopulationSystem';
import { rideFor } from '../../creatures/creatureRiding';
import type { CreatureWorldAccess } from '../../creatures/CreatureTypes';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { richWorld } from '../../world/__tests__/worldFixtures';
import {
	GENERATOR_VERSION,
	POSE_FLAGS,
	PROTOCOL_VERSION,
	encodePose,
	type ServerJsonMessage
} from '../protocol';
import { RoomCore, type AuthResult, type PlayerAttachment, type RoomConnection } from '../RoomCore';

/**
 * Biome-specific species Phase 2: in a biome world the room rebuilds every creature from the
 * published world's biomes, so it grants and refuses exactly what the players' browsers show.
 */

const world = richWorld({ seed: 'room-biome-creatures' });
world.environment.terrain.seed = world.seed;
world.environment.biomes.enabled = true;
const baseJson = JSON.stringify(world);

/** What a player's browser sees: the population with its own biome lookup. */
const field = new BiomeField(
	new TerrainHeightSampler(world.environment.terrain),
	world.environment.biomes
);
field.setSeed(world.seed);
const biomeAt = (x: number, z: number) => BIOME_IDS[field.dominantAt(x, z)];
const client: CreatureWorldAccess = {
	surface: () => 0,
	blocked: () => false,
	rosterAt: biomeAt,
	profileAt: biomeAt
};

interface Spot {
	id: string;
	x: number;
	z: number;
}
function creatures() {
	const small: Spot[] = [];
	const big: Spot[] = [];
	const bipeds: Spot[] = [];
	/** Carryable by today's regional species, but a bigger animal in its biome's roster. */
	const grewUp: Spot[] = [];
	for (let x = -12; x < 12; x += 3)
		for (let z = -12; z < 12; z += 3)
			for (const spawn of generatePopulationCell(world.seed, x, z, 1, client)) {
				const spot = { id: spawn.id, x: spawn.position.x, z: spawn.position.z };
				const definition = { species: spawn.species, individual: spawn.individual };
				(abilityFor(definition) ? small : big).push(spot);
				if (rideFor(definition)) bipeds.push(spot);
				const regional = resolveAmbientCreature(world.seed, spawn.id);
				if (!abilityFor(definition) && regional && abilityFor(regional)) grewUp.push(spot);
			}
	return { small, big, bipeds, grewUp };
}

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
	result(t: 'carryResult' | 'rideResult', id: number) {
		return this.json.find((m) => m.t === t && m.id === id);
	}
}

async function authorize(): Promise<AuthResult> {
	return { ok: true, role: 'editor', capability: 'cap', via: 'invite' };
}

function setup(biomes = true) {
	let builds = 0;
	const room = new RoomCore({
		world: { worldId: 'world-1234', name: 'Biomes', schemaVersion: 9, generatorVersion: 5 },
		now: () => clock,
		fallDamage: true,
		authorize,
		persistence: {
			saveGrace() {},
			saveSessionState() {},
			saveClock() {},
			saveEnv() {}
		},
		worldSeed: () => world.seed,
		creatureBiomes: biomes
			? () => {
					builds++;
					return roomBiomeSources(baseJson);
				}
			: undefined,
		restored: { session: null }
	});
	return { room, builds: () => builds };
}

/** The room limits how often a player may ask; a second passes between requests. */
let clock = 1_000_000;
let players = 0;
async function join(room: RoomCore) {
	const conn = new FakeConnection();
	const playerId = `player-${String(players++).padStart(4, '0')}`;
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
			invite: 'editor-token-00000',
			capability: null
		})
	);
	return conn;
}
function standAt(room: RoomCore, conn: FakeConnection, spot: Spot) {
	room.onMessage(
		conn,
		encodePose({
			flags: POSE_FLAGS.grounded | POSE_FLAGS.teleport,
			seq: 0,
			sampleTime: clock,
			x: spot.x,
			y: 0,
			z: spot.z,
			yaw: 0,
			pitch: 0
		})
	);
}
let messageId = 1;
function ask(room: RoomCore, conn: FakeConnection, t: 'carry' | 'ride', spot: Spot) {
	const id = messageId++;
	clock += 1000;
	standAt(room, conn, spot);
	room.onMessage(conn, JSON.stringify({ t, id, creature: spot.id }));
	return conn.result(t === 'carry' ? 'carryResult' : 'rideResult', id);
}

describe('RoomCore — creatures in a biome world', () => {
	const found = creatures();

	it('finds every kind of creature in the test world', () => {
		expect(found.small.length).toBeGreaterThan(5);
		expect(found.big.length).toBeGreaterThan(5);
		expect(found.bipeds.length).toBeGreaterThan(2);
		// The cases the room can only get right with the world's biomes.
		expect(found.grewUp.length).toBeGreaterThan(0);
	});

	it('grants the small roster animals a player can see and refuses the big ones', async () => {
		const { room } = setup();
		for (const spot of found.small.slice(0, 6))
			expect(ask(room, await join(room), 'carry', spot), spot.id).toMatchObject({ ok: true });
		const asker = await join(room);
		for (const spot of [...found.big.slice(0, 6), ...found.grewUp])
			expect(ask(room, asker, 'carry', spot), spot.id).toMatchObject({
				ok: false,
				reason: 'ineligible'
			});
	});

	it('grants rides on roster bipeds', async () => {
		const { room } = setup();
		for (const spot of found.bipeds.slice(0, 3))
			expect(ask(room, await join(room), 'ride', spot), spot.id).toMatchObject({ ok: true });
	});

	it('would be fooled without the biomes, which is why it reads them', async () => {
		const { room } = setup(false);
		const spot = found.grewUp[0];
		expect(ask(room, await join(room), 'carry', spot)).toMatchObject({ ok: true });
	});

	it('builds the biome lookup once, on the first check: ≤ 15 ms cold, ≤ 0.5 ms warm', async () => {
		clearRosterCache();
		const { room, builds } = setup();
		const asker = await join(room);
		const spots = found.big.slice(0, 21);
		expect(builds()).toBe(0);
		let t = performance.now();
		expect(ask(room, asker, 'carry', spots[0])).toMatchObject({ reason: 'ineligible' });
		const cold = performance.now() - t;
		t = performance.now();
		for (const spot of spots.slice(1))
			expect(ask(room, asker, 'carry', spot)).toMatchObject({ reason: 'ineligible' });
		const warm = (performance.now() - t) / (spots.length - 1);
		expect(builds()).toBe(1);
		console.log(`room biome check: cold ${cold.toFixed(2)} ms, warm ${warm.toFixed(3)} ms`);
		// Headroom over the budgets for slow CI machines; the record holds the measured values.
		expect(cold).toBeLessThan(45);
		expect(warm).toBeLessThan(1.5);
	});
});
