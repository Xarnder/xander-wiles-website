import { describe, expect, it } from 'vitest';
import { WorldStore, publishedRows, type BatchAuthor } from '../WorldStore';
import {
	entityKey,
	flattenWorld,
	rowChecksumPart,
	formatChecksum,
	type WorldOp
} from '../worldEntities';

const OWNER: BatchAuthor = { playerId: 'player-owner', name: 'Owner', role: 'owner' };
const SAM: BatchAuthor = { playerId: 'player-sam', name: 'Sam', role: 'editor' };
const ALEX: BatchAuthor = { playerId: 'player-alex', name: 'Alex', role: 'editor' };
const VISITOR: BatchAuthor = { playerId: 'player-visit', name: 'Visitor', role: 'viewer' };

/** A published world: one foundation with one wall (and a door in it). */
function store() {
	const rows = flattenWorld({
		foundations: [
			{ id: 'f1', minGridX: 0, maxGridX: 10, minGridZ: 0, maxGridZ: 10, topY: 1, bottomY: 0 }
		],
		buildings: [
			{
				foundationId: 'f1',
				walls: [
					{
						id: 'w1',
						foundationId: 'f1',
						startGridX: 0,
						startGridZ: 0,
						endGridX: 10,
						endGridZ: 0,
						baseY: 0,
						height: 3,
						thickness: 0.2,
						openings: [{ id: 'door', type: 'door', minU: 0, maxU: 1, minY: 0, maxY: 2 }]
					}
				],
				wallPaths: [],
				slabs: [],
				stairs: [],
				roofs: []
			}
		],
		buildingLevels: [],
		barriers: [],
		furniture: [],
		miniBuilds: { definitions: [], instances: [] },
		musicTrees: [],
		musicPlants: [],
		proceduralOverrides: { removedTreeIds: [] }
	} as never);
	return new WorldStore({ rows: publishedRows(rows), seq: 1, epoch: 1 });
}

const window = (id: string, minU: number, maxU: number): WorldOp => ({
	op: 'add',
	kind: 'wallOpening',
	id,
	parent: 'w1',
	data: { id, type: 'window', minU, maxU, minY: 1, maxY: 2 }
});

describe('WorldStore', () => {
	it.each([
		{ set: null },
		{ unset: [null] },
		{ seen: null },
		{ seen: { height: -1 } },
		{ set: JSON.parse('{"__proto__":{"polluted":true}}') },
		{ unset: ['constructor'] }
	])('refuses malformed patches atomically: %j', (fields) => {
		const world = store();
		const before = world.checksum;
		const result = world.applyBatch(SAM, [
			window('valid-first-op', 2, 3),
			{ op: 'patch', kind: 'wall', id: 'w1', ...fields } as unknown as WorldOp
		]);
		expect(result).toMatchObject({ ok: false, reason: 'invalid' });
		expect(world.checksum).toBe(before);
		expect(world.seq).toBe(1);
	});

	it('commits additions in order, with the creator and a revision', () => {
		const world = store();
		const result = world.applyBatch(SAM, [window('win-1', 2, 3)]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.seq).toBe(2);
		expect(result.ops[0]).toMatchObject({
			op: 'add',
			id: 'win-1',
			rev: 2,
			createdBy: 'player-sam'
		});
		expect(world.get(entityKey('wallOpening', 'win-1', 'w1'))!.createdBy).toBe('player-sam');
	});

	it('refuses visitors', () => {
		const result = store().applyBatch(VISITOR, [window('win-1', 2, 3)]);
		expect(result).toMatchObject({ ok: false, reason: 'role' });
	});

	it('two windows in the same spot at the same moment: the later one is refused', () => {
		const world = store();
		expect(world.applyBatch(SAM, [window('win-sam', 2, 3)]).ok).toBe(true);
		const later = world.applyBatch(ALEX, [window('win-alex', 2.5, 3.5)]);
		expect(later).toMatchObject({
			ok: false,
			reason: 'fit',
			conflicts: [{ kind: 'wallOpening', id: 'win-sam', by: 'player-sam' }]
		});
		// Side by side is fine.
		expect(world.applyBatch(ALEX, [window('win-alex', 3, 4)]).ok).toBe(true);
	});

	it('adding to something that was just removed is refused as gone', () => {
		const world = store();
		expect(world.applyBatch(OWNER, [{ op: 'del', kind: 'wall', id: 'w1' }]).ok).toBe(true);
		expect(world.applyBatch(SAM, [window('win-1', 2, 3)])).toMatchObject({
			ok: false,
			reason: 'gone'
		});
	});

	it('the same field changed by two people: later wins, and the earlier one is told', () => {
		const world = store();
		const paint = (who: BatchAuthor, colour: string, seen: number): WorldOp => ({
			op: 'patch',
			kind: 'wall',
			id: 'w1',
			set: { material: { type: 'color', color: colour } },
			seen: { material: seen }
		});
		const first = world.applyBatch(SAM, [paint(SAM, '#ff0000', 0)]);
		expect(first.ok && first.overwritten).toEqual([]);
		// Alex hadn't seen Sam's change (seen 0 < rev 2): Alex wins, Sam hears about it.
		const second = world.applyBatch(ALEX, [paint(ALEX, '#0000ff', 0)]);
		expect(second.ok && second.overwritten).toEqual([
			{ kind: 'wall', id: 'w1', field: 'material', previousBy: 'player-sam' }
		]);
		expect(world.get('wall:w1')!.data.material).toEqual({ type: 'color', color: '#0000ff' });
		// Different fields of the same wall never clash.
		const height = world.applyBatch(SAM, [
			{ op: 'patch', kind: 'wall', id: 'w1', set: { height: 4 }, seen: { height: 0 } }
		]);
		expect(height.ok && height.overwritten).toEqual([]);
	});

	it('only the creator or the owner deletes (Q4-C)', () => {
		const world = store();
		world.applyBatch(SAM, [window('win-sam', 2, 3)]);
		expect(
			world.applyBatch(ALEX, [{ op: 'del', kind: 'wallOpening', id: 'win-sam', parent: 'w1' }])
		).toMatchObject({ ok: false, reason: 'rights' });
		expect(
			world.applyBatch(SAM, [{ op: 'del', kind: 'wallOpening', id: 'win-sam', parent: 'w1' }]).ok
		).toBe(true);
		// Published content is the owner's.
		expect(world.applyBatch(SAM, [{ op: 'del', kind: 'wall', id: 'w1' }])).toMatchObject({
			ok: false,
			reason: 'rights'
		});
	});

	it("deleting your own thing that holds someone else's addition needs their names confirmed (F2-B)", () => {
		const world = store();
		world.applyBatch(SAM, [
			{
				op: 'add',
				kind: 'wall',
				id: 'w2',
				data: {
					id: 'w2',
					foundationId: 'f1',
					startGridX: 0,
					startGridZ: 5,
					endGridX: 10,
					endGridZ: 5,
					baseY: 0,
					height: 3,
					thickness: 0.2
				}
			}
		]);
		world.applyBatch(ALEX, [
			{
				op: 'add',
				kind: 'wallOpening',
				id: 'alex-window',
				parent: 'w2',
				data: { id: 'alex-window', type: 'window', minU: 2, maxU: 3, minY: 1, maxY: 2 }
			}
		]);
		const unconfirmed = world.applyBatch(SAM, [{ op: 'del', kind: 'wall', id: 'w2' }]);
		expect(unconfirmed).toMatchObject({
			ok: false,
			reason: 'confirmNeeded',
			conflicts: [{ kind: 'wallOpening', id: 'alex-window', by: 'player-alex' }]
		});
		const confirmed = world.applyBatch(SAM, [
			{
				op: 'del',
				kind: 'wall',
				id: 'w2',
				confirm: [entityKey('wallOpening', 'alex-window', 'w2')]
			}
		]);
		expect(confirmed.ok).toBe(true);
		expect(world.get('wall:w2')).toBeUndefined();
		expect(world.get(entityKey('wallOpening', 'alex-window', 'w2'))).toBeUndefined();
	});

	it('deleting a foundation removes what stands on it, and says so in the commit', () => {
		const world = store();
		const result = world.applyBatch(OWNER, [{ op: 'del', kind: 'foundation', id: 'f1' }]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.ops.map((op) => `${op.op} ${op.kind} ${op.id}`)).toEqual([
			'del foundation f1',
			'del wall w1'
		]);
		expect(world.size).toBe(0);
	});

	it('a refused batch changes nothing (all or nothing)', () => {
		const world = store();
		world.applyBatch(SAM, [window('win-sam', 2, 3)]);
		const before = world.checksum;
		const result = world.applyBatch(ALEX, [window('ok-window', 5, 6), window('clash', 2, 3)]);
		expect(result.ok).toBe(false);
		expect(world.checksum).toBe(before);
		expect(world.get(entityKey('wallOpening', 'ok-window', 'w1'))).toBeUndefined();
	});

	it('keeps a checksum of every row and revision', () => {
		const world = store();
		world.applyBatch(SAM, [window('win-1', 2, 3)]);
		let expected = 0;
		for (const row of world.allRows()) {
			expected ^= rowChecksumPart(entityKey(row.kind, row.id, row.parent), row.rev);
		}
		expect(world.checksum).toBe(formatChecksum(expected));
	});

	it('refuses two foundations on the same ground, and two records of one storey', () => {
		const world = store();
		expect(
			world.applyBatch(SAM, [
				{
					op: 'add',
					kind: 'foundation',
					id: 'f2',
					data: {
						id: 'f2',
						minGridX: 5,
						maxGridX: 15,
						minGridZ: 5,
						maxGridZ: 15,
						topY: 1,
						bottomY: 0
					}
				}
			])
		).toMatchObject({ ok: false, reason: 'fit' });
		const level = (id: string): WorldOp => ({
			op: 'add',
			kind: 'buildingLevel',
			id,
			data: { id, foundationId: 'f1', index: 1, baseY: 3, wallHeight: 3 }
		});
		expect(world.applyBatch(SAM, [level('l-sam')]).ok).toBe(true);
		expect(world.applyBatch(ALEX, [level('l-alex')])).toMatchObject({ ok: false, reason: 'fit' });
	});

	it('refuses malformed ops', () => {
		const world = store();
		expect(
			world.applyBatch(SAM, [{ op: 'add', kind: 'nope', id: 'x', data: {} } as never])
		).toMatchObject({
			ok: false,
			reason: 'invalid'
		});
		expect(
			world.applyBatch(SAM, [{ op: 'add', kind: 'wallOpening', id: 'x', data: {} } as never])
		).toMatchObject({ ok: false, reason: 'invalid' });
	});
});

describe('terrain authority', () => {
	it('rejects malformed tiles and edits inside a fixed building footprint', () => {
		const world = store();
		const apply = (points: unknown) =>
			world.applyBatch(OWNER, [
				{ op: 'add', kind: 'terrainTile', id: '0,0', data: { version: 1, spacing: 2, points } }
			]);
		expect(apply([[1, 1, NaN]])).toMatchObject({ ok: false, reason: 'invalid' });
		expect(apply([[1, 1, 0]])).toMatchObject({ ok: false, reason: 'fit' });
		expect(world.seq).toBe(1);
	});
	it('rejects stale terrain patches instead of overwriting a concurrent stroke', () => {
		const world = store();
		expect(
			world.applyBatch(SAM, [
				{
					op: 'add',
					kind: 'terrainTile',
					id: '2,0',
					data: { version: 1, spacing: 2, points: [[32, 0, 1]] }
				}
			]).ok
		).toBe(true);
		expect(
			world.applyBatch(SAM, [
				{
					op: 'patch',
					kind: 'terrainTile',
					id: '2,0',
					set: { points: [[32, 0, 1.5]] },
					seen: { points: 0 }
				}
			]).ok
		).toBe(true);
		expect(
			world.applyBatch(ALEX, [
				{
					op: 'patch',
					kind: 'terrainTile',
					id: '2,0',
					set: { points: [[32, 0, 2]] },
					seen: { points: 0 }
				}
			])
		).toMatchObject({ ok: false, reason: 'fit' });
	});
});
