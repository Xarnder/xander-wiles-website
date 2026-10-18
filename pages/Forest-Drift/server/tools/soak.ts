/**
 * Shared-building soak test (plan Phase 3 acceptance: "a random-edit soak with three bots … ends
 * with matching checksums").
 *
 * Several bots join one world with a builder invite and, for a few minutes, place, move and remove
 * furniture at random — on top of each other's, so clashes, overwrites and refusals all happen —
 * while following every commit into their own replica. At the end they stop, let everything
 * settle, and compare: every bot's checksum, and the room's own (from a fresh snapshot), must match.
 *
 *   npx vite-node server/tools/soak.ts -- --world <worldId> --invite <builder token> --minutes 5
 *
 * Options: --server (default http://localhost:8787), --bots (3), --minutes (5), --interval ms (250).
 */
import { PROTOCOL_VERSION, GENERATOR_VERSION } from '../../src/lib/game/net/protocol';
import type { CommitMessage, RejectMessage, ServerJsonMessage } from '../../src/lib/game/net/protocol';
import { WorldReplica, type ReplicaRow } from '../../src/lib/game/net/WorldReplica';
import type { WorldOp } from '../../src/lib/game/net/worldEntities';

const args = parseArgs(process.argv.slice(2));
const server = String(args.server ?? 'http://localhost:8787').replace(/\/+$/, '');
const worldId = String(args.world ?? '');
const invite = String(args.invite ?? '');
const botCount = Number(args.bots ?? 3);
const minutes = Number(args.minutes ?? 5);
const interval = Number(args.interval ?? 250);
if (!worldId || !invite) {
	console.error('Usage: npx vite-node server/tools/soak.ts -- --world <id> --invite <token>');
	process.exit(1);
}

interface Snapshot {
	manifest: { schemaVersion: number; generatorVersion: number };
	rows: ReplicaRow[];
	seq: number;
	epoch: number;
	checksum: string;
}

async function snapshot(): Promise<Snapshot> {
	const response = await fetch(`${server}/w/${worldId}/snapshot`, {
		headers: { Authorization: `Bearer ${invite}` }
	});
	if (!response.ok) throw new Error(`Snapshot failed: ${response.status}`);
	return (await response.json()) as Snapshot;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let batchCounter = 0;

class Bot {
	readonly playerId = `soak-bot-${this.index}-${Math.random().toString(36).slice(2, 10)}`;
	replica!: WorldReplica;
	socket!: WebSocket;
	commits = 0;
	rejects = 0;
	sent = 0;
	private foundations: string[] = [];

	constructor(private readonly index: number) {}

	async start(): Promise<void> {
		const snap = await snapshot();
		this.replica = new WorldReplica({ rows: snap.rows, seq: snap.seq, epoch: snap.epoch });
		this.foundations = snap.rows.filter((row) => row.kind === 'foundation').map((row) => row.id);
		this.socket = new WebSocket(`${server.replace(/^http/, 'ws')}/w/${worldId}/ws`);
		await new Promise<void>((resolve, reject) => {
			this.socket.onopen = () =>
				this.socket.send(
					JSON.stringify({
						t: 'hello',
						protocol: PROTOCOL_VERSION,
						schemaVersion: snap.manifest.schemaVersion,
						generatorVersion: snap.manifest.generatorVersion ?? GENERATOR_VERSION,
						build: 'soak-bot',
						playerId: this.playerId,
						name: `Soak ${this.index + 1}`,
						colour: '#8a9a92',
						invite,
						capability: null,
						epoch: snap.epoch,
						lastSeq: snap.seq
					})
				);
			this.socket.onmessage = (event) => {
				if (typeof event.data !== 'string' || event.data === 'KA') return;
				const message = JSON.parse(event.data) as ServerJsonMessage;
				if (message.t === 'welcome') resolve();
				else if (message.t === 'error') reject(new Error(message.message));
				else if (message.t === 'commit') this.onCommit(message);
				else if (message.t === 'reject') this.onReject(message);
			};
			this.socket.onerror = () => reject(new Error('WebSocket error'));
		});
	}

	private onCommit(commit: CommitMessage): void {
		const outcome = this.replica.applyCommit(commit);
		if (outcome === 'resync') throw new Error(`${this.playerId} fell out of step at ${commit.seq}`);
		this.commits++;
	}

	private onReject(reject: RejectMessage): void {
		this.replica.reject(reject.batchId);
		this.rejects++;
	}

	/** One random edit: place, move (anyone's — later wins), or remove (own only). */
	act(): void {
		const display = this.replica.display();
		const furniture = [...display.values()].filter((row) => row.kind === 'furniture');
		const mine = furniture.filter(
			(row) => this.replica.creatorOf(`furniture:${row.id}`, this.playerId) === this.playerId
		);
		const roll = Math.random();
		let ops: WorldOp[];
		if (roll < 0.45 || furniture.length === 0) {
			const id = `soak-${this.index}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
			const foundationId = this.foundations.length
				? this.foundations[Math.floor(Math.random() * this.foundations.length)]!
				: null;
			ops = [
				{
					op: 'add',
					kind: 'furniture',
					id,
					data: {
						id,
						kind: 'small-table',
						foundationId,
						x: Math.random() * 20,
						y: 1,
						z: Math.random() * 20,
						nx: 0,
						ny: 1,
						nz: 0
					}
				}
			];
		} else if (roll < 0.8) {
			const target = furniture[Math.floor(Math.random() * furniture.length)]!;
			const key = `furniture:${target.id}`;
			ops = [
				{
					op: 'patch',
					kind: 'furniture',
					id: target.id,
					set: { x: Math.random() * 20, rotationY: Math.random() * 6 },
					seen: { x: this.replica.fieldRev(key, 'x'), rotationY: this.replica.fieldRev(key, 'rotationY') }
				}
			];
		} else if (mine.length > 0) {
			ops = [{ op: 'del', kind: 'furniture', id: mine[Math.floor(Math.random() * mine.length)]!.id }];
		} else {
			return;
		}
		const batchId = `soak-batch-${++batchCounter}-${this.index}`.padEnd(12, '0');
		this.replica.addLocal(batchId, ops, Date.now());
		this.socket.send(JSON.stringify({ t: 'ops', batchId, ops }));
		this.sent++;
	}

	stop(): void {
		this.socket.close(1000, 'Soak finished');
	}
}

const bots = Array.from({ length: botCount }, (_, index) => new Bot(index));
for (const bot of bots) await bot.start();
console.error(`${botCount} bots building for ${minutes} min…`);
const end = Date.now() + minutes * 60_000;
while (Date.now() < end) {
	for (const bot of bots) bot.act();
	await sleep(interval);
}
// Settle: no new edits, wait for the last commits and refusals to arrive.
for (let i = 0; i < 40 && bots.some((bot) => bot.replica.pendingBatches.length > 0); i++) await sleep(250);
await sleep(500);
const room = await snapshot();
const report = {
	bots: botCount,
	minutes,
	batchesSent: bots.reduce((sum, bot) => sum + bot.sent, 0),
	commitsSeenPerBot: bots.map((bot) => bot.commits),
	rejects: bots.reduce((sum, bot) => sum + bot.rejects, 0),
	roomSeq: room.seq,
	roomChecksum: room.checksum,
	botChecksums: bots.map((bot) => bot.replica.checksum),
	botSeqs: bots.map((bot) => bot.replica.seq),
	pending: bots.map((bot) => bot.replica.pendingBatches.length)
};
for (const bot of bots) bot.stop();
const matched = report.botChecksums.every((checksum) => checksum === room.checksum);
console.log(JSON.stringify({ ...report, matched }, null, 2));
process.exit(matched ? 0 : 1);

function parseArgs(list: string[]): Record<string, string | boolean> {
	const out: Record<string, string | boolean> = {};
	for (let i = 0; i < list.length; i++) {
		const key = list[i]!;
		if (!key.startsWith('--')) continue;
		const next = list[i + 1];
		if (next === undefined || next.startsWith('--')) out[key.slice(2)] = true;
		else {
			out[key.slice(2)] = next;
			i++;
		}
	}
	return out;
}
