/**
 * Mini Build schema and hard limits. Framework- and Three.js-free, like every other *Types.ts file:
 * this is the persisted, player-authored contract. Nothing here is a mesh, a geometry or a material
 * instance — compiled render assets are always regenerated from these recipes.
 *
 * A Mini Build is deliberately constrained (16 cuboids on a 0.0625m grid, 4m bounds, 4 material
 * slots, quarter-turn rotations). A cuboid may be flat (size 0) on one axis, which makes it a plane.
 * Those limits are the creative rule of the system, so they live in exactly one place and every layer
 * (editor, validation, loader, compiler) reads them from here.
 */
import type { BuildingMaterialDefinition } from '../building/MaterialTypes';

/**
 * Bump when `MiniBuildDefinition`'s persisted shape changes.
 *
 * v1 — grid unit 0.125m, every size ≥ 1.
 * v2 — grid unit 0.0625m (v1 coordinates are doubled on load), one axis may be 0 (a plane).
 */
export const MINI_BUILD_SCHEMA_VERSION = 2;

/** v1 grid units per v2 grid unit: v1 designs are scaled by this when loaded. */
export const MINI_BUILD_V1_GRID_SCALE = 2;

/**
 * Bump when the compiler's output for the same definition changes (face emission, UVs, collision).
 * Part of the asset cache key and the content hash, so an improved compiler regenerates assets
 * rather than reusing stale ones — saved designs themselves never need migrating for it.
 */
export const MINI_BUILD_COMPILER_VERSION = 3;

export const MINI_BUILD_LIMITS = {
	maxBlocks: 16,
	/** Snap increment in metres for positions and sizes. */
	gridSize: 0.0625,
	maxBounds: { x: 4, y: 4, z: 4 },
	/** `maxBounds / gridSize` — the same limit in integer grid units. */
	maxBoundsGrid: { x: 64, y: 64, z: 64 },
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
	defaultBlockSizeGrid: 8,
	/** Editor workspace: X/Z in [-workspaceHalfGrid, workspaceHalfGrid], Y in [0, maxBoundsGrid.y]. */
	workspaceHalfGrid: 64,
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

/** Integer grid coordinates. Metres = value × `MINI_BUILD_LIMITS.gridSize`. */
export interface GridVec3 {
	x: number;
	y: number;
	z: number;
}

/**
 * Applied Y, then X, then Z (see `rotationMatrix` in miniBuildGrid.ts). For a cuboid a quarter-turn
 * rotation only permutes axes, so the effective box stays grid aligned.
 */
export interface MiniBuildBlockRotation {
	x: QuarterTurn;
	y: QuarterTurn;
	z: QuarterTurn;
}

export type MiniBuildBlockCollision = 'auto' | 'solid' | 'none';

export interface MiniBuildBlock {
	id: string;
	/** Min corner of the block's effective (rotated) box, in grid units. */
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

/** A logical material slot — never a THREE.Material. */
export interface MiniBuildMaterialSlot {
	name: string;
	finish: MiniBuildFinish;
	material: BuildingMaterialDefinition;
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

export interface MiniBuildDefinition {
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
	rotationY: QuarterTurn;
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
