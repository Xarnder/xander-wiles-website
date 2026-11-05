import { openDB } from 'idb';
import { MODEL_BASE_URL, MODEL_FILES } from './types';

export const SPEECH_ASSET_DB = 'forest-drift-speech-assets-v1';
async function database() {
	return openDB(SPEECH_ASSET_DB, 1, {
		upgrade(db) {
			db.createObjectStore('files');
		}
	});
}

/** IndexedDB survives reloads in WebKit contexts whose Cache API silently discards bodies. */
export async function readSpeechAsset(file: string): Promise<Uint8Array | undefined> {
	try {
		const db = await database();
		try {
			const value = await db.get('files', MODEL_BASE_URL + file);
			return value instanceof Uint8Array && value.length > 0 ? value : undefined;
		} finally {
			db.close();
		}
	} catch {
		return undefined;
	}
}
export async function writeSpeechAsset(file: string, bytes: Uint8Array) {
	const db = await database();
	try {
		await db.put('files', bytes, MODEL_BASE_URL + file);
	} finally {
		db.close();
	}
}
export async function pruneSpeechAssets() {
	const db = await database();
	try {
		const wanted = new Set(MODEL_FILES.map((file) => MODEL_BASE_URL + file));
		const tx = db.transaction('files', 'readwrite');
		for (const key of await tx.store.getAllKeys())
			if (!wanted.has(String(key))) await tx.store.delete(key);
		await tx.done;
	} finally {
		db.close();
	}
}
export async function clearSpeechAssets() {
	const db = await database();
	try {
		await db.clear('files');
	} finally {
		db.close();
	}
}
