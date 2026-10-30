import { DurableObject } from 'cloudflare:workers';
import { migrateTreeGenerator } from './generatorMigration';
import {
	CAPABILITY_TTL_MS,
	sha256Hex,
	signCapability,
	verifyCapability
} from '../../src/lib/game/net/capability';
import {
	RoomCore,
	type AuthResult,
	type CommitRecord,
	type GraceEntry,
	type PlayerAttachment,
	type RoomClockRecord,
	type RoomSessionState,
	type RoomConnection,
	type StoredHealth
} from '../../src/lib/game/net/RoomCore';
import { HEALTH_MAX } from '../../src/lib/game/player/PlayerHealth';
import { WorldStore, publishedRows, type StoredRow } from '../../src/lib/game/net/WorldStore';
import {
	flattenWorld,
	formatChecksum,
	rowChecksumPart,
	rowKey,
	unflattenWorld,
	type AuthoredContent
} from '../../src/lib/game/net/worldEntities';
import {
	KEEPALIVE_REQUEST,
	KEEPALIVE_RESPONSE,
	MAX_PLAYERS_PER_WORLD,
	ROOM_TICK_MS,
	type CommitMessage,
	type HelloMessage,
	type PlayerBookmark,
	type PlayerRole
} from '../../src/lib/game/net/protocol';
import type { Env } from './env';

/** Everything the room needs to know about the world it serves, stored alongside the world itself. */
export interface WorldManifest {
	worldId: string;
	name: string;
	schemaVersion: number;
	generatorVersion: number;
	publishedAt: string;
	/** Size of the stored world JSON, for the snapshot response and limits. */
	byteLength: number;
	/** Horizontal speed check for poses, m/s (from the world's run speed; flight is off online). */
	maxSpeed?: number;
	/** Whether long falls hurt, until the owner changes the rule. Absent in older publishes: off. */
	fallDamage?: boolean;
}

/** SHA-256 (hex) of each role's invite token. The tokens themselves are never stored. */
export interface WorldAccess {
	owner: string;
	editor: string;
	viewer: string;
}

/**
 * Characters per stored chunk. SQLite-backed Durable Objects cap a row at 2 MB; 256k characters is at
 * most 1 MB of UTF-8, so a chunk can never hit the limit whatever the world contains.
 */
const CHUNK_CHARS = 256 * 1024;
/**
 * Connections beyond this are refused at the door. Each player needs one socket, plus a little room
 * for a reconnect that arrives before the old socket is noticed as gone.
 */
const MAX_SOCKETS = MAX_PLAYERS_PER_WORLD * 2;
/** Commits kept for catch-up (plan §7.8: the last 5,000 ops). Older reconnects get a snapshot. */
const RETAINED_COMMITS = 5000;
/**
 * Restore points (plan §8.5, Q27-A: 30 days of recovery). At most one an hour while people build;
 * hourly ones are kept for two days, then one a day for 30 days.
 */
const RESTORE_INTERVAL_MS = 60 * 60 * 1000;
const RESTORE_HOURLY_FOR_MS = 48 * 60 * 60 * 1000;
const RESTORE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** Close code telling clients the world was restored: reconnect, and resync. */
const WORLD_RESTORED_CODE = 4100;
/** The world's authored collections: stored as rows; everything else stays in the base record. */
const AUTHORED_KEYS = [
	'foundations',
	'buildings',
	'buildingLevels',
	'barriers',
	'furniture',
	'miniBuilds',
	'musicTrees',
	'musicPlants',
	'proceduralOverrides'
] as const;

interface StoreMeta {
	seq: number;
	epoch: number;
}

interface EntityRecord {
	[column: string]: SqlStorageValue;
	kind: string;
	id: string;
	parent: string | null;
	created_by: string;
	rev: number;
	field_revs: string;
	data: string;
}

/**
 * One shared world: its published content in SQLite and its live room.
 *
 * Uses the WebSocket Hibernation API, so when nobody is moving and no timer is pending the object is
 * evicted from memory while sockets stay connected — and is not billed for that time. In-memory state
 * is lost on eviction, which is why every connection's identity is kept in its attachment, the grace
 * periods and room clock are kept in SQLite, and the room is rebuilt from those when it wakes again.
 * Keep-alive frames are answered by the runtime itself (`setWebSocketAutoResponse`) without waking it.
 *
 * Storage (SQLite):
 *   - `world_chunks`: the published world's *base* — everything but its authored content (identity,
 *     seed, environment, creatures, spawn);
 *   - `entities`: the authored content as rows (plan §7.2), changed only by committed batches;
 *   - `ops` / `batches`: the recent commit log for catch-up, and batch ids for dedupe;
 *   - `players`: names and last positions (Q18 bookmarks);
 *   - `meta`: manifest, invite hashes, version (`store`), clock, grace periods, shared sky.
 */
export class WorldRoom extends DurableObject<Env> {
	private core: RoomCore | null = null;
	private readonly connections = new WeakMap<WebSocket, RoomConnection>();
	private tickTimer: ReturnType<typeof setInterval> | null = null;
	/** The alarm last requested from storage (memory only; re-requesting the same time is harmless). */
	private alarmAt: number | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair(KEEPALIVE_REQUEST, KEEPALIVE_RESPONSE)
		);
		ctx.blockConcurrencyWhile(async () => {
			this.ensureSchema();
			this.startRoom();
		});
	}

	/** Stores a newly published world. Called once, by the Worker, right after it picks the world id. */
	async publish(manifest: WorldManifest, worldJson: string, access: WorldAccess): Promise<void> {
		this.ctx.storage.transactionSync(() => {
			this.storeWorld(JSON.parse(worldJson) as Record<string, unknown>);
			this.writeMeta('manifest', JSON.stringify(manifest));
			this.writeMeta('access', JSON.stringify(access));
		});
		this.startRoom();
	}

	/** Splits a whole world into its base record and entity rows (all the owner's, revision 1). */
	private storeWorld(world: Record<string, unknown>): void {
		const sql = this.ctx.storage.sql;
		const base: Record<string, unknown> = { ...world };
		for (const key of AUTHORED_KEYS) delete base[key];
		this.writeChunks(JSON.stringify(base));
		sql.exec('DELETE FROM entities');
		sql.exec('DELETE FROM ops');
		sql.exec('DELETE FROM batches');
		for (const row of publishedRows(flattenWorld(world as unknown as AuthoredContent))) {
			this.writeRow(row);
		}
		this.writeMeta('store', JSON.stringify({ seq: 1, epoch: 1 } satisfies StoreMeta));
		this.createRestorePoint(this.readRows(), 1, 1);
	}

	private createRestorePoint(rows: StoredRow[], seq: number, epoch: number): void {
		const sql = this.ctx.storage.sql;
		const now = Date.now();
		const text = JSON.stringify(rows);
		sql.exec(
			'INSERT INTO restore_points (seq, epoch, created_at, size) VALUES (?, ?, ?, ?)',
			seq,
			epoch,
			now,
			text.length
		);
		const id = sql.exec<{ id: number }>('SELECT last_insert_rowid() AS id').toArray()[0]!.id;
		for (let index = 0, offset = 0; offset < text.length; index++, offset += CHUNK_CHARS) {
			sql.exec(
				'INSERT INTO restore_chunks (point_id, idx, data) VALUES (?, ?, ?)',
				id,
				index,
				text.slice(offset, offset + CHUNK_CHARS)
			);
		}
		this.writeMeta('lastRestorePoint', String(now));
		this.pruneRestorePoints(now);
	}

	/** Hourly points for two days, then the first of each day, nothing past 30 days. */
	private pruneRestorePoints(now: number): void {
		const sql = this.ctx.storage.sql;
		const points = sql
			.exec<{ id: number; created_at: number }>(
				'SELECT id, created_at FROM restore_points ORDER BY created_at'
			)
			.toArray();
		const keptDays = new Set<number>();
		for (const point of points) {
			const age = now - point.created_at;
			const day = Math.floor(point.created_at / (24 * 60 * 60 * 1000));
			const keep = age <= RESTORE_HOURLY_FOR_MS || (age <= RESTORE_KEEP_MS && !keptDays.has(day));
			if (age > RESTORE_HOURLY_FOR_MS && keep) keptDays.add(day);
			if (!keep) {
				sql.exec('DELETE FROM restore_chunks WHERE point_id = ?', point.id);
				sql.exec('DELETE FROM restore_points WHERE id = ?', point.id);
			}
		}
	}

	/** After a commit: a new restore point if the last is over an hour old. */
	private maybeCreateRestorePoint(): void {
		const last = Number(this.readMeta('lastRestorePoint') ?? 0);
		if (Date.now() - last < RESTORE_INTERVAL_MS) return;
		const store = this.core?.store;
		if (!store) return;
		this.ctx.storage.transactionSync(() =>
			this.createRestorePoint(store.allRows(), store.seq, store.epoch)
		);
	}

	/**
	 * Goes back to a restore point (owner only): the rows are replaced, the epoch moves on so every
	 * replica knows its state is stale, and everyone is disconnected to reconnect and resync.
	 */
	private restoreTo(pointId: number): boolean {
		const sql = this.ctx.storage.sql;
		const text = sql
			.exec<{ data: string }>(
				'SELECT data FROM restore_chunks WHERE point_id = ? ORDER BY idx',
				pointId
			)
			.toArray()
			.map((row) => row.data)
			.join('');
		if (!text) return false;
		const rows = JSON.parse(text) as StoredRow[];
		const store = this.startRoom()?.store;
		if (!store) return false;
		const epoch = store.epoch + 1;
		store.replaceAll(rows, epoch);
		this.ctx.storage.transactionSync(() => {
			sql.exec('DELETE FROM entities');
			for (const row of rows) this.writeRow(row);
			// The log belongs to the old timeline.
			sql.exec('DELETE FROM ops');
			sql.exec('DELETE FROM batches');
			this.writeMeta('store', JSON.stringify({ seq: store.seq, epoch } satisfies StoreMeta));
			this.core?.clearSessionState();
		});
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.close(WORLD_RESTORED_CODE, 'The world was restored to an earlier version');
			} catch {
				// Already closing.
			}
		}
		return true;
	}

	/** The live world as one record, for the owner's "Save a copy". */
	private exportWorld(): string {
		const rows = this.core?.storeLoaded ? this.core.store!.allRows() : this.readRows();
		const base = JSON.parse(this.readChunks()) as Record<string, unknown>;
		return JSON.stringify({ ...base, ...unflattenWorld(rows) });
	}

	private writeChunks(text: string): void {
		const sql = this.ctx.storage.sql;
		sql.exec('DELETE FROM world_chunks');
		for (let index = 0, offset = 0; offset < text.length; index++, offset += CHUNK_CHARS) {
			sql.exec(
				'INSERT INTO world_chunks (idx, data) VALUES (?, ?)',
				index,
				text.slice(offset, offset + CHUNK_CHARS)
			);
		}
	}

	private readChunks(): string {
		return this.ctx.storage.sql
			.exec<{ data: string }>('SELECT data FROM world_chunks ORDER BY idx')
			.toArray()
			.map((row) => row.data)
			.join('');
	}

	private writeRow(row: StoredRow): void {
		this.ctx.storage.sql.exec(
			`INSERT OR REPLACE INTO entities (k, kind, id, parent, created_by, rev, field_revs, data)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			rowKey(row),
			row.kind,
			row.id,
			row.parent ?? null,
			row.createdBy,
			row.rev,
			JSON.stringify(row.fieldRevs),
			JSON.stringify(row.data)
		);
	}

	private readRows(): StoredRow[] {
		return this.ctx.storage.sql
			.exec<EntityRecord>(
				'SELECT kind, id, parent, created_by, rev, field_revs, data FROM entities'
			)
			.toArray()
			.map((record) => {
				const row: StoredRow = {
					kind: record.kind as StoredRow['kind'],
					id: record.id,
					data: JSON.parse(record.data) as Record<string, unknown>,
					createdBy: record.created_by,
					rev: record.rev,
					fieldRevs: JSON.parse(record.field_revs) as StoredRow['fieldRevs']
				};
				if (record.parent !== null) row.parent = record.parent;
				return row;
			});
	}

	/** Worlds published before Phase 3 stored the whole world as one record: split it once. */
	private migrateLegacyWorld(): void {
		if (this.readJson<StoreMeta>('store') || !this.readJson<WorldManifest>('manifest')) return;
		const text = this.readChunks();
		if (!text) return;
		this.ctx.storage.transactionSync(() => {
			this.storeWorld(JSON.parse(text) as Record<string, unknown>);
		});
	}

	private saveCommit(record: CommitRecord): void {
		const sql = this.ctx.storage.sql;
		const { commit } = record;
		this.ctx.storage.transactionSync(() => {
			for (const row of record.upserts) this.writeRow(row);
			for (const key of record.deletes) sql.exec('DELETE FROM entities WHERE k = ?', key);
			sql.exec('INSERT INTO ops (seq, body) VALUES (?, ?)', commit.seq, JSON.stringify(commit));
			sql.exec(
				'INSERT OR REPLACE INTO batches (player_id, batch_id, seq) VALUES (?, ?, ?)',
				record.playerId,
				commit.batchId,
				commit.seq
			);
			sql.exec('DELETE FROM ops WHERE seq <= ?', commit.seq - RETAINED_COMMITS);
			sql.exec('DELETE FROM batches WHERE seq <= ?', commit.seq - RETAINED_COMMITS);
			this.writeMeta(
				'store',
				JSON.stringify({ seq: commit.seq, epoch: commit.epoch } satisfies StoreMeta)
			);
		});
	}

	private loadCommitsSince(afterSeq: number): CommitMessage[] | null {
		const sql = this.ctx.storage.sql;
		const oldest = sql
			.exec<{ seq: number | null }>('SELECT MIN(seq) AS seq FROM ops')
			.toArray()[0]?.seq;
		const version = this.readJson<StoreMeta>('store');
		if (!version) return null;
		if (afterSeq >= version.seq) return [];
		// The log must reach back to the commit right after the client's last one.
		if (oldest === null || oldest === undefined || oldest > afterSeq + 1) return null;
		return sql
			.exec<{ body: string }>('SELECT body FROM ops WHERE seq > ? ORDER BY seq', afterSeq)
			.toArray()
			.map((row) => JSON.parse(row.body) as CommitMessage);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const manifest = this.readJson<WorldManifest>('manifest');
		if (!manifest) return new Response('World not found', { status: 404 });

		if (url.pathname.endsWith('/snapshot')) {
			// Invite-only (Q7): the world itself is only handed to someone holding a link.
			const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
			if (!(await this.roleForInvite(token))) {
				return Response.json({ error: 'This invite link is not valid.' }, { status: 403 });
			}
			return this.snapshotResponse(manifest);
		}

		if (/\/(export|restore-points|restore|usage)$/.test(url.pathname)) {
			const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
			if ((await this.roleForInvite(token)) !== 'owner') {
				return Response.json({ error: 'Only the owner can do that.' }, { status: 403 });
			}
			if (url.pathname.endsWith('/usage')) return new Response(null, { status: 204 });
			if (url.pathname.endsWith('/export')) {
				return new Response(this.exportWorld(), {
					headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
				});
			}
			if (url.pathname.endsWith('/restore-points')) {
				const points = this.ctx.storage.sql
					.exec<{ id: number; seq: number; created_at: number; size: number }>(
						'SELECT id, seq, created_at, size FROM restore_points ORDER BY created_at DESC'
					)
					.toArray()
					.map((point) => ({
						id: point.id,
						seq: point.seq,
						createdAt: new Date(point.created_at).toISOString(),
						size: point.size
					}));
				return Response.json({ points });
			}
			let pointId = Number.NaN;
			try {
				pointId = Number((JSON.parse(await request.text()) as { pointId?: unknown }).pointId);
			} catch {
				// Falls through to the error below.
			}
			if (!Number.isInteger(pointId) || !this.restoreTo(pointId)) {
				return Response.json({ error: 'That restore point no longer exists.' }, { status: 404 });
			}
			return Response.json({ ok: true });
		}

		if (url.pathname.endsWith('/ws')) {
			if (request.headers.get('Upgrade') !== 'websocket') {
				return new Response('Expected a WebSocket upgrade', { status: 426 });
			}
			if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
				return new Response('Too many connections', { status: 503 });
			}
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
			this.ctx.acceptWebSocket(server);
			return new Response(null, { status: 101, webSocket: client });
		}

		return new Response('Not found', { status: 404 });
	}

	/**
	 * The world as a join needs it: the base record, every row (with who made it and its revisions,
	 * for confirmations and "changed by" notices), the version, checksum and builders' names.
	 */
	private snapshotResponse(manifest: WorldManifest): Response {
		const core = this.startRoom();
		const store = core?.storeLoaded ? core.store : null;
		const rows = store ? store.allRows() : this.readRows();
		const version = store
			? { seq: store.seq, epoch: store.epoch }
			: (this.readJson<StoreMeta>('store') ?? { seq: 1, epoch: 1 });
		let checksum = 0;
		for (const row of rows) checksum ^= rowChecksumPart(rowKey(row), row.rev);
		const body =
			`{"manifest":${JSON.stringify(manifest)},"base":${this.readChunks()},` +
			`"rows":${JSON.stringify(rows)},"seq":${version.seq},"epoch":${version.epoch},` +
			`"checksum":"${formatChecksum(checksum)}","names":${JSON.stringify(this.playerNames())}}`;
		return new Response(body, {
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	}

	private savePlayer(playerId: string, name: string, bookmark: PlayerBookmark | null): void {
		this.ctx.storage.sql.exec(
			'INSERT OR REPLACE INTO players (player_id, name, bookmark, last_seen) VALUES (?, ?, ?, ?)',
			playerId,
			name,
			bookmark ? JSON.stringify(bookmark) : null,
			Date.now()
		);
	}

	private loadPlayer(playerId: string): { name: string; bookmark: PlayerBookmark | null } | null {
		const row = this.ctx.storage.sql
			.exec<{ name: string; bookmark: string | null }>(
				'SELECT name, bookmark FROM players WHERE player_id = ?',
				playerId
			)
			.toArray()[0];
		if (!row) return null;
		return {
			name: row.name,
			bookmark: row.bookmark ? (JSON.parse(row.bookmark) as PlayerBookmark) : null
		};
	}

	private savePlayerHealth(playerId: string, health: StoredHealth | null): void {
		if (health === null) {
			this.ctx.storage.sql.exec('DELETE FROM player_health WHERE player_id = ?', playerId);
			return;
		}
		this.ctx.storage.sql.exec(
			'INSERT OR REPLACE INTO player_health (player_id, health) VALUES (?, ?)',
			playerId,
			JSON.stringify(health)
		);
	}

	/** Anything malformed reads as no record, which means full health. */
	private loadPlayerHealth(playerId: string): StoredHealth | null {
		const row = this.ctx.storage.sql
			.exec<{ health: string }>('SELECT health FROM player_health WHERE player_id = ?', playerId)
			.toArray()[0];
		if (!row) return null;
		try {
			const value = JSON.parse(row.health) as Partial<StoredHealth>;
			if (
				typeof value.base !== 'number' ||
				!Number.isFinite(value.base) ||
				typeof value.lastDamageAt !== 'number' ||
				!Number.isFinite(value.lastDamageAt)
			)
				return null;
			return {
				base: Math.max(0, Math.min(HEALTH_MAX, Math.round(value.base))),
				lastDamageAt: value.lastDamageAt,
				dead: value.dead === true
			};
		} catch {
			return null;
		}
	}

	private playerNames(): Record<string, string> {
		const names: Record<string, string> = {};
		for (const row of this.ctx.storage.sql
			.exec<{ player_id: string; name: string }>(
				'SELECT player_id, name FROM players ORDER BY last_seen DESC LIMIT 500'
			)
			.toArray()) {
			names[row.player_id] = row.name;
		}
		return names;
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const core = this.startRoom();
		if (!core) {
			ws.close(4006, 'World not found');
			return;
		}
		await core.onMessage(this.connectionFor(ws), message);
		this.afterEvent();
	}

	async webSocketClose(ws: WebSocket, code: number): Promise<void> {
		this.startRoom()?.onClose(this.connectionFor(ws), code);
		this.afterEvent();
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		this.startRoom()?.onClose(this.connectionFor(ws));
		this.afterEvent();
	}

	async alarm(): Promise<void> {
		this.alarmAt = null;
		this.startRoom()?.onAlarm();
		this.afterEvent();
	}

	private ensureSchema(): void {
		const sql = this.ctx.storage.sql;
		sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
		sql.exec(
			'CREATE TABLE IF NOT EXISTS world_chunks (idx INTEGER PRIMARY KEY, data TEXT NOT NULL)'
		);
		sql.exec(
			`CREATE TABLE IF NOT EXISTS entities (
				k TEXT PRIMARY KEY, kind TEXT NOT NULL, id TEXT NOT NULL, parent TEXT,
				created_by TEXT NOT NULL, rev INTEGER NOT NULL, field_revs TEXT NOT NULL, data TEXT NOT NULL
			)`
		);
		sql.exec('CREATE TABLE IF NOT EXISTS ops (seq INTEGER PRIMARY KEY, body TEXT NOT NULL)');
		sql.exec(
			`CREATE TABLE IF NOT EXISTS batches (
				player_id TEXT NOT NULL, batch_id TEXT NOT NULL, seq INTEGER NOT NULL,
				PRIMARY KEY (player_id, batch_id)
			)`
		);
		sql.exec(
			`CREATE TABLE IF NOT EXISTS players (
				player_id TEXT PRIMARY KEY, name TEXT NOT NULL, bookmark TEXT, last_seen INTEGER NOT NULL
			)`
		);
		// Each player's health, kept apart from their bookmark so it can be written on every hit.
		sql.exec(
			'CREATE TABLE IF NOT EXISTS player_health (player_id TEXT PRIMARY KEY, health TEXT NOT NULL)'
		);
		sql.exec(
			`CREATE TABLE IF NOT EXISTS restore_points (
				id INTEGER PRIMARY KEY AUTOINCREMENT, seq INTEGER NOT NULL, epoch INTEGER NOT NULL,
				created_at INTEGER NOT NULL, size INTEGER NOT NULL
			)`
		);
		sql.exec(
			`CREATE TABLE IF NOT EXISTS restore_chunks (
				point_id INTEGER NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL,
				PRIMARY KEY (point_id, idx)
			)`
		);
		this.migrateLegacyWorld();
	}

	private readMeta(key: string): string | null {
		const row = this.ctx.storage.sql
			.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)
			.toArray()[0];
		return row?.value ?? null;
	}

	private readJson<T>(key: string): T | null {
		const value = this.readMeta(key);
		if (value === null) return null;
		try {
			return JSON.parse(value) as T;
		} catch {
			return null;
		}
	}

	private writeMeta(key: string, value: string): void {
		this.ctx.storage.sql.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
	}

	/** Creates the room on first use (or after hibernation), restoring connected players from their attachments. */
	private startRoom(): RoomCore | null {
		if (this.core) return this.core;
		const savedManifest = this.readJson<WorldManifest>('manifest');
		if (!savedManifest) return null;
		const manifest = migrateTreeGenerator(savedManifest);
		if (manifest !== savedManifest) this.writeMeta('manifest', JSON.stringify(manifest));
		this.core = new RoomCore({
			world: {
				worldId: manifest.worldId,
				name: manifest.name,
				schemaVersion: manifest.schemaVersion,
				generatorVersion: manifest.generatorVersion
			},
			maxSpeed: manifest.maxSpeed,
			fallDamage: manifest.fallDamage === true,
			authorize: (hello) => this.authorize(manifest.worldId, hello),
			persistence: {
				saveGrace: (entries) => this.writeMeta('grace', JSON.stringify(entries)),
				saveSessionState: (state) => this.writeMeta('session', JSON.stringify(state)),
				saveClock: (clock) => this.writeMeta('clock', JSON.stringify(clock)),
				saveEnv: (envJson) => this.writeMeta('env', envJson),
				saveCommit: (record) => {
					this.saveCommit(record);
					this.maybeCreateRestorePoint();
				},
				loadCommitsSince: (afterSeq) => this.loadCommitsSince(afterSeq),
				findBatchSeq: (playerId, batchId) =>
					this.ctx.storage.sql
						.exec<{ seq: number }>(
							'SELECT seq FROM batches WHERE player_id = ? AND batch_id = ?',
							playerId,
							batchId
						)
						.toArray()[0]?.seq ?? null,
				savePlayer: (playerId, name, bookmark) => this.savePlayer(playerId, name, bookmark),
				loadPlayer: (playerId) => this.loadPlayer(playerId),
				playerNames: () => this.playerNames(),
				savePlayerHealth: (playerId, health) => this.savePlayerHealth(playerId, health),
				loadPlayerHealth: (playerId) => this.loadPlayerHealth(playerId)
			},
			// Rows load on first use only (see RoomCoreOptions.store).
			store: () => {
				const version = this.readJson<StoreMeta>('store') ?? { seq: 1, epoch: 1 };
				return new WorldStore({ rows: this.readRows(), seq: version.seq, epoch: version.epoch });
			},
			storeVersion: () => this.readJson<StoreMeta>('store') ?? { seq: 1, epoch: 1 },
			restored: {
				grace: this.readJson<GraceEntry[]>('grace') ?? [],
				clock: this.readJson<RoomClockRecord>('clock'),
				envJson: this.readMeta('env'),
				session: this.readJson<RoomSessionState>('session')
			}
		});
		this.core.restore(
			this.ctx.getWebSockets().map((ws) => ({
				conn: this.connectionFor(ws),
				attachment: (ws.deserializeAttachment() as PlayerAttachment | null) ?? null
			}))
		);
		this.scheduleAlarm();
		return this.core;
	}

	/**
	 * Checks a hello: a valid capability for this world and player wins; otherwise an invite token.
	 * Either way the player gets a fresh capability to resume with.
	 */
	private async authorize(worldId: string, hello: HelloMessage): Promise<AuthResult> {
		const secret = this.env.CAPABILITY_SECRET || this.env.ADMIN_SECRET || null;
		const now = Date.now();
		let role: PlayerRole | null = null;
		let via: 'invite' | 'capability' = 'invite';
		if (hello.capability && secret) {
			const claims = await verifyCapability(secret, hello.capability, {
				worldId,
				playerId: hello.playerId,
				now
			});
			if (claims) {
				role = claims.r;
				via = 'capability';
			}
		}
		if (!role && hello.invite) role = await this.roleForInvite(hello.invite);
		if (!role) return { ok: false };
		const capability = secret
			? await signCapability(secret, {
					w: worldId,
					p: hello.playerId,
					r: role,
					e: now + CAPABILITY_TTL_MS
				})
			: null;
		return { ok: true, role, capability, via };
	}

	private async roleForInvite(token: string): Promise<PlayerRole | null> {
		if (!token || token.length > 512) return null;
		const access = this.readJson<WorldAccess>('access');
		if (!access) return null;
		const hash = await sha256Hex(token);
		if (hash === access.owner) return 'owner';
		if (hash === access.editor) return 'editor';
		if (hash === access.viewer) return 'viewer';
		return null;
	}

	private connectionFor(ws: WebSocket): RoomConnection {
		let conn = this.connections.get(ws);
		if (!conn) {
			conn = {
				send: (data) => {
					try {
						ws.send(data);
					} catch {
						// The socket closed under us; its close event will tidy up.
					}
				},
				close: (code, reason) => {
					try {
						ws.close(code, reason);
					} catch {
						// Already closing.
					}
				},
				setAttachment: (attachment) => ws.serializeAttachment(attachment)
			};
			this.connections.set(ws, conn);
		}
		return conn;
	}

	private afterEvent(): void {
		this.scheduleTicks();
		this.scheduleAlarm();
	}

	/**
	 * Runs the relay tick only while someone is moving. The interval keeps the object awake (and
	 * billed), so it stops itself as soon as the room goes quiet, letting the object hibernate.
	 */
	private scheduleTicks(): void {
		const core = this.core;
		if (!core || this.tickTimer !== null || !core.needsTick()) return;
		this.tickTimer = setInterval(() => {
			core.tick();
			if (!core.needsTick() && this.tickTimer !== null) {
				clearInterval(this.tickTimer);
				this.tickTimer = null;
			}
		}, ROOM_TICK_MS);
	}

	/** Grace expiries and clock checkpoints. Alarms wake a hibernated object without keeping it awake. */
	private scheduleAlarm(): void {
		const at = this.core?.nextAlarmAt() ?? null;
		if (at === this.alarmAt) return;
		this.alarmAt = at;
		if (at === null) void this.ctx.storage.deleteAlarm();
		else void this.ctx.storage.setAlarm(Math.max(at, Date.now() + 50));
	}
}
