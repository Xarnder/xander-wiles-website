import type * as THREE from 'three';
import type { BuildingManager } from './BuildingManager';
import type { BuildingSettings, BuildUiState } from './FoundationTypes';
import { OpeningToolBase } from './OpeningToolBase';
import type { BuildTool } from './BuildToolManager';

export interface WindowToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	buildingManager: BuildingManager;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Cuts window openings into existing walls — a real rectangular hole (see
 * wallGeometryMath.computeSolidWallSegments), not a floating glass mesh. Fixed sill height + a
 * fixed window height from settings, horizontal position only comes from where you're looking —
 * the "preferred first version" the spec calls out, kept simple on purpose.
 */
export class WindowTool implements BuildTool {
	readonly toolId = 'window' as const;
	private readonly base: OpeningToolBase;

	constructor(options: WindowToolOptions) {
		this.base = new OpeningToolBase(
			{
				toolId: 'window',
				openingType: 'window',
				label: 'WINDOW',
				getWidth: (settings) => settings.windowWidth,
				getVerticalExtent: (settings) => ({
					minY: settings.windowSillHeight,
					maxY: settings.windowSillHeight + settings.windowHeight
				}),
				dimensionsHint: (settings) =>
					`${settings.windowWidth.toFixed(2)} × ${settings.windowHeight.toFixed(2)}m  ·  Sill: ${settings.windowSillHeight.toFixed(2)}m`
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
