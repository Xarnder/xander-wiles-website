import type * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { BuildingSettings, BuildUiState } from './FoundationTypes';
import { OpeningToolBase } from './OpeningToolBase';
import type { BuildTool } from './BuildToolManager';

export interface DoorToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	buildingManager: BuildingManager;
	levelManager: BuildingLevelManager;
	undoManager: BuildUndoManager;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Cuts door openings into existing walls — always extends to the wall's bottom (minY=0, the
 * foundation top), so there is no solid wall segment beneath a door and nothing to walk through.
 */
export class DoorTool implements BuildTool {
	readonly toolId = 'door' as const;
	private readonly base: OpeningToolBase;

	constructor(options: DoorToolOptions) {
		this.base = new OpeningToolBase(
			{
				toolId: 'door',
				openingType: 'door',
				label: 'DOOR',
				getWidth: (settings) => settings.doorWidth,
				getVerticalExtent: (settings) => ({ minY: 0, maxY: settings.doorHeight }),
				dimensionsHint: (settings) =>
					`${settings.doorWidth.toFixed(2)} × ${settings.doorHeight.toFixed(2)}m`
			},
			options
		);
	}

	activate(): void {
		this.base.activate();
	}

	deactivate(): void {
		this.base.deactivate();
	}

	update(): void {
		this.base.update();
	}

	onPrimaryAction(): void {
		this.base.onPrimaryAction();
	}

	onSecondaryAction(): void {
		this.base.onSecondaryAction();
	}

	dispose(): void {
		this.base.dispose();
	}
}
