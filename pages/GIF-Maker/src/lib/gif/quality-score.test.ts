import { describe, expect, it } from 'vitest';
import { compareCandidates, scoreQuality, scoreWeights } from './quality-score';
import type { GifSettings, VideoAnalysis } from './types';

const baseSettings: GifSettings = {
	width: 640,
	height: 360,
	fps: 15,
	colours: 128,
	dither: 'sierra2_4a',
	scaleFlags: 'lanczos',
	statsMode: 'diff'
};

function analysis(
	motion: number
): Pick<VideoAnalysis, 'width' | 'height' | 'sourceFps' | 'motionComplexity'> {
	return { width: 1920, height: 1080, sourceFps: 30, motionComplexity: motion };
}

describe('quality scoring', () => {
	it('scores a sharper still image higher than a tiny one', () => {
		const sharp = { ...baseSettings, width: 720, height: 404, fps: 8 };
		const tiny = { ...baseSettings, width: 240, height: 134, fps: 20 };
		expect(scoreQuality(sharp, analysis(0.15), 'automatic')).toBeGreaterThan(
			scoreQuality(tiny, analysis(0.15), 'automatic')
		);
	});

	it('prefers frame rate over resolution for high-motion footage', () => {
		const smooth = { ...baseSettings, width: 480, height: 270, fps: 18 };
		const largeJerky = { ...baseSettings, width: 640, height: 360, fps: 8 };
		expect(
			compareCandidates(smooth, largeJerky, analysis(0.85), { preference: 'automatic' })
		).toBeGreaterThan(0);
	});

	it('prefers resolution over frame rate for low-motion footage', () => {
		const sharp = { ...baseSettings, width: 640, height: 360, fps: 8 };
		const smoothSmall = { ...baseSettings, width: 400, height: 224, fps: 18 };
		expect(
			compareCandidates(sharp, smoothSmall, analysis(0.12), { preference: 'automatic' })
		).toBeGreaterThan(0);
	});

	it('shifts weights for sharper vs smoother preferences', () => {
		const sharper = scoreWeights(0.5, 'sharper');
		const smoother = scoreWeights(0.5, 'smoother');
		expect(sharper.resolution).toBeGreaterThan(smoother.resolution);
		expect(smoother.fps).toBeGreaterThan(sharper.fps);
	});

	it('rewards a larger colour palette', () => {
		const rich = { ...baseSettings, colours: 256 };
		const posterised = { ...baseSettings, colours: 32 };
		expect(scoreQuality(rich, analysis(0.4))).toBeGreaterThan(
			scoreQuality(posterised, analysis(0.4))
		);
	});
});
