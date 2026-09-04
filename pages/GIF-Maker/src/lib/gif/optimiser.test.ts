import { describe, expect, it } from 'vitest';
import { defaultConstraints, settingsFromQualityLevel } from './candidate-generator';
import { clipDuration } from './format';
import { optimiseGif, recommendSettings, searchByEstimate } from './optimiser';
import { estimateGifBytes } from './size-model';
import type { EncodeFn, GifSettings, OptimiserInput, VideoAnalysis } from './types';

function analysis(overrides: Partial<VideoAnalysis> = {}): VideoAnalysis {
	return {
		filename: 'clip.mp4',
		fileSizeBytes: 12_000_000,
		durationSeconds: 6,
		width: 1920,
		height: 1080,
		aspectRatio: 16 / 9,
		aspectRatioLabel: '16:9',
		sourceFps: 30,
		motionComplexity: 0.35,
		detailComplexity: 0.4,
		colourDiversity: 0.4,
		...overrides
	};
}

function input(overrides: Partial<OptimiserInput> = {}): OptimiserInput {
	return {
		analysis: analysis(),
		targetBytes: 2 * 1024 * 1024,
		clip: { startSeconds: 0, endSeconds: 6 },
		constraints: defaultConstraints(),
		...overrides
	};
}

function mockEncode(factor = 1): EncodeFn {
	return async (request) => {
		const duration =
			request.mode === 'sample' && request.windows
				? request.windows.reduce((sum, window) => sum + window.duration, 0)
				: clipDuration(request.clip);
		const size = Math.max(
			800,
			Math.round(estimateGifBytes(request.settings, analysis(), duration) * factor)
		);
		return { bytes: new Uint8Array([1, 2, 3]), fileSizeBytes: size };
	};
}

describe('target-size optimisation logic', () => {
	it('recommends settings that are estimated to fit the target', () => {
		const recommendation = recommendSettings(input({ targetBytes: 3 * 1024 * 1024 }));
		expect(recommendation.estimatedFileSizeBytes).toBeLessThanOrEqual(3 * 1024 * 1024);
		expect(recommendation.settings.width).toBeGreaterThanOrEqual(160);
	});

	it('finds an encoded candidate at or below the target', async () => {
		const result = await optimiseGif(input({ targetBytes: 1.5 * 1024 * 1024 }), mockEncode(1));
		expect(result.status).toBe('ok');
		expect(result.fileSizeBytes).toBeLessThanOrEqual(1.5 * 1024 * 1024);
		expect(result.fullEncodes).toBeGreaterThan(0);
		expect(result.fullEncodes).toBeLessThanOrEqual(3);
	});

	it('steps down when sample encodes come in larger than the model', async () => {
		const target = 900_000;
		const result = await optimiseGif(
			input({ targetBytes: target, clip: { startSeconds: 0, endSeconds: 8 } }),
			mockEncode(1.8)
		);
		expect(result.fileSizeBytes ?? result.smallestPossibleBytes ?? 0).toBeGreaterThan(0);
		if (result.status === 'ok') {
			expect(result.fileSizeBytes).toBeLessThanOrEqual(target);
		} else {
			expect(result.smallestPossibleBytes).toBeGreaterThan(target);
		}
	});
});

describe('high-motion versus low-motion decision making', () => {
	it('keeps more frame rate for high-motion footage at the same target', () => {
		const shared = {
			targetBytes: 1_200_000,
			clip: { startSeconds: 0, endSeconds: 8 },
			constraints: defaultConstraints()
		};
		const high = searchByEstimate({
			...shared,
			analysis: analysis({ motionComplexity: 0.86, detailComplexity: 0.35 })
		});
		const low = searchByEstimate({
			...shared,
			analysis: analysis({ motionComplexity: 0.12, detailComplexity: 0.55 })
		});
		expect(high.settings.fps).toBeGreaterThanOrEqual(low.settings.fps);
		expect(low.settings.width).toBeGreaterThanOrEqual(high.settings.width);
	});
});

describe('minimum-quality and constraint handling', () => {
	it('flags impossible tiny targets instead of degrading forever', () => {
		const recommendation = searchByEstimate(
			input({
				targetBytes: 12_000,
				clip: { startSeconds: 0, endSeconds: 40 },
				analysis: analysis({
					durationSeconds: 40,
					width: 3840,
					height: 2160,
					motionComplexity: 0.8
				})
			})
		);
		expect(recommendation.impossible).toBe(true);
		expect(recommendation.smallestPossibleBytes).toBeGreaterThan(12_000);
		expect(recommendation.settings.width).toBeLessThanOrEqual(240);
	});

	it('never exceeds a maximum-width constraint', () => {
		const recommendation = recommendSettings(
			input({
				targetBytes: 20 * 1024 * 1024,
				constraints: { preference: 'automatic', maxWidth: 400 }
			})
		);
		expect(recommendation.settings.width).toBeLessThanOrEqual(400);
	});

	it('respects locked colour count while still fitting a budget', () => {
		const recommendation = recommendSettings(
			input({
				targetBytes: 800_000,
				constraints: { preference: 'automatic', colourCount: 64 }
			})
		);
		expect(recommendation.settings.colours).toBe(64);
	});
});

describe('quality-level mapping', () => {
	it('produces deterministic settings for the same input', () => {
		const source = analysis({ motionComplexity: 0.7 });
		const a: GifSettings = settingsFromQualityLevel(0.6, source, 7, defaultConstraints());
		const b: GifSettings = settingsFromQualityLevel(0.6, source, 7, defaultConstraints());
		expect(a).toEqual(b);
	});
});
