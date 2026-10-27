import { openDB, type IDBPDatabase } from 'idb';
import { LIMITS, validClip, type Clip } from './types';
/** One IndexedDB record atomically owns both audio and its one-phrase cue. No world data here. */
export class SpeechCache {
	private memory = new Map<string, Clip>();
	private epoch = 0;
	private db?: Promise<IDBPDatabase | null>;
	private released = false;
	private channel?: BroadcastChannel;
	constructor() {
		// Invalidate other tabs' in-memory copies when saved speech is cleared.
		try {
			if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
				this.channel = new BroadcastChannel('forest-drift-speech-cache');
				this.channel.onmessage = () => {
					this.epoch++;
					this.memory.clear();
				};
			}
		} catch {
			/* Cross-tab invalidation is optional in restricted browsers. */
		}
	}
	private writes: Promise<unknown> = Promise.resolve();
	private database() {
		if (this.released) return Promise.resolve(null);
		return (this.db ??= new Promise<IDBPDatabase | null>((resolve) => {
			let abandoned = false;
			const opening = openDB('forest-drift-speech-v1', 2, {
				upgrade(db, oldVersion, _newVersion, transaction) {
					const store =
						oldVersion < 1
							? db.createObjectStore('clips', { keyPath: 'key' })
							: transaction.objectStore('clips');
					// The browser builds this index without cloning the old PCM into JavaScript.
					store.createIndex('eviction', ['usedAt', 'bytes']);
				},
				blocked: () => {
					abandoned = true;
					resolve(null);
				},
				blocking: () => {
					void opening.then((db) => db.close());
					this.db = undefined;
				}
			});
			void opening.then(
				(db) => {
					if (abandoned || this.released) {
						db.close();
						resolve(null);
					} else resolve(db);
				},
				() => resolve(null)
			);
		}).catch(() => null));
	}
	private remember(clip: Clip) {
		this.memory.delete(clip.key);
		this.memory.set(clip.key, clip);
		let bytes = [...this.memory.values()].reduce((n, c) => n + c.bytes, 0);
		for (const [key, c] of this.memory) {
			if (bytes <= LIMITS.memoryBytes && this.memory.size <= LIMITS.memoryClips) break;
			this.memory.delete(key);
			bytes -= c.bytes;
		}
	}
	async get(key: string): Promise<Clip | undefined> {
		if (this.released) return;
		const epoch = this.epoch;
		const cached = this.memory.get(key);
		if (cached) {
			this.remember(cached);
			return cached;
		}
		try {
			const db = await this.database();
			const clip = await db?.get('clips', key);
			if (epoch !== this.epoch) return;
			if (validClip(clip, key)) {
				clip.usedAt = Date.now();
				this.remember(clip);
				return clip;
			}
			// A preparation transaction replaces invalid records. A playback read must not
			// delete a newer valid record written by another tab after this read completed.
		} catch {
			/* Cache is optional. */
		}
	}
	async put(clip: Clip, persistent: boolean) {
		if (this.released) return;
		if (!validClip(clip, clip.key)) throw new Error('Invalid speech clip.');
		this.remember(clip);
		if (!persistent) return;
		const epoch = this.epoch;
		this.writes = this.writes
			.catch(() => {})
			.then(async () => {
				const db = await this.database();
				if (!db || epoch !== this.epoch) return;
				const tx = db.transaction('clips', 'readwrite');
				// Key-only index cursor: eviction must not deserialize every stored PCM buffer.
				const entries: { key: string; bytes: number; usedAt: number }[] = [];
				let cursor = await tx.store.index('eviction').openKeyCursor();
				while (cursor) {
					const [usedAt, bytes] = cursor.key as [number, number];
					entries.push({ key: cursor.primaryKey as string, bytes, usedAt });
					cursor = await cursor.continue();
				}
				let total =
					entries.filter((c) => c.key !== clip.key).reduce((n, c) => n + c.bytes, 0) + clip.bytes;
				let count = entries.filter((c) => c.key !== clip.key).length + 1;
				for (const c of entries.sort((a, b) => a.usedAt - b.usedAt)) {
					if (epoch !== this.epoch) {
						await tx.done;
						return;
					}
					if (total <= LIMITS.diskBytes && count <= LIMITS.diskClips) break;
					if (c.key !== clip.key) {
						await tx.store.delete(c.key);
						total -= c.bytes;
						count--;
					}
				}
				if (epoch === this.epoch) await tx.store.put(clip);
				await tx.done;
			});
		await this.writes.catch(() => {});
	}
	async clear() {
		this.epoch++;
		this.memory.clear();
		await this.writes.catch(() => {});
		const db = await this.database();
		if (!db) throw new Error('Saved speech storage is unavailable.');
		await db.clear('clips');
		this.channel?.postMessage('clear');
	}
	release() {
		this.released = true;
		this.channel?.close();
		this.epoch++;
		this.memory.clear();
		void this.db?.then((db) => db?.close());
		this.db = undefined;
	}
}
