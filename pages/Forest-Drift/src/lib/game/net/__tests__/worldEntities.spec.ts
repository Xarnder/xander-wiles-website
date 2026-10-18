import { describe, expect, it } from 'vitest';
import { getDefaultWorldDefinition } from '../../world/DefaultWorld';
import {
	applyOps,
	canonical,
	cascadeOf,
	diffRows,
	entityKey,
	flattenWorld,
	rowChecksumPart,
	rowMap,
	unflattenWorld,
	type AuthoredContent,
	type EntityRow
} from '../worldEntities';

/** The default world (wall paths, slabs, stairs, roofs) plus one straight wall with a door. */
function content(): AuthoredContent {
	const world = getDefaultWorldDefinition();
	const building = world.buildings[0]!;
	building.walls.push({
		id: 'straight-wall',
		foundationId: building.foundationId,
		startGridX: 0,
		startGridZ: 0,
		endGridX: 4,
		endGridZ: 0,
		baseY: 0,
		height: 3,
		thickness: 0.2,
		openings: [{ id: 'door-1', type: 'door', minU: 0.5, maxU: 1.5, minY: 0, maxY: 2.1 }],
		beams: []
	});
	return {
		foundations: world.foundations,
		buildings: world.buildings,
		buildingLevels: world.buildingLevels,
		barriers: world.barriers,
		furniture: world.furniture,
		miniBuilds: world.miniBuilds,
		musicTrees: world.musicTrees,
		musicPlants: world.musicPlants,
		proceduralOverrides: world.proceduralOverrides
	};
}

/** Sorts every id-carrying array so two equivalent contents compare equal. */
function normalise(value: unknown): unknown {
	if (Array.isArray(value)) {
		const items = value.map(normalise);
		const keyOf = (item: unknown) =>
			item && typeof item === 'object'
				? String(
						(item as Record<string, unknown>).id ?? (item as Record<string, unknown>).foundationId
					)
				: String(item);
		// Wall-path segments are positional; everything else is a set.
		if (items.every((item) => item && typeof item === 'object' && 'openings' in (item as object))) {
			const looksLikeSegments = items.every((item) => !('foundationId' in (item as object)));
			if (looksLikeSegments) return items;
		}
		return [...items].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, field] of Object.entries(value)) {
			// An optional child list that's absent and one that's empty mean the same (`?? []`).
			if (field === undefined || (Array.isArray(field) && field.length === 0)) continue;
			out[key] = normalise(field);
		}
		return out;
	}
	return value;
}

describe('world entities', () => {
	it('flattens the default world into rows and rebuilds it unchanged', () => {
		const original = content();
		const rows = flattenWorld(original);
		expect(rows.length).toBeGreaterThan(50);
		const kinds = new Set(rows.map((row) => row.kind));
		for (const kind of [
			'foundation',
			'wall',
			'wallOpening',
			'wallPath',
			'pathSegment',
			'pathOpening',
			'slab',
			'slabOpening',
			'buildingLevel'
		]) {
			expect(kinds.has(kind as EntityRow['kind'])).toBe(true);
		}
		const keys = rows.map((row) => entityKey(row.kind, row.id, row.parent));
		expect(new Set(keys).size).toBe(keys.length);
		const rebuilt = unflattenWorld(rows);
		// Buildings with no parts at all aren't kept (nothing to rebuild them from).
		const originalBuildings = original.buildings.filter((building) =>
			Object.values(building).some((part) => Array.isArray(part) && part.length > 0)
		);
		expect(canonical(normalise(rebuilt))).toBe(
			canonical(normalise({ ...original, buildings: originalBuildings }))
		);
	});

	it('rebuilds the same arrays whatever order the rows come in', () => {
		const rows = flattenWorld(content());
		const shuffled = [...rows].reverse();
		expect(canonical(unflattenWorld(shuffled))).toBe(canonical(unflattenWorld(rows)));
	});

	it('diffs edits into small ops that reproduce them exactly', () => {
		const before = content();
		const after = structuredClone(before);
		const wall = after.buildings.flatMap((b) => b.walls)[0]!;
		wall.material = { color: '#ff0000' } as never; // repaint
		wall.openings.push({
			id: 'new-window',
			type: 'window',
			minU: 0.1,
			maxU: 0.9,
			minY: 1,
			maxY: 2
		});
		after.foundations.push({
			id: 'new-foundation',
			minGridX: 100,
			maxGridX: 104,
			minGridZ: 100,
			maxGridZ: 104,
			topY: 3,
			bottomY: 1
		});
		const removedSlab = after.buildings.flatMap((b) => b.slabs)[0]!;
		for (const building of after.buildings) {
			building.slabs = building.slabs.filter((slab: { id: string }) => slab.id !== removedSlab.id);
		}

		const beforeRows = rowMap(flattenWorld(before));
		const afterRows = rowMap(flattenWorld(after));
		const ops = diffRows(beforeRows, afterRows);
		expect(ops.map((op) => `${op.op} ${op.kind}`).sort()).toEqual([
			'add foundation',
			'add wallOpening',
			'del slab',
			'patch wall'
		]);
		const patch = ops.find((op) => op.op === 'patch')!;
		expect(patch.op === 'patch' && Object.keys(patch.set ?? {})).toEqual(['material']);

		const replica = rowMap(flattenWorld(before));
		applyOps(replica, ops);
		expect(canonical(unflattenWorld(replica.values()))).toBe(
			canonical(unflattenWorld(afterRows.values()))
		);
	});

	it("ignores a foundation's re-grounded bottom, which every player computes for themselves", () => {
		const before = content();
		const after = structuredClone(before);
		after.foundations[0]!.bottomY -= 0.37;
		expect(diffRows(rowMap(flattenWorld(before)), rowMap(flattenWorld(after)))).toEqual([]);
	});

	it('removing a field (paint back to default) travels as an unset', () => {
		const before = content();
		const wall = before.buildings.flatMap((b) => b.walls)[0]!;
		wall.material = { color: '#00ff00' } as never;
		const after = structuredClone(before);
		delete after.buildings.flatMap((b) => b.walls)[0]!.material;
		const [op] = diffRows(rowMap(flattenWorld(before)), rowMap(flattenWorld(after)));
		expect(op).toMatchObject({ op: 'patch', kind: 'wall', unset: ['material'] });
	});

	it("a foundation's cascade reaches everything standing on it, and their parts", () => {
		const rows = rowMap(flattenWorld(content()));
		const foundation = [...rows.values()].find((row) => row.kind === 'foundation')!;
		const cascade = cascadeOf(rows, entityKey('foundation', foundation.id));
		const kinds = new Set([...cascade].map((key) => key.split(':')[0]));
		expect(kinds.has('wall') || kinds.has('wallPath')).toBe(true);
		expect(kinds.has('wallOpening') || kinds.has('pathOpening')).toBe(true);
		// Deleting the foundation and applying the cascade leaves nothing that points at it.
		applyOps(
			rows,
			[...cascade].map((key) => {
				const row = rows.get(key)!;
				return { op: 'del' as const, kind: row.kind, id: row.id, parent: row.parent };
			})
		);
		for (const row of rows.values()) expect(row.data.foundationId).not.toBe(foundation.id);
	});

	it('checksums are order-independent and follow revisions', () => {
		const a = rowChecksumPart('wall:1', 3) ^ rowChecksumPart('wall:2', 5);
		const b = rowChecksumPart('wall:2', 5) ^ rowChecksumPart('wall:1', 3);
		expect(a).toBe(b);
		expect(rowChecksumPart('wall:1', 4)).not.toBe(rowChecksumPart('wall:1', 3));
	});
});
