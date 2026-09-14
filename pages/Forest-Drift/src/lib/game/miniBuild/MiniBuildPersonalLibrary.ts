import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { cloneDefinition } from './miniBuildGrid';
import { validateMiniBuildDefinition } from './MiniBuildValidation';
import type { MiniBuildDefinition } from './MiniBuildTypes';

const DATABASE_NAME = 'forest-drift-mini-builds';
const DATABASE_VERSION = 1;
const MAX_THUMBNAILS = 400;

interface MiniBuildDb extends DBSchema {
	designs: { key: string; value: MiniBuildDefinition };
	/** Keyed by content hash, so renames never re-render and identical designs share one image. */
	thumbnails: { key: string; value: { hash: string; blob: Blob; updatedAt: string } };
}

/**
 * "My Builds" across worlds. Holds the most recently saved version of each player design plus
 * thumbnails. Worlds never *reference* this store — placing a personal design copies it into the
 * world (see MiniBuildSystem.ensureInWorld), so deleting something here can't break a save.
 *
 * Loaded asynchronously; `designs` is an in-memory mirror so lookups during gameplay are synchronous.
 * Falls back to memory-only when IndexedDB is unavailable.
 */
export class MiniBuildPersonalLibrary {
	private readonly designs = new Map<string, MiniBuildDefinition>();
	private readonly memoryThumbnails = new Map<string, Blob>();
	private dbPromise: Promise<IDBPDatabase<MiniBuildDb>> | null = null;
	private readonly listeners = new Set<() => void>();
	private readyPromise: Promise<void> | null = null;
	private revisionCounter = 0;

	constructor(private readonly useIndexedDb = typeof indexedDB !== 'undefined') {}

	get revision(): number {
		return this.revisionCounter;
	}

	ready(): Promise<void> {
		this.readyPromise ??= this.load();
		return this.readyPromise;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	list(): MiniBuildDefinition[] {
		return [...this.designs.values()];
	}

	get(id: string): MiniBuildDefinition | undefined {
		return this.designs.get(id);
	}

	has(id: string): boolean {
		return this.designs.has(id);
	}

	async upsert(definition: MiniBuildDefinition): Promise<void> {
		const copy = cloneDefinition(definition);
		this.designs.set(copy.id, copy);
		this.bump();
		const db = await this.db();
		if (db) await db.put('designs', copy).catch(() => undefined);
	}

	async remove(id: string): Promise<void> {
		if (!this.designs.delete(id)) return;
		this.bump();
		const db = await this.db();
		if (db) await db.delete('designs', id).catch(() => undefined);
	}

	async getThumbnail(hash: string): Promise<Blob | undefined> {
		const memory = this.memoryThumbnails.get(hash);
		if (memory) return memory;
		const db = await this.db();
		const record = db ? await db.get('thumbnails', hash).catch(() => undefined) : undefined;
		if (record) this.memoryThumbnails.set(hash, record.blob);
		return record?.blob;
	}

	async putThumbnail(hash: string, blob: Blob): Promise<void> {
		this.memoryThumbnails.set(hash, blob);
		const db = await this.db();
		if (!db) return;
		try {
			await db.put('thumbnails', { hash, blob, updatedAt: new Date().toISOString() });
			const count = await db.count('thumbnails');
			if (count > MAX_THUMBNAILS) {
				const all = await db.getAll('thumbnails');
				all.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
				for (const stale of all.slice(0, count - MAX_THUMBNAILS))
					await db.delete('thumbnails', stale.hash);
			}
		} catch {
			// Thumbnails are optional — never let storage trouble surface as an error.
		}
	}

	private async load(): Promise<void> {
		const db = await this.db();
		if (!db) return;
		try {
			for (const raw of await db.getAll('designs')) {
				const result = validateMiniBuildDefinition(raw);
				if (result.ok) this.designs.set(result.value.id, result.value);
			}
			this.bump();
		} catch {
			// Unreadable store: behave as an empty personal library for this session.
		}
	}

	private db(): Promise<IDBPDatabase<MiniBuildDb> | null> {
		if (!this.useIndexedDb) return Promise.resolve(null);
		this.dbPromise ??= openDB<MiniBuildDb>(DATABASE_NAME, DATABASE_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('designs'))
					db.createObjectStore('designs', { keyPath: 'id' });
				if (!db.objectStoreNames.contains('thumbnails'))
					db.createObjectStore('thumbnails', { keyPath: 'hash' });
			}
		});
		return this.dbPromise.catch(() => null);
	}

	private bump(): void {
		this.revisionCounter++;
		for (const listener of this.listeners) listener();
	}
}
