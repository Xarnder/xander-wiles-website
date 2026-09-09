import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldPackage } from '../WorldImportExport';
import { WorldManager } from '../WorldManager';
import { InMemoryWorldRepository, type WorldRepository } from '../WorldRepository';
import { captureWorldContent } from '../WorldSerializer';
import type { WorldDefinition } from '../WorldTypes';
import { defaultEnvironment, richWorld, runtimeFromWorld } from './worldFixtures';

let repository: InMemoryWorldRepository;
let manager: WorldManager;

beforeEach(() => {
	repository = new InMemoryWorldRepository();
	manager = new WorldManager(repository);
});

async function seed(world: WorldDefinition = richWorld()): Promise<WorldDefinition> {
	await repository.saveWorld(world);
	return world;
}

describe('createWorld', () => {
	it('persists immediately rather than waiting for the first autosave', async () => {
		const result = await manager.createWorld({
			name: 'Forest House',
			environment: defaultEnvironment()
		});
		expect(result.ok).toBe(true);

		// A world that only existed in memory until autosave fired would be lost by a refresh in its
		// first couple of seconds — so creation writes before it returns.
		const listed = await repository.listWorlds();
		expect(listed).toHaveLength(1);
		expect(listed[0].name).toBe('Forest House');
	});

	it('gives every world a distinct id even when the names are identical', async () => {
		const a = await manager.createWorld({ name: 'Same Name', environment: defaultEnvironment() });
		const b = await manager.createWorld({ name: 'Same Name', environment: defaultEnvironment() });
		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.value.id).not.toBe(b.value.id);
	});

	it('generates a readable seed when none is supplied, and keeps one that is', async () => {
		const generated = await manager.createWorld({ name: 'A', environment: defaultEnvironment() });
		const chosen = await manager.createWorld({
			name: 'B',
			seed: 'my-own-seed',
			environment: defaultEnvironment()
		});
		expect(generated.ok && generated.value.seed.length > 0).toBe(true);
		expect(chosen.ok && chosen.value.seed).toBe('my-own-seed');
	});
});

describe('openWorld', () => {
	it('loads a stored world and makes it current', async () => {
		const world = await seed();
		const result = await manager.openWorld(world.id);
		expect(result.ok).toBe(true);
		expect(manager.getCurrentWorldId()).toBe(world.id);
	});

	it('refuses a world whose stored data is structurally broken, instead of loading it partially', async () => {
		const broken = richWorld();
		// A wall referencing a foundation that isn't in the file would otherwise load as a building
		// hanging off nothing.
		broken.buildings[0].walls[0].foundationId = 'missing-foundation';
		await repository.saveWorld(broken);

		const result = await manager.openWorld(broken.id);
		expect(result.ok).toBe(false);
		expect(manager.getCurrentWorldId()).toBeNull();
	});
});

describe('renameWorld', () => {
	it('changes the name without changing the world id', async () => {
		const world = await seed();
		const result = await manager.renameWorld(world.id, '  Mountain Cabin  ');
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.id).toBe(world.id);
		expect(result.value.name).toBe('Mountain Cabin');
		const stored = await repository.loadWorld(world.id);
		expect(stored?.name).toBe('Mountain Cabin');
	});

	it('rejects an empty name rather than storing an unnamed world', async () => {
		const world = await seed();
		const result = await manager.renameWorld(world.id, '   ');
		expect(result.ok).toBe(false);
		const stored = await repository.loadWorld(world.id);
		expect(stored?.name).toBe('Forest House');
	});
});

describe('duplicateWorld', () => {
	it('creates an independent copy with a new id, fresh timestamps and the same content', async () => {
		const world = await seed();
		const result = await manager.duplicateWorld(world.id);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const copy = result.value;
		expect(copy.id).not.toBe(world.id);
		expect(copy.name).toBe('Forest House Copy');
		expect(copy.saveRevision).toBe(1);
		expect(copy.createdAt).not.toBe(world.createdAt);
		expect(copy.foundations).toEqual(world.foundations);
		expect(copy.buildings).toEqual(world.buildings);
		expect(copy.proceduralOverrides).toEqual(world.proceduralOverrides);
	});

	it('deep-copies, so editing the copy cannot change the original', async () => {
		const world = await seed();
		const result = await manager.duplicateWorld(world.id);
		if (!result.ok) return;

		result.value.foundations[0].topY = 999;
		result.value.buildings[0].walls[0].openings.push({
			id: 'x',
			type: 'window',
			minU: 0,
			maxU: 1,
			minY: 0,
			maxY: 1
		});
		await repository.saveWorld(result.value);

		const original = await repository.loadWorld(world.id);
		expect(original?.foundations[0].topY).toBe(12.5);
		expect(original?.buildings[0].walls[0].openings).toHaveLength(2);
	});

	it('copies the thumbnail across too', async () => {
		const world = await seed();
		await repository.putThumbnail(world.id, new Blob(['image-bytes'], { type: 'image/webp' }));

		const result = await manager.duplicateWorld(world.id);
		if (!result.ok) return;
		expect(await repository.getThumbnail(result.value.id)).toBeDefined();
	});
});

describe('deleteWorld', () => {
	it('removes the world, its metadata and its thumbnail together', async () => {
		const world = await seed();
		await repository.putThumbnail(world.id, new Blob(['bytes']));

		const result = await manager.deleteWorld(world.id);
		expect(result.ok).toBe(true);
		expect(await repository.loadWorld(world.id)).toBeUndefined();
		expect(await repository.getMetadata(world.id)).toBeUndefined();
		expect(await repository.getThumbnail(world.id)).toBeUndefined();
		expect(await repository.listWorlds()).toHaveLength(0);
	});

	it('clears the current world when the open one is deleted', async () => {
		const world = await seed();
		await manager.openWorld(world.id);
		await manager.deleteWorld(world.id);
		expect(manager.getCurrentWorldId()).toBeNull();
	});
});

describe('saveCurrentWorld', () => {
	it('writes a captured snapshot and bumps the revision', async () => {
		const world = await seed();
		await manager.openWorld(world.id);

		const content = captureWorldContent(runtimeFromWorld(world));
		const result = await manager.saveCurrentWorld(content);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.saveRevision).toBe(world.saveRevision + 1);
	});

	it('keeps the in-memory world intact when storage fails, so the session is not lost', async () => {
		const world = await seed();
		await manager.openWorld(world.id);
		const before = manager.getCurrentWorld();

		const failing: WorldRepository = {
			...repository,
			listWorlds: () => repository.listWorlds(),
			getMetadata: (id) => repository.getMetadata(id),
			loadWorld: (id) => repository.loadWorld(id),
			deleteWorld: (id) => repository.deleteWorld(id),
			getThumbnail: (id) => repository.getThumbnail(id),
			putThumbnail: (id, blob) => repository.putThumbnail(id, blob),
			estimateStorage: () => repository.estimateStorage(),
			saveWorld: () => Promise.reject(new Error('QuotaExceededError'))
		};
		const failingManager = new WorldManager(failing);
		await failingManager.openWorld(world.id);

		const content = captureWorldContent(runtimeFromWorld(world));
		const result = await failingManager.saveCurrentWorld(content);
		expect(result.ok).toBe(false);
		expect(failingManager.getCurrentWorld()).not.toBeNull();
		expect(before?.id).toBe(world.id);
	});
});

describe('importWorld', () => {
	it('imports a valid package as a new world', async () => {
		const world = richWorld({ id: 'exported-world' });
		const bytes = await createWorldPackage(world);

		const result = await manager.importWorld(bytes);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.name).toBe('Forest House');
		expect((await repository.listWorlds()).map((w) => w.id)).toContain(result.value.id);
	});

	it('imports as a copy instead of silently overwriting an existing world with the same id', async () => {
		const existing = await seed(richWorld({ id: 'shared-id', name: 'My Original' }));
		const incoming = richWorld({ id: 'shared-id', name: 'Their Copy' });
		incoming.foundations = [];
		incoming.buildings = [];
		incoming.buildingLevels = [];
		incoming.furniture = [];
		incoming.player = { ...incoming.player, activeFoundationId: undefined };

		const result = await manager.importWorld(await createWorldPackage(incoming));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value.id).not.toBe('shared-id');
		expect(result.value.name).toContain('Imported');

		// The original must be exactly as it was — this is the difference between an import feature
		// and a data-loss bug.
		const original = await repository.loadWorld(existing.id);
		expect(original?.name).toBe('My Original');
		expect(original?.foundations).toHaveLength(1);
		expect(await repository.listWorlds()).toHaveLength(2);
	});

	it('rejects a malformed package without creating anything', async () => {
		const result = await manager.importWorld(new Uint8Array([1, 2, 3, 4, 5]));
		expect(result.ok).toBe(false);
		expect(await repository.listWorlds()).toHaveLength(0);
	});

	it('restores the thumbnail from the package', async () => {
		const world = richWorld({ id: 'with-thumb' });
		const bytes = await createWorldPackage(world, new Blob(['thumb'], { type: 'image/webp' }));
		const result = await manager.importWorld(bytes);
		if (!result.ok) return;
		expect(await repository.getThumbnail(result.value.id)).toBeDefined();
	});
});

describe('exportWorld', () => {
	it('exports the stored world with its thumbnail', async () => {
		const world = await seed();
		await repository.putThumbnail(world.id, new Blob(['thumb']));

		const result = await manager.exportWorld(world.id);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.world.id).toBe(world.id);
		expect(result.value.thumbnail).toBeDefined();
	});

	it('reports an error for a world that does not exist', async () => {
		const result = await manager.exportWorld('nope');
		expect(result.ok).toBe(false);
	});
});

describe('storage estimate', () => {
	it('passes the repository estimate through for the Worlds UI', async () => {
		const spy = vi
			.spyOn(repository, 'estimateStorage')
			.mockResolvedValue({ usage: 10, quota: 100 });
		expect(await manager.estimateStorage()).toEqual({ usage: 10, quota: 100 });
		expect(spy).toHaveBeenCalled();
	});
});
