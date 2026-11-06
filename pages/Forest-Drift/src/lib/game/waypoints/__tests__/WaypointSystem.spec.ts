import { describe, expect, it } from 'vitest';
import {
	MAX_PERSONAL_WAYPOINTS,
	NEAREST_CARRYABLE_ID,
	WaypointSystem,
	cleanWaypointName,
	type WaypointHost,
	type WaypointStorage,
	type WaypointTarget
} from '../WaypointSystem';

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
