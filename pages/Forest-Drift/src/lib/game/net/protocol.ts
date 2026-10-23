/**
 * The multiplayer wire protocol, shared by the browser client (`NetSession`) and the world room
 * (`RoomCore`, which runs inside the Cloudflare Durable Object and in tests).
 *
 * Deliberately free of DOM, Three.js and Cloudflare APIs so both sides import the exact same code.
 *
 * Two kinds of message travel over the WebSocket:
 *
 *   - **Binary** for the high-frequency traffic: a client's `pose` (24 bytes) and the room's batched
 *     `snapshot` (6-byte header + 20 bytes per player). These are "latest state wins": a lost or late
 *     one is simply superseded by the next.
 *   - **JSON** for everything rare: the `hello`/`welcome` handshake, joins and leaves, presence,
 *     the owner's sky and weather (`env`), clock pings.
 *
 * Plus one bare text frame, `ka`, that the room answers with `KA` without waking up (the Durable
 * Object's WebSocket auto-response): a free keep-alive and liveness check.
 *
 * All binary fields are little-endian.
 */

import type { EntityKind, WorldOp } from './worldEntities';

/**
 * Bump on any incompatible change to the messages below; the room refuses mismatched clients, which
 * is how a stale build open in someone's tab gets told to refresh (Phase 2 acceptance).
 * 2: invite tokens and capabilities, roles, presence, room clock, shared sky and weather.
 * 3: shared building (ops, commits, catch-up), doors, bookmarks.
 */
// 4: pose grounded/running flags are now required for character animation.
export const PROTOCOL_VERSION = 4;

/**
 * Bump whenever terrain, vegetation or hydrology generation output changes. Every client in one world
 * must generate the same terrain from the same seed, so a world pins the generator version it was
 * published with and refuses clients built with a different one.
 */
export const GENERATOR_VERSION = 2;

/** Locked decision Q19: 20 players per world at launch. */
export const MAX_PLAYERS_PER_WORLD = 20;

/**
 * Twenty clearly different player colours, one per possible player, chosen to stay distinct from
 * each other and from forest greens and sky blues. Players pick from the first dozen; when two pick
 * the same one, the room gives the later one the first colour nobody is using, so every avatar —
 * and its dot on the locator bar — can be told apart.
 */
export const PLAYER_COLOURS = [
	'#e6194b',
	'#f58231',
	'#ffe119',
	'#bfef45',
	'#42d4f4',
	'#4363d8',
	'#911eb4',
	'#f032e6',
	'#fabed4',
	'#469990',
	'#dcbeff',
	'#ffffff',
	'#9a6324',
	'#800000',
	'#aaffc3',
	'#808000',
	'#ffd8b1',
	'#000075',
	'#a9a9a9',
	'#fffac8'
] as const;

/** How often the room flushes batched snapshots while anyone is moving. */
export const ROOM_TICK_MS = 50;

/** How often a moving client sends its pose. */
export const POSE_SEND_INTERVAL_MS = 100;

/** Hard cap on a published world's decoded JSON (plan §7.8: 10 MB join limit). */
export const MAX_WORLD_JSON_BYTES = 10 * 1024 * 1024;

/** Ordinary JSON messages are tiny; anything bigger is dropped unread. */
export const MAX_JSON_BYTES = 2048;

/** The owner's shared sky and weather (`env`) may be larger than other messages, but not by much. */
export const MAX_ENV_JSON_BYTES = 32 * 1024;

/** One building batch (plan §7.5: a Mini Build design can be tens of KB). */
export const MAX_OPS_JSON_BYTES = 512 * 1024;
/** Largest single op (an added Mini Build design, say). */
export const MAX_OP_JSON_BYTES = 256 * 1024;
/** Ops per batch: deleting a large building cascades into a few hundred rows. */
export const MAX_OPS_PER_BATCH = 400;

/**
 * Locked decision Q21: while the connection is down, edits queue for up to 30 s or 50 ops; past
 * that, building pauses until it's back, so long offline edits are never silently merged.
 */
export const OFFLINE_EDIT_SECONDS = 30;
export const OFFLINE_EDIT_OPS = 50;

/**
 * Locked decision Q21: a dropped player keeps their slot (and stays visible, marked offline) this
 * long, so a Wi-Fi blip, a refresh or a phone switching networks resumes without anyone seeing a
 * leave and a join.
 */
export const GRACE_PERIOD_MS = 30_000;

/** Keep-alive text frames, answered by the room without waking it (see the module comment). */
export const KEEPALIVE_REQUEST = 'ka';
export const KEEPALIVE_RESPONSE = 'KA';

/** WebSocket close codes the client treats as final (no automatic reconnect). */
export const CLOSE_CODES = {
	protocolMismatch: 4001,
	versionMismatch: 4002,
	worldFull: 4003,
	replaced: 4004,
	badHello: 4005,
	worldMissing: 4006,
	/** No valid invite or capability. */
	accessDenied: 4007,
	/** This player id is connected elsewhere and the newcomer couldn't prove it's the same player. */
	alreadyConnected: 4008
} as const;

export const FATAL_CLOSE_CODES: ReadonlySet<number> = new Set([
	CLOSE_CODES.protocolMismatch,
	CLOSE_CODES.versionMismatch,
	CLOSE_CODES.worldFull,
	CLOSE_CODES.replaced,
	CLOSE_CODES.badHello,
	CLOSE_CODES.worldMissing,
	CLOSE_CODES.accessDenied,
	CLOSE_CODES.alreadyConnected
]);

/** Close code the client uses when it quits the world on purpose: no grace period, leave at once. */
export const CLIENT_LEAVE_CODE = 1000;

/** Pose flag bits (plan §9.3). */
export const POSE_FLAGS = {
	moving: 1 << 0,
	running: 1 << 1,
	flying: 1 << 2,
	grounded: 1 << 3,
	teleport: 1 << 4,
	underwater: 1 << 5,
	away: 1 << 6,
	building: 1 << 7
} as const;

export const MESSAGE_TYPE = {
	pose: 0x01,
	snapshot: 0x02
} as const;

export const POSE_BYTES = 24;
export const SNAPSHOT_HEADER_BYTES = 6;
export const SNAPSHOT_ENTRY_BYTES = 20;

export interface PoseSample {
	flags: number;
	/** Increments per pose sent (wraps at 2^16). */
	seq: number;
	/**
	 * When the pose was sampled, on the **server's** clock (ms, wrapped to 32 bits). Stamping with the
	 * shared clock rather than arrival time keeps upload jitter out of other players' interpolation.
	 */
	sampleTime: number;
	x: number;
	/** Feet height, not eye height. */
	y: number;
	z: number;
	/** Radians, same convention as `FirstPersonController.getYaw()`. */
	yaw: number;
	/** Radians, clamped to ±π/2. */
	pitch: number;
}

export interface SnapshotEntry {
	slot: number;
	flags: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	/** `serverTime − sampleTime` of this entry, ms (clamped to 16 bits). */
	sampleAgeMs: number;
}

export interface Snapshot {
	/** Room clock when the snapshot was sent (ms, wrapped to 32 bits). */
	serverTime: number;
	entries: SnapshotEntry[];
}

const TWO_PI = Math.PI * 2;
const U32 = 0x1_0000_0000;

/** Wraps an angle into [0, 2π). */
export function wrapAngle(radians: number): number {
	const wrapped = radians % TWO_PI;
	return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function encodeYaw(yaw: number): number {
	return Math.round((wrapAngle(yaw) / TWO_PI) * 65536) & 0xffff;
}

function decodeYaw(value: number): number {
	return (value / 65536) * TWO_PI;
}

function encodePitch(pitch: number): number {
	const clamped = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
	return Math.round((clamped / (Math.PI / 2)) * 32767);
}

function decodePitch(value: number): number {
	return (value / 32767) * (Math.PI / 2);
}

/** Wraps a millisecond timestamp to the 32 bits carried on the wire. */
export function toWireTime(ms: number): number {
	const wrapped = Math.floor(ms) % U32;
	return wrapped < 0 ? wrapped + U32 : wrapped;
}

/**
 * Recovers a full timestamp from its 32-bit wire form, given any full timestamp known to be within
 * about 24 days of it (in practice: the receiver's current estimate of the same clock).
 */
export function fromWireTime(wire: number, nearFull: number): number {
	const nearWire = toWireTime(nearFull);
	let delta = wire - nearWire;
	if (delta > U32 / 2) delta -= U32;
	else if (delta < -U32 / 2) delta += U32;
	return nearFull + delta;
}

export function encodePose(pose: PoseSample): ArrayBuffer {
	const buffer = new ArrayBuffer(POSE_BYTES);
	const view = new DataView(buffer);
	view.setUint8(0, MESSAGE_TYPE.pose);
	view.setUint8(1, pose.flags & 0xff);
	view.setUint16(2, pose.seq & 0xffff, true);
	view.setUint32(4, toWireTime(pose.sampleTime), true);
	view.setFloat32(8, pose.x, true);
	view.setFloat32(12, pose.y, true);
	view.setFloat32(16, pose.z, true);
	view.setUint16(20, encodeYaw(pose.yaw), true);
	view.setInt16(22, encodePitch(pose.pitch), true);
	return buffer;
}

/** Returns null for anything that isn't a well-formed pose. */
export function decodePose(data: ArrayBuffer): PoseSample | null {
	if (data.byteLength !== POSE_BYTES) return null;
	const view = new DataView(data);
	if (view.getUint8(0) !== MESSAGE_TYPE.pose) return null;
	return {
		flags: view.getUint8(1),
		seq: view.getUint16(2, true),
		sampleTime: view.getUint32(4, true),
		x: view.getFloat32(8, true),
		y: view.getFloat32(12, true),
		z: view.getFloat32(16, true),
		yaw: decodeYaw(view.getUint16(20, true)),
		pitch: decodePitch(view.getInt16(22, true))
	};
}

export function encodeSnapshot(snapshot: Snapshot): ArrayBuffer {
	const count = Math.min(snapshot.entries.length, 255);
	const buffer = new ArrayBuffer(SNAPSHOT_HEADER_BYTES + count * SNAPSHOT_ENTRY_BYTES);
	const view = new DataView(buffer);
	view.setUint8(0, MESSAGE_TYPE.snapshot);
	view.setUint8(1, count);
	view.setUint32(2, toWireTime(snapshot.serverTime), true);
	for (let i = 0; i < count; i++) {
		const entry = snapshot.entries[i]!;
		const offset = SNAPSHOT_HEADER_BYTES + i * SNAPSHOT_ENTRY_BYTES;
		view.setUint8(offset, entry.slot & 0xff);
		view.setUint8(offset + 1, entry.flags & 0xff);
		view.setFloat32(offset + 2, entry.x, true);
		view.setFloat32(offset + 6, entry.y, true);
		view.setFloat32(offset + 10, entry.z, true);
		view.setUint16(offset + 14, encodeYaw(entry.yaw), true);
		view.setInt16(offset + 16, encodePitch(entry.pitch), true);
		view.setUint16(offset + 18, Math.max(0, Math.min(65535, Math.round(entry.sampleAgeMs))), true);
	}
	return buffer;
}

export function decodeSnapshot(data: ArrayBuffer): Snapshot | null {
	if (data.byteLength < SNAPSHOT_HEADER_BYTES) return null;
	const view = new DataView(data);
	if (view.getUint8(0) !== MESSAGE_TYPE.snapshot) return null;
	const count = view.getUint8(1);
	if (data.byteLength !== SNAPSHOT_HEADER_BYTES + count * SNAPSHOT_ENTRY_BYTES) return null;
	const entries: SnapshotEntry[] = [];
	for (let i = 0; i < count; i++) {
		const offset = SNAPSHOT_HEADER_BYTES + i * SNAPSHOT_ENTRY_BYTES;
		entries.push({
			slot: view.getUint8(offset),
			flags: view.getUint8(offset + 1),
			x: view.getFloat32(offset + 2, true),
			y: view.getFloat32(offset + 6, true),
			z: view.getFloat32(offset + 10, true),
			yaw: decodeYaw(view.getUint16(offset + 14, true)),
			pitch: decodePitch(view.getInt16(offset + 16, true)),
			sampleAgeMs: view.getUint16(offset + 18, true)
		});
	}
	return { serverTime: view.getUint32(2, true), entries };
}

/** First byte of a binary message, or -1. */
export function binaryMessageType(data: ArrayBuffer): number {
	return data.byteLength > 0 ? new DataView(data).getUint8(0) : -1;
}

// ---------------------------------------------------------------------------------------------
// JSON messages
// ---------------------------------------------------------------------------------------------

/** Locked decision Q3-A: one invite link per role. */
export type PlayerRole = 'owner' | 'editor' | 'viewer';

export const PLAYER_ROLES: readonly PlayerRole[] = ['owner', 'editor', 'viewer'];

export interface PlayerInfo {
	slot: number;
	playerId: string;
	name: string;
	/** Avatar colour, `#rrggbb`. */
	colour: string;
	role: PlayerRole;
	/** In a menu or another tab (Q12): still in the world, not playing right now. */
	away: boolean;
	/** Connection dropped; the slot is held for `GRACE_PERIOD_MS` (Q21). */
	offline: boolean;
}

/**
 * The owner's shared sky, weather and time (Q14-A). Everyone derives the time of day and the weather
 * from the room clock and this anchor, so they match without any per-frame traffic.
 */
export interface SharedEnvironment {
	/** The room clock (seconds) when the owner last changed anything, and what time it was then. */
	anchor: { roomSeconds: number; timeOfDay: number; weatherTime: number };
	/** `SkySettings` minus its local debug options. Applied field by field to known keys only. */
	sky: Record<string, unknown>;
	/** The shared subset of the weather settings (see `SHARED_WEATHER_KEYS`). */
	weather: Record<string, unknown>;
}

/** The room clock: accumulated time the world has been occupied (Q11-A), at `serverTime`. */
export interface RoomClockState {
	elapsedMs: number;
	running: boolean;
}

export interface HelloMessage {
	t: 'hello';
	protocol: number;
	schemaVersion: number;
	generatorVersion: number;
	/** The client build, for diagnostics. */
	build: string;
	playerId: string;
	name: string;
	colour: string;
	/** Invite token from the link (`#invite=`), or null. */
	invite: string | null;
	/** Capability from an earlier `welcome`, used to resume after a drop, or null. */
	capability: string | null;
	/** The world version this client holds (from its snapshot or last commit), for catch-up. */
	epoch: number | null;
	lastSeq: number | null;
}

export interface PingMessage {
	t: 'ping';
	/** Client clock (`performance.now()` based), echoed back. */
	c: number;
}

export interface ClientEnvMessage {
	t: 'env';
	env: unknown;
}

/** A batch of building changes (plan §7.3). Atomic; `batchId` makes a resend harmless. */
export interface OpsMessage {
	t: 'ops';
	batchId: string;
	ops: WorldOp[];
}

/** Q13-A: doors are shared live (and reset each session). */
export interface ClientDoorMessage {
	t: 'door';
	id: string;
	open: boolean;
}

/** Ephemeral semantic poses: no camera matrices, helpers or occupancy in saved content. */
export interface MiniBuildInteractionRef {
	instanceId: string;
	locationId: string;
}
export interface OccupiedMiniBuildInteraction extends MiniBuildInteractionRef {
	playerId: string;
}
export interface ClientInteractionMessage {
	t: 'interaction';
	location: MiniBuildInteractionRef | null;
}
export interface ServerInteractionsMessage {
	t: 'interactions';
	locations: OccupiedMiniBuildInteraction[];
	replyTo?: string;
}

export type ClientJsonMessage =
	| HelloMessage
	| PingMessage
	| ClientEnvMessage
	| OpsMessage
	| ClientDoorMessage
	| ClientInteractionMessage;

export interface WelcomeMessage {
	t: 'welcome';
	slot: number;
	role: PlayerRole;
	/** Signed proof of this player's role, valid for a few days; null if the server has no key. */
	capability: string | null;
	/** Full server clock, ms. */
	serverTime: number;
	players: PlayerInfo[];
	tickMs: number;
	world: { worldId: string; name: string };
	clock: RoomClockState;
	/** Null until the owner first changes the sky or weather: use the published world's. */
	env: SharedEnvironment | null;
	rules: { maxSpeed: number; flight: boolean };
	/** The world's version now. */
	epoch: number;
	seq: number;
	/**
	 * True when the client's `epoch`/`lastSeq` can't be caught up from the room's recent log (or
	 * the world was restored): it should fetch a fresh snapshot. Otherwise the missed commits follow,
	 * then `synced`.
	 */
	resync: boolean;
	/** Where this player last left the world (Q18), feet position. Null for first-timers. */
	bookmark: PlayerBookmark | null;
	/** Doors open right now (Q13-A). */
	doors: string[];
	interactions?: OccupiedMiniBuildInteraction[];
	/** Names of everyone who has ever built here, for "Sam added this" notices. */
	names: Record<string, string>;
}

export interface PlayerBookmark {
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

/** A committed op: the room's revision for it, and who created an added row. */
export type CommittedOp = WorldOp & { rev: number; createdBy?: string };

export interface OverwrittenField {
	kind: EntityKind;
	id: string;
	parent?: string;
	field: string;
	/** Player whose earlier change this one replaced (they get a "changed by" notice, F1-A). */
	previousBy: string;
}

export interface CommitMessage {
	t: 'commit';
	seq: number;
	epoch: number;
	batchId: string;
	/** Player id of whoever made the change. */
	by: string;
	byName: string;
	ops: CommittedOp[];
	overwritten?: OverwrittenField[];
	/** Rolling checksum of every row's key and revision after this commit (§7.8). */
	checksum: string;
}

export type RejectReason =
	'rights' | 'fit' | 'gone' | 'confirmNeeded' | 'invalid' | 'role' | 'rate';

export interface RejectConflict {
	kind: EntityKind;
	id: string;
	parent?: string;
	/** Who created (or last changed) the thing in the way; '' means the world's owner. */
	by: string;
}

export interface RejectMessage {
	t: 'reject';
	batchId: string;
	reason: RejectReason;
	message: string;
	conflicts?: RejectConflict[];
}

/** A resent batch the room had already committed (the acknowledgement was lost in a drop). */
export interface AckMessage {
	t: 'ack';
	batchId: string;
	seq: number;
}

/** Catch-up is complete: everything up to `seq` has been sent. */
export interface SyncedMessage {
	t: 'synced';
	seq: number;
}

export interface ServerDoorMessage {
	t: 'door';
	id: string;
	open: boolean;
	by: number;
}

export interface JoinedMessage {
	t: 'joined';
	player: PlayerInfo;
}

export interface LeftMessage {
	t: 'left';
	slot: number;
	playerId: string;
}

export interface PresenceMessage {
	t: 'presence';
	slot: number;
	away: boolean;
	offline: boolean;
}

export interface ServerEnvMessage {
	t: 'env';
	env: SharedEnvironment;
	/** Slot of the owner who changed it. */
	by: number;
}

export interface PongMessage {
	t: 'pong';
	c: number;
	/** Full server clock, ms. */
	s: number;
}

export interface ErrorMessage {
	t: 'error';
	code:
		'protocol' | 'version' | 'full' | 'replaced' | 'hello' | 'world' | 'access' | 'taken' | 'role';
	message: string;
}

export type ServerJsonMessage =
	| WelcomeMessage
	| JoinedMessage
	| LeftMessage
	| PresenceMessage
	| ServerEnvMessage
	| PongMessage
	| ErrorMessage
	| CommitMessage
	| RejectMessage
	| AckMessage
	| SyncedMessage
	| ServerDoorMessage
	| ServerInteractionsMessage;

const NAME_MAX = 20;
const NAME_MIN = 2;

/** Locked decision Q6: free text, 2–20 characters. Trims and collapses whitespace. */
export function sanitizeDisplayName(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	// Control characters (tabs, newlines, …) become spaces, then runs of whitespace collapse.
	const printable = Array.from(raw)
		.map((char) => {
			const code = char.codePointAt(0) ?? 0;
			return code < 32 || code === 127 ? ' ' : char;
		})
		.join('');
	const cleaned = printable.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
	return cleaned.length >= NAME_MIN ? cleaned : null;
}

export function sanitizeColour(raw: unknown): string | null {
	return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
}

/** Player ids are client-generated; accept UUID-like tokens only. */
export function isValidPlayerId(raw: unknown): raw is string {
	return typeof raw === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(raw);
}

export function isValidWorldId(raw: unknown): raw is string {
	return typeof raw === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(raw);
}

/** Invite tokens and capabilities are URL-safe base64 (plus one `.` in a capability). */
export function isTokenShaped(raw: unknown): raw is string {
	return typeof raw === 'string' && /^[A-Za-z0-9_.-]{16,512}$/.test(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Shape check for a shared environment. The room only needs to know it is small and well-formed;
 * every client applies it field by field onto settings it already has (`applyKnownFields`).
 */
export function parseSharedEnvironment(raw: unknown): SharedEnvironment | null {
	if (!isRecord(raw) || !isRecord(raw.anchor) || !isRecord(raw.sky) || !isRecord(raw.weather)) {
		return null;
	}
	const { roomSeconds, timeOfDay, weatherTime } = raw.anchor;
	if (
		typeof roomSeconds !== 'number' ||
		typeof timeOfDay !== 'number' ||
		typeof weatherTime !== 'number' ||
		!Number.isFinite(roomSeconds) ||
		!Number.isFinite(timeOfDay) ||
		!Number.isFinite(weatherTime) ||
		roomSeconds < 0 ||
		weatherTime < 0
	) {
		return null;
	}
	return { anchor: { roomSeconds, timeOfDay, weatherTime }, sky: raw.sky, weather: raw.weather };
}

/** Parses a JSON message from the client; returns null for anything unexpected. */
export function parseClientMessage(text: string): ClientJsonMessage | null {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (!value || typeof value !== 'object') return null;
	const message = value as Record<string, unknown>;
	if (message.t === 'ping' && typeof message.c === 'number' && Number.isFinite(message.c)) {
		return { t: 'ping', c: message.c };
	}
	if (message.t === 'hello') {
		return {
			t: 'hello',
			protocol: Number(message.protocol),
			schemaVersion: Number(message.schemaVersion),
			generatorVersion: Number(message.generatorVersion),
			build: typeof message.build === 'string' ? message.build.slice(0, 40) : '',
			playerId: String(message.playerId ?? ''),
			name: String(message.name ?? ''),
			colour: String(message.colour ?? ''),
			invite: isTokenShaped(message.invite) ? message.invite : null,
			capability: isTokenShaped(message.capability) ? message.capability : null,
			epoch: nonNegativeInteger(message.epoch),
			lastSeq: nonNegativeInteger(message.lastSeq)
		};
	}
	if (message.t === 'env') return { t: 'env', env: message.env };
	if (message.t === 'ops') {
		if (typeof message.batchId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(message.batchId)) {
			return null;
		}
		if (!Array.isArray(message.ops)) return null;
		return { t: 'ops', batchId: message.batchId, ops: message.ops as WorldOp[] };
	}
	if (message.t === 'interaction') {
		const location = message.location as Record<string, unknown> | null;
		if (location === null) return { t: 'interaction', location: null };
		if (
			!location ||
			typeof location !== 'object' ||
			!['instanceId', 'locationId'].every(
				(k) =>
					typeof location[k] === 'string' &&
					(location[k] as string).length > 0 &&
					(location[k] as string).length <= 128
			)
		)
			return null;
		return {
			t: 'interaction',
			location: {
				instanceId: location.instanceId as string,
				locationId: location.locationId as string
			}
		};
	}
	if (message.t === 'door') {
		if (typeof message.id !== 'string' || message.id.length > 200) return null;
		return { t: 'door', id: message.id, open: message.open === true };
	}
	return null;
}

/** Parses a JSON message from the room; returns null for anything unexpected. */
export function parseServerMessage(text: string): ServerJsonMessage | null {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (!value || typeof value !== 'object') return null;
	const t = (value as { t?: unknown }).t;
	return t === 'welcome' ||
		t === 'joined' ||
		t === 'left' ||
		t === 'presence' ||
		t === 'env' ||
		t === 'pong' ||
		t === 'error' ||
		t === 'commit' ||
		t === 'reject' ||
		t === 'ack' ||
		t === 'synced' ||
		t === 'door' ||
		t === 'interactions'
		? (value as ServerJsonMessage)
		: null;
}

function nonNegativeInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
