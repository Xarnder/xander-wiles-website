import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetSession, type NetSessionEnvironment, type NetStatus } from '../NetSession';
import {
	CLIENT_LEAVE_CODE,
	CLOSE_CODES,
	KEEPALIVE_REQUEST,
	KEEPALIVE_RESPONSE,
	POSE_FLAGS,
	decodePose,
	type PlayerInfo,
	type WelcomeMessage
} from '../protocol';

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 3;
	readyState = FakeSocket.CONNECTING;
	binaryType = 'blob';
	bufferedAmount = 0;
	readonly sent: (string | ArrayBuffer)[] = [];
	closedWith: { code: number; reason: string } | null = null;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
	onclose: ((event: { code: number; reason: string }) => void) | null = null;
	onerror: (() => void) | null = null;

	constructor(readonly url: string) {}

	send(data: string | ArrayBuffer): void {
		this.sent.push(data);
	}
	close(code: number, reason: string): void {
		this.closedWith = { code, reason };
		this.readyState = FakeSocket.CLOSED;
	}
	open(): void {
		this.readyState = FakeSocket.OPEN;
		this.onopen?.();
	}
	receive(data: string | ArrayBuffer | object): void {
		this.onmessage?.({
			data: typeof data === 'string' || data instanceof ArrayBuffer ? data : JSON.stringify(data)
		});
	}
	serverClose(code: number, reason = ''): void {
		this.readyState = FakeSocket.CLOSED;
		this.onclose?.({ code, reason });
	}
	json(): { t: string; [key: string]: unknown }[] {
		return this.sent
			.filter((data): data is string => typeof data === 'string' && data.startsWith('{'))
			.map((data) => JSON.parse(data));
	}
	poses() {
		return this.sent
			.filter((data): data is ArrayBuffer => data instanceof ArrayBuffer)
			.map((data) => decodePose(data)!);
	}
}

class FakeEnvironment implements NetSessionEnvironment {
	hidden = false;
	private readonly listeners = new Map<string, (() => void)[]>();
	addEventListener(target: 'window' | 'document', type: string, listener: () => void): void {
		const key = `${target}:${type}`;
		this.listeners.set(key, [...(this.listeners.get(key) ?? []), listener]);
	}
	removeEventListener(target: 'window' | 'document', type: string, listener: () => void): void {
		const key = `${target}:${type}`;
		this.listeners.set(
			key,
			(this.listeners.get(key) ?? []).filter((fn) => fn !== listener)
		);
	}
	isHidden(): boolean {
		return this.hidden;
	}
	fire(target: 'window' | 'document', type: string): void {
		for (const fn of this.listeners.get(`${target}:${type}`) ?? []) fn();
	}
}

const PLAYERS: PlayerInfo[] = [
	{
		slot: 0,
		playerId: 'player-self',
		name: 'Me',
		colour: '#336699',
		role: 'editor',
		away: false,
		offline: false
	},
	{
		slot: 1,
		playerId: 'player-other',
		name: 'Them',
		colour: '#993366',
		role: 'viewer',
		away: false,
		offline: false
	}
];

function welcome(serverTime: number, overrides: Partial<WelcomeMessage> = {}): WelcomeMessage {
	return {
		t: 'welcome',
		slot: 0,
		role: 'editor',
		capability: 'capability-from-room-0001',
		serverTime,
		players: PLAYERS,
		tickMs: 50,
		world: { worldId: 'world-1', name: 'World' },
		clock: { elapsedMs: 60_000, running: true },
		env: null,
		rules: { maxSpeed: 22, flight: false },
		epoch: 0,
		seq: 0,
		resync: false,
		bookmark: null,
		doors: [],
		names: {},
		...overrides
	};
}

describe('NetSession', () => {
	let local = 0;
	let sockets: FakeSocket[];
	let env: FakeEnvironment;
	let statuses: NetStatus[];
	let capabilities: string[];

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('WebSocket', FakeSocket);
		local = 0;
		sockets = [];
		env = new FakeEnvironment();
		statuses = [];
		capabilities = [];
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	function createSession(access = { invite: 'invite-token-00000000', capability: null }) {
		const session = new NetSession({
			url: 'ws://room/w/world-1/ws',
			identity: { playerId: 'player-self', name: 'Me', colour: '#336699' },
			schemaVersion: 9,
			build: 'test-build',
			access,
			onStatus: (status) => statuses.push(status),
			onCapability: (capability) => capabilities.push(capability),
			createSocket: (url) => {
				const socket = new FakeSocket(url);
				sockets.push(socket);
				return socket as unknown as WebSocket;
			},
			localNow: () => local,
			environment: env
		});
		return session;
	}

	/** Advances both the fake timers and the session's clock. */
	function advance(ms: number) {
		local += ms;
		vi.advanceTimersByTime(ms);
	}

	function connectAndWelcome(session: NetSession, serverTime = 1_000_000) {
		session.connect();
		const socket = sockets.at(-1)!;
		socket.open();
		socket.receive(welcome(serverTime + local));
		return socket;
	}

	it('says hello with the invite, then resumes with the capability it was given', () => {
		const session = createSession();
		const first = connectAndWelcome(session);
		const hello = first.json().find((m) => m.t === 'hello')!;
		expect(hello).toMatchObject({
			invite: 'invite-token-00000000',
			capability: null,
			build: 'test-build'
		});
		expect(capabilities).toEqual(['capability-from-room-0001']);
		expect(session.currentRole).toBe('editor');

		first.serverClose(1006);
		expect(session.currentStatus).toBe('reconnecting');
		advance(1000);
		const second = sockets.at(-1)!;
		expect(second).not.toBe(first);
		second.open();
		expect(second.json().find((m) => m.t === 'hello')).toMatchObject({
			invite: 'invite-token-00000000',
			capability: 'capability-from-room-0001'
		});
		second.receive(welcome(1_001_000));
		expect(session.currentStatus).toBe('connected');
		expect(session.stats.reconnects).toBe(1);
		session.dispose();
	});

	it('stops on a fatal close instead of retrying', () => {
		const session = createSession();
		const socket = connectAndWelcome(session);
		socket.receive({ t: 'error', code: 'access', message: 'This invite link is not valid.' });
		socket.serverClose(CLOSE_CODES.accessDenied, 'nope');
		expect(session.currentStatus).toBe('failed');
		advance(60_000);
		expect(sockets).toHaveLength(1);
		session.dispose();
	});

	it('notices a connection that is open but silent, and replaces it', () => {
		const session = createSession();
		const socket = connectAndWelcome(session);
		// Keep-alives go out every 10 s and come back as KA...
		advance(10_000);
		expect(socket.sent).toContain(KEEPALIVE_REQUEST);
		socket.receive(KEEPALIVE_RESPONSE);
		advance(20_000);
		expect(sockets).toHaveLength(1);
		// ...until the network silently goes away.
		advance(10_000);
		expect(socket.closedWith?.code).toBe(4000);
		expect(session.currentStatus).toBe('reconnecting');
		session.dispose();
	});

	it("doesn't mistake a hidden tab's throttled timers for a dead connection", () => {
		const session = createSession();
		const socket = connectAndWelcome(session);
		env.hidden = true;
		env.fire('document', 'visibilitychange');
		advance(5 * 60_000);
		expect(socket.closedWith).toBeNull();
		// Back in the tab: one probe, and a dead connection is replaced within seconds.
		env.hidden = false;
		env.fire('document', 'visibilitychange');
		advance(5500);
		expect(socket.closedWith?.code).toBe(4000);
		session.dispose();
	});

	it('reconnects at once when the tab comes back or the network returns', () => {
		const session = createSession();
		const socket = connectAndWelcome(session);
		socket.serverClose(1006);
		expect(statuses.at(-1)).toBe('reconnecting');
		env.fire('window', 'online');
		expect(sockets).toHaveLength(2);
		session.dispose();
	});

	it('probes a socket that still looks open after the tab was hidden', () => {
		const session = createSession();
		const socket = connectAndWelcome(session);
		env.hidden = false;
		env.fire('document', 'visibilitychange');
		expect(socket.sent.filter((data) => data === KEEPALIVE_REQUEST)).toHaveLength(1);
		advance(5500);
		expect(socket.closedWith?.code).toBe(4000);
		session.dispose();
	});

	it('marks the player away when the tab is hidden and when a menu says so', () => {
		const session = createSession();
		const socket = connectAndWelcome(session);
		session.samplePose({ x: 0, feetY: 0, z: 0, yaw: 0, pitch: 0, flying: false });
		env.hidden = true;
		env.fire('document', 'visibilitychange');
		expect(socket.poses().at(-1)!.flags & POSE_FLAGS.away).toBe(POSE_FLAGS.away);

		env.hidden = false;
		session.samplePose({ x: 0, feetY: 0, z: 0, yaw: 0, pitch: 0, flying: false });
		expect(socket.poses().at(-1)!.flags & POSE_FLAGS.away).toBe(0);
		session.setAway(true);
		expect(socket.poses().at(-1)!.flags & POSE_FLAGS.away).toBe(POSE_FLAGS.away);
		session.dispose();
	});

	it('counts the room clock from the welcome', () => {
		const session = createSession();
		connectAndWelcome(session);
		expect(session.roomSeconds()).toBeCloseTo(60, 1);
		advance(5000);
		expect(session.roomSeconds()).toBeCloseTo(65, 1);
		session.dispose();
	});

	it('keeps players through a reconnect, and follows presence', () => {
		const players: PlayerInfo[][] = [];
		const session = new NetSession({
			url: 'ws://room',
			identity: { playerId: 'player-self', name: 'Me', colour: '#336699' },
			schemaVersion: 9,
			build: 'test',
			access: { invite: 'invite-token-00000000', capability: null },
			onPlayers: (list) => players.push(list),
			createSocket: (url) => {
				const socket = new FakeSocket(url);
				sockets.push(socket);
				return socket as unknown as WebSocket;
			},
			localNow: () => local,
			environment: env
		});
		const socket = connectAndWelcome(session);
		socket.receive({ t: 'presence', slot: 1, away: true, offline: false });
		expect(players.at(-1)!.find((p) => p.slot === 1)!.away).toBe(true);
		const emitted = players.length;
		socket.serverClose(1006);
		expect(players).toHaveLength(emitted);
		session.dispose();
	});

	it('leaves deliberately on dispose, so the room frees the slot at once', () => {
		const session = createSession();
		const socket = connectAndWelcome(session);
		session.dispose();
		expect(socket.closedWith?.code).toBe(CLIENT_LEAVE_CODE);
	});
});
