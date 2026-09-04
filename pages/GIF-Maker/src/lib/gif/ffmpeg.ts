import { base } from '$app/paths';
import type { FFmpeg, LogEvent, ProgressEvent as FfmpegProgress } from '@ffmpeg/ffmpeg';
import { parseProbeOutput } from './format';

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
	if (handle?.ffmpeg.loaded) return handle;
	if (loadPromise) return loadPromise;

	loadPromise = (async () => {
		onStatus?.('Loading local encoder…');
		const { FFmpeg } = await import('@ffmpeg/ffmpeg');
		const { toBlobURL } = await import('@ffmpeg/util');
		const ffmpegWorker = await import('@ffmpeg/ffmpeg/worker?url');

		const multiThread = isCrossOriginIsolated();
		const coreDir = `${base}/ffmpeg/${multiThread ? 'core-mt' : 'core'}`;

		const coreURL = await toBlobURL(`${coreDir}/ffmpeg-core.js`, 'text/javascript');
		const wasmURL = await toBlobURL(`${coreDir}/ffmpeg-core.wasm`, 'application/wasm');
		const workerURL = multiThread
			? await toBlobURL(`${coreDir}/ffmpeg-core.worker.js`, 'text/javascript')
			: undefined;

		const ffmpeg = new FFmpeg();
		const logs: string[] = [];
		ffmpeg.on('log', ({ message }: LogEvent) => {
			logs.push(message);
			if (logs.length > 200) logs.splice(0, logs.length - 200);
		});

		await ffmpeg.load(
			{
				classWorkerURL: ffmpegWorker.default,
				coreURL,
				wasmURL,
				workerURL
			},
			{ signal }
		);

		handle = { ffmpeg, multiThread, logs };
		return handle;
	})();

	try {
		return await loadPromise;
	} catch (error) {
		loadPromise = undefined;
		throw error;
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
	inputPath: string
): Promise<ReturnType<typeof parseProbeOutput>> {
	try {
		await ffmpeg.ffprobe(
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
			undefined
		);
		const data = await ffmpeg.readFile('probe.txt');
		const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
		await safeDelete(ffmpeg, 'probe.txt');
		return parseProbeOutput(text);
	} catch {
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
