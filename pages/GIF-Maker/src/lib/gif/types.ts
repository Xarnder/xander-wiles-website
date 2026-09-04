export type DitherStrategy = 'sierra2_4a' | 'floyd_steinberg' | 'bayer' | 'none';

export type OptimisationPreference = 'automatic' | 'sharper' | 'smoother' | 'smaller';

export type StatsMode = 'full' | 'diff' | 'single';

export type ScaleFlags = 'lanczos' | 'bicubic' | 'bilinear';

export interface VideoAnalysis {
	filename: string;
	fileSizeBytes: number;
	durationSeconds: number;
	width: number;
	height: number;
	aspectRatio: number;
	aspectRatioLabel: string;
	sourceFps?: number;
	frameCount?: number;
	motionComplexity: number;
	detailComplexity: number;
	colourDiversity: number;
}

export interface ClipRange {
	startSeconds: number;
	endSeconds: number;
}

export interface GifSettings {
	width: number;
	height: number;
	fps: number;
	colours: number;
	dither: DitherStrategy;
	scaleFlags: ScaleFlags;
	statsMode: StatsMode;
	bayerScale?: number;
}

export interface GifCandidate {
	settings: GifSettings;
	fileSizeBytes?: number;
	estimatedFileSizeBytes?: number;
	qualityScore: number;
	qualityLevel: number;
	usedSampleEstimate: boolean;
}

export interface AdvancedConstraints {
	maxWidth?: number;
	maxFps?: number;
	minFps?: number;
	colourCount?: number;
	dither?: DitherStrategy;
	preference: OptimisationPreference;
}

export type ProgressStage = 'loading' | 'analysing' | 'finding' | 'testing' | 'final' | 'adjusting';

export interface OptimiserProgress {
	stage: ProgressStage;
	message: string;
	percent: number;
	currentWidth?: number;
	currentHeight?: number;
	currentFps?: number;
	currentColours?: number;
	estimatedOutputBytes?: number;
	ffmpegProgress?: number;
}

export interface SampleWindow {
	start: number;
	duration: number;
}

export interface EncodeRequest {
	settings: GifSettings;
	mode: 'sample' | 'full';
	clip: ClipRange;
	windows?: SampleWindow[];
}

export interface EncodeResult {
	bytes: Uint8Array;
	fileSizeBytes: number;
}

export type EncodeFn = (request: EncodeRequest) => Promise<EncodeResult>;

export type ProgressFn = (progress: OptimiserProgress) => void;

export interface OptimiserInput {
	analysis: VideoAnalysis;
	targetBytes: number;
	clip: ClipRange;
	constraints: AdvancedConstraints;
}

export interface TriedCandidate {
	settings: GifSettings;
	estimatedFileSizeBytes: number;
	measuredFileSizeBytes?: number;
	kind: 'estimate' | 'sample' | 'full';
}

export interface OptimiserResult {
	status: 'ok' | 'impossible';
	candidate: GifCandidate;
	gifBytes?: Uint8Array;
	fileSizeBytes?: number;
	smallestPossibleBytes?: number;
	fullEncodes: number;
	sampleEncodes: number;
	logs: string[];
	tried: TriedCandidate[];
	filterGraph: string;
	usedMultiThread: boolean;
	calibration: number;
}

export interface SizePreset {
	label: string;
	bytes: number;
}

export interface MemoryWarning {
	level: 'none' | 'large' | 'huge';
	message: string | null;
}
