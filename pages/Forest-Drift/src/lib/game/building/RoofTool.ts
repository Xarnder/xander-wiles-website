import type * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState } from './FoundationTypes';
import { SlabToolBase } from './SlabToolBase';
import type { TerrainSettings } from '../terrain/TerrainSettings';

export interface RoofToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	buildingManager: BuildingManager;
	levelManager: BuildingLevelManager;
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/** Flat Roof Tool — thin wrapper around SlabToolBase; walkable flat cap for the top level, using `roofThickness` and the darker roof material set up in SlabManager. */
export class RoofTool extends SlabToolBase {
	constructor(options: RoofToolOptions) {
		super(
			{
				toolId: 'flat-roof',
				slabType: 'flat-roof',
				label: 'Flat Roof',
				getThickness: (settings) => settings.roofThickness
			},
			options
		);
	}
}
