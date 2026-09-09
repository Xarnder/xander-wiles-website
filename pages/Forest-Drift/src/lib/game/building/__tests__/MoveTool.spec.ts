import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MoveTool } from '../MoveTool';
import { FurnitureManager } from '../FurnitureManager';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import { BuildingManager } from '../BuildingManager';
import { FoundationManager } from '../FoundationManager';
import { WorldSurfaceSampler } from '../WorldSurfaceSampler';
import { BuildUndoManager } from '../BuildUndoManager';
import type { FurnitureDefinition } from '../FurnitureTypes';

function chair(id: string, x = 0, z = 0, rotationY = 0): FurnitureDefinition {
	return {
		id,
		kind: 'chair',
		foundationId: null,
		x,
		y: 0,
		z,
		nx: 0,
		ny: 1,
		nz: 0,
		rotationY,
		dimensions: { width: 0.5, depth: 0.5, height: 0.9 },
		parameters: { backrest: true }
	};
}

function table(id: string, x = 0, z = 0): FurnitureDefinition {
	return {
		id,
		kind: 'table',
		foundationId: null,
		x,
		y: 0,
		z,
		nx: 0,
		ny: 1,
		nz: 0,
		rotationY: 0,
		dimensions: { width: 1.2, depth: 0.8, height: 0.75 },
		parameters: {}
	};
}

function buildTestHarness() {
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
	camera.position.set(0, 2, 5);
	camera.lookAt(0, 0, 0);

	const buildingSettings = createDefaultBuildingSettings();
	const furnitureManager = new FurnitureManager();
	scene.add(furnitureManager.group);

	const buildingManager = {
		getRaycastableWallMeshes: () => [],
		getRaycastableSlabMeshes: () => [],
		getRaycastableFoundationMeshes: () => [],
		getRaycastableRoofMeshes: () => [],
		getWallCollisionRects: () => []
	} as unknown as BuildingManager;

	const foundationManager = {
		getFoundationContaining: () => null
	} as unknown as FoundationManager;
	const worldSurfaceSampler = {
		getSupportingSurfaceY: () => 0
	} as unknown as WorldSurfaceSampler;
	const undoManager = {
		record: vi.fn()
	} as unknown as BuildUndoManager;

	const hudStates: unknown[] = [];

	const moveTool = new MoveTool({
		scene,
		camera,
		buildingManager,
		foundationManager,
		furnitureManager,
		undoManager,
		buildingSettings,
		worldSurfaceSampler,
		getTerrainMeshes: () => [],
		getWallRects: () => [],
		onHudChange: (hud) => {
			if (hud) hudStates.push(hud);
		}
	});

	return {
		scene,
		camera,
		buildingSettings,
		furnitureManager,
		moveTool,
		hudStates
	};
}

describe('MoveTool', () => {
	it('activates, deactivates and cleans up scene without error', () => {
		const { moveTool } = buildTestHarness();
		expect(moveTool.isHoldingObject()).toBe(false);

		moveTool.activate();
		expect(moveTool.canOpenCustomize()).toBe(false);

		moveTool.deactivate();
		expect(moveTool.isHoldingObject()).toBe(false);
		moveTool.dispose();
	});

	it('picks up an existing furniture item and hydrates buildingSettings', () => {
		const { moveTool, furnitureManager, buildingSettings } = buildTestHarness();
		const c = chair('chair-1', 2, 3, Math.PI / 2);
		furnitureManager.add(c);
		expect(furnitureManager.getAll()).toHaveLength(1);

		moveTool.activate();

		// Pick up by id
		const picked = moveTool.pickUp('chair-1');
		expect(picked).toBe(true);
		expect(moveTool.isHoldingObject()).toBe(true);
		expect(moveTool.getHeldItem()?.id).toBe('chair-1');

		// The item is removed from the world while being dragged
		expect(furnitureManager.getAll()).toHaveLength(0);

		// buildingSettings are synced with the picked item
		expect(buildingSettings.furnitureKind).toBe('chair');
		expect(buildingSettings.furnitureRotationY).toBeCloseTo(Math.PI / 2);
		expect(buildingSettings.furnitureWidth).toBe(0.5);

		moveTool.deactivate();
		moveTool.dispose();
	});

	it('restores the original item if move is cancelled with secondary action', () => {
		const { moveTool, furnitureManager } = buildTestHarness();
		furnitureManager.add(chair('chair-1', 2, 3));
		moveTool.activate();

		moveTool.pickUp('chair-1');
		expect(furnitureManager.getAll()).toHaveLength(0);

		// Cancel via secondary action
		moveTool.onSecondaryAction();
		expect(moveTool.isHoldingObject()).toBe(false);
		expect(furnitureManager.getAll()).toHaveLength(1);
		expect(furnitureManager.get('chair-1')?.x).toBe(2);
		expect(furnitureManager.get('chair-1')?.z).toBe(3);

		moveTool.deactivate();
		moveTool.dispose();
	});

	it('restores the original item if tool is deactivated while holding', () => {
		const { moveTool, furnitureManager } = buildTestHarness();
		furnitureManager.add(table('table-1', 5, 5));
		moveTool.activate();

		moveTool.pickUp('table-1');
		expect(furnitureManager.getAll()).toHaveLength(0);

		// Deactivating the tool (e.g. switching modes) restores the item
		moveTool.deactivate();
		expect(furnitureManager.getAll()).toHaveLength(1);
		expect(furnitureManager.get('table-1')).toBeDefined();

		moveTool.dispose();
	});

	it('rotates the held object when rotate() is called', () => {
		const { moveTool, furnitureManager, buildingSettings } = buildTestHarness();
		furnitureManager.add(chair('chair-1', 0, 0, 0));
		moveTool.activate();

		moveTool.pickUp('chair-1');
		expect(buildingSettings.furnitureRotationY).toBe(0);

		moveTool.rotate();
		expect(buildingSettings.furnitureRotationY).toBeCloseTo(Math.PI / 2);
		expect(moveTool.getHeldItem()?.rotationY).toBeCloseTo(Math.PI / 2);

		moveTool.rotate();
		expect(buildingSettings.furnitureRotationY).toBeCloseTo(Math.PI);

		moveTool.deactivate();
		moveTool.dispose();
	});

	it('updates held item properties when onCustomizeClosed() is called after editing', () => {
		const { moveTool, furnitureManager, buildingSettings } = buildTestHarness();
		furnitureManager.add(chair('chair-1', 0, 0));
		moveTool.activate();

		moveTool.pickUp('chair-1');
		expect(moveTool.canOpenCustomize()).toBe(true);

		// Simulate user tweaking settings in FurnitureCatalogueModal
		buildingSettings.furnitureWidth = 0.8;
		buildingSettings.furnitureHeight = 1.1;
		buildingSettings.furniturePrimaryColor = '#123456';

		moveTool.onCustomizeClosed();
		const held = moveTool.getHeldItem();
		expect(held?.dimensions?.width).toBe(0.8);
		expect(held?.dimensions?.height).toBe(1.1);
		expect(held?.material && 'color' in held.material ? held.material.color : '').toBe('#123456');

		moveTool.deactivate();
		moveTool.dispose();
	});

	it('prepareForCustomize() picks up hovered item and syncs settings before modal opens', () => {
		const { moveTool, furnitureManager, buildingSettings } = buildTestHarness();
		furnitureManager.add(chair('chair-1', 0, 0, Math.PI / 2));
		moveTool.activate();

		// Simulate hovering over chair-1
		(moveTool as unknown as { hoveredId: string | null }).hoveredId = 'chair-1';
		expect(moveTool.isHoldingObject()).toBe(false);

		moveTool.prepareForCustomize();
		expect(moveTool.isHoldingObject()).toBe(true);
		expect(moveTool.getHeldItem()?.id).toBe('chair-1');
		expect(buildingSettings.furnitureRotationY).toBeCloseTo(Math.PI / 2);

		moveTool.deactivate();
		moveTool.dispose();
	});
});
