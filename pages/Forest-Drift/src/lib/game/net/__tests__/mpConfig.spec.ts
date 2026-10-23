import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	findOnlineWorld,
	forgetOnlineWorld,
	loadOnlineWorlds,
	onlineWorldsOn,
	rememberOnlineWorld
} from '../mpConfig';

const LIVE = 'https://forest-drift-mp.example.workers.dev';
const LOCAL = 'http://localhost:8787';
const INVITE = 'invite-token-abcdef0123456789';

function memoryStorage(): Storage {
	const items = new Map<string, string>();
	return {
		get length() {
			return items.size;
		},
		clear: () => items.clear(),
		getItem: (key) => items.get(key) ?? null,
		key: (index) => [...items.keys()][index] ?? null,
		removeItem: (key) => void items.delete(key),
		setItem: (key, value) => void items.set(key, String(value))
	};
}

describe('remembered online worlds', () => {
	beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
	afterEach(() => vi.unstubAllGlobals());

	it('keeps the invite and server so a world can be joined again later', () => {
		rememberOnlineWorld({
			worldId: 'world-aaaa-1111',
			name: 'Lakeside',
			invite: INVITE,
			lastJoinedAt: '2026-10-22T10:00:00.000Z',
			serverUrl: LIVE
		});
		expect(findOnlineWorld('world-aaaa-1111')).toMatchObject({
			name: 'Lakeside',
			invite: INVITE,
			role: null,
			serverUrl: LIVE
		});
	});

	it('lists the most recently joined world first', () => {
		rememberOnlineWorld({ worldId: 'world-aaaa-1111', name: 'A', invite: INVITE });
		rememberOnlineWorld({ worldId: 'world-bbbb-2222', name: 'B', invite: INVITE });
		rememberOnlineWorld({ worldId: 'world-aaaa-1111', lastJoinedAt: '2026-10-22T11:00:00.000Z' });
		expect(loadOnlineWorlds().map((entry) => entry.name)).toEqual(['A', 'B']);
	});

	it('offers only the worlds on the server in use, plus ones saved before servers were recorded', () => {
		rememberOnlineWorld({
			worldId: 'world-live-1111',
			name: 'Live',
			invite: INVITE,
			serverUrl: LIVE
		});
		rememberOnlineWorld({
			worldId: 'world-dev0-2222',
			name: 'Dev',
			invite: INVITE,
			serverUrl: LOCAL
		});
		rememberOnlineWorld({ worldId: 'world-old0-3333', name: 'Old', invite: INVITE });
		const names = (server: string | null) =>
			onlineWorldsOn(loadOnlineWorlds(), server).map((entry) => entry.name);
		expect(names(LIVE)).toEqual(['Old', 'Live']);
		expect(names(LOCAL)).toEqual(['Old', 'Dev']);
		expect(names(null)).toEqual([]);
	});

	it('forgets a world and ignores entries that are not valid', () => {
		rememberOnlineWorld({ worldId: 'world-aaaa-1111', name: 'A', invite: INVITE });
		forgetOnlineWorld('world-aaaa-1111');
		expect(loadOnlineWorlds()).toEqual([]);

		localStorage.setItem(
			'forest-drift-mp-worlds',
			JSON.stringify([
				{ worldId: 'world-bbbb-2222', name: 'B', invite: INVITE, role: null, serverUrl: 42 },
				{ worldId: 'world-cccc-3333', name: 'C', invite: 'short', role: null },
				{ worldId: 'world-dddd-4444', name: 'D', invite: INVITE, role: 'editor' }
			])
		);
		expect(loadOnlineWorlds().map((entry) => entry.name)).toEqual(['D']);
	});
});
