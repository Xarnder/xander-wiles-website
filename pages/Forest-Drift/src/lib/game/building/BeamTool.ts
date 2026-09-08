import type * as THREE from 'three';
import { beamAlongWallSize, beamExtentForOrientation } from './beamMath';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { BuildingSettings, BuildUiState } from './FoundationTypes';
import { OpeningToolBase } from './OpeningToolBase';
import type { BuildTool } from './BuildToolManager';

export interface BeamToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	buildingManager: BuildingManager;
	levelManager: BuildingLevelManager;
	undoManager: BuildUndoManager;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Places a decorative wood beam on an existing wall — same targeting, C-cycled U snap, and
 * edge-margin rules as Window/Door. Defaults to a vertical post (floor to top); `R` flips to a
 * horizontal board whose Y follows the look point. The wall is never cut.
 */
export class BeamTool implements BuildTool {
	readonly toolId = 'beam' as const;
	private readonly base: OpeningToolBase;

	constructor(options: BeamToolOptions) {
		this.base = new OpeningToolBase(
			{
				toolId: 'beam',
				placeKind: 'beam',
				label: 'BEAM',
				getWidth: (settings) =>
					beamAlongWallSize(settings.beamOrientation, settings.beamWidth, settings.beamHeight),
				getVerticalExtent: (settings, lookY, wallHeight) =>
					beamExtentForOrientation(
						settings.beamOrientation,
						lookY,
						settings.beamHeight,
						wallHeight,
						settings.openingGridSize
					),
				dimensionsHint: (settings) =>
					settings.beamOrientation === 'vertical'
						? `Vertical ${settings.beamHeight.toFixed(2)}m`
						: `Horizontal ${settings.beamWidth.toFixed(2)} × ${settings.beamHeight.toFixed(2)}m`
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
