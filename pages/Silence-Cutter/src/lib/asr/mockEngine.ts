import { classifyWord } from '../core/transcriptDetector';
import type { TranscriptWord } from '../core/types';
import {
	TranscriptionCancelledError,
	type EngineStatus,
	type LoadOptions,
	type LoadResult,
	type ModelSpec,
	type RuntimeInfo,
	type TranscribeOptions,
	type TranscribeResult,
	type TranscriptionEngine
} from './types';

export const MOCK_MODEL: ModelSpec = {
	id: 'mock-verbatim',
	family: 'mock',
	label: 'Mock verbatim engine (tests)',
	tier: 'Fast',
	repo: 'local/mock',
	verbatim: true,
	licence: { name: 'Test fixture', url: '', commercialUse: true, outputsRestricted: false },
	variants: [
		{
			backend: 'wasm',
			requiresF16: false,
			dtype: { encoder_model: 'none', decoder_model_merged: 'none' },
			files: []
		}
	],
	estimatedMemoryBytes: 0,
	notes: 'Deterministic engine for automated tests. Never downloads anything.'
};

/**
 * Deterministic engine for automated tests: finds loud stretches in the audio (simple energy
 * gate at 16 kHz) and labels them with scripted verbatim words. Exercises the full editor
 * pipeline without downloading a model.
 */
export class MockTranscriptionEngine implements TranscriptionEngine {
	readonly model = MOCK_MODEL;
	readonly transcriptionMode = 'verbatim' as const;
	private _status: EngineStatus = 'idle';
	private cancelled = false;
	returnedAudio: Float32Array | null = null;

	constructor(
		private readonly script: string[] = [
			'I',
			'think',
			'we...',
			'I',
			'think',
			'we',
			'should...',
			'[UM]',
			'we',
			'should',
			'probably',
			'launch',
			'on',
			'Thursday.'
		]
	) {}

	get status() {
		return this._status;
	}

	runtime(): RuntimeInfo {
		return {
			backend: 'wasm',
			adapterDescription: 'mock',
			f16: false,
			threads: 1,
			crossOriginIsolated: false
		};
	}

	async load(options: LoadOptions = {}): Promise<LoadResult> {
		options.onDownload?.({
			file: 'mock',
			loadedBytes: 1,
			totalBytes: 1,
			overallLoaded: 1,
			overallTotal: 1,
			bytesPerSecond: null,
			fromCache: true
		});
		this._status = 'ready';
		return {
			runtime: this.runtime(),
			variant: MOCK_MODEL.variants[0],
			loadMs: 0,
			filesMs: 0,
			sessionMs: 0,
			downloadedBytes: 0
		};
	}

	async unload() {
		this._status = 'idle';
	}

	cancel() {
		this.cancelled = true;
	}

	async transcribe(audio: Float32Array, options: TranscribeOptions): Promise<TranscribeResult> {
		this.cancelled = false;
		this._status = 'transcribing';
		const started = performance.now();
		const sr = 16000;
		const hop = 160;
		const spans: Array<[number, number]> = [];
		let open = -1;
		let quiet = 0;
		for (let i = 0; i + hop <= audio.length; i += hop) {
			let acc = 0;
			for (let j = i; j < i + hop; j++) acc += audio[j] * audio[j];
			const loud = Math.sqrt(acc / hop) > 0.02;
			if (loud) {
				if (open < 0) open = i;
				quiet = 0;
			} else if (open >= 0 && ++quiet > 8) {
				spans.push([open / sr, (i - quiet * hop) / sr]);
				open = -1;
				quiet = 0;
			}
		}
		if (open >= 0) spans.push([open / sr, audio.length / sr]);
		const words: TranscriptWord[] = spans.map(([start, end], i) => {
			const text = this.script[i % this.script.length];
			return { index: i, text, start, end: Math.max(start + 0.05, end), kind: classifyWord(text) };
		});
		await new Promise((r) => setTimeout(r, 10));
		if (this.cancelled) {
			this.returnedAudio = audio;
			this._status = 'ready';
			throw new TranscriptionCancelledError();
		}
		options.onWords?.(words);
		const total = audio.length / sr;
		options.onProgress?.({
			processedSeconds: total,
			totalSeconds: total,
			chunkIndex: 1,
			chunkCount: 1,
			speedFactor: null
		});
		this.returnedAudio = audio;
		this._status = 'ready';
		const wallMs = performance.now() - started;
		return {
			transcript: {
				engineId: 'mock',
				modelId: MOCK_MODEL.id,
				language: options.language,
				mode: 'verbatim',
				words,
				duration: total,
				createdAt: Date.now()
			},
			wallMs,
			realTimeFactor: total / Math.max(1e-3, wallMs / 1000)
		};
	}
}
