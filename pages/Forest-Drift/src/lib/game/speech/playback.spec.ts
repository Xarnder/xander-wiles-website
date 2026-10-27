import { afterEach, expect, it, vi } from 'vitest';
import { SpeechService } from './SpeechService';
import { NARRATOR, type SpeechRequest } from './types';
const request = (text: string): SpeechRequest => ({
	id: text,
	text,
	speaker: NARRATOR,
	session: 'test',
	mode: 'scripted',
	contentId: text,
	version: 1
});
function harness() {
	const frames = new Map<number, FrameRequestCallback>();
	let id = 0;
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		frames.set(++id, callback);
		return id;
	});
	vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
	const sources: {
		stop: ReturnType<typeof vi.fn>;
		start: ReturnType<typeof vi.fn>;
		onended?: (() => void) | null;
	}[] = [];
	const context = {
		currentTime: 0,
		state: 'running',
		outputLatency: 0.1,
		destination: {},
		resume: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		createBuffer: (_channels: number, length: number) => ({
			getChannelData: () => new Float32Array(length)
		}),
		createGain: () => ({
			gain: { value: 1, setTargetAtTime: vi.fn() },
			connect: vi.fn(),
			disconnect: vi.fn()
		}),
		createBufferSource: () => {
			const source = {
				start: vi.fn(),
				stop: vi.fn(),
				connect: vi.fn(),
				disconnect: vi.fn(),
				onended: null
			};
			sources.push(source);
			return source;
		}
	};
	vi.stubGlobal(
		'AudioContext',
		class {
			constructor() {
				return context;
			}
		}
	);
	const caption = vi.fn(),
		service = new SpeechService(caption);
	vi.spyOn(service.cache, 'get').mockImplementation(async (key) => ({
		key,
		text: JSON.parse(key).at(-1),
		pcm: new Float32Array(2400),
		bytes: 9600,
		sampleRate: 24000,
		duration: 0.1,
		usedAt: 1,
		schema: 1
	}));
	const frame = (time: number) => {
		context.currentTime = time;
		const pending = [...frames.values()];
		frames.clear();
		for (const callback of pending) callback(time * 1000);
	};
	return { service, caption, frame, context, sources, frames };
}
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});
it('a cancelled clip cannot erase a newer speaker caption', async () => {
	const h = harness();
	await h.service.unlock();
	const old = h.service.speak(request('Old.'), true);
	await Promise.resolve();
	expect(h.sources).toHaveLength(1);
	expect(await h.service.speak(request('New.'), false)).toBe('text');
	expect(await old).toBe('cancelled');
	expect(h.caption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'New.' }));
	h.service.dispose();
});
it('keeps captions on the audible timeline and clears them during a delayed next-clip read', async () => {
	const h = harness();
	await h.service.unlock();
	let resolveNext!: (value: undefined) => void;
	const get = vi.mocked(h.service.cache.get);
	get
		.mockImplementationOnce(async (key) => ({
			key,
			text: 'One.',
			pcm: new Float32Array(2400),
			bytes: 9600,
			sampleRate: 24000,
			duration: 0.1,
			usedAt: 1,
			schema: 1
		}))
		.mockImplementationOnce(() => new Promise((resolve) => (resolveNext = resolve)));
	const playing = h.service.speak(request('One. Two.'), true);
	await Promise.resolve();
	h.frame(0.08);
	expect(h.caption).toHaveBeenLastCalledWith(null);
	h.frame(0.15);
	expect(h.caption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'One.' }));
	h.sources[0].onended?.();
	expect(h.caption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'One.' }));
	h.frame(0.25);
	await Promise.resolve();
	expect(h.caption).toHaveBeenLastCalledWith(null);
	resolveNext(undefined);
	expect(await playing).toBe('text');
	h.service.dispose();
});
it('returns text rather than false success when the audio context is interrupted', async () => {
	const h = harness();
	await h.service.unlock();
	const playing = h.service.speak(request('Hello.'), true);
	await Promise.resolve();
	h.context.state = 'suspended';
	h.frame(0.05);
	expect(await playing).toBe('text');
	expect(h.frames.size).toBe(0);
	expect(h.sources[0].stop).toHaveBeenCalled();
	h.service.dispose();
});
it('playback watchdog reports failure and cleans up frame callbacks', async () => {
	vi.useFakeTimers();
	const h = harness();
	await h.service.unlock();
	const playing = h.service.speak(request('Hello.'), true);
	await Promise.resolve();
	await vi.advanceTimersByTimeAsync(5100);
	expect(await playing).toBe('text');
	expect(h.frames.size).toBe(0);
	h.service.dispose();
});
it('disposed services cannot start new playback or an audio context', async () => {
	const h = harness();
	h.service.dispose();
	await expect(h.service.unlock()).rejects.toThrow('closed');
	expect(await h.service.speak(request('Hello.'), true)).toBe('cancelled');
	expect(h.sources).toHaveLength(0);
});

it('rapid navigation stops old audio before starting the latest clip and ignores retired frames', async () => {
	const h = harness();
	await h.service.unlock();
	const first = h.service.speak(request('First.'), true);
	await Promise.resolve();
	h.frame(0.15);
	expect(h.caption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'First.' }));
	const retiredFrame = [...h.frames.values()][0];
	const second = h.service.speak(request('Second.'), true);
	expect(h.sources[0].stop).toHaveBeenCalledOnce();
	expect(h.caption).toHaveBeenLastCalledWith(null);
	await Promise.resolve();
	const third = h.service.speak(request('First.'), true);
	expect(h.sources[1].stop).toHaveBeenCalledOnce();
	await Promise.resolve();
	h.frame(0.34);
	expect(h.caption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'First.' }));
	retiredFrame(350);
	expect(h.sources[0].stop).toHaveBeenCalledOnce();
	expect(h.caption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'First.' }));
	expect(h.sources[2].stop).not.toHaveBeenCalled();
	h.service.cancel();
	expect(h.sources[2].stop).toHaveBeenCalledOnce();
	expect(await Promise.all([first, second, third])).toEqual([
		'cancelled',
		'cancelled',
		'cancelled'
	]);
	expect(h.frames.size).toBe(0);
	h.service.dispose();
});

it('out-of-order cache reads cannot play an instruction superseded by rapid navigation', async () => {
	const h = harness();
	await h.service.unlock();
	const original = vi.mocked(h.service.cache.get).getMockImplementation()!;
	const pending: (() => Promise<void>)[] = [];
	vi.mocked(h.service.cache.get).mockImplementation(
		(key) =>
			new Promise((resolve) => {
				pending.push(async () => resolve(await original(key)));
			})
	);
	const old = h.service.speak(request('Old.'), true);
	const middle = h.service.speak(request('Middle.'), true);
	const latest = h.service.speak(request('Latest.'), true);
	await pending[2]();
	await Promise.resolve();
	expect(h.sources).toHaveLength(1);
	h.frame(0.15);
	expect(h.caption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Latest.' }));
	await pending[0]();
	await pending[1]();
	expect(await old).toBe('cancelled');
	expect(await middle).toBe('cancelled');
	expect(h.sources).toHaveLength(1);
	expect(h.caption).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Latest.' }));
	h.service.cancel();
	expect(await latest).toBe('cancelled');
	h.service.dispose();
});
