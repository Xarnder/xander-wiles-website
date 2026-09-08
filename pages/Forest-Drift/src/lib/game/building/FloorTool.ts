import type * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState } from './FoundationTypes';
import { SlabToolBase } from './SlabToolBase';
import type { TerrainSettings } from '../terrain/TerrainSettings';

export interface FloorToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	buildingManager: BuildingManager;
	levelManager: BuildingLevelManager;
	undoManager: BuildUndoManager;
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Floor Tool — thin wrapper around SlabToolBase for placing an upper-storey floor. Uses the same
 * live elevation as CeilingTool (wall-top, or the C-panel height), so a floor here and a ceiling
 * from the storey below can still be the same physical slab — BuildingManager.addSlab rejects a
 * second coplanar piece; see SlabToolBase.ts.
 */
export class FloorTool extends SlabToolBase {
	constructor(options: FloorToolOptions) {
		super(
			{
				toolId: 'floor',
				slabType: 'floor',
				label: 'Floor',
				getThickness: (settings) => settings.floorThickness
			},
			options
		);
	}
}
