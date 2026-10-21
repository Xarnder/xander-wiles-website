import { describe, expect, it } from 'vitest';
import { skyBackgroundBlend } from '../skyBackgroundBlend';

describe('daytime sky crossfade', () => {
	it.each([9, 12, 15, 18])('keeps an even HDRI/procedural blend at %s:00', (hour) => {
		expect(skyBackgroundBlend(hour / 24)).toBe(0.5);
	});
	it.each([0, 6, 8, 19, 23])('shows the gradient at %s:00', (hour) => {
		expect(skyBackgroundBlend(hour / 24)).toBe(0);
	});
	it('fades continuously before 9am and after 6pm', () => {
		expect(skyBackgroundBlend(8.5 / 24)).toBeCloseTo(0.5);
		expect(skyBackgroundBlend(18.5 / 24)).toBeCloseTo(0.5);
		for (const hour of [8, 9, 18, 19]) {
			expect(
				Math.abs(skyBackgroundBlend((hour - 0.001) / 24) - skyBackgroundBlend((hour + 0.001) / 24))
			).toBeLessThan(0.0001);
		}
	});
	it('holds the preferred 08:32 blend throughout daytime without hiding clouds', () => {
		expect(skyBackgroundBlend((8 + 32 / 60) / 24)).toBe(0.5);
		for (let hour = 0; hour < 24; hour += 0.1) {
			expect(skyBackgroundBlend(hour / 24)).toBeLessThanOrEqual(0.5);
		}
	});
	it('wraps at midnight and safely handles invalid time', () => {
		expect(skyBackgroundBlend(1.5)).toBe(0.5);
		expect(skyBackgroundBlend(-0.5)).toBe(0.5);
		expect(skyBackgroundBlend(NaN)).toBe(0);
	});
});
