import { describe, expect, it } from 'vitest';
import {
	colourDiversityFromFrame,
	detailFromFrame,
	motionFromFrames,
	motionLabel
} from './analyse-frames';

function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
		data[i + 3] = 255;
	}
	return data;
}

function checker(width: number, height: number): Uint8ClampedArray {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const on = ((x + y) % 2) * 255;
			const i = (y * width + x) * 4;
			data[i] = on;
			data[i + 1] = 255 - on;
			data[i + 2] = (x * 17) % 256;
			data[i + 3] = 255;
		}
	}
	return data;
}

describe('frame analysis', () => {
	it('scores identical frames as low motion', () => {
		const frame = solid(32, 18, 40, 40, 40);
		expect(motionFromFrames([frame, frame, frame])).toBeLessThan(0.08);
		expect(motionLabel(0.1)).toBe('Low motion');
	});

	it('scores alternating frames as high motion', () => {
		const a = solid(32, 18, 0, 0, 0);
		const b = solid(32, 18, 255, 255, 255);
		expect(motionFromFrames([a, b, a, b])).toBeGreaterThan(0.7);
		expect(motionLabel(0.8)).toBe('High motion');
	});

	it('finds more detail and colour in a checkerboard than a flat fill', () => {
		const flat = solid(32, 18, 18, 18, 18);
		const busy = checker(32, 18);
		expect(detailFromFrame(busy, 32, 18)).toBeGreaterThan(detailFromFrame(flat, 32, 18));
		expect(colourDiversityFromFrame(busy)).toBeGreaterThan(colourDiversityFromFrame(flat));
	});
});
