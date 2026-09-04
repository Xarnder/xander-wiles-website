import { describe, expect, it } from 'vitest';
import {
	aspectRatioLabel,
	aspectRatioValue,
	clipDuration,
	compressionLabel,
	outputDuration,
	resolvedPlaybackSpeed,
	snapSpeedPreset,
	dimensionsForWidth,
	evenFloor,
	formatBytes,
	formatDuration,
	gifFilename,
	isProbablyVideo,
	parseFrameRate,
	parseProbeOutput,
	parseSizeInput,
	percentOfLimit
} from './format';

describe('target file-size parsing', () => {
	it('parses megabyte presets and custom values as bytes', () => {
		expect(parseSizeInput('1 MB')).toBe(1 * 1024 * 1024);
		expect(parseSizeInput('10')).toBe(10 * 1024 * 1024);
		expect(parseSizeInput('2.5', 'MB')).toBe(Math.round(2.5 * 1024 * 1024));
		expect(parseSizeInput('500', 'KB')).toBe(500 * 1024);
		expect(parseSizeInput('500 KB')).toBe(500 * 1024);
		expect(parseSizeInput('1.5mb')).toBe(Math.round(1.5 * 1024 * 1024));
	});

	it('rejects empty or invalid sizes', () => {
		expect(() => parseSizeInput('')).toThrow(/enter a file size/i);
		expect(() => parseSizeInput('huge')).toThrow(/500 KB/i);
		expect(() => parseSizeInput('0 MB')).toThrow(/greater than zero/i);
	});
});

describe('aspect-ratio calculations', () => {
	it('labels common landscape and portrait ratios', () => {
		expect(aspectRatioLabel(1920, 1080)).toBe('16:9');
		expect(aspectRatioLabel(1080, 1920)).toBe('9:16');
		expect(aspectRatioLabel(100, 100)).toBe('1:1');
		expect(aspectRatioValue(1920, 1080)).toBeCloseTo(16 / 9);
	});

	it('keeps even dimensions and never stretches the aspect', () => {
		expect(evenFloor(641)).toBe(640);
		const landscape = dimensionsForWidth(640, 16 / 9);
		expect(landscape).toEqual({ width: 640, height: 360 });
		const portrait = dimensionsForWidth(360, 9 / 16);
		expect(portrait.width).toBe(360);
		expect(portrait.height % 2).toBe(0);
		expect(portrait.height).toBeGreaterThan(portrait.width);
	});
});

describe('formatting helpers', () => {
	it('formats bytes, duration, filenames and percentages', () => {
		expect(formatBytes(4.86 * 1024 * 1024)).toMatch(/4\.86 MB/);
		expect(formatDuration(47)).toBe('0:47');
		expect(gifFilename('holiday.mov')).toBe('holiday.gif');
		expect(percentOfLimit(4.86 * 1024 * 1024, 5 * 1024 * 1024)).toBeCloseTo(97.2, 0);
		expect(compressionLabel(20 * 1024 * 1024, 5 * 1024 * 1024)).toMatch(/4× smaller/);
	});

	it('parses ffprobe-style output and clip length', () => {
		expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
		expect(
			parseProbeOutput('width=1280\nheight=720\navg_frame_rate=30/1\nduration=5.0\nnb_frames=150')
		).toEqual({
			width: 1280,
			height: 720,
			fps: 30,
			duration: 5,
			frameCount: 150
		});
		expect(clipDuration({ startSeconds: 1, endSeconds: 4 })).toBe(3);
		expect(outputDuration(6, false)).toBe(6);
		expect(outputDuration(6, true)).toBe(12);
		expect(outputDuration(6, false, 2)).toBe(3);
		expect(outputDuration(6, true, 2)).toBe(6);
		expect(snapSpeedPreset(2.24)).toBe(2);
		expect(snapSpeedPreset(2.26)).toBe(2.5);
		expect(
			resolvedPlaybackSpeed({
				clipSeconds: 10,
				bounce: false,
				mode: 'duration',
				speed: 1,
				targetSeconds: 2.5
			})
		).toBeCloseTo(4);
	});

	it('treats common extensions as video even without a MIME type', () => {
		expect(isProbablyVideo(new File([], 'clip.mkv'))).toBe(true);
		expect(isProbablyVideo(new File([], 'IMG_0123.MOV'))).toBe(true);
		expect(isProbablyVideo(new File([], 'clip.mov', { type: 'video/quicktime' }))).toBe(true);
		expect(isProbablyVideo(new File([], 'notes.txt'))).toBe(false);
	});
});
