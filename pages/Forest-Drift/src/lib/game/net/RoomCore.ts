import { obbsOverlap } from '../miniBuild/miniBuildGrid';
import { FALL_REPORT_MAX_DISTANCE, fallDamageSegments } from '../player/fallDamage';
import { PUNCH_COOLDOWN_MS, PUNCH_DAMAGE, punchPlausible } from '../player/punch';
import {
	HEALTH_MAX,
	canRespawn,
	createHealthState,
	damageHealth,
	healthAt,
	reviveHealth,
	type DamageSource,
	type HealthState
} from '../player/PlayerHealth';
import { entityKey } from './worldEntities';
import {
	validateMiniBuildDefinition,
	validateMiniBuildInstance
} from '../miniBuild/MiniBuildValidation';
import {
	resolveMiniBuildInteraction,
	MINI_BUILD_INTERACTION_RANGE
} from '../miniBuild/MiniBuildInteractions';
import type { MiniBuildInteractionRef, OccupiedMiniBuildInteraction } from './protocol';
import {
	CLIENT_LEAVE_CODE,
	CLOSE_CODES,
	GRACE_PERIOD_MS,
	MAX_ENV_JSON_BYTES,
	MAX_JSON_BYTES,
	MAX_OPS_JSON_BYTES,
	MAX_PLAYERS_PER_WORLD,
	MESSAGE_TYPE,
	POSE_BYTES,
	POSE_FLAGS,
	PLAYER_COLOURS,
	PROTOCOL_VERSION,
	ROOM_TICK_MS,
	binaryMessageType,
	decodePose,
	encodeSnapshot,
	fromWireTime,
	isValidPlayerId,
	parseClientMessage,
	parseSharedEnvironment,
	sanitizeColour,
	sanitizeDisplayName,
	type CommitMessage,
	type ErrorMessage,
	type HelloMessage,
	type OpsMessage,
	type PlayerBookmark,
	type PlayerInfo,
	type PlayerRole,
	type RoomClockState,
	type ServerJsonMessage,
	type SharedEnvironment,
	type SnapshotEntry
} from './protocol';
import type { StoredRow, WorldStore } from './WorldStore';

/**
 * One client connection as the room sees it. The Durable Object wraps a hibernatable WebSocket; tests
 * and the Node adapter wrap whatever socket they have. Nothing else about the transport leaks in here.
 */
export interface RoomConnection {
	send(data: string | ArrayBuffer): void;
	close(code: number, reason: string): void;
	/**
	 * Remembers who this connection is across Durable Object hibernation (`serializeAttachment`), so a
	 * room that was evicted while players stood still can rebuild its player list when it wakes.
	 */
	setAttachment(attachment: PlayerAttachment | null): void;
}

export interface PlayerAttachment {
	playerId: string;
	slot: number;
	name: string;
	colour: string;
	role: PlayerRole;
	away: boolean;
	/** Knocked out (see PlayerInfo.down), so it survives the room sleeping. */
	down?: boolean;
	/**
	 * Where the player last came to rest. A sleeping Durable Object forgets every pose, and a player
	 * standing still sends none, so without this the room would not know where idle players are
	 * after waking (punches at them would always miss). Saved only when a player stops, never per
	 * step, and the attachment survives hibernation with the socket.
	 */
	pose?: StoredPose;
}

/** A dropped player whose slot is being held (Q21). Persisted so hibernation or a restart keeps it. */
export interface GraceEntry extends PlayerAttachment {
	expiresAt: number;
}

/** The room clock as stored: enough to carry on after hibernation, or stop cleanly after a crash. */
export interface RoomClockRecord {
	accumulatedMs: number;
	/** Server time the clock last started running, or null while the world is empty. */
	runningSince: number | null;
	/** Last time the room was known to be alive and occupied (written every `CHECKPOINT_MS`). */
	checkpointAt: number;
}

export interface RoomWorldInfo {
	worldId: string;
	name: string;
	schemaVersion: number;
	generatorVersion: number;
}

export type AuthResult =
	| { ok: true; role: PlayerRole; capability: string | null; via: 'invite' | 'capability' }
	| { ok: false };

/** Where the room keeps what must outlive memory. The Durable Object writes these to SQLite. */
export interface RoomSessionState {
	doors: string[];
	interactions: (OccupiedMiniBuildInteraction & { signature: string })[];
}

export interface RoomPersistence {
	/** Ephemeral room state, saved only when it changes, never on pose updates. */
	saveSessionState?(state: RoomSessionState): void;
	saveGrace(entries: GraceEntry[]): void;
	saveClock(clock: RoomClockRecord): void;
	saveEnv(envJson: string): void;
	/**
	 * One committed building batch, written in a single transaction: changed rows, removed rows,
	 * the commit for the catch-up log, and the batch id for dedupe.
	 */
	saveCommit?(record: CommitRecord): void;
	/** Commits after `afterSeq`, oldest first; null when the log no longer reaches back that far. */
	loadCommitsSince?(afterSeq: number): CommitMessage[] | null;
	/** The seq a batch was committed at, if this player's batch id was seen before (dedupe). */
	findBatchSeq?(playerId: string, batchId: string): number | null;
	/** A player's name, and (on leaving) where they were — Q18 bookmarks. */
	savePlayer?(playerId: string, name: string, bookmark: PlayerBookmark | null): void;
	loadPlayer?(playerId: string): { name: string; bookmark: PlayerBookmark | null } | null;
	/** Everyone who has been in this world, for "Sam added this" notices. */
	playerNames?(): Record<string, string>;
	/**
	 * A player's health, written whenever it changes (rare: a hit or a respawn) so it survives the
	 * Durable Object hibernating with the player still here. Null clears it (full health).
	 */
	savePlayerHealth?(playerId: string, health: StoredHealth | null): void;
	loadPlayerHealth?(playerId: string): StoredHealth | null;
}

/** Health as stored per player: the shared rules' state without the transient grace period. */
export type StoredHealth = Omit<HealthState, 'graceUntil'>;

export interface CommitRecord {
	commit: CommitMessage;
	playerId: string;
	upserts: StoredRow[];
	deletes: string[];
}

export interface RoomCoreOptions {
	world: RoomWorldInfo;
	/**
	 * Checks a hello's invite token or capability (async: hashing and HMAC). Kept outside RoomCore so
	 * the secret and the stored token hashes stay with the host.
	 */
	authorize: (hello: HelloMessage) => Promise<AuthResult>;
	/** Room clock, ms. `Date.now` in production; a fake clock in tests. */
	now?: () => number;
	maxPlayers?: number;
	/**
	 * Fastest believable horizontal speed between two poses, m/s. Flight is off in multiplayer worlds
	 * (F3-C), so this is the published run speed plus a margin (see `maxSpeedForRunSpeed`).
	 */
	maxSpeed?: number;
	/** Whether long falls hurt, until the owner shares a rule of their own (Q1, Q22). */
	fallDamage?: boolean;
	persistence?: RoomPersistence;
	restored?: {
		grace?: GraceEntry[];
		clock?: RoomClockRecord | null;
		envJson?: string | null;
		session?: RoomSessionState | null;
	};
	/**
	 * The shared world's rows and rules (Phase 3), or a function that loads them on first use. The
	 * Durable Object passes a loader: reading every row on each wake from hibernation would burn the
	 * free plan's daily row reads, and most wakes (a ping, a join) never touch the rows.
	 */
	store?: WorldStore | (() => WorldStore);
	/** The world's current version, cheaply (without loading the rows). Defaults to the store's. */
	storeVersion?: () => { epoch: number; seq: number };
}

export interface RoomStats {
	posesAccepted: number;
	posesRejected: number;
	snapshotsSent: number;
	snapshotBytesSent: number;
	jsonMessagesIn: number;
	messagesDropped: number;
	helloRejected: number;
	/** Fall reports that cost health. */
	fallsApplied: number;
	/** Fall reports longer than the drop the room saw in that player's poses (capped, not rejected). */
	fallMismatches: number;
	/** Punches that cost the target health. */
	punchesLanded: number;
	/** Punches the room refused because the two players' poses were too far apart or misaligned. */
	punchesRejected: number;
}

export interface StoredPose {
	flags: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	/** Full room-clock time the pose was sampled. */
	sampleTime: number;
}

interface PlayerState {
	/** Null while the player is in the grace period. */
	conn: RoomConnection | null;
	info: PlayerInfo;
	pose: StoredPose | null;
	/** Bumped on every accepted pose; snapshots send a slot only when this moved past what that client last got. */
	poseVersion: number;
	/** slot → poseVersion this player was last sent. */
	lastSent: Map<number, number>;
	rateWindowStart: number;
	posesInWindow: number;
	jsonInWindow: number;
	graceExpiresAt: number | null;
	/** When poses started failing the speed check (null while they pass). */
	speedRejectSince: number | null;
	opsWindowStart: number;
	opsInWindow: number;
	/** Loaded on first use (see `healthOf`). */
	health: HealthState | null;
	/** The airborne spell the poses show right now: its highest feet height. */
	air: { peakY: number } | null;
	/** Recent landings seen in the poses, newest last, to check fall reports against. */
	landings: { drop: number; at: number }[];
	lastFallId: number;
	lastFallAt: number;
	lastPunchId: number;
	lastPunchAt: number;
}

/** At most four fall reports a second per player. */
const FALL_MIN_INTERVAL_MS = 250;
/** How far apart a reported landing and one seen in the poses may be, ms. */
const FALL_MATCH_WINDOW_MS = 1500;
/** Pose sampling can miss the top of a jump; reports this much over the observed drop are fine. */
const FALL_SLACK_METRES = 1.5;

/** Room keeps ticking this long after the last pose, then goes quiet so the Durable Object can hibernate. */
const IDLE_AFTER_MS = 2000;
const RATE_WINDOW_MS = 1000;
const MAX_POSES_PER_SECOND = 30;
const MAX_JSON_PER_SECOND = 20;
/** Building ops per player (plan §7.5 rates, loosened for cascading deletes). */
const OPS_WINDOW_MS = 10_000;
const MAX_OPS_PER_WINDOW = 1500;
/** A pose stamped further than this from the room clock gets the arrival time instead. */
const MAX_SAMPLE_SKEW_MS = 5000;
const WORLD_COORD_LIMIT = 5_000_000;
const HEIGHT_MIN = -10_000;
const HEIGHT_MAX = 100_000;
/** Default when the world doesn't say: the run-speed slider's maximum, 30 m/s. */
const DEFAULT_MAX_SPEED = maxSpeedForRunSpeed(30);
/**
 * Too-fast poses are dropped, but only for this long: after that the room accepts the new position
 * (as if it were a teleport) so a legitimate jump the client didn't flag can't freeze an avatar.
 */
const SPEED_RESYNC_MS = 2000;
/** While occupied, the clock is written down this often, so a crash loses at most this much. */
export const CLOCK_CHECKPOINT_MS = 60_000;

/** Fastest believable horizontal speed for a world whose players run at `runSpeed` m/s. */
export function maxSpeedForRunSpeed(runSpeed: number): number {
	const run = Number.isFinite(runSpeed) && runSpeed > 0 ? runSpeed : 30;
	return run * 1.5 + 4;
}

/**
 * The world room's realtime logic: who is connected (and who dropped and is being waited for), the
 * handshake and roles, pose validation, the batched snapshots that keep every player's view of
 * everyone else up to date, the room clock, and the owner's shared sky and weather.
 *
 * It is plain TypeScript with no timers of its own:
 *   - the host calls `tick()` every `ROOM_TICK_MS` while `needsTick()` is true, and stops when it
 *     isn't — which is what lets an idle Durable Object hibernate (a running timer would keep it
 *     awake and billed);
 *   - the host sets an alarm for `nextAlarmAt()` and calls `onAlarm()` when it fires (grace expiries
 *     and clock checkpoints).
 */
export class RoomCore {
	readonly stats: RoomStats = {
		posesAccepted: 0,
		posesRejected: 0,
		snapshotsSent: 0,
		snapshotBytesSent: 0,
		jsonMessagesIn: 0,
		messagesDropped: 0,
		helloRejected: 0,
		fallsApplied: 0,
		fallMismatches: 0,
		punchesLanded: 0,
		punchesRejected: 0
	};

	private readonly world: RoomWorldInfo;
	private interactionsStoreSeq = -1;
	private readonly interactions = new Map<
		string,
		OccupiedMiniBuildInteraction & { signature: string }
	>();
	private readonly authorize: RoomCoreOptions['authorize'];
	private readonly now: () => number;
	private readonly maxPlayers: number;
	private readonly maxSpeed: number;
	private readonly fallDamage: boolean;
	private readonly persistence: RoomPersistence | null;
	private storeValue: WorldStore | null;
	private readonly storeLoader: (() => WorldStore) | null;
	private readonly storeVersion: (() => { epoch: number; seq: number }) | null;
	/** Doors open right now (Q13-A); cleared when the world empties. */
	private readonly openDoors = new Set<string>();
	private savedSessionJson = '{"doors":[],"interactions":[]}';
	/** Everyone in the world, connected or in their grace period, by player id. */
	private readonly players = new Map<string, PlayerState>();
	private readonly byConn = new Map<RoomConnection, PlayerState>();
	/** Connections whose hello is being checked, and ones that closed while it was. */
	private readonly pendingHello = new Set<RoomConnection>();
	private readonly closedWhilePending = new WeakSet<RoomConnection>();
	private lastPoseAt = Number.NEGATIVE_INFINITY;
	private clock: RoomClockRecord;
	private env: SharedEnvironment | null = null;
	/**
	 * After a restart, nobody is connected but the clock was running: keep it running this much
	 * longer in case they're about to reconnect, so a deploy doesn't rewind everyone's sky.
	 */
	private restartHoldUntil: number | null = null;

	constructor(options: RoomCoreOptions) {
		this.world = options.world;
		this.authorize = options.authorize;
		this.now = options.now ?? (() => Date.now());
		this.maxPlayers = Math.max(1, Math.min(255, options.maxPlayers ?? MAX_PLAYERS_PER_WORLD));
		this.maxSpeed = options.maxSpeed ?? DEFAULT_MAX_SPEED;
		this.fallDamage = options.fallDamage ?? false;
		this.persistence = options.persistence ?? null;
		const store = options.store ?? null;
		this.storeValue = typeof store === 'function' ? null : store;
		this.storeLoader = typeof store === 'function' ? store : null;
		this.storeVersion = options.storeVersion ?? null;
		const now = this.now();
		this.clock = options.restored?.clock
			? { ...options.restored.clock }
			: { accumulatedMs: 0, runningSince: null, checkpointAt: now };
		if (options.restored?.envJson) {
			try {
				this.env = parseSharedEnvironment(JSON.parse(options.restored.envJson));
			} catch {
				this.env = null;
			}
		}
		const session = options.restored?.session;
		if (session) {
			for (const id of session.doors) this.openDoors.add(id);
			for (const entry of session.interactions) this.interactions.set(entry.playerId, { ...entry });
			this.savedSessionJson = JSON.stringify(session);
		}
		for (const entry of options.restored?.grace ?? []) {
			if (this.players.has(entry.playerId)) continue;
			const { expiresAt, ...attachment } = entry;
			const player = this.createPlayerState(null, toInfo(attachment, true));
			player.graceExpiresAt = expiresAt;
			this.players.set(entry.playerId, player);
		}
	}

	get playerCount(): number {
		return this.players.size;
	}

	get connectedCount(): number {
		return this.byConn.size;
	}

	listPlayers(): PlayerInfo[] {
		return [...this.players.values()].map((player) => ({ ...player.info }));
	}

	/** The room clock now (Q11-A: it only advances while someone is in the world). */
	clockState(now = this.now()): RoomClockState {
		const running = this.clock.runningSince !== null;
		return {
			elapsedMs: this.clock.accumulatedMs + (running ? now - this.clock.runningSince! : 0),
			running
		};
	}

	/**
	 * Rebuilds the player list after the Durable Object wakes from hibernation (or restarts). Poses
	 * are not restored (they were never stored); clients resend theirs when they next move or when
	 * someone joins. Call once, after construction.
	 */
	restore(connections: { conn: RoomConnection; attachment: PlayerAttachment | null }[]): void {
		const now = this.now();
		for (const { conn, attachment } of connections) {
			if (!attachment || this.byConn.has(conn)) continue;
			const existing = this.players.get(attachment.playerId);
			if (existing?.conn) {
				conn.close(CLOSE_CODES.replaced, 'Duplicate connection after restore');
				continue;
			}
			if (existing) {
				// Was in its grace period, but this socket is still open after all.
				existing.conn = conn;
				existing.pose ??= attachment.pose ? { ...attachment.pose } : null;
				existing.graceExpiresAt = null;
				existing.info.offline = false;
				this.byConn.set(conn, existing);
				continue;
			}
			if (this.findBySlot(attachment.slot)) {
				conn.close(CLOSE_CODES.replaced, 'Duplicate slot after restore');
				continue;
			}
			const player = this.createPlayerState(conn, toInfo(attachment, false));
			player.pose = attachment.pose ? { ...attachment.pose } : null;
			this.players.set(attachment.playerId, player);
			this.byConn.set(conn, player);
		}
		if (this.clock.runningSince !== null && this.players.size === 0) {
			// Restarted with nobody here: give them a grace period to come back before stopping.
			this.restartHoldUntil = now + GRACE_PERIOD_MS;
		}
		// Only still-connected players may keep a seat. Validate anchors once on wake.
		const occupiedBefore = this.interactions.size;
		for (const [id, entry] of this.interactions) {
			const resolved = this.players.get(id)?.conn ? this.resolveInteraction(entry) : null;
			if (!resolved || JSON.stringify(resolved) !== entry.signature) this.interactions.delete(id);
		}
		if (this.players.size === 0 && this.restartHoldUntil === null) this.clearSessionState();
		if (this.interactions.size !== occupiedBefore) this.broadcastInteractions();
		else this.persistSessionState();
		this.saveGrace();
	}

	/**
	 * Handles one message. Returns a promise only for `hello` (which needs async token checks); every
	 * other message is handled synchronously.
	 */
	onMessage(conn: RoomConnection, data: string | ArrayBuffer): void | Promise<void> {
		if (typeof data === 'string') return this.handleJson(conn, data);
		if (binaryMessageType(data) === MESSAGE_TYPE.pose) {
			this.handlePose(conn, data);
			return;
		}
		this.stats.messagesDropped++;
	}

	/**
	 * A connection closed. A deliberate leave (`CLIENT_LEAVE_CODE`) leaves at once; anything else — a
	 * dropped network, a closed laptop lid, a refresh — holds the player's slot for the grace period.
	 */
	onClose(conn: RoomConnection, code?: number): void {
		if (this.pendingHello.has(conn)) this.closedWhilePending.add(conn);
		const player = this.byConn.get(conn);
		if (!player) return;
		this.byConn.delete(conn);
		if (this.interactions.delete(player.info.playerId)) this.broadcastInteractions();
		player.conn = null;
		if (code === CLIENT_LEAVE_CODE) {
			this.removePlayer(player);
			return;
		}
		player.graceExpiresAt = this.now() + GRACE_PERIOD_MS;
		player.info.offline = true;
		this.broadcastPresence(player);
		this.saveGrace();
	}

	/** When the host should next call `onAlarm`, or null for no alarm. */
	nextAlarmAt(): number | null {
		let next: number | null = null;
		for (const player of this.players.values()) {
			if (player.graceExpiresAt !== null) next = Math.min(next ?? Infinity, player.graceExpiresAt);
		}
		if (this.restartHoldUntil !== null) next = Math.min(next ?? Infinity, this.restartHoldUntil);
		if (this.clock.runningSince !== null) {
			next = Math.min(next ?? Infinity, this.clock.checkpointAt + CLOCK_CHECKPOINT_MS);
		}
		return next;
	}

	/** Expires grace periods that are over and writes a clock checkpoint. */
	onAlarm(): void {
		const now = this.now();
		for (const player of [...this.players.values()]) {
			if (player.graceExpiresAt !== null && player.graceExpiresAt <= now) this.removePlayer(player);
		}
		if (this.restartHoldUntil !== null && this.restartHoldUntil <= now) {
			this.restartHoldUntil = null;
			if (this.players.size === 0 && this.clock.runningSince !== null) {
				// Nobody came back: the world was last known occupied at the checkpoint.
				this.stopClock(this.clock.checkpointAt);
				this.clearSessionState();
			}
		}
		if (this.clock.runningSince !== null && now - this.clock.checkpointAt >= CLOCK_CHECKPOINT_MS) {
			this.clock.checkpointAt = now;
			this.persistence?.saveClock({ ...this.clock });
		}
	}

	/** True while there is anything to relay: two connected players and a pose within the idle window. */
	needsTick(): boolean {
		return this.byConn.size >= 2 && this.now() - this.lastPoseAt < IDLE_AFTER_MS;
	}

	/** Sends each player one snapshot holding every other player whose pose changed since their last one. */
	tick(): void {
		let changed = false;
		if (this.interactions.size && this.store?.seq !== this.interactionsStoreSeq)
			for (const [playerId, entry] of this.interactions) {
				const resolved = this.resolveInteraction(entry);
				if (
					!resolved ||
					JSON.stringify(resolved) !== entry.signature ||
					!this.players.get(playerId)?.conn
				) {
					this.interactions.delete(playerId);
					changed = true;
				}
			}
		if (this.interactions.size) this.interactionsStoreSeq = this.store?.seq ?? -1;
		if (changed) this.broadcastInteractions();
		const now = this.now();
		for (const receiver of this.byConn.values()) {
			const entries = this.collectEntries(receiver, now, false);
			if (entries.length > 0) this.sendSnapshot(receiver, now, entries);
		}
	}

	private handleJson(conn: RoomConnection, text: string): void | Promise<void> {
		this.stats.jsonMessagesIn++;
		if (text.length > MAX_OPS_JSON_BYTES) {
			this.stats.messagesDropped++;
			return;
		}
		const player = this.byConn.get(conn);
		if (player && !this.allowJson(player)) {
			this.stats.messagesDropped++;
			return;
		}
		const message = parseClientMessage(text);
		const limit =
			message?.t === 'ops'
				? MAX_OPS_JSON_BYTES
				: message?.t === 'env'
					? MAX_ENV_JSON_BYTES
					: MAX_JSON_BYTES;
		if (!message || text.length > limit) {
			this.stats.messagesDropped++;
			return;
		}
		if (message.t === 'ping') {
			send(conn, { t: 'pong', c: message.c, s: this.now() });
			return;
		}
		if (message.t === 'env') {
			if (player) this.handleEnv(player, message.env, text.length);
			else this.stats.messagesDropped++;
			return;
		}
		if (message.t === 'ops') {
			if (player) this.handleOps(player, message);
			else this.stats.messagesDropped++;
			return;
		}
		if (message.t === 'interaction') {
			if (!player) return;
			const id = player.info.playerId;
			if (message.location === null) this.interactions.delete(id);
			else {
				const resolved = this.resolveInteraction(message.location);
				const occupied = [...this.interactions.values()].some((entry) => {
					if (entry.playerId === id) return false;
					if (
						entry.instanceId === message.location!.instanceId &&
						entry.locationId === message.location!.locationId
					)
						return true;
					const other = this.resolveInteraction(entry);
					return !!resolved && !!other && obbsOverlap(resolved.box, other.box, -0.015);
				});
				const pose = player.pose;
				if (
					resolved &&
					pose &&
					!occupied &&
					Math.hypot(
						resolved.position.x - pose.x,
						resolved.position.y - pose.y,
						resolved.position.z - pose.z
					) <=
						MINI_BUILD_INTERACTION_RANGE + 1
				)
					this.interactions.set(id, {
						...message.location,
						playerId: id,
						signature: JSON.stringify(resolved)
					});
			}
			this.broadcastInteractions(id);
			return;
		}
		if (message.t === 'fall') {
			if (player) this.handleFall(player, message);
			return;
		}
		if (message.t === 'respawn') {
			if (player) this.handleRespawn(player);
			return;
		}
		if (message.t === 'punch') {
			if (player) this.handlePunch(player, message);
			return;
		}
		if (message.t === 'door') {
			if (!player) return;
			if (message.open) this.openDoors.add(message.id);
			else this.openDoors.delete(message.id);
			this.persistSessionState();
			this.broadcast(
				{ t: 'door', id: message.id, open: message.open, by: player.info.slot },
				player.conn ?? undefined
			);
			return;
		}
		return this.handleHello(conn, message);
	}

	private resolveInteraction(ref: MiniBuildInteractionRef) {
		const instanceRow = this.store?.get(entityKey('miniBuildInstance', ref.instanceId));
		if (!instanceRow) return null;
		const designId = instanceRow.data.designId;
		if (typeof designId !== 'string') return null;
		const designRow = this.store?.get(entityKey('miniBuildDefinition', designId));
		if (!designRow) return null;
		const definition = validateMiniBuildDefinition({ ...designRow.data, id: designId });
		if (!definition.ok) return null;
		const instance = validateMiniBuildInstance(
			{ ...instanceRow.data, id: ref.instanceId },
			new Set([designId])
		);
		if (!instance.ok) return null;
		const location = definition.value.interactionLocations?.find(
			(l) => l.id === ref.locationId && l.enabled
		);
		return location
			? resolveMiniBuildInteraction(definition.value, instance.value, location)
			: null;
	}
	private interactionList(): OccupiedMiniBuildInteraction[] {
		return [...this.interactions.values()].map(({ playerId, instanceId, locationId }) => ({
			playerId,
			instanceId,
			locationId
		}));
	}
	private broadcastInteractions(replyTo?: string): void {
		this.persistSessionState();
		this.broadcast({
			t: 'interactions',
			locations: this.interactionList(),
			...(replyTo ? { replyTo } : {})
		});
	}

	private async handleHello(conn: RoomConnection, hello: HelloMessage): Promise<void> {
		if (this.byConn.has(conn) || this.pendingHello.has(conn)) return;
		if (hello.protocol !== PROTOCOL_VERSION) {
			this.reject(
				conn,
				'protocol',
				CLOSE_CODES.protocolMismatch,
				'Please refresh the game to update it.'
			);
			return;
		}
		if (
			hello.schemaVersion !== this.world.schemaVersion ||
			hello.generatorVersion !== this.world.generatorVersion
		) {
			this.reject(
				conn,
				'version',
				CLOSE_CODES.versionMismatch,
				'This world was published with a different game version. Please refresh the game.'
			);
			return;
		}
		const name = sanitizeDisplayName(hello.name);
		const colour = sanitizeColour(hello.colour);
		if (!isValidPlayerId(hello.playerId) || !name || !colour) {
			this.reject(conn, 'hello', CLOSE_CODES.badHello, 'Invalid player details.');
			return;
		}

		this.pendingHello.add(conn);
		let auth: AuthResult;
		try {
			auth = await this.authorize(hello);
		} catch {
			auth = { ok: false };
		} finally {
			this.pendingHello.delete(conn);
		}
		if (this.closedWhilePending.has(conn)) return;
		if (!auth.ok) {
			this.reject(
				conn,
				'access',
				CLOSE_CODES.accessDenied,
				'This invite link is not valid for this world.'
			);
			return;
		}

		const now = this.now();
		const existing = this.players.get(hello.playerId);
		if (existing?.conn) {
			// Same player id, still connected: a second tab, or a reconnect before the old socket was
			// noticed as dead (half-open after a Wi-Fi drop). Only someone holding this player's
			// capability may take it over — otherwise anyone with the shared editor link could kick
			// a friend by copying their player id.
			if (auth.via !== 'capability') {
				this.reject(
					conn,
					'taken',
					CLOSE_CODES.alreadyConnected,
					"You're already in this world in another tab."
				);
				return;
			}
			this.byConn.delete(existing.conn);
			existing.conn.close(CLOSE_CODES.replaced, 'Opened in another tab');
			existing.conn = null;
		}
		if (!existing && this.freeSlot() === null) {
			this.reject(conn, 'full', CLOSE_CODES.worldFull, 'This world is full.');
			return;
		}

		const wasEmpty = this.players.size === 0;
		const info: PlayerInfo = {
			slot: existing?.info.slot ?? this.freeSlot()!,
			playerId: hello.playerId,
			name: this.uniqueName(name, hello.playerId),
			colour: this.uniqueColour(colour, hello.playerId),
			role: auth.role,
			away: false,
			offline: false
		};
		let player: PlayerState;
		if (existing) {
			// Resuming inside the grace period, or taking over from another tab: same slot, same pose,
			// and others just see the player come back rather than leave and join again.
			player = existing;
			player.conn = conn;
			player.info = info;
			if (player.health?.dead) player.info.down = true;
			player.graceExpiresAt = null;
			player.lastSent.clear();
		} else {
			player = this.createPlayerState(conn, info);
			this.players.set(info.playerId, player);
		}
		this.byConn.set(conn, player);
		conn.setAttachment(toAttachment(info, player.pose));
		if (wasEmpty) this.startClock(now);
		this.restartHoldUntil = null;
		this.saveGrace();
		const saved = this.persistence?.loadPlayer?.(info.playerId) ?? null;
		this.persistence?.savePlayer?.(info.playerId, info.name, saved?.bookmark ?? null);
		if (!existing) player.health = this.healthOnJoin(info.playerId, now);
		const catchUp = this.catchUpFor(hello);

		send(conn, {
			t: 'welcome',
			slot: info.slot,
			role: info.role,
			capability: auth.capability,
			serverTime: now,
			players: this.listPlayers(),
			tickMs: ROOM_TICK_MS,
			world: { worldId: this.world.worldId, name: this.world.name },
			clock: this.clockState(now),
			env: this.env,
			rules: { maxSpeed: this.maxSpeed, flight: false, fallDamage: this.fallDamage },
			epoch: this.version()?.epoch ?? 0,
			seq: this.version()?.seq ?? 0,
			resync: catchUp === null,
			bookmark: saved?.bookmark ?? null,
			health: this.healthOf(player, now),
			doors: [...this.openDoors],
			interactions: this.interactionList(),
			names: this.playerNames()
		});
		this.broadcast({ t: 'joined', player: { ...info } }, conn);
		if (catchUp) {
			for (const commit of catchUp) send(conn, commit);
			send(conn, { t: 'synced', seq: this.version()?.seq ?? 0 });
		}

		// Everyone already standing somewhere appears straight away, even if nobody is moving.
		const entries = this.collectEntries(player, now, true);
		if (entries.length > 0) this.sendSnapshot(player, now, entries);
	}

	/**
	 * The commits a reconnecting client missed, or null when it needs a fresh snapshot instead (a
	 * different epoch — the world was restored — or a gap the log no longer covers).
	 */
	private catchUpFor(hello: HelloMessage): CommitMessage[] | null {
		const version = this.version();
		if (!version) return [];
		if (hello.epoch !== version.epoch || hello.lastSeq === null || hello.lastSeq > version.seq) {
			return null;
		}
		if (hello.lastSeq === version.seq) return [];
		return this.persistence?.loadCommitsSince?.(hello.lastSeq) ?? null;
	}

	/** The loaded store, loading it now if needed; null in a room without shared building. */
	get store(): WorldStore | null {
		if (!this.storeValue && this.storeLoader) this.storeValue = this.storeLoader();
		return this.storeValue;
	}

	/** True once the rows are in memory (the snapshot endpoint can then skip a database read). */
	get storeLoaded(): boolean {
		return this.storeValue !== null;
	}

	private version(): { epoch: number; seq: number } | null {
		if (this.storeValue) return { epoch: this.storeValue.epoch, seq: this.storeValue.seq };
		if (this.storeVersion) return this.storeVersion();
		return this.storeLoader ? { epoch: this.store!.epoch, seq: this.store!.seq } : null;
	}

	private playerNames(): Record<string, string> {
		const names = { ...(this.persistence?.playerNames?.() ?? {}) };
		for (const player of this.players.values()) names[player.info.playerId] = player.info.name;
		return names;
	}

	/** A building batch (plan §7.3): validate, commit in order, tell everyone — or refuse. */
	private handleOps(player: PlayerState, message: OpsMessage): void {
		const conn = player.conn;
		if (!conn) return;
		const store = this.store;
		if (!store) {
			send(conn, {
				t: 'reject',
				batchId: message.batchId,
				reason: 'invalid',
				message: "Building isn't shared in this world."
			});
			return;
		}
		// A resend of a batch that was already committed (its acknowledgement was lost in a drop).
		const previous = this.persistence?.findBatchSeq?.(player.info.playerId, message.batchId);
		if (previous !== null && previous !== undefined) {
			send(conn, { t: 'ack', batchId: message.batchId, seq: previous });
			return;
		}
		const now = this.now();
		if (now - player.opsWindowStart >= OPS_WINDOW_MS) {
			player.opsWindowStart = now;
			player.opsInWindow = 0;
		}
		player.opsInWindow += Array.isArray(message.ops) ? message.ops.length : 1;
		if (player.opsInWindow > MAX_OPS_PER_WINDOW) {
			send(conn, {
				t: 'reject',
				batchId: message.batchId,
				reason: 'rate',
				message: 'Building too fast — slow down a little.'
			});
			return;
		}
		const result = store.applyBatch(
			{ playerId: player.info.playerId, name: player.info.name, role: player.info.role },
			message.ops
		);
		if (!result.ok) {
			send(conn, {
				t: 'reject',
				batchId: message.batchId,
				reason: result.reason,
				message: result.message,
				...(result.conflicts ? { conflicts: result.conflicts } : {})
			});
			return;
		}
		const commit: CommitMessage = {
			t: 'commit',
			seq: result.seq,
			epoch: store.epoch,
			batchId: message.batchId,
			by: player.info.playerId,
			byName: player.info.name,
			ops: result.ops,
			...(result.overwritten.length > 0 ? { overwritten: result.overwritten } : {}),
			checksum: result.checksum
		};
		this.persistence?.saveCommit?.({
			commit,
			playerId: player.info.playerId,
			upserts: result.upserts,
			deletes: result.deletes
		});
		// The broadcast doubles as the sender's acknowledgement.
		this.broadcast(commit);
	}

	private handleEnv(player: PlayerState, raw: unknown, bytes: number): void {
		if (player.info.role !== 'owner') {
			if (player.conn) {
				send(player.conn, {
					t: 'error',
					code: 'role',
					message: 'Only the owner can change the sky and weather.'
				});
			}
			return;
		}
		const env = parseSharedEnvironment(raw);
		if (!env || bytes > MAX_ENV_JSON_BYTES) {
			this.stats.messagesDropped++;
			return;
		}
		this.env = env;
		this.persistence?.saveEnv(JSON.stringify(env));
		this.broadcast({ t: 'env', env, by: player.info.slot }, player.conn ?? undefined);
	}

	private handlePose(conn: RoomConnection, data: ArrayBuffer): void {
		const player = this.byConn.get(conn);
		if (!player || data.byteLength !== POSE_BYTES) {
			this.stats.messagesDropped++;
			return;
		}
		const now = this.now();
		if (!this.allowPose(player, now)) {
			this.stats.messagesDropped++;
			return;
		}
		const pose = decodePose(data);
		if (!pose || !isPlausiblePosition(pose.x, pose.y, pose.z)) {
			this.stats.posesRejected++;
			return;
		}

		let sampleTime = fromWireTime(pose.sampleTime, now);
		if (Math.abs(sampleTime - now) > MAX_SAMPLE_SKEW_MS) sampleTime = now;

		const previous = player.pose;
		if (previous && (pose.flags & POSE_FLAGS.teleport) === 0) {
			// Out-of-order or duplicate sample: the newer one already won.
			if (sampleTime <= previous.sampleTime) {
				this.stats.posesRejected++;
				return;
			}
			const dt = Math.max(0.05, (sampleTime - previous.sampleTime) / 1000);
			const distance = Math.hypot(pose.x - previous.x, pose.z - previous.z);
			if (distance / dt > this.maxSpeed) {
				player.speedRejectSince ??= now;
				if (now - player.speedRejectSince < SPEED_RESYNC_MS) {
					this.stats.posesRejected++;
					return;
				}
			}
		}
		player.speedRejectSince = null;
		this.trackAir(player, pose.flags, pose.y, sampleTime);

		player.pose = {
			flags: pose.flags,
			x: pose.x,
			y: pose.y,
			z: pose.z,
			yaw: pose.yaw,
			pitch: pose.pitch,
			sampleTime
		};
		player.poseVersion++;
		this.lastPoseAt = now;
		this.stats.posesAccepted++;

		const away = (pose.flags & POSE_FLAGS.away) !== 0;
		const awayChanged = away !== player.info.away;
		player.info.away = away;
		// A pose without `moving` is where the player came to rest (or an away/teleport pose).
		if (awayChanged || (pose.flags & POSE_FLAGS.moving) === 0) {
			conn.setAttachment(toAttachment(player.info, player.pose));
		}
		if (awayChanged) this.broadcastPresence(player);
	}

	private removePlayer(player: PlayerState): void {
		if (this.players.get(player.info.playerId) !== player) return;
		this.players.delete(player.info.playerId);
		if (player.conn) this.byConn.delete(player.conn);
		this.broadcast({ t: 'left', slot: player.info.slot, playerId: player.info.playerId });
		this.saveGrace();
		// Q18: next time, they start where they left. F2: with the health they left with — except
		// after dying, when they come back at the world spawn with full health.
		const pose = player.pose;
		const now = this.now();
		const health = this.healthOf(player, now);
		this.persistence?.savePlayer?.(
			player.info.playerId,
			player.info.name,
			health.dead
				? null
				: pose
					? { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch }
					: (this.persistence?.loadPlayer?.(player.info.playerId)?.bookmark ?? null)
		);
		// Stored as of leaving, so time away never heals (regeneration restarts on the next join).
		const points = healthAt(health, now);
		this.persistence?.savePlayerHealth?.(
			player.info.playerId,
			health.dead || points >= HEALTH_MAX ? null : { base: points, lastDamageAt: now, dead: false }
		);
		if (this.players.size === 0) {
			this.stopClock(this.now());
			// Q13-A: doors reset each session.
			this.clearSessionState();
		}
	}

	private startClock(now: number): void {
		if (this.clock.runningSince !== null) return;
		this.clock = { ...this.clock, runningSince: now, checkpointAt: now };
		this.persistence?.saveClock({ ...this.clock });
	}

	private stopClock(at: number): void {
		const since = this.clock.runningSince;
		if (since === null) return;
		this.clock = {
			accumulatedMs: this.clock.accumulatedMs + Math.max(0, at - since),
			runningSince: null,
			checkpointAt: at
		};
		this.persistence?.saveClock({ ...this.clock });
	}

	/** A new session or restored world must not inherit the old session’s doors and seats. */
	clearSessionState(): void {
		this.openDoors.clear();
		this.interactions.clear();
		this.persistSessionState();
	}

	private persistSessionState(): void {
		const state: RoomSessionState = {
			doors: [...this.openDoors],
			interactions: [...this.interactions.values()].map((entry) => ({ ...entry }))
		};
		const json = JSON.stringify(state);
		if (json === this.savedSessionJson) return;
		this.persistence?.saveSessionState?.(state);
		this.savedSessionJson = json;
	}

	private saveGrace(): void {
		if (!this.persistence) return;
		const entries: GraceEntry[] = [];
		for (const player of this.players.values()) {
			if (player.graceExpiresAt === null) continue;
			entries.push({ ...toAttachment(player.info), expiresAt: player.graceExpiresAt });
		}
		this.persistence.saveGrace(entries);
	}

	private collectEntries(receiver: PlayerState, now: number, includeAll: boolean): SnapshotEntry[] {
		const entries: SnapshotEntry[] = [];
		for (const other of this.players.values()) {
			if (other === receiver || !other.pose) continue;
			const sent = receiver.lastSent.get(other.info.slot) ?? -1;
			if (!includeAll && other.poseVersion <= sent) continue;
			receiver.lastSent.set(other.info.slot, other.poseVersion);
			entries.push({
				slot: other.info.slot,
				flags: other.pose.flags,
				x: other.pose.x,
				y: other.pose.y,
				z: other.pose.z,
				yaw: other.pose.yaw,
				pitch: other.pose.pitch,
				sampleAgeMs: now - other.pose.sampleTime
			});
		}
		return entries;
	}

	private sendSnapshot(receiver: PlayerState, now: number, entries: SnapshotEntry[]): void {
		if (!receiver.conn) return;
		const bytes = encodeSnapshot({ serverTime: now, entries });
		receiver.conn.send(bytes);
		this.stats.snapshotsSent++;
		this.stats.snapshotBytesSent += bytes.byteLength;
	}

	private broadcastPresence(player: PlayerState): void {
		this.broadcast(
			{
				t: 'presence',
				slot: player.info.slot,
				away: player.info.away,
				offline: player.info.offline,
				...(player.info.down ? { down: true } : {})
			},
			player.conn ?? undefined
		);
	}

	private broadcast(message: ServerJsonMessage, except?: RoomConnection): void {
		const text = JSON.stringify(message);
		for (const conn of this.byConn.keys()) {
			if (conn !== except) conn.send(text);
		}
	}

	private reject(
		conn: RoomConnection,
		code: ErrorMessage['code'],
		closeCode: number,
		message: string
	): void {
		this.stats.helloRejected++;
		send(conn, { t: 'error', code, message });
		conn.close(closeCode, message);
	}

	private allowPose(player: PlayerState, now: number): boolean {
		this.rollRateWindow(player, now);
		player.posesInWindow++;
		return player.posesInWindow <= MAX_POSES_PER_SECOND;
	}

	private allowJson(player: PlayerState): boolean {
		this.rollRateWindow(player, this.now());
		player.jsonInWindow++;
		return player.jsonInWindow <= MAX_JSON_PER_SECOND;
	}

	private rollRateWindow(player: PlayerState, now: number): void {
		if (now - player.rateWindowStart < RATE_WINDOW_MS) return;
		player.rateWindowStart = now;
		player.posesInWindow = 0;
		player.jsonInWindow = 0;
	}

	private createPlayerState(conn: RoomConnection | null, info: PlayerInfo): PlayerState {
		return {
			conn,
			info,
			pose: null,
			poseVersion: 0,
			lastSent: new Map(),
			rateWindowStart: this.now(),
			posesInWindow: 0,
			jsonInWindow: 0,
			graceExpiresAt: null,
			speedRejectSince: null,
			opsWindowStart: this.now(),
			opsInWindow: 0,
			health: null,
			air: null,
			landings: [],
			lastFallId: -1,
			lastFallAt: Number.NEGATIVE_INFINITY,
			lastPunchId: -1,
			lastPunchAt: Number.NEGATIVE_INFINITY
		};
	}

	/** The fall-damage rule in force: the owner's shared one, else the published world's. */
	private fallDamageEnabled(): boolean {
		return this.env?.rules?.fallDamage ?? this.fallDamage;
	}

	/**
	 * This player's health, loading it on first use. After hibernation the stored record still
	 * holds the exact last-hit time, so regeneration carries on as if nothing happened.
	 */
	private healthOf(player: PlayerState, now: number): HealthState {
		if (player.health) return player.health;
		const stored = this.persistence?.loadPlayerHealth?.(player.info.playerId) ?? null;
		// No grace here: waking up must not make anyone briefly immune. Only joining and respawning
		// grant it (healthOnJoin, reviveHealth).
		player.health =
			stored && !stored.dead
				? { ...stored, graceUntil: 0 }
				: { ...createHealthState(now), graceUntil: 0 };
		return player.health;
	}

	/** A fresh join: the health they left with, regeneration restarting now, plus the grace period. */
	private healthOnJoin(playerId: string, now: number): HealthState {
		const stored = this.persistence?.loadPlayerHealth?.(playerId) ?? null;
		if (!stored || stored.dead) return createHealthState(now);
		return createHealthState(now, healthAt({ ...stored, graceUntil: 0 }, stored.lastDamageAt));
	}

	private setHealth(
		player: PlayerState,
		health: HealthState,
		ack?: number,
		source?: DamageSource
	): void {
		player.health = health;
		// Everyone else draws a knocked-out player lying down (presence, never the health itself).
		if ((player.info.down === true) !== health.dead) {
			player.info.down = health.dead;
			if (player.conn) player.conn.setAttachment(toAttachment(player.info, player.pose));
			this.broadcastPresence(player);
		}
		this.persistence?.savePlayerHealth?.(player.info.playerId, {
			base: health.base,
			lastDamageAt: health.lastDamageAt,
			dead: health.dead
		});
		this.sendHealth(player, ack, source);
	}

	private sendHealth(player: PlayerState, ack?: number, source?: DamageSource): void {
		if (!player.conn || !player.health) return;
		send(player.conn, {
			t: 'health',
			state: { ...player.health },
			...(ack !== undefined ? { ack } : {}),
			...(source ? { source } : {})
		});
	}

	/** The owner's player-damage rule; on unless they turn it off. */
	private playerDamageEnabled(): boolean {
		return this.env?.rules?.playerDamage ?? true;
	}

	/**
	 * A punch (online only). The room decides everything: whether it may land (rule, role, cooldown,
	 * both alive, the attacker not seated, both poses close and facing) and the damage. Only the
	 * attacker hears whether it landed, and only the target hears its new health.
	 */
	private handlePunch(player: PlayerState, message: { id: number; target: number }): void {
		if (message.id <= player.lastPunchId) return;
		player.lastPunchId = message.id;
		const reply = (hit: boolean) => {
			if (player.conn) send(player.conn, { t: 'punchResult', id: message.id, hit });
		};
		const now = this.now();
		if (
			!this.playerDamageEnabled() ||
			player.info.role === 'viewer' ||
			now - player.lastPunchAt < PUNCH_COOLDOWN_MS
		) {
			reply(false);
			return;
		}
		player.lastPunchAt = now;
		const target = this.findBySlot(message.target);
		if (
			!target ||
			target === player ||
			!target.conn ||
			!player.pose ||
			!target.pose ||
			this.healthOf(player, now).dead ||
			this.interactions.has(player.info.playerId)
		) {
			reply(false);
			return;
		}
		if (!punchPlausible(player.pose, target.pose)) {
			this.stats.punchesRejected++;
			reply(false);
			return;
		}
		const result = damageHealth(this.healthOf(target, now), PUNCH_DAMAGE, now);
		if (result.applied === 0) {
			reply(false);
			return;
		}
		this.stats.punchesLanded++;
		this.setHealth(target, result.state, undefined, { kind: 'player', by: player.info.slot });
		reply(true);
	}

	/**
	 * Follows each airborne spell in the poses (feet height) so fall reports can be checked against
	 * what the room actually saw. Flight and teleports end a spell without a landing.
	 */
	private trackAir(player: PlayerState, flags: number, y: number, at: number): void {
		if (flags & (POSE_FLAGS.flying | POSE_FLAGS.teleport)) {
			player.air = null;
			return;
		}
		if (flags & POSE_FLAGS.grounded) {
			if (!player.air) return;
			player.landings.push({ drop: Math.max(0, player.air.peakY - y), at });
			if (player.landings.length > 3) player.landings.shift();
			player.air = null;
			return;
		}
		const start = player.pose && !(player.pose.flags & POSE_FLAGS.flying) ? player.pose.y : y;
		player.air = { peakY: Math.max(player.air?.peakY ?? start, y) };
	}

	/**
	 * A fall report can only lower the sender's own health, so it is trusted up to what the poses
	 * showed: a report longer than an observed drop (plus sampling slack) is capped and counted, and
	 * a report with no observed landing (poses dropped or not yet arrived) is taken as sent.
	 */
	private handleFall(player: PlayerState, message: { id: number; d: number; at: number }): void {
		if (message.id <= player.lastFallId) return;
		player.lastFallId = message.id;
		const now = this.now();
		const health = this.healthOf(player, now);
		if (
			!this.fallDamageEnabled() ||
			message.d > FALL_REPORT_MAX_DISTANCE ||
			now - player.lastFallAt < FALL_MIN_INTERVAL_MS
		) {
			this.sendHealth(player, message.id);
			return;
		}
		player.lastFallAt = now;
		let distance = message.d;
		const observed = player.landings.filter(
			(landing) => Math.abs(landing.at - message.at) <= FALL_MATCH_WINDOW_MS
		);
		if (observed.length > 0) {
			const drop = Math.max(...observed.map((landing) => landing.drop));
			if (distance > drop + FALL_SLACK_METRES) {
				this.stats.fallMismatches++;
				distance = drop + FALL_SLACK_METRES;
			}
		}
		const result = damageHealth(health, fallDamageSegments(distance), now);
		if (result.applied === 0) {
			this.sendHealth(player, message.id);
			return;
		}
		this.stats.fallsApplied++;
		this.setHealth(player, result.state, message.id);
	}

	private handleRespawn(player: PlayerState): void {
		const now = this.now();
		// Half a second of slack for the two clocks; the browser enforces the delay too.
		if (!canRespawn(this.healthOf(player, now), now, 500)) {
			this.sendHealth(player);
			return;
		}
		player.air = null;
		player.landings = [];
		this.setHealth(player, reviveHealth(now));
	}

	private findBySlot(slot: number): PlayerState | undefined {
		for (const player of this.players.values()) if (player.info.slot === slot) return player;
		return undefined;
	}

	/** Slots held in a grace period count as taken: the player is coming back to it. */
	private freeSlot(): number | null {
		if (this.players.size >= this.maxPlayers) return null;
		const used = new Set([...this.players.values()].map((player) => player.info.slot));
		for (let slot = 0; slot < this.maxPlayers; slot++) if (!used.has(slot)) return slot;
		return null;
	}

	/**
	 * Two players with the same colour can't be told apart (in the world or on the locator bar), so
	 * the later one gets the first palette colour nobody here is using.
	 */
	private uniqueColour(colour: string, playerId: string): string {
		const taken = new Set(
			[...this.players.values()]
				.filter((player) => player.info.playerId !== playerId)
				.map((player) => player.info.colour)
		);
		if (!taken.has(colour)) return colour;
		return PLAYER_COLOURS.find((candidate) => !taken.has(candidate)) ?? colour;
	}

	/** Locked decision Q6: duplicate names in one world get a suffix, e.g. "Sam (2)". */
	private uniqueName(name: string, playerId: string): string {
		const taken = new Set(
			[...this.players.values()]
				.filter((player) => player.info.playerId !== playerId)
				.map((player) => player.info.name)
		);
		if (!taken.has(name)) return name;
		for (let n = 2; n < 100; n++) {
			const suffix = ` (${n})`;
			const candidate = name.slice(0, 20 - suffix.length) + suffix;
			if (!taken.has(candidate)) return candidate;
		}
		return name;
	}
}

function toAttachment(info: PlayerInfo, pose?: StoredPose | null): PlayerAttachment {
	return {
		playerId: info.playerId,
		slot: info.slot,
		name: info.name,
		colour: info.colour,
		role: info.role,
		away: info.away,
		...(info.down ? { down: true } : {}),
		...(pose ? { pose: { ...pose } } : {})
	};
}

function toInfo(attachment: PlayerAttachment, offline: boolean): PlayerInfo {
	return {
		slot: attachment.slot,
		playerId: attachment.playerId,
		name: attachment.name,
		colour: attachment.colour,
		role: attachment.role ?? 'viewer',
		away: attachment.away ?? false,
		offline,
		...(attachment.down ? { down: true } : {})
	};
}

function send(conn: RoomConnection, message: ServerJsonMessage): void {
	conn.send(JSON.stringify(message));
}

function isPlausiblePosition(x: number, y: number, z: number): boolean {
	return (
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(z) &&
		Math.abs(x) <= WORLD_COORD_LIMIT &&
		Math.abs(z) <= WORLD_COORD_LIMIT &&
		y >= HEIGHT_MIN &&
		y <= HEIGHT_MAX
	);
}
