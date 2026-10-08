import * as THREE from 'three';
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

describe('tree streaming and batching', () => {
	function manager(
		foundationManager = new FoundationManager(() => 2),
		tweak?: (m: TreeManager) => void
	) {
		const m = makeDenseForestManager(foundationManager);
		tweak?.(m);
		return m;
	}

	it('loads chunks as instanced batches and releases them when they leave the view', () => {
		const m = makeDenseForestManager(new FoundationManager(() => 2));
		// View distance 0 → only the player's chunk.
		m.update(0, 0);
		m.updateView(new THREE.Vector3(10, 5, 10), 0.016);
		const loaded = m.getRenderStats(null);
		expect(loaded.activeChunks).toBe(1);
		expect(loaded.activeBatches).toBeGreaterThan(0);
		// Every tree is in a batch; batches are far fewer than trees.
		const trees = m.getStats().treeInstances;
		expect(loaded.loadedTreesByLod.reduce((a, b) => a + b, 0)).toBe(trees);
		expect(loaded.activeBatches).toBeLessThan(trees / 4);
		const meshesBefore = countMeshes(m.group);
		expect(meshesBefore).toBe(loaded.activeBatches);

		// Walk far away: the old chunk unloads and its batches leave the scene graph.
		m.update(5000, 5000);
		const after = m.getRenderStats(null);
		expect(after.activeChunks).toBe(1);
		expect(countMeshes(m.group)).toBe(after.activeBatches);
		m.dispose();
		expect(countMeshes(m.group)).toBe(0);
	});

	it('never duplicates prototype geometry across chunks', () => {
		const m = makeDenseForestManager(new FoundationManager(() => 2));
		const camera = new THREE.Vector3(0, 5, 0);
		for (let x = 0; x < 4; x++) {
			m.update(x * 96 + 48, 48);
			m.updateView(camera, 0.016);
		}
		// At most species × variants × 3 LODs + one silhouette per species.
		const maxPrototypeGeometries = 4 * 4 * 3 + 4;
		expect(m.getRenderStats(null).prototypeGeometries).toBeLessThanOrEqual(maxPrototypeGeometries);
		m.dispose();
	});

	it('caps trees per chunk', () => {
		const m = makeDenseForestManager(new FoundationManager(() => 2));
		(
			m as unknown as { settings: { trees: { maxTreesPerChunk: number } } }
		).settings.trees.maxTreesPerChunk = 25;
		m.update(0, 0);
		expect(m.getStats().treeInstances).toBe(25);
		m.dispose();
	});

	it('keeps crowns clear of a foundation, not just trunks', () => {
		const terrainSettings = createDefaultTerrainSettings();
		const spacing = terrainSettings.chunkSize / terrainSettings.chunkResolution;
		const foundationManager = new FoundationManager(() => spacing);
		// A 20 m × 20 m foundation in the middle of chunk (0, 0).
		foundationManager.addFoundation({
			id: 'f',
			minGridX: 19,
			maxGridX: 29,
			minGridZ: 19,
			maxGridZ: 29,
			topY: 1,
			bottomY: -1
		});
		const m = manager(foundationManager);
		m.update(0, 0);
		m.updateView(new THREE.Vector3(48, 5, 48), 0.016);
		const m2 = new THREE.Matrix4();
		const p = new THREE.Vector3();
		for (const child of collectMeshes(m.group)) {
			for (let i = 0; i < child.count; i++) {
				child.getMatrixAt(i, m2);
				p.setFromMatrixPosition(m2);
				// Footprint is x, z ∈ [38, 58]; nothing within ~1.5 m of it.
				const dx = Math.max(38 - p.x, 0, p.x - 58);
				const dz = Math.max(38 - p.z, 0, p.z - 58);
				expect(Math.hypot(dx, dz)).toBeGreaterThan(1.5);
			}
		}
		m.dispose();
	});
});

function collectMeshes(root: THREE.Object3D): THREE.InstancedMesh[] {
	const meshes: THREE.InstancedMesh[] = [];
	root.traverse((o) => {
		if ((o as THREE.InstancedMesh).isInstancedMesh) meshes.push(o as THREE.InstancedMesh);
	});
	return meshes;
}

function countMeshes(root: THREE.Object3D): number {
	return collectMeshes(root).length;
}
