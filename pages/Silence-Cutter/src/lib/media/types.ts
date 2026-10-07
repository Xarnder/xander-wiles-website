export interface MediaInfo {
	durationSeconds: number;
	container: string;
	mimeType: string;
	video: {
		codec: string | null;
		width: number;
		height: number;
		rotation: number;
		frameRate: number | null;
		bitrate: number | null;
		canDecode: boolean;
	} | null;
	audio: {
		codec: string | null;
		sampleRate: number;
		channels: number;
		bitrate: number | null;
		canDecode: boolean;
	} | null;
}

export interface AnalysisResult {
	info: MediaInfo;
	/** 16 kHz mono PCM for ASR. */
	pcm16k: Float32Array;
	envelopeDb: Float32Array;
	envelopeHop: number;
	peaks: Int8Array;
	peakBucketSeconds: number;
	timings: { decodeMs: number; totalMs: number };
}

export type AnalysisRequest = { type: 'analyse'; file: File };

export type AnalysisResponse =
	| { type: 'info'; info: MediaInfo }
	| { type: 'progress'; seconds: number; total: number }
	| { type: 'done'; result: AnalysisResult }
	| { type: 'error'; message: string; code?: 'no-audio' | 'unsupported-audio' | 'unreadable' };
