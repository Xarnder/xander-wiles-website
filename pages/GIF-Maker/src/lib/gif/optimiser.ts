import {
	isMinimumSettings,
	minimumSettings,
	settingsFromQualityLevel,
	settingsKey
} from './candidate-generator';
import { clipDuration } from './format';
import { combinedPaletteFilter } from './filter-graph';
import { scoreQuality } from './quality-score';
import { estimateGifBytes, pickSampleWindows, projectSampleToFull } from './size-model';
import type {
	EncodeFn,
	GifCandidate,
	GifSettings,
	OptimiserInput,
	OptimiserResult,
	ProgressFn,
	ProgressStage,
	TriedCandidate
} from './types';

const SEARCH_STEPS = 11;
const TARGET_LOW = 0.95;

export interface Recommendation {
	settings: GifSettings;
	estimatedFileSizeBytes: number;
	qualityLevel: number;
	qualityScore: number;
	impossible: boolean;
	smallestPossibleBytes: number;
}

export function startingQualityCap(durationSeconds: number, targetBytes: number): number {
	let cap = 1;
	if (durationSeconds > 3) cap = Math.min(cap, 0.92);
	if (durationSeconds > 8) cap = Math.min(cap, 0.78);
	if (durationSeconds > 20) cap = Math.min(cap, 0.58);
	if (durationSeconds > 45) cap = Math.min(cap, 0.42);

	const bytesPerSecond = targetBytes / Math.max(0.05, durationSeconds);
	if (bytesPerSecond < 50_000) cap = Math.min(cap, 0.36);
	if (bytesPerSecond < 20_000) cap = Math.min(cap, 0.2);
	return cap;
}

export function searchByEstimate(input: OptimiserInput, calibration = 1): Recommendation {
	const duration = clipDuration(input.clip, input.analysis.durationSeconds);
	const hiStart = startingQualityCap(duration, input.targetBytes);
	const min = minimumSettings(input.analysis, duration, input.constraints);
	const smallestPossibleBytes = estimateGifBytes(min, input.analysis, duration, calibration);

	let low = 0;
	let high = hiStart;
	let bestUnder: { settings: GifSettings; estimated: number; quality: number } | undefined;
	let closestOver: { settings: GifSettings; estimated: number; quality: number } | undefined;

	for (let i = 0; i < SEARCH_STEPS; i += 1) {
		const mid = (low + high) / 2;
		const settings = settingsFromQualityLevel(mid, input.analysis, duration, input.constraints);
		const estimated = estimateGifBytes(settings, input.analysis, duration, calibration);

		if (estimated <= input.targetBytes) {
			bestUnder = { settings, estimated, quality: mid };
			low = mid;
		} else {
			closestOver = { settings, estimated, quality: mid };
			high = mid;
		}
	}

	if (!bestUnder) {
		return {
			settings: min,
			estimatedFileSizeBytes: smallestPossibleBytes,
			qualityLevel: 0,
			qualityScore: scoreQuality(min, input.analysis, input.constraints.preference),
			impossible: smallestPossibleBytes > input.targetBytes,
			smallestPossibleBytes
		};
	}

	const ratio = bestUnder.estimated / input.targetBytes;
	if (ratio < TARGET_LOW && closestOver && closestOver.estimated <= input.targetBytes * 1.04) {
		bestUnder = closestOver;
	}

	return {
		settings: bestUnder.settings,
		estimatedFileSizeBytes: bestUnder.estimated,
		qualityLevel: bestUnder.quality,
		qualityScore: scoreQuality(bestUnder.settings, input.analysis, input.constraints.preference),
		impossible: false,
		smallestPossibleBytes
	};
}

export function recommendSettings(input: OptimiserInput): Recommendation {
	return searchByEstimate(input, 1);
}

export async function optimiseGif(
	input: OptimiserInput,
	encode: EncodeFn,
	onProgress: ProgressFn = () => undefined,
	signal?: AbortSignal
): Promise<OptimiserResult> {
	const duration = clipDuration(input.clip, input.analysis.durationSeconds);
	const tried: TriedCandidate[] = [];
	const logs: string[] = [];
	let sampleEncodes = 0;
	let fullEncodes = 0;
	let calibration = 1;

	const report = (
		stage: ProgressStage,
		message: string,
		percent: number,
		settings?: GifSettings,
		estimatedOutputBytes?: number,
		ffmpegProgress?: number
	) => {
		onProgress({
			stage,
			message,
			percent,
			currentWidth: settings?.width,
			currentHeight: settings?.height,
			currentFps: settings?.fps,
			currentColours: settings?.colours,
			estimatedOutputBytes,
			ffmpegProgress
		});
	};

	const ensure = () => {
		if (signal?.aborted) {
			throw new DOMException('Conversion cancelled', 'AbortError');
		}
	};

	report('finding', 'Finding optimal settings', 24);
	let recommendation = searchByEstimate(input, calibration);
	tried.push({
		settings: recommendation.settings,
		estimatedFileSizeBytes: recommendation.estimatedFileSizeBytes,
		kind: 'estimate'
	});

	const windows = pickSampleWindows(duration);
	const canSample = duration > 2.2 && windows[0]?.duration < duration * 0.95;

	if (canSample) {
		ensure();
		const testing = recommendation.settings;
		report(
			'testing',
			`Testing ${testing.width} × ${testing.height} · ${formatFps(testing.fps)} FPS`,
			42,
			testing,
			recommendation.estimatedFileSizeBytes
		);

		const sample = await encode({
			settings: testing,
			mode: 'sample',
			clip: input.clip,
			windows
		});
		sampleEncodes += 1;
		const projected = projectSampleToFull(
			sample.fileSizeBytes,
			duration,
			windows,
			input.analysis.motionComplexity
		);
		tried.push({
			settings: testing,
			estimatedFileSizeBytes: recommendation.estimatedFileSizeBytes,
			measuredFileSizeBytes: projected,
			kind: 'sample'
		});

		const baseline = estimateGifBytes(testing, input.analysis, duration, 1);
		calibration = clampCalibration(projected / Math.max(1, baseline));
		recommendation = searchByEstimate(input, calibration);
		tried.push({
			settings: recommendation.settings,
			estimatedFileSizeBytes: recommendation.estimatedFileSizeBytes,
			kind: 'estimate'
		});

		if (settingsKey(recommendation.settings) !== settingsKey(testing) && sampleEncodes < 2) {
			ensure();
			const second = recommendation.settings;
			report(
				'testing',
				`Testing ${second.width} × ${second.height} · ${formatFps(second.fps)} FPS`,
				58,
				second,
				recommendation.estimatedFileSizeBytes
			);
			const sample2 = await encode({
				settings: second,
				mode: 'sample',
				clip: input.clip,
				windows
			});
			sampleEncodes += 1;
			const projected2 = projectSampleToFull(
				sample2.fileSizeBytes,
				duration,
				windows,
				input.analysis.motionComplexity
			);
			tried.push({
				settings: second,
				estimatedFileSizeBytes: recommendation.estimatedFileSizeBytes,
				measuredFileSizeBytes: projected2,
				kind: 'sample'
			});
			const baseline2 = estimateGifBytes(second, input.analysis, duration, 1);
			calibration = clampCalibration((calibration + projected2 / Math.max(1, baseline2)) / 2);
			recommendation = searchByEstimate(input, calibration);
		}
	}

	if (
		recommendation.impossible ||
		(isMinimumSettings(recommendation.settings, input.analysis, duration, input.constraints) &&
			recommendation.estimatedFileSizeBytes > input.targetBytes)
	) {
		const smallest = recommendation.smallestPossibleBytes;
		logs.push(`Minimum estimated size ${smallest} exceeds target ${input.targetBytes}`);
		return {
			status: 'impossible',
			candidate: toCandidate(recommendation, true),
			smallestPossibleBytes: smallest,
			fullEncodes,
			sampleEncodes,
			logs,
			tried,
			filterGraph: combinedPaletteFilter(recommendation.settings),
			usedMultiThread: false,
			calibration
		};
	}

	ensure();
	const chosen = recommendation.settings;
	report('final', 'Creating final GIF', 78, chosen, recommendation.estimatedFileSizeBytes);

	let encoded = await encode({
		settings: chosen,
		mode: 'full',
		clip: input.clip
	});
	fullEncodes += 1;
	tried.push({
		settings: chosen,
		estimatedFileSizeBytes: recommendation.estimatedFileSizeBytes,
		measuredFileSizeBytes: encoded.fileSizeBytes,
		kind: 'full'
	});

	let qualityLevel = recommendation.qualityLevel;
	let settings = chosen;

	while (encoded.fileSizeBytes > input.targetBytes && fullEncodes < 3) {
		if (isMinimumSettings(settings, input.analysis, duration, input.constraints)) {
			break;
		}
		ensure();
		qualityLevel = Math.max(0, qualityLevel - 0.14);
		const next = settingsFromQualityLevel(
			qualityLevel,
			input.analysis,
			duration,
			input.constraints
		);
		if (settingsKey(next) === settingsKey(settings) && qualityLevel > 0) {
			qualityLevel = Math.max(0, qualityLevel - 0.2);
		}
		settings = settingsFromQualityLevel(qualityLevel, input.analysis, duration, input.constraints);
		report(
			'adjusting',
			`Adjusting to ${settings.width} × ${settings.height} · ${formatFps(settings.fps)} FPS`,
			86 + fullEncodes * 4,
			settings
		);
		encoded = await encode({
			settings,
			mode: 'full',
			clip: input.clip
		});
		fullEncodes += 1;
		tried.push({
			settings,
			estimatedFileSizeBytes: estimateGifBytes(settings, input.analysis, duration, calibration),
			measuredFileSizeBytes: encoded.fileSizeBytes,
			kind: 'full'
		});
	}

	if (encoded.fileSizeBytes > input.targetBytes) {
		return {
			status: 'impossible',
			candidate: {
				settings,
				fileSizeBytes: encoded.fileSizeBytes,
				estimatedFileSizeBytes: recommendation.estimatedFileSizeBytes,
				qualityScore: scoreQuality(settings, input.analysis, input.constraints.preference),
				qualityLevel,
				usedSampleEstimate: sampleEncodes > 0
			},
			gifBytes: encoded.bytes,
			fileSizeBytes: encoded.fileSizeBytes,
			smallestPossibleBytes: encoded.fileSizeBytes,
			fullEncodes,
			sampleEncodes,
			logs,
			tried,
			filterGraph: combinedPaletteFilter(settings),
			usedMultiThread: false,
			calibration
		};
	}

	const underRatio = encoded.fileSizeBytes / input.targetBytes;
	if (underRatio < TARGET_LOW && fullEncodes < 2 && qualityLevel < 0.98) {
		const improvedLevel = Math.min(1, qualityLevel + 0.1);
		const improved = settingsFromQualityLevel(
			improvedLevel,
			input.analysis,
			duration,
			input.constraints
		);
		if (settingsKey(improved) !== settingsKey(settings)) {
			ensure();
			report(
				'final',
				`Improving to ${improved.width} × ${improved.height} · ${formatFps(improved.fps)} FPS`,
				90,
				improved
			);
			const better = await encode({
				settings: improved,
				mode: 'full',
				clip: input.clip
			});
			fullEncodes += 1;
			tried.push({
				settings: improved,
				estimatedFileSizeBytes: estimateGifBytes(improved, input.analysis, duration, calibration),
				measuredFileSizeBytes: better.fileSizeBytes,
				kind: 'full'
			});
			if (better.fileSizeBytes <= input.targetBytes) {
				encoded = better;
				settings = improved;
				qualityLevel = improvedLevel;
			}
		}
	}

	const candidate: GifCandidate = {
		settings,
		fileSizeBytes: encoded.fileSizeBytes,
		estimatedFileSizeBytes: recommendation.estimatedFileSizeBytes,
		qualityScore: scoreQuality(settings, input.analysis, input.constraints.preference),
		qualityLevel,
		usedSampleEstimate: sampleEncodes > 0
	};

	return {
		status: 'ok',
		candidate,
		gifBytes: encoded.bytes,
		fileSizeBytes: encoded.fileSizeBytes,
		fullEncodes,
		sampleEncodes,
		logs,
		tried,
		filterGraph: combinedPaletteFilter(settings),
		usedMultiThread: false,
		calibration
	};
}

function toCandidate(recommendation: Recommendation, sampled: boolean): GifCandidate {
	return {
		settings: recommendation.settings,
		estimatedFileSizeBytes: recommendation.estimatedFileSizeBytes,
		qualityScore: recommendation.qualityScore,
		qualityLevel: recommendation.qualityLevel,
		usedSampleEstimate: sampled
	};
}

function formatFps(fps: number): string {
	return Number.isInteger(fps) ? String(fps) : fps.toFixed(1);
}

function clampCalibration(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 1;
	return Math.min(3.5, Math.max(0.35, value));
}
