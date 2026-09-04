/**
 * Shared terrain configuration. This object is intentionally framework-free — it is read
 * directly by TerrainHeightSampler, TerrainChunk and TerrainManager, and mutated live by
 * TerrainDebugGui. Nothing in this file may depend on Svelte, the DOM, or Three.js.
 *
 * Architecture: terrain is generated as a small set of large-scale *regions* (plains, rolling
 * hills, highlands, mountains) that are blended together by a very-low-frequency biome mask,
 * rather than one pile of noise layers added everywhere. See TerrainHeightSampler for the
 * pipeline itself; the settings below are grouped the same way.
 */

export interface DomainWarpSettings {
	enabled: boolean;
	frequency: number;
	strength: number;
	octaves: number;
}

export interface ChunkLoadingSettings {
	chunkSize: number;
	chunkResolution: number;
	viewDistance: number;
	chunksGeneratedPerFrame: number;
}

export type TerrainDebugView =
	'normal' | 'biomeColors' | 'biomeMask' | 'elevation' | 'forestDensity' | 'terrainPlusForest';

/** Fog now lives in SkySettings' "Sun & Atmosphere" group — see sky/SkyTypes.ts — so it can match the sky's horizon colour without this module needing to know about the sky system. */
export interface RenderingSettings {
	wireframe: boolean;
	showChunkBorders: boolean;
	showChunkCoordinates: boolean;
	debugView: TerrainDebugView;
}

export interface PlayerSettings {
	walkSpeed: number;
	runSpeed: number;
	eyeHeight: number;
	gravityEnabled: boolean;
	jumpSpeed: number;
}

/** The very-low-frequency mask that decides which region type dominates at a world coordinate. */
export interface BiomeSettings {
	/** World-unit scale of one biome region — bigger means larger plains/mountain areas. */
	scale: number;
	/** Sharpens (>1) or softens (<1) how decisively the mask commits to one region type. */
	contrast: number;
	/** Extra width added to the smooth transition band between adjacent region types, 0+. */
	blendWidth: number;
	/** Domain warp applied only to the biome mask sampling coordinate, for organic (non-circular) region shapes. */
	warpStrength: number;
}

/** Extremely-low-frequency regional elevation — plateaus/basins independent of region type. */
export interface MacroElevationSettings {
	scale: number;
	amplitude: number;
}

export interface PlainsRecipeSettings {
	/** Amplitude of the broad low-frequency undulation before `flatness` compresses it. */
	amplitude: number;
	/** 0..1 — how much to compress the broad undulation toward dead flat. */
	flatness: number;
	/** World-unit amplitude of the shared fine-detail noise contributed in plains. */
	detailStrength: number;
}

export interface HillsRecipeSettings {
	amplitude: number;
	/** World-unit wavelength of individual hills. */
	scale: number;
	/** 0..1 — blends toward rounder hilltops / flatter valley floors. */
	roundness: number;
	detailStrength: number;
}

export interface HighlandsRecipeSettings {
	amplitude: number;
	scale: number;
	/** 0..1 — how ridged (vs smoothly rolling) highland terrain is. */
	ridgeAmount: number;
	detailStrength: number;
}

export interface MountainRecipeSettings {
	amplitude: number;
	/** World-unit wavelength of the primary ridged mountain shape. */
	scale: number;
	/** Exponent sharpening ridge peaks; higher = more dramatic, needle-like ridgelines. */
	sharpness: number;
	detailStrength: number;
	/** World-unit scale of the region mask that groups mountains into ranges rather than scattering them. */
	regionScale: number;
	/** 0..1 — normalized mask value above which mountain terrain starts activating. */
	regionThreshold: number;
	/** 0..1 — width of the smooth transition above the threshold. */
	regionBlend: number;
	/** Domain warp applied to the region mask, so ranges read as organic and elongated rather than circular blobs. */
	warpStrength: number;
}

export interface TerrainSettings {
	seed: string;

	chunkSize: number;
	chunkResolution: number;
	viewDistance: number;
	chunksGeneratedPerFrame: number;

	baseHeight: number;
	heightMultiplier: number;
	terraceAmount: number;

	biome: BiomeSettings;
	macroElevation: MacroElevationSettings;
	plains: PlainsRecipeSettings;
	hills: HillsRecipeSettings;
	highlands: HighlandsRecipeSettings;
	mountains: MountainRecipeSettings;
	/** Domain warp applied only to the shared fine-detail noise used by every region recipe. */
	detailWarp: DomainWarpSettings;

	rendering: RenderingSettings;
	player: PlayerSettings;
}

/**
 * Defaults tuned to demonstrate large, readable geography on first launch: broad plains and
 * gentle rolling countryside dominate, highlands and mountains are concentrated into their own
 * large regions (via the biome mask and, within "mountain" territory, the extra region mask), and
 * fine detail is suppressed hard in plains so they read as genuinely flat at eye level.
 */
export function createDefaultTerrainSettings(): TerrainSettings {
	return {
		seed: 'peaceful-world',

		chunkSize: 96,
		chunkResolution: 48,
		viewDistance: 5,
		chunksGeneratedPerFrame: 2,

		baseHeight: 0,
		heightMultiplier: 1,
		terraceAmount: 0,

		biome: {
			scale: 1800,
			contrast: 1.3,
			blendWidth: 0.25,
			warpStrength: 150
		},

		macroElevation: {
			scale: 3200,
			amplitude: 18
		},

		plains: {
			amplitude: 3.5,
			flatness: 0.7,
			detailStrength: 0.05
		},

		hills: {
			amplitude: 14,
			scale: 180,
			roundness: 0.4,
			detailStrength: 0.15
		},

		highlands: {
			amplitude: 26,
			scale: 110,
			ridgeAmount: 0.35,
			detailStrength: 0.35
		},

		mountains: {
			amplitude: 55,
			scale: 260,
			sharpness: 1.6,
			detailStrength: 0.6,
			regionScale: 2200,
			regionThreshold: 0.55,
			regionBlend: 0.25,
			warpStrength: 140
		},

		detailWarp: {
			enabled: true,
			frequency: 0.05,
			strength: 1.5,
			octaves: 2
		},

		rendering: {
			wireframe: false,
			showChunkBorders: false,
			showChunkCoordinates: false,
			debugView: 'normal'
		},

		player: {
			walkSpeed: 6,
			runSpeed: 12,
			eyeHeight: 1.7,
			gravityEnabled: true,
			jumpSpeed: 7
		}
	};
}

/** Everything needed to reproduce a world identically: seed + settings, nothing else. */
export interface TerrainWorldDefinition {
	seed: string;
	settings: TerrainSettings;
}

/** Settings whose change requires rebuilding every chunk's vertex topology from scratch. */
export const TOPOLOGY_KEYS = ['chunkSize', 'chunkResolution'] as const;
