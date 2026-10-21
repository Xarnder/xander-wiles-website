import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PillarTool } from '../PillarTool';
import { FoundationManager } from '../FoundationManager';
import { BuildingLevelManager } from '../BuildingLevelManager';
import { FurnitureManager } from '../FurnitureManager';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { BuildUndoManager } from '../BuildUndoManager';
import { raycastLevelConstructionPlane } from '../foundationTopTargeting';

vi.mock('../foundationTopTargeting', () => ({ raycastLevelConstructionPlane: vi.fn() }));
afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

describe('pillar grid placement', () => {
	it('places on the selected foundation grid/storey, snapshots settings, and records undo', () => {
		vi.stubGlobal('window', new EventTarget());
		const settings = createDefaultBuildingSettings();
		const foundations = new FoundationManager(() => 2);
		foundations.addFoundation({
			id: 'f',
			minGridX: 4,
			maxGridX: 12,
			minGridZ: 6,
			maxGridZ: 14,
			topY: 10,
			bottomY: 0
		});
		const levels = new BuildingLevelManager(settings);
		levels.setCurrentLevelIndex('f', 1);
		const level = levels.getOrCreateLevel('f', 1);
		const furniture = new FurnitureManager();
		const record = vi.fn();
		vi.mocked(raycastLevelConstructionPlane).mockReturnValue({
			foundationId: 'f',
			gridPoint: { gridX: 3, gridZ: 5 }
		});
		const scene = new THREE.Scene();
		const tool = new PillarTool({
			scene,
			camera: new THREE.PerspectiveCamera(),
			foundationManager: foundations,
			levelManager: levels,
			furnitureManager: furniture,
			undoManager: { record } as unknown as BuildUndoManager,
			buildingSettings: settings,
			getVertexSpacing: () => 2
		});
		tool.activate();
		tool.onPrimaryAction();
		expect(furniture.getAll()).toHaveLength(1);
		const placed = furniture.getAll()[0];
		expect(placed.x).toBeCloseTo(8 + 3 * settings.buildingGridSize);
		expect(placed.z).toBeCloseTo(12 + 5 * settings.buildingGridSize);
		expect(placed.y).toBeCloseTo(10 + level.baseY);
		expect(placed.foundationId).toBe('f');
		expect(record).toHaveBeenCalledWith({ kind: 'furniture', furnitureId: placed.id });
		settings.pillar.shape = 'circular';
		expect(placed.parameters!.shape).toBe('square');
		tool.onPrimaryAction();
		expect(furniture.getAll()).toHaveLength(1);
		tool.dispose();
		furniture.dispose();
		levels.dispose();
		foundations.dispose();
	});
	it('does not place when there is no valid floor target', () => {
		vi.stubGlobal('window', new EventTarget());
		const settings = createDefaultBuildingSettings();
		const foundations = new FoundationManager(() => 1);
		const levels = new BuildingLevelManager(settings);
		const furniture = new FurnitureManager();
		vi.mocked(raycastLevelConstructionPlane).mockReturnValue(null);
		const record = vi.fn();
		const tool = new PillarTool({
			scene: new THREE.Scene(),
			camera: new THREE.PerspectiveCamera(),
			foundationManager: foundations,
			levelManager: levels,
			furnitureManager: furniture,
			undoManager: { record } as unknown as BuildUndoManager,
			buildingSettings: settings,
			getVertexSpacing: () => 1
		});
		tool.activate();
		tool.onPrimaryAction();
		expect(furniture.getAll()).toHaveLength(0);
		expect(record).not.toHaveBeenCalled();
		tool.dispose();
		furniture.dispose();
		levels.dispose();
		foundations.dispose();
	});
});
