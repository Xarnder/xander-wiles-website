import type { Transcript, TranscriptionMode, TranscriptWord } from '../core/types';

export type AsrBackend = 'webgpu' | 'wasm';

export interface ModelFile {
	path: string;
	bytes: number;
}

export interface ModelVariant {
	backend: AsrBackend;
	/** Requires the WebGPU `shader-f16` feature. */
	requiresF16: boolean;
	/** Per-session dtype passed to Transformers.js. */
	dtype: { encoder_model: string; decoder_model_merged: string };
	files: ModelFile[];
}

export type EngineFamily = 'crisperwhisper' | 'whisper' | 'mock';

export interface ModelSpec {
	id: string;
	family: EngineFamily;
	label: string;
	tier: 'Fast' | 'Balanced' | 'Best accuracy';
	repo: string;
	/** Genuine verbatim model (keeps fillers, repetitions, stutters, false starts). */
	verbatim: boolean;
	licence: { name: string; url: string; commercialUse: boolean; outputsRestricted: boolean };
	/** Variants in order of preference. */
	variants: ModelVariant[];
	/** Rough runtime memory requirement in bytes (weights + activations + KV cache). */
	estimatedMemoryBytes: number;
	notes: string;
}

export interface RuntimeInfo {
	backend: AsrBackend;
	/** e.g. "Apple M-series GPU (metal-3)" when exposed by the adapter. */
	adapterDescription: string | null;
	f16: boolean;
	threads: number;
	crossOriginIsolated: boolean;
}

export type EngineStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'transcribing' | 'error';

export interface DownloadProgress {
	file: string;
	loadedBytes: number;
	totalBytes: number;
	/** Aggregated over all files of the selected variant. */
	overallLoaded: number;
	overallTotal: number;
	bytesPerSecond: number | null;
	fromCache: boolean;
}

export interface TranscribeProgress {
	processedSeconds: number;
	totalSeconds: number;
	chunkIndex: number;
	chunkCount: number;
	/** Seconds of audio per second of wall time so far. */
	speedFactor: number | null;
}

export interface TranscribeOptions {
	language: string;
	/** Only `verbatim` is used by the editor. `intended` exists for completeness/testing. */
	mode: 'verbatim' | 'intended';
	onProgress?: (p: TranscribeProgress) => void;
	/** Streams confirmed words as each window completes (absolute source timestamps). */
	onWords?: (words: TranscriptWord[]) => void;
}

export interface LoadOptions {
	preferBackend?: AsrBackend;
	onDownload?: (p: DownloadProgress) => void;
}

export interface LoadResult {
	runtime: RuntimeInfo;
	variant: ModelVariant;
	loadMs: number;
	filesMs: number;
	sessionMs: number;
	downloadedBytes: number;
}

export interface TranscribeResult {
	transcript: Transcript;
	wallMs: number;
	/** audio seconds / wall seconds */
	realTimeFactor: number;
}

/**
 * The editor talks to ASR exclusively through this interface; models are pluggable. All
 * implementations run fully on-device — audio never leaves the browser.
 */
export interface TranscriptionEngine {
	readonly model: ModelSpec;
	readonly status: EngineStatus;
	/** What `transcribe` will produce: `verbatim` only for genuine verbatim models. */
	readonly transcriptionMode: TranscriptionMode;
	load(options?: LoadOptions): Promise<LoadResult>;
	unload(): Promise<void>;
	/** `audio` is 16 kHz mono PCM. Ownership is transferred to the engine for the call. */
	transcribe(audio: Float32Array, options: TranscribeOptions): Promise<TranscribeResult>;
	cancel(): void;
	runtime(): RuntimeInfo | null;
}

export class TranscriptionCancelledError extends Error {
	constructor() {
		super('Transcription cancelled');
		this.name = 'TranscriptionCancelledError';
	}
}
