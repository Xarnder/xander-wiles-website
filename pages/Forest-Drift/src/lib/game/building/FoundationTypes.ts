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

export type ToolId = 'foundation' | 'none';

export interface HotbarSlot {
	slot: number;
	toolId: ToolId;
	label: string;
}

export const DEFAULT_HOTBAR_SLOTS: readonly HotbarSlot[] = [
	{ slot: 1, toolId: 'foundation', label: 'Foundation' },
	{ slot: 2, toolId: 'none', label: '' },
	{ slot: 3, toolId: 'none', label: '' },
	{ slot: 4, toolId: 'none', label: '' },
	{ slot: 5, toolId: 'none', label: '' }
];

export type FoundationToolState = 'idle' | 'first-corner-selected';

/** Dev-only controls for the building system, surfaced in the debug GUI's Building folder. */
export interface BuildingSettings {
	showVertexGrid: boolean;
	foundationGridDisplayRadius: number;
	maxFoundationCells: number;
	foundationUndergroundDepth: number;
	showFoundationHighestPoint: boolean;
	showFoundationBounds: boolean;
	previewOpacity: number;
}

export function createDefaultBuildingSettings(): BuildingSettings {
	return {
		showVertexGrid: true,
		foundationGridDisplayRadius: 5,
		maxFoundationCells: 64,
		foundationUndergroundDepth: 1,
		showFoundationHighestPoint: true,
		showFoundationBounds: false,
		previewOpacity: 0.45
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
