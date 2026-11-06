import { describe, expect, it } from 'vitest';
import {
	MAX_PERSONAL_WAYPOINTS,
	NEAREST_CARRYABLE_ID,
	WaypointSystem,
	cleanWaypointName,
	type WaypointHost,
	type WaypointLink,
	type WaypointStorage,
	type WaypointTarget
} from '../WaypointSystem';
import type { ClientWaypointMessage, SharedWaypoint } from '../../net/sharedWaypoints';

class MemoryStorage implements WaypointStorage {
	readonly data = new Map<string, string>();
	getItem(key: string) {
		return this.data.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.data.set(key, value);
	}
}

function world() {
	const state = {
		player: { x: 0, y: 0, z: 0 },
		creatures: new Map<string, WaypointTarget>(),
		carrying: false
	};
	const host: WaypointHost = {
		player: () => ({ ...state.player }),
		nearestCarryable: (from) => {
			let best: WaypointTarget | null = null;
			for (const c of state.creatures.values())
				if (
					!best ||
					Math.hypot(c.x - from.x, c.z - from.z) < Math.hypot(best.x - from.x, best.z - from.z)
				)
					best = c;
			return best;
		},
		creaturePosition: (id) => {
			const c = state.creatures.get(id);
			return c ? { x: c.x, y: c.y, z: c.z } : null;
		},
		carrying: () => state.carrying
	};
	const storage = new MemoryStorage();
	const waypoints = new WaypointSystem(host, storage);
	waypoints.setWorld('world-a');
	return { state, waypoints, storage };
}

const active = (w: WaypointSystem) => {
	const out: { id: string; x: number; z: number; label: string }[] = [];
	w.forEachActive((a) => out.push({ id: a.id, x: a.x, z: a.z, label: a.label }));
	return out;
};

describe('WaypointSystem: the nearest carryable creature', () => {
	it('is listed first, off until turned on', () => {
		const { waypoints } = world();
		const [first] = waypoints.list();
		expect(first).toMatchObject({
			id: NEAREST_CARRYABLE_ID,
			dynamic: true,
			enabled: false,
			status: 'off'
		});
		expect(waypoints.anyActive).toBe(false);
	});

	it('points at the nearest creature as soon as it is turned on, and names it', () => {
		const { state, waypoints } = world();
		state.creatures.set('a', { id: 'a', name: 'Moon Ribbon', x: 30, y: 1, z: 0 });
		state.creatures.set('b', { id: 'b', name: 'Amber Stilt', x: 80, y: 1, z: 0 });
		waypoints.setEnabled(NEAREST_CARRYABLE_ID, true);
		waypoints.update(0);
		expect(active(waypoints)).toEqual([
			{ id: NEAREST_CARRYABLE_ID, x: 30, z: 0, label: 'Moon Ribbon' }
		]);
		expect(waypoints.list()[0]).toMatchObject({
			status: 'active',
			detail: 'Moon Ribbon',
			distance: 30
		});
		expect(waypoints.followedCreature).toBe('a');
	});

	it('moves with the creature every frame', () => {
		const { state, waypoints } = world();
		state.creatures.set('a', { id: 'a', name: 'Moon Ribbon', x: 30, y: 1, z: 0 });
		waypoints.setEnabled(NEAREST_CARRYABLE_ID, true);
		waypoints.update(0);
		state.creatures.get('a')!.z = 12;
		waypoints.update(16); // before the next retarget: still follows
		expect(active(waypoints)[0]).toMatchObject({ x: 30, z: 12 });
	});

	it("doesn't flick to another creature that is only slightly closer, but does to a clearly closer one", () => {
		const { state, waypoints } = world();
		state.creatures.set('a', { id: 'a', name: 'A', x: 30, y: 0, z: 0 });
		waypoints.setEnabled(NEAREST_CARRYABLE_ID, true);
		waypoints.update(0);
		state.creatures.set('b', { id: 'b', name: 'B', x: 29, y: 0, z: 0 });
		waypoints.update(600);
		expect(waypoints.followedCreature).toBe('a');
		state.creatures.get('b')!.x = 10;
		waypoints.update(1200);
		expect(waypoints.followedCreature).toBe('b');
	});

	it('finds another when its creature is picked up or wanders out of range', () => {
		const { state, waypoints } = world();
		state.creatures.set('a', { id: 'a', name: 'A', x: 10, y: 0, z: 0 });
		state.creatures.set('b', { id: 'b', name: 'B', x: 40, y: 0, z: 0 });
		waypoints.setEnabled(NEAREST_CARRYABLE_ID, true);
		waypoints.update(0);
		state.creatures.delete('a');
		waypoints.update(16);
		expect(waypoints.followedCreature).toBe('b');
	});

	it('says none are nearby, and hides itself while this player carries one', () => {
		const { state, waypoints } = world();
		waypoints.setEnabled(NEAREST_CARRYABLE_ID, true);
		waypoints.update(0);
		expect(waypoints.list()[0]!.status).toBe('none');
		expect(waypoints.anyActive).toBe(false);
		state.creatures.set('a', { id: 'a', name: 'A', x: 10, y: 0, z: 0 });
		waypoints.update(600);
		expect(waypoints.anyActive).toBe(true);
		state.carrying = true;
		waypoints.update(1200);
		expect(waypoints.anyActive).toBe(false);
		expect(waypoints.list()[0]!.status).toBe('carrying');
		state.carrying = false;
		waypoints.update(1800);
		expect(waypoints.anyActive).toBe(true);
	});
});

describe('WaypointSystem: personal waypoints', () => {
	it('adds one where the player stands, turned on, with a name', () => {
		const { state, waypoints } = world();
		state.player = { x: 5, y: 2, z: -7 };
		const id = waypoints.addHere('  Old   oak ')!;
		expect(active(waypoints)).toEqual([{ id, x: 5, z: -7, label: 'Old oak' }]);
		state.player = { x: 5, y: 2, z: 13 };
		expect(waypoints.list()[1]).toMatchObject({ name: 'Old oak', enabled: true, distance: 20 });
	});

	it('names unnamed ones, turns them on and off, and removes only personal ones', () => {
		const { waypoints } = world();
		const id = waypoints.addHere('')!;
		expect(waypoints.list()[1]!.name).toBe('Waypoint 1');
		waypoints.setEnabled(id, false);
		expect(waypoints.anyActive).toBe(false);
		expect(waypoints.remove(NEAREST_CARRYABLE_ID)).toBe(false);
		expect(waypoints.remove(id)).toBe(true);
		expect(waypoints.list()).toHaveLength(1);
	});

	it(`holds at most ${MAX_PERSONAL_WAYPOINTS}`, () => {
		const { waypoints } = world();
		for (let i = 0; i < MAX_PERSONAL_WAYPOINTS; i++)
			expect(waypoints.addHere(`${i}`)).not.toBeNull();
		expect(waypoints.addHere('one too many')).toBeNull();
	});

	it('keeps each world’s waypoints apart and brings them back on return', () => {
		const { waypoints, state } = world();
		waypoints.setEnabled(NEAREST_CARRYABLE_ID, true);
		state.player = { x: 1, y: 0, z: 1 };
		waypoints.addHere('Camp');
		waypoints.setWorld('world-b');
		expect(waypoints.list()).toHaveLength(1);
		expect(waypoints.list()[0]!.enabled).toBe(false);
		waypoints.setWorld('world-a');
		expect(waypoints.list().map((w) => [w.name, w.enabled])).toEqual([
			['Nearest carryable creature', true],
			['Camp', true]
		]);
	});

	it('survives a corrupt or blocked store', () => {
		const { storage, waypoints } = world();
		storage.data.set('forest-drift.waypoints.v1:world-c', '{not json');
		waypoints.setWorld('world-c');
		expect(waypoints.list()).toHaveLength(1);
		const blocked = new WaypointSystem(
			{
				player: () => ({ x: 0, y: 0, z: 0 }),
				nearestCarryable: () => null,
				creaturePosition: () => null,
				carrying: () => false
			},
			{
				getItem: () => {
					throw new Error('blocked');
				},
				setItem: () => {
					throw new Error('blocked');
				}
			}
		);
		blocked.setWorld('w');
		expect(blocked.addHere('still works')).not.toBeNull();
		blocked.setCarryHints(false);
		expect(blocked.carryHints).toBe(false);
	});

	it('remembers the carry badge preference for every world', () => {
		const { storage, waypoints } = world();
		expect(waypoints.carryHints).toBe(true);
		waypoints.setCarryHints(false);
		const again = new WaypointSystem(
			{
				player: () => ({ x: 0, y: 0, z: 0 }),
				nearestCarryable: () => null,
				creaturePosition: () => null,
				carrying: () => false
			},
			storage
		);
		expect(again.carryHints).toBe(false);
	});
});

describe('cleanWaypointName', () => {
	it('drops control characters, squashes spaces and caps the length', () => {
		expect(cleanWaypointName('a\u0000b\tc   d', 'x')).toBe('ab c d');
		expect(cleanWaypointName('   ', 'Fallback')).toBe('Fallback');
		expect(cleanWaypointName('x'.repeat(40), 'f')).toHaveLength(24);
	});
});

describe('WaypointSystem: public waypoints online', () => {
	function online(playerId = 'sam', role: WaypointLink['role'] = 'editor') {
		const w = world();
		const sent: ClientWaypointMessage[] = [];
		let connected = true;
		const link: WaypointLink = {
			playerId,
			role,
			send: (m) => {
				if (!connected) return false;
				sent.push(m);
				return true;
			}
		};
		w.waypoints.setLink(link);
		w.waypoints.setShared([]);
		return { ...w, sent, setConnected: (c: boolean) => (connected = c) };
	}
	const row = (w: WaypointSystem, id: string) => w.list().find((r) => r.id === id)!;
	const shared = (over: Partial<SharedWaypoint> = {}): SharedWaypoint => ({
		id: 'wp-alex',
		name: 'Meet here',
		colour: '#ff7aa8',
		x: 30,
		y: 0,
		z: 0,
		on: true,
		othersCanControl: false,
		owner: 'alex',
		ownerName: 'Alex',
		...over
	});

	it('everything starts private, and only online can a waypoint be shared', () => {
		const { waypoints } = world();
		const id = waypoints.addHere('Camp')!;
		expect(row(waypoints, id)).toMatchObject({ visibility: 'private', canShare: false });
		expect(waypoints.setVisibility(id, 'public')).toBe(false);
		const net = online();
		const id2 = net.waypoints.addHere('Camp')!;
		expect(row(net.waypoints, id2)).toMatchObject({
			visibility: 'private',
			mine: true,
			canShare: true,
			canSetControl: false
		});
		// The creature waypoint never leaves this player's screen.
		expect(row(net.waypoints, NEAREST_CARRYABLE_ID).canShare).toBe(false);
	});

	it('making one public sends it to the room and takes it out of this browser', () => {
		const { waypoints, sent, storage, state } = online();
		state.player = { x: 4, y: 1, z: 2 };
		const id = waypoints.addHere('Camp')!;
		expect(waypoints.setVisibility(id, 'public')).toBe(true);
		expect(sent).toEqual([
			{
				t: 'waypoint',
				op: 'put',
				waypoint: {
					id,
					name: 'Camp',
					colour: '#4fb3ff',
					x: 4,
					y: 1,
					z: 2,
					on: true,
					othersCanControl: false
				}
			}
		]);
		expect(row(waypoints, id)).toMatchObject({ visibility: 'public', pending: true, mine: true });
		const saved = JSON.parse(storage.data.get('forest-drift.waypoints.v1:world-a')!);
		expect(saved.personal).toEqual([]);
		// The room confirms: no longer pending, and others' control can now be chosen.
		waypoints.applyShared({
			t: 'waypoints',
			put: [
				{
					...(sent[0] as unknown as { waypoint: SharedWaypoint }).waypoint,
					owner: 'sam',
					ownerName: 'Sam'
				}
			]
		});
		expect(row(waypoints, id)).toMatchObject({
			pending: false,
			canSetControl: true,
			canRemove: true
		});
		expect(active(waypoints).map((a) => a.id)).toContain(id);
	});

	it('stays private when the room refuses, and says why', () => {
		const { waypoints } = online();
		const id = waypoints.addHere('Camp')!;
		waypoints.setVisibility(id, 'public');
		waypoints.applyShared({ t: 'waypoints', remove: [id], refused: { id, reason: 'limit' } });
		expect(row(waypoints, id)).toMatchObject({ visibility: 'private', pending: false });
		expect(waypoints.notice).toMatch(/Couldn.t make “Camp” public/);
	});

	it("shows other players' public waypoints, which they control unless they allow others", () => {
		const { waypoints, sent } = online();
		waypoints.setShared([shared()]);
		expect(row(waypoints, 'wp-alex')).toMatchObject({
			mine: false,
			ownerName: 'Alex',
			visibility: 'public',
			canToggle: false,
			canRename: false,
			canRemove: false,
			canShare: false,
			canSetControl: false
		});
		expect(active(waypoints).map((a) => a.id)).toEqual(['wp-alex']);
		waypoints.setEnabled('wp-alex', false);
		expect(waypoints.rename('wp-alex', 'Mine now')).toBe(false);
		expect(sent).toEqual([]);
		// Alex lets others control it: Sam can turn it off for everyone and rename it, not remove it.
		waypoints.applyShared({ t: 'waypoints', put: [shared({ othersCanControl: true })] });
		expect(row(waypoints, 'wp-alex')).toMatchObject({
			canToggle: true,
			canRename: true,
			canRemove: false
		});
		waypoints.setEnabled('wp-alex', false);
		expect(waypoints.rename('wp-alex', '  Old  oak ')).toBe(true);
		expect(waypoints.remove('wp-alex')).toBe(false);
		expect(sent).toEqual([
			{ t: 'waypoint', op: 'set', id: 'wp-alex', on: false },
			{ t: 'waypoint', op: 'set', id: 'wp-alex', name: 'Old oak' }
		]);
		expect(active(waypoints)).toEqual([]);
	});

	it("lets the world's owner remove anyone's public waypoint, but not take it private", () => {
		const { waypoints, sent } = online('olive', 'owner');
		waypoints.setShared([shared()]);
		expect(row(waypoints, 'wp-alex')).toMatchObject({
			canRemove: true,
			canShare: false,
			canToggle: true
		});
		expect(waypoints.setVisibility('wp-alex', 'private')).toBe(false);
		expect(waypoints.remove('wp-alex')).toBe(true);
		expect(sent).toEqual([{ t: 'waypoint', op: 'remove', id: 'wp-alex' }]);
		expect(waypoints.list().some((r) => r.id === 'wp-alex')).toBe(false);
	});

	it('taking one private again removes it from the room and keeps it in this browser', () => {
		const { waypoints, sent, storage } = online();
		waypoints.setShared([shared({ id: 'wp-mine', owner: 'sam', ownerName: 'Sam', on: false })]);
		expect(waypoints.setVisibility('wp-mine', 'private')).toBe(true);
		expect(sent).toEqual([{ t: 'waypoint', op: 'remove', id: 'wp-mine' }]);
		expect(row(waypoints, 'wp-mine')).toMatchObject({ visibility: 'private', enabled: false });
		const saved = JSON.parse(storage.data.get('forest-drift.waypoints.v1:world-a')!);
		expect(saved.personal.map((p: { id: string }) => p.id)).toEqual(['wp-mine']);
	});

	it('changes nothing while offline, and says so', () => {
		const { waypoints, sent, setConnected } = online();
		waypoints.setShared([shared({ id: 'wp-mine', owner: 'sam', ownerName: 'Sam' })]);
		setConnected(false);
		waypoints.setEnabled('wp-mine', false);
		expect(row(waypoints, 'wp-mine').enabled).toBe(true);
		const id = waypoints.addHere('Camp')!;
		expect(waypoints.setVisibility(id, 'public')).toBe(false);
		expect(row(waypoints, id).visibility).toBe('private');
		expect(waypoints.notice).toMatch(/Not connected/);
		expect(sent).toEqual([]);
	});

	it('publishes again after a reconnect if the room never got it', () => {
		const { waypoints, sent } = online();
		const id = waypoints.addHere('Camp')!;
		waypoints.setVisibility(id, 'public');
		// Reconnected; the room's list doesn't have it.
		waypoints.setShared([shared()]);
		expect(sent.filter((m) => m.op === 'put')).toHaveLength(2);
		expect(row(waypoints, id)).toMatchObject({ visibility: 'public', pending: true });
		expect(waypoints.list().map((r) => r.id)).toEqual([NEAREST_CARRYABLE_ID, id, 'wp-alex']);
	});
});
