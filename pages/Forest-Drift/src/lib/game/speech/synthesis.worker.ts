/// <reference lib="webworker" />
import { ASSET_CACHE, MODEL_BASE_URL, MODEL_FILES, type VoiceProfile } from './types';
import { TransferProgress, type SpeechProgress } from './progress';
import { PhononVoice } from './PhononVoice';
import { readSpeechAsset } from './SpeechAssets';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new PhononVoice();
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
	const download = async (file: (typeof MODEL_FILES)[number]) => {
		const url = MODEL_BASE_URL + file;
		const saved = await readSpeechAsset(file);
		if (saved) {
			report('Reading saved Phonon model files…', { stage: 'loading', file });
			return { bytes: saved, keep: () => {} };
		}
		const cache =
			typeof caches === 'undefined' ? null : await caches.open(ASSET_CACHE).catch(() => null);
		const hit = await cache?.match(url).catch(() => undefined);
		if (hit) {
			report('Reading saved Phonon model files…', { stage: 'loading', file });
			const bytes = new Uint8Array(await hit.arrayBuffer());
			// Migrate a previous Phonon download to the portable store on the page.
			return {
				bytes,
				keep: () => scope.postMessage({ id: data.id, asset: { file, bytes } }, [bytes.buffer])
			};
		}
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Could not download ${file} (HTTP ${response.status}).`);
		const total = Number(response.headers.get('content-length')) || 0;
		const chunks: Uint8Array[] = [];
		let loaded = 0;
		if (response.body) {
			const reader = response.body.getReader();
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				loaded += value.length;
				const now = performance.now();
				const detail = transfers.update(file, loaded, total, now);
				if (now - lastReport >= 250) {
					lastReport = now;
					report('Downloading Phonon voice files…', detail);
				}
			}
		} else {
			const bytes = new Uint8Array(await response.arrayBuffer());
			chunks.push(bytes);
			loaded = bytes.length;
		}
		const bytes = new Uint8Array(loaded);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		return {
			bytes,
			// Persist on the page in IndexedDB, including in private WebKit sessions.
			// Transfer after Phonon has copied the bytes into its own memory.
			keep: () => scope.postMessage({ id: data.id, asset: { file, bytes } }, [bytes.buffer])
		};
	};
	try {
		report('Loading the Phonon speech runtime…', { stage: 'loading' });
		const audio = await engine.generate(data.text, data.profile, download, () =>
			report('Generating the current speech clip…', { stage: 'generating' })
		);
		scope.postMessage({ id: data.id, ...audio }, [audio.pcm.buffer]);
	} catch (error) {
		scope.postMessage({
			id: data.id,
			error: error instanceof Error ? error.message : 'Speech generation failed.'
		});
	} finally {
		busy = false;
	}
};
