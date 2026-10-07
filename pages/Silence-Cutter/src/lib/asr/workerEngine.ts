import type { Transcript, TranscriptWord } from '../core/types';
import { chooseVariant } from './models';
import type { AsrRequest, AsrResponse, ChunkDiagnostics } from './protocol';
import {
	TranscriptionCancelledError,
	type EngineStatus,
	type LoadOptions,
	type LoadResult,
	type ModelSpec,
	type ModelVariant,
	type RuntimeInfo,
	type TranscribeOptions,
	type TranscribeResult,
	type TranscriptionEngine
} from './types';

export interface EngineCapabilities {
	webgpu: boolean;
	f16: boolean;
}

/**
 * TranscriptionEngine backed by asr.worker.ts. Inference runs off the main thread; audio is
 * transferred (not copied) to the worker and handed back when the call completes.
 */
export class WorkerTranscriptionEngine implements TranscriptionEngine {
	private worker: Worker | null = null;
	private _status: EngineStatus = 'idle';
	private _runtime: RuntimeInfo | null = null;
	private variant: ModelVariant | null = null;
	readonly chunkDiagnostics: ChunkDiagnostics[] = [];
	/** Audio handed back by the worker after the last transcription (ownership returns). */
	returnedAudio: Float32Array | null = null;

	constructor(
		readonly model: ModelSpec,
		private readonly caps: EngineCapabilities
	) {}

	get status(): EngineStatus {
		return this._status;
	}

	get transcriptionMode() {
		return this.model.verbatim ? ('verbatim' as const) : ('standard' as const);
	}

	runtime(): RuntimeInfo | null {
		return this._runtime;
	}

	selectedVariant(prefer?: 'webgpu' | 'wasm'): ModelVariant | null {
		return chooseVariant(this.model, this.caps, prefer);
	}

	private ensureWorker(): Worker {
		if (!this.worker) {
			this.worker = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' });
		}
		return this.worker;
	}

	private request<T>(
		msg: AsrRequest,
		transfer: Transferable[],
		handle: (res: AsrResponse, resolve: (v: T) => void, reject: (e: unknown) => void) => void
	): Promise<T> {
		const worker = this.ensureWorker();
		return new Promise<T>((resolve, reject) => {
			const onMessage = (e: MessageEvent<AsrResponse>) => {
				handle(e.data, done(resolve), done(reject));
			};
			const onError = (e: ErrorEvent) => done(reject)(new Error(e.message || 'ASR worker crashed'));
			const done =
				<A>(fn: (a: A) => void) =>
				(a: A) => {
					worker.removeEventListener('message', onMessage);
					worker.removeEventListener('error', onError);
					fn(a);
				};
			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);
			worker.postMessage(msg, transfer);
		});
	}

	async load(options: LoadOptions = {}): Promise<LoadResult> {
		const variant = this.selectedVariant(options.preferBackend);
		if (!variant) throw new Error(`${this.model.label} cannot run on this device.`);
		this.variant = variant;
		this._status = 'downloading';
		try {
			const result = await this.request<LoadResult>(
				{ type: 'load', model: this.model, variant },
				[],
				(res, resolve, reject) => {
					if (res.type === 'download') {
						if (res.progress.overallLoaded >= res.progress.overallTotal) this._status = 'loading';
						options.onDownload?.(res.progress);
					} else if (res.type === 'loaded') {
						this._runtime = res.runtime;
						resolve({
							runtime: res.runtime,
							variant,
							loadMs: res.loadMs,
							filesMs: res.filesMs,
							sessionMs: res.sessionMs,
							downloadedBytes: res.downloadedBytes
						});
					} else if (res.type === 'error') {
						reject(new Error(res.message));
					}
				}
			);
			this._status = 'ready';
			return result;
		} catch (err) {
			this._status = 'error';
			this.worker?.terminate();
			this.worker = null;
			throw err;
		}
	}

	async transcribe(audio: Float32Array, options: TranscribeOptions): Promise<TranscribeResult> {
		if (this._status !== 'ready') throw new Error('Model is not loaded');
		this._status = 'transcribing';
		this.chunkDiagnostics.length = 0;
		this.returnedAudio = null;
		try {
			const res = await this.request<{
				words: TranscriptWord[];
				wallMs: number;
				audioSeconds: number;
			}>(
				{ type: 'transcribe', audio, language: options.language, mode: options.mode },
				[audio.buffer],
				(res, resolve, reject) => {
					switch (res.type) {
						case 'progress':
							options.onProgress?.(res.progress);
							break;
						case 'words':
							options.onWords?.(res.words);
							break;
						case 'chunk':
							this.chunkDiagnostics.push(res.diagnostics);
							break;
						case 'done':
							this.returnedAudio = res.audio;
							resolve(res);
							break;
						case 'cancelled':
							this.returnedAudio = res.audio;
							reject(new TranscriptionCancelledError());
							break;
						case 'error':
							this.returnedAudio = res.audio;
							reject(new Error(res.message));
							break;
					}
				}
			);
			const transcript: Transcript = {
				engineId: this.model.family,
				modelId: this.model.id,
				language: options.language,
				mode: this.model.verbatim ? options.mode : 'standard',
				words: res.words,
				duration: res.audioSeconds,
				createdAt: Date.now()
			};
			return {
				transcript,
				wallMs: res.wallMs,
				realTimeFactor: res.audioSeconds / Math.max(1e-3, res.wallMs / 1000)
			};
		} finally {
			this._status = 'ready';
		}
	}

	cancel(): void {
		this.worker?.postMessage({ type: 'cancel' } satisfies AsrRequest);
	}

	async unload(): Promise<void> {
		if (!this.worker) return;
		this.worker.terminate();
		this.worker = null;
		this._status = 'idle';
		this._runtime = null;
	}

	get loadedVariant(): ModelVariant | null {
		return this.variant;
	}
}
