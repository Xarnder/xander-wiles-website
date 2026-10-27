import { expect, it, vi } from 'vitest';
import { SpeechWindow } from './SpeechWindow';
import type { SpeechService } from './SpeechService';
import { NARRATOR, clipKey, type SpeechRequest } from './types';
const request = (text: string): SpeechRequest => ({
	id: text,
	text,
	session: 's',
	speaker: NARRATOR,
	mode: 'scripted',
	contentId: text,
	version: 1
});
function harness() {
	const cached = new Set<string>();
	const generated: string[] = [];
	const pending: (() => void)[] = [];
	const service = {
		cache: { get: vi.fn(async (key: string) => (cached.has(key) ? {} : undefined)) },
		prepare: vi.fn(async (requests: SpeechRequest[]) => {
			generated.push(requests[0].text);
			await new Promise<void>((resolve) => pending.push(resolve));
			cached.add(clipKey(requests[0].text, NARRATOR.profile));
		}),
		stopPreparation: vi.fn()
	} as unknown as SpeechService;
	const buffer = new SpeechWindow(
		service,
		() => true,
		vi.fn(),
		async () => {}
	);
	return { buffer, generated, pending, cached, service };
}
it('prepares only three instructions and resolves each as soon as its own audio is ready', async () => {
	const h = harness();
	try {
		h.buffer.setWindow(['One.', 'Two.', 'Three.', 'Four.'].map(request));
		await vi.waitFor(() => expect(h.generated).toEqual(['One.']));
		const first = h.buffer.ensure(request('One.'), () => true);
		h.pending.shift()!();
		expect(await first).toBe(true);
		await vi.waitFor(() => expect(h.generated).toEqual(['One.', 'Two.']));
		h.pending.shift()!();
		await vi.waitFor(() => expect(h.generated).toEqual(['One.', 'Two.', 'Three.']));
		h.pending.shift()!();
		expect(await h.buffer.ensure(request('Three.'), () => true)).toBe(true);
		expect(h.generated).not.toContain('Four.');
	} finally {
		h.buffer.dispose();
	}
});
it('retargets after the current phrase without generating obsolete lookahead', async () => {
	const h = harness();
	try {
		h.buffer.setWindow(['Old.', 'Obsolete.'].map(request));
		await vi.waitFor(() => expect(h.generated).toEqual(['Old.']));
		h.buffer.setWindow([request('Latest.')]);
		h.pending.shift()!();
		await vi.waitFor(() => expect(h.generated).toEqual(['Old.', 'Latest.']));
		h.pending.shift()!();
		expect(await h.buffer.ensure(request('Latest.'), () => true)).toBe(true);
		expect(await h.buffer.ensure(request('Old.'), () => false)).toBe(false);
	} finally {
		h.buffer.dispose();
	}
});
it('uses cached speech even while background generation is paused', async () => {
	const h = harness();
	h.cached.add(clipKey('Cached.', NARRATOR.profile));
	const buffer = new SpeechWindow(h.service, () => false, vi.fn());
	try {
		buffer.setWindow([request('Cached.')]);
		expect(await buffer.ensure(request('Cached.'), () => true)).toBe(true);
		expect(h.service.prepare).not.toHaveBeenCalled();
	} finally {
		buffer.dispose();
		h.buffer.dispose();
	}
});
it('surfaces failures and releases a waiter when disposed', async () => {
	const h = harness();
	vi.mocked(h.service.prepare).mockRejectedValue(new Error('download failed'));
	h.buffer.setWindow([request('Fail.')]);
	await expect(h.buffer.ensure(request('Fail.'), () => true)).rejects.toThrow('download failed');
	h.buffer.dispose();
	expect(await h.buffer.ensure(request('Fail.'), () => true)).toBe(false);
});

it('does not let a late failure from an obsolete window poison the newest request', async () => {
	const h = harness();
	let rejectOld!: (reason: Error) => void;
	vi.mocked(h.service.prepare).mockImplementationOnce(
		() =>
			new Promise((_resolve, reject) => {
				rejectOld = reject;
			})
	);
	try {
		h.buffer.setWindow([request('Old.')]);
		await vi.waitFor(() => expect(h.service.prepare).toHaveBeenCalledOnce());
		const oldWait = h.buffer.ensure(request('Old.'), () => true);
		h.buffer.setWindow([request('New.')]);
		rejectOld(new Error('Old worker failed'));
		expect(await oldWait).toBe(false);
		await vi.waitFor(() => expect(h.generated).toEqual(['New.']));
		h.pending.shift()!();
		expect(await h.buffer.ensure(request('New.'), () => true)).toBe(true);
	} finally {
		h.buffer.dispose();
	}
});

it('retries transient failures but stops after a bounded number of attempts', async () => {
	const h = harness();
	vi.mocked(h.service.prepare).mockRejectedValue(new Error('Network fetch failed'));
	try {
		h.buffer.setWindow([request('Retry.')]);
		await expect(h.buffer.ensure(request('Retry.'), () => true)).rejects.toThrow(
			'Network fetch failed'
		);
		expect(h.service.prepare).toHaveBeenCalledTimes(3);
	} finally {
		h.buffer.dispose();
	}
});

it('disposal during a slow cache read cannot start a new generation', async () => {
	const h = harness();
	let resolve!: (value: undefined) => void;
	vi.mocked(h.service.cache.get).mockImplementation(
		() =>
			new Promise((r) => {
				resolve = r;
			})
	);
	h.buffer.setWindow([request('Late.')]);
	const waiting = h.buffer.ensure(request('Late.'), () => true);
	h.buffer.dispose();
	resolve(undefined);
	expect(await waiting).toBe(false);
	await Promise.resolve();
	expect(h.service.prepare).not.toHaveBeenCalled();
});

it('starts ready current speech without waiting for lookahead storage', async () => {
	const h = harness();
	h.cached.add(clipKey('Current.', NARRATOR.profile));
	let resolve!: (value: undefined) => void;
	const get = vi.mocked(h.service.cache.get).getMockImplementation()!;
	vi.mocked(h.service.cache.get).mockImplementation((key) =>
		key === clipKey('Ahead.', NARRATOR.profile)
			? new Promise((r) => {
					resolve = r;
				})
			: get(key)
	);
	try {
		h.buffer.setWindow([request('Current.'), request('Ahead.')]);
		expect(await h.buffer.ensure(request('Current.'), () => true)).toBe(true);
	} finally {
		h.buffer.dispose();
		resolve?.(undefined);
	}
});

it('reports unresponsive storage instead of buffering forever', async () => {
	vi.useFakeTimers();
	const h = harness();
	vi.mocked(h.service.cache.get).mockImplementation(() => new Promise(() => {}));
	try {
		h.buffer.setWindow([request('Stuck.')]);
		const result = h.buffer.ensure(request('Stuck.'), () => true).catch((error: Error) => error);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(await result).toEqual(
			expect.objectContaining({ message: expect.stringContaining('storage is not responding') })
		);
		expect(h.service.prepare).not.toHaveBeenCalled();
	} finally {
		h.buffer.dispose();
		vi.useRealTimers();
	}
});

it('navigation bypasses a hung old cache read without waiting for its timeout', async () => {
	const h = harness();
	h.cached.add(clipKey('New.', NARRATOR.profile));
	const get = vi.mocked(h.service.cache.get).getMockImplementation()!;
	vi.mocked(h.service.cache.get).mockImplementation((key) =>
		key === clipKey('Old.', NARRATOR.profile) ? new Promise(() => {}) : get(key)
	);
	try {
		h.buffer.setWindow([request('Old.')]);
		h.buffer.setWindow([request('New.')]);
		expect(await h.buffer.ensure(request('New.'), () => true)).toBe(true);
		expect(h.service.prepare).not.toHaveBeenCalled();
	} finally {
		h.buffer.dispose();
	}
});

it('recovers from a transient download failure and releases waiting speech', async () => {
	const h = harness();
	vi.mocked(h.service.prepare).mockRejectedValueOnce(new Error('Network fetch failed'));
	try {
		h.buffer.setWindow([request('Recovered.')]);
		const ready = h.buffer.ensure(request('Recovered.'), () => true);
		await vi.waitFor(() => expect(h.generated).toEqual(['Recovered.']));
		h.pending.shift()!();
		expect(await ready).toBe(true);
		expect(h.service.prepare).toHaveBeenCalledTimes(2);
	} finally {
		h.buffer.dispose();
	}
});
