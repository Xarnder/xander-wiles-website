import { describe, expect, it } from 'vitest';
import {
	RIDE_JUMP_MIN_HEIGHT,
	restingRideJump,
	rideJumpAirborne,
	rideJumpApex,
	stepRideJump
} from './rideJump';

/** Steps a jump at `fps` until it lands; returns the heights it passed through. */
function fly(height: number, fps: number) {
	const jump = restingRideJump();
	const heights: number[] = [];
	const first = stepRideJump(jump, true, { height }, 1 / fps);
	heights.push(jump.height);
	let landed = false;
	for (let i = 0; i < fps * 5 && !landed; i++) {
		landed = stepRideJump(jump, false, { height }, 1 / fps).landed;
		heights.push(jump.height);
	}
	return { first, heights, landed, jump };
}

describe('jumping while riding', () => {
	it('jumps half the creature’s own height, so bigger creatures jump higher', () => {
		expect(rideJumpApex({ height: 3 })).toBeCloseTo(1.5, 9);
		expect(rideJumpApex({ height: 11 })).toBeCloseTo(5.5, 9);
		expect(rideJumpApex({ height: 26 })).toBeCloseTo(13, 9);
		for (const height of [1.2, 2, 5, 9, 17, 26])
			expect(rideJumpApex({ height })).toBeGreaterThanOrEqual(height / 2);
		// Never a hop too small to notice.
		expect(rideJumpApex({ height: 1 })).toBe(RIDE_JUMP_MIN_HEIGHT);
	});

	it('rises and falls in one smooth arc, reaches its apex and lands back on the ground', () => {
		const { first, heights, landed, jump } = fly(6, 60);
		expect(first.jumped).toBe(true);
		expect(landed).toBe(true);
		expect(jump).toEqual({ height: 0, velocity: 0 });
		const top = Math.max(...heights);
		expect(top).toBeGreaterThan(rideJumpApex({ height: 6 }) - 0.05);
		expect(top).toBeLessThanOrEqual(rideJumpApex({ height: 6 }) + 1e-9);
		// Up, then down: one peak, never a jolt bigger than a frame's worth of take-off speed.
		const peak = heights.indexOf(top);
		for (let i = 1; i <= peak; i++) expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
		for (let i = peak + 1; i < heights.length; i++)
			expect(heights[i]).toBeLessThanOrEqual(heights[i - 1]);
	});

	it('flies the same arc at any frame rate', () => {
		const slow = fly(6, 30),
			fast = fly(6, 144);
		expect(Math.max(...slow.heights)).toBeCloseTo(Math.max(...fast.heights), 1);
		expect(slow.heights.length / 30).toBeCloseTo(fast.heights.length / 144, 1);
	});

	it("can't jump again in the air; holding jump jumps again on landing", () => {
		const jump = restingRideJump();
		stepRideJump(jump, true, { height: 3 }, 1 / 60);
		const rising = jump.velocity;
		expect(stepRideJump(jump, true, { height: 3 }, 1 / 60).jumped).toBe(false);
		expect(jump.velocity).toBeLessThan(rising);
		let step = { jumped: false, landed: false };
		while (!step.landed) step = stepRideJump(jump, true, { height: 3 }, 1 / 60);
		expect(rideJumpAirborne(jump)).toBe(false);
		expect(stepRideJump(jump, true, { height: 3 }, 1 / 60).jumped).toBe(true);
	});

	it('does nothing standing still without the key, or for a bad frame time', () => {
		const jump = restingRideJump();
		expect(stepRideJump(jump, false, { height: 3 }, 1 / 60)).toEqual({
			jumped: false,
			landed: false
		});
		expect(stepRideJump(jump, true, { height: 3 }, NaN).jumped).toBe(false);
		expect(jump).toEqual({ height: 0, velocity: 0 });
	});
});
