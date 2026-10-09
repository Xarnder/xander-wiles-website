import {
	createBiomeWeights,
	type BiomeWeights,
	type TerrainHeightSampler
} from '../terrain/TerrainHeightSampler';
import type { BaseTerrainSampler as BaseTerrainSamplerLike } from './HydrologyTypes';

/**
 * Terrain before rivers and lakes carve it. This is the only height hydrology is allowed to read.
 * `TerrainHeightSampler.sample` adds carving on top and must not be called from here.
 */
export class BaseTerrainSampler implements BaseTerrainSamplerLike {
	private readonly weights = createBiomeWeights();

	constructor(private readonly terrain: TerrainHeightSampler) {}

	sample(worldX: number, worldZ: number): number {
		return this.terrain.sampleBase(worldX, worldZ);
	}

	sampleBiomeWeights(worldX: number, worldZ: number, out: BiomeWeights): void {
		this.terrain.sampleBiomeWeights(worldX, worldZ, out);
	}

	/** Highland/mountain weight in 0..1, used to prefer river sources on high ground. */
	highlandWeight(worldX: number, worldZ: number): number {
		this.terrain.sampleBiomeWeights(worldX, worldZ, this.weights);
		const w = this.weights;
		return w.plains * 0.18 + w.hills * 0.48 + w.highlands * 0.86 + w.mountains * 1;
	}
}
