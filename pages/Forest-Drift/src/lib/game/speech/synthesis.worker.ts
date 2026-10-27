/// <reference lib="webworker" />
import { ASSET_CACHE, VOICE_CACHE, MODEL, REVISION, LIMITS, type VoiceProfile } from './types';
import { TransferProgress, type SpeechProgress } from './progress';
const scope = self as unknown as DedicatedWorkerGlobalScope;
// Kokoro's voice loader uses a fixed upstream URL/cache name. Isolate and pin both in this worker.
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	if (url.includes(`${MODEL}/resolve/main/voices/`))
		return originalFetch(url.replace('/resolve/main/', `/resolve/${REVISION}/`), init);
	return originalFetch(input, init);
};
if (typeof caches !== 'undefined') {
	const originalOpen = caches.open.bind(caches);
	caches.open = (name) => originalOpen(name === 'kokoro-voices' ? VOICE_CACHE : name);
}
let engine: import('kokoro-js').KokoroTTS | undefined;
let busy = false;
scope.onmessage = async ({
	data
}: MessageEvent<{ id: number; text: string; profile: VoiceProfile }>) => {
	if (busy) {
		scope.postMessage({ id: data.id, error: 'Speech worker is busy.' });
		return;
	}
	busy = true;
	const transfers = new TransferProgress();
	let lastReport = -Infinity;
	const report = (progress: string, detail: SpeechProgress) =>
		scope.postMessage({ id: data.id, progress, detail });
	const assetProgress = (event: {
		status: string;
		file?: string;
		loaded?: number;
		total?: number;
	}) => {
		if (event.status === 'progress' && event.file && typeof event.loaded === 'number') {
			const now = performance.now();
			const detail = transfers.update(event.file, event.loaded, event.total ?? 0, now);
			if (now - lastReport < 250) return;
			lastReport = now;
			report('Downloading or reading saved model files…', detail);
		} else if (event.status === 'done') {
			report('Loading model files and initializing the voice runtime…', {
				stage: 'loading',
				file: event.file
			});
		}
	};
	report('Loading the speech runtime…', { stage: 'loading' });
	try {
		if (data.text.length > LIMITS.phraseCharacters) throw new Error('Phrase exceeds limit.');
		if (!engine) {
			const [{ KokoroTTS }, { env, StyleTextToSpeech2Model, AutoTokenizer }] = await Promise.all([
				import('kokoro-js'),
				import('@huggingface/transformers')
			]);
			env.allowLocalModels = false;
			env.backends.onnx.wasm!.numThreads = 1;
			env.useBrowserCache = false;
			try {
				env.customCache = await caches.open(ASSET_CACHE);
				env.useCustomCache = true;
			} catch {
				env.useCustomCache = false;
			}
			scope.postMessage({
				id: data.id,
				progress: 'Downloading and loading the local voice model…',
				detail: { stage: 'loading' }
			});
			const model = await StyleTextToSpeech2Model.from_pretrained(MODEL, {
				revision: REVISION,
				dtype: 'q8',
				device: 'wasm',
				progress_callback: assetProgress
			});
			const tokenizer = await AutoTokenizer.from_pretrained(MODEL, {
				revision: REVISION,
				progress_callback: assetProgress
			});
			engine = new KokoroTTS(model, tokenizer);
		}
		if (!(data.profile.voice in engine.voices)) throw new Error('Unknown voice profile.');
		report('Generating the current speech clip…', { stage: 'generating' });
		const audio = await engine.generate(data.text, {
			voice: data.profile.voice as keyof typeof engine.voices,
			speed: data.profile.speed
		});
		const pcm = audio.audio;
		if (
			!(pcm instanceof Float32Array) ||
			pcm.length > 24000 * LIMITS.clipSeconds ||
			!pcm.every(Number.isFinite)
		)
			throw new Error('Invalid generated audio.');
		scope.postMessage({ id: data.id, pcm, sampleRate: audio.sampling_rate }, [pcm.buffer]);
	} catch (error) {
		scope.postMessage({
			id: data.id,
			error: error instanceof Error ? error.message : 'Speech generation failed.'
		});
	} finally {
		busy = false;
	}
};
