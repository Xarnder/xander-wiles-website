/**
 * Building-system types. Framework- and Three.js-free, same rule as terrain/TerrainSettings.ts —
 * this is plain, serializable world-state data plus the dev-only settings that control the
 * building tools.
 */

import type { BeamOrientation } from './beamMath';
import type { BuildingLevelUiState } from './BuildingLevelTypes';
import type {
	FloorDetailPlankDirection,
	FloorDetailRenderMode,
	FloorDetailTilePattern
} from './FloorDetailTypes';
import { DEFAULT_FLOOR_DETAIL_COLORS } from './FloorDetailTypes';
import type { FurnitureKind } from './FurnitureTypes';
import { DEFAULT_FURNITURE_KIND, getFurnitureCatalogueEntry } from './furnitureCatalogue';
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
	| 'beam'
	| 'polygon-wall'
	| 'ceiling'
	| 'floor'
	| 'flat-roof'
	| 'stairs'
	| 'floor-carpet'
	| 'floor-path'
	| 'floor-planks'
	| 'floor-tiles'
	| 'torch'
	| 'place-object'
	| 'remove'
	| 'music'
	| 'paint'
	| 'move'
	| 'none';

export interface HotbarSlotVariant {
	toolId: ToolId;
	label: string;
	furnitureKind?: FurnitureKind;
}

/** Source-of-truth grouping: one numbered key, one or more tools cycled with ↑/↓. Index 0 is the default. */
export interface HotbarSlotDefinition {
	slot: number;
	variants: readonly HotbarSlotVariant[];
}

/**
 * Resolved view of one hotbar button — `toolId`/`label` are whichever variant is currently
 * selected. `variantCount > 1` means ↑/↓ will cycle this slot.
 */
export interface HotbarSlot {
	slot: number;
	toolId: ToolId;
	label: string;
	variantCount: number;
	variantIndex: number;
	furnitureKind?: FurnitureKind;
}

/**
 * 1 Foundation · 2 Poly Wall/Wall · 3 Door/Window/Beam · 4 Ceiling/Floor/Roof · 5 Stairs ·
 * 6 Floor Detailing (Carpet / Path / Planks / Tiles) · 8 Place Object (Mini Builds + lights, chosen in
 * the Object Library with `E`). Slot 7 is unused.
 */
export const DEFAULT_HOTBAR_SLOTS: readonly HotbarSlotDefinition[] = [
	{ slot: 1, variants: [{ toolId: 'foundation', label: 'Foundation' }] },
	{
		slot: 2,
		variants: [
			{ toolId: 'polygon-wall', label: 'Poly Wall' },
			{ toolId: 'wall', label: 'Wall' }
		]
	},
	{
		slot: 3,
		variants: [
			{ toolId: 'door', label: 'Door' },
			{ toolId: 'window', label: 'Window' },
			{ toolId: 'beam', label: 'Beam' }
		]
	},
	{
		slot: 4,
		variants: [
			{ toolId: 'ceiling', label: 'Ceiling' },
			{ toolId: 'floor', label: 'Floor' },
			{ toolId: 'flat-roof', label: 'Roof' }
		]
	},
	{ slot: 5, variants: [{ toolId: 'stairs', label: 'Stairs' }] },
	{
		slot: 6,
		variants: [
			{ toolId: 'floor-carpet', label: 'Carpet' },
			{ toolId: 'floor-path', label: 'Path' },
			{ toolId: 'floor-planks', label: 'Planks' },
			{ toolId: 'floor-tiles', label: 'Tiles' }
		]
	},
	{ slot: 8, variants: [{ toolId: 'place-object', label: 'Place Object' }] }
];

export function cycleHotbarVariantIndex(
	variantCount: number,
	currentIndex: number,
	delta: number
): number {
	if (variantCount <= 1) return 0;
	return (((currentIndex + delta) % variantCount) + variantCount) % variantCount;
}

export function resolveHotbarSlot(
	definition: HotbarSlotDefinition,
	variantIndex: number
): HotbarSlot {
	const max = Math.max(0, definition.variants.length - 1);
	const index = Math.max(0, Math.min(max, variantIndex));
	const variant = definition.variants[index] ?? definition.variants[0];
	return {
		slot: definition.slot,
		toolId: variant?.toolId ?? 'none',
		label: variant?.label ?? '',
		variantCount: definition.variants.length,
		variantIndex: variant ? index : 0,
		furnitureKind: variant?.furnitureKind
	};
}

/** Tools whose next placement can be tuned with `E`. */
export const FLOOR_DETAIL_TOOLS = [
	'floor-carpet',
	'floor-path',
	'floor-planks',
	'floor-tiles'
] as const;
export type FloorDetailToolId = (typeof FLOOR_DETAIL_TOOLS)[number];

export function isFloorDetailTool(id: ToolId): id is FloorDetailToolId {
	return (
		id === 'floor-carpet' || id === 'floor-path' || id === 'floor-planks' || id === 'floor-tiles'
	);
}

export const CUSTOMIZABLE_PLACEMENT_TOOLS = [
	'window',
	'door',
	'beam',
	'wall',
	'polygon-wall',
	'stairs',
	'floor-carpet',
	'floor-path',
	'floor-planks',
	'floor-tiles',
	'torch',
	'place-object'
] as const;
export type CustomizablePlacementToolId = (typeof CUSTOMIZABLE_PLACEMENT_TOOLS)[number];

export function isCustomizablePlacementTool(id: ToolId): id is CustomizablePlacementToolId {
	return (
		id === 'window' ||
		id === 'door' ||
		id === 'beam' ||
		id === 'wall' ||
		id === 'polygon-wall' ||
		id === 'stairs' ||
		id === 'torch' ||
		id === 'place-object' ||
		isFloorDetailTool(id)
	);
}

export type SlabHeightToolId = 'ceiling' | 'floor' | 'flat-roof';

/** Ceiling / Floor / Roof — `E` opens the placement-height modal. */
export function isSlabHeightTool(id: ToolId): id is SlabHeightToolId {
	return id === 'ceiling' || id === 'floor' || id === 'flat-roof';
}

/** Slider ranges — match the debug GUI's Walls / Windows / Doors / Beams folders. */
export const PLACEMENT_CUSTOMIZE_LIMITS = {
	windowWidth: { min: 0.2, max: 4, step: 0.05 },
	windowHeight: { min: 0.2, max: 3, step: 0.05 },
	windowSillHeight: { min: 0, max: 3, step: 0.05 },
	doorWidth: { min: 0.4, max: 3, step: 0.05 },
	doorHeight: { min: 0.5, max: 4, step: 0.05 },
	doorSillHeight: { min: 0, max: 3, step: 0.05 },
	beamWidth: { min: 0.2, max: 4, step: 0.05 },
	beamHeight: { min: 0.04, max: 0.8, step: 0.01 },
	wallHeight: { min: 0.5, max: 6, step: 0.05 },
	wallThickness: { min: 0.05, max: 0.5, step: 0.01 },
	floorDetailPlankWidth: { min: 0.08, max: 0.5, step: 0.01 },
	floorDetailTileSize: { min: 0.2, max: 1.2, step: 0.05 },
	floorDetailPathWidth: { min: 0.4, max: 3, step: 0.05 }
} as const;

/** Default timber / door-leaf colours — same hex the unpainted templates already use. */
export const DEFAULT_WINDOW_COLOR = '#5C4632';
export const DEFAULT_DOOR_COLOR = '#8A5A35';
export const DEFAULT_BEAM_COLOR = '#5C4632';
/** Unpainted stair solid — same cream as the original shared `stairMaterial`. */
export const DEFAULT_STAIR_COLOR = '#B9AC95';

export function placementColorForTool(
	settings: BuildingSettings,
	toolId: CustomizablePlacementToolId
): string | undefined {
	if (toolId === 'door') return settings.doorColor;
	if (toolId === 'beam') return settings.beamColor;
	if (toolId === 'window') return settings.windowColor;
	if (toolId === 'stairs') return settings.stairColor;
	return undefined;
}

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
	showCollisionGeometry: boolean;

	windowWidth: number;
	windowHeight: number;
	/** Bottom of the next window, metres above the wall base. Copied onto the opening as `minY`. */
	windowSillHeight: number;
	/** Next-window frame colour (`#RRGGBB`). Copied onto the opening at place time. */
	windowColor: string;

	doorWidth: number;
	doorHeight: number;
	/** Bottom of the next door, metres above the wall base (`0` = this storey's floor). Copied onto the opening as `minY`. */
	doorSillHeight: number;
	/** Next-door leaf colour (`#RRGGBB`). Copied onto the opening at place time. */
	doorColor: string;

	/**
	 * Placeable wall timber (Beam tool) — same U snap / edge-margin rules as Window/Door.
	 * `beamOrientation` defaults to vertical: a floor-to-top post whose along-wall size is
	 * `beamHeight`. Horizontal keeps the older look-centred strip (`beamWidth` × `beamHeight`).
	 * `beamDepthExtra` is visual-only (how far the board stands proud of each wall face).
	 */
	beamOrientation: BeamOrientation;
	beamWidth: number;
	beamHeight: number;
	beamDepthExtra: number;
	/** Next-beam timber colour (`#RRGGBB`). Copied onto the beam at place time. */
	beamColor: string;

	openingGridSize: number;
	openingEdgeMargin: number;
	openingSpacing: number;

	/**
	 * Procedural window/door visual inserts (see OpeningVisualBuilder.ts) — purely derived render
	 * geometry sized from each opening's own `minU/maxU/minY/maxY`, never persisted. Every dimension
	 * here is a PREFERRED size only: `openingVisualMath.clampFrameWidth` scales width down for an
	 * unusually small opening so a tiny window never inherits a comically oversized fixed frame.
	 * Frame *depth* is the opposite — `clampFrameDepth` always produces a depth thicker than the
	 * wall so window and door frames extrude past both faces.
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
	/** Extra inset between the door leaf and its frame (top + both sides). `0` means the leaf fills the inner jambs and lintel with no visible gap. Never subtracted from the bottom, which always stays flush with the opening's `minY` (the storey floor when the sill is 0). */
	doorClearance: number;

	/**
	 * Procedural wall edge framing (vertical corner posts + a top beam/cap — see WallFrameBuilder.ts)
	 * — purely derived render geometry rebuilt from each wall/path's own length/height/thickness/
	 * baseY, never persisted. The same timber is also applied to each placed foundation cuboid
	 * (four corner posts + four top beams, flush with the foundation's outer faces). `wallFrameWidth`
	 * is each post's along-wall face width; the top beam's
	 * vertical thickness is twice that so the cap reads as the same timber on the wall face. The beam
	 * top sits just below the authored wall height so it does not share a plane with a slab or the
	 * wall body (see buildingVisualInsets.ts). For a standalone wall the top beam spans the wall's
	 * length plus a small overhang past each end so its end faces are not coplanar with the wall's.
	 * `wallFrameDepthExtra` is how far the frame protrudes past each wall face (added to
	 * `wallThickness / 2` on both sides, never subtracted from it, so a frame never sinks INSIDE
	 * the wall).
	 */
	wallFrameEnabled: boolean;
	wallFrameWidth: number;
	wallFrameDepthExtra: number;
	/** Dev-only: outlines every wall/path frame mesh's own bounding edges — useful for diagnosing diagonal/polygon corner joins. */
	showWallFrameBounds: boolean;
	/** Dev-only: small markers at every polygon-wall-path corner post's join point — see WallFrameBuilder's corner-post footprint derivation. */
	showWallFrameJoins: boolean;

	/**
	 * Interior skirting (baseboards) — derived, never persisted. A ceiling / upper floor / flat roof
	 * sitting on a wall's top is a lid over a room; only walls under that lid's edges get a board,
	 * and only on the inside face. See skirtingMath.ts.
	 */
	skirtingEnabled: boolean;
	skirtingHeight: number;
	skirtingDepth: number;

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

	/**
	 * When true, the next ceiling / floor / roof sits at the current storey's wall-top
	 * (`level.baseY + level.wallHeight`). When false, `slabPlacementHeight` is used instead.
	 * Live only — stamped onto the piece as `localY` / roof `baseY` at place time.
	 */
	slabPlacementFollowWalls: boolean;
	/** Metres above the current storey floor when `slabPlacementFollowWalls` is false. */
	slabPlacementHeight: number;
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
	/** Next-stair solid colour (`#RRGGBB`). Copied onto the stair at place time. */
	stairColor: string;
	/**
	 * Next-stair decorative timber (stringers, back frame, nosings) — see StairFrameBuilder.ts.
	 * Copied onto the stair at place time; changing this later does not rebuild existing stairs.
	 */
	stairFrameEnabled: boolean;
	/**
	 * Next-stair inner railings, balusters, and newels — independent of `stairFrameEnabled`.
	 * Copied onto the stair at place time.
	 */
	stairRailingsEnabled: boolean;
	/**
	 * Next-stair slab hole — whether the stair cuts through the floor/ceiling it reaches.
	 * Copied onto the stair at place time. Independent of `slabOpeningFrameEnabled` (the lining).
	 */
	stairOpeningEnabled: boolean;
	stairFrameWidth: number;
	/** How far stair timber may sit past a width face or the back — not added on top of frame width. */
	stairFrameDepthExtra: number;
	/**
	 * Next-stair timber lining in the slab hole the stair cuts — sits inside the cut, see
	 * SlabOpeningFrameBuilder.ts. Copied onto the stair (and that opening) at place time.
	 */
	slabOpeningFrameEnabled: boolean;
	slabOpeningFrameWidth: number;
	/** How far the lining sits past the slab's top and underside — not a flange onto the floor. */
	slabOpeningFrameDepthExtra: number;

	/** Maximum crosshair-to-target distance Remove Mode will raycast — see RemoveTool.ts and the README's "Remove Mode" section. Reused, not duplicated, by any future removal target types. */
	removeToolMaxDistance: number;
	/** Dev-only: renders every window/door OpeningPickingProxy as a visible translucent box instead of an invisible one, so the picking geometry itself can be inspected. */
	showRemovalPickingProxies: boolean;

	/** Maximum crosshair-to-target distance Paint Mode will raycast — same reasoning as `removeToolMaxDistance`, kept separate so each mode's range is independently tunable. */
	paintToolMaxDistance: number;

	/**
	 * Floor detailing (hotbar 6) — stamped onto each piece at place time. Changing these after
	 * placing never rebuilds existing carpets/paths/planks/tiles. `floorDetailRenderMode` is the
	 * 3D-boards vs thin-plane default; E customise and this GUI both write the same field.
	 */
	floorDetailRenderMode: FloorDetailRenderMode;
	floorDetailColorA: string;
	floorDetailColorB: string;
	floorDetailPlankWidth: number;
	floorDetailPlankDirection: FloorDetailPlankDirection;
	floorDetailTileSize: number;
	floorDetailTilePattern: FloorDetailTilePattern;
	floorDetailPathWidth: number;
	floorDetailPathFraming: boolean;
	floorDetailPreviewOpacity: number;
	showFloorDetailBounds: boolean;

	/**
	 * Place Object (hotbar 8) — stamped onto each item at place time. Changing these never rebuilds
	 * already-placed furniture. Last-used kind/dimensions persist in FurniturePresetStore, not the world.
	 */
	furnitureKind: FurnitureKind;
	furnitureRotationY: number;
	furnitureWidth: number;
	furnitureDepth: number;
	furnitureHeight: number;
	furnitureBackrest: boolean;
	furnitureHeadboard: boolean;
	furnitureShelfCount: number;
	furniturePrimaryColor: string;
	furnitureSecondaryColor: string;
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
		showCollisionGeometry: false,

		windowWidth: 1.2,
		windowHeight: 1.2,
		windowSillHeight: 0.9,
		windowColor: DEFAULT_WINDOW_COLOR,

		doorWidth: 1.2,
		doorHeight: 2.1,
		doorSillHeight: 0,
		doorColor: DEFAULT_DOOR_COLOR,

		beamOrientation: 'vertical',
		beamWidth: 1.2,
		beamHeight: 0.16,
		beamDepthExtra: 0.05,
		beamColor: DEFAULT_BEAM_COLOR,

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
		doorClearance: 0,

		wallFrameEnabled: true,
		wallFrameWidth: 0.12,
		wallFrameDepthExtra: 0.05,
		showWallFrameBounds: false,
		showWallFrameJoins: false,

		skirtingEnabled: true,
		skirtingHeight: 0.1,
		skirtingDepth: 0.02,

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

		slabPlacementFollowWalls: true,
		slabPlacementHeight: 3,
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
		stairColor: DEFAULT_STAIR_COLOR,
		stairFrameEnabled: true,
		stairRailingsEnabled: true,
		stairOpeningEnabled: true,
		stairFrameWidth: 0.12,
		stairFrameDepthExtra: 0.05,
		slabOpeningFrameEnabled: true,
		slabOpeningFrameWidth: 0.055,
		slabOpeningFrameDepthExtra: 0.01,

		removeToolMaxDistance: 12,
		showRemovalPickingProxies: false,

		paintToolMaxDistance: 12,

		floorDetailRenderMode: '3d',
		floorDetailColorA: DEFAULT_FLOOR_DETAIL_COLORS.planks[0],
		floorDetailColorB: DEFAULT_FLOOR_DETAIL_COLORS.planks[1],
		floorDetailPlankWidth: 0.2,
		floorDetailPlankDirection: 'x',
		floorDetailTileSize: 0.4,
		floorDetailTilePattern: 'checker',
		floorDetailPathWidth: 1,
		floorDetailPathFraming: true,
		floorDetailPreviewOpacity: 0.55,
		showFloorDetailBounds: false,

		...defaultFurnitureLiveSettings()
	};
}

function defaultFurnitureLiveSettings(): Pick<
	BuildingSettings,
	| 'furnitureKind'
	| 'furnitureRotationY'
	| 'furnitureWidth'
	| 'furnitureDepth'
	| 'furnitureHeight'
	| 'furnitureBackrest'
	| 'furnitureHeadboard'
	| 'furnitureShelfCount'
	| 'furniturePrimaryColor'
	| 'furnitureSecondaryColor'
> {
	const entry = getFurnitureCatalogueEntry(DEFAULT_FURNITURE_KIND);
	return {
		furnitureKind: DEFAULT_FURNITURE_KIND,
		furnitureRotationY: 0,
		furnitureWidth: entry.dimensions.defaultWidth,
		furnitureDepth: entry.dimensions.defaultDepth,
		furnitureHeight: entry.dimensions.defaultHeight,
		furnitureBackrest: true,
		furnitureHeadboard: true,
		furnitureShelfCount: 4,
		furniturePrimaryColor: entry.defaultPrimary,
		furnitureSecondaryColor: entry.defaultSecondary
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
	 * Window/Door/Beam wall-division snap label (see openingDivisionSnap.ts) — e.g. `QUARTER SNAP`. Shown
	 * on the same crosshair badge as `snapMode`; `undefined` means metre-grid snap (the default) and
	 * hides the badge, matching `'off'` for polygon tools.
	 */
	snapBadge?: string;
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
	 * Whether Build Mode is on (`G`). The numbered hotbar and construction tools are shown/active
	 * only while this is true — turning it off hides the hotbar and suspends placement without
	 * forgetting `activeSlot`. Compose Mode (`M`) is independent and can stay on either way.
	 */
	buildModeActive: boolean;
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
	globalMode: 'none' | 'remove' | 'music' | 'paint' | 'move';
}
