import { analyseLoadedVideo } from './analyse-video';
import { defaultConstraints } from './candidate-generator';
import { loadFfmpeg, probeVideo } from './ffmpeg';
import { encodeGif, prepareInput, releaseInput, type PreparedInput } from './gif-encoder';
import { clipDuration, clampClip } from './format';
import { minimumSettings } from './candidate-generator';
import { combinedPaletteFilter } from './filter-graph';
import { optimiseGif } from './optimiser';
import type {
	AdvancedConstraints,
	ClipRange,
	EncodeRequest,
	OptimiserProgress,
	OptimiserResult,
	ProgressFn,
	VideoAnalysis
} from './types';

export interface ConvertOptions {
	file: File;
	video: HTMLVideoElement;
	analysis: VideoAnalysis;
	targetBytes: number;
	clip: ClipRange;
	constraints: AdvancedConstraints;
	onProgress: ProgressFn;
	signal?: AbortSignal;
}

export async function refreshAnalysis(
	video: HTMLVideoElement,
	file: File,
	onProgress?: (percent: number) => void
): Promise<VideoAnalysis> {
	return analyseLoadedVideo(video, file, onProgress);
}

export async function convertVideoToGif(options: ConvertOptions): Promise<OptimiserResult> {
	const clip = clampClip(options.clip, options.analysis.durationSeconds);
	const constraints = { ...defaultConstraints(), ...options.constraints };

	options.onProgress({
		stage: 'loading',
		message: 'Preparing local encoder',
		percent: 6
	});

	const session = await loadFfmpeg((message) => {
		options.onProgress({
			stage: 'loading',
			message,
			percent: 10
		});
	}, options.signal);

	options.onProgress({
		stage: 'analysing',
		message: 'Analysing video',
		percent: 16
	});

	const prepared = await prepareInput(session.ffmpeg, options.file);
	try {
		const probe = await probeVideo(session.ffmpeg, prepared.inputPath);
		const analysis: VideoAnalysis = {
			...options.analysis,
			width: probe.width ?? options.analysis.width,
			height: probe.height ?? options.analysis.height,
			sourceFps: probe.fps ?? options.analysis.sourceFps,
			durationSeconds: probe.duration ?? options.analysis.durationSeconds,
			frameCount: probe.frameCount ?? options.analysis.frameCount
		};

		if (probe.width && probe.height) {
			analysis.aspectRatio = probe.width / probe.height;
		}

		const encode = async (request: EncodeRequest) => {
			return encodeGif(
				prepared,
				request,
				(ffmpegProgress) => {
					const current = request.settings;
					options.onProgress({
						stage: request.mode === 'full' ? 'final' : 'testing',
						message:
							request.mode === 'full'
								? 'Creating final GIF'
								: `Testing ${current.width} × ${current.height} · ${current.fps} FPS`,
						percent: request.mode === 'full' ? 78 + ffmpegProgress * 16 : 40 + ffmpegProgress * 20,
						currentWidth: current.width,
						currentHeight: current.height,
						currentFps: current.fps,
						currentColours: current.colours,
						ffmpegProgress
					});
				},
				options.signal
			);
		};

		const result = await optimiseGif(
			{
				analysis,
				targetBytes: options.targetBytes,
				clip,
				constraints
			},
			encode,
			(progress: OptimiserProgress) => options.onProgress(progress),
			options.signal
		);

		return {
			...result,
			usedMultiThread: session.multiThread,
			logs: [...session.logs]
		};
	} finally {
		await releaseInput(prepared);
	}
}

export async function encodeSmallestGif(options: ConvertOptions): Promise<OptimiserResult> {
	const clip = clampClip(options.clip, options.analysis.durationSeconds);
	const constraints = { ...defaultConstraints(), ...options.constraints };
	const duration = clipDuration(clip, options.analysis.durationSeconds);
	const settings = minimumSettings(options.analysis, duration, constraints);

	options.onProgress({
		stage: 'final',
		message: 'Creating smallest possible GIF',
		percent: 40,
		currentWidth: settings.width,
		currentHeight: settings.height,
		currentFps: settings.fps,
		currentColours: settings.colours
	});

	const session = await loadFfmpeg(undefined, options.signal);
	const prepared: PreparedInput = await prepareInput(session.ffmpeg, options.file);
	try {
		const encoded = await encodeGif(
			prepared,
			{ settings, mode: 'full', clip },
			(ffmpegProgress) => {
				options.onProgress({
					stage: 'final',
					message: 'Creating smallest possible GIF',
					percent: 40 + ffmpegProgress * 55,
					currentWidth: settings.width,
					currentHeight: settings.height,
					currentFps: settings.fps,
					currentColours: settings.colours,
					ffmpegProgress
				});
			},
			options.signal
		);

		return {
			status: encoded.fileSizeBytes <= options.targetBytes ? 'ok' : 'impossible',
			candidate: {
				settings,
				fileSizeBytes: encoded.fileSizeBytes,
				qualityScore: 0,
				qualityLevel: 0,
				usedSampleEstimate: false
			},
			gifBytes: encoded.bytes,
			fileSizeBytes: encoded.fileSizeBytes,
			smallestPossibleBytes: encoded.fileSizeBytes,
			fullEncodes: 1,
			sampleEncodes: 0,
			logs: [...session.logs],
			tried: [
				{
					settings,
					estimatedFileSizeBytes: encoded.fileSizeBytes,
					measuredFileSizeBytes: encoded.fileSizeBytes,
					kind: 'full'
				}
			],
			filterGraph: combinedPaletteFilter(settings),
			usedMultiThread: session.multiThread,
			calibration: 1
		};
	} finally {
		await releaseInput(prepared);
	}
}
