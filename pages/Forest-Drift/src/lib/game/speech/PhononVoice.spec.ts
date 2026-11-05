import { beforeEach, expect, it, vi } from 'vitest';
import { Model } from 'phonon-tts/raw';
import { PhononVoice } from './PhononVoice';
import { LIMITS, NARRATOR } from './types';

vi.mock('phonon-tts/raw', () => ({ default: vi.fn(), Model: { load: vi.fn() } }));

const model = {
	add_voice: vi.fn(() => 7),
	flush: vi.fn(),
	sample_rate: vi.fn(() => 24000),
	start_generation: vi.fn(),
	next_chunk: vi.fn<() => number | undefined>(),
	generation_step: vi.fn<() => Promise<Float32Array | undefined>>(),
	stop_generation: vi.fn(),
	free: vi.fn()
};
const keep = vi.fn();
const download = vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), keep }));

function utterance(...chunks: Float32Array[]) {
	model.next_chunk.mockReturnValueOnce(1).mockReturnValueOnce(undefined);
	for (const chunk of chunks) model.generation_step.mockResolvedValueOnce(chunk);
	model.generation_step.mockResolvedValueOnce(undefined);
}

beforeEach(() => {
	vi.clearAllMocks();
	model.next_chunk.mockReset();
	model.generation_step.mockReset();
	vi.mocked(Model.load).mockResolvedValue(model as unknown as Model);
});

it('collects all audio chunks and reuses the loaded model for the next phrase', async () => {
	const voice = new PhononVoice();
	utterance(new Float32Array([0.1, 0.2]), new Float32Array([0.3]));
	const first = await voice.generate('Hello.', NARRATOR.profile, download, vi.fn());
	expect(first.sampleRate).toBe(24000);
	expect(first.pcm).toEqual(new Float32Array([0.1, 0.2, 0.3]));
	utterance(new Float32Array([0.4]));
	await voice.generate('Next.', NARRATOR.profile, download, vi.fn());
	expect(Model.load).toHaveBeenCalledOnce();
	expect(download).toHaveBeenCalledTimes(4);
	expect(keep).toHaveBeenCalledTimes(4);
	expect(model.start_generation).toHaveBeenLastCalledWith(7, 'Next.', 0.3, 4242424242424242n);
	expect(model.stop_generation).toHaveBeenCalledTimes(2);
});

it('reloads the model when a speaker changes the duration conditioner', async () => {
	const voice = new PhononVoice();
	utterance(new Float32Array([0.1]));
	await voice.generate('Hello.', NARRATOR.profile, download, vi.fn());
	utterance(new Float32Array([0.1]));
	await voice.generate('Hello.', { ...NARRATOR.profile, durationDelta: 0.3 }, download, vi.fn());
	expect(model.free).toHaveBeenCalledOnce();
	expect(vi.mocked(Model.load).mock.calls[1].slice(3)).toEqual([
		'q8',
		'en',
		'default',
		['duration_delta=0.3'],
		'cpu'
	]);
});

it('rejects unsupported voices and languages before downloading', async () => {
	const voice = new PhononVoice();
	await expect(
		voice.generate('Hello.', { ...NARRATOR.profile, voice: 'bm_george' }, download, vi.fn())
	).rejects.toThrow('voice profile');
	await expect(
		voice.generate('Bonjour.', { ...NARRATOR.profile, language: 'fr' }, download, vi.fn())
	).rejects.toThrow('English');
	expect(download).not.toHaveBeenCalled();
});

it.each([
	['non-finite', new Float32Array([NaN])],
	['oversized', new Float32Array(24000 * LIMITS.clipSeconds + 1)],
	['empty', new Float32Array()]
])('stops generation before retaining %s output', async (_name, pcm) => {
	utterance(pcm);
	await expect(
		new PhononVoice().generate('Hello.', NARRATOR.profile, download, vi.fn())
	).rejects.toThrow('generated audio');
	expect(model.stop_generation).toHaveBeenCalledOnce();
});

it('does not save failed initialization as a reusable model', async () => {
	model.flush.mockRejectedValueOnce(new Error('Voice could not load.'));
	const voice = new PhononVoice();
	await expect(voice.generate('Hello.', NARRATOR.profile, download, vi.fn())).rejects.toThrow(
		'Voice'
	);
	expect(model.free).toHaveBeenCalledOnce();
	expect(keep).not.toHaveBeenCalled();
	utterance(new Float32Array([0.1]));
	await voice.generate('Hello.', NARRATOR.profile, download, vi.fn());
	expect(Model.load).toHaveBeenCalledTimes(2);
});
