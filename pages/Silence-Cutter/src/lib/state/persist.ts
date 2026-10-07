/**
 * Local project persistence (IndexedDB). Stores only small derived data — settings, transcript,
 * envelope, peaks, manual edits and (where supported) a File System Access handle. The video
 * itself is never copied into browser storage.
 */
import type { MediaInfo } from '../media/types';
import type { ManualOverride, Transcript } from '../core/types';
import type { ProjectSettings } from './settings';

export interface ProjectRecord {
	id: string;
	name: string;
	size: number;
	lastModified: number;
	updatedAt: number;
	info: MediaInfo;
	settings: ProjectSettings;
	overrides: ManualOverride[];
	transcript: Transcript | null;
	envelopeDb: Float32Array;
	envelopeHop: number;
	peaks: Int8Array;
	peakBucketSeconds: number;
	handle?: FileSystemFileHandle;
}

export type ProjectSummary = Pick<
	ProjectRecord,
	'id' | 'name' | 'size' | 'updatedAt' | 'handle'
> & { duration: number; words: number; edits: number };

const DB = 'silence-cutter';
const STORE = 'projects';

export function projectId(file: { name: string; size: number; lastModified: number }): string {
	return `${file.name}::${file.size}::${file.lastModified}`;
}

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const t = db.transaction(STORE, mode);
			const req = fn(t.objectStore(STORE));
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	} finally {
		db.close();
	}
}

export async function saveProject(record: ProjectRecord): Promise<void> {
	try {
		await tx('readwrite', (s) => s.put(record));
	} catch (err) {
		// A non-cloneable handle (some browsers) should not prevent saving the rest.
		if (record.handle) await tx('readwrite', (s) => s.put({ ...record, handle: undefined }));
		else throw err;
	}
}

export async function loadProject(id: string): Promise<ProjectRecord | undefined> {
	try {
		return await tx('readonly', (s) => s.get(id) as IDBRequest<ProjectRecord | undefined>);
	} catch {
		return undefined;
	}
}

export async function listProjects(): Promise<ProjectSummary[]> {
	try {
		const all = await tx('readonly', (s) => s.getAll() as IDBRequest<ProjectRecord[]>);
		return all
			.map((r) => ({
				id: r.id,
				name: r.name,
				size: r.size,
				updatedAt: r.updatedAt,
				handle: r.handle,
				duration: r.info.durationSeconds,
				words: r.transcript?.words.length ?? 0,
				edits: r.overrides.length
			}))
			.sort((a, b) => b.updatedAt - a.updatedAt);
	} catch {
		return [];
	}
}

export async function deleteProject(id: string): Promise<void> {
	try {
		await tx('readwrite', (s) => s.delete(id));
	} catch {
		/* ignore */
	}
}
