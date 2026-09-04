import { describe, expect, it } from 'vitest';
import { defaultConstraints } from './candidate-generator';
import { combinedPaletteFilter } from './filter-graph';
import {
	impossibleTargetMessage,
	inputMemoryWarning,
	longVideoWarning,
	tightTargetWarning
} from './warnings';

describe('warnings', () => {
	it('warns about long clips without blocking them', () => {
		expect(longVideoWarning(8)).toBeNull();
		expect(longVideoWarning(47)).toMatch(/short clips/i);
	});

	it('warns when a long clip is forced into a tiny GIF', () => {
		const warning = tightTargetWarning(47, 2 * 1024 * 1024);
		expect(warning).toMatch(/47-second GIF under 2 MB/i);
		expect(tightTargetWarning(3, 2 * 1024 * 1024)).toBeNull();
	});

	it('uses analysis when the byte budget is tight', () => {
		const warning = tightTargetWarning(
			18,
			80_000,
			{
				width: 1920,
				height: 1080,
				sourceFps: 30,
				motionComplexity: 0.7,
				detailComplexity: 0.6
			},
			defaultConstraints()
		);
		expect(warning).toMatch(/low resolution or frame rate/i);
	});

	it('describes impossible targets and large files', () => {
		expect(impossibleTargetMessage(500 * 1024, 780 * 1024)).toMatch(
			/cannot reasonably fit within 500 KB/i
		);
		expect(inputMemoryWarning(500 * 1024 * 1024).level).toBe('huge');
		expect(inputMemoryWarning(180 * 1024 * 1024).level).toBe('large');
		expect(inputMemoryWarning(8 * 1024 * 1024).level).toBe('none');
		expect(inputMemoryWarning(70 * 1024 * 1024).level).toBe('none');
		expect(inputMemoryWarning(70 * 1024 * 1024, undefined, true).level).toBe('large');
	});
});

describe('filter graph', () => {
	it('builds a two-stage palette graph from the selected settings', () => {
		const graph = combinedPaletteFilter({
			width: 640,
			height: 360,
			fps: 15,
			colours: 128,
			dither: 'sierra2_4a',
			scaleFlags: 'lanczos',
			statsMode: 'diff'
		});
		expect(graph).toContain('palettegen=max_colors=128');
		expect(graph).toContain('paletteuse=dither=sierra2_4a');
		expect(graph).toContain('scale=640:360:flags=lanczos');
		expect(graph).toContain('fps=15');
		expect(graph).not.toContain('reverse');
	});

	it('appends a forward-then-reverse concat when bounce is on', () => {
		const graph = combinedPaletteFilter(
			{
				width: 320,
				height: 180,
				fps: 10,
				colours: 64,
				dither: 'none',
				scaleFlags: 'bicubic',
				statsMode: 'full'
			},
			true
		);
		expect(graph).toContain('reverse');
		expect(graph).toContain('concat=n=2:v=1:a=0');
		expect(graph).toContain('fps=10');
	});

	it('compresses timestamps when a speed-up is applied', () => {
		const graph = combinedPaletteFilter(
			{
				width: 320,
				height: 180,
				fps: 12,
				colours: 64,
				dither: 'none',
				scaleFlags: 'bicubic',
				statsMode: 'full'
			},
			false,
			2
		);
		expect(graph).toContain('setpts=PTS/2');
		expect(graph).toContain('fps=12');
	});
});
