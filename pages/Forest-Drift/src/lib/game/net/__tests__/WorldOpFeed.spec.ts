import { describe, expect, it } from 'vitest';
import type { CommitMessage, PlayerRole, RejectMessage } from '../protocol';
import { COLLECT_MS, WorldOpFeed, type SharedWorldPort } from '../WorldOpFeed';
import { WorldReplica } from '../WorldReplica';
import { WorldStore, publishedRows } from '../WorldStore';
import {
	canonical,
	flattenWorld,
	unflattenWorld,
	type AuthoredContent,
	type WorldOp
} from '../worldEntities';

/** A tiny published world: two foundations, three walls. */
function publishedContent(): AuthoredContent {
	const wall = (id: string, foundationId: string, z: number) => ({
		id,
		foundationId,
		startGridX: 0,
		startGridZ: z,
		endGridX: 10,
		endGridZ: z,
		baseY: 0,
		height: 3,
		thickness: 0.2,
		openings: [],
		beams: []
	});
	return {
		foundations: [
			{ id: 'f1', minGridX: 0, maxGridX: 10, minGridZ: 0, maxGridZ: 10, topY: 1, bottomY: 0 },
			{ id: 'f2', minGridX: 20, maxGridX: 30, minGridZ: 0, maxGridZ: 10, topY: 1, bottomY: 0 }
		],
		buildings: [
			{
				foundationId: 'f1',
				walls: [wall('w1', 'f1', 0), wall('w2', 'f1', 5)],
				wallPaths: [],
				slabs: [],
				stairs: [],
				roofs: []
			},
			{
				foundationId: 'f2',
				walls: [wall('w3', 'f2', 0)],
				wallPaths: [],
				slabs: [],
				stairs: [],
				roofs: []
			}
		],
		buildingLevels: [],
		barriers: [],
		furniture: [],
		miniBuilds: { definitions: [], instances: [] },
		musicTrees: [],
		musicPlants: [],
		proceduralOverrides: { removedTreeIds: [] }
	};
}

/** Deterministic pseudo-random numbers, so a failure reproduces. */
function rng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9;
		state ^= state >>> 13;
		return (state >>> 0) / 0x100000000;
	};
}

/** A "scene": plain content that local edits change and the feed rebuilds. */
class FakeScene implements SharedWorldPort {
	content: AuthoredContent;
	revision = 0;
	transactionOpen = false;
	constructor(content: AuthoredContent) {
		this.content = structuredClone(content);
	}
	captureContent(): AuthoredContent {
		return structuredClone(this.content);
	}
	contentRevision(): number {
		return this.revision;
	}
	isTransactionOpen(): boolean {
		return this.transactionOpen;
	}
	applyContent(target: AuthoredContent): void {
		this.content = structuredClone(target);
		this.revision++;
	}
	edit(change: (content: AuthoredContent) => void): void {
		change(this.content);
		this.revision++;
	}
}

interface Client {
	id: string;
	scene: FakeScene;
	feed: WorldOpFeed;
	inbox: (CommitMessage | RejectMessage)[];
	notices: string[];
}

function setup(roles: PlayerRole[], seed = 1) {
	const published = publishedContent();
	const store = new WorldStore({ rows: publishedRows(flattenWorld(published)), seq: 1, epoch: 1 });
	let now = 0;
	let nextId = 0;
	const outbox: { client: Client; batchId: string; ops: WorldOp[] }[] = [];
	const clients: Client[] = roles.map((role, index) => {
		const scene = new FakeScene(published);
		const client = { id: `player-${index}`, scene, inbox: [], notices: [] } as unknown as Client;
		client.feed = new WorldOpFeed({
			port: scene,
			replica: new WorldReplica({ rows: store.allRows(), seq: store.seq, epoch: store.epoch }),
			playerId: client.id,
			role: () => role,
			send: (batchId, ops) => {
				outbox.push({ client, batchId, ops: structuredClone(ops) });
				return true;
			},
			notice: (message) => client.notices.push(message),
			confirmDeletion: async () => true,
			requestResync: () => {
				throw new Error(`${client.id} needed a resync`);
			},
			nameOf: (playerId) => playerId || 'the owner',
			createId: () => `batch-${String(++nextId).padStart(6, '0')}`,
			now: () => now
		});
		client.feed.start();
		return client;
	});

	/** The room: commits or refuses each batch in arrival order and tells everyone. */
	const deliverToRoom = () => {
		while (outbox.length > 0) {
			const { client, batchId, ops } = outbox.shift()!;
			const role = roles[clients.indexOf(client)]!;
			const result = store.applyBatch({ playerId: client.id, name: client.id, role }, ops);
			if (!result.ok) {
				client.inbox.push({
					t: 'reject',
					batchId,
					reason: result.reason,
					message: result.message,
					conflicts: result.conflicts
				});
				continue;
			}
			const commit: CommitMessage = {
				t: 'commit',
				seq: result.seq,
				epoch: store.epoch,
				batchId,
				by: client.id,
				byName: client.id,
				ops: result.ops,
				overwritten: result.overwritten,
				checksum: result.checksum
			};
			for (const other of clients) other.inbox.push(structuredClone(commit));
		}
	};

	/** Two frames: one notices the change, the next (after the collect window) sends it. */
	const step = (ms = COLLECT_MS + 1) => {
		for (let frame = 0; frame < 2; frame++) {
			now += ms;
			for (const client of clients) client.feed.tick();
		}
	};

	const deliverToClient = (client: Client, count = Infinity) => {
		for (let i = 0; i < count && client.inbox.length > 0; i++) {
			const message = client.inbox.shift()!;
			if (message.t === 'commit') client.feed.onCommit(message);
			else client.feed.onReject(message);
		}
	};

	return { store, clients, step, deliverToRoom, deliverToClient, random: rng(seed) };
}

function walls(content: AuthoredContent) {
	return content.buildings.flatMap((building) => building.walls);
}

describe('WorldOpFeed', () => {
	it("sends one small batch per action and shows others' changes", async () => {
		const { clients, step, deliverToRoom, deliverToClient, store } = setup(['editor', 'editor']);
		const [sam, alex] = clients as [Client, Client];
		sam.scene.edit((content) => {
			walls(content)[0]!.openings.push({
				id: 'sam-window',
				type: 'window',
				minU: 2,
				maxU: 3,
				minY: 1,
				maxY: 2
			});
		});
		step();
		await Promise.resolve();
		deliverToRoom();
		deliverToClient(sam);
		deliverToClient(alex);
		expect(store.seq).toBe(2);
		expect(walls(alex.scene.content)[0]!.openings.map((o: { id: string }) => o.id)).toEqual([
			'sam-window'
		]);
		expect(sam.feed.replica.pendingBatches).toHaveLength(0);
	});

	it('rolls a refused change back, with a notice naming who was first', async () => {
		const { clients, step, deliverToRoom, deliverToClient } = setup(['editor', 'editor']);
		const [sam, alex] = clients as [Client, Client];
		const add = (client: Client, id: string) =>
			client.scene.edit((content) => {
				walls(content)[0]!.openings.push({
					id,
					type: 'window',
					minU: 2,
					maxU: 3,
					minY: 1,
					maxY: 2
				});
			});
		add(sam, 'sam-window');
		add(alex, 'alex-window');
		step();
		await Promise.resolve();
		deliverToRoom();
		deliverToClient(sam);
		deliverToClient(alex);
		const ids = (client: Client) =>
			walls(client.scene.content)[0]!.openings.map((o: { id: string }) => o.id);
		expect(ids(sam)).toEqual(['sam-window']);
		expect(ids(alex)).toEqual(['sam-window']);
		expect(alex.notices).toEqual(['Player-0 just put a window or door there.']);
	});

	it("won't remove someone else's thing, and puts it straight back", async () => {
		const { clients, step, deliverToRoom, deliverToClient } = setup(['editor', 'editor']);
		const [sam, alex] = clients as [Client, Client];
		sam.scene.edit((content) => {
			walls(content)[0]!.openings.push({
				id: 'sam-window',
				type: 'window',
				minU: 2,
				maxU: 3,
				minY: 1,
				maxY: 2
			});
		});
		step();
		await Promise.resolve();
		deliverToRoom();
		deliverToClient(sam);
		deliverToClient(alex);
		alex.scene.edit((content) => {
			walls(content)[0]!.openings = [];
		});
		step();
		await Promise.resolve();
		expect(walls(alex.scene.content)[0]!.openings).toHaveLength(1);
		expect(alex.notices.at(-1)).toBe('Only player-0 or the owner can remove that.');
	});

	it('keeps queued commits in order when a move ends before the next frame', () => {
		const { clients, step, deliverToRoom, deliverToClient, store } = setup(['editor', 'editor']);
		const [sam, alex] = clients as [Client, Client];
		alex.scene.transactionOpen = true;
		sam.scene.edit((content) => {
			walls(content)[0]!.height = 4;
		});
		step();
		deliverToRoom();
		deliverToClient(alex);
		sam.scene.edit((content) => {
			walls(content)[1]!.height = 5;
		});
		step();
		deliverToRoom();
		alex.scene.transactionOpen = false;
		// No intervening tick: the second socket message must not jump the queue.
		deliverToClient(alex);
		expect(alex.feed.replica.seq).toBe(store.seq);
		expect(
			walls(alex.scene.content)
				.slice(0, 2)
				.map((w) => w.height)
		).toEqual([4, 5]);
	});

	it('removes an acknowledged optimistic overlay after a reconnect snapshot', () => {
		const { clients, step, deliverToRoom, store } = setup(['editor', 'editor']);
		const [sam, alex] = clients as [Client, Client];
		sam.scene.edit((content) => {
			walls(content)[0]!.height = 4;
		});
		step();
		const batchId = sam.feed.replica.pendingBatches[0]!.batchId;
		deliverToRoom();
		alex.scene.edit((content) => {
			walls(content)[0]!.height = 5;
		});
		step();
		deliverToRoom();
		// Sam missed both commits; the snapshot includes his edit and Alex's later edit.
		sam.feed.onResync({ rows: store.allRows(), seq: store.seq, epoch: store.epoch });
		sam.scene.transactionOpen = true;
		sam.feed.onAck(batchId);
		expect(sam.feed.replica.pendingBatches).toHaveLength(1);
		sam.scene.transactionOpen = false;
		sam.feed.tick();
		expect(sam.feed.replica.pendingBatches).toHaveLength(0);
		expect(walls(sam.scene.content)[0]!.height).toBe(5);
	});

	it('does not roll back newer commits when an older snapshot finishes downloading', () => {
		const { clients, step, deliverToRoom, deliverToClient, store } = setup(['editor']);
		const sam = clients[0]!;
		const snapshot = { rows: structuredClone(store.allRows()), seq: store.seq, epoch: store.epoch };
		sam.scene.edit((content) => {
			walls(content)[0]!.height = 4;
		});
		step();
		deliverToRoom();
		deliverToClient(sam);
		sam.feed.onResync(snapshot);
		expect(sam.feed.replica.seq).toBe(store.seq);
		expect(walls(sam.scene.content)[0]!.height).toBe(4);
	});

	it('keeps both walls when builders initialize the same storey concurrently', () => {
		const { clients, step, deliverToRoom, deliverToClient, store } = setup(['editor', 'editor']);
		for (const [index, client] of clients.entries()) {
			client.scene.edit((content) => {
				content.buildingLevels.push({
					id: `level-${index}`,
					foundationId: 'f1',
					index: 1,
					baseY: 3,
					wallHeight: 3
				});
				content.buildings[0]!.walls.push({
					...structuredClone(walls(content)[0]!),
					id: `new-wall-${index}`,
					baseY: 3,
					startGridZ: index + 1,
					endGridZ: index + 1
				});
			});
		}
		step();
		deliverToRoom();
		for (const client of clients) {
			deliverToClient(client);
			expect(client.notices).toEqual([]);
			expect(client.feed.replica.pendingBatches).toHaveLength(0);
			expect(client.scene.content.buildingLevels).toHaveLength(1);
			expect(walls(client.scene.content).filter((w) => w.id.startsWith('new-wall-'))).toHaveLength(
				2
			);
			expect(client.feed.replica.checksum).toBe(store.checksum);
		}
	});

	it('three people editing at random end up with identical worlds (convergence)', async () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const { clients, step, deliverToRoom, deliverToClient, store, random } = setup(
				['owner', 'editor', 'editor'],
				seed
			);
			const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
			for (let round = 0; round < 60; round++) {
				for (const client of clients) {
					if (random() < 0.5) continue;
					client.scene.edit((content) => {
						const all = walls(content);
						const choice = random();
						if (choice < 0.4) {
							const u = Math.floor(random() * 9);
							pick(all).openings.push({
								id: `${client.id}-o${round}`,
								type: 'window',
								minU: u,
								maxU: u + 1,
								minY: 1,
								maxY: 2
							});
						} else if (choice < 0.7) {
							pick(all).material = {
								type: 'color',
								color: pick(['#aa0000', '#00aa00', '#0000aa'])
							};
						} else if (choice < 0.85) {
							pick(all).height = 2 + Math.floor(random() * 3);
						} else {
							// Remove one of my own windows, if I have one.
							for (const wall of all) {
								const mine = wall.openings.findIndex((o: { id: string }) =>
									o.id.startsWith(client.id)
								);
								if (mine >= 0) {
									wall.openings.splice(mine, 1);
									break;
								}
							}
						}
					});
				}
				step();
				await Promise.resolve();
				if (random() < 0.6) deliverToRoom();
				for (const client of clients) deliverToClient(client, Math.floor(random() * 3));
			}
			// Let everything settle.
			for (let i = 0; i < 5; i++) {
				step();
				await Promise.resolve();
				deliverToRoom();
				for (const client of clients) deliverToClient(client);
			}
			// Plenty really happened: dozens of commits, and some clashes refused along the way.
			expect(store.seq).toBeGreaterThan(30);
			expect(clients.some((client) => client.notices.length > 0)).toBe(true);
			const expected = canonical(unflattenWorld(store.allRows()));
			for (const client of clients) {
				expect(client.feed.replica.pendingBatches).toHaveLength(0);
				expect(canonical(unflattenWorld(flattenWorld(client.scene.content)))).toBe(expected);
				expect(client.feed.replica.checksum).toBe(store.checksum);
			}
		}
	});
});
