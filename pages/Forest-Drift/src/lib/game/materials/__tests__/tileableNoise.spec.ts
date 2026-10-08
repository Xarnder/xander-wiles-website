import { describe, expect, it } from 'vitest';
import {
	cellular,
	createCellularSample,
	fbm,
	gradientNoise,
	hash2,
	valueNoise
} from '../noise/tileableNoise';

describe('tileable noise', () => {
	it('hashes deterministically and spreads across seeds', () => {
		expect(hash2(3, -7, 42)).toBe(hash2(3, -7, 42));
		expect(hash2(3, -7, 42)).not.toBe(hash2(3, -7, 43));
	});

	it('gradient and value noise repeat exactly with their period', () => {
		for (const [x, y] of [
			[0.3, 0.7],
			[2.9, 4.1],
			[-1.25, 3.5]
		]) {
			expect(gradientNoise(x + 5, y, 5, 3, 9)).toBeCloseTo(gradientNoise(x, y, 5, 3, 9), 10);
			expect(gradientNoise(x, y + 3, 5, 3, 9)).toBeCloseTo(gradientNoise(x, y, 5, 3, 9), 10);
			expect(valueNoise(x + 5, y + 3, 5, 3, 9)).toBeCloseTo(valueNoise(x, y, 5, 3, 9), 10);
		}
	});

	it('fbm in texture space tiles across s and t', () => {
		const a = fbm(0.001, 0.4, 3, 2, 5, 11);
		const b = fbm(1.001, 0.4, 3, 2, 5, 11);
		const c = fbm(0.001, 1.4, 3, 2, 5, 11);
		expect(b).toBeCloseTo(a, 9);
		expect(c).toBeCloseTo(a, 9);
		expect(Math.abs(a)).toBeLessThanOrEqual(1.5);
	});

	it('cellular noise tiles and reports a non-negative border distance', () => {
		const first = createCellularSample();
		const wrapped = createCellularSample();
		for (let i = 0; i < 50; i++) {
			const x = (i * 0.731) % 6;
			const y = (i * 0.413) % 4;
			cellular(x, y, 6, 4, 77, 0.9, first);
			cellular(x + 6, y - 4, 6, 4, 77, 0.9, wrapped);
			expect(wrapped.cellId).toBe(first.cellId);
			expect(wrapped.border).toBeCloseTo(first.border, 9);
			expect(first.border).toBeGreaterThanOrEqual(-1e-9);
			expect(first.f2).toBeGreaterThanOrEqual(first.f1);
		}
	});
});
