import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FirstPersonController, type LandingEvent, type MountSeat } from '../FirstPersonController';
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

function setup() {
	const landings: LandingEvent[] = [];
	const settings: PlayerSettings = {
		walkSpeed: 6,
		runSpeed: 12,
		eyeHeight: EYE,
		gravityEnabled: true,
		jumpSpeed: 7
	};
	const camera = new THREE.PerspectiveCamera();
	const controller = new FirstPersonController({
		domElement: Object.assign(new FakeTarget(), {
			requestPointerLock: () => undefined
		}) as unknown as HTMLElement,
		camera,
		getSupportingSurfaceY: () => 0,
		settings,
		onLanded: (event) => landings.push(event)
	});
	controller.spawn(0, 0);
	// A seat 20 m up (a giant's shoulder) that walks along +X at 15 m/s.
	const seat = { x: 0, y: 20, z: 0, lift: 0 };
	const mountSeat: MountSeat = {
		readEye: (out) => {
			out.set(seat.x, seat.y, seat.z);
			return true;
		},
		cameraOffset: () => seat.lift
	};
	return { controller, camera, landings, seat, mountSeat };
}

function run(controller: FirstPersonController, seconds: number, each?: () => void): void {
	for (let t = 0; t < seconds; t += DT) {
		each?.();
		controller.update(DT);
	}
}

describe('FirstPersonController — riding (mount mode)', () => {
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

	it('blends up onto the seat, then follows it exactly', () => {
		const { controller, seat, mountSeat } = setup();
		controller.beginMount(mountSeat, 0.4);
		expect(controller.mounted).toBe(true);
		controller.update(DT);
		expect(controller.worldPosition.y).toBeGreaterThan(EYE);
		expect(controller.worldPosition.y).toBeLessThan(20);
		run(controller, 0.5);
		expect(controller.mountBlend).toBe(1);
		run(controller, 1, () => (seat.x += 15 * DT));
		expect(controller.worldPosition.x).toBeCloseTo(seat.x, 9);
		expect(controller.worldPosition.y).toBe(20);
		expect(controller.isGrounded()).toBe(true);
	});

	it('sends WASD to the mount instead of the feet, and Shift is a sprint', () => {
		const { controller, seat, mountSeat } = setup();
		controller.beginMount(mountSeat, 0.01);
		run(controller, 0.1);
		fakeWindow.dispatch('keydown', { code: 'KeyW' });
		fakeWindow.dispatch('keydown', { code: 'ShiftLeft' });
		expect(controller.rideInput()).toEqual({ x: 0, z: 1, sprint: true });
		run(controller, 1);
		// The feet never walked: the eye is still exactly on the (stationary) seat.
		expect(controller.worldPosition.x).toBe(seat.x);
		expect(controller.worldPosition.z).toBe(seat.z);
		expect(controller.isRunning()).toBe(true);
		fakeWindow.dispatch('keyup', { code: 'KeyW' });
		fakeWindow.dispatch('keydown', { code: 'KeyD' });
		expect(controller.rideInput()).toEqual({ x: 1, z: 0, sprint: true });
	});

	it('climbs off onto the ground with no fall damage, even from 20 m', () => {
		const { controller, landings, mountSeat } = setup();
		controller.beginMount(mountSeat, 0.01);
		run(controller, 0.2);
		controller.endMount({ x: 3, y: EYE, z: 0 }, 0.4);
		expect(controller.mounted).toBe(false);
		expect(controller.mountActive).toBe(true);
		run(controller, 0.5);
		expect(controller.mountActive).toBe(false);
		expect(controller.worldPosition.x).toBeCloseTo(3, 9);
		expect(controller.worldPosition.y).toBeCloseTo(EYE, 9);
		run(controller, 1);
		expect(landings.filter((l) => !l.immune)).toEqual([]);
		// Walking works again.
		fakeWindow.dispatch('keydown', { code: 'KeyW' });
		run(controller, 0.5);
		expect(controller.worldPosition.z).toBeLessThan(-1);
	});

	it('can climb off instantly (knocked out)', () => {
		const { controller, mountSeat } = setup();
		controller.beginMount(mountSeat, 0.01);
		run(controller, 0.2);
		controller.endMount({ x: 2, y: EYE, z: 1 }, 0);
		expect(controller.mountActive).toBe(false);
		expect(controller.worldPosition.toArray()).toEqual([2, EYE, 1]);
	});

	it('can’t fly from a mount, and a teleport or respawn ends the ride', () => {
		const { controller, mountSeat } = setup();
		controller.beginMount(mountSeat, 0.01);
		controller.setFlying(true);
		expect(controller.isFlying()).toBe(false);
		controller.restoreState({ x: 50, y: EYE, z: 50 }, 0, 0);
		expect(controller.mountActive).toBe(false);
		controller.beginMount(mountSeat, 0.01);
		controller.respawn(0, 0);
		expect(controller.mountActive).toBe(false);
	});

	it('lifts only the first-person camera over a mount’s head', () => {
		const { controller, camera, seat, mountSeat } = setup();
		seat.lift = 0.5;
		controller.beginMount(mountSeat, 0.01);
		run(controller, 0.2);
		expect(camera.position.y).toBeCloseTo(20.5, 9);
		// The eye others see (the pose) stays on the seat.
		expect(controller.worldPosition.y).toBe(20);
	});
});
