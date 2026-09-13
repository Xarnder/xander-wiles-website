import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FirstPersonController } from '../FirstPersonController';

class FakeTarget {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

	addEventListener(type: string, listener: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)!.add(listener);
	}

	removeEventListener(type: string, listener: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	dispatchEvent(event: unknown): boolean {
		const type = (event as { type: string }).type;
		for (const listener of this.listeners.get(type) ?? []) listener(event);
		return true;
	}
}

describe('Touch Controls Integration on Player Controller', () => {
	let fakeWindow: FakeTarget;
	let fakeDocument: FakeTarget & { pointerLockElement: null; exitPointerLock: () => void };

	beforeEach(() => {
		fakeWindow = new FakeTarget();
		fakeDocument = Object.assign(new FakeTarget(), {
			pointerLockElement: null,
			exitPointerLock: () => {}
		});
		vi.stubGlobal('window', fakeWindow);
		vi.stubGlobal('document', fakeDocument);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function createTestController() {
		const fakeDom = Object.assign(new FakeTarget(), { requestPointerLock: () => undefined });
		const camera = new THREE.PerspectiveCamera();
		const lockCallback = vi.fn();

		const controller = new FirstPersonController({
			domElement: fakeDom as unknown as HTMLElement,
			camera,
			getSupportingSurfaceY: () => 0,
			getCeilingBlockY: () => Infinity,
			settings: {
				walkSpeed: 5,
				runSpeed: 10,
				eyeHeight: 1.6,
				gravityEnabled: true,
				jumpSpeed: 6
			},
			onPointerLockChange: lockCallback,
			resolveHorizontalCollision: (x, z) => ({ x, z })
		});

		controller.spawn(0, 0);
		return { controller, camera, lockCallback };
	}

	it('activates touch state and bypasses desktop pointer lock restriction', () => {
		const { controller, lockCallback } = createTestController();

		expect(controller.isTouchActive()).toBe(false);
		expect(controller.isPointerLocked()).toBe(false);

		controller.setTouchActive(true);
		expect(controller.isTouchActive()).toBe(true);
		expect(controller.isPointerLocked()).toBe(true);
		expect(lockCallback).toHaveBeenCalledWith(true);

		controller.setTouchActive(false);
		expect(controller.isTouchActive()).toBe(false);
		expect(controller.isPointerLocked()).toBe(false);
		expect(lockCallback).toHaveBeenCalledWith(false);
	});

	it('applies virtual joystick analog movement', () => {
		const { controller } = createTestController();
		const initialPos = controller.worldPosition.clone();

		// Move forward (touchMoveZ = 1)
		controller.setTouchMovement(0, 1);
		controller.update(0.1);

		const afterMove = controller.worldPosition;
		// At yaw 0, forward is -Z
		expect(afterMove.z).toBeLessThan(initialPos.z);
		expect(afterMove.x).toBeCloseTo(initialPos.x, 2);

		// Stop touch movement
		controller.setTouchMovement(0, 0);
		const stoppedPos = controller.worldPosition.clone();
		controller.update(0.1);
		expect(controller.worldPosition.z).toBeCloseTo(stoppedPos.z, 2);
	});

	it('handles touch sprint acceleration', () => {
		const { controller: walkCtrl } = createTestController();
		const { controller: runCtrl } = createTestController();

		walkCtrl.setTouchMovement(0, 1);
		walkCtrl.setTouchRunning(false);
		walkCtrl.update(0.1);
		const walkDeltaZ = Math.abs(walkCtrl.worldPosition.z);

		runCtrl.setTouchMovement(0, 1);
		runCtrl.setTouchRunning(true);
		runCtrl.update(0.1);
		const runDeltaZ = Math.abs(runCtrl.worldPosition.z);

		expect(runDeltaZ).toBeGreaterThan(walkDeltaZ * 1.5);
	});

	it('triggers jump via touch while grounded', () => {
		const { controller } = createTestController();
		const groundY = controller.worldPosition.y;

		controller.triggerTouchJump();
		// Update physics with a short time step
		controller.update(0.05);

		expect(controller.worldPosition.y).toBeGreaterThan(groundY);
	});

	it('rotates camera orientation smoothly with touch look swipe deltas', () => {
		const { controller, camera } = createTestController();

		const initialQuaternion = camera.quaternion.clone();

		// Swipe horizontal (deltaX = 50) and vertical (deltaY = 30)
		controller.addTouchLook(50, 30);

		expect(camera.quaternion.equals(initialQuaternion)).toBe(false);
	});
});
