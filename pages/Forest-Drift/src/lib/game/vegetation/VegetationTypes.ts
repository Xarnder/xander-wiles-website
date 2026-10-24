import { createDefaultGrassSettings, type GrassSettings } from './grass/GrassTypes';
import { createDefaultPlantSettings, type PlantSettings } from './plants/PlantTypes';

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
	/**
	 * Minimum distance between neighbouring trees, metres. Enforced deterministically by keeping
	 * each cell's candidate away from its cell edges (capped below the cell size).
	 */
	minTreeSpacing: number;
	/** Hard cap on trees materialized per vegetation chunk (a performance safety valve). */
	maxTreesPerChunk: number;
	/** Keep canopies clear of building foundations, not just trunks. */
	buildingClearance: boolean;
}

/**
 * Which tree species grow where. Weights are relative; the selector also biases them by a
 * low-frequency conifer/broadleaf region map, elevation and local forest density, so forests form
 * broadleaf woods, pine forests and mixed woodland instead of uniform confetti.
 */
export interface TreeSpeciesMixSettings {
	oakWeight: number;
	pineWeight: number;
	cypressWeight: number;
	ornamentalWeight: number;
	/** Tall spruces: conifer country, denser forest and higher ground. */
	spruceWeight: number;
	/** Birches: mixed woodland and forest edges. */
	birchWeight: number;
	/** Scots pines: open conifer ground. */
	scotsPineWeight: number;
	/** Weeping willows: open, gentle lowland. */
	willowWeight: number;
	/** World-unit scale of the per-species stand maps (groves of one kind). */
	standScale: number;
	/** 0 = a per-tree weighted mix; above zero, local stand dominance selects coherent groves. */
	standStrength: number;
	/** World-unit scale of the conifer-vs-broadleaf region map. */
	coniferRegionScale: number;
	/** Elevation band over which forests shift toward conifers. */
	coniferStartHeight: number;
	coniferFullHeight: number;
}

/** Runtime rendering knobs (developer-tunable; the graphics preset scales distances and toggles). */
export interface TreeRenderingSettings {
	/** Distances (metres) at which trees switch to LOD1 / LOD2 / LOD3 (silhouette). */
	lod1Distance: number;
	lod2Distance: number;
	lod3Distance: number;
	/** Fractional hysteresis band around each LOD distance, so trees don't flicker between LODs. */
	lodHysteresis: number;
	/** Camera movement (metres) before a chunk's LOD assignment is re-evaluated. */
	lodUpdateDistance: number;
	/** Max chunks re-batched for LOD per frame (spreads the CPU cost). */
	lodRebuildsPerFrame: number;
	windEnabled: boolean;
	windStrength: number;
	/** Trees cast shadows at all (the graphics preset also limits which LODs cast). */
	castShadows: boolean;
	/** Prototype designs per species; 0 = each species' own default. Draw calls scale with this. */
	prototypesPerSpecies: number;
	/** Alpha-tested foliage sprays on near trees (the graphics preset limits which LODs get them). */
	foliageCards: boolean;
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
	/** Grass chunk outlines (one per batch / draw call). */
	showGrassChunks: boolean;
	/** Tint grass by LOD band: red LOD0, green LOD1, blue LOD2. */
	showGrassLod: boolean;
	/** A dot on every accepted grass candidate. */
	showGrassCandidates: boolean;
	/** Plant chunk outlines (one card draw call each). */
	showPlantChunks: boolean;
	/** Colour every plant by species. */
	showPlantSpecies: boolean;
	/** Near geometry red, LOD1 cards green, LOD2 cards blue. */
	showPlantLod: boolean;
	/** A dot on every plant candidate cell (grey rejected, species colour accepted). */
	showPlantCandidates: boolean;
	/** Candidate cells as a colony-strength heat map. */
	showColonyFields: boolean;
}

export interface VegetationSettings {
	forest: ForestRegionSettings;
	trees: TreePlacementSettings;
	species: TreeSpeciesMixSettings;
	rendering: TreeRenderingSettings;
	loading: TreeLoadingSettings;
	/** Procedural billboard grass (see `grass/`). Saved with the world; tufts never are. */
	grass: GrassSettings;
	/** Procedural flowers and ground plants (see `plants/`). Settings saved; plants never are. */
	plants: PlantSettings;
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
			treeLineEndHeight: 85,
			minTreeSpacing: 2.5,
			maxTreesPerChunk: 400,
			buildingClearance: true
		},

		species: {
			oakWeight: 1,
			pineWeight: 0.7,
			cypressWeight: 0.35,
			ornamentalWeight: 0.3,
			spruceWeight: 0.75,
			birchWeight: 0.45,
			scotsPineWeight: 0.4,
			willowWeight: 0.15,
			standScale: 150,
			standStrength: 0.9,
			coniferRegionScale: 700,
			coniferStartHeight: 18,
			coniferFullHeight: 55
		},

		rendering: {
			lod1Distance: 45,
			lod2Distance: 95,
			lod3Distance: 170,
			lodHysteresis: 0.08,
			lodUpdateDistance: 4,
			lodRebuildsPerFrame: 3,
			windEnabled: true,
			windStrength: 1,
			castShadows: true,
			prototypesPerSpecies: 0,
			foliageCards: true
		},

		loading: {
			treeViewDistanceChunks: 4,
			treeChunksGeneratedPerFrame: 1
		},

		grass: createDefaultGrassSettings(),
		plants: createDefaultPlantSettings(),

		debug: {
			showTreeCells: false,
			showTreeChunkBorders: false,
			showRejectedTreeCandidates: false,
			showGrassChunks: false,
			showGrassLod: false,
			showGrassCandidates: false,
			showPlantChunks: false,
			showPlantSpecies: false,
			showPlantLod: false,
			showPlantCandidates: false,
			showColonyFields: false
		}
	};
}

/**
 * A deterministic logical tree — identity derives entirely from its vegetation cell, never a
 * random UUID, so it reproduces across sessions/clients from (worldSeed, cellX, cellZ) alone. No
 * per-tree database row is needed; a future multiplayer server only needs to record exceptions
 * (removed/replaced trees) keyed by this same id. See `trees/TreeSpeciesTypes.ts`.
 */
export type { TreeInstanceDefinition as ProceduralTreeDefinition } from './trees/TreeSpeciesTypes';
