import type { WorldDefinition, WorldMetadata } from './WorldTypes';

/**
 * The persistence boundary for worlds. Everything above this line (WorldManager, the autosave
 * manager, the Worlds UI, the building managers) talks only to this interface and never to
 * IndexedDB, so the storage backend is a swappable implementation detail.
 *
 * That's the seam a future `CloudWorldRepository` / `MultiplayerWorldRepository` slots into without
 * touching game code: the concepts this interface is built on — a stable world `id`, a
 * `schemaVersion`, and a monotonically increasing `saveRevision` — are exactly what remote
 * synchronisation needs to detect stale writes and diverged replicas. Cloud saving is explicitly NOT
 * part of this work; the point is only that adding it later shouldn't require rewriting anything
 * that mutates world state.
 */
export interface WorldRepository {
	/** Listing records only — never deserializes full worlds. Ordered most-recently-played first. */
	listWorlds(): Promise<WorldMetadata[]>;

	getMetadata(worldId: string): Promise<WorldMetadata | undefined>;

	loadWorld(worldId: string): Promise<WorldDefinition | undefined>;

	/**
	 * Writes the world and its derived metadata as one atomic unit — a failure must never leave the
	 * two stores describing different revisions of the same world.
	 */
	saveWorld(world: WorldDefinition): Promise<WorldMetadata>;

	deleteWorld(worldId: string): Promise<void>;

	getThumbnail(worldId: string): Promise<Blob | undefined>;

	putThumbnail(worldId: string, blob: Blob): Promise<void>;

	/** Bytes used / available where the platform can report it; `undefined` fields when it can't. */
	estimateStorage(): Promise<{ usage?: number; quota?: number }>;
}

/**
 * Fully in-memory repository. Used by unit tests (Vitest runs in a `node` environment with no
 * IndexedDB at all) and as the graceful fallback when IndexedDB is unavailable — a private-mode
 * browser, a hardened profile, or storage being denied — so the game still runs and worlds still
 * work for the session even though nothing survives a reload. That degradation is surfaced to the
 * player by WorldManager rather than hidden.
 */
export class InMemoryWorldRepository implements WorldRepository {
	private readonly worlds = new Map<string, WorldDefinition>();
	private readonly thumbnails = new Map<string, Blob>();

	async listWorlds(): Promise<WorldMetadata[]> {
		return [...this.worlds.values()]
			.map((world) => toMetadata(world))
			.sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
	}

	async getMetadata(worldId: string): Promise<WorldMetadata | undefined> {
		const world = this.worlds.get(worldId);
		return world ? toMetadata(world) : undefined;
	}

	async loadWorld(worldId: string): Promise<WorldDefinition | undefined> {
		const world = this.worlds.get(worldId);
		// Structured-clone on read as well as write, so callers can't mutate stored state by holding
		// onto a returned object — the real IndexedDB backend has that property inherently and tests
		// should not accidentally depend on shared references that only work in memory.
		return world ? deepClone(world) : undefined;
	}

	async saveWorld(world: WorldDefinition): Promise<WorldMetadata> {
		const stored = deepClone(world);
		this.worlds.set(stored.id, stored);
		return toMetadata(stored);
	}

	async deleteWorld(worldId: string): Promise<void> {
		this.worlds.delete(worldId);
		this.thumbnails.delete(worldId);
	}

	async getThumbnail(worldId: string): Promise<Blob | undefined> {
		return this.thumbnails.get(worldId);
	}

	async putThumbnail(worldId: string, blob: Blob): Promise<void> {
		this.thumbnails.set(worldId, blob);
	}

	async estimateStorage(): Promise<{ usage?: number; quota?: number }> {
		return {};
	}
}

function toMetadata(world: WorldDefinition): WorldMetadata {
	return {
		id: world.id,
		name: world.name,
		createdAt: world.createdAt,
		updatedAt: world.updatedAt,
		lastPlayedAt: world.lastPlayedAt,
		schemaVersion: world.schemaVersion,
		saveRevision: world.saveRevision,
		seed: world.seed,
		byteSize: approximateByteSize(world)
	};
}

/** Cheap approximation for the Worlds UI's "size" column — the exact stored size isn't observable through IndexedDB anyway. */
export function approximateByteSize(world: WorldDefinition): number {
	try {
		return JSON.stringify(world).length;
	} catch {
		return 0;
	}
}

function deepClone<T>(value: T): T {
	if (typeof structuredClone === 'function') return structuredClone(value);
	return JSON.parse(JSON.stringify(value)) as T;
}
