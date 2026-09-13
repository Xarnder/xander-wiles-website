import { migrateWorld } from './WorldMigrationManager';
import { generateWorldSeed, normalizeWorldName } from './seedGenerator';
import {
	DEFAULT_WORLD_ID,
	getDefaultWorldBaseMetadata,
	getDefaultWorldDefinition,
	getDefaultWorldThumbnailBlob
} from './DefaultWorld';
import type { WorldRepository } from './WorldRepository';
import {
	applyContentToWorld,
	createWorldDefinition,
	deepClone,
	type WorldContentSnapshot
} from './WorldSerializer';
import { readWorldPackage } from './WorldImportExport';
import type { WorldDefinition, WorldEnvironmentDefinition, WorldMetadata } from './WorldTypes';
import { validateWorldDefinition } from './WorldValidation';

export interface CreateWorldRequest {
	name: string;
	seed?: string;
	/** Fresh default settings for a new world — snapshotted into it so the world keeps its look when application defaults change later. */
	environment: WorldEnvironmentDefinition;
}

export type WorldOperationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function newWorldId(): string {
	// Identity is a UUID, never the name: two worlds may legitimately be called "Forest House", and
	// renaming must never look like creating a different world.
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * World lifecycle: create, load, save, rename, duplicate, delete, import, export.
 *
 * Everything that isn't "when should we write" (WorldAutosaveManager) or "how are bytes stored"
 * (WorldRepository) lives here, so the UI and the running game have exactly one object to talk to
 * and no building tool ever touches storage. `currentWorld` is the single authoritative copy of the
 * open world's record — there is deliberately no second copy held by a Svelte component or a
 * manager, because two owners of persisted state is how saves start disagreeing with each other.
 */
export class WorldManager {
	private readonly repository: WorldRepository;
	private current: WorldDefinition | null = null;

	constructor(repository: WorldRepository) {
		this.repository = repository;
	}

	getCurrentWorld(): WorldDefinition | null {
		return this.current;
	}

	getCurrentWorldId(): string | null {
		return this.current?.id ?? null;
	}

	async listWorlds(): Promise<WorldMetadata[]> {
		const all = await this.repository.listWorlds();
		return all.filter((w) => w.id !== DEFAULT_WORLD_ID);
	}

	async getDefaultWorldMetadata(): Promise<WorldMetadata> {
		try {
			const stored = await this.repository.getMetadata(DEFAULT_WORLD_ID);
			if (stored) return stored;
		} catch {
			// Fallback to base metadata if storage is unreadable or empty
		}
		return getDefaultWorldBaseMetadata();
	}

	async resetDefaultWorld(): Promise<WorldOperationResult<WorldDefinition>> {
		try {
			const pristine = getDefaultWorldDefinition();
			await this.repository.saveWorld(pristine);
			try {
				await this.repository.putThumbnail(DEFAULT_WORLD_ID, getDefaultWorldThumbnailBlob());
			} catch {
				// Non-fatal thumbnail failure
			}
			if (this.current?.id === DEFAULT_WORLD_ID) {
				this.current = pristine;
			}
			return { ok: true, value: pristine };
		} catch (error) {
			return { ok: false, error: describeError(error, 'Unable to reset default world.') };
		}
	}

	async getThumbnail(worldId: string): Promise<Blob | undefined> {
		const stored = await this.repository.getThumbnail(worldId);
		if (!stored && worldId === DEFAULT_WORLD_ID) {
			return getDefaultWorldThumbnailBlob();
		}
		return stored;
	}

	async estimateStorage(): Promise<{ usage?: number; quota?: number }> {
		return this.repository.estimateStorage();
	}

	/**
	 * Creates and immediately persists a world, before it is opened and before autosave exists —
	 * a world that only lives in memory until the first autosave fires is a world that can be lost
	 * by a refresh in its first two seconds.
	 */
	async createWorld(request: CreateWorldRequest): Promise<WorldOperationResult<WorldDefinition>> {
		const world = createWorldDefinition({
			id: newWorldId(),
			name: normalizeWorldName(request.name),
			seed: request.seed?.trim() || generateWorldSeed(),
			environment: request.environment
		});
		try {
			await this.repository.saveWorld(world);
			return { ok: true, value: world };
		} catch (error) {
			return { ok: false, error: describeError(error, 'Unable to create world.') };
		}
	}

	/** Reads, migrates and validates a stored world, then makes it current. Storage is not trusted blindly: a record can be stale-schema or hand-edited via devtools. */
	async openWorld(worldId: string): Promise<WorldOperationResult<WorldDefinition>> {
		let stored: WorldDefinition | undefined;
		try {
			stored = await this.repository.loadWorld(worldId);
		} catch (error) {
			return { ok: false, error: describeError(error, 'Unable to read world.') };
		}
		if (!stored && worldId === DEFAULT_WORLD_ID) {
			try {
				const defaultWorld = getDefaultWorldDefinition();
				await this.repository.saveWorld(defaultWorld);
				try {
					await this.repository.putThumbnail(DEFAULT_WORLD_ID, getDefaultWorldThumbnailBlob());
				} catch {
					// Non-fatal
				}
				stored = defaultWorld;
			} catch (error) {
				return { ok: false, error: describeError(error, 'Unable to initialize default world.') };
			}
		}
		if (!stored) return { ok: false, error: 'World not found.' };

		const migrated = migrateWorld(stored);
		if (!migrated.ok) return { ok: false, error: migrated.error };

		const validated = validateWorldDefinition(migrated.value);
		if (!validated.ok)
			return { ok: false, error: `This world could not be loaded: ${validated.error}` };

		const world: WorldDefinition = {
			...validated.value,
			lastPlayedAt: new Date().toISOString()
		};
		this.current = world;

		// A world upgraded by a migration is written straight back, so the migration cost is paid
		// once rather than on every future load.
		if (migrated.migrated) {
			try {
				await this.repository.saveWorld(world);
			} catch {
				// A failed post-migration rewrite is not fatal — the world is loaded and playable, it
				// will simply be migrated again next time.
			}
		}
		return { ok: true, value: world };
	}

	/** Drops the in-memory current world. Callers flush first; this deliberately does not save, so "quit without saving" stays expressible. */
	closeWorld(): void {
		this.current = null;
	}

	/**
	 * Folds a fresh runtime snapshot into the current world and writes it. The returned world carries
	 * the incremented `saveRevision`, which is what makes stale-write detection possible here and,
	 * later, across replicas.
	 */
	async saveCurrentWorld(
		content: WorldContentSnapshot
	): Promise<WorldOperationResult<WorldDefinition>> {
		const current = this.current;
		if (!current) return { ok: false, error: 'No world is open.' };

		const updated = applyContentToWorld(current, content);
		try {
			await this.repository.saveWorld(updated);
			this.current = updated;
			return { ok: true, value: updated };
		} catch (error) {
			// The in-memory world is deliberately left untouched on failure: the player's work still
			// exists in the session and can be retried or exported as a backup.
			return { ok: false, error: describeError(error, 'Unable to save world locally.') };
		}
	}

	async saveThumbnail(worldId: string, blob: Blob): Promise<void> {
		try {
			await this.repository.putThumbnail(worldId, blob);
		} catch {
			// Thumbnails are optional metadata; a world must never fail to save because a screenshot
			// could not be stored.
		}
	}

	async renameWorld(worldId: string, name: string): Promise<WorldOperationResult<WorldMetadata>> {
		const trimmed = name.trim();
		if (trimmed.length === 0) return { ok: false, error: 'World name cannot be empty.' };

		try {
			const stored =
				this.current?.id === worldId ? this.current : await this.repository.loadWorld(worldId);
			if (!stored) return { ok: false, error: 'World not found.' };

			// Renaming changes a label, never identity — the id is untouched, which is why a renamed
			// world keeps its thumbnail, its saves, and its place in any future sync.
			const updated: WorldDefinition = {
				...stored,
				name: normalizeWorldName(trimmed),
				updatedAt: new Date().toISOString(),
				saveRevision: stored.saveRevision + 1
			};
			const metadata = await this.repository.saveWorld(updated);
			if (this.current?.id === worldId) this.current = updated;
			return { ok: true, value: metadata };
		} catch (error) {
			return { ok: false, error: describeError(error, 'Unable to rename world.') };
		}
	}

	/**
	 * A fully independent copy: new id, new timestamps, fresh revision, deep-cloned content so the
	 * two worlds can never share a mutable array and quietly edit each other.
	 */
	async duplicateWorld(worldId: string): Promise<WorldOperationResult<WorldDefinition>> {
		try {
			let source =
				this.current?.id === worldId ? this.current : await this.repository.loadWorld(worldId);
			if (!source && worldId === DEFAULT_WORLD_ID) {
				source = getDefaultWorldDefinition();
			}
			if (!source) return { ok: false, error: 'World not found.' };

			const now = new Date().toISOString();
			const copy: WorldDefinition = {
				...deepClone(source),
				id: newWorldId(),
				name: normalizeWorldName(`${source.name} Copy`),
				createdAt: now,
				updatedAt: now,
				lastPlayedAt: now,
				saveRevision: 1
			};
			await this.repository.saveWorld(copy);

			const thumbnail = await this.getThumbnail(worldId);
			if (thumbnail) await this.repository.putThumbnail(copy.id, thumbnail);

			return { ok: true, value: copy };
		} catch (error) {
			return { ok: false, error: describeError(error, 'Unable to duplicate world.') };
		}
	}

	async deleteWorld(worldId: string): Promise<WorldOperationResult<void>> {
		if (worldId === DEFAULT_WORLD_ID) {
			return { ok: false, error: 'The default world cannot be deleted.' };
		}
		try {
			await this.repository.deleteWorld(worldId);
			if (this.current?.id === worldId) this.current = null;
			return { ok: true, value: undefined };
		} catch (error) {
			return { ok: false, error: describeError(error, 'Unable to delete world.') };
		}
	}

	async exportWorld(
		worldId: string
	): Promise<WorldOperationResult<{ world: WorldDefinition; thumbnail?: Blob }>> {
		try {
			let world =
				this.current?.id === worldId ? this.current : await this.repository.loadWorld(worldId);
			let thumbnail = await this.repository.getThumbnail(worldId);
			if (!world && worldId === DEFAULT_WORLD_ID) {
				world = getDefaultWorldDefinition();
				thumbnail = getDefaultWorldThumbnailBlob();
			}
			if (!world) return { ok: false, error: 'World not found.' };
			return { ok: true, value: { world, thumbnail } };
		} catch (error) {
			return { ok: false, error: describeError(error, 'Unable to export world.') };
		}
	}

	/**
	 * Imports a package as a NEW local world.
	 *
	 * An id collision never overwrites: re-importing a world you already have gives you a second
	 * copy, because silently replacing someone's current save with an older exported version of it
	 * is a data-loss bug wearing a convenience feature's clothing. Explicit "replace this world" can
	 * be added later as a deliberate, confirmed action.
	 */
	async importWorld(bytes: Uint8Array): Promise<WorldOperationResult<WorldDefinition>> {
		const parsed = readWorldPackage(bytes);
		if (!parsed.ok) return { ok: false, error: parsed.error };

		try {
			const existing = await this.repository.getMetadata(parsed.world.id);
			const now = new Date().toISOString();
			const imported: WorldDefinition = {
				...parsed.world,
				id: existing ? newWorldId() : parsed.world.id,
				name: existing ? normalizeWorldName(`${parsed.world.name} (Imported)`) : parsed.world.name,
				updatedAt: now,
				lastPlayedAt: now,
				saveRevision: parsed.world.saveRevision + 1
			};
			await this.repository.saveWorld(imported);
			if (parsed.thumbnail) await this.repository.putThumbnail(imported.id, parsed.thumbnail);
			return { ok: true, value: imported };
		} catch (error) {
			return { ok: false, error: describeError(error, 'Unable to import world.') };
		}
	}
}

function describeError(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) return `${fallback} (${error.message})`;
	return fallback;
}
