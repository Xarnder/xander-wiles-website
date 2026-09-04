import {
	COLOUR_LADDER,
	DEFAULT_DITHER,
	FPS_LADDER,
	MAX_FPS_CAP,
	MAX_WIDTH_CAP,
	MIN_COLOURS,
	MIN_FPS,
	MIN_WIDTH,
	WIDTH_LADDER
} from './constants';
import { dimensionsForWidth, evenFloor } from './format';
import type {
	AdvancedConstraints,
	DitherStrategy,
	GifSettings,
	ScaleFlags,
	StatsMode,
	VideoAnalysis
} from './types';

export function defaultConstraints(): AdvancedConstraints {
	return { preference: 'automatic' };
}

export function resolutionLadder(sourceWidth: number, maxWidth?: number): number[] {
	const sourceCap = evenFloor(Math.max(2, sourceWidth));
	const cap = evenFloor(Math.min(sourceCap, maxWidth ?? MAX_WIDTH_CAP, MAX_WIDTH_CAP));
	const widths = new Set<number>();

	if (cap >= MIN_WIDTH) {
		widths.add(cap);
	}

	for (const width of WIDTH_LADDER) {
		if (width <= cap && width >= MIN_WIDTH) {
			widths.add(width);
		}
	}

	if (cap >= MIN_WIDTH) {
		widths.add(MIN_WIDTH);
	} else if (cap >= 2) {
		widths.add(cap);
	}

	return [...widths].sort((a, b) => b - a);
}

export function fpsLadder(
	sourceFps: number | undefined,
	minFps?: number,
	maxFps?: number
): number[] {
	const floor = Math.max(MIN_FPS, minFps ?? MIN_FPS);
	const ceil = Math.min(MAX_FPS_CAP, maxFps ?? MAX_FPS_CAP, sourceFps ?? MAX_FPS_CAP);
	const usefulCeil = Math.max(floor, ceil);
	const values = new Set<number>([usefulCeil]);

	for (const fps of FPS_LADDER) {
		if (fps <= usefulCeil && fps >= floor) {
			values.add(fps);
		}
	}

	values.add(floor);
	return [...values].sort((a, b) => b - a);
}

export function colourLadder(locked?: number): number[] {
	if (locked !== undefined) {
		const value = Math.max(MIN_COLOURS, Math.min(256, Math.round(locked)));
		return [value];
	}
	return [...COLOUR_LADDER];
}

export function peakWidth(
	durationSeconds: number,
	sourceWidth: number,
	maxWidth?: number,
	motionComplexity = 0.4
): number {
	let peak = 720;
	if (durationSeconds > 4) peak = 640;
	if (durationSeconds > 10) peak = 560;
	if (durationSeconds > 20) peak = 480;
	if (durationSeconds > 40) peak = 400;
	if (motionComplexity >= 0.66 && peak > 480) peak -= 80;
	const ladder = resolutionLadder(sourceWidth, maxWidth);
	const allowed = ladder.filter((width) => width <= peak);
	return allowed[0] ?? ladder[0] ?? MIN_WIDTH;
}

export function peakFps(
	durationSeconds: number,
	sourceFps: number | undefined,
	motionComplexity = 0.4,
	minFps?: number,
	maxFps?: number
): number {
	let peak = 24;
	if (durationSeconds > 3) peak = 20;
	if (durationSeconds > 8) peak = 18;
	if (durationSeconds > 15) peak = 15;
	if (durationSeconds > 30) peak = 12;
	if (motionComplexity >= 0.66) peak = Math.min(24, peak + 4);
	if (motionComplexity <= 0.28) peak = Math.min(peak, 12);

	const ladder = fpsLadder(sourceFps, minFps, maxFps);
	const allowed = ladder.filter((fps) => fps <= peak);
	return allowed[0] ?? ladder[0] ?? MIN_FPS;
}

export function peakColours(
	durationSeconds: number,
	detailComplexity = 0.5,
	locked?: number
): number {
	if (locked !== undefined) {
		return colourLadder(locked)[0];
	}
	let peak = 256;
	if (durationSeconds > 10) peak = 192;
	if (durationSeconds > 25) peak = 128;
	if (detailComplexity < 0.28) peak = Math.min(peak, 192);
	if (detailComplexity > 0.7) peak = Math.max(peak, 192);
	const ladder = colourLadder();
	return ladder.find((value) => value <= peak) ?? peak;
}

export function pickFromLadder<T>(ladder: readonly T[], t: number): T {
	if (ladder.length === 0) {
		throw new Error('Ladder must not be empty');
	}
	const clamped = Math.min(1, Math.max(0, t));
	const index = Math.round((1 - clamped) * (ladder.length - 1));
	return ladder[index];
}

export function ditherForQuality(quality: number, locked?: DitherStrategy): DitherStrategy {
	if (locked) return locked;
	if (quality > 0.55) return 'sierra2_4a';
	if (quality > 0.32) return 'floyd_steinberg';
	if (quality > 0.14) return 'bayer';
	return 'none';
}

export function scaleFlagsForWidth(width: number): ScaleFlags {
	return width >= 240 ? 'lanczos' : 'bicubic';
}

export function statsModeForMotion(motionComplexity: number): StatsMode {
	return motionComplexity >= 0.25 ? 'diff' : 'full';
}

export function settingsFromQualityLevel(
	quality: number,
	analysis: Pick<
		VideoAnalysis,
		'width' | 'height' | 'sourceFps' | 'motionComplexity' | 'detailComplexity' | 'durationSeconds'
	>,
	durationSeconds: number,
	constraints: AdvancedConstraints
): GifSettings {
	const q = Math.min(1, Math.max(0, quality));
	const motion = analysis.motionComplexity;
	const detail = analysis.detailComplexity;

	let widthExponent = 1 + motion * 0.75;
	let fpsExponent = 1 + (1 - motion) * 0.95;
	const colourExponent = 1 + (1 - detail) * 0.35;

	if (constraints.preference === 'sharper') {
		widthExponent *= 0.55;
		fpsExponent *= 1.2;
	} else if (constraints.preference === 'smoother') {
		fpsExponent *= 0.5;
		widthExponent *= 1.2;
	} else if (constraints.preference === 'smaller') {
		widthExponent *= 1.55;
	}

	const widths = resolutionLadder(
		Math.min(
			analysis.width,
			peakWidth(durationSeconds, analysis.width, constraints.maxWidth, motion)
		),
		constraints.maxWidth
	);
	const fpss = fpsLadder(
		Math.min(
			analysis.sourceFps ?? MAX_FPS_CAP,
			peakFps(durationSeconds, analysis.sourceFps, motion, constraints.minFps, constraints.maxFps)
		),
		constraints.minFps,
		constraints.maxFps
	);
	const colours = colourLadder(constraints.colourCount);

	const width = pickFromLadder(widths, q ** widthExponent);
	const fps = pickFromLadder(fpss, q ** fpsExponent);
	const colourCount = constraints.colourCount
		? colours[0]
		: pickFromLadder(
				colours.filter((value) => value <= peakColours(durationSeconds, detail)),
				q ** colourExponent
			);

	const { height } = dimensionsForWidth(width, analysis.width / Math.max(1, analysis.height));
	const dither = ditherForQuality(q, constraints.dither);

	return {
		width,
		height,
		fps,
		colours: colourCount,
		dither,
		scaleFlags: scaleFlagsForWidth(width),
		statsMode: statsModeForMotion(motion),
		bayerScale: dither === 'bayer' ? (q > 0.22 ? 3 : 2) : undefined
	};
}

export function minimumSettings(
	analysis: Pick<VideoAnalysis, 'width' | 'height' | 'sourceFps' | 'motionComplexity'>,
	durationSeconds: number,
	constraints: AdvancedConstraints
): GifSettings {
	return settingsFromQualityLevel(
		0,
		{ ...analysis, detailComplexity: 0.5, durationSeconds },
		durationSeconds,
		constraints
	);
}

export function isMinimumSettings(
	settings: GifSettings,
	analysis: Pick<VideoAnalysis, 'width' | 'height' | 'sourceFps' | 'motionComplexity'>,
	durationSeconds: number,
	constraints: AdvancedConstraints
): boolean {
	const min = minimumSettings(analysis, durationSeconds, constraints);
	return (
		settings.width <= min.width &&
		settings.fps <= min.fps &&
		settings.colours <= min.colours &&
		(settings.dither === min.dither || settings.dither === 'none')
	);
}

export function settingsKey(settings: GifSettings): string {
	return [
		settings.width,
		settings.height,
		settings.fps,
		settings.colours,
		settings.dither,
		settings.scaleFlags,
		settings.statsMode
	].join('x');
}

export { DEFAULT_DITHER };
