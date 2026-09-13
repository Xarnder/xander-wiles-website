import { describe, expect, it } from 'vitest';
import {
	DEFAULT_WORLD_ID,
	DEFAULT_WORLD_NAME,
	DEFAULT_WORLD_SEED,
	getDefaultWorldBaseMetadata,
	getDefaultWorldDefinition,
	getDefaultWorldPackageBytes,
	getDefaultWorldThumbnailBlob
} from '../DefaultWorld';
import { WorldManager } from '../WorldManager';
import { InMemoryWorldRepository } from '../WorldRepository';

describe('DefaultWorld', () => {
	it('provides valid packaged bytes and parses cleanly', () => {
		const bytes = getDefaultWorldPackageBytes();
		expect(bytes.byteLength).toBeGreaterThan(1000);

		const world = getDefaultWorldDefinition();
		expect(world.id).toBe(DEFAULT_WORLD_ID);
		expect(world.name).toBe(DEFAULT_WORLD_NAME);
		expect(world.seed).toBe(DEFAULT_WORLD_SEED);
		expect(world.buildings.length).toBeGreaterThan(0);
		expect(world.foundations.length).toBeGreaterThan(0);
	});

	it('provides a thumbnail blob', () => {
		const blob = getDefaultWorldThumbnailBlob();
		expect(blob.type).toBe('image/webp');
		expect(blob.size).toBeGreaterThan(1000);
	});

	it('provides base metadata', () => {
		const meta = getDefaultWorldBaseMetadata();
		expect(meta.id).toBe(DEFAULT_WORLD_ID);
		expect(meta.name).toBe(DEFAULT_WORLD_NAME);
		expect(meta.seed).toBe(DEFAULT_WORLD_SEED);
		expect(meta.byteSize).toBeGreaterThan(0);
	});

	it('auto-seeds default world when opened on a clean repository', async () => {
		const repo = new InMemoryWorldRepository();
		const manager = new WorldManager(repo);

		// Repository is empty initially
		expect(await repo.loadWorld(DEFAULT_WORLD_ID)).toBeUndefined();
		expect(await manager.listWorlds()).toEqual([]);

		// Open default world
		const result = await manager.openWorld(DEFAULT_WORLD_ID);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.id).toBe(DEFAULT_WORLD_ID);
		expect(result.value.name).toBe(DEFAULT_WORLD_NAME);

		// Now it is persisted in the repository
		const stored = await repo.loadWorld(DEFAULT_WORLD_ID);
		expect(stored).toBeDefined();
		expect(stored?.id).toBe(DEFAULT_WORLD_ID);

		// But listWorlds() still excludes it to keep user worlds clean
		expect(await manager.listWorlds()).toEqual([]);

		// getDefaultWorldMetadata() finds it
		const meta = await manager.getDefaultWorldMetadata();
		expect(meta.id).toBe(DEFAULT_WORLD_ID);
	});

	it('prevents deletion of the default world', async () => {
		const repo = new InMemoryWorldRepository();
		const manager = new WorldManager(repo);

		await manager.openWorld(DEFAULT_WORLD_ID);
		const del = await manager.deleteWorld(DEFAULT_WORLD_ID);
		expect(del.ok).toBe(false);
		if (!del.ok) {
			expect(del.error).toContain('cannot be deleted');
		}

		// Still exists
		expect(await repo.loadWorld(DEFAULT_WORLD_ID)).toBeDefined();
	});

	it('allows resetting the default world to pristine state', async () => {
		const repo = new InMemoryWorldRepository();
		const manager = new WorldManager(repo);

		await manager.openWorld(DEFAULT_WORLD_ID);

		// Modify the world in storage
		const current = manager.getCurrentWorld()!;
		current.name = 'Modified Default';
		await manager.saveCurrentWorld({
			...current,
			buildings: []
		});

		const modified = await repo.loadWorld(DEFAULT_WORLD_ID);
		expect(modified?.buildings.length).toBe(0);

		// Reset to default
		const reset = await manager.resetDefaultWorld();
		expect(reset.ok).toBe(true);

		const restored = await repo.loadWorld(DEFAULT_WORLD_ID);
		expect(restored?.buildings.length).toBeGreaterThan(0);
		expect(restored?.name).toBe(DEFAULT_WORLD_NAME);
	});

	it('exports default world package even before local save', async () => {
		const repo = new InMemoryWorldRepository();
		const manager = new WorldManager(repo);

		const exp = await manager.exportWorld(DEFAULT_WORLD_ID);
		expect(exp.ok).toBe(true);
		if (!exp.ok) return;
		expect(exp.value.world.id).toBe(DEFAULT_WORLD_ID);
		expect(exp.value.thumbnail).toBeDefined();
	});

	it('duplicates default world even before local save', async () => {
		const repo = new InMemoryWorldRepository();
		const manager = new WorldManager(repo);

		const dup = await manager.duplicateWorld(DEFAULT_WORLD_ID);
		expect(dup.ok).toBe(true);
		if (!dup.ok) return;
		expect(dup.value.name).toBe(`${DEFAULT_WORLD_NAME} Copy`);
		expect(dup.value.id).not.toBe(DEFAULT_WORLD_ID);

		const list = await manager.listWorlds();
		expect(list).toHaveLength(1);
		expect(list[0].name).toBe(`${DEFAULT_WORLD_NAME} Copy`);
	});
});

