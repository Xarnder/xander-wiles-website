import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_WORLD_ID,
	DEFAULT_WORLD_REVISION,
	getDefaultWorldDefinition,
	markDefaultWorldRevision,
	storedDefaultWorldRevision
} from '../DefaultWorld';
import { WorldManager } from '../WorldManager';
import type { WorldRepository } from '../WorldRepository';
import type { WorldDefinition } from '../WorldTypes';

/** In-memory repository: just enough of `WorldRepository` for opening worlds. */
function memoryRepository(initial: WorldDefinition[]) {
	const worlds = new Map(initial.map((w) => [w.id, structuredClone(w)]));
	return {
		worlds,
		loadWorld: async (id: string) => structuredClone(worlds.get(id)),
		saveWorld: async (world: WorldDefinition) => void worlds.set(world.id, structuredClone(world)),
		putThumbnail: async () => undefined,
		getThumbnail: async () => undefined,
		getMetadata: async () => undefined,
		listWorlds: async () => []
	} as unknown as WorldRepository & { worlds: Map<string, WorldDefinition> };
}

describe('Main World revision (biome-specific creatures Q6)', () => {
	const store = new Map<string, string>();
	beforeEach(() => {
		store.clear();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v)
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it('counts a copy stored before revisions as revision 1, and records the new one', () => {
		expect(storedDefaultWorldRevision()).toBe(1);
		markDefaultWorldRevision();
		expect(storedDefaultWorldRevision()).toBe(DEFAULT_WORLD_REVISION);
	});

	it('replaces an older stored Main World with the bundled one, once, leaving other worlds alone', async () => {
		const old = getDefaultWorldDefinition();
		old.environment.biomes.enabled = false;
		old.name = 'Main World (edited)';
		const other = { ...getDefaultWorldDefinition(), id: 'another-world', name: 'Mine' };
		const repository = memoryRepository([old, other]);
		const manager = new WorldManager(repository);

		const opened = await manager.openWorld(DEFAULT_WORLD_ID);
		expect(opened.ok).toBe(true);
		expect(opened.ok && opened.value.environment.biomes.enabled).toBe(true);
		expect(repository.worlds.get(DEFAULT_WORLD_ID)!.environment.biomes.enabled).toBe(true);
		expect(storedDefaultWorldRevision()).toBe(DEFAULT_WORLD_REVISION);
		expect(repository.worlds.get('another-world')!.name).toBe('Mine');

		// Once current, the player's own changes are kept (e.g. switching biomes off on purpose).
		const mine = repository.worlds.get(DEFAULT_WORLD_ID)!;
		mine.environment.biomes.enabled = false;
		const again = await manager.openWorld(DEFAULT_WORLD_ID);
		expect(again.ok && again.value.environment.biomes.enabled).toBe(false);
	});

	it('takes the stored copy as current when storage cannot be read', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			}
		});
		expect(storedDefaultWorldRevision()).toBe(DEFAULT_WORLD_REVISION);
	});
});
