import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerSession } from '../MultiplayerSession';
import type { NetSessionEnvironment } from '../NetSession';
import type { WelcomeMessage } from '../protocol';

/** Ranged weapons: the client side of picking up and firing, against a hand-driven socket. */
class FakeSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 3;
	readyState = FakeSocket.CONNECTING;
	binaryType = 'blob';
	bufferedAmount = 0;
	readonly sent: (string | ArrayBuffer)[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
	onclose: ((event: { code: number; reason: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	constructor(readonly url: string) {}
	send(data: string | ArrayBuffer): void {
		this.sent.push(data);
	}
	close(): void {
		this.readyState = FakeSocket.CLOSED;
	}
	open(): void {
		this.readyState = FakeSocket.OPEN;
		this.onopen?.();
	}
	receive(data: object): void {
		this.onmessage?.({ data: JSON.stringify(data) });
	}
	json(): { t: string; [key: string]: unknown }[] {
		return this.sent
			.filter((d): d is string => typeof d === 'string' && d.startsWith('{'))
			.map((d) => JSON.parse(d));
	}
}

const quietEnvironment: NetSessionEnvironment = {
	addEventListener() {},
	removeEventListener() {},
	isHidden: () => false
};

const welcome = (serverTime: number): WelcomeMessage => ({
	t: 'welcome',
	slot: 0,
	role: 'editor',
	capability: null,
	serverTime,
	players: [
		{
			slot: 0,
			playerId: 'player-self',
			name: 'Me',
			colour: '#336699',
			role: 'editor',
			away: false,
			offline: false
		}
	],
	tickMs: 50,
	world: { worldId: 'world-1', name: 'World' },
	clock: { elapsedMs: 0, running: true },
	env: null,
	rules: { maxSpeed: 22, flight: false },
	epoch: 1,
	seq: 0,
	resync: false,
	bookmark: null,
	doors: [],
	names: {}
});

describe('MultiplayerSession — carrying and firing', () => {
	let sockets: FakeSocket[];
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('WebSocket', FakeSocket);
		sockets = [];
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	function connected() {
		const session = new MultiplayerSession({
			serverUrl: 'http://room.test',
			worldId: 'world-1',
			identity: { playerId: 'player-self', name: 'Me', colour: '#336699' },
			schemaVersion: 9,
			build: 'test',
			access: { invite: 'invite-token-00000000', capability: null },
			sync: { rows: [], seq: 0, epoch: 1, checksum: '', names: {} },
			fetchSnapshot: async () => null,
			createSocket: (url) => {
				const socket = new FakeSocket(url);
				sockets.push(socket);
				return socket as unknown as WebSocket;
			},
			environment: quietEnvironment
		});
		(session as unknown as { net: { connect(): void } }).net.connect();
		const socket = sockets.at(-1)!;
		socket.open();
		socket.receive(welcome(1_000_000));
		session.afterControllerUpdate({
			x: 4,
			eyeY: 11.7,
			z: -2,
			yaw: 0.3,
			pitch: 0,
			flying: false,
			eyeHeight: 1.7
		});
		return { session, socket };
	}

	it('gives up on a pick-up the room never answers', async () => {
		const { session } = connected();
		const answer = session.claimCarry('group:forest:0:0:0:0');
		vi.advanceTimersByTime(2100);
		await expect(answer).resolves.toEqual({ ok: false, reason: 'timeout' });
	});

	it('hands back a creature the room granted after the client stopped waiting', async () => {
		const { session, socket } = connected();
		const answer = session.claimCarry('group:forest:0:0:0:0');
		const sentCarry = socket.json().find((m) => m.t === 'carry')!;
		vi.advanceTimersByTime(2100);
		await answer;
		socket.receive({ t: 'carryResult', id: sentCarry.id, ok: true });
		const drop = socket.json().find((m) => m.t === 'drop');
		expect(drop).toMatchObject({ t: 'drop', at: [4, 10, -2, 0.3] });
	});

	it('stamps shots with the room clock and reports hits as fire time plus flight', () => {
		const { session, socket } = connected();
		const shot = session.fireShot([4, 11, -2], [0, 0, -1])!;
		const sent = socket.json().find((m) => m.t === 'shoot')!;
		expect(sent).toMatchObject({ shot, origin: [4, 11, -2], dir: [0, 0, -1] });
		expect(Math.abs((sent.at as number) - 1_000_000)).toBeLessThan(50);
		session.reportShotHit(shot, 3, [4, 11, -12], 286);
		const hit = socket.json().find((m) => m.t === 'shotHit')!;
		expect(hit).toMatchObject({ shot, target: 3, at: (sent.at as number) + 286 });
		// Unknown shots are never reported.
		session.reportShotHit(999, 3, [0, 0, 0], 10);
		expect(socket.json().filter((m) => m.t === 'shotHit')).toHaveLength(1);
	});

	it("doesn't fire, and says it's not connected, while the connection is down", () => {
		const { session, socket } = connected();
		expect(session.connected()).toBe(true);
		socket.readyState = FakeSocket.CLOSED;
		socket.onclose?.({ code: 1006, reason: '' });
		expect(session.connected()).toBe(false);
		expect(session.fireShot([0, 0, 0], [0, 0, -1])).toBeNull();
	});
});
