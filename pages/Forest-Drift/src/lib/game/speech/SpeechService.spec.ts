import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeechService } from './SpeechService';
import * as assets from './SpeechAssets';
import { NARRATOR, clipKey, phrases, validClip, type Clip, type SpeechRequest } from './types';
import { lessons, lessonRequest, completed } from '../tutorials/tutorials';
const request = (): SpeechRequest => lessonRequest(lessons(false)[0], 'session-a', false);
const clip = (text: string): Clip => ({
	key: clipKey(text, NARRATOR.profile),
	text,
	pcm: new Float32Array(2400),
	sampleRate: 24000,
	duration: 0.1,
	bytes: 9600,
	usedAt: 1,
	schema: 1
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
describe('speech identities and caption contracts', () => {
	it('bounds phrase size without dropping or reordering words', () => {
		for (const touch of [true, false])
			for (const lesson of lessons(touch)) {
				const parts = phrases(lesson.text);
				expect(parts.join(' ')).toBe(lesson.text);
				expect(parts.every((p) => p.length <= 600)).toBe(true);
			}
		expect(() => phrases('x'.repeat(1201))).toThrow();
		expect(() => phrases('')).toThrow();
		expect(
			phrases('Click the world and move your mouse to look around. Aim with the centre crosshair.')
		).toEqual([
			'Click the world and move your mouse to look around.',
			'Aim with the centre crosshair.'
		]);
	});
	it('isolates synthesis settings while permitting different speakers to reuse identical audio', () => {
		const text = 'Hello.';
		expect(clipKey(text, NARRATOR.profile)).not.toBe(
			clipKey(text, { ...NARRATOR.profile, voice: 'another-voice' })
		);
		expect(clipKey(text, NARRATOR.profile)).not.toBe(
			clipKey(text, { ...NARRATOR.profile, version: NARRATOR.profile.version + 1 })
		);
		expect(clipKey(text, NARRATOR.profile)).not.toBe(
			clipKey(text, { ...NARRATOR.profile, durationDelta: 0.3 })
		);
	});
	it('rejects corrupted duration, truncated payloads and oversized cached clips', () => {
		const c = clip('Hello.');
		expect(validClip(c, c.key)).toBe(true);
		expect(validClip({ ...c, duration: 3 }, c.key)).toBe(false);
		expect(validClip({ ...c, pcm: new Float32Array(10) }, c.key)).toBe(false);
		expect(validClip(c, 'different-key')).toBe(false);
	});
});
describe('performance and cancellation boundaries', () => {
	it('does not create a worker for a cache miss during gameplay', async () => {
		const worker = vi.fn();
		vi.stubGlobal('Worker', worker);
		const caption = vi.fn();
		const service = new SpeechService(caption);
		vi.spyOn(service.cache, 'get').mockResolvedValue(undefined);
		expect(await service.speak(request(), true)).toBe('text');
		expect(worker).not.toHaveBeenCalled();
		expect(caption).toHaveBeenLastCalledWith(
			expect.objectContaining({ speakerId: NARRATOR.id, text: request().text })
		);
		service.dispose();
	});
	it('drops a late cache read after cancellation', async () => {
		const caption = vi.fn();
		const service = new SpeechService(caption);
		let resolve!: (c: Clip | undefined) => void;
		vi.spyOn(service.cache, 'get').mockImplementation(() => new Promise((r) => (resolve = r)));
		const playing = service.speak(request(), true);
		service.cancel();
		resolve(undefined);
		expect(await playing).toBe('cancelled');
		expect(caption).toHaveBeenLastCalledWith(null);
		service.dispose();
	});
	it('does not speak an expired dynamic turn', async () => {
		const caption = vi.fn();
		const service = new SpeechService(caption);
		const get = vi.spyOn(service.cache, 'get');
		expect(
			await service.speak(
				{ ...request(), mode: 'dynamic', conversationId: 'c', turn: 1, expiresAt: Date.now() - 1 },
				true
			)
		).toBe('cancelled');
		expect(get).not.toHaveBeenCalled();
		service.dispose();
	});
	it('keeps character labels attached to requests instead of cached audio', async () => {
		const caption = vi.fn();
		const service = new SpeechService(caption);
		const r = request();
		await service.speak(
			{ ...r, speaker: { ...NARRATOR, id: 'gardener', name: 'Moss', showLabel: true } },
			false
		);
		expect(caption).toHaveBeenLastCalledWith(
			expect.objectContaining({ speakerId: 'gardener', label: 'Moss' })
		);
		await service.speak(r, false);
		expect(caption).toHaveBeenLastCalledWith(
			expect.objectContaining({ speakerId: NARRATOR.id, label: '' })
		);
		service.dispose();
	});
	it('warm preparation never initializes a worker', async () => {
		vi.stubGlobal('navigator', {
			locks: {
				request: (_: string, _options: unknown, callback: (lock: object) => Promise<void>) =>
					callback({})
			}
		});
		vi.stubGlobal('document', { hidden: false });
		const worker = vi.fn();
		vi.stubGlobal('Worker', worker);
		const service = new SpeechService(vi.fn(), () => true);
		vi.spyOn(service.cache, 'get').mockResolvedValue(clip('cached'));
		await service.prepare([request()], vi.fn());
		expect(worker).not.toHaveBeenCalled();
		service.dispose();
	});
	it('rejects duplicate cross-tab preparation and hidden-tab generation', async () => {
		vi.stubGlobal('navigator', {
			locks: {
				request: (_: string, _options: unknown, callback: (lock: null) => Promise<void>) =>
					callback(null)
			}
		});
		const service = new SpeechService(vi.fn(), () => true);
		await expect(service.prepare([request()], vi.fn())).rejects.toThrow('another tab');
		service.dispose();
	});
});
it('requires gameplay state, not narration completion, to complete action lessons', () => {
	const start = { x: 0, z: 0, build: false, slot: 1, help: false };
	expect(completed('move', start, start)).toBe(false);
	expect(completed('move', start, { ...start, x: 3 })).toBe(true);
	expect(completed('tool', start, { ...start, slot: 2 })).toBe(false);
	expect(completed('tool', start, { ...start, slot: 2, build: true })).toBe(true);
	expect(completed('continue', start, { ...start, help: true })).toBe(false);
});

it('refuses inference preparation without an explicit render suspension', async () => {
	const service = new SpeechService(vi.fn());
	await expect(service.prepare([request()], vi.fn())).rejects.toThrow('suspended');
	service.dispose();
});

it('keeps active downloads alive but times out a silent worker', async () => {
	vi.useFakeTimers();
	vi.stubGlobal('navigator', {
		locks: {
			request: (_: string, _options: unknown, callback: (lock: object) => Promise<void>) =>
				callback({})
		}
	});
	vi.stubGlobal('document', { hidden: false });
	const instances: FakeWorker[] = [];
	class FakeWorker {
		onmessage?: (event: { data: object }) => void;
		onerror?: () => void;
		id = 0;
		terminate = vi.fn();
		constructor() {
			instances.push(this);
		}
		postMessage(data: { id: number }) {
			this.id = data.id;
		}
	}
	vi.stubGlobal('Worker', FakeWorker);
	const service = new SpeechService(vi.fn(), () => true);
	vi.spyOn(service.cache, 'get').mockResolvedValue(undefined);
	try {
		const result = service.prepare([request()], vi.fn()).catch((error: Error) => error);
		await vi.advanceTimersByTimeAsync(170_000);
		instances[0].onmessage!({
			data: {
				id: instances[0].id,
				progress: 'Downloading…',
				detail: { stage: 'download', loaded: 100 }
			}
		});
		await vi.advanceTimersByTimeAsync(170_000);
		expect(instances[0].terminate).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(await result).toEqual(
			expect.objectContaining({ message: expect.stringContaining('timed out') })
		);
		expect(instances[0].terminate).toHaveBeenCalled();
	} finally {
		service.dispose();
		vi.useRealTimers();
	}
});

it('persists model files on the page and waits for pending writes before clearing', async () => {
	vi.stubGlobal('navigator', {
		locks: {
			request: (_: string, options: unknown, callback?: (lock: object) => Promise<void>) =>
				callback ? callback({}) : (options as () => Promise<void>)()
		}
	});
	vi.stubGlobal('document', { hidden: false });
	const instances: FakeWorker[] = [];
	class FakeWorker {
		onmessage?: (event: { data: object }) => Promise<void>;
		onerror?: () => void;
		id = 0;
		terminate = vi.fn();
		constructor() {
			instances.push(this);
		}
		postMessage(data: { id: number }) {
			this.id = data.id;
		}
	}
	vi.stubGlobal('Worker', FakeWorker);
	let finishWrite!: () => void;
	const put = vi.spyOn(assets, 'writeSpeechAsset').mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				finishWrite = resolve;
			})
	);
	vi.spyOn(assets, 'clearSpeechAssets').mockResolvedValue();
	const { ASSET_CACHE } = await import('./types');
	const remove = vi.fn();
	vi.stubGlobal('caches', {
		open: vi.fn(async () => ({ put })),
		keys: vi.fn(async () => [ASSET_CACHE, 'forest-drift.speech.voices.legacy', 'other-app']),
		delete: remove
	});
	const service = new SpeechService(vi.fn(), () => true);
	vi.spyOn(service.cache, 'get').mockResolvedValue(undefined);
	vi.spyOn(service.cache, 'clear').mockResolvedValue();
	const preparing = service.prepare([request()], vi.fn()).catch((error: Error) => error);
	await vi.waitFor(() => expect(instances[0]).toBeDefined());
	expect(remove).toHaveBeenCalledWith('forest-drift.speech.voices.legacy');
	expect(remove).not.toHaveBeenCalledWith(ASSET_CACHE);
	remove.mockClear();
	const instance = instances[0];
	await instance.onmessage!({
		data: {
			id: instance.id,
			asset: { file: 'model.q8.gguf', bytes: new Uint8Array([1, 2]) }
		}
	});
	await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
	expect(put).toHaveBeenCalledWith('model.q8.gguf', new Uint8Array([1, 2]));
	const clearing = service.clear();
	await Promise.resolve();
	expect(remove).not.toHaveBeenCalled();
	finishWrite();
	await clearing;
	expect(await preparing).toEqual(expect.objectContaining({ message: 'Preparation cancelled.' }));
	expect(remove.mock.calls.map(([name]) => name)).toEqual([
		ASSET_CACHE,
		'forest-drift.speech.voices.legacy'
	]);
	service.dispose();
});
