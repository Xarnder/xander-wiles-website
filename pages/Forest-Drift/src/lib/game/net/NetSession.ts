import type { MiniBuildInteractionRef, OccupiedMiniBuildInteraction } from './protocol';
import { ClockSync } from './ClockSync';
import type { PlayerIdentity } from './mpConfig';
import { PoseSender, type LocalPose } from './PoseSender';
import {
	CLIENT_LEAVE_CODE,
	FATAL_CLOSE_CODES,
	GENERATOR_VERSION,
	KEEPALIVE_REQUEST,
	KEEPALIVE_RESPONSE,
	MESSAGE_TYPE,
	PROTOCOL_VERSION,
	binaryMessageType,
	decodeSnapshot,
	encodePose,
	fromWireTime,
	parseServerMessage,
	type CommitMessage,
	type PlayerBookmark,
	type PlayerInfo,
	type PlayerRole,
	type PoseSample,
	type RejectMessage,
	type RoomClockState,
	type ServerHealthMessage,
	type ServerPunchResultMessage,
	type ServerJsonMessage,
	type SharedEnvironment,
	type WelcomeMessage
} from './protocol';
import { RemoteMotion, type MotionFrame } from './RemoteMotion';
import type { WorldOp } from './worldEntities';

export type NetStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';

export interface RemotePlayerView {
	info: PlayerInfo;
	frame: MotionFrame;
}

export interface NetStats {
	bytesIn: number;
	bytesOut: number;
	snapshotsIn: number;
	posesOut: number;
	reconnects: number;
}

/** What the room told us on joining, beyond the player list. */
export interface WelcomeInfo {
	role: PlayerRole;
	rules: WelcomeMessage['rules'];
	env: SharedEnvironment | null;
	/** The world moved on in a way the log can't replay: fetch a fresh snapshot. */
	resync: boolean;
	bookmark: PlayerBookmark | null;
	doors: string[];
	interactions?: OccupiedMiniBuildInteraction[];
	names: Record<string, string>;
	/** This player's own health, as the room holds it. */
	health?: WelcomeMessage['health'];
	/** True only for the first welcome of this session (not reconnects). */
	first: boolean;
}

/** Shared building traffic (Phase 3). */
export interface WorldTraffic {
	/** The world version this client holds, sent in `hello` for catch-up. */
	version(): { epoch: number; seq: number } | null;
	onCommit(commit: CommitMessage): void;
	onReject(reject: RejectMessage): void;
	onAck(batchId: string): void;
	/** Catch-up finished: pending batches can be resent. */
	onSynced(): void;
	onDoor(id: string, open: boolean): void;
	onInteractions?(locations: OccupiedMiniBuildInteraction[], replyTo?: string): void;
}

/** Window and document events the session listens to; injected in tests. */
export interface NetSessionEnvironment {
	addEventListener(target: 'window' | 'document', type: string, listener: () => void): void;
	removeEventListener(target: 'window' | 'document', type: string, listener: () => void): void;
	isHidden(): boolean;
}

export interface NetSessionOptions {
	url: string;
	identity: PlayerIdentity;
	schemaVersion: number;
	/** The client build, sent in `hello` for diagnostics. */
	build: string;
	/** How to get in: an invite token (from the link) and/or a capability from an earlier join. */
	access: { invite: string | null; capability: string | null };
	onStatus?: (status: NetStatus, detail: string | null) => void;
	onPlayers?: (players: PlayerInfo[], selfSlot: number | null) => void;
	onWelcome?: (welcome: WelcomeInfo) => void;
	/** The owner changed the shared sky, weather or time. */
	onEnvironment?: (env: SharedEnvironment) => void;
	/** A fresh capability to remember for next time. */
	onCapability?: (capability: string) => void;
	/** The room sent this player's own health. */
	onHealth?: (message: ServerHealthMessage) => void;
	/** Whether this player's punch landed. */
	onPunchResult?: (message: ServerPunchResultMessage) => void;
	world?: WorldTraffic;
	/** Injected in tests. */
	createSocket?: (url: string) => WebSocket;
	localNow?: () => number;
	environment?: NetSessionEnvironment | null;
}

/** Frames stopped arriving for this long → the player is shown as away (hidden tab, dev panel). */
const AWAY_AFTER_MS = 600;
const HOUSEKEEPING_MS = 250;
/** Skip a pose rather than queue it behind a congested socket: poses are "latest wins". */
const MAX_BUFFERED_BYTES = 16 * 1024;
/** Clock pings: a quick burst to lock on, then occasionally (they wake the room, keep-alives don't). */
const FAST_PINGS = 5;
const FAST_PING_MS = 1000;
const SLOW_PING_MS = 30_000;
/** Keep-alives are answered by the room's runtime without waking it: free liveness checks. */
const KEEPALIVE_MS = 10_000;
/** Nothing at all heard for this long (2½ keep-alives) means the connection is dead, even if open. */
const LIVENESS_TIMEOUT_MS = 25_000;
/** After waking up (tab shown again, network back), a probe must be answered within this. */
const PROBE_TIMEOUT_MS = 5000;
/** A socket that hasn't been welcomed in this long is abandoned and retried. */
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 8000;
/** Client-side close code for "we gave up on this socket" (not a deliberate leave: the grace period applies). */
const CLIENT_TIMEOUT_CODE = 4000;

/**
 * The client's connection to one world room.
 *
 * It runs on socket events and its own timers, never on the game's render loop: the loop stops while
 * the Mini Build editor or developer panel is open and whenever the tab is hidden, and the
 * connection, keep-alives and the "away" pose must keep going regardless. The render loop only
 * *feeds* it the local pose (`samplePose`) and *reads* where remote players should be drawn
 * (`remoteFrames`).
 *
 * Reliability (Phase 2): a lost connection is retried with exponential backoff and jitter; a
 * connection that is open but silent (Wi-Fi gone, laptop asleep, phone backgrounded) is noticed by
 * the keep-alive timeout and replaced; coming back to the tab or the network retries at once. The
 * room holds our slot for 30 s and our capability proves we're the same player, so others never see
 * a duplicate avatar or a leave-and-join.
 */
export class NetSession {
	readonly clock: ClockSync;
	readonly stats: NetStats = {
		bytesIn: 0,
		bytesOut: 0,
		snapshotsIn: 0,
		posesOut: 0,
		reconnects: 0
	};

	private readonly options: NetSessionOptions;
	private readonly localNow: () => number;
	private readonly sender = new PoseSender();
	private readonly players = new Map<number, PlayerInfo>();
	private readonly motions = new Map<number, RemoteMotion>();
	private readonly env: NetSessionEnvironment | null;
	private readonly listeners: { target: 'window' | 'document'; type: string; fn: () => void }[] =
		[];

	private socket: WebSocket | null = null;
	private status: NetStatus = 'connecting';
	private selfSlot: number | null = null;
	private role: PlayerRole | null = null;
	private capability: string | null;
	private lastError: string | null = null;
	private lastClose: { code: number; reason: string } | null = null;
	private reconnectAttempt = 0;
	private everWelcomed = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pingTimer: ReturnType<typeof setTimeout> | null = null;
	private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
	private housekeepingTimer: ReturnType<typeof setInterval> | null = null;
	private pingsSent = 0;
	private lastSampleAt = Number.NEGATIVE_INFINITY;
	private lastInboundAt = Number.NEGATIVE_INFINITY;
	private socketOpenedAt = 0;
	private probeSentAt: number | null = null;
	private manualAway = false;
	/** Room clock from the last welcome: elapsed ms at that server time. */
	private roomClock: (RoomClockState & { serverTime: number }) | null = null;
	private disposed = false;

	constructor(options: NetSessionOptions) {
		this.options = options;
		this.localNow = options.localNow ?? (() => performance.now());
		this.clock = new ClockSync(this.localNow);
		this.capability = options.access.capability;
		this.env = options.environment === undefined ? browserEnvironment() : options.environment;
	}

	get currentStatus(): NetStatus {
		return this.status;
	}

	get currentRole(): PlayerRole | null {
		return this.role;
	}

	get rttMs(): number {
		return this.clock.rttMs;
	}

	/** For diagnostics. */
	get lastCloseInfo(): { code: number; reason: string } | null {
		return this.lastClose;
	}

	/** Milliseconds since anything arrived from the room (Infinity before the first message). */
	get silenceMs(): number {
		return this.localNow() - this.lastInboundAt;
	}

	/** Average interpolation delay over remote players, ms (null with nobody to draw). */
	get interpolationDelayMs(): number | null {
		if (this.motions.size === 0) return null;
		let total = 0;
		for (const motion of this.motions.values()) total += motion.delayMs;
		return total / this.motions.size;
	}

	/**
	 * Seconds the world has been occupied (the room clock, Q11-A), on the shared timeline; null until
	 * the first welcome. Keeps counting through a reconnect — the room does too, inside the grace
	 * period — and is corrected by the next welcome.
	 */
	roomSeconds(): number | null {
		const base = this.roomClock;
		if (!base) return null;
		const serverNow = this.clock.serverNow();
		if (!Number.isFinite(serverNow)) return base.elapsedMs / 1000;
		const elapsed = base.elapsedMs + (base.running ? Math.max(0, serverNow - base.serverTime) : 0);
		return elapsed / 1000;
	}

	connect(): void {
		if (this.disposed) return;
		this.clearReconnect();
		this.setStatus(
			this.everWelcomed || this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
			null
		);
		let socket: WebSocket;
		try {
			socket = this.options.createSocket?.(this.options.url) ?? new WebSocket(this.options.url);
		} catch {
			this.scheduleReconnect();
			return;
		}
		socket.binaryType = 'arraybuffer';
		this.socket = socket;
		this.socketOpenedAt = this.localNow();
		this.probeSentAt = null;
		socket.onopen = () => this.handleOpen(socket);
		socket.onmessage = (event) => this.handleMessage(socket, event.data as string | ArrayBuffer);
		socket.onclose = (event) => this.handleClose(socket, event.code, event.reason);
		socket.onerror = () => {
			// A close event always follows; reconnection is handled there.
		};
		this.housekeepingTimer ??= setInterval(() => this.housekeeping(), HOUSEKEEPING_MS);
		this.keepaliveTimer ??= setInterval(() => this.sendKeepalive(), KEEPALIVE_MS);
		if (this.listeners.length === 0) this.listen();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.clearReconnect();
		if (this.pingTimer) clearTimeout(this.pingTimer);
		if (this.housekeepingTimer) clearInterval(this.housekeepingTimer);
		if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
		this.pingTimer = this.housekeepingTimer = this.keepaliveTimer = null;
		for (const { target, type, fn } of this.listeners)
			this.env?.removeEventListener(target, type, fn);
		this.listeners.length = 0;
		const socket = this.socket;
		this.socket = null;
		if (socket) {
			socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
			try {
				// A deliberate leave: the room lets the slot go at once instead of holding it.
				socket.close(CLIENT_LEAVE_CODE, 'Left the world');
			} catch {
				// Already closed.
			}
		}
		this.players.clear();
		this.motions.clear();
		this.setStatus('closed', null);
	}

	/** Called by the render loop each frame with the local player's pose. */
	samplePose(pose: LocalPose): void {
		const now = this.localNow();
		// A hidden page that still draws the odd frame (a minimised window, a background pane) would
		// flip between away and back every frame: while hidden, the one away pose stands.
		if (this.env?.isHidden()) return;
		this.lastSampleAt = now;
		if (this.status !== 'connected') return;
		const sample = this.sender.sample(pose, now, this.clock.serverNow(now));
		if (sample) this.sendPose(sample);
	}

	/** In a menu while the world keeps drawing (Q12): show as away to everyone else. */
	setAway(away: boolean): void {
		if (away === this.manualAway) return;
		this.manualAway = away;
		this.sender.setAway(away);
		if (away) this.sendAwayNow();
	}

	/** Owner only (the room refuses anyone else): shares a new sky, weather or time. */
	sendEnvironment(env: SharedEnvironment): void {
		this.sendText({ t: 'env', env });
	}

	/** Sends a building batch. False when not connected (it stays pending and goes on reconnect). */
	sendOps(batchId: string, ops: WorldOp[]): boolean {
		if (this.status !== 'connected') return false;
		return this.sendText({ t: 'ops', batchId, ops });
	}

	sendInteraction(location: MiniBuildInteractionRef | null): void {
		this.sendText({ t: 'interaction', location });
	}

	sendDoor(id: string, open: boolean): void {
		this.sendText({ t: 'door', id, open });
	}

	sendFall(id: number, d: number, at: number): boolean {
		return this.sendText({ t: 'fall', id, d, at });
	}

	sendRespawn(): boolean {
		return this.sendText({ t: 'respawn' });
	}

	sendPunch(id: number, target: number): boolean {
		return this.sendText({ t: 'punch', id, target });
	}

	/** The room clock estimate, ms; NaN until the first welcome. */
	serverNow(): number {
		return this.clock.serverNow();
	}

	/** Test hook: drops the socket as a dead network would, without telling the room. */
	simulateNetworkDrop(): void {
		this.abandonSocket('Simulated network drop');
	}

	/** Where to draw every remote player this frame. */
	remoteFrames(frameDtMs: number): RemotePlayerView[] {
		const views: RemotePlayerView[] = [];
		if (!this.clock.ready) return views;
		const serverNow = this.clock.serverNow();
		for (const [slot, motion] of this.motions) {
			const info = this.players.get(slot);
			if (!info || slot === this.selfSlot) continue;
			const frame = motion.update(serverNow, frameDtMs);
			if (frame) views.push({ info, frame });
		}
		return views;
	}

	private handleOpen(socket: WebSocket): void {
		if (socket !== this.socket) return;
		const { identity, schemaVersion, build, access } = this.options;
		const version = this.options.world?.version() ?? null;
		this.sendText({
			t: 'hello',
			protocol: PROTOCOL_VERSION,
			schemaVersion,
			generatorVersion: GENERATOR_VERSION,
			build,
			playerId: identity.playerId,
			name: identity.name,
			colour: identity.colour,
			invite: access.invite,
			capability: this.capability,
			epoch: version?.epoch ?? null,
			lastSeq: version?.seq ?? null
		});
	}

	private handleMessage(socket: WebSocket, data: string | ArrayBuffer): void {
		if (socket !== this.socket) return;
		this.lastInboundAt = this.localNow();
		if (typeof data === 'string') {
			this.stats.bytesIn += data.length;
			if (data === KEEPALIVE_RESPONSE) return;
			const message = parseServerMessage(data);
			if (message) this.handleJson(message);
			return;
		}
		this.stats.bytesIn += data.byteLength;
		if (binaryMessageType(data) !== MESSAGE_TYPE.snapshot) return;
		const snapshot = decodeSnapshot(data);
		if (!snapshot || !this.clock.ready) return;
		this.stats.snapshotsIn++;
		const arrival = this.clock.serverNow();
		const serverTime = fromWireTime(snapshot.serverTime, arrival);
		for (const entry of snapshot.entries) {
			if (entry.slot === this.selfSlot) continue;
			let motion = this.motions.get(entry.slot);
			if (!motion) {
				motion = new RemoteMotion();
				this.motions.set(entry.slot, motion);
			}
			motion.push(
				{
					t: serverTime - entry.sampleAgeMs,
					x: entry.x,
					y: entry.y,
					z: entry.z,
					yaw: entry.yaw,
					pitch: entry.pitch,
					flags: entry.flags
				},
				arrival
			);
		}
	}

	private handleJson(message: ServerJsonMessage): void {
		switch (message.t) {
			case 'welcome': {
				this.clock.seed(message.serverTime, this.localNow());
				this.selfSlot = message.slot;
				this.role = message.role;
				this.roomClock = { ...message.clock, serverTime: message.serverTime };
				// Keep the motion of anyone still in the same slot, so a reconnect doesn't make every
				// avatar vanish and pop back.
				const previous = new Map(this.players);
				this.players.clear();
				for (const player of message.players) this.players.set(player.slot, player);
				for (const slot of [...this.motions.keys()]) {
					if (previous.get(slot)?.playerId !== this.players.get(slot)?.playerId) {
						this.motions.delete(slot);
					}
				}
				if (message.capability) {
					this.capability = message.capability;
					this.options.onCapability?.(message.capability);
				}
				const first = !this.everWelcomed;
				if (this.everWelcomed || this.reconnectAttempt > 0) this.stats.reconnects++;
				this.everWelcomed = true;
				this.reconnectAttempt = 0;
				this.lastError = null;
				this.pingsSent = 0;
				this.schedulePing(0);
				this.sender.forceNext();
				this.syncAlone();
				this.setStatus('connected', null);
				this.options.onWelcome?.({
					role: message.role,
					rules: message.rules,
					env: message.env,
					resync: message.resync,
					bookmark: message.bookmark ?? null,
					doors: message.doors ?? [],
					interactions: message.interactions ?? [],
					names: message.names ?? {},
					health: message.health,
					first
				});
				this.emitPlayers();
				if (this.manualAway) this.sendAwayNow();
				break;
			}
			case 'joined': {
				const before = this.players.get(message.player.slot);
				this.players.set(message.player.slot, message.player);
				// The same player coming back (resume, second tab) keeps their motion; a new one starts fresh.
				if (before?.playerId !== message.player.playerId) this.motions.delete(message.player.slot);
				// Make sure the newcomer sees us even if we're standing still.
				this.sender.forceNext();
				this.syncAlone();
				this.emitPlayers();
				break;
			}
			case 'left':
				this.players.delete(message.slot);
				this.motions.delete(message.slot);
				this.syncAlone();
				this.emitPlayers();
				break;
			case 'presence': {
				const player = this.players.get(message.slot);
				if (!player) break;
				this.players.set(message.slot, {
					...player,
					away: message.away,
					offline: message.offline,
					down: message.down === true
				});
				this.emitPlayers();
				break;
			}
			case 'env':
				this.options.onEnvironment?.(message.env);
				break;
			case 'pong':
				this.clock.addSample(message.c, message.s, this.localNow());
				break;
			case 'commit':
				this.options.world?.onCommit(message);
				break;
			case 'reject':
				this.options.world?.onReject(message);
				break;
			case 'ack':
				this.options.world?.onAck(message.batchId);
				break;
			case 'synced':
				this.options.world?.onSynced();
				break;
			case 'interactions':
				this.options.world?.onInteractions?.(message.locations, message.replyTo);
				break;
			case 'door':
				this.options.world?.onDoor(message.id, message.open);
				break;
			case 'health':
				this.options.onHealth?.(message);
				break;
			case 'punchResult':
				this.options.onPunchResult?.(message);
				break;
			case 'error':
				this.lastError = message.message;
				break;
		}
	}

	private handleClose(socket: WebSocket, code: number, reason: string): void {
		if (socket !== this.socket) return;
		this.socket = null;
		this.lastClose = { code, reason };
		if (this.pingTimer) clearTimeout(this.pingTimer);
		this.pingTimer = null;
		if (this.disposed) return;
		if (FATAL_CLOSE_CODES.has(code)) {
			this.players.clear();
			this.motions.clear();
			this.selfSlot = null;
			this.emitPlayers();
			this.setStatus('failed', this.lastError ?? (reason || 'The world closed the connection.'));
			return;
		}
		// Keep showing everyone where they were (they dim as their updates go stale) while we get back.
		this.scheduleReconnect();
	}

	/** Gives up on the current socket (dead or stuck) and reconnects as if it had closed. */
	private abandonSocket(reason: string): void {
		const socket = this.socket;
		if (!socket) return;
		socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
		try {
			socket.close(CLIENT_TIMEOUT_CODE, reason);
		} catch {
			// Already closed.
		}
		this.handleClose(socket, CLIENT_TIMEOUT_CODE, reason);
	}

	private scheduleReconnect(): void {
		if (this.disposed) return;
		this.clearReconnect();
		const base = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** this.reconnectAttempt);
		const delay = base * (0.75 + Math.random() * 0.5);
		this.reconnectAttempt++;
		this.setStatus('reconnecting', null);
		this.reconnectTimer = setTimeout(() => this.connect(), delay);
	}

	private clearReconnect(): void {
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}

	/**
	 * Back in the tab, or the network came back: don't wait out the backoff, and check that a socket
	 * which still looks open really is (phones and sleeping laptops leave dead ones behind).
	 */
	private wake(): void {
		if (this.disposed || this.status === 'failed') return;
		if (this.reconnectTimer) {
			this.connect();
			return;
		}
		if (this.status === 'connected') {
			this.probeSentAt = this.localNow();
			this.sendKeepalive();
		}
	}

	private listen(): void {
		const env = this.env;
		if (!env) return;
		const add = (target: 'window' | 'document', type: string, fn: () => void) => {
			env.addEventListener(target, type, fn);
			this.listeners.push({ target, type, fn });
		};
		add('window', 'online', () => this.wake());
		add('window', 'pageshow', () => this.wake());
		add('document', 'visibilitychange', () => {
			if (env.isHidden()) this.sendAwayNow();
			else this.wake();
		});
	}

	private housekeeping(): void {
		if (this.disposed) return;
		const now = this.localNow();
		const socket = this.socket;
		if (socket && this.status !== 'connected' && now - this.socketOpenedAt > CONNECT_TIMEOUT_MS) {
			this.abandonSocket('Connection timed out');
			return;
		}
		if (this.status !== 'connected') return;
		// Hidden tabs get their timers throttled (to once a minute after five minutes in Chrome), so
		// keep-alives go out too rarely to judge silence by; coming back to the tab probes instead.
		const hidden = this.env?.isHidden() ?? false;
		if (!hidden && now - this.lastInboundAt > LIVENESS_TIMEOUT_MS) {
			this.abandonSocket('No response from the world');
			return;
		}
		if (this.probeSentAt !== null && now - this.probeSentAt > PROBE_TIMEOUT_MS) {
			const answered = this.lastInboundAt > this.probeSentAt;
			this.probeSentAt = null;
			if (!answered) {
				this.abandonSocket('No response after waking up');
				return;
			}
		}
		if (now - this.lastSampleAt >= AWAY_AFTER_MS) this.sendAwayNow();
	}

	private sendAwayNow(): void {
		if (this.status !== 'connected') return;
		const now = this.localNow();
		const sample = this.sender.markAway(now, this.clock.serverNow(now));
		if (sample) this.sendPose(sample);
	}

	private syncAlone(): void {
		let others = 0;
		for (const slot of this.players.keys()) if (slot !== this.selfSlot) others++;
		this.sender.setAlone(others === 0);
	}

	private schedulePing(delay: number): void {
		if (this.pingTimer) clearTimeout(this.pingTimer);
		this.pingTimer = setTimeout(() => {
			if (this.status !== 'connected') return;
			this.sendText({ t: 'ping', c: this.localNow() });
			this.pingsSent++;
			this.schedulePing(this.pingsSent < FAST_PINGS ? FAST_PING_MS : SLOW_PING_MS);
		}, delay);
	}

	private sendKeepalive(): void {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		socket.send(KEEPALIVE_REQUEST);
		this.stats.bytesOut += KEEPALIVE_REQUEST.length;
	}

	private sendPose(sample: PoseSample): void {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
		const bytes = encodePose(sample);
		socket.send(bytes);
		this.stats.bytesOut += bytes.byteLength;
		this.stats.posesOut++;
	}

	private sendText(message: object): boolean {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;
		const text = JSON.stringify(message);
		socket.send(text);
		this.stats.bytesOut += text.length;
		return true;
	}

	private setStatus(status: NetStatus, detail: string | null): void {
		this.status = status;
		this.options.onStatus?.(status, detail);
	}

	private emitPlayers(): void {
		this.options.onPlayers?.([...this.players.values()], this.selfSlot);
	}
}

function browserEnvironment(): NetSessionEnvironment | null {
	if (typeof window === 'undefined' || typeof document === 'undefined') return null;
	const targetOf = (target: 'window' | 'document') => (target === 'window' ? window : document);
	return {
		addEventListener: (target, type, listener) => targetOf(target).addEventListener(type, listener),
		removeEventListener: (target, type, listener) =>
			targetOf(target).removeEventListener(type, listener),
		isHidden: () => document.visibilityState === 'hidden'
	};
}
