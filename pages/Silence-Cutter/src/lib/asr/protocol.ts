import type { TranscriptWord } from '../core/types';
import type {
	DownloadProgress,
	ModelSpec,
	ModelVariant,
	RuntimeInfo,
	TranscribeProgress
} from './types';

export type AsrRequest =
	| { type: 'load'; model: ModelSpec; variant: ModelVariant }
	| {
			type: 'transcribe';
			audio: Float32Array;
			language: string;
			mode: 'verbatim' | 'intended';
	  }
	| { type: 'cancel' }
	| { type: 'unload' };

export interface ChunkDiagnostics {
	index: number;
	tokens: number;
	words: number;
	decodeMs: number;
	repairs: number;
	fallback: boolean;
	/** Early-EOT recovery extended this window. */
	recovered: boolean;
	/** The window was re-decoded without continuation context. */
	contextReset: boolean;
	/** Gaps were filled from a window re-aligned to start at the skipped speech. */
	shifted: boolean;
	/** Speech-active seconds left uncovered by the continuation decode (before any reset). */
	uncoveredSeconds: number;
	encoderMs: number;
	/** Mean wall time per decoder step (forward + attention capture). */
	stepMs: number;
}

export type AsrResponse =
	| { type: 'download'; progress: DownloadProgress }
	| {
			type: 'loaded';
			runtime: RuntimeInfo;
			loadMs: number;
			/** Time until the last model file was downloaded / read from cache. */
			filesMs: number;
			/** Remaining time: ONNX Runtime session creation (graph optimisation, shader setup). */
			sessionMs: number;
			downloadedBytes: number;
	  }
	| { type: 'progress'; progress: TranscribeProgress }
	| { type: 'words'; words: TranscriptWord[] }
	| { type: 'chunk'; diagnostics: ChunkDiagnostics }
	| {
			type: 'done';
			words: TranscriptWord[];
			wallMs: number;
			audioSeconds: number;
			audio: Float32Array;
	  }
	| { type: 'cancelled'; audio: Float32Array | null }
	| { type: 'error'; message: string; audio: Float32Array | null }
	| { type: 'unloaded' };
