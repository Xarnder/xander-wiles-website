import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	FirstPersonController,
	FLY_SPEED_MAX,
	FLY_SPEED_MIN,
	FLY_WHEEL_STEP,
	flySpeedAfterWheel,
	type FlightState
} from '../FirstPersonController';

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
const RUN = 12;

describe('free flight (B)', () => {
	let fakeWindow: FakeTarget;
	let fakeDocument: FakeTarget & { pointerLockElement: unknown; exitPointerLock: () => void };
	let dom: FakeTarget & { requestPointerLock: () => undefined };
	let changes: FlightState[];

	function make(options: { wallsEverywhere?: boolean; deepWaterEverywhere?: boolean } = {}) {
		changes = [];
		dom = Object.assign(new FakeTarget(), { requestPointerLock: () => undefined });
		const controller = new FirstPersonController({
			domElement: dom as unknown as HTMLElement,
			camera: new THREE.PerspectiveCamera(),
			getSupportingSurfaceY: () => 0,
			settings: { walkSpeed: 4, runSpeed: RUN, eyeHeight: EYE, gravityEnabled: true, jumpSpeed: 6 },
			// A wall that refuses every step, and deep water everywhere — neither stops flight.
			resolveHorizontalCollision: options.wallsEverywhere
				? () => ({ x: 0, z: 0 })
				: (x, z) => ({ x, z }),
			isMoveBlocked: options.deepWaterEverywhere ? () => true : undefined,
			onFlightChange: (state) => changes.push(state)
		});
		controller.spawn(0, 0);
		return controller;
	}

	function lockPointer(): void {
		fakeDocument.pointerLockElement = dom;
		fakeDocument.dispatch('pointerlockchange');
	}

	function wheel(deltaY: number): { prevented: boolean } {
		const event = {
			deltaY,
			prevented: false,
			preventDefault() {
				this.prevented = true;
			}
		};
		fakeWindow.dispatch('wheel', event);
		return event;
	}

	function run(controller: FirstPersonController, seconds: number): void {
		for (let t = 0; t < seconds - 1e-9; t += 1 / 60) controller.update(1 / 60);
	}

	beforeEach(() => {
		fakeWindow = new FakeTarget();
		fakeDocument = Object.assign(new FakeTarget(), {
			pointerLockElement: null as unknown,
			exitPointerLock: () => {}
		});
		vi.stubGlobal('window', fakeWindow);
		vi.stubGlobal('document', fakeDocument);
	});

	afterEach(() => vi.unstubAllGlobals());

	it('toggles on and off, reporting the state and a default speed of twice the run speed', () => {
		const controller = make();
		expect(controller.isFlying()).toBe(false);
		expect(controller.toggleFlying()).toBe(true);
		expect(changes.at(-1)).toEqual({ flying: true, speed: RUN * 2 });
		expect(controller.toggleFlying()).toBe(false);
		expect(changes.at(-1)?.flying).toBe(false);
	});

	it('flies where you look at the fly speed, with no gravity', () => {
		const controller = make();
		controller.setFlying(true);
		// Look 30° up, straight ahead (−Z at yaw 0), and hold W for one second.
		(controller as unknown as { pitch: number }).pitch = Math.PI / 6;
		const start = controller.worldPosition.clone();
		fakeWindow.dispatch('keydown', { code: 'KeyW' });
		run(controller, 1);
		const moved = controller.worldPosition.clone().sub(start);
		expect(moved.length()).toBeCloseTo(RUN * 2, 0);
		expect(moved.y).toBeCloseTo(RUN * 2 * Math.sin(Math.PI / 6), 0);
		expect(moved.z).toBeLessThan(0);
		// Let go: it hovers (no gravity).
		fakeWindow.dispatch('keyup', { code: 'KeyW' });
		const y = controller.worldPosition.y;
		run(controller, 1);
		expect(controller.worldPosition.y).toBeCloseTo(y, 6);
	});

	it('rises with Space, descends with Shift, and never goes below the ground', () => {
		const controller = make();
		controller.setFlying(true);
		fakeWindow.dispatch('keydown', { code: 'Space' });
		run(controller, 0.5);
		expect(controller.worldPosition.y).toBeCloseTo(EYE + RUN, 0);
		fakeWindow.dispatch('keyup', { code: 'Space' });
		fakeWindow.dispatch('keydown', { code: 'ShiftLeft' });
		run(controller, 3);
		expect(controller.worldPosition.y).toBeCloseTo(EYE, 6);
	});

	it('flies over deep water and through walls that stop walking', () => {
		const controller = make({ wallsEverywhere: true, deepWaterEverywhere: true });
		controller.setFlying(true);
		fakeWindow.dispatch('keydown', { code: 'KeyW' });
		run(controller, 1);
		expect(Math.abs(controller.worldPosition.z)).toBeGreaterThan(RUN);
	});

	it('scroll wheel sets the speed while flying (up = faster), clamped to the limits', () => {
		const controller = make();
		lockPointer();
		// Not flying: the wheel is left alone.
		expect(wheel(-100).prevented).toBe(false);
		expect(controller.getFlySpeed()).toBe(RUN * 2);

		controller.setFlying(true);
		expect(wheel(-100).prevented).toBe(true);
		expect(controller.getFlySpeed()).toBeCloseTo(RUN * 2 * FLY_WHEEL_STEP, 6);
		expect(changes.at(-1)?.speed).toBeCloseTo(RUN * 2 * FLY_WHEEL_STEP, 6);
		wheel(-100000);
		expect(controller.getFlySpeed()).toBe(FLY_SPEED_MAX);
		wheel(100000);
		expect(controller.getFlySpeed()).toBe(FLY_SPEED_MIN);
	});

	it('reaches very high speeds at the top of the range', () => {
		expect(FLY_SPEED_MAX).toBeGreaterThanOrEqual(500);
		const controller = make();
		controller.setFlying(true);
		controller.setFlySpeed(FLY_SPEED_MAX);
		fakeWindow.dispatch('keydown', { code: 'KeyW' });
		run(controller, 1);
		expect(Math.abs(controller.worldPosition.z)).toBeCloseTo(FLY_SPEED_MAX, -1);
	});

	it('keeps the chosen speed when flying is toggled off and on again', () => {
		const controller = make();
		controller.setFlying(true);
		controller.setFlySpeed(80);
		controller.setFlying(false);
		controller.setFlying(true);
		expect(controller.getFlySpeed()).toBe(80);
	});

	it('falls back to the ground when flying stops mid-air', () => {
		const controller = make();
		controller.setFlying(true);
		fakeWindow.dispatch('keydown', { code: 'Space' });
		run(controller, 0.5);
		fakeWindow.dispatch('keyup', { code: 'Space' });
		controller.setFlying(false);
		run(controller, 3);
		expect(controller.worldPosition.y).toBeCloseTo(EYE, 6);
	});

	it('freezes all movement, flight and look while movement is locked (screenshot capture)', () => {
		const controller = make();
		lockPointer();
		controller.setFlying(true);
		const start = controller.worldPosition.clone();
		controller.setMovementLocked(true);
		fakeWindow.dispatch('keydown', { code: 'KeyW' });
		fakeWindow.dispatch('keydown', { code: 'Space' });
		fakeDocument.dispatch('mousemove', { movementX: 200, movementY: 50 });
		expect(wheel(-300).prevented).toBe(false);
		run(controller, 1);
		expect(controller.worldPosition.distanceTo(start)).toBe(0);
		expect(controller.getYaw()).toBe(0);
		controller.setMovementLocked(false);
		fakeWindow.dispatch('keydown', { code: 'KeyW' });
		run(controller, 0.5);
		expect(controller.worldPosition.distanceTo(start)).toBeGreaterThan(1);
	});

	it('scales smoothly with trackpad deltas', () => {
		expect(flySpeedAfterWheel(10, -50)).toBeCloseTo(10 * Math.sqrt(FLY_WHEEL_STEP), 6);
		expect(flySpeedAfterWheel(10, 0)).toBe(10);
		expect(flySpeedAfterWheel(10, 100)).toBeCloseTo(10 / FLY_WHEEL_STEP, 6);
	});
});
