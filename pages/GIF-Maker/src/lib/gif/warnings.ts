import {
	HUGE_FILE_BYTES,
	LARGE_FILE_BYTES,
	LONG_CLIP_SECONDS,
	VERY_LONG_CLIP_SECONDS
} from './constants';
import { formatBytes, formatDuration } from './format';
import { estimateGifBytes } from './size-model';
import { minimumSettings } from './candidate-generator';
import type { AdvancedConstraints, MemoryWarning, VideoAnalysis } from './types';

export function inputMemoryWarning(fileSizeBytes: number, deviceMemoryGb?: number): MemoryWarning {
	if (fileSizeBytes >= HUGE_FILE_BYTES) {
		return {
			level: 'huge',
			message: `This ${formatBytes(fileSizeBytes)} file may exhaust browser memory during conversion. Trim it first if you can.`
		};
	}

	const largeLimit =
		deviceMemoryGb !== undefined && deviceMemoryGb > 0 && deviceMemoryGb <= 4
			? 80 * 1024 * 1024
			: LARGE_FILE_BYTES;

	if (fileSizeBytes >= largeLimit) {
		return {
			level: 'large',
			message: `Large video (${formatBytes(fileSizeBytes)}). Conversion stays on this device, but it may use a lot of RAM.`
		};
	}

	return { level: 'none', message: null };
}

export function longVideoWarning(durationSeconds: number): string | null {
	if (durationSeconds >= VERY_LONG_CLIP_SECONDS) {
		return 'GIF works best for short clips. Trimming this video will dramatically improve quality and file size.';
	}
	if (durationSeconds >= LONG_CLIP_SECONDS) {
		return 'GIF works best for short clips. Trimming this video will dramatically improve quality and file size.';
	}
	return null;
}

export function tightTargetWarning(
	durationSeconds: number,
	targetBytes: number,
	analysis?: Pick<
		VideoAnalysis,
		'width' | 'height' | 'sourceFps' | 'motionComplexity' | 'detailComplexity'
	>,
	constraints?: AdvancedConstraints
): string | null {
	if (durationSeconds < 6 || targetBytes <= 0) return null;

	const seconds = Math.round(durationSeconds);
	const mb = targetBytes / (1024 * 1024);
	const bytesPerSecond = targetBytes / durationSeconds;

	if (durationSeconds >= 12 && mb <= 2.1) {
		return `A ${seconds}-second GIF under ${formatBytes(targetBytes)} will require a low resolution or frame rate. Consider trimming the video.`;
	}

	if (durationSeconds >= 25 && mb <= 5.1) {
		return `A ${seconds}-second GIF under ${formatBytes(targetBytes)} will require a low resolution or frame rate. Consider trimming the video.`;
	}

	if (bytesPerSecond < 40_000) {
		return `A ${formatDuration(durationSeconds)} GIF under ${formatBytes(targetBytes)} will require a low resolution or frame rate. Consider trimming the video.`;
	}

	if (analysis && constraints) {
		const min = minimumSettings(analysis, durationSeconds, constraints);
		const smallest = estimateGifBytes(min, analysis, durationSeconds);
		if (smallest > targetBytes * 0.92) {
			return `A ${seconds}-second GIF under ${formatBytes(targetBytes)} will require a low resolution or frame rate. Consider trimming the video.`;
		}
	}

	return null;
}

export function impossibleTargetMessage(targetBytes: number, smallestBytes: number): string {
	return `This video cannot reasonably fit within ${formatBytes(targetBytes)} as a GIF. The smallest usable version is approximately ${formatBytes(smallestBytes)}.`;
}
