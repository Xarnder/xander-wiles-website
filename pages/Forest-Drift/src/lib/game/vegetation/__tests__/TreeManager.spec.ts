import { describe, expect, it } from 'vitest';
import { TreeManager } from '../TreeManager';
import { createDefaultVegetationSettings } from '../VegetationTypes';
import { FoundationManager } from '../../building/FoundationManager';
import type { FoundationDefinition } from '../../building/FoundationTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import type { HeightSample, TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';

/** Flat, level terrain — enough for TreeManager/TreePlacementGenerator, nothing more. */
function makeFlatTerrainSampler(): TerrainHeightSampler {
	return {
		sample: () => 0,
		sampleWithNormal: (_x: number, _z: number, out: HeightSample) => {
			out.height = 0;
			out.normalX = 0;
			out.normalY = 1;
			out.normalZ = 0;
		}
	} as unknown as TerrainHeightSampler;
}

function makeDenseForestManager(foundationManager: FoundationManager): TreeManager {
	const terrainSettings = createDefaultTerrainSettings();
	const vegetationSettings = createDefaultVegetationSettings();

	// Force forest coverage everywhere so the test isn't at the mercy of where the mask happens
	// to place a real forest region — density/placement math itself is already covered elsewhere.
	vegetationSettings.forest.forestThreshold = -1;
	vegetationSettings.forest.forestBlendWidth = 0.01;
	vegetationSettings.forest.clearingStrength = 0;
	vegetationSettings.forest.treeClusterStrength = 0;
	vegetationSettings.trees.treeDensityMultiplier = 1;
	vegetationSettings.trees.maxTreeSlopeDegrees = 89;
	vegetationSettings.trees.enableTreeLine = false;
	vegetationSettings.loading.treeViewDistanceChunks = 0;
	vegetationSettings.loading.treeChunksGeneratedPerFrame = 4;

	return new TreeManager({
		settings: vegetationSettings,
		terrainSettings,
		terrainHeightSampler: makeFlatTerrainSampler(),
		foundationManager,
		seed: 'foundation-exclusion-world'
	});
}

describe('foundation exclusion', () => {
	it('places trees in a chunk with no foundations', () => {
		const manager = makeDenseForestManager(new FoundationManager(() => 2));
		manager.update(0, 0);
		expect(manager.getStats().treeInstances).toBeGreaterThan(0);
		manager.dispose();
	});

	it('excludes every candidate whose position falls inside a foundation footprint', () => {
		const terrainSettings = createDefaultTerrainSettings();
		const vertexSpacing = terrainSettings.chunkSize / terrainSettings.chunkResolution;
		const foundationManager = new FoundationManager(() => vertexSpacing);

		// A foundation covering the entire player chunk (0,0) footprint.
		const definition: FoundationDefinition = {
			id: 'covers-whole-chunk',
			minGridX: -2,
			maxGridX: Math.ceil(terrainSettings.chunkSize / vertexSpacing) + 2,
			minGridZ: -2,
			maxGridZ: Math.ceil(terrainSettings.chunkSize / vertexSpacing) + 2,
			topY: 50,
			bottomY: -50
		};
		foundationManager.addFoundation(definition);

		const manager = makeDenseForestManager(foundationManager);
		manager.update(0, 0);

		expect(manager.getStats().treeInstances).toBe(0);
		manager.dispose();
	});
});
