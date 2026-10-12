/**
 * The rotation snap step the player has picked — one setting shared by the Mini Build editor (block
 * rotation) and the world tools (Place Object and Move: whole-object yaw), so switching to 22.5° in
 * one place means 22.5° everywhere. A local preference, never world state.
 */
import { isRotationSnapStep } from './miniBuildGrid';
import { MINI_BUILD_ROTATION, type RotationSnapStep } from './MiniBuildTypes';

const STORAGE_KEY = 'forest-drift.mini-builds.rotation-step.v1';

type Listener = (step: RotationSnapStep) => void;

let current: RotationSnapStep | undefined;
const listeners = new Set<Listener>();

function load(): RotationSnapStep {
	try {
		const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
		const value = raw === null ? NaN : Number(raw);
		return isRotationSnapStep(value) ? value : MINI_BUILD_ROTATION.defaultStep;
	} catch {
		return MINI_BUILD_ROTATION.defaultStep;
	}
}

export function getRotationSnapStep(): RotationSnapStep {
	return (current ??= load());
}

export function setRotationSnapStep(step: RotationSnapStep): void {
	if (!isRotationSnapStep(step) || step === getRotationSnapStep()) return;
	current = step;
	try {
		if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(step));
	} catch {
		// Private mode / quota — keep the in-memory step.
	}
	for (const listener of listeners) listener(step);
}

/** Next step in MINI_BUILD_ROTATION.snapSteps (`direction` 1 = finer), wrapping round. */
export function cycleRotationSnapStep(direction: 1 | -1 = 1): RotationSnapStep {
	const steps = MINI_BUILD_ROTATION.snapSteps;
	const index = steps.indexOf(getRotationSnapStep());
	const next = steps[(index + direction + steps.length) % steps.length];
	setRotationSnapStep(next);
	return next;
}

export function onRotationSnapStepChange(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** "22.5°", "90°". */
export function formatAngle(degrees: number): string {
	return `${Number.isInteger(degrees) ? degrees : degrees.toFixed(1)}°`;
}
