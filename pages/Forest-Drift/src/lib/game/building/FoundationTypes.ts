/**
 * Building-system types. Framework- and Three.js-free, same rule as terrain/TerrainSettings.ts —
 * this is plain, serializable world-state data plus the dev-only settings that control the
 * building tools.
 */

/** One vertex of the global terrain grid. gridX/gridZ are authoritative; world coords are derived. */
export interface TerrainGridPoint {
	gridX: number;
	gridZ: number;
	worldX: number;
	worldZ: number;
	height: number;
}

/**
 * A placed, rectangular foundation. Grid-integer footprint + the two Y extents computed at
 * placement time. Nothing here references Three.js — this is what gets serialized.
 */
export interface FoundationDefinition {
	id: string;
	minGridX: number;
	maxGridX: number;
	minGridZ: number;
	maxGridZ: number;
	topY: number;
	bottomY: number;
}

export type ToolId = 'foundation' | 'wall' | 'window' | 'door' | 'none';

export interface HotbarSlot {
	slot: number;
	toolId: ToolId;
	label: string;
}

export const DEFAULT_HOTBAR_SLOTS: readonly HotbarSlot[] = [
	{ slot: 1, toolId: 'foundation', label: 'Foundation' },
	{ slot: 2, toolId: 'wall', label: 'Wall' },
	{ slot: 3, toolId: 'window', label: 'Window' },
	{ slot: 4, toolId: 'door', label: 'Door' },
	{ slot: 5, toolId: 'none', label: '' }
];

export type FoundationToolState = 'idle' | 'first-corner-selected';

/** Wall Tool's two-click state machine — mirrors FoundationToolState. */
export type WallToolState = 'idle' | 'first-point-selected';

/**
 * Dev-only controls for the building system, surfaced in the debug GUI's Building folder.
 * Foundation-tool fields are unchanged from before; everything below them configures the
 * foundation-local Wall/Window/Door tools (see WallTypes.ts / wallGeometryMath.ts). `openingGridSize`
 * / `openingEdgeMargin` / `openingSpacing` are shared by both Window and Door tools — an opening is
 * an opening regardless of type, so there is one set of placement rules rather than duplicated,
 * potentially-inconsistent per-type copies.
 */
export interface BuildingSettings {
	showVertexGrid: boolean;
	foundationGridDisplayRadius: number;
	maxFoundationCells: number;
	foundationUndergroundDepth: number;
	showFoundationHighestPoint: boolean;
	showFoundationBounds: boolean;
	previewOpacity: number;

	buildingGridSize: number;
	showBuildingGrid: boolean;
	buildingGridOpacity: number;

	wallHeight: number;
	wallThickness: number;
	minimumWallLength: number;
	showWallBounds: boolean;

	windowWidth: number;
	windowHeight: number;
	windowSillHeight: number;

	doorWidth: number;
	doorHeight: number;

	openingGridSize: number;
	openingEdgeMargin: number;
	openingSpacing: number;
}

export function createDefaultBuildingSettings(): BuildingSettings {
	return {
		showVertexGrid: true,
		foundationGridDisplayRadius: 5,
		maxFoundationCells: 64,
		foundationUndergroundDepth: 1,
		showFoundationHighestPoint: true,
		showFoundationBounds: false,
		previewOpacity: 0.45,

		buildingGridSize: 0.25,
		showBuildingGrid: true,
		buildingGridOpacity: 0.6,

		wallHeight: 3,
		wallThickness: 0.15,
		minimumWallLength: 0.25,
		showWallBounds: false,

		windowWidth: 1.2,
		windowHeight: 1.2,
		windowSillHeight: 0.9,

		doorWidth: 0.9,
		doorHeight: 2.1,

		openingGridSize: 0.1,
		openingEdgeMargin: 0.1,
		openingSpacing: 0.15
	};
}

/** State pushed to the HUD/crosshair while a build tool is active. `null` means no tool is active. */
export interface BuildUiState {
	toolId: ToolId;
	crosshair: 'default' | 'valid' | 'invalid';
	hintLines: string[];
}

export interface HotbarUiState {
	slots: readonly HotbarSlot[];
	activeSlot: number;
}
