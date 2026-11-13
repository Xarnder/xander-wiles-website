import type { SignaturePlantId } from '../vegetation/plants/plantSignatureSpecies';
import type { FlowerFamily, GroundFamily } from '../vegetation/plants/PlantTypes';
import { BIOME_IDS, type BiomeId } from './BiomeTypes';

/**
 * Flowers and ground plants per biome (Phase 4). Plain data.
 *
 * - `density` multiplies how much of the ground plants cover at a point (blended across borders):
 *   lush jungles and meadows above 1, snowfields and deserts far below.
 * - `flowers` / `ground` multiply how many species a region draws from its pool.
 * - `flowerFamilies` / `groundFamilies` restrict which families those pools contain (a desert's
 *   ground plants are succulents and dry tufts); omitted = any, as without biomes.
 * - `signature` adds biome-defining species with a chance per region (Sunflower Plains always has
 *   sunflowers; swamps reeds; deserts dead shrubs …).
 */
export interface BiomePlantProfile {
	density: number;
	flowers: number;
	ground: number;
	flowerFamilies?: readonly FlowerFamily[];
	groundFamilies?: readonly GroundFamily[];
	signature?: Partial<Record<SignaturePlantId, number>>;
}

const DRY_GROUND: readonly GroundFamily[] = ['ground-tuft', 'succulent', 'rosette'];
const COLD_GROUND: readonly GroundFamily[] = ['ground-tuft', 'rosette'];
const SHADE_GROUND: readonly GroundFamily[] = ['fern', 'broadleaf', 'rosette'];

const PROFILES: Record<BiomeId, BiomePlantProfile> = {
	plains: { density: 1, flowers: 1, ground: 1 },
	sunflowerPlains: { density: 1, flowers: 0.6, ground: 1, signature: { sunflower: 1 } },
	forest: { density: 1, flowers: 1, ground: 1, signature: { fern: 0.5 } },
	flowerForest: { density: 1.3, flowers: 2, ground: 0.8 },
	birchForest: { density: 1, flowers: 1, ground: 1 },
	oldGrowthBirch: { density: 0.9, flowers: 0.8, ground: 1, signature: { fern: 0.8 } },
	darkForest: {
		density: 0.6,
		flowers: 0.5,
		ground: 1,
		groundFamilies: SHADE_GROUND,
		signature: { fern: 1 }
	},
	silverwood: {
		density: 0.7,
		flowers: 0.6,
		ground: 0.8,
		flowerFamilies: ['bell-flower', 'cup-flower', 'orb-flower'],
		signature: { paleBloom: 1 }
	},
	sunlitWood: { density: 1.1, flowers: 1.3, ground: 0.9 },
	taiga: {
		density: 0.7,
		flowers: 0.5,
		ground: 1,
		groundFamilies: ['fern', 'ground-tuft', 'rosette', 'clover'],
		signature: { fern: 0.7 }
	},
	snowyTaiga: {
		density: 0.15,
		flowers: 0.2,
		ground: 0.6,
		flowerFamilies: ['star-flower', 'cup-flower'],
		groundFamilies: COLD_GROUND
	},
	jungle: {
		density: 1.2,
		flowers: 1,
		ground: 1.5,
		groundFamilies: ['fern', 'broadleaf'],
		signature: { fern: 1 }
	},
	sparseJungle: { density: 1.1, flowers: 1.2, ground: 1.2, signature: { fern: 0.5 } },
	bambooJungle: {
		density: 1,
		flowers: 0.6,
		ground: 1.4,
		groundFamilies: ['fern', 'broadleaf'],
		signature: { fern: 1 }
	},
	meadow: { density: 1.3, flowers: 1.8, ground: 0.8 },
	cherryGrove: {
		density: 1.2,
		flowers: 1.4,
		ground: 0.8,
		flowerFamilies: ['radial-flower', 'cup-flower', 'cluster-flower', 'star-flower']
	},
	grove: {
		density: 0.2,
		flowers: 0.2,
		ground: 0.6,
		groundFamilies: ['ground-tuft', 'rosette', 'fern']
	},
	snowySlopes: { density: 0.05, flowers: 0.1, ground: 0.4, groundFamilies: COLD_GROUND },
	windsweptHills: {
		density: 0.7,
		flowers: 0.7,
		ground: 1,
		groundFamilies: ['ground-tuft', 'rosette', 'clover', 'succulent']
	},
	snowyPlains: { density: 0.08, flowers: 0.15, ground: 0.5, groundFamilies: COLD_GROUND },
	desert: {
		density: 0.25,
		flowers: 0.3,
		ground: 0.8,
		flowerFamilies: ['star-flower', 'spike-flower'],
		groundFamilies: ['succulent', 'ground-tuft'],
		signature: { deadShrub: 1 }
	},
	savanna: {
		density: 0.8,
		flowers: 0.7,
		ground: 1,
		groundFamilies: DRY_GROUND,
		signature: { deadShrub: 0.3 }
	},
	savannaPlateau: {
		density: 0.7,
		flowers: 0.6,
		ground: 1,
		groundFamilies: DRY_GROUND,
		signature: { deadShrub: 0.4 }
	},
	swamp: {
		density: 1.1,
		flowers: 0.6,
		ground: 1.4,
		groundFamilies: ['broadleaf', 'fern', 'clover'],
		signature: { reed: 1 }
	},
	shrubSavanna: {
		density: 0.6,
		flowers: 0.4,
		ground: 1.2,
		groundFamilies: ['ground-tuft', 'succulent'],
		signature: { deadShrub: 1 }
	},
	tropicalDryGrassland: {
		density: 1,
		flowers: 1,
		ground: 1,
		groundFamilies: ['ground-tuft', 'rosette', 'clover']
	}
};

/** Index-aligned with BIOME_IDS. */
export const BIOME_PLANT_PROFILES: readonly BiomePlantProfile[] = BIOME_IDS.map(
	(id) => PROFILES[id]
);
