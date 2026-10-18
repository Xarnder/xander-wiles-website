import { describe, expect, it } from 'vitest';
import { horizontalFov, locatorX, signedHorizontalAngle } from '../locatorMath';

const DEG = Math.PI / 180;

describe('locator maths', () => {
	it('derives the horizontal field of view from the vertical one and the aspect ratio', () => {
		// 90° vertical on a square view is 90° across.
		expect(horizontalFov(90, 1)).toBeCloseTo(90 * DEG, 6);
		// 16:9 at 70° vertical is about 102.4° across.
		expect(horizontalFov(70, 16 / 9) / DEG).toBeCloseTo(102.45, 1);
		// Zooming in narrows it.
		expect(horizontalFov(70, 16 / 9, 2)).toBeLessThan(horizontalFov(70, 16 / 9));
	});

	it('measures the angle on the horizontal plane: 0 ahead, positive to the right, ±π behind', () => {
		// Looking down −Z (the camera's default): +X is to the right.
		expect(signedHorizontalAngle(0, -1, 0, -10)).toBeCloseTo(0, 9);
		expect(signedHorizontalAngle(0, -1, 10, -10)).toBeCloseTo(45 * DEG, 9);
		expect(signedHorizontalAngle(0, -1, -10, -10)).toBeCloseTo(-45 * DEG, 9);
		expect(Math.abs(signedHorizontalAngle(0, -1, 0, 10))).toBeCloseTo(Math.PI, 9);
		// Facing +X: +Z is to the right.
		expect(signedHorizontalAngle(1, 0, 1, 1)).toBeCloseTo(45 * DEG, 9);
		expect(signedHorizontalAngle(0, 0, 1, 1)).toBeNaN();
		expect(signedHorizontalAngle(0, -1, 0, 0)).toBeNaN();
	});

	it('maps the field of view onto the bar, and hides what is outside it or behind', () => {
		const fov = 90 * DEG;
		expect(locatorX(0, fov, 400)).toBe(200);
		expect(locatorX(45 * DEG, fov, 400)).toBeCloseTo(400, 9);
		expect(locatorX(-45 * DEG, fov, 400)).toBeCloseTo(0, 9);
		expect(locatorX(22.5 * DEG, fov, 400)).toBeCloseTo(300, 9);
		expect(locatorX(46 * DEG, fov, 400)).toBeNull();
		// An ultra-wide view still never shows what's behind.
		expect(locatorX(100 * DEG, 240 * DEG, 400)).toBeNull();
		expect(locatorX(Number.NaN, fov, 400)).toBeNull();
		expect(locatorX(0, fov, 0)).toBeNull();
	});
});
