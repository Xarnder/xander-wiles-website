import { MAX_SPEED, MIN_SPEED, VIDEO_EXTENSIONS } from './constants';
import type { ClipRange, PlaybackMode } from './types';

export function gcd(a: number, b: number): number {
	let x = Math.abs(Math.round(a));
	let y = Math.abs(Math.round(b));
	while (y !== 0) {
		const t = y;
		y = x % y;
		x = t;
	}
	return x || 1;
}

export function aspectRatioValue(width: number, height: number): number {
	if (height === 0) return 1;
	return width / height;
}

export function aspectRatioLabel(width: number, height: number): string {
	if (width <= 0 || height <= 0) return '—';
	const divisor = gcd(width, height);
	const w = width / divisor;
	const h = height / divisor;
	if (w > 30 || h > 30) {
		const simplified = simplifyAspect(width, height);
		return `${simplified.w}:${simplified.h}`;
	}
	return `${w}:${h}`;
}

function simplifyAspect(width: number, height: number): { w: number; h: number } {
	const ratio = width / height;
	const candidates = [
		[1, 1],
		[4, 3],
		[3, 2],
		[16, 9],
		[16, 10],
		[21, 9],
		[9, 16],
		[2, 3],
		[3, 4],
		[10, 16]
	];
	let best = { w: Math.round(ratio * 10), h: 10, error: Number.POSITIVE_INFINITY };
	for (const [w, h] of candidates) {
		const error = Math.abs(ratio - w / h);
		if (error < best.error) {
			best = { w, h, error };
		}
	}
	if (best.error > 0.08) {
		const d = gcd(width, height);
		return { w: Math.round(width / d), h: Math.round(height / d) };
	}
	return { w: best.w, h: best.h };
}

export function evenFloor(value: number): number {
	if (!Number.isFinite(value)) return 2;
	return Math.max(2, Math.floor(value / 2) * 2);
}

export function dimensionsForWidth(
	width: number,
	aspectRatio: number
): { width: number; height: number } {
	const w = evenFloor(width);
	const ratio = aspectRatio > 0 ? aspectRatio : 1;
	const h = evenFloor(Math.round(w / ratio));
	return { width: w, height: Math.max(2, h) };
}

export function parseSizeInput(raw: string, fallbackUnit: 'KB' | 'MB' = 'MB'): number {
	const trimmed = raw.trim().toLowerCase().replace(',', '.');
	if (!trimmed) {
		throw new Error('Enter a file size');
	}

	const match = trimmed.match(/^([\d]+(?:\.[\d]+)?)\s*(kb|kib|mb|mib|bytes|byte|b)?$/);
	if (!match) {
		throw new Error('Enter a size such as 500 KB or 1.5 MB');
	}

	const value = Number(match[1]);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error('Size must be greater than zero');
	}

	const unit = (match[2] ?? fallbackUnit).toLowerCase();
	if (unit === 'kb' || unit === 'kib') return Math.round(value * 1024);
	if (unit === 'mb' || unit === 'mib') return Math.round(value * 1024 * 1024);
	return Math.round(value);
}

export function formatBytes(bytes: number, digits = 2): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
	if (bytes < 1024) return `${Math.round(bytes)} B`;

	const kb = bytes / 1024;
	if (kb < 1024) {
		const rounded = kb >= 10 ? kb.toFixed(0) : kb.toFixed(1);
		return `${trimDecimal(rounded)} KB`;
	}

	const mb = bytes / (1024 * 1024);
	const rounded = mb >= 10 ? mb.toFixed(Math.min(digits, 1)) : mb.toFixed(digits);
	return `${trimDecimal(rounded)} MB`;
}

function trimDecimal(value: string): string {
	return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	const tenths = Math.floor((seconds - total) * 10);
	const core =
		hours > 0
			? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
			: `${minutes}:${String(secs).padStart(2, '0')}`;
	if (seconds < 60 && tenths > 0) {
		return `${core}.${tenths}`;
	}
	return core;
}

export function clipDuration(clip: ClipRange, fallbackDuration?: number): number {
	const end = Number.isFinite(clip.endSeconds) ? clip.endSeconds : (fallbackDuration ?? 0);
	const start = Number.isFinite(clip.startSeconds) ? clip.startSeconds : 0;
	return Math.max(0.05, end - start);
}

/** Unsped GIF length. Bounce plays the clip forward, then reversed. */
export function contentDuration(clipSeconds: number, bounce: boolean): number {
	const clip = Math.max(0.05, clipSeconds);
	return bounce ? clip * 2 : clip;
}

export function snapSpeedPreset(speed: number): number {
	if (!Number.isFinite(speed)) return MIN_SPEED;
	return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed * 2) / 2));
}

export function formatSpeedFactor(speed: number): string {
	const value = Math.round(Math.max(MIN_SPEED, speed) * 10_000) / 10_000;
	return String(value);
}

export function formatSpeed(speed: number): string {
	const value = Math.round(Math.max(0, speed) * 10) / 10;
	const label = Number.isInteger(value) ? String(value) : value.toFixed(1);
	return `${label}×`;
}

export function clampTargetDuration(targetSeconds: number, clipSeconds: number): number {
	const clip = Math.max(0.05, clipSeconds);
	const maxTarget = Math.max(0.05, clip - 0.05);
	if (!Number.isFinite(targetSeconds)) return Math.min(maxTarget, clip / 2);
	return Math.min(maxTarget, Math.max(0.05, targetSeconds));
}

export function speedFromTargetDuration(contentSeconds: number, targetSeconds: number): number {
	const content = Math.max(0.05, contentSeconds);
	const target = Math.min(content, Math.max(0.05, targetSeconds));
	return content / target;
}

export function resolvedPlaybackSpeed(options: {
	clipSeconds: number;
	bounce: boolean;
	mode: PlaybackMode;
	speed: number;
	targetSeconds: number;
}): number {
	const content = contentDuration(options.clipSeconds, options.bounce);
	if (options.mode === 'duration') {
		return speedFromTargetDuration(
			content,
			clampTargetDuration(options.targetSeconds, options.clipSeconds)
		);
	}
	return snapSpeedPreset(options.speed);
}

/** GIF playback length after bounce and speed. */
export function outputDuration(clipSeconds: number, bounce: boolean, speed = 1): number {
	return contentDuration(clipSeconds, bounce) / Math.max(MIN_SPEED, speed);
}

export function clampClip(clip: ClipRange, durationSeconds: number): ClipRange {
	const duration = Math.max(0, durationSeconds);
	const start = Math.min(Math.max(0, clip.startSeconds), Math.max(0, duration - 0.05));
	const end = Math.min(duration, Math.max(start + 0.05, clip.endSeconds));
	return { startSeconds: start, endSeconds: end };
}

export function gifFilename(originalName: string): string {
	const trimmed = originalName.trim() || 'video';
	const base = trimmed.replace(/\.[^/.]+$/, '');
	const safe = (base || 'video').replace(/[/\\?%*:|"<>]/g, '-');
	return `${safe}.gif`;
}

export function fileExtension(filename: string): string {
	const match = filename.toLowerCase().match(/(\.[a-z0-9]+)$/);
	return match?.[1] ?? '';
}

export function isProbablyVideo(file: File): boolean {
	if (file.type.startsWith('video/')) return true;
	const ext = fileExtension(file.name);
	return VIDEO_EXTENSIONS.some((item) => item === ext);
}

export function percentOfLimit(usedBytes: number, limitBytes: number): number {
	if (limitBytes <= 0) return 0;
	return (usedBytes / limitBytes) * 100;
}

export function compressionLabel(originalBytes: number, gifBytes: number): string {
	if (gifBytes <= 0 || originalBytes <= 0) return '—';
	if (gifBytes >= originalBytes) {
		return `${formatBytes(gifBytes - originalBytes)} larger than the original`;
	}
	const ratio = originalBytes / gifBytes;
	const saved = ((originalBytes - gifBytes) / originalBytes) * 100;
	return `${trimDecimal(ratio.toFixed(1))}× smaller · ${trimDecimal(saved.toFixed(0))}% saved`;
}

export function parseFrameRate(rate: string | undefined): number | undefined {
	if (!rate) return undefined;
	const parts = rate.split('/');
	if (parts.length === 2) {
		const num = Number(parts[0]);
		const den = Number(parts[1]);
		if (num > 0 && den > 0) return num / den;
	}
	const value = Number(rate);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseProbeOutput(text: string): {
	width?: number;
	height?: number;
	fps?: number;
	duration?: number;
	frameCount?: number;
} {
	const values = new Map<string, string>();
	for (const line of text.split(/\r?\n/)) {
		const idx = line.indexOf('=');
		if (idx === -1) continue;
		values.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
	}

	const width = Number(values.get('width'));
	const height = Number(values.get('height'));
	const duration = Number(values.get('duration'));
	const frames = Number(values.get('nb_frames'));
	const fps =
		parseFrameRate(values.get('avg_frame_rate')) ?? parseFrameRate(values.get('r_frame_rate'));

	return {
		width: width > 0 ? width : undefined,
		height: height > 0 ? height : undefined,
		fps,
		duration: duration > 0 ? duration : undefined,
		frameCount: frames > 0 ? frames : undefined
	};
}
