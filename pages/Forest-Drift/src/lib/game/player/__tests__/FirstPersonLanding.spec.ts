import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FirstPersonController, type LandingEvent } from '../FirstPersonController';
import type { PlayerSettings } from '../../terrain/TerrainSettings';

/** Same minimal EventTarget stand-in as FirstPersonController.spec.ts (vitest runs in `node`). */
class FakeTarget {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();
	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}
	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
	}
	dispatch(type: string, event: unknown = {}): void {
		for (const handler of this.listeners.get(type) ?? []) handler(event);
	}
}

const EYE = 1.7;
const DT = 1 / 60;
let fakeWindow: FakeTarget;

/**
 * A controller over a height function of x alone. `surface.ledge` is the ground height for x < 0;
 * x ≥ 0 is at `surface.low` (0 unless a test changes it).
 */
function setup(options: { ledge?: number; jumpSpeed?: number } = {}) {
	const surface = { ledge: options.ledge ?? 10, low: 0 };
	const landings: LandingEvent[] = [];
	const settings: PlayerSettings = {
		walkSpeed: 4,
		runSpeed: 12,
		eyeHeight: EYE,
		gravityEnabled: true,
		jumpSpeed: options.jumpSpeed ?? 7
	};
	const controller = new FirstPersonController({
		domElement: Object.assign(new FakeTarget(), {
			requestPointerLock: () => undefined
		}) as unknown as HTMLElement,
		camera: new THREE.PerspectiveCamera(),
		getSupportingSurfaceY: (x) => (x < 0 ? surface.ledge : surface.low),
		settings,
		onLanded: (event) => landings.push(event)
	});
	// Face +X ("forward" is -Z at yaw 0); yaw is only TS-private.
	(controller as unknown as { yaw: number }).yaw = -Math.PI / 2;
	return { controller, landings, surface, settings };
}

function run(controller: FirstPersonController, seconds: number): void {
	for (let t = 0; t < seconds; t += DT) controller.update(DT);
}

function press(code: string): void {
	fakeWindow.dispatch('keydown', { code });
}

function release(code: string): void {
	fakeWindow.dispatch('keyup', { code });
}

describe('FirstPersonController — landing events', () => {
	beforeEach(() => {
		fakeWindow = new FakeTarget();
		vi.stubGlobal('window', fakeWindow);
		vi.stubGlobal(
			'document',
			Object.assign(new FakeTarget(), { pointerLockElement: null, exitPointerLock: () => {} })
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reports a flat-ground jump at its 1.36 m peak, not immune', () => {
		const { controller, landings } = setup();
		controller.spawn(5, 0);
		press('Space');
		controller.update(DT);
		release('Space');
		run(controller, 2);
		expect(landings).toHaveLength(1);
		expect(landings[0].immune).toBe(false);
		// 7² / (2 × 18) ≈ 1.36 m analytically; the 60 Hz integration peaks a little lower.
		expect(landings[0].distance).toBeGreaterThan(1.25);
		expect(landings[0].distance).toBeLessThan(1.4);
	});

	it('measures walking off a 10 m ledge, with the landing speed', () => {
		const { controller, landings } = setup();
		controller.spawn(-0.2, 0);
		press('KeyW');
		run(controller, 0.2);
		release('KeyW');
		run(controller, 2);
		expect(landings).toHaveLength(1);
		expect(landings[0].immune).toBe(false);
		expect(landings[0].distance).toBeCloseTo(10, 1);
		expect(landings[0].speed).toBeGreaterThan(17);
		expect(landings[0].feetY).toBeCloseTo(0, 5);
	});

	it('measures a jump off a ledge from the top of the jump', () => {
		const { controller, landings } = setup();
		controller.spawn(-0.05, 0);
		press('KeyW');
		press('Space');
		controller.update(DT);
		release('Space');
		run(controller, 0.3);
		release('KeyW');
		run(controller, 3);
		expect(landings).toHaveLength(1);
		expect(landings[0].distance).toBeGreaterThan(11.2);
		expect(landings[0].distance).toBeLessThan(11.4);
	});

	it('never reports walking down small steps', () => {
		const { controller, landings } = setup();
		const steps = new FirstPersonController({
			domElement: Object.assign(new FakeTarget(), {
				requestPointerLock: () => undefined
			}) as unknown as HTMLElement,
			camera: new THREE.PerspectiveCamera(),
			// 0.2 m risers every 0.25 m, going down along +X.
			getSupportingSurfaceY: (x) => -Math.max(0, Math.floor(x / 0.25)) * 0.2,
			settings: { walkSpeed: 4, runSpeed: 12, eyeHeight: EYE, gravityEnabled: true, jumpSpeed: 7 },
			onLanded: (event) => landings.push(event)
		});
		(steps as unknown as { yaw: number }).yaw = -Math.PI / 2;
		steps.spawn(0, 0);
		press('KeyW');
		run(steps, 1.5);
		release('KeyW');
		expect(steps.worldPosition.x).toBeGreaterThan(5);
		expect(landings).toHaveLength(0);
		controller.dispose();
		steps.dispose();
	});

	it('makes the drop after stopping flight immune, then the next fall counts', () => {
		const { controller, landings } = setup();
		controller.spawn(-5, 0);
		controller.setFlying(true);
		controller.restoreState({ x: 5, y: 50 + EYE, z: 0 }, -Math.PI / 2, 0);
		controller.setFlying(true);
		controller.update(DT);
		controller.setFlying(false);
		run(controller, 4);
		expect(landings).toHaveLength(1);
		expect(landings[0].immune).toBe(true);
		expect(landings[0].distance).toBeGreaterThan(45);

		press('Space');
		controller.update(DT);
		release('Space');
		run(controller, 2);
		expect(landings).toHaveLength(2);
		expect(landings[1].immune).toBe(false);
	});

	it('makes the landing after a restore immune (a world saved mid-air)', () => {
		const { controller, landings } = setup();
		controller.restoreState({ x: 5, y: 80, z: 0 }, 0, 0);
		run(controller, 4);
		expect(landings).toHaveLength(1);
		expect(landings[0].immune).toBe(true);
	});

	it('reports nothing while gravity is off', () => {
		const { controller, landings, settings } = setup();
		controller.spawn(-0.2, 0);
		settings.gravityEnabled = false;
		press('KeyW');
		run(controller, 0.5);
		release('KeyW');
		run(controller, 1);
		expect(controller.worldPosition.y).toBeCloseTo(EYE, 5);
		expect(landings).toHaveLength(0);
	});

	it('makes a fall immune when the support was just removed, but only briefly', () => {
		const { controller, landings, surface } = setup();
		controller.spawn(-5, 0);
		controller.markSupportRemoved();
		surface.ledge = 0;
		run(controller, 3);
		expect(landings).toHaveLength(1);
		expect(landings[0].immune).toBe(true);
		expect(landings[0].distance).toBeCloseTo(10, 1);

		surface.ledge = 10;
		controller.spawn(-5, 0);
		controller.markSupportRemoved();
		run(controller, 1);
		surface.ledge = 0;
		run(controller, 3);
		expect(landings).toHaveLength(2);
		expect(landings[1].immune).toBe(false);
	});

	it('does not excuse a jump made right after the support was removed elsewhere', () => {
		const { controller, landings } = setup();
		controller.spawn(-0.05, 0);
		controller.markSupportRemoved();
		press('KeyW');
		press('Space');
		controller.update(DT);
		release('Space');
		run(controller, 0.3);
		release('KeyW');
		run(controller, 3);
		expect(landings).toHaveLength(1);
		expect(landings[0].immune).toBe(false);
	});

	it('makes every landing immune during tutorial example movement', () => {
		const { controller, landings } = setup({ ledge: 0 });
		controller.spawn(5, 0);
		controller.setExampleMovement(true);
		run(controller, 10);
		expect(landings.length).toBeGreaterThanOrEqual(2);
		expect(landings.every((landing) => landing.immune)).toBe(true);
		controller.setExampleMovement(false);
	});

	it('makes leaving a seat immune', () => {
		const { controller, landings } = setup();
		controller.spawn(5, 0);
		controller.beginInteraction({
			eye: { x: 5, y: 30, z: 0 },
			yaw: 0,
			pitch: 0
		} as never);
		run(controller, 0.5);
		controller.endInteraction({ x: 5, y: 30, z: 0 });
		run(controller, 3);
		expect(landings).toHaveLength(1);
		expect(landings[0].immune).toBe(true);
	});
});
