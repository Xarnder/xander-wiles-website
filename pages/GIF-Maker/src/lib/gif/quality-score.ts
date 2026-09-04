import type {
	AdvancedConstraints,
	GifSettings,
	OptimisationPreference,
	VideoAnalysis
} from './types';

export interface QualityScoreBreakdown {
	resolution: number;
	fps: number;
	colour: number;
	dither: number;
	total: number;
	weights: { resolution: number; fps: number; colour: number; dither: number };
}

export function usefulSourceFps(analysis: Pick<VideoAnalysis, 'sourceFps'>): number {
	const source = analysis.sourceFps ?? 24;
	return Math.min(24, Math.max(8, source));
}

export function scoreWeights(
	motionComplexity: number,
	preference: OptimisationPreference
): QualityScoreBreakdown['weights'] {
	const motion = clamp01(motionComplexity);
	let resolution = 0.62 - motion * 0.28;
	let fps = 0.16 + motion * 0.34;
	let colour = 0.17 + (1 - motion) * 0.03;
	const dither = 0.05;

	if (preference === 'sharper') {
		resolution += 0.1;
		fps -= 0.07;
		colour += 0.02;
	} else if (preference === 'smoother') {
		fps += 0.12;
		resolution -= 0.08;
		colour -= 0.01;
	} else if (preference === 'smaller') {
		resolution -= 0.06;
		fps += 0.02;
		colour += 0.04;
	}

	const sum = resolution + fps + colour + dither;
	return {
		resolution: resolution / sum,
		fps: fps / sum,
		colour: colour / sum,
		dither: dither / sum
	};
}

export function scoreQuality(
	settings: GifSettings,
	analysis: Pick<VideoAnalysis, 'width' | 'height' | 'sourceFps' | 'motionComplexity'>,
	preference: OptimisationPreference = 'automatic'
): number {
	return scoreQualityBreakdown(settings, analysis, preference).total;
}

export function scoreQualityBreakdown(
	settings: GifSettings,
	analysis: Pick<VideoAnalysis, 'width' | 'height' | 'sourceFps' | 'motionComplexity'>,
	preference: OptimisationPreference = 'automatic'
): QualityScoreBreakdown {
	const sourcePixels = Math.max(1, analysis.width * analysis.height);
	const usefulPixels = Math.min(sourcePixels, 720 * 404);
	const outPixels = settings.width * settings.height;
	const resolution = clamp01(outPixels / usefulPixels);

	const fpsCap = usefulSourceFps(analysis);
	const fps = clamp01(settings.fps / fpsCap);
	const colour = clamp01(Math.log2(Math.max(2, settings.colours)) / 8);
	const dither =
		settings.dither === 'sierra2_4a'
			? 1
			: settings.dither === 'floyd_steinberg'
				? 0.82
				: settings.dither === 'bayer'
					? 0.64
					: 0.4;

	const weights = scoreWeights(analysis.motionComplexity, preference);
	const total =
		resolution * weights.resolution +
		fps * weights.fps +
		colour * weights.colour +
		dither * weights.dither;

	return { resolution, fps, colour, dither, total, weights };
}

export function compareCandidates(
	a: GifSettings,
	b: GifSettings,
	analysis: Pick<VideoAnalysis, 'width' | 'height' | 'sourceFps' | 'motionComplexity'>,
	constraints: Pick<AdvancedConstraints, 'preference'>
): number {
	return (
		scoreQuality(a, analysis, constraints.preference) -
		scoreQuality(b, analysis, constraints.preference)
	);
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}
