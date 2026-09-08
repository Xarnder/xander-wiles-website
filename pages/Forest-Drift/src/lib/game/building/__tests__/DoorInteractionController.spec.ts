import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DoorInteractionController } from '../DoorInteractionController';
import { doorOpenAngle } from '../doorInteractionMath';
import { resolvePlayerPositionAgainstWalls } from '../wallCollision';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { hingeSideForOpening } from '../openingVisualMath';
import { WallManager } from '../WallManager';
import type { WallDefinition } from '../WallTypes';

class FakeWindow {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}

	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
	}

	dispatchEvent(event: { type: string }): void {
		for (const handler of this.listeners.get(event.type) ?? []) handler(event);
	}
}

let fakeWindow: FakeWindow;

beforeEach(() => {
	fakeWindow = new FakeWindow();
	vi.stubGlobal('window', fakeWindow);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function foundation(): FoundationDefinition {
	return {
		id: 'f1',
		minGridX: 0,
		maxGridX: 40,
		minGridZ: 0,
		maxGridZ: 40,
		topY: 10,
		bottomY: 0
	};
}

function doorWall(): WallDefinition {
	return {
		id: 'wall-1',
		foundationId: 'f1',
		startGridX: 0,
		startGridZ: 0,
		endGridX: 8,
		endGridZ: 0,
		baseY: 0,
		height: 3,
		thickness: 0.2,
		openings: [{ id: 'door-1', type: 'door', minU: 1, maxU: 2, minY: 0, maxY: 2.1 }]
	};
}

function setup(onLookedAtDoorChange?: (openingId: string | null) => void) {
	const foundations = new Map<string, FoundationDefinition>([['f1', foundation()]]);
	const manager = new WallManager({
		getFoundation: (id) => foundations.get(id),
		getVertexSpacing: () => 1,
		getBuildingGridSize: () => 0.5,
		buildingSettings: createDefaultBuildingSettings()
	});
	manager.addWall(doorWall());
	manager.group.updateWorldMatrix(true, true);

	const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
	camera.position.set(1.5, 11.05, 2);
	camera.lookAt(1.5, 11.05, 0);
	camera.updateMatrixWorld();

	const controller = new DoorInteractionController({
		camera,
		getHingePivots: () => manager.getDoorHingePivots(),
		onLookedAtDoorChange
	});
	return { manager, camera, controller };
}

describe('DoorInteractionController', () => {
	it('K toggles the door under the crosshair open, then closed', () => {
		const { manager, controller } = setup();
		const hinge = manager.getDoorHingePivot('door-1')!;
		expect(hinge.rotation.y).toBe(0);

		fakeWindow.dispatchEvent({ type: 'keydown', code: 'KeyK' } as unknown as { type: string });
		expect(controller.isOpen('door-1')).toBe(true);
		controller.update(1);
		expect(hinge.rotation.y).toBeCloseTo(doorOpenAngle(hingeSideForOpening('door-1')), 6);

		fakeWindow.dispatchEvent({ type: 'keydown', code: 'KeyK' } as unknown as { type: string });
		expect(controller.isOpen('door-1')).toBe(false);
		controller.update(1);
		expect(hinge.rotation.y).toBeCloseTo(0, 6);

		controller.dispose();
	});

	it('keeps a door open across a wall rebuild (paint / frame-setting changes recreate the pivot)', () => {
		const { manager, controller } = setup();
		controller.toggleLookedAtDoor();
		expect(controller.isOpen('door-1')).toBe(true);

		manager.rebuildWall('wall-1');
		manager.group.updateWorldMatrix(true, true);
		const hinge = manager.getDoorHingePivot('door-1')!;
		expect(hinge.rotation.y).toBe(0);

		controller.update(1);
		expect(hinge.rotation.y).toBeCloseTo(doorOpenAngle(hingeSideForOpening('door-1')), 6);

		controller.dispose();
	});

	it('closed door blocks the doorway; open door lets the player through', () => {
		const { controller } = setup();
		const feetY = 10;
		const headY = 11.7;
		const radius = 0.35;

		const closedRects = controller.getCollisionRects();
		expect(closedRects).toHaveLength(1);
		const blocked = resolvePlayerPositionAgainstWalls(1.5, 0, feetY, headY, radius, closedRects);
		expect(Math.abs(blocked.z)).toBeGreaterThan(0.05);

		controller.toggleLookedAtDoor();
		controller.update(1);
		const openRects = controller.getCollisionRects();
		expect(openRects).toHaveLength(1);
		const through = resolvePlayerPositionAgainstWalls(1.5, 0, feetY, headY, radius, openRects);
		expect(through.x).toBeCloseTo(1.5);
		expect(through.z).toBeCloseTo(0);

		controller.dispose();
	});

	it('reports the door under the crosshair and clears it when you look away', () => {
		const onLookedAtDoorChange = vi.fn();
		const { camera, controller } = setup(onLookedAtDoorChange);
		expect(controller.getLookedAtDoor()).toBeNull();

		controller.update(0);
		expect(controller.getLookedAtDoor()).toBe('door-1');
		expect(onLookedAtDoorChange).toHaveBeenCalledWith('door-1');

		camera.position.set(20, 20, 20);
		camera.lookAt(21, 20, 20);
		camera.updateMatrixWorld();
		controller.update(0);
		expect(controller.getLookedAtDoor()).toBeNull();
		expect(onLookedAtDoorChange).toHaveBeenCalledWith(null);

		controller.dispose();
	});

	it('does nothing when no door is along the look ray', () => {
		const { camera, controller } = setup();
		camera.position.set(20, 20, 20);
		camera.lookAt(21, 20, 20);
		camera.updateMatrixWorld();

		expect(controller.toggleLookedAtDoor()).toBeNull();
		expect(controller.isOpen('door-1')).toBe(false);
		controller.dispose();
	});
});
