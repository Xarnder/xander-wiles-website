import { describe, expect, it } from 'vitest';
import { migrateWorld } from '../WorldMigrationManager';
import { CURRENT_WORLD_SCHEMA_VERSION, ONLINE_COMPATIBLE_SCHEMA_VERSIONS } from '../WorldTypes';
import { validateWorldDefinition as validateWorld } from '../WorldValidation';
import { richWorld } from './worldFixtures';

describe('basements and joins in the world schema (v11)', () => {
	it('is schema 11, and online worlds at 9, 10 and 11 open', () => {
		expect(CURRENT_WORLD_SCHEMA_VERSION).toBe(11);
		expect([...ONLINE_COMPATIBLE_SCHEMA_VERSIONS]).toContain(11);
	});

	it('migrates a schema-10 world unchanged apart from its version', () => {
		const world = { ...richWorld(), schemaVersion: 10 };
		const result = migrateWorld(structuredClone(world));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({ ...world, schemaVersion: 11 });
	});

	it('round-trips a basement, a join and basement slab roles through validation', () => {
		const world = richWorld();
		const foundation = world.foundations[0];
		foundation.basement = { storeys: 2, storeyHeight: 3 };
		foundation.joinId = foundation.id;
		const building = world.buildings.find((b) => b.foundationId === foundation.id)!;
		building.slabs.push({
			id: 'deck',
			foundationId: foundation.id,
			type: 'ceiling',
			role: 'deck',
			levelIndex: -1,
			localY: 0,
			thickness: 0.25,
			points: [
				{ gridX: 0, gridZ: 0 },
				{ gridX: 4, gridZ: 0 },
				{ gridX: 4, gridZ: 4 },
				{ gridX: 0, gridZ: 4 }
			],
			openings: []
		});
		const result = validateWorld(structuredClone(world));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.foundations[0].basement).toEqual({ storeys: 2, storeyHeight: 3 });
		expect(result.value.foundations[0].joinId).toBe(foundation.id);
		expect(result.value.buildings[0].slabs.some((s) => s.role === 'deck')).toBe(true);
	});

	it('rejects a bad basement, joinId or slab role', () => {
		for (const patch of [
			(w: ReturnType<typeof richWorld>) =>
				(w.foundations[0].basement = { storeys: 4, storeyHeight: 3 }),
			(w: ReturnType<typeof richWorld>) =>
				(w.foundations[0].basement = { storeys: 1, storeyHeight: 9 }),
			(w: ReturnType<typeof richWorld>) => (w.foundations[0].joinId = ''),
			(w: ReturnType<typeof richWorld>) =>
				((w.buildings[0].slabs[0] as unknown as { role: string }).role = 'attic')
		]) {
			const world = richWorld();
			patch(world);
			expect(validateWorld(world).ok).toBe(false);
		}
	});
});
