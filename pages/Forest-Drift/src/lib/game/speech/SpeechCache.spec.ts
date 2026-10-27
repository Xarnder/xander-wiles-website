import 'fake-indexeddb/auto';
import { openDB, deleteDB } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SpeechCache } from './SpeechCache';
import { clipKey, NARRATOR, LIMITS, type Clip } from './types';
const makeClip = (text: string, samples = 2400): Clip => ({
	schema: 1,
	key: clipKey(text, NARRATOR.profile),
	text,
	pcm: new Float32Array(samples),
	sampleRate: 24000,
	duration: samples / 24000,
	bytes: samples * 4,
	usedAt: Date.now()
});
beforeEach(async () => {
	const c = new SpeechCache();
	await c.clear();
	c.release();
});
it('persists paired scripted audio/cues but not dynamic session clips', async () => {
	const a = new SpeechCache();
	const scripted = makeClip('Scripted.'),
		dynamic = makeClip('Dynamic.');
	await a.put(scripted, true);
	await a.put(dynamic, false);
	a.release();
	const b = new SpeechCache();
	expect(await b.get(scripted.key)).toMatchObject({ text: 'Scripted.', duration: 0.1 });
	expect(await b.get(dynamic.key)).toBeUndefined();
	b.release();
});
it('rejects corrupt stored cues and clears without repopulating pending writes', async () => {
	const a = new SpeechCache(),
		clip = makeClip('Hello.');
	await a.put(clip, true);
	a.release();
	const db = await openDB('forest-drift-speech-v1', 2);
	await db.put('clips', { ...clip, duration: 8 });
	db.close();
	const b = new SpeechCache();
	expect(await b.get(clip.key)).toBeUndefined();
	const writing = b.put(clip, true);
	await b.clear();
	await writing;
	expect(await b.get(clip.key)).toBeUndefined();
	b.release();
});
it('evicts persistent audio by byte budget instead of keeping every lesson', async () => {
	const cache = new SpeechCache();
	const count = Math.ceil(LIMITS.diskBytes / (24000 * 18 * 4)) + 2;
	for (let i = 0; i < count; i++) await cache.put(makeClip(`Phrase ${i}.`, 24000 * 18), true);
	const db = await openDB('forest-drift-speech-v1', 2);
	const entries = (await db.getAll('clips')) as Clip[];
	expect(entries.reduce((sum, c) => sum + c.bytes, 0)).toBeLessThanOrEqual(LIMITS.diskBytes);
	expect(entries.length).toBeLessThan(count);
	db.close();
	cache.release();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
it('upgrades v1 clips without discarding prepared speech', async () => {
	await deleteDB('forest-drift-speech-v1');
	const old = await openDB('forest-drift-speech-v1', 1, {
		upgrade(db) {
			db.createObjectStore('clips', { keyPath: 'key' });
		}
	});
	const clip = makeClip('Preserve me.');
	await old.put('clips', clip);
	old.close();
	const cache = new SpeechCache();
	expect(await cache.get(clip.key)).toMatchObject({ text: clip.text });
	cache.release();
});
it('does not wait indefinitely when an old tab blocks the cache upgrade', async () => {
	await deleteDB('forest-drift-speech-v1');
	const old = await openDB('forest-drift-speech-v1', 1, {
		upgrade(db) {
			db.createObjectStore('clips', { keyPath: 'key' });
		}
	});
	const cache = new SpeechCache();
	expect(await cache.get(makeClip('Hello.').key)).toBeUndefined();
	old.close();
	const migrated = await openDB('forest-drift-speech-v1', 2);
	migrated.close();
	cache.release();
});
it('evicts by metadata without reading existing PCM payloads', async () => {
	const cache = new SpeechCache();
	await cache.put(makeClip('First.'), true);
	const values = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
	await cache.put(makeClip('Second.'), true);
	expect(values).not.toHaveBeenCalled();
	cache.release();
});
it('invalidates warm copies in other tabs after clearing saved speech', async () => {
	const peers = new Set<{ onmessage?: () => void }>();
	vi.stubGlobal('window', {});
	vi.stubGlobal(
		'BroadcastChannel',
		class {
			onmessage?: () => void;
			constructor() {
				peers.add(this);
			}
			postMessage() {
				for (const peer of peers) if (peer !== this) peer.onmessage?.();
			}
			close() {
				peers.delete(this);
			}
		}
	);
	const a = new SpeechCache(),
		b = new SpeechCache(),
		clip = makeClip('Shared.');
	await a.put(clip, true);
	expect(await b.get(clip.key)).toBeDefined();
	await a.clear();
	expect(await b.get(clip.key)).toBeUndefined();
	a.release();
	b.release();
	expect(peers.size).toBe(0);
});
it('rejects text/audio identity mismatches and remains closed after release', async () => {
	const cache = new SpeechCache(),
		clip = makeClip('Original.');
	await expect(cache.put({ ...clip, text: 'Different.' }, true)).rejects.toThrow('Invalid');
	cache.release();
	await cache.put(clip, true);
	expect(await cache.get(clip.key)).toBeUndefined();
});

it('still works when browser storage and cross-tab channels are unavailable', async () => {
	vi.stubGlobal('window', {});
	vi.stubGlobal(
		'BroadcastChannel',
		class {
			constructor() {
				throw new Error('blocked');
			}
		}
	);
	vi.stubGlobal('indexedDB', undefined);
	const cache = new SpeechCache(),
		clip = makeClip('Memory only.');
	expect(await cache.get(clip.key)).toBeUndefined();
	await cache.put(clip, true);
	expect(await cache.get(clip.key)).toBeDefined();
	cache.release();
});
