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

export type ToolId =
	| 'foundation'
	| 'wall'
	| 'window'
	| 'door'
	| 'polygon-wall'
	| 'ceiling'
	| 'floor'
	| 'flat-roof'
	| 'none';

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
	{ slot: 5, toolId: 'polygon-wall', label: 'Poly Wall' },
	{ slot: 6, toolId: 'ceiling', label: 'Ceiling' },
	{ slot: 7, toolId: 'floor', label: 'Floor' },
	{ slot: 8, toolId: 'flat-roof', label: 'Roof' }
];

export type FoundationToolState = 'idle' | 'first-corner-selected';

/** Wall Tool's two-click state machine — mirrors FoundationToolState. */
export type WallToolState = 'idle' | 'first-point-selected';

/** Polygon Wall Tool's state — 'idle' means no path is being drawn yet; 'drawing' retains every confirmed point so far. */
export type PolygonWallToolState = 'idle' | 'drawing';

/** Slab (Ceiling/Floor/Flat Roof) Tool's state — same shape as PolygonWallToolState, but a slab polygon can only ever be closed (there's no "open slab" concept). */
export type SlabToolState = 'idle' | 'drawing';

/** How lower building levels render while editing a higher one — see BuildingLevelManager. */
export type BuildingLevelViewMode = 'all' | 'current-and-below' | 'current-only';

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

	/** Corner-join style for the Polygon/Continuous Wall Tool — standalone walls are unaffected (they have no interior joints). */
	wallJoinStyle: 'miter' | 'bevel';
	/** miterDistance / halfThickness above which a corner automatically falls back to a bevel, so a very acute angle never produces a runaway spike. */
	miterLimit: number;
	/**
	 * Minimum clearance an opening must keep from a polygon-wall segment's *joined* ends (as
	 * opposed to `openingEdgeMargin`, which applies to a plain, unjoined end). Defaults to
	 * whichever is larger of the two — a join's visual extent scales with wall thickness, so a
	 * thicker wall needs a wider corner margin regardless of the configured edge margin.
	 */
	cornerOpeningMargin: number;

	/** Default wall height for a newly-created building level (see BuildingLevelManager) — levelBaseY = levelIndex * defaultStoreyHeight, frozen into each BuildingLevelDefinition once created. */
	defaultStoreyHeight: number;
	/** Which level Wall/Polygon Wall/Slab tools currently build on — a live "current floor" selector, changed via Page Up/Page Down (see BuildingLevelManager), not just a placement default. */
	currentBuildingLevelIndex: number;
	showLevelConstructionPlane: boolean;
	buildingLevelViewMode: BuildingLevelViewMode;

	floorThickness: number;
	roofThickness: number;
	showSlabBounds: boolean;
	showSlabPolygonPoints: boolean;
	slabPreviewOpacity: number;
	/** Whether slab polygon points snap strongly to nearby existing wall endpoints/corners, in addition to the plain fine grid — still resolves to the same underlying BuildingGridPoint, never an off-grid position. */
	snapToWallCorners: boolean;
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
		openingSpacing: 0.15,

		wallJoinStyle: 'miter',
		miterLimit: 4,
		cornerOpeningMargin: 0.15,

		defaultStoreyHeight: 3,
		currentBuildingLevelIndex: 0,
		showLevelConstructionPlane: true,
		buildingLevelViewMode: 'all',

		floorThickness: 0.2,
		roofThickness: 0.25,
		showSlabBounds: false,
		showSlabPolygonPoints: true,
		slabPreviewOpacity: 0.45,
		snapToWallCorners: true
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
