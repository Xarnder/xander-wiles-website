import { TREE_SPECIES_IDS } from '../vegetation/trees/TreeSpeciesTypes';
import type { TreeSpeciesBiomeSource } from '../vegetation/trees/TreeSpeciesSelector';
import type { BiomeField } from './BiomeField';
import { PACKED_TREE_PROFILES, TREE_PROFILE_STRIDE } from './biomeTreeProfiles';
import { BIOME_COUNT, createBiomeWeightVector } from './BiomeTypes';

const SPECIES = TREE_SPECIES_IDS.length;

/**
 * Biome forests for tree placement: how dense the forest is at a point (the biome's band, with
 * today's forest variation choosing where inside it) and which species grow there. Reads the shared
 * `BiomeField`; never allocates. Unused while a world's biomes are off, so tree placement there is
 * exactly what it was.
 */
export class BiomeTrees implements TreeSpeciesBiomeSource {
	private readonly field: BiomeField;
	private readonly weights = createBiomeWeightVector();

	constructor(field: BiomeField) {
		this.field = field;
	}

	enabled(): boolean {
		return this.field.isEnabled();
	}

	/**
	 * Forest density 0..1 at a point. `variation` and `clearing` come from
	 * `VegetationRegionSampler.getForestVariation`: variation picks a spot within the biome's band,
	 * and clearings cut glades even in the densest biomes.
	 */
	forestDensity(worldX: number, worldZ: number, variation: number, clearing: number): number {
		const w = this.weights;
		this.field.weightsAt(worldX, worldZ, w);
		let lo = 0;
		let hi = 0;
		for (let b = 0; b < BIOME_COUNT; b++) {
			const weight = w[b];
			if (weight <= 0) continue;
			const o = b * TREE_PROFILE_STRIDE;
			lo += PACKED_TREE_PROFILES[o] * weight;
			hi += PACKED_TREE_PROFILES[o + 1] * weight;
		}
		const density = (lo + (hi - lo) * variation) * (1 - clearing);
		return density < 0 ? 0 : density > 1 ? 1 : density;
	}

	/** Species weights at a point, index-aligned with TREE_SPECIES_IDS (blended across borders). */
	speciesWeights(worldX: number, worldZ: number, out: Float64Array): void {
		const w = this.weights;
		this.field.weightsAt(worldX, worldZ, w);
		out.fill(0);
		for (let b = 0; b < BIOME_COUNT; b++) {
			const weight = w[b];
			if (weight <= 0) continue;
			const o = b * TREE_PROFILE_STRIDE + 2;
			for (let s = 0; s < SPECIES; s++) out[s] += PACKED_TREE_PROFILES[o + s] * weight;
		}
	}
}
