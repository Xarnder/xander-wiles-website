/**
 * Building-system types. Framework- and Three.js-free, same rule as terrain/TerrainSettings.ts —
 * this is plain, serializable world-state data plus the dev-only settings that control the
 * building tools.
 */

import type { BuildingLevelUiState } from './BuildingLevelTypes';
import type { BuildingMaterialDefinition } from './MaterialTypes';
import type { RoofType } from './RoofTypes';

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
 *
 * `material` is `undefined` for an unpainted foundation (renders using FoundationManager's own
 * default look); painting one (Paint Tool) only ever changes this field — never `topY`/`bottomY`/
 * the grid footprint, so a foundation's terrain intersection, building origin, and collision are
 * always completely unaffected by its colour. See WallDefinition.material's doc comment for the
 * same "undefined = inherit the default" convention this mirrors.
 */
export interface FoundationDefinition {
	id: string;
	minGridX: number;
	maxGridX: number;
	minGridZ: number;
	maxGridZ: number;
	topY: number;
	bottomY: number;
	material?: BuildingMaterialDefinition;
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
	| 'stairs'
	| 'remove'
	| 'paint'
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
	{ slot: 8, toolId: 'flat-roof', label: 'Roof' },
	{ slot: 9, toolId: 'stairs', label: 'Stairs' }
];

export type FoundationToolState = 'idle' | 'first-corner-selected';

/** Wall Tool's two-click state machine — mirrors FoundationToolState. */
export type WallToolState = 'idle' | 'first-point-selected';

/** Polygon Wall Tool's state — 'idle' means no path is being drawn yet; 'drawing' retains every confirmed point so far. */
export type PolygonWallToolState = 'idle' | 'drawing';

/** Slab (Ceiling/Floor/Flat Roof) Tool's state — same shape as PolygonWallToolState, but a slab polygon can only ever be closed (there's no "open slab" concept). */
export type SlabToolState = 'idle' | 'drawing';

/** Roof Tool's state — same polygon-drawing phase as `SlabToolState`, plus an `'adjusting'` phase entered once the footprint polygon closes: `V`/`R`/↑/↓ change the roof's type/orientation/rise live in preview until confirmed — see RoofTool.ts. */
export type RoofToolState = 'idle' | 'drawing' | 'adjusting';

/** Stair Tool's state — two-click rectangular footprint (mirrors FoundationToolState), then a direction-selection step before confirming — see StairTool.ts. */
export type StairToolState = 'idle' | 'first-corner-selected' | 'choosing-direction';

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

	/**
	 * Procedural window/door visual inserts (see OpeningVisualBuilder.ts) — purely derived render
	 * geometry sized from each opening's own `minU/maxU/minY/maxY`, never persisted. Every dimension
	 * here is a PREFERRED size only: `openingVisualMath.clampFrameWidth`/`clampFrameDepth` scale it
	 * down for an unusually small opening or a thin wall, so a tiny window never inherits a
	 * comically oversized fixed frame.
	 */
	windowFramesEnabled: boolean;
	windowFrameWidth: number;
	windowFrameDepth: number;
	windowGlassEnabled: boolean;

	doorFramesEnabled: boolean;
	doorFrameWidth: number;
	doorFrameDepth: number;
	/** The door leaf's own thickness (a thin solid box, never a zero-thickness plane). */
	doorThickness: number;
	/** Gap kept between the door leaf and its frame (top + both sides) so the leaf never intersects the jambs/lintel — never subtracted from the bottom, which always stays flush with the floor. */
	doorClearance: number;

	/** Dev-only: outlines each opening's own logical `minU/maxU/minY/maxY` rect — the same bounds `OpeningVisualBuilder` derives everything from, useful for diagnosing procedural sizing. */
	showOpeningBounds: boolean;
	/** Dev-only: outlines the actual (post-clamping) frame rects `openingVisualMath` computed — shows exactly what adaptive frame-width scaling produced for THIS opening. */
	showOpeningFrameBounds: boolean;
	/** Dev-only: renders a small marker at a door's `hingePivot` — the axis a future interactive door will rotate around. */
	showDoorHinge: boolean;

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
	/**
	 * A live, best-effort MIRROR of whichever foundation is currently active's current level index —
	 * kept only so the dev-only debug GUI has something sensible to display. `BuildingLevelManager`'s
	 * own per-foundation map is the actual source of truth; this field is written TO, never read FROM,
	 * by anything outside the debug GUI (see BuildingLevelManager's class doc comment).
	 */
	currentBuildingLevelIndex: number;
	/** Safety limit on how many levels Page Up / the floor selector can CREATE for one foundation — not a game-design restriction, just a sane upper bound (see BuildingLevelManager.moveUp). Selecting an already-authored level above this count is still always allowed. */
	maxBuildingLevels: number;
	showLevelConstructionPlane: boolean;
	buildingLevelViewMode: BuildingLevelViewMode;
	/** When true, levels other than the current one (per `buildingLevelViewMode`) render at reduced opacity instead of full brightness — a purely visual editing aid, never a material change. */
	fadeNonCurrentLevels: boolean;

	floorThickness: number;
	/** Flat-roof-as-slab thickness (see SlabTypes.ts's `'flat-roof'` `SlabType` member) — unrelated to pitched-roof `RoofDefinition.thickness`, which every roof type (including `'flat'`, when built via Roof Tool) uses `roofDeckThickness` for instead. Kept so any world saved before this session's pitched-roof system still reproduces its old flat-roof-as-slab geometry unchanged. */
	roofThickness: number;
	showSlabBounds: boolean;
	showSlabPolygonPoints: boolean;
	slabPreviewOpacity: number;

	/**
	 * Roof Tool defaults — see RoofTypes.ts for what each field means. `V`/`R`/↑/↓ change these per
	 * roof while drawing; the settings here are only the STARTING point for a newly-drawn roof and
	 * the increment ↑/↓ steps by, never retroactively applied to an already-placed roof. Roof Tool
	 * re-applies `defaultRoofType` / `defaultRoofRise` every time it is selected.
	 */
	defaultRoofType: RoofType;
	/** Starting rise (metres) when the Roof Tool is selected or a new footprint enters `'adjusting'`. */
	defaultRoofRise: number;
	roofDeckThickness: number;
	/** ↑/↓ step size, metres — defaults to one building-grid cell so rise stays a "clean" number. */
	roofRiseStep: number;
	/** Shift+↑/↓ uses this smaller step instead, for fine adjustment. */
	roofRiseFineStep: number;
	roofOverhang: number;
	roofPreviewOpacity: number;
	gambrelLowerSlopeFraction: number;
	gambrelBreakHeightFraction: number;
	mansardBreakFraction: number;
	dutchGableHipFraction: number;
	mShapedValleyFraction: number;
	showRoofBounds: boolean;
	showRoofPlanes: boolean;
	showRoofRidge: boolean;
	showRoofNormals: boolean;

	/**
	 * Minimum stair footprint dimensions, in building-grid cells — see stairMath.validateStairFootprint.
	 * `minimumStairWidthCells`'s default is chosen well above the player's own collision diameter
	 * (`PLAYER_COLLISION_RADIUS * 2` in ThreeScene.ts) so a minimum-width staircase is always
	 * comfortably walkable, not merely technically non-zero-width.
	 */
	minimumStairWidthCells: number;
	minimumStairRunCells: number;
	/**
	 * How far above the player's current supporting surface a step may rise and still be walked
	 * onto automatically (no jump needed) — see WorldSurfaceSampler's stair-aware supporting-surface
	 * query. Must be `>= buildingGridSize` for stairs built on the default grid to be climbable at
	 * all; kept independently configurable rather than hardcoded to buildingGridSize so a dev can
	 * loosen/tighten it without it silently changing every future stair's own step height (which
	 * stays governed by `gridSizeAtCreation`, not this setting).
	 */
	maxStepHeight: number;
	stairPreviewOpacity: number;
	showStairBounds: boolean;
	/** Whether the live stair preview shows a bottom/top marker + travel-direction arrow. */
	showStairDirection: boolean;
	/** Minimum vertical clearance (world units) an automatically-generated upper-floor stair opening must leave above the topmost few treads — see the README's "Stair openings" section. */
	stairHeadClearance: number;

	/** Maximum crosshair-to-target distance Remove Mode will raycast — see RemoveTool.ts and the README's "Remove Mode" section. Reused, not duplicated, by any future removal target types. */
	removeToolMaxDistance: number;
	/** Dev-only: renders every window/door OpeningPickingProxy as a visible translucent box instead of an invisible one, so the picking geometry itself can be inspected. */
	showRemovalPickingProxies: boolean;

	/** Maximum crosshair-to-target distance Paint Mode will raycast — same reasoning as `removeToolMaxDistance`, kept separate so each mode's range is independently tunable. */
	paintToolMaxDistance: number;
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

		windowFramesEnabled: true,
		windowFrameWidth: 0.08,
		windowFrameDepth: 0.08,
		windowGlassEnabled: true,

		doorFramesEnabled: true,
		doorFrameWidth: 0.08,
		doorFrameDepth: 0.08,
		doorThickness: 0.04,
		doorClearance: 0.02,

		showOpeningBounds: false,
		showOpeningFrameBounds: false,
		showDoorHinge: false,

		wallJoinStyle: 'miter',
		miterLimit: 4,
		cornerOpeningMargin: 0.15,

		defaultStoreyHeight: 3,
		currentBuildingLevelIndex: 0,
		maxBuildingLevels: 10,
		showLevelConstructionPlane: true,
		buildingLevelViewMode: 'current-and-below',
		fadeNonCurrentLevels: false,

		floorThickness: 0.2,
		roofThickness: 0.25,
		showSlabBounds: false,
		showSlabPolygonPoints: true,
		slabPreviewOpacity: 0.45,

		defaultRoofType: 'gable',
		defaultRoofRise: 4,
		roofDeckThickness: 0.2,
		roofRiseStep: 0.25,
		roofRiseFineStep: 0.0625,
		roofOverhang: 0.3,
		roofPreviewOpacity: 0.5,
		gambrelLowerSlopeFraction: 0.55,
		gambrelBreakHeightFraction: 0.65,
		mansardBreakFraction: 0.7,
		dutchGableHipFraction: 0.65,
		mShapedValleyFraction: 0.45,
		showRoofBounds: false,
		showRoofPlanes: false,
		showRoofRidge: false,
		showRoofNormals: false,

		minimumStairWidthCells: 4,
		minimumStairRunCells: 2,
		maxStepHeight: 0.3,
		stairPreviewOpacity: 0.55,
		showStairBounds: false,
		showStairDirection: true,
		stairHeadClearance: 2.1,

		removeToolMaxDistance: 12,
		showRemovalPickingProxies: false,

		paintToolMaxDistance: 12
	};
}

/** State pushed to the HUD/crosshair while a build tool is active. `null` means no tool is active. */
export interface BuildUiState {
	toolId: ToolId;
	crosshair: 'default' | 'valid' | 'invalid';
	hintLines: string[];
	/** The active draw-snap mode (see polygonDrawSnap.ts), for a dedicated on-screen badge near the crosshair — `undefined`/`'off'` shows nothing. Kept separate from `hintLines` so it can render as a prominent, differently-styled indicator rather than just another line of text. */
	snapMode?: 'off' | 'axis' | 'axis-inline' | 'wall-corners';
	/**
	 * Why the thing under the crosshair can't be placed on right now, rendered as a badge beside the
	 * crosshair itself rather than only in the corner HUD. A blocking reason is useless where the
	 * player isn't looking — and the corner HUD in particular can be covered by the dev GUI — so
	 * anything that explains "nothing is happening" belongs here too.
	 */
	notice?: string;
	/**
	 * The current building level, for the on-screen floor selector (▲ / name+elevation / ▼) — every
	 * tool except Foundation provides this, Window/Door included: they report whichever wall's
	 * foundation is being looked at, and only cut openings into walls on that foundation's selected
	 * level (see openingWallPick.ts, and the README's "Window/Door targeting" section).
	 * `undefined` when no foundation has ever been targeted yet.
	 */
	level?: BuildingLevelUiState;
	/** Paint Tool's currently selected colour (`#RRGGBB`), for the HUD's colour swatch row — see `+page.svelte`'s `.paint-color-row`. Only ever set by PaintTool's own HUD builders. */
	paintColor?: string;
}

export interface HotbarUiState {
	slots: readonly HotbarSlot[];
	activeSlot: number;
	/**
	 * Which temporary GLOBAL editing overlay (if any) is currently active — `'remove'` or `'paint'`,
	 * deliberately a single tri-state field rather than two independent booleans, so "both active at
	 * once" is structurally unrepresentable rather than merely avoided by convention (see the
	 * README's "Paint Tool" section: exactly one global edit mode may be active at a time; pressing
	 * `P` while Remove Mode is active exits it and enters Paint Mode, and vice versa for `X`).
	 *
	 * Deliberately separate from `activeSlot` rather than a slot value of its own, since a global
	 * mode is a temporary overlay, not a hotbar selection: `activeSlot` keeps pointing at whichever
	 * numbered tool was selected before the overlay was entered, and is restored to exactly that the
	 * moment it exits. See BuildToolManager's class doc comment.
	 */
	globalMode: 'none' | 'remove' | 'paint';
}
