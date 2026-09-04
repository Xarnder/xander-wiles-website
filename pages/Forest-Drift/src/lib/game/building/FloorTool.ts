import type * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
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
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Floor Tool — thin wrapper around SlabToolBase for placing an upper-storey floor. Defaults to the
 * exact same elevation formula as CeilingTool (`level.baseY + level.wallHeight`), which is what lets
 * a floor placed here and a ceiling placed from the level below resolve to the SAME physical slab —
 * BuildingManager.addSlab's same-level overlap rule rejects the second placement as a duplicate
 * rather than creating two coplanar objects; see SlabToolBase.ts's class doc comment.
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
