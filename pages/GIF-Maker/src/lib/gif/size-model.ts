import type { DitherStrategy, GifSettings, SampleWindow, VideoAnalysis } from './types';

const DITHER_FACTOR: Record<DitherStrategy, number> = {
	none: 0.72,
	bayer: 0.88,
	floyd_steinberg: 1,
	sierra2_4a: 1.06
};

export function estimateGifBytes(
	settings: GifSettings,
	analysis: Pick<VideoAnalysis, 'motionComplexity' | 'detailComplexity'>,
	durationSeconds: number,
	calibration = 1
): number {
	const duration = Math.max(0.05, durationSeconds);
	const frames = duration * settings.fps;
	const pixels = Math.max(1, settings.width * settings.height);
	const colourFactor = 0.55 + 0.45 * (settings.colours / 256);
	const motion = clamp01(analysis.motionComplexity);
	const detail = clamp01(analysis.detailComplexity);

	let bitsPerPixel = 0.2 + motion * 1.32 + detail * 0.52;
	if (settings.fps > 15) bitsPerPixel += 0.06;
	if (settings.fps <= 6) bitsPerPixel -= 0.04;

	const header = 780 + settings.colours * 3;
	const body = frames * pixels * (bitsPerPixel / 8) * colourFactor * DITHER_FACTOR[settings.dither];
	const bytes = (header + body) * Math.max(0.15, calibration);
	return Math.max(1, Math.round(bytes));
}

export function pickSampleWindows(durationSeconds: number): SampleWindow[] {
	if (durationSeconds <= 2.2) {
		return [{ start: 0, duration: durationSeconds }];
	}
	if (durationSeconds <= 7) {
		return [
			{
				start: durationSeconds * 0.2,
				duration: Math.min(1.6, durationSeconds * 0.42)
			}
		];
	}

	const window = Math.min(1, Math.max(0.7, durationSeconds * 0.1));
	return [
		{ start: durationSeconds * 0.15, duration: window },
		{ start: durationSeconds * 0.55, duration: window }
	];
}

export function sampleDuration(windows: readonly SampleWindow[]): number {
	return windows.reduce((sum, window) => sum + window.duration, 0);
}

export function projectSampleToFull(
	sampleBytes: number,
	fullDuration: number,
	windows: readonly SampleWindow[],
	motionComplexity: number
): number {
	const sampled = Math.max(0.05, sampleDuration(windows));
	const safety = motionComplexity >= 0.5 ? 1.12 : 1.06;
	return Math.round(sampleBytes * (fullDuration / sampled) * safety);
}

export function colourEstimateLabel(colours: number): string {
	if (colours >= 192) return '192–256 colours';
	if (colours >= 96) return '128–256 colours';
	if (colours >= 48) return '64–128 colours';
	return '16–64 colours';
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}
