/**
 * Vegetation configuration and world-state types. Framework-free, same rule as TerrainSettings —
 * read directly by VegetationRegionSampler/TreePlacementGenerator/TreeManager, mutated live by
 * the debug GUI.
 *
 * ARCHITECTURE: this is a deliberately independent system from terrain biomes. Terrain biome
 * answers "what shape is the ground" (plains/hills/highlands/mountains); vegetation answers "how
 * much forest exists here" — a second, unrelated procedural map laid over the terrain. Nothing in
 * here reads a terrain biome weight, and nothing in the terrain biome system reads a forest value.
 */

/** The large-scale forest coverage map, plus its two secondary breakup masks (clearings, clustering). */
export interface ForestRegionSettings {
	/** World-unit scale of one forest region — bigger means larger contiguous forests/open areas. */
	forestRegionScale: number;
	/** 0..1 — normalized mask value above which an area starts being forested. */
	forestThreshold: number;
	/** 0..1 — width of the smooth transition around the threshold (the forest edge). */
	forestBlendWidth: number;
	/** World-unit scale of the domain warp applied to the forest mask, for organic (non-circular) region shapes. */
	forestWarpScale: number;
	/** Strength of that domain warp, in world units. */
	forestWarpStrength: number;

	/** World-unit scale of the clearing mask — holes punched into otherwise-forested regions. */
	clearingScale: number;
	/** 0..1 — how much a clearing can subtract from forest density at its center. */
	clearingStrength: number;
	/** 0..1 — normalized mask value above which a clearing starts forming. */
	clearingThreshold: number;

	/** World-unit scale of the local density-clustering modifier (small groups within a forest). */
	treeClusterScale: number;
	/** 0..1 — how strongly clustering modulates local density. Kept subtle by design. */
	treeClusterStrength: number;
}

/** Deterministic per-tree-candidate placement rules. */
export interface TreePlacementSettings {
	/** World-unit size of one vegetation placement cell; each cell yields at most one tree candidate. */
	treeCellSize: number;
	/** Multiplies forest density before it's used as an acceptance probability. */
	treeDensityMultiplier: number;
	minTreeScale: number;
	maxTreeScale: number;
	/** Candidates on steeper terrain than this are rejected outright. */
	maxTreeSlopeDegrees: number;
	enableTreeLine: boolean;
	/** Elevation where density starts tapering off. */
	treeLineStartHeight: number;
	/** Elevation above which density reaches zero. */
	treeLineEndHeight: number;
}

/** How vegetation chunks are loaded around the player — independent of terrain's own view distance. */
export interface TreeLoadingSettings {
	treeViewDistanceChunks: number;
	treeChunksGeneratedPerFrame: number;
}

/** Dev-only vegetation visualizations. */
export interface VegetationDebugSettings {
	showTreeCells: boolean;
	showTreeChunkBorders: boolean;
	showRejectedTreeCandidates: boolean;
}

export interface VegetationSettings {
	forest: ForestRegionSettings;
	trees: TreePlacementSettings;
	loading: TreeLoadingSettings;
	debug: VegetationDebugSettings;
}

/**
 * Defaults tuned for a "genuinely wooded" first impression: large forest regions with organic
 * warped edges, subtle clearings and clustering (the large mask still dominates), and a treeline
 * subtle enough to only matter on real mountain peaks given this project's terrain amplitudes.
 */
export function createDefaultVegetationSettings(): VegetationSettings {
	return {
		forest: {
			forestRegionScale: 900,
			forestThreshold: 0.52,
			forestBlendWidth: 0.12,
			forestWarpScale: 260,
			forestWarpStrength: 90,

			clearingScale: 140,
			clearingStrength: 0.6,
			clearingThreshold: 0.62,

			treeClusterScale: 40,
			treeClusterStrength: 0.25
		},

		trees: {
			treeCellSize: 6,
			treeDensityMultiplier: 1,
			minTreeScale: 0.75,
			maxTreeScale: 1.35,
			maxTreeSlopeDegrees: 40,
			enableTreeLine: true,
			treeLineStartHeight: 55,
			treeLineEndHeight: 85
		},

		loading: {
			treeViewDistanceChunks: 4,
			treeChunksGeneratedPerFrame: 1
		},

		debug: {
			showTreeCells: false,
			showTreeChunkBorders: false,
			showRejectedTreeCandidates: false
		}
	};
}

/**
 * A deterministic logical tree — identity derives entirely from its vegetation cell, never a
 * random UUID, so it reproduces across sessions/clients from (worldSeed, cellX, cellZ) alone. No
 * per-tree database row is needed; a future multiplayer server only needs to record exceptions
 * (removed/replaced trees) keyed by this same id.
 */
export interface ProceduralTreeDefinition {
	id: string;
	cellX: number;
	cellZ: number;
	worldX: number;
	worldZ: number;
	scale: number;
	rotationY: number;
	variant: number;
}

export const TREE_VARIANT_COUNT = 3;
