import { describe, expect, it } from 'vitest';
import { createWalkBobState, DEFAULT_WALK_BOB, stepWalkBob, walkBobOffset } from '../walkBob';

describe('stepWalkBob', () => {
	it('eases in while walking on the ground and out when you stop', () => {
		let state = createWalkBobState();
		state = stepWalkBob(state, 0.2, true, true, false);
		expect(state.amount).toBeGreaterThan(0.7);
		expect(state.phase).toBeGreaterThan(0);

		state = stepWalkBob(state, 0.5, false, true, false);
		expect(state.amount).toBeLessThan(0.05);
	});

	it('does not bob while airborne, even if WASD is held', () => {
		let state = stepWalkBob(createWalkBobState(), 0.25, true, false, false);
		expect(state.amount).toBe(0);
		expect(state.phase).toBe(0);
	});

	it('advances the phase faster when running', () => {
		const walk = stepWalkBob(createWalkBobState(), 0.1, true, true, false);
		const run = stepWalkBob(createWalkBobState(), 0.1, true, true, true);
		expect(run.phase).toBeGreaterThan(walk.phase);
	});

	it('resets phase once fully faded so the next walk starts from rest', () => {
		let state = stepWalkBob(createWalkBobState(), 0.3, true, true, false);
		state = stepWalkBob(state, 1, false, true, false);
		expect(state).toEqual({ phase: 0, amount: 0 });
	});
});

describe('walkBobOffset', () => {
	it('is zero at rest', () => {
		expect(walkBobOffset(createWalkBobState())).toEqual({ y: 0 });
	});

	it('moves the camera both above and below eye height', () => {
		const up = walkBobOffset({ phase: Math.PI / 2, amount: 1 });
		const down = walkBobOffset({ phase: (3 * Math.PI) / 2, amount: 1 });
		expect(up.y).toBeCloseTo(DEFAULT_WALK_BOB.verticalAmplitude);
		expect(down.y).toBeCloseTo(-DEFAULT_WALK_BOB.verticalAmplitude);
	});

	it('is only a vertical offset — no sideways or roll terms', () => {
		const offset = walkBobOffset({ phase: Math.PI / 2, amount: 1 });
		expect(offset).toEqual({ y: expect.any(Number) });
		expect(Object.keys(offset)).toEqual(['y']);
	});
});
