/**
 * Mini Build schema and hard limits. Framework- and Three.js-free, like every other *Types.ts file:
 * this is the persisted, player-authored contract. Nothing here is a mesh, a geometry or a material
 * instance — compiled render assets are always regenerated from these recipes.
 *
 * A Mini Build is deliberately constrained (16 cuboids, 4 cylinders and 2 spheres on a 0.03125m grid, 4m bounds, 4 material
 * slots, rotations snapped to 7.5° units). A cuboid may be flat (size 0) on one axis, which makes it a plane.
 * Those limits are the creative rule of the system, so they live in exactly one place and every layer
 * (editor, validation, loader, compiler) reads them from here.
 */
import type { BuildingMaterialDefinition } from '../building/MaterialTypes';

/**
 * Bump when `MiniBuildDefinition`'s persisted shape changes.
 *
 * v1 — grid unit 0.125m, every size ≥ 1.
 * v2 — grid unit 0.0625m, one axis may be 0 (a plane).
 * v3 — grid unit 0.03125m (finer snap). Older coordinates are scaled up on load (v1 ×4, v2 ×2), so
 *      every saved design keeps exactly its size and shape in metres.
 * v4 — block rotations may be any multiple of 7.5° (not just quarter turns). Coordinates unchanged;
 *      every v3 design is a valid v4 design as-is.
 * v5 — optional authored interaction locations; geometry revision separated from semantic edits.
 * v6 — optional primitive shape, with fixed low-poly cylinders and spheres.
 */
export const MINI_BUILD_SCHEMA_VERSION = 6;

/** Current grid units per v1 grid unit (0.125m / 0.03125m): v1 designs are scaled by this when loaded. */
export const MINI_BUILD_V1_GRID_SCALE = 4;
/** Current grid units per v2 grid unit (0.0625m / 0.03125m). */
export const MINI_BUILD_V2_GRID_SCALE = 2;

/** How much a design saved at `schemaVersion` must be scaled to current grid units. */
export function miniBuildGridScaleFor(schemaVersion: number): number {
	if (schemaVersion <= 1) return MINI_BUILD_V1_GRID_SCALE;
	if (schemaVersion === 2) return MINI_BUILD_V2_GRID_SCALE;
	return 1;
}

/**
 * Bump when the compiler's output for the same definition changes (face emission, UVs, collision).
 * Part of the asset cache key and the content hash, so an improved compiler regenerates assets
 * rather than reusing stale ones — saved designs themselves never need migrating for it.
 */
export const MINI_BUILD_COMPILER_VERSION = 5;

export const MINI_BUILD_LIMITS = {
	maxInteractionLocations: 8,
	maxBlocks: 16,
	maxCylinders: 4,
	maxSpheres: 2,
	maxPrimitives: 22,
	/** Snap increment in metres for positions and sizes (3.125 cm). */
	gridSize: 0.03125,
	maxBounds: { x: 4, y: 4, z: 4 },
	/** `maxBounds / gridSize` — the same limit in integer grid units. */
	maxBoundsGrid: { x: 128, y: 128, z: 128 },
	maxMaterialSlots: 4,
	/**
	 * Sizes may reach 0 — a plane — but only on one axis per block (a line or a point would be
	 * invisible). Planes compile to a two-sided quad, never a six-sided cuboid.
	 */
	minBlockSizeGrid: 0,
	maxFlatAxesPerBlock: 1,
	/** Upper bound for `MiniBuildBlock.layer` (the editor keeps layers dense, 0–15). */
	maxPlaneLayer: 999,
	/** New cuboids start at 0.5m on every axis. */
	defaultBlockSizeGrid: 16,
	/** Editor workspace: X/Z in [-workspaceHalfGrid, workspaceHalfGrid] (±4m), Y in [0, maxBoundsGrid.y]. */
	workspaceHalfGrid: 128,
	/** Editor floor grid line spacing (metres) — coarser than the snap so the grid stays readable. */
	editorGridLineSpacing: 0.125,
	maxNameLength: 48
} as const;

/**
 * World-level limits. The primitive budget counts *source* cuboids (a 12-block chair costs 12
 * wherever it is placed, however it is rendered), so render optimisations never change what a
 * player is allowed to build.
 */
export const MINI_BUILD_WORLD_LIMITS = {
	/** Square Mini Build chunk edge in metres — budget, streaming and batching unit. Divides the default 96m terrain chunk. */
	chunkSize: 16,
	primitiveBudgetPerChunk: 512,
	/** Technical failsafe, not the creative limit — only very simple designs can reach it first. */
	maxInstancesPerChunk: 256,
	/** Fraction of the budget at which the "becoming very detailed" notice appears. */
	nearBudgetRatio: 0.85,
	maxDefinitionsPerWorld: 4_000,
	maxInstancesPerWorld: 200_000,
	/** Base render activation radius in metres (scaled by the graphics preset's render distance). */
	activationRadius: 176,
	/** Chunk rings around the player whose collision is active. */
	collisionRingChunks: 1,
	/** Batches beyond this distance (metres, chunk centre) do not cast shadows. */
	shadowDistance: 56,
	/** Chunk activations processed per frame so streaming never hitches. */
	chunkActivationsPerFrame: 6
} as const;

export const MINI_BUILD_COLLISION = {
	maxBoxesPerBuild: 8,
	/**
	 * `auto` blocks at or below this volume (m³) are visual-only: legs, handles, trim — and every plane,
	 * which has no volume. 0.015625m³ is a 0.25m cube.
	 */
	decorativeMaxVolume: 0.015625
} as const;

export type QuarterTurn = 0 | 90 | 180 | 270;
export const QUARTER_TURNS: readonly QuarterTurn[] = [0, 90, 180, 270];

/**
 * Rotation snapping, shared by block rotation in the editor and whole-object yaw in the world.
 *
 * Every stored angle is a whole number of `unitDegrees` in [0, 360). 7.5° is the finest unit that
 * every offered step divides, so switching the step never strands an angle between snap points and
 * any mix of steps still lands exactly on the grid of angles. Multiples of 7.5 are exact binary
 * floats, and angle arithmetic goes through integer units anyway, so 48 × 7.5° (or 24 × 15°, or
 * 16 × 22.5°…) returns to exactly 0 — rotations never drift.
 */
export const MINI_BUILD_ROTATION = {
	unitDegrees: 7.5,
	/** Steps the player can pick, coarsest first. */
	snapSteps: [90, 45, 30, 22.5, 15, 7.5],
	defaultStep: 90
} as const;

export type RotationSnapStep = (typeof MINI_BUILD_ROTATION.snapSteps)[number];

/** Degrees in [0, 360), a whole multiple of `MINI_BUILD_ROTATION.unitDegrees`. */
export type SnapAngle = number;

/** Integer grid coordinates. Metres = value × `MINI_BUILD_LIMITS.gridSize`. */
export interface GridVec3 {
	x: number;
	y: number;
	z: number;
}

/**
 * Euler angles in degrees, applied Y, then X, then Z (`v' = Rz · Rx · Ry · v`, see
 * `orientationMatrix` in miniBuildGrid.ts), about the centre of the block's grid box.
 *
 * Each angle is a `SnapAngle`. When all three are quarter turns the rotation only permutes axes and
 * the block is an ordinary grid-aligned box. Otherwise the block is *angled*: its grid box (see
 * `MiniBuildBlock.positionGrid`) is the box it would have with every angle rounded down to a quarter
 * turn, and the visible cuboid is the same block turned the rest of the way about that box's centre.
 */
export interface MiniBuildBlockRotation {
	x: SnapAngle;
	y: SnapAngle;
	z: SnapAngle;
}

export type MiniBuildBlockCollision = 'auto' | 'solid' | 'none';

export type MiniBuildShape = 'cuboid' | 'cylinder' | 'sphere';

export interface MiniBuildBlock {
	/** Omitted in legacy designs: cuboid. Curved shapes have fixed, low-poly topology. */
	shape?: MiniBuildShape;
	id: string;
	/**
	 * Min corner of the block's grid box (its effective, quarter-turn-rotated box), in grid units. An
	 * angled block turns about this box's centre — see `MiniBuildBlockRotation`.
	 */
	positionGrid: GridVec3;
	/** Local (unrotated) extents in grid units, each ≥ 0 — at most one axis 0, which makes a plane. */
	sizeGrid: GridVec3;
	rotation: MiniBuildBlockRotation;
	/** Index into `MiniBuildDefinition.materials`. */
	materialSlot: number;
	collision?: MiniBuildBlockCollision;
	/**
	 * Planes only: stacking order where two planes lie in the same place — the higher layer is drawn,
	 * so the plane selected last in the editor ends up on top. Omitted when 0; ignored for cuboids.
	 */
	layer?: number;
}

export const MINI_BUILD_FINISHES = ['wood', 'fabric', 'metal', 'stone', 'glass', 'plain'] as const;
export type MiniBuildFinish = (typeof MINI_BUILD_FINISHES)[number];

export const MINI_BUILD_FINISH_LABELS: Record<MiniBuildFinish, string> = {
	wood: 'Wood',
	fabric: 'Fabric',
	metal: 'Metal',
	stone: 'Stone',
	glass: 'Glass',
	plain: 'Plain'
};

/**
 * Procedural surface a material slot can use — the game's existing procedural looks (solid wood,
 * stone, plaster, paving…), catalogued with labels and styles in `miniBuildTextures.ts`. `auto`
 * picks one from the slot's finish; `flat` is plain colour.
 */
export const MINI_BUILD_TEXTURE_IDS = [
	'woven-fabric',
	'auto',
	'flat',
	'dark-oak',
	'aged-oak',
	'weathered-wood',
	'pine',
	'mahogany',
	'oak-planks',
	'lime-plaster',
	'rough-plaster',
	'dressed-stone',
	'cut-stone',
	'fieldstone',
	'rough-stone',
	'cobbles',
	'setts',
	'flagstones',
	'slate',
	'soil',
	'gravel',
	'earth-path',
	'meadow-grass',
	'dry-grass',
	'clear-glass',
	'old-glass',
	'forged-iron',
	'brass',
	'smooth-stone'
] as const;
export type MiniBuildTextureId = (typeof MINI_BUILD_TEXTURE_IDS)[number];

/** A logical material slot — never a THREE.Material. */
export interface MiniBuildMaterialSlot {
	name: string;
	finish: MiniBuildFinish;
	/** The colour; on a textured slot it tints the texture (its average becomes this colour). */
	material: BuildingMaterialDefinition;
	/** Procedural surface; omitted means `auto` (chosen from the finish). */
	texture?: MiniBuildTextureId;
}

export interface MiniBuildAnchor {
	type: 'bottom-center';
}

/** Optional future semantic layer (sit, sleep, store…). Arbitrary creations stay `generic`. */
export const MINI_BUILD_SEMANTIC_TYPES = [
	'generic',
	'chair',
	'bed',
	'table',
	'storage',
	'workbench',
	'stove',
	'decoration'
] as const;
export type MiniBuildSemanticType = (typeof MINI_BUILD_SEMANTIC_TYPES)[number];

/** Grid-unit bounds of the union of every block's effective box (`max` exclusive). */
export interface MiniBuildBounds {
	min: GridVec3;
	max: GridVec3;
}

export type MiniBuildInteractionType = 'sit' | 'lie';

/** Editor-grid pelvis support point, not a camera or world position. Local -Z is
 * forward (sit) / head (lie). Occupancy box offsets/sizes use the same integer grid. */
export interface MiniBuildInteractionLocation {
	id: string;
	type: MiniBuildInteractionType;
	positionGrid: GridVec3;
	rotationY: SnapAngle;
	enabled: boolean;
	collider: { type: 'box'; centerOffsetGrid: GridVec3; sizeGrid: GridVec3 };
}

export interface MiniBuildDefinition {
	interactionLocations?: MiniBuildInteractionLocation[];
	/** Geometry-only revision: semantic edits can reuse GPU assets. */
	geometryRevision?: number;
	schemaVersion: number;
	id: string;
	name: string;
	/** Bumped on every saved change; part of the compiled asset cache key. */
	revision: number;
	blocks: MiniBuildBlock[];
	materials: MiniBuildMaterialSlot[];
	/** Derived from `blocks` on every save and re-derived on load — never trusted from a file. */
	bounds: MiniBuildBounds;
	anchor: MiniBuildAnchor;
	semanticType?: MiniBuildSemanticType;
	/** Set when the design started as a built-in default, so placing that default can reuse this copy. */
	sourceDefaultId?: string;
	createdAt: string;
	updatedAt: string;
}

export interface MiniBuildMaterialOverride {
	slot: number;
	material: BuildingMaterialDefinition;
}

/** A placed copy. Tiny on purpose: the cuboids live once in the referenced definition. */
export interface MiniBuildInstance {
	id: string;
	designId: string;
	/** World position of the design anchor (bottom-centre). */
	position: { x: number; y: number; z: number };
	/** Yaw about the anchor in degrees, a `SnapAngle` (matches `THREE.Matrix4.makeRotationY`). */
	rotationY: SnapAngle;
	foundationId?: string;
	levelId?: string;
	materialOverrides?: MiniBuildMaterialOverride[];
}

export interface MiniBuildWorldState {
	definitions: MiniBuildDefinition[];
	instances: MiniBuildInstance[];
}

export function createEmptyMiniBuildWorldState(): MiniBuildWorldState {
	return { definitions: [], instances: [] };
}

/** What the editor edits: a definition minus identity/bookkeeping. */
export interface MiniBuildDraft {
	interactionLocations?: MiniBuildInteractionLocation[];
	name: string;
	blocks: MiniBuildBlock[];
	materials: MiniBuildMaterialSlot[];
	semanticType?: MiniBuildSemanticType;
}

export type WorldChunkId = string;

/** What the Place Object tool is holding. Lights stay special functional furniture. */
export type PlaceObjectSelection =
	| { type: 'mini-build'; designId: string }
	| { type: 'default-design'; defaultId: string }
	| { type: 'personal-design'; designId: string }
	| { type: 'light'; kind: 'torch' | 'lantern' | 'fireplace' };
