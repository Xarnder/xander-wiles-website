import { afterEach, expect, it, vi } from 'vitest';
import { LocalVoice } from './LocalVoice';
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
it('never uses remote voices', async () => {
	const speak = vi.fn();
	vi.stubGlobal('speechSynthesis', {
		getVoices: () => [{ localService: false, lang: 'en-US' }],
		speak
	});
	expect(await new LocalVoice().say('Hello.', 'en-US', vi.fn())).toBe('text');
	expect(speak).not.toHaveBeenCalled();
});
it('pairs captions with start events and resolves cancellation without stale events', async () => {
	vi.stubGlobal(
		'SpeechSynthesisUtterance',
		class {
			constructor(public text: string) {}
		}
	);
	let utterance: SpeechSynthesisUtterance;
	const cancel = vi.fn();
	vi.stubGlobal('speechSynthesis', {
		getVoices: () => [{ localService: true, lang: 'en-US', voiceURI: 'local' }],
		speak: (u: SpeechSynthesisUtterance) => (utterance = u),
		cancel
	});
	const local = new LocalVoice(),
		started = vi.fn();
	const playing = local.say('Hello.', 'en-US', started);
	expect(started).not.toHaveBeenCalled();
	utterance!.onstart?.({} as SpeechSynthesisEvent);
	expect(started).toHaveBeenCalledOnce();
	local.cancel();
	expect(await playing).toBe('cancelled');
	expect(utterance!.onend).toBeNull();
	expect(cancel).toHaveBeenCalledOnce();
});

it('expires a live turn even if its device voice never finishes', async () => {
	vi.useFakeTimers();
	vi.stubGlobal('SpeechSynthesisUtterance', class {});
	const cancel = vi.fn();
	vi.stubGlobal('speechSynthesis', {
		getVoices: () => [{ localService: true, lang: 'en-US' }],
		speak: vi.fn(),
		cancel
	});
	const local = new LocalVoice();
	const playing = local.say('Expired reply.', 'en-US', vi.fn(), Date.now() + 100);
	await vi.advanceTimersByTimeAsync(100);
	expect(await playing).toBe('cancelled');
	expect(cancel).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
});
it('falls back to text and releases timers when start callbacks are missing', async () => {
	vi.useFakeTimers();
	vi.stubGlobal('SpeechSynthesisUtterance', class {});
	vi.stubGlobal('speechSynthesis', {
		getVoices: () => [{ localService: true, lang: 'en-US' }],
		speak: vi.fn(),
		cancel: vi.fn()
	});
	const playing = new LocalVoice().say('Hello.', 'en-US', vi.fn());
	await vi.advanceTimersByTimeAsync(2000);
	expect(await playing).toBe('text');
	expect(vi.getTimerCount()).toBe(0);
});

it('ignores already queued device-voice callbacks after replacing the utterance', async () => {
	vi.stubGlobal('SpeechSynthesisUtterance', class {});
	const utterances: SpeechSynthesisUtterance[] = [];
	const cancel = vi.fn();
	vi.stubGlobal('speechSynthesis', {
		getVoices: () => [{ localService: true, lang: 'en-US' }],
		speak: (utterance: SpeechSynthesisUtterance) => utterances.push(utterance),
		cancel
	});
	const local = new LocalVoice();
	const oldStarted = vi.fn(),
		latestStarted = vi.fn();
	const old = local.say('Old.', 'en-US', oldStarted);
	const staleStart = utterances[0].onstart!;
	const staleEnd = utterances[0].onend!;
	const latest = local.say('Latest.', 'en-US', latestStarted);
	staleStart.call(utterances[0], {} as SpeechSynthesisEvent);
	staleEnd.call(utterances[0], {} as SpeechSynthesisEvent);
	expect(oldStarted).not.toHaveBeenCalled();
	expect(cancel).toHaveBeenCalledOnce();
	utterances[1].onstart?.({} as SpeechSynthesisEvent);
	expect(latestStarted).toHaveBeenCalledOnce();
	utterances[1].onend?.({} as SpeechSynthesisEvent);
	expect(await old).toBe('cancelled');
	expect(await latest).toBe('ended');
});
