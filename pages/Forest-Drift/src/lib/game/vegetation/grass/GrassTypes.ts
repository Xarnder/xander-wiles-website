/**
 * Procedural billboard grass — settings and world-state types. Framework- and Three.js-free like
 * every other *Types.ts file. See the README's "Grass" section for the architecture.
 *
 * Grass is procedural scenery: nothing about individual tufts is ever saved. A world stores these
 * settings (inside `VegetationSettings`) and `generatorVersion`, and every tuft regenerates from
 * (world seed, world-space candidate cell, settings).
 */

/**
 * Bump when the placement algorithm changes what (seed, cell) produces. Saved worlds keep the
 * version they were made with in `GrassSettings.generatorVersion`; the generator salts its hashes
 * with it, so a future version can change placement without silently re-planting old worlds.
 */
export const GRASS_GENERATOR_VERSION = 1;

/** Grass chunk edge, metres: the streaming, batching (one draw call) and frustum-culling unit. */
export const GRASS_CHUNK_SIZE = 16;

export interface GrassSettings {
	enabled: boolean;
	/** Placement algorithm version this world was generated with (see GRASS_GENERATOR_VERSION). */
	generatorVersion: number;
	/** Multiplies the region's tuft acceptance probability (≤ 1 keeps a stable subset). */
	density: number;
	/** World-space candidate cell size, metres. Each cell yields at most one tuft. */
	candidateSpacing: number;
	/** Distance (metres, at HIGH) where the last tufts have faded out; terrain takes over beyond. */
	renderDistance: number;
	/**
	 * Density LOD: full `lod0Density` out to `lod0Distance`, then linearly down to `lod1Density` at
	 * `lod1Distance`, to `lod2Density` at `lod2Distance`, and to 0 at `renderDistance`. Which tufts
	 * survive is decided by each tuft's fixed rank hash — never at random.
	 */
	lod0Distance: number;
	lod1Distance: number;
	lod2Distance: number;
	lod0Density: number;
	lod1Density: number;
	lod2Density: number;
	/** Tuft height range, metres (before region bias). */
	minHeight: number;
	maxHeight: number;
	/** Card width as a fraction of its height. */
	widthRatio: number;
	windStrength: number;
	alphaTest: number;
	/** Tips near the player lean away from them (one uniform, vertex shader only). */
	playerInteraction: boolean;
}

/** Graphics-preset knobs (see `GraphicsPreset.grass*`). */
export interface GrassQualityProfile {
	/** Multiplies candidate acceptance — LOW keeps a stable subset of HIGH's tufts. */
	densityScale: number;
	/** Multiplies every LOD distance and the render distance. */
	distanceScale: number;
	/** Near tufts are two crossed cards (fixed yaw) that morph into one axial billboard by mid range. */
	crossedCards: boolean;
	receiveShadows: boolean;
	wind: boolean;
	/** Hard cap on drawn tufts; densities scale down further if the view would exceed it. */
	maxVisibleInstances: number;
}

export function createDefaultGrassSettings(): GrassSettings {
	return {
		enabled: true,
		generatorVersion: GRASS_GENERATOR_VERSION,
		density: 1,
		candidateSpacing: 0.4,
		renderDistance: 64,
		lod0Distance: 14,
		lod1Distance: 32,
		lod2Distance: 50,
		lod0Density: 1,
		lod1Density: 0.5,
		lod2Density: 0.22,
		minHeight: 0.2,
		maxHeight: 0.52,
		widthRatio: 1.45,
		windStrength: 1,
		alphaTest: 0.5,
		playerInteraction: true
	};
}
