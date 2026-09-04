import { FFFSType, type FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { fileExtension } from './format';
import { palettePassFilter, paletteUseComplex, combinedPaletteFilter } from './filter-graph';
import { listenProgress, safeDelete } from './ffmpeg';
import type { ClipRange, EncodeRequest, EncodeResult, GifSettings, SampleWindow } from './types';

const INPUT_MOUNT = '/in';

export interface PreparedInput {
	ffmpeg: FFmpeg;
	inputPath: string;
	mounted: boolean;
	fileName: string;
}

export async function prepareInput(ffmpeg: FFmpeg, file: File): Promise<PreparedInput> {
	const ext = fileExtension(file.name) || '.mp4';
	const fileName = `source${ext}`;

	try {
		await ffmpeg.createDir(INPUT_MOUNT);
	} catch {
		// Directory may already exist.
	}

	try {
		await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: fileName, data: file }] }, INPUT_MOUNT);
		return { ffmpeg, inputPath: `${INPUT_MOUNT}/${fileName}`, mounted: true, fileName };
	} catch {
		await ffmpeg.writeFile(fileName, await fetchFile(file));
		return { ffmpeg, inputPath: fileName, mounted: false, fileName };
	}
}

export async function releaseInput(prepared: PreparedInput): Promise<void> {
	if (prepared.mounted) {
		try {
			await prepared.ffmpeg.unmount(INPUT_MOUNT);
		} catch {
			// Ignore unmount races.
		}
	} else {
		await safeDelete(prepared.ffmpeg, prepared.fileName);
	}
}

export async function encodeGif(
	prepared: PreparedInput,
	request: EncodeRequest,
	onFfmpegProgress?: (progress: number) => void,
	signal?: AbortSignal
): Promise<EncodeResult> {
	if (request.mode === 'sample' && request.windows && request.windows.length > 0) {
		return encodeSample(prepared, request.settings, request.windows, onFfmpegProgress, signal);
	}
	return encodeRange(
		prepared,
		request.settings,
		request.clip,
		'full.gif',
		onFfmpegProgress,
		signal,
		request.bounce === true,
		request.speed ?? 1
	);
}

async function encodeSample(
	prepared: PreparedInput,
	settings: GifSettings,
	windows: SampleWindow[],
	onFfmpegProgress?: (progress: number) => void,
	signal?: AbortSignal
): Promise<EncodeResult> {
	if (windows.length === 1) {
		const clip: ClipRange = {
			startSeconds: windows[0].start,
			endSeconds: windows[0].start + windows[0].duration
		};
		return encodeRange(prepared, settings, clip, 'sample.gif', onFfmpegProgress, signal);
	}

	let total = 0;
	let last: Uint8Array = new Uint8Array();
	for (const [index, window] of windows.entries()) {
		const clip: ClipRange = {
			startSeconds: window.start,
			endSeconds: window.start + window.duration
		};
		const part = await encodeRange(
			prepared,
			settings,
			clip,
			`sample-${index}.gif`,
			onFfmpegProgress,
			signal
		);
		total += part.fileSizeBytes;
		last = part.bytes;
	}
	return { bytes: last, fileSizeBytes: total };
}

async function encodeRange(
	prepared: PreparedInput,
	settings: GifSettings,
	clip: ClipRange,
	outputName: string,
	onFfmpegProgress?: (progress: number) => void,
	signal?: AbortSignal,
	bounce = false,
	speed = 1
): Promise<EncodeResult> {
	const { ffmpeg, inputPath } = prepared;
	const duration = Math.max(0.05, clip.endSeconds - clip.startSeconds);
	const paletteName = outputName.replace(/\.gif$/, '.png');
	const start = Math.max(0, clip.startSeconds).toFixed(3);
	const length = duration.toFixed(3);

	const stopProgress = onFfmpegProgress
		? listenProgress(ffmpeg, (progress) => onFfmpegProgress(progress))
		: () => undefined;

	try {
		await safeDelete(ffmpeg, paletteName);
		await safeDelete(ffmpeg, outputName);

		const execOpts = { signal };
		const paletteCode = await ffmpeg.exec(
			[
				'-ss',
				start,
				'-t',
				length,
				'-i',
				inputPath,
				'-an',
				'-vf',
				palettePassFilter(settings),
				'-y',
				paletteName
			],
			undefined,
			execOpts
		);

		if (paletteCode === 0) {
			const gifCode = await ffmpeg.exec(
				[
					'-ss',
					start,
					'-t',
					length,
					'-i',
					inputPath,
					'-i',
					paletteName,
					'-an',
					'-filter_complex',
					paletteUseComplex(settings, bounce, speed),
					'-gifflags',
					'+transdiff',
					'-loop',
					'0',
					'-y',
					outputName
				],
				undefined,
				execOpts
			);
			if (gifCode !== 0) {
				throw new Error('GIF encoding failed');
			}
		} else {
			const combinedCode = await ffmpeg.exec(
				[
					'-ss',
					start,
					'-t',
					length,
					'-i',
					inputPath,
					'-an',
					'-vf',
					combinedPaletteFilter(settings, bounce, speed),
					'-gifflags',
					'+transdiff',
					'-loop',
					'0',
					'-y',
					outputName
				],
				undefined,
				execOpts
			);
			if (combinedCode !== 0) {
				throw new Error('GIF encoding failed');
			}
		}

		const data = await ffmpeg.readFile(outputName);
		if (typeof data === 'string') {
			throw new Error('Unexpected GIF output');
		}
		const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
		return { bytes, fileSizeBytes: bytes.byteLength };
	} finally {
		stopProgress();
		await safeDelete(ffmpeg, paletteName);
		await safeDelete(ffmpeg, outputName);
	}
}
