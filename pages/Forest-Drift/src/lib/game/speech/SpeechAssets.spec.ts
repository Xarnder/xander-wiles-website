import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, expect, it, vi } from 'vitest';
import {
	clearSpeechAssets,
	pruneSpeechAssets,
	readSpeechAsset,
	SPEECH_ASSET_DB,
	writeSpeechAsset
} from './SpeechAssets';
import { MODEL_BASE_URL } from './types';
beforeEach(clearSpeechAssets);
it('persists model bytes across independent readers and removes obsolete revisions', async () => {
	await writeSpeechAsset('model.q8.gguf', new Uint8Array([1, 2, 3]));
	const db = await openDB(SPEECH_ASSET_DB, 1);
	await db.put('files', new Uint8Array([4]), 'https://retired.example/model');
	await pruneSpeechAssets();
	expect(await db.getAllKeys('files')).toEqual([MODEL_BASE_URL + 'model.q8.gguf']);
	expect(await readSpeechAsset('model.q8.gguf')).toEqual(new Uint8Array([1, 2, 3]));
	db.close();
	await clearSpeechAssets();
	expect(await readSpeechAsset('model.q8.gguf')).toBeUndefined();
});
it('allows a download when saved assets are unavailable', async () => {
	vi.stubGlobal('indexedDB', undefined);
	try {
		expect(await readSpeechAsset('model.q8.gguf')).toBeUndefined();
	} finally {
		vi.unstubAllGlobals();
	}
});
