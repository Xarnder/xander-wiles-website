import * as THREE from 'three';
import { LocatorBar } from '../hud/LocatorBar';
import { createId, type PlayerIdentity } from './mpConfig';
import { webSocketUrl } from './mpConfig';
import { NetDiagnostics, type NetDiagnosticsReport } from './NetDiagnostics';
import { NetSession, type NetStats, type NetStatus, type WelcomeInfo } from './NetSession';
import {
	MAX_ENV_JSON_BYTES,
	POSE_FLAGS,
	OFFLINE_EDIT_OPS,
	OFFLINE_EDIT_SECONDS,
	type PlayerBookmark,
	type PlayerInfo,
	type PlayerRole,
	type SharedEnvironment
} from './protocol';
import { RemoteAvatarRenderer } from './RemoteAvatarRenderer';
import { WorldOpFeed, type DeletionItem, type SharedWorldPort } from './WorldOpFeed';
import { WorldReplica } from './WorldReplica';
import type { OnlineWorldSync } from './worldTransfer';

/** How the scene reads and applies the owner's shared sky, weather and time. */
export interface SharedEnvironmentPort {
	/** The current sky, weather and time anchor, as the owner would share them. */
	capture(): SharedEnvironment;
	/** Applies the room's shared sky, weather and time. */
	apply(env: SharedEnvironment): void;
}

/** What `ThreeScene` hands a multiplayer session when it starts. */
export interface SceneMultiplayerContext {
	characterSurface?: (x: number, z: number, referenceY: number) => number;
	scene: THREE.Scene;
	camera: THREE.Camera;
	/** Registers a lit material with the shadow pipeline (see `GraphicsPipeline.registerMaterial`). */
	registerMaterial: (material: THREE.Material) => void;
	/** Exclude camera-facing name tags from the solid depth/normal pass; returns cleanup. */
	excludeFromAo: (object: THREE.Object3D) => () => void;
	environment: SharedEnvironmentPort;
	/** The authored world, for shared building (Phase 3). */
	world: SharedWorldPort;
	/** Someone else opened or closed a door. */
	setDoorOpen: (openingId: string, open: boolean) => void;
	/** Q18: back where this player last left the world (feet position). */
	restorePlayer: (bookmark: PlayerBookmark) => void;
	/** Building on/off for this player (visitor, not yet joined, or offline too long). */
	setBuildingLocked: (locked: boolean) => void;
	/** Settings → Graphics → Show locator bar. */
	showLocatorBar: () => boolean;
}

/** The local player's state after `FirstPersonController.update`, each rendered frame. */
export interface LocalPlayerFrame {
	x: number;
	/** Eye height above sea level — the controller's `worldPosition.y`. */
	eyeY: number;
	z: number;
	yaw: number;
	pitch: number;
	flying: boolean;
	grounded?: boolean;
	running?: boolean;
	eyeHeight: number;
}

/**
 * The only multiplayer surface `ThreeScene` knows about: two calls per frame, the room clock, a
 * change notice for the owner's settings and for doors, and a start/stop. Single player passes
 * nothing and runs exactly as before.
 */
export interface SceneMultiplayerHooks {
	attach(context: SceneMultiplayerContext): void;
	afterControllerUpdate(local: LocalPlayerFrame): void;
	beforeRender(deltaSeconds: number): void;
	/** Seconds the world has been occupied (Q11-A), or null until the room has said. */
	roomSeconds(): number | null;
	/** The local player changed the shared sky, weather or time (only the owner can). */
	environmentChanged(): void;
	/** The local player opened or closed a door (Q13-A). */
	doorToggled(openingId: string, open: boolean): void;
	detach(): void;
}

/** Why building is off right now, for the on-screen badge; null when it's on. */
export type BuildLock = 'joining' | 'viewer' | 'offline' | null;

export interface MultiplayerSessionOptions {
	serverUrl: string;
	worldId: string;
	identity: PlayerIdentity;
	schemaVersion: number;
	build: string;
	access: { invite: string | null; capability: string | null };
	/** The world as downloaded: rows, version and names (Phase 3). */
	sync: OnlineWorldSync;
	/** Fetches a fresh snapshot (a resync). */
	fetchSnapshot: () => Promise<OnlineWorldSync | null>;
	onStatus?: (status: NetStatus, detail: string | null) => void;
	onPlayers?: (players: PlayerInfo[], selfSlot: number | null) => void;
	onRole?: (role: PlayerRole) => void;
	onCapability?: (capability: string) => void;
	/** Short messages for the player ("Sam just put a window there"). */
	onNotice?: (message: string) => void;
	/** F2-B: whether to remove other people's additions too. */
	onConfirmDeletion?: (items: DeletionItem[]) => Promise<boolean>;
	onBuildLock?: (lock: BuildLock) => void;
	/** The world version changed (for the remembered-worlds cache). */
	onVersion?: (version: { epoch: number; seq: number }) => void;
	/** Whether this player's changes are still on their way to the room. */
	onSaving?: (saving: boolean) => void;
}

/** The owner's slider drags are coalesced into at most this many sends a second. */
const ENV_SEND_INTERVAL_MS = 250;

/** Connects one open world to its room: poses, avatars, the shared sky, doors and building. */
export class MultiplayerSession implements SceneMultiplayerHooks {
	private readonly net: NetSession;
	private readonly options: MultiplayerSessionOptions;
	private readonly diagnosticsReader: NetDiagnostics;
	private readonly replica: WorldReplica;
	private readonly names: Record<string, string>;
	private feed: WorldOpFeed | null = null;
	private context: SceneMultiplayerContext | null = null;
	private avatars: RemoteAvatarRenderer | null = null;
	private pendingEnv: SharedEnvironment | null = null;
	private pendingWelcome: WelcomeInfo | null = null;
	private envTimer: ReturnType<typeof setTimeout> | null = null;
	private lastEnvSentAt = Number.NEGATIVE_INFINITY;
	private playerCount = 0;
	private status: NetStatus = 'connecting';
	private disconnectedSince: number | null = null;
	private lock: BuildLock = 'joining';
	private resyncing = false;
	private saving = false;
	private readonly locator = new LocatorBar();
	private localFeetY = 0;

	constructor(options: MultiplayerSessionOptions) {
		this.options = options;
		this.names = { ...options.sync.names };
		this.replica = new WorldReplica({
			rows: options.sync.rows,
			seq: options.sync.seq,
			epoch: options.sync.epoch
		});
		this.net = new NetSession({
			url: webSocketUrl(options.serverUrl, options.worldId),
			identity: options.identity,
			schemaVersion: options.schemaVersion,
			build: options.build,
			access: options.access,
			onStatus: (status, detail) => {
				this.status = status;
				if (status === 'connected') this.disconnectedSince = null;
				else this.disconnectedSince ??= Date.now();
				this.updateLock();
				options.onStatus?.(status, detail);
			},
			onPlayers: (players, selfSlot) => {
				this.playerCount = players.length;
				for (const player of players) this.names[player.playerId] = player.name;
				options.onPlayers?.(players, selfSlot);
			},
			onWelcome: (welcome) => this.handleWelcome(welcome),
			onEnvironment: (env) => this.applyEnvironment(env),
			onCapability: options.onCapability,
			world: {
				version: () => ({ epoch: this.replica.epoch, seq: this.replica.seq }),
				onCommit: (commit) => {
					this.names[commit.by] = commit.byName;
					this.feed?.onCommit(commit);
					options.onVersion?.({ epoch: this.replica.epoch, seq: this.replica.seq });
				},
				onReject: (reject) => this.feed?.onReject(reject),
				onAck: (batchId) => this.feed?.onAck(batchId),
				onSynced: () => this.feed?.resendPending(),
				onDoor: (id, open) => this.context?.setDoorOpen(id, open)
			}
		});
		this.diagnosticsReader = new NetDiagnostics(() => ({
			status: this.net.currentStatus,
			role: this.net.currentRole,
			stats: this.net.stats,
			rttMs: this.net.rttMs,
			interpolationDelayMs: this.net.interpolationDelayMs,
			silenceMs: this.net.silenceMs,
			lastClose: this.net.lastCloseInfo,
			roomSeconds: this.net.roomSeconds(),
			players: this.playerCount,
			build: options.build
		}));
	}

	get role(): PlayerRole | null {
		return this.net.currentRole;
	}

	get stats(): NetStats & { rttMs: number; avatars: number } {
		return { ...this.net.stats, rttMs: this.net.rttMs, avatars: this.avatars?.count ?? 0 };
	}

	/** For tests and diagnostics: what's still waiting for the room. */
	get pendingBatches(): number {
		return this.replica.pendingBatches.length;
	}

	get worldVersion(): { epoch: number; seq: number; checksum: string } {
		return { epoch: this.replica.epoch, seq: this.replica.seq, checksum: this.replica.checksum };
	}

	diagnostics(): NetDiagnosticsReport {
		return this.diagnosticsReader.report();
	}

	/** Pause menu and other overlays: shown as away while the world keeps running (Q12). */
	setAway(away: boolean): void {
		this.net.setAway(away);
	}

	/** The HUD's locator bar element (null when it's not on screen). */
	setLocatorElement(element: HTMLElement | null): void {
		this.locator.attach(element);
	}

	/** For tests: markers currently on the locator bar. */
	get locatorMarkers(): number {
		return this.locator.visibleCount;
	}

	/** Test hook: the connection dies the way a lost network kills it (the room isn't told). */
	simulateNetworkDrop(): void {
		this.net.simulateNetworkDrop();
	}

	attach(context: SceneMultiplayerContext): void {
		this.context = context;
		this.avatars = new RemoteAvatarRenderer(
			context.registerMaterial,
			context.excludeFromAo,
			context.characterSurface
		);
		context.scene.add(this.avatars.group);
		context.setBuildingLocked(true);
		this.feed = new WorldOpFeed({
			port: context.world,
			replica: this.replica,
			playerId: this.options.identity.playerId,
			role: () => this.net.currentRole,
			send: (batchId, ops) => this.net.sendOps(batchId, ops),
			notice: (message) => this.options.onNotice?.(message),
			confirmDeletion: (items) => this.options.onConfirmDeletion?.(items) ?? Promise.resolve(true),
			requestResync: () => void this.resync(),
			nameOf: (playerId) => (playerId === '' ? 'the owner' : (this.names[playerId] ?? 'someone')),
			createId
		});
		this.feed.start();
		if (this.pendingEnv) {
			context.environment.apply(this.pendingEnv);
			this.pendingEnv = null;
		}
		if (this.pendingWelcome) {
			const welcome = this.pendingWelcome;
			this.pendingWelcome = null;
			this.handleWelcome(welcome);
		}
		this.net.connect();
	}

	afterControllerUpdate(local: LocalPlayerFrame): void {
		this.localFeetY = local.eyeY - local.eyeHeight;
		this.net.samplePose({
			x: local.x,
			feetY: local.eyeY - local.eyeHeight,
			z: local.z,
			yaw: local.yaw,
			pitch: local.pitch,
			flying: local.flying,
			grounded: local.grounded,
			running: local.running
		});
	}

	beforeRender(deltaSeconds: number): void {
		this.feed?.tick();
		this.updateLock();
		const saving = this.replica.pendingBatches.length > 0;
		if (saving !== this.saving) {
			this.saving = saving;
			this.options.onSaving?.(saving);
		}
		if (!this.avatars || !this.context) return;
		const views = this.net.remoteFrames(deltaSeconds * 1000);
		this.avatars.update(views, deltaSeconds, this.context.camera);
		const camera = this.context.camera;
		if (camera instanceof THREE.PerspectiveCamera) {
			this.locator.setEnabled(this.context.showLocatorBar());
			this.locator.beginFrame(camera, this.localFeetY);
			for (const { info, frame } of views) {
				const dim =
					info.away || info.offline || frame.stale || (frame.flags & POSE_FLAGS.away) !== 0;
				this.locator.place(info.playerId, frame.x, frame.y, frame.z, info.colour, info.name, dim);
			}
			this.locator.endFrame();
		}
	}

	roomSeconds(): number | null {
		return this.net.roomSeconds();
	}

	environmentChanged(): void {
		if (this.net.currentRole !== 'owner' || this.envTimer !== null) return;
		const wait = Math.max(0, this.lastEnvSentAt + ENV_SEND_INTERVAL_MS - performance.now());
		this.envTimer = setTimeout(() => {
			this.envTimer = null;
			this.sendEnvironment();
		}, wait);
	}

	doorToggled(openingId: string, open: boolean): void {
		this.net.sendDoor(openingId, open);
	}

	detach(): void {
		if (this.envTimer !== null) clearTimeout(this.envTimer);
		this.envTimer = null;
		// Anything the room hasn't confirmed yet is flushed first: a quit straight after an edit
		// still sends it (the socket closes right after, deliberately).
		this.feed?.flushLocal();
		this.net.dispose();
		this.locator.dispose();
		this.avatars?.dispose();
		this.avatars = null;
		this.context = null;
		this.feed = null;
	}

	private handleWelcome(welcome: WelcomeInfo): void {
		if (!this.context) {
			this.pendingWelcome = welcome;
			return;
		}
		Object.assign(this.names, welcome.names);
		this.options.onRole?.(welcome.role);
		if (welcome.env) this.applyEnvironment(welcome.env);
		for (const id of welcome.doors) this.context.setDoorOpen(id, true);
		if (welcome.first && welcome.bookmark) this.context.restorePlayer(welcome.bookmark);
		if (welcome.resync) void this.resync();
		this.updateLock();
	}

	private async resync(): Promise<void> {
		if (this.resyncing) return;
		this.resyncing = true;
		try {
			const sync = await this.options.fetchSnapshot();
			if (!sync || !this.feed) return;
			if (sync.epoch !== this.replica.epoch) {
				this.options.onNotice?.('The owner restored an earlier version of this world.');
			}
			Object.assign(this.names, sync.names);
			this.feed.onResync({ rows: sync.rows, seq: sync.seq, epoch: sync.epoch });
			this.options.onVersion?.({ epoch: sync.epoch, seq: sync.seq });
		} finally {
			this.resyncing = false;
		}
	}

	/**
	 * Building is on for editors and the owner while connected; offline, edits queue for 30 s or
	 * 50 ops (Q21) and then building pauses until the connection is back.
	 */
	private updateLock(): void {
		const role = this.net.currentRole;
		let lock: BuildLock = null;
		if (!role) lock = 'joining';
		else if (role === 'viewer') lock = 'viewer';
		else if (
			this.status !== 'connected' &&
			((this.disconnectedSince !== null &&
				Date.now() - this.disconnectedSince > OFFLINE_EDIT_SECONDS * 1000) ||
				this.replica.pendingOpCount > OFFLINE_EDIT_OPS)
		) {
			lock = 'offline';
		}
		if (lock === this.lock) return;
		this.lock = lock;
		this.context?.setBuildingLocked(lock !== null);
		this.options.onBuildLock?.(lock);
	}

	private applyEnvironment(env: SharedEnvironment): void {
		if (this.context) this.context.environment.apply(env);
		else this.pendingEnv = env;
	}

	private sendEnvironment(): void {
		if (!this.context || this.net.currentRole !== 'owner') return;
		const env = this.context.environment.capture();
		if (JSON.stringify({ t: 'env', env }).length > MAX_ENV_JSON_BYTES) return;
		this.lastEnvSentAt = performance.now();
		this.net.sendEnvironment(env);
	}
}
