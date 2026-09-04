import { ANALYSE_FRAME_WIDTH, ANALYSE_SAMPLE_COUNT } from './constants';
import { colourDiversityFromFrame, detailFromFrame, motionFromFrames } from './analyse-frames';
import { aspectRatioLabel, aspectRatioValue } from './format';
import type { VideoAnalysis } from './types';

export function canUseWebCodecs(): boolean {
	return typeof VideoFrame !== 'undefined';
}

export async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
	if (video.readyState >= 1 && video.duration && video.videoWidth) return;

	await new Promise<void>((resolve, reject) => {
		const onReady = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error('This file could not be read as video in the browser.'));
		};
		const cleanup = () => {
			video.removeEventListener('loadedmetadata', onReady);
			video.removeEventListener('error', onError);
		};
		video.addEventListener('loadedmetadata', onReady);
		video.addEventListener('error', onError);
	});
}

function waitForSeek(video: HTMLVideoElement): Promise<void> {
	if (!Number.isFinite(video.duration)) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const done = () => {
			window.clearTimeout(timer);
			video.removeEventListener('seeked', done);
			resolve();
		};
		const timer = window.setTimeout(done, 700);
		video.addEventListener('seeked', done);
	});
}

function drawFrame(
	video: HTMLVideoElement,
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number
): void {
	if (canUseWebCodecs()) {
		try {
			const frame = new VideoFrame(video);
			try {
				ctx.drawImage(frame, 0, 0, width, height);
				return;
			} finally {
				frame.close();
			}
		} catch {
			// Fall through to canvas drawing.
		}
	}
	ctx.drawImage(video, 0, 0, width, height);
}

export async function estimateSourceFps(video: HTMLVideoElement): Promise<number | undefined> {
	if (typeof video.requestVideoFrameCallback !== 'function') return undefined;

	const previous = video.currentTime;
	video.currentTime = 0;
	await waitForSeek(video);

	try {
		await video.play();
	} catch {
		video.currentTime = previous;
		return undefined;
	}

	let count = 0;
	const started = performance.now();

	await new Promise<void>((resolve) => {
		const timer = window.setTimeout(resolve, 420);
		const step = () => {
			count += 1;
			if (performance.now() - started >= 380 || count >= 24) {
				window.clearTimeout(timer);
				resolve();
				return;
			}
			video.requestVideoFrameCallback(() => step());
		};
		video.requestVideoFrameCallback(() => step());
	});

	video.pause();
	const elapsed = (performance.now() - started) / 1000;
	video.currentTime = 0;
	if (elapsed <= 0 || count < 2) return undefined;
	const fps = (count - 1) / elapsed;
	if (fps < 4 || fps > 120) return undefined;
	return Math.round(fps * 10) / 10;
}

export async function analyseLoadedVideo(
	video: HTMLVideoElement,
	file: File,
	onProgress?: (percent: number) => void
): Promise<VideoAnalysis> {
	await waitForMetadata(video);
	const width = video.videoWidth;
	const height = video.videoHeight;
	const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;

	if (width < 2 || height < 2 || durationSeconds <= 0) {
		throw new Error('The video has no readable picture or duration.');
	}

	onProgress?.(8);
	const analyseHeight = Math.max(2, Math.round((ANALYSE_FRAME_WIDTH * height) / width));
	const canvas = document.createElement('canvas');
	canvas.width = ANALYSE_FRAME_WIDTH;
	canvas.height = analyseHeight;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) {
		throw new Error('Canvas is not available in this browser.');
	}

	const samples = Math.min(ANALYSE_SAMPLE_COUNT, Math.max(3, Math.round(durationSeconds * 2)));
	const frames: Uint8ClampedArray[] = [];
	const details: number[] = [];
	const colours: number[] = [];

	for (let i = 0; i < samples; i += 1) {
		const t = durationSeconds * ((i + 0.5) / samples);
		video.currentTime = Math.min(durationSeconds - 0.01, Math.max(0, t));
		await waitForSeek(video);
		drawFrame(video, ctx, ANALYSE_FRAME_WIDTH, analyseHeight);
		const image = ctx.getImageData(0, 0, ANALYSE_FRAME_WIDTH, analyseHeight);
		frames.push(image.data);
		details.push(detailFromFrame(image.data, ANALYSE_FRAME_WIDTH, analyseHeight));
		colours.push(colourDiversityFromFrame(image.data));
		onProgress?.(8 + ((i + 1) / samples) * 70);
	}

	const motionComplexity = motionFromFrames(frames);
	const detailComplexity = average(details);
	const colourDiversity = average(colours);
	frames.length = 0;

	let sourceFps: number | undefined;
	try {
		sourceFps = await estimateSourceFps(video);
	} catch {
		sourceFps = undefined;
	}

	video.currentTime = 0;
	onProgress?.(100);

	return {
		filename: file.name,
		fileSizeBytes: file.size,
		durationSeconds,
		width,
		height,
		aspectRatio: aspectRatioValue(width, height),
		aspectRatioLabel: aspectRatioLabel(width, height),
		sourceFps,
		frameCount: sourceFps ? Math.round(sourceFps * durationSeconds) : undefined,
		motionComplexity,
		detailComplexity,
		colourDiversity
	};
}

function average(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}
