import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DoorInteractionController,
	type OpeningInteractionState
} from '../DoorInteractionController';
import { WallManager } from '../WallManager';
import { createDefaultBuildingSettings, type FoundationDefinition } from '../FoundationTypes';
import type { WallDefinition, WallOpeningDefinition } from '../WallTypes';
import { WallPathManager } from '../WallPathManager';
import { RoofManager } from '../RoofManager';
import { createDefaultRoofProfileSettings } from '../RoofTypes';

beforeEach(() => vi.stubGlobal('window', new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

const foundation: FoundationDefinition = {
	id: 'f',
	minGridX: 0,
	maxGridX: 40,
	minGridZ: 0,
	maxGridZ: 40,
	topY: 0,
	bottomY: -1
};
const shared = {
	getFoundation: (id: string) => (id === 'f' ? foundation : undefined),
	getVertexSpacing: () => 1,
	getBuildingGridSize: () => 0.5,
	buildingSettings: createDefaultBuildingSettings()
};
const opening = (side: 1 | -1): WallOpeningDefinition => ({
	id: 'window-1',
	type: 'window',
	minU: 0.5,
	maxU: 3.5,
	minY: 0.4,
	maxY: 2.6,
	shutters: { mode: 'manual', side }
});

function setup(side: 1 | -1 = 1) {
	const manager = new WallManager(shared);
	const wall: WallDefinition = {
		id: 'wall',
		foundationId: 'f',
		startGridX: 0,
		startGridZ: 0,
		endGridX: 8,
		endGridZ: 0,
		baseY: 0,
		height: 3,
		thickness: 0.2,
		openings: [opening(side)]
	};
	manager.addWall(wall);
	manager.group.updateWorldMatrix(true, true);
	const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
	camera.position.set(2, 1.5, 2 * side);
	camera.lookAt(2, 1.5, 0);
	camera.updateMatrixWorld();
	const onInteractionChange = vi.fn<(state: OpeningInteractionState | null) => void>();
	const onToggle = vi.fn();
	const controller = new DoorInteractionController({
		camera,
		getHingePivots: () => manager.getOpeningInteractionPivots(),
		onInteractionChange,
		onToggle
	});
	const assembly = () => manager.getOpeningInteractionPivots().get('window-1')!;
	return { manager, wall, camera, controller, assembly, onInteractionChange, onToggle };
}

const angles = (assembly: THREE.Object3D) => assembly.children.map((leaf) => leaf.rotation.y);
const pressK = () => window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyK' }));

describe('window shutter interaction', () => {
	it.each([1, -1] as const)('hinges meet both frame edges and swing outward on face %s', (side) => {
		const { controller, manager, assembly, wall, onToggle } = setup(side);
		const [left, right] = assembly().children;
		expect(left.position.x).toBe(wall.openings[0].minU);
		expect(right.position.x).toBe(wall.openings[0].maxU);
		expect(angles(assembly())).toEqual([-side * Math.PI, side * Math.PI]);
		expect(controller.isOpen('window-1')).toBe(true);
		pressK();
		expect(controller.isOpen('window-1')).toBe(false);
		expect(onToggle).toHaveBeenLastCalledWith('window-1', false);
		// Input changes the target pose; the leaves actually move over subsequent frames.
		expect(Math.abs(left.rotation.y)).toBeCloseTo(Math.PI);
		controller.update(0.3);
		expect(left.rotation.y).toBeCloseTo((-side * Math.PI) / 2);
		expect(right.rotation.y).toBeCloseTo((side * Math.PI) / 2);
		controller.update(0.3);
		for (const angle of angles(assembly())) expect(angle).toBeCloseTo(0);
		assembly().updateWorldMatrix(true, true);
		const leftBox = new THREE.Box3().setFromObject(left);
		const rightBox = new THREE.Box3().setFromObject(right);
		expect(leftBox.min.x).toBeCloseTo(0.5);
		expect(leftBox.max.x).toBeCloseTo(2);
		expect(rightBox.min.x).toBeCloseTo(2);
		expect(rightBox.max.x).toBeCloseTo(3.5);
		pressK();
		controller.update(0.6);
		expect(angles(assembly())).toEqual([-side * Math.PI, side * Math.PI]);
		controller.dispose();
		manager.dispose();
	});

	it('reverses smoothly and restores intermediate and closed poses after geometry rebuilds', () => {
		const { controller, manager, assembly } = setup();
		pressK();
		controller.update(0.2);
		const partial = angles(assembly());
		manager.rebuildWall('wall');
		controller.update(0);
		expect(angles(assembly())).toEqual(partial);
		pressK();
		expect(angles(assembly())).toEqual(partial);
		controller.update(0.1);
		expect(Math.abs(angles(assembly())[0])).toBeGreaterThan(Math.abs(partial[0]));
		pressK();
		controller.update(1);
		manager.rebuildWall('wall');
		controller.update(0);
		for (const angle of angles(assembly())) expect(angle).toBeCloseTo(0);
		controller.dispose();
		manager.dispose();
	});

	it('refreshes open/close prompts without requiring the player to look away', () => {
		const { controller, onInteractionChange, manager } = setup();
		controller.update(0);
		expect(onInteractionChange).toHaveBeenLastCalledWith({
			id: 'window-1',
			kind: 'shutters',
			open: true
		});
		pressK();
		expect(onInteractionChange).toHaveBeenLastCalledWith({
			id: 'window-1',
			kind: 'shutters',
			open: false
		});
		controller.setOpen('window-1', true);
		expect(onInteractionChange).toHaveBeenLastCalledWith({
			id: 'window-1',
			kind: 'shutters',
			open: true
		});
		controller.dispose();
		manager.dispose();
	});

	it('picks window corners on translated, rotated walls from either face', () => {
		const { controller, manager, camera } = setup();
		manager.group.position.set(7, 3, -5);
		manager.group.rotation.y = Math.PI / 3;
		manager.group.updateWorldMatrix(true, true);
		for (const z of [-2, 2]) {
			camera.position.copy(manager.group.localToWorld(new THREE.Vector3(0.55, 2.55, z)));
			camera.lookAt(manager.group.localToWorld(new THREE.Vector3(0.55, 2.55, 0)));
			camera.updateMatrixWorld();
			controller.update(0);
			expect(controller.getLookedAtDoor()).toBe('window-1');
		}
		for (const [x, y, z] of [
			[0.4, 1.5, 2],
			[2, 2.8, 2],
			[2, 1.5, 5]
		]) {
			camera.position.copy(manager.group.localToWorld(new THREE.Vector3(x, y, z)));
			camera.lookAt(manager.group.localToWorld(new THREE.Vector3(x, y, 0)));
			camera.updateMatrixWorld();
			controller.update(0);
			expect(controller.getLookedAtDoor()).toBeNull();
		}
		controller.dispose();
		manager.dispose();
	});

	it('uses a single nearest target for doors and windows', () => {
		const { controller, manager, wall, onToggle } = setup();
		manager.addWall({
			...wall,
			id: 'door-wall',
			startGridZ: 2,
			endGridZ: 2,
			openings: [{ id: 'door', type: 'door', minU: 1.5, maxU: 2.5, minY: 0, maxY: 2.1 }]
		});
		pressK();
		expect(onToggle).toHaveBeenCalledExactlyOnceWith('door', true);
		expect(controller.isOpen('window-1')).toBe(true);
		controller.dispose();
		manager.dispose();
	});

	it('keeps shutters out of door collisions and clears removed/disabled targets', () => {
		const { controller, manager, wall } = setup();
		pressK();
		controller.update(1);
		expect(controller.getCollisionRects()).toEqual([]);
		expect(manager.getDoorHingePivots().size).toBe(0);
		expect(manager.getDoorHingePivot('window-1')).toBeUndefined();
		wall.openings[0].shutters = { mode: 'off' };
		manager.rebuildWall('wall');
		controller.update(0);
		expect(manager.getOpeningInteractionPivots().size).toBe(0);
		expect(controller.getLookedAtDoor()).toBeNull();
		expect(controller.toggleLookedAtDoor()).toBeNull();
		wall.openings[0].shutters = { mode: 'auto' };
		manager.rebuildWall('wall');
		controller.update(0);
		expect(controller.isOpen('window-1')).toBe(true);
		manager.removeWall('wall');
		expect(manager.getOpeningInteractionPivots().size).toBe(0);
		controller.dispose();
		manager.dispose();
	});

	it('replays closed shutters for late joiners using the shared active-id state', () => {
		const { controller, assembly, manager } = setup();
		controller.setActiveState('window-1', true);
		controller.update(1);
		expect(controller.isOpen('window-1')).toBe(false);
		for (const angle of angles(assembly())) expect(angle).toBeCloseTo(0);
		controller.setActiveState('window-1', false);
		controller.update(1);
		expect(controller.isOpen('window-1')).toBe(true);
		expect(Math.abs(angles(assembly())[0])).toBeCloseTo(Math.PI);
		controller.dispose();
		manager.dispose();
	});

	it('registers path-segment shutters and removes them on rebuild or deletion', () => {
		const manager = new WallPathManager(shared);
		const path = {
			id: 'path',
			foundationId: 'f',
			points: [
				{ gridX: 0, gridZ: 0 },
				{ gridX: 8, gridZ: 0 },
				{ gridX: 8, gridZ: 8 }
			],
			closed: false,
			baseY: 0,
			wallHeight: 3,
			wallThickness: 0.2,
			joinStyle: 'miter' as const,
			miterLimit: 4,
			segments: [
				{ id: 'empty', openings: [] as WallOpeningDefinition[] },
				{ id: 'seg', openings: [opening(1)] }
			]
		};
		manager.addPath(path);
		const old = manager.getOpeningInteractionPivots().get('window-1');
		expect(old).toBeDefined();
		path.segments[1].openings[0].shutters = { mode: 'off' };
		manager.rebuildPath('path');
		expect(manager.getOpeningInteractionPivots().size).toBe(0);
		path.segments[1].openings[0].shutters = { mode: 'auto' };
		manager.rebuildPath('path');
		expect(manager.getOpeningInteractionPivots().get('window-1')).not.toBe(old);
		path.points.pop();
		path.segments.pop();
		manager.rebuildPath('path');
		expect(manager.getOpeningInteractionPivots().size).toBe(0);
		manager.removePath('path');
		expect(manager.getOpeningInteractionPivots().size).toBe(0);
		manager.dispose();
	});

	it('registers gable windows and clears their shutter targets when the roof is removed', () => {
		const manager = new RoofManager(shared);
		const result = manager.addRoof({
			id: 'roof',
			foundationId: 'f',
			points: [
				{ gridX: 0, gridZ: 0 },
				{ gridX: 12, gridZ: 0 },
				{ gridX: 12, gridZ: 12 },
				{ gridX: 0, gridZ: 12 }
			],
			baseY: 3,
			levelIndex: 1,
			type: 'gable',
			direction: 'x',
			shedDirection: '+x',
			rise: 4,
			thickness: 0.25,
			overhang: 0.3,
			profileSettings: createDefaultRoofProfileSettings(),
			openings: [{ ...opening(1), minY: 3.4, maxY: 5.6, face: '+x' }]
		});
		expect(result.ok).toBe(true);
		expect(manager.getOpeningInteractionPivots().get('window-1')).toBeDefined();
		expect(manager.getDoorHingePivots().size).toBe(0);
		manager.removeRoof('roof');
		expect(manager.getOpeningInteractionPivots().size).toBe(0);
		manager.dispose();
	});
});
