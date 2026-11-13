import { TREE_SPECIES_IDS, type TreeSpeciesId } from '../vegetation/trees/TreeSpeciesTypes';
import { BIOME_IDS, type BiomeId } from './BiomeTypes';

/**
 * Which trees grow in each biome, and how densely. Plain data, blended across borders by
 * `BiomeTrees`.
 *
 * `forest` is the band a biome's forest density moves within: today's forest mask (groves,
 * clustering) only decides where inside the band a spot falls, and clearings still cut glades on
 * top. Plains and meadows keep a few lone trees; forests stay forests. `species` are relative
 * weights; the selector's stand maps still group them into groves of one kind.
 */
export interface BiomeTreeProfile {
	forest: readonly [lo: number, hi: number];
	species: Partial<Record<TreeSpeciesId, number>>;
}

const PROFILES: Record<BiomeId, BiomeTreeProfile> = {
	plains: { forest: [0, 0.12], species: { oak: 0.6, birch: 0.3, ornamental: 0.2 } },
	sunflowerPlains: { forest: [0, 0.08], species: { oak: 0.7, ornamental: 0.3 } },
	forest: { forest: [0.55, 0.85], species: { oak: 1, birch: 0.35 } },
	flowerForest: { forest: [0.35, 0.6], species: { oak: 0.8, ornamental: 0.6, birch: 0.4 } },
	birchForest: { forest: [0.5, 0.8], species: { birch: 1, oak: 0.15 } },
	oldGrowthBirch: { forest: [0.6, 0.85], species: { tallBirch: 1, birch: 0.2 } },
	darkForest: { forest: [0.85, 1], species: { darkBroadleaf: 1, oak: 0.25 } },
	silverwood: { forest: [0.7, 0.95], species: { paleTree: 1, darkBroadleaf: 0.2 } },
	sunlitWood: { forest: [0.4, 0.65], species: { oak: 0.7, birch: 0.5, ornamental: 0.5 } },
	taiga: { forest: [0.6, 0.9], species: { spruce: 1, pine: 0.6, scotsPine: 0.5 } },
	snowyTaiga: { forest: [0.5, 0.8], species: { frostedSpruce: 1, frostedPine: 0.5 } },
	jungle: { forest: [0.85, 1], species: { jungleGiant: 1, ornamental: 0.2 } },
	sparseJungle: { forest: [0.35, 0.6], species: { jungleGiant: 0.6, ornamental: 0.4 } },
	bambooJungle: { forest: [0.8, 1], species: { bamboo: 1, jungleGiant: 0.35 } },
	meadow: { forest: [0, 0.1], species: { oak: 0.5, birch: 0.5, ornamental: 0.3 } },
	cherryGrove: { forest: [0.25, 0.5], species: { cherry: 1, ornamental: 0.1 } },
	grove: { forest: [0.45, 0.75], species: { frostedSpruce: 1 } },
	snowySlopes: { forest: [0, 0.05], species: { frostedSpruce: 1 } },
	windsweptHills: {
		forest: [0.05, 0.25],
		species: { scotsPine: 0.6, warmOak: 0.5, spruce: 0.3 }
	},
	snowyPlains: { forest: [0, 0.06], species: { frostedSpruce: 1 } },
	desert: { forest: [0.01, 0.05], species: { cactus: 1 } },
	savanna: { forest: [0.05, 0.2], species: { acacia: 1 } },
	savannaPlateau: { forest: [0.1, 0.25], species: { acacia: 1 } },
	swamp: { forest: [0.4, 0.7], species: { swampTree: 1, willow: 0.3 } },
	shrubSavanna: { forest: [0, 0.06], species: { acacia: 0.5, cactus: 0.4 } },
	tropicalDryGrassland: { forest: [0, 0.08], species: { acacia: 0.6, ornamental: 0.3 } }
};

/** Index-aligned with BIOME_IDS. */
export const BIOME_TREE_PROFILES: readonly BiomeTreeProfile[] = BIOME_IDS.map((id) => PROFILES[id]);

/** Packed for blending: per biome, [lo, hi] then one weight per TREE_SPECIES_IDS entry. */
export const TREE_PROFILE_STRIDE = 2 + TREE_SPECIES_IDS.length;

export const PACKED_TREE_PROFILES: Float64Array = (() => {
	const out = new Float64Array(BIOME_IDS.length * TREE_PROFILE_STRIDE);
	BIOME_TREE_PROFILES.forEach((profile, b) => {
		const o = b * TREE_PROFILE_STRIDE;
		out[o] = profile.forest[0];
		out[o + 1] = profile.forest[1];
		TREE_SPECIES_IDS.forEach((species, s) => {
			out[o + 2 + s] = profile.species[species] ?? 0;
		});
	});
	return out;
})();
