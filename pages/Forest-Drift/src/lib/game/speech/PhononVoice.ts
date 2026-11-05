import init, { Model } from 'phonon-tts/raw';
import wasmUrl from 'phonon-tts/wasm/phonon_tts_simd_bg.wasm?url';
import { LIMITS, MODEL_FILES, SYNTHESIS, type VoiceProfile } from './types';

type Asset = { bytes: Uint8Array; keep: () => void };
type Download = (file: (typeof MODEL_FILES)[number]) => Promise<Asset>;

/** The public raw API runs inside our existing, immediately terminable preparation worker. */
export class PhononVoice {
	private model?: Model;
	private voice = 0;
	private durationDelta?: number;
	async generate(text: string, profile: VoiceProfile, download: Download, started: () => void) {
		if (!text.trim() || text.length > LIMITS.phraseCharacters)
			throw new Error('Phrase exceeds limit or is empty.');
		if (profile.language.split('-')[0] !== 'en')
			throw new Error('This Phonon model speaks English only.');
		if (profile.voice !== 'default') throw new Error('Unknown Phonon voice profile.');
		if (!Number.isFinite(profile.durationDelta)) throw new Error('Invalid speech duration.');
		if (!this.model || this.durationDelta !== profile.durationDelta) {
			this.model?.free();
			this.model = undefined;
			// Standard SIMD also works in Safari/iOS; a single CPU worker leaves the GPU to the world.
			await init({ module_or_path: wasmUrl });
			const files = await Promise.all(MODEL_FILES.map(download));
			const [weights, tokenizer, config, voice] = files;
			const model = await Model.load(
				weights.bytes,
				tokenizer.bytes,
				config.bytes,
				'q8',
				'en',
				'default',
				[`duration_delta=${profile.durationDelta}`],
				'cpu'
			);
			try {
				this.voice = model.add_voice(voice.bytes);
				await model.flush();
				if (model.sample_rate() !== 24000) throw new Error('Unsupported speech sample rate.');
			} catch (error) {
				model.free();
				throw error;
			}
			this.model = model;
			this.durationDelta = profile.durationDelta;
			for (const file of files) file.keep();
		}
		const model = this.model;
		const chunks: Float32Array[] = [];
		let samples = 0;
		started();
		try {
			model.start_generation(this.voice, text, SYNTHESIS.temperature, BigInt(SYNTHESIS.seed));
			while (model.next_chunk() !== undefined) {
				for (;;) {
					const pcm: unknown = await model.generation_step();
					if (pcm === undefined) break;
					if (
						!(pcm instanceof Float32Array) ||
						pcm.length === 0 ||
						!pcm.every(Number.isFinite) ||
						samples + pcm.length > 24000 * LIMITS.clipSeconds
					)
						throw new Error('Invalid or oversized generated audio.');
					chunks.push(pcm);
					samples += pcm.length;
				}
			}
		} finally {
			model.stop_generation();
		}
		if (!samples) throw new Error('Phonon generated no audio.');
		const pcm = new Float32Array(samples);
		let offset = 0;
		for (const chunk of chunks) {
			pcm.set(chunk, offset);
			offset += chunk.length;
		}
		return { pcm, sampleRate: 24000 };
	}
}
