import { encoderOperation } from './encoder-operation';
import { resolve } from '$app/paths';
import type { FFmpeg, LogEvent, ProgressEvent as FfmpegProgress } from '@ffmpeg/ffmpeg';
import { parseProbeOutput } from './format';
import { prefersNativeShareSave, shouldUseMultiThreadFfmpeg } from './platform';

export interface FfmpegHandle {
	ffmpeg: FFmpeg;
	multiThread: boolean;
	logs: string[];
}

let handle: FfmpegHandle | undefined;
let loadPromise: Promise<FfmpegHandle> | undefined;

export function isCrossOriginIsolated(): boolean {
	return typeof globalThis !== 'undefined' && globalThis.crossOriginIsolated === true;
}

export async function loadFfmpeg(
	onStatus?: (message: string) => void,
	signal?: AbortSignal
): Promise<FfmpegHandle> {
	signal?.throwIfAborted();
	if (handle?.ffmpeg.loaded) return handle;
	if (loadPromise) return loadPromise;

	// A terminated session must never be returned from an old resolved promise.
	loadPromise = (async () => {
		signal?.throwIfAborted();
		onStatus?.('Loading local encoder…');
		const { FFmpeg } = await import('@ffmpeg/ffmpeg');
		// Bundle the worker's imports too; ?url alone copies unresolved relative imports.
		const ffmpegWorker = await import('@ffmpeg/ffmpeg/worker?worker&url');
		const multiThread = shouldUseMultiThreadFfmpeg(
			isCrossOriginIsolated(),
			prefersNativeShareSave()
		);
		const coreDir = new URL(
			`${resolve('/').replace(/\/$/, '')}/ffmpeg/${multiThread ? 'core-mt' : 'core'}/`,
			window.location.href
		).href;
		const ffmpeg = new FFmpeg();
		const logs: string[] = [];
		ffmpeg.on('log', ({ message }: LogEvent) => {
			logs.push(message);
			if (logs.length > 200) logs.splice(0, logs.length - 200);
		});
		try {
			await encoderOperation(
				ffmpeg,
				() =>
					ffmpeg.load({
						classWorkerURL: ffmpegWorker.default,
						coreURL: `${coreDir}ffmpeg-core.js`,
						wasmURL: `${coreDir}ffmpeg-core.wasm`,
						workerURL: multiThread ? `${coreDir}ffmpeg-core.worker.js` : undefined
					}),
				signal,
				60_000,
				'Could not load the local encoder. Check your connection and try again.'
			);
			handle = { ffmpeg, multiThread, logs };
			return handle;
		} catch (error) {
			ffmpeg.terminate();
			throw error;
		}
	})();

	const pending = loadPromise;
	try {
		return await pending;
	} finally {
		if (loadPromise === pending) loadPromise = undefined;
	}
}

export function appendLogListener(ffmpeg: FFmpeg, logs: string[]): () => void {
	const listener = ({ message }: LogEvent) => {
		logs.push(message);
		if (logs.length > 240) logs.splice(0, logs.length - 240);
	};
	ffmpeg.on('log', listener);
	return () => ffmpeg.off('log', listener);
}

export function listenProgress(
	ffmpeg: FFmpeg,
	onProgress: (progress: number, time: number) => void
): () => void {
	const listener = ({ progress, time }: FfmpegProgress) => {
		onProgress(Math.min(1, Math.max(0, progress)), time);
	};
	ffmpeg.on('progress', listener);
	return () => ffmpeg.off('progress', listener);
}

export async function probeVideo(
	ffmpeg: FFmpeg,
	inputPath: string,
	signal?: AbortSignal
): Promise<ReturnType<typeof parseProbeOutput>> {
	try {
		await encoderOperation(
			ffmpeg,
			() =>
				ffmpeg.ffprobe(
					[
						'-v',
						'error',
						'-select_streams',
						'v:0',
						'-show_entries',
						'stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration:format=duration',
						'-of',
						'default=noprint_wrappers=1',
						inputPath,
						'-o',
						'probe.txt'
					],
					30_000
				),
			signal,
			35_000
		);
		const data = await ffmpeg.readFile('probe.txt');
		const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
		await safeDelete(ffmpeg, 'probe.txt');
		return parseProbeOutput(text);
	} catch (error) {
		if (signal?.aborted || !ffmpeg.loaded) throw error;
		return {};
	}
}

export async function safeDelete(ffmpeg: FFmpeg, path: string): Promise<void> {
	try {
		await ffmpeg.deleteFile(path);
	} catch {
		// File may not exist.
	}
}

export async function terminateFfmpeg(): Promise<void> {
	if (handle) {
		handle.ffmpeg.terminate();
		handle = undefined;
	}
	loadPromise = undefined;
}

export function currentFfmpeg(): FfmpegHandle | undefined {
	return handle;
}
