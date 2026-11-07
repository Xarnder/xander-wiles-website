import { describe, expect, it } from 'vitest';
import {
	MAX_PUBLIC_WAYPOINTS_PER_PLAYER,
	MAX_PUBLIC_WAYPOINTS_PER_WORLD,
	WaypointBoard,
	canControlWaypoint,
	canManageWaypoint,
	parseWaypointMessage,
	type ClientWaypointMessage,
	type WaypointActor,
	type WaypointDraft
} from '../sharedWaypoints';
import { PROTOCOL_VERSION, parseClientMessage } from '../protocol';

const sam: WaypointActor = {
	playerId: 'sam',
	name: 'Sam',
	role: 'editor',
	position: { x: 0, y: 0, z: 0 }
};
const alex: WaypointActor = { ...sam, playerId: 'alex', name: 'Alex', role: 'viewer' };
const owner: WaypointActor = { ...sam, playerId: 'olive', name: 'Olive', role: 'owner' };

const draft = (over: Partial<WaypointDraft> = {}): WaypointDraft => ({
	id: 'wp-camp',
	name: 'Camp',
	colour: '#4fb3ff',
	x: 10,
	y: 2,
	z: -5,
	on: true,
	othersCanControl: false,
	...over
});
const put = (waypoint: WaypointDraft): ClientWaypointMessage => ({
	t: 'waypoint',
	op: 'put',
	waypoint
});

describe('public waypoints: who may do what', () => {
	it('arrived with protocol 7 (8 adds riding)', () => {
		expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(7);
	});

	it('lets anyone see, but only the creator (or the world owner) manage', () => {
		const w = { owner: 'sam', othersCanControl: false };
		expect(canManageWaypoint(w, 'sam', 'viewer')).toBe(true);
		expect(canManageWaypoint(w, 'alex', 'editor')).toBe(false);
		expect(canManageWaypoint(w, 'olive', 'owner')).toBe(true);
		expect(canControlWaypoint(w, 'alex', 'editor')).toBe(false);
		const shared = { ...w, othersCanControl: true };
		expect(canControlWaypoint(shared, 'alex', 'viewer')).toBe(true);
		// Control never grants management.
		expect(canManageWaypoint(shared, 'alex', 'viewer')).toBe(false);
	});
});

describe('WaypointBoard', () => {
	it('publishes a waypoint stamped with its creator, for everyone including visitors', () => {
		const board = new WaypointBoard();
		const outcome = board.apply(put(draft()), alex);
		expect(outcome).toEqual({ put: { ...draft(), owner: 'alex', ownerName: 'Alex' } });
		expect(board.list()).toHaveLength(1);
	});

	it('lets others turn it on/off and rename it only when its creator allows', () => {
		const board = new WaypointBoard();
		board.apply(put(draft()), sam);
		const off: ClientWaypointMessage = { t: 'waypoint', op: 'set', id: 'wp-camp', on: false };
		expect(board.apply(off, alex)).toMatchObject({ refused: 'rights', current: { on: true } });
		board.apply(put(draft({ othersCanControl: true })), sam);
		expect(board.apply(off, alex)).toEqual({
			put: {
				...draft({ othersCanControl: true, on: false }),
				owner: 'sam',
				ownerName: 'Sam',
				changedBy: 'Alex'
			}
		});
		const renamed = board.apply({ t: 'waypoint', op: 'set', id: 'wp-camp', name: 'Old oak' }, alex);
		expect(renamed).toMatchObject({ put: { name: 'Old oak', changedBy: 'Alex' } });
		// Its creator changing it clears the "changed by".
		const back = board.apply({ t: 'waypoint', op: 'set', id: 'wp-camp', on: true }, sam);
		expect(back).toMatchObject({ put: { on: true } });
		expect('put' in back && back.put.changedBy).toBeFalsy();
	});

	it('never lets a controller change who sees or controls it, or remove it', () => {
		const board = new WaypointBoard();
		board.apply(put(draft({ othersCanControl: true })), sam);
		expect(board.apply(put(draft({ othersCanControl: false })), alex)).toMatchObject({
			refused: 'rights'
		});
		expect(board.apply({ t: 'waypoint', op: 'remove', id: 'wp-camp' }, alex)).toMatchObject({
			refused: 'rights'
		});
		expect(board.size).toBe(1);
		// The world's owner may tidy up.
		expect(board.apply({ t: 'waypoint', op: 'remove', id: 'wp-camp' }, owner)).toEqual({
			remove: 'wp-camp'
		});
		expect(board.size).toBe(0);
	});

	it('says nothing changed for a repeat, and tells a late remover it is already gone', () => {
		const board = new WaypointBoard();
		board.apply(put(draft()), sam);
		expect(board.apply(put(draft()), sam)).toEqual({ unchanged: true });
		expect(board.apply({ t: 'waypoint', op: 'set', id: 'wp-camp', on: true }, sam)).toEqual({
			unchanged: true
		});
		expect(board.apply({ t: 'waypoint', op: 'remove', id: 'nope' }, sam)).toEqual({
			remove: 'nope'
		});
		expect(board.apply({ t: 'waypoint', op: 'set', id: 'nope', on: true }, sam)).toMatchObject({
			refused: 'gone',
			current: null
		});
	});

	it('caps public waypoints per player and per world', () => {
		const board = new WaypointBoard();
		for (let i = 0; i < MAX_PUBLIC_WAYPOINTS_PER_PLAYER; i++)
			expect(board.apply(put(draft({ id: `wp-sam-${i}` })), sam)).toHaveProperty('put');
		expect(board.apply(put(draft({ id: 'wp-sam-extra' })), sam)).toMatchObject({
			refused: 'limit'
		});
		for (let p = 0; board.size < MAX_PUBLIC_WAYPOINTS_PER_WORLD; p++) {
			const actor = { ...alex, playerId: `p${p}` };
			for (
				let i = 0;
				i < MAX_PUBLIC_WAYPOINTS_PER_PLAYER && board.size < MAX_PUBLIC_WAYPOINTS_PER_WORLD;
				i++
			)
				board.apply(put(draft({ id: `wp-${p}-${i}` })), actor);
		}
		expect(
			board.apply(put(draft({ id: 'wp-new-player' })), { ...alex, playerId: 'zed' })
		).toMatchObject({
			refused: 'limit'
		});
	});

	it('refuses a waypoint far from where the room last saw its creator', () => {
		const board = new WaypointBoard();
		expect(board.apply(put(draft({ x: 5000 })), sam)).toMatchObject({ refused: 'invalid' });
		// Position unknown (just joined, never moved): accepted.
		expect(board.apply(put(draft({ x: 5000 })), { ...sam, position: null })).toHaveProperty('put');
	});

	it('round-trips through its saved JSON, and survives a damaged record', () => {
		const board = new WaypointBoard();
		board.apply(put(draft()), sam);
		board.apply(put(draft({ id: 'wp-two', othersCanControl: true })), alex);
		board.apply({ t: 'waypoint', op: 'set', id: 'wp-two', on: false }, sam);
		const again = new WaypointBoard(board.toJson());
		expect(again.list()).toEqual(board.list());
		expect(new WaypointBoard('{nope').size).toBe(0);
		expect(new WaypointBoard('[{"id":"x"}]').size).toBe(0);
	});
});

describe('parsing waypoint messages', () => {
	it('cleans names and colours, and drops anything malformed', () => {
		const parsed = parseWaypointMessage({
			t: 'waypoint',
			op: 'put',
			waypoint: { ...draft(), name: '  Old\toak\u0000 ', colour: '#ABCDEF' }
		});
		expect(parsed).toEqual(put(draft({ name: 'Old oak', colour: '#abcdef' })));
		for (const bad of [
			{ ...draft(), id: 'a b' },
			{ ...draft(), name: '   ' },
			{ ...draft(), colour: 'red' },
			{ ...draft(), x: Number.NaN },
			{ ...draft(), z: 1e9 }
		])
			expect(parseWaypointMessage({ t: 'waypoint', op: 'put', waypoint: bad })).toBeNull();
		expect(parseWaypointMessage({ t: 'waypoint', op: 'set', id: 'wp-camp' })).toBeNull();
		expect(parseWaypointMessage({ t: 'waypoint', op: 'set', id: 'wp-camp', name: '' })).toBeNull();
		expect(
			parseClientMessage(JSON.stringify({ t: 'waypoint', op: 'remove', id: 'wp-camp' }))
		).toEqual({
			t: 'waypoint',
			op: 'remove',
			id: 'wp-camp'
		});
	});
});
