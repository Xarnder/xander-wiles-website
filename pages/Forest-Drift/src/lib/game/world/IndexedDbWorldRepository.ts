import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { approximateByteSize, type WorldRepository } from './WorldRepository';
import { metadataFromWorld, type WorldDefinition, type WorldMetadata } from './WorldTypes';

const DATABASE_NAME = 'forest-drift-worlds';
const DATABASE_VERSION = 1;

/**
 * Three stores rather than one, for a specific reason each:
 *
 * - `worldMeta` is what the Worlds browser reads. Listing worlds must not deserialize every full
 *   world just to render names and dates, which is the difference between an instant screen and a
 *   multi-second one once someone has a dozen large worlds.
 * - `worlds` holds the full `WorldDefinition`. Only read when a world is actually opened, exported
 *   or duplicated.
 * - `thumbnails` holds image blobs separately again, so a screenshot never rides along inside the
 *   world record that autosave rewrites every couple of seconds.
 */
interface WorldsDb extends DBSchema {
	worldMeta: {
		key: string;
		value: WorldMetadata;
		indexes: { byLastPlayed: string };
	};
	worlds: {
		key: string;
		value: WorldDefinition;
	};
	/** Never inlined into `WorldDefinition` as base64 — that would put a screenshot inside the record autosave rewrites every few seconds. */
	thumbnails: {
		key: string;
		value: { worldId: string; blob: Blob; updatedAt: string };
	};
}

/** IndexedDB is absent in SSR and in some hardened/private browser modes; callers fall back to the in-memory repository rather than failing to start. */
export function isIndexedDbAvailable(): boolean {
	return typeof indexedDB !== 'undefined';
}

/**
 * The local storage backend. IndexedDB rather than `localStorage` because worlds are structured,
 * potentially multi-megabyte, and must not block the main thread while being written mid-gameplay —
 * `localStorage` is synchronous, string-only and quota-limited to a few megabytes, which rules it
 * out for whole worlds regardless of how small a single save happens to be today.
 */
export class IndexedDbWorldRepository implements WorldRepository {
	private dbPromise: Promise<IDBPDatabase<WorldsDb>> | null = null;

	private db(): Promise<IDBPDatabase<WorldsDb>> {
		this.dbPromise ??= openDB<WorldsDb>(DATABASE_NAME, DATABASE_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('worldMeta')) {
					const meta = db.createObjectStore('worldMeta', { keyPath: 'id' });
					meta.createIndex('byLastPlayed', 'lastPlayedAt');
				}
				if (!db.objectStoreNames.contains('worlds')) {
					db.createObjectStore('worlds', { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains('thumbnails')) {
					db.createObjectStore('thumbnails', { keyPath: 'worldId' });
				}
			}
		});
		return this.dbPromise;
	}

	async listWorlds(): Promise<WorldMetadata[]> {
		const db = await this.db();
		const all = await db.getAll('worldMeta');
		return all.sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
	}

	async getMetadata(worldId: string): Promise<WorldMetadata | undefined> {
		const db = await this.db();
		return db.get('worldMeta', worldId);
	}

	async loadWorld(worldId: string): Promise<WorldDefinition | undefined> {
		const db = await this.db();
		return db.get('worlds', worldId);
	}

	/**
	 * Both stores are written inside ONE readwrite transaction spanning them, so a world and its
	 * listing metadata can never disagree about which revision is current — a half-applied save
	 * (new world body, stale metadata, or vice versa) is exactly the corruption that makes a save
	 * system untrustworthy, and IndexedDB's transaction semantics rule it out for free.
	 */
	async saveWorld(world: WorldDefinition): Promise<WorldMetadata> {
		const db = await this.db();
		const metadata = metadataFromWorld(world, approximateByteSize(world));
		const tx = db.transaction(['worlds', 'worldMeta'], 'readwrite');
		await Promise.all([
			tx.objectStore('worlds').put(world),
			tx.objectStore('worldMeta').put(metadata),
			tx.done
		]);
		return metadata;
	}

	async deleteWorld(worldId: string): Promise<void> {
		const db = await this.db();
		const tx = db.transaction(['worlds', 'worldMeta', 'thumbnails'], 'readwrite');
		await Promise.all([
			tx.objectStore('worlds').delete(worldId),
			tx.objectStore('worldMeta').delete(worldId),
			tx.objectStore('thumbnails').delete(worldId),
			tx.done
		]);
	}

	async getThumbnail(worldId: string): Promise<Blob | undefined> {
		const db = await this.db();
		const record = await db.get('thumbnails', worldId);
		return record?.blob;
	}

	async putThumbnail(worldId: string, blob: Blob): Promise<void> {
		const db = await this.db();
		await db.put('thumbnails', { worldId, blob, updatedAt: new Date().toISOString() });
	}

	async estimateStorage(): Promise<{ usage?: number; quota?: number }> {
		if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return {};
		try {
			const estimate = await navigator.storage.estimate();
			return { usage: estimate.usage, quota: estimate.quota };
		} catch {
			return {};
		}
	}

	async close(): Promise<void> {
		if (!this.dbPromise) return;
		const db = await this.dbPromise;
		db.close();
		this.dbPromise = null;
	}
}

/**
 * Asks the browser to make this origin's storage persistent, so worlds aren't evicted under storage
 * pressure. Called once, only after the player has actually created world data worth protecting —
 * prompting on first page load (before there's anything to lose) is the behaviour that trains people
 * to click "block".
 *
 * Silently does nothing where unsupported or denied; persistence is a nice-to-have, never a
 * precondition for saving.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
	try {
		if (await navigator.storage.persisted?.()) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}
