/**
 * First-person walk bob — framework-free so the step curve is unit-testable without a camera.
 * Applied only as a camera offset (never to the player's logical `worldPosition`) so spawn,
 * collision, and world-save stay at true eye height.
 *
 * Vertical only: a sine on camera-local Y. No sway and no view roll — those read as the camera
 * tilting or sliding sideways, which is not this bob.
 */

export interface WalkBobState {
	/** Radians. One full `2π` is one up-and-down cycle. */
	phase: number;
	/** 0..1 — eased in while walking on the ground, out when still or airborne. */
	amount: number;
}

export interface WalkBobOffset {
	/** Camera-local Y, metres — positive is above eye height, negative below. */
	y: number;
}

export const DEFAULT_WALK_BOB = {
	/** Up-and-down cycles per second at walk speed. */
	walkCyclesPerSecond: 4.2,
	/** Up-and-down cycles per second at run speed. */
	runCyclesPerSecond: 5.8,
	/** How far the camera travels from eye height, metres. */
	verticalAmplitude: 0.028,
	/** Exponential fade speed toward walking / still. */
	fadeSpeed: 10
};

export type WalkBobSettings = typeof DEFAULT_WALK_BOB;

export function createWalkBobState(): WalkBobState {
	return { phase: 0, amount: 0 };
}

export function stepWalkBob(
	state: WalkBobState,
	deltaSeconds: number,
	moving: boolean,
	grounded: boolean,
	running: boolean,
	settings: WalkBobSettings = DEFAULT_WALK_BOB
): WalkBobState {
	const dt = Math.max(0, deltaSeconds);
	const target = moving && grounded ? 1 : 0;
	const fade = 1 - Math.exp(-settings.fadeSpeed * dt);
	const amount = state.amount + (target - state.amount) * fade;

	if (target === 0 && amount < 1e-3) {
		return { phase: 0, amount: 0 };
	}

	const cycles = running ? settings.runCyclesPerSecond : settings.walkCyclesPerSecond;
	const phase = target > 0 ? state.phase + Math.PI * 2 * cycles * dt : state.phase;
	return { phase, amount };
}

export function walkBobOffset(
	state: WalkBobState,
	running = false,
	settings: WalkBobSettings = DEFAULT_WALK_BOB
): WalkBobOffset {
	if (state.amount <= 0) return { y: 0 };

	const runScale = running ? 1.15 : 1;
	return {
		y: Math.sin(state.phase) * settings.verticalAmplitude * state.amount * runScale
	};
}
