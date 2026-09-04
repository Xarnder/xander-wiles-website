import type { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import type { FoundationManager } from './FoundationManager';

/**
 * Ground height for player grounding, combining procedural terrain with any placed foundation
 * standing above it. This is the single source of truth FirstPersonController should use instead
 * of talking to TerrainHeightSampler directly, so walking onto a foundation "just works" without
 * the controller knowing buildings exist.
 */
export class WorldSurfaceSampler {
	constructor(
		private readonly terrainHeightSampler: TerrainHeightSampler,
		private readonly foundationManager: FoundationManager
	) {}

	getGroundHeight(worldX: number, worldZ: number): number {
		const terrainHeight = this.terrainHeightSampler.sample(worldX, worldZ);
		const foundationTopY = this.foundationManager.getTopYAt(worldX, worldZ);
		return foundationTopY !== null && foundationTopY > terrainHeight
			? foundationTopY
			: terrainHeight;
	}
}
