import { describe, expect, it } from 'vitest';
import {
	colourLadder,
	defaultConstraints,
	fpsLadder,
	isMinimumSettings,
	minimumSettings,
	peakWidth,
	resolutionLadder,
	settingsFromQualityLevel
} from './candidate-generator';
import type { VideoAnalysis } from './types';

function analysis(overrides: Partial<VideoAnalysis> = {}): VideoAnalysis {
	return {
		filename: 'clip.mp4',
		fileSizeBytes: 8_000_000,
		durationSeconds: 6,
		width: 1920,
		height: 1080,
		aspectRatio: 16 / 9,
		aspectRatioLabel: '16:9',
		sourceFps: 30,
		frameCount: 180,
		motionComplexity: 0.4,
		detailComplexity: 0.45,
		colourDiversity: 0.4,
		...overrides
	};
}

describe('resolution ladder generation', () => {
	it('never upscales and includes the source when it is below the cap', () => {
		expect(resolutionLadder(400).every((width) => width <= 400)).toBe(true);
		expect(resolutionLadder(400)[0]).toBe(400);
		expect(resolutionLadder(1920)[0]).toBeLessThanOrEqual(960);
		expect(resolutionLadder(1920)).toContain(160);
	});

	it('respects a maximum-width constraint', () => {
		const ladder = resolutionLadder(1920, 480);
		expect(ladder[0]).toBe(480);
		expect(ladder.every((width) => width <= 480)).toBe(true);
	});
});

describe('FPS ladder', () => {
	it('caps around 24 and stays at or below the source', () => {
		expect(fpsLadder(60)[0]).toBe(24);
		expect(fpsLadder(15)[0]).toBe(15);
		expect(fpsLadder(15).every((fps) => fps <= 15)).toBe(true);
	});

	it('honours min and max FPS constraints', () => {
		const ladder = fpsLadder(30, 8, 12);
		expect(ladder[0]).toBe(12);
		expect(ladder.at(-1)).toBe(8);
		expect(ladder.every((fps) => fps >= 8 && fps <= 12)).toBe(true);
	});
});

describe('candidate generation', () => {
	it('maps quality 1 above quality 0 and keeps even dimensions', () => {
		const high = settingsFromQualityLevel(1, analysis(), 4, defaultConstraints());
		const low = settingsFromQualityLevel(0, analysis(), 4, defaultConstraints());
		expect(high.width).toBeGreaterThan(low.width);
		expect(high.fps).toBeGreaterThanOrEqual(low.fps);
		expect(high.colours).toBeGreaterThanOrEqual(low.colours);
		expect(high.width % 2).toBe(0);
		expect(high.height % 2).toBe(0);
		expect(high.width).toBeLessThanOrEqual(1920);
	});

	it('never upscales a small source', () => {
		const settings = settingsFromQualityLevel(1, analysis({ width: 320, height: 180 }), 2, {
			preference: 'automatic'
		});
		expect(settings.width).toBeLessThanOrEqual(320);
	});

	it('locks colour count when the user overrides it', () => {
		expect(colourLadder(64)).toEqual([64]);
		const settings = settingsFromQualityLevel(1, analysis(), 5, {
			preference: 'automatic',
			colourCount: 64
		});
		expect(settings.colours).toBe(64);
	});

	it('uses a lower peak width for longer clips', () => {
		expect(peakWidth(2, 1920)).toBeGreaterThan(peakWidth(40, 1920));
	});

	it('identifies minimum-quality settings', () => {
		const source = analysis();
		const min = minimumSettings(source, 12, defaultConstraints());
		expect(isMinimumSettings(min, source, 12, defaultConstraints())).toBe(true);
		expect(min.width).toBeLessThanOrEqual(240);
		expect(min.fps).toBeLessThanOrEqual(5);
		expect(min.colours).toBeLessThanOrEqual(32);
	});
});
