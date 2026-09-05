import type * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState } from './FoundationTypes';
import { SlabToolBase } from './SlabToolBase';
import type { TerrainSettings } from '../terrain/TerrainSettings';

export interface CeilingToolOptions {
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

/** Ceiling Tool — thin wrapper around SlabToolBase; see SlabToolBase.ts for the shared implementation. */
export class CeilingTool extends SlabToolBase {
	constructor(options: CeilingToolOptions) {
		super(
			{
				toolId: 'ceiling',
				slabType: 'ceiling',
				label: 'Ceiling',
				getThickness: (settings) => settings.floorThickness
			},
			options
		);
	}
}
