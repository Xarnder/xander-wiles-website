import { hashCellToFloat01 } from '../vegetation/cellHash';
import type { PlantEcologyBiomes, RegionPlantPlan } from '../vegetation/plants/plantEcology';
import { getSignaturePlant, SIGNATURE_PLANT_IDS } from '../vegetation/plants/plantSignatureSpecies';
import type { PlantSpeciesDefinition } from '../vegetation/plants/PlantTypes';
import type { BiomeField } from './BiomeField';
import { BIOME_PLANT_PROFILES } from './biomePlantProfiles';
import type { BiomeTrees } from './BiomeTrees';
import { BIOME_COUNT, createBiomeWeightVector } from './BiomeTypes';

const SIGNATURE_SALT = 0x5167;

/**
 * Biome plants for the plant system: a region plan (species counts, allowed families, signature
 * plants) from the biome at the region's centre, and a blended per-point plant density and forest
 * shade. Reads the shared `BiomeField`; unused while a world's biomes are off.
 */
export class BiomePlants implements PlantEcologyBiomes {
	private readonly field: BiomeField;
	private readonly trees: BiomeTrees;
	private readonly weights = createBiomeWeightVector();

	constructor(field: BiomeField, trees: BiomeTrees) {
		this.field = field;
		this.trees = trees;
	}

	enabled(): boolean {
		return this.field.isEnabled();
	}

	generation(): number {
		return this.field.getGeneration();
	}

	regionPlan(worldX: number, worldZ: number): RegionPlantPlan {
		const biome = this.field.dominantAt(worldX, worldZ);
		const profile = BIOME_PLANT_PROFILES[biome];
		const signature: PlantSpeciesDefinition[] = [];
		if (profile.signature) {
			const rx = Math.floor(worldX);
			const rz = Math.floor(worldZ);
			SIGNATURE_PLANT_IDS.forEach((id, i) => {
				const chance = profile.signature?.[id] ?? 0;
				if (chance > 0 && hashCellToFloat01(SIGNATURE_SALT, rx, rz, i) < chance)
					signature.push(getSignaturePlant(id));
			});
		}
		return {
			biome,
			flowers: profile.flowers,
			ground: profile.ground,
			flowerFamilies: profile.flowerFamilies,
			groundFamilies: profile.groundFamilies,
			signature
		};
	}

	/** How much of the ground plants cover at a point, relative to the pre-biome meadow (blended). */
	densityAt(worldX: number, worldZ: number): number {
		const w = this.weights;
		this.field.weightsAt(worldX, worldZ, w);
		let density = 0;
		for (let b = 0; b < BIOME_COUNT; b++) {
			if (w[b] > 0) density += BIOME_PLANT_PROFILES[b].density * w[b];
		}
		return density;
	}

	/** Forest cover for plant shade habitat: the same biome forests trees grow in. */
	forestDensity(worldX: number, worldZ: number, variation: number, clearing: number): number {
		return this.trees.forestDensity(worldX, worldZ, variation, clearing);
	}
}
