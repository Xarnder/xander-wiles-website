import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TreeChunk, type PlantedTree } from '../TreeChunk';
import {
	lodCastsShadow,
	lodReceivesShadow,
	selectTreeLod,
	uniformLodForRange,
	type TreeLodDistances
} from '../treeLod';
import { TreePrototypeCache } from '../TreePrototypeCache';
import { TreeSpeciesSelector } from '../TreeSpeciesSelector';
import { TREE_SPECIES } from '../treeSpecies';
import { TREE_SPECIES_IDS, type TreeSpeciesId } from '../TreeSpeciesTypes';
import { createDefaultVegetationSettings } from '../../VegetationTypes';

const DISTANCES: TreeLodDistances = { lod1: 40, lod2: 90, lod3: 160, hysteresis: 0.1 };

describe('tree LOD selection', () => {
	it('picks LODs by distance with no history', () => {
		expect(selectTreeLod(10, -1, DISTANCES)).toBe(0);
		expect(selectTreeLod(50, -1, DISTANCES)).toBe(1);
		expect(selectTreeLod(100, -1, DISTANCES)).toBe(2);
		expect(selectTreeLod(500, -1, DISTANCES)).toBe(3);
	});

	it('applies hysteresis in both directions so trees near a threshold do not flicker', () => {
		// Moving out: stays LOD0 until 10% past the 40 m threshold.
		expect(selectTreeLod(42, 0, DISTANCES)).toBe(0);
		expect(selectTreeLod(45, 0, DISTANCES)).toBe(1);
		// Moving back in: stays LOD1 until 10% inside it.
		expect(selectTreeLod(38, 1, DISTANCES)).toBe(1);
		expect(selectTreeLod(35, 1, DISTANCES)).toBe(0);
		// A big jump still lands on the right LOD.
		expect(selectTreeLod(400, 0, DISTANCES)).toBe(3);
		expect(selectTreeLod(5, 3, DISTANCES)).toBe(0);
	});

	it('reports a uniform LOD only for ranges clear of every threshold band', () => {
		expect(uniformLodForRange(200, 300, DISTANCES)).toBe(3);
		expect(uniformLodForRange(0, 20, DISTANCES)).toBe(0);
		expect(uniformLodForRange(30, 60, DISTANCES)).toBeNull();
		expect(uniformLodForRange(85, 88, DISTANCES)).toBeNull(); // inside the 90 m hysteresis band
	});

	it('limits shadow casting to near LODs and drops receiving at silhouettes', () => {
		expect(lodCastsShadow(0, 0)).toBe(true);
		expect(lodCastsShadow(1, 0)).toBe(false);
		expect(lodCastsShadow(1, 1)).toBe(true);
		expect(lodCastsShadow(2, 3)).toBe(false);
		expect(lodCastsShadow(0, -1)).toBe(false);
		expect(lodReceivesShadow(2)).toBe(true);
		expect(lodReceivesShadow(3)).toBe(false);
	});
});

function plantedGrid(count: number, species: TreeSpeciesId[] = ['oak', 'pine']): PlantedTree[] {
	const planted: PlantedTree[] = [];
	for (let i = 0; i < count; i++) {
		const speciesId = species[i % species.length];
		planted.push({
			tree: {
				id: `${i}:0`,
				cellX: i,
				cellZ: 0,
				speciesId,
				variant: i % TREE_SPECIES[speciesId].prototypeCount,
				worldX: (i % 10) * 8,
				worldZ: Math.floor(i / 10) * 8,
				scale: 1,
				widthScale: 1,
				rotationY: i,
				tint: (i * 0.37) % 1
			},
			groundY: 2,
			normalY: 1
		});
	}
	return planted;
}

describe('TreePrototypeCache', () => {
	it('compiles each prototype LOD once and reuses it', () => {
		const cache = new TreePrototypeCache('cache-world');
		const a = cache.getGeometry('oak', 1, 0);
		const b = cache.getGeometry('oak', 1, 0);
		expect(a).toBe(b);
		expect(cache.getStats().geometries).toBe(1);
		expect(cache.getGeometry('oak', 1, 1)).not.toBe(a);
	});

	it('shares one LOD3 silhouette per species', () => {
		const cache = new TreePrototypeCache('cache-world');
		expect(cache.getGeometry('pine', 0, 3)).toBe(cache.getGeometry('pine', 3, 3));
		expect(cache.getGeometry('pine', 0, 3)).not.toBe(cache.getGeometry('oak', 0, 3));
	});

	it('disposes geometry and rebuilds for a new world seed', () => {
		const cache = new TreePrototypeCache('one');
		const geometry = cache.getGeometry('cypress', 0, 0);
		let disposed = false;
		geometry.addEventListener('dispose', () => (disposed = true));
		cache.setWorldSeed('two');
		expect(disposed).toBe(true);
		expect(cache.getStats().geometries).toBe(0);
		expect(cache.getGeometry('cypress', 0, 0)).not.toBe(geometry);
	});
});

describe('TreeChunk batching', () => {
	const cache = new TreePrototypeCache('batch-world');
	const material = new THREE.MeshStandardMaterial();
	const policy = { castShadows: true, maxShadowLod: 0 };

	it('groups trees into one batch per prototype × LOD, covering every tree exactly once', () => {
		const chunk = new TreeChunk(0, 0, plantedGrid(60));
		chunk.assignLods(new THREE.Vector3(0, 6, 0), DISTANCES);
		chunk.rebuildBatches(cache, material, policy);
		let total = 0;
		const keys = new Set<string>();
		for (const mesh of chunk.getBatches()) {
			total += mesh.count;
			expect(keys.has(mesh.name)).toBe(false);
			keys.add(mesh.name);
			expect(mesh.count).toBeGreaterThan(0);
		}
		expect(total).toBe(60);
		const lods = [0, 0, 0, 0];
		chunk.lodCounts(lods);
		expect(lods.reduce((a, b) => a + b, 0)).toBe(60);
		chunk.dispose();
	});

	it('gives every batch a bounding sphere that contains all of its instances (for culling)', () => {
		const chunk = new TreeChunk(0, 0, plantedGrid(40));
		chunk.assignLods(new THREE.Vector3(0, 6, 0), DISTANCES);
		chunk.rebuildBatches(cache, material, policy);
		const m = new THREE.Matrix4();
		const p = new THREE.Vector3();
		for (const mesh of chunk.getBatches()) {
			expect(mesh.frustumCulled).toBe(true);
			const sphere = mesh.boundingSphere as THREE.Sphere;
			for (let i = 0; i < mesh.count; i++) {
				mesh.getMatrixAt(i, m);
				p.setFromMatrixPosition(m);
				expect(sphere.containsPoint(p)).toBe(true);
			}
		}
		chunk.dispose();
	});

	it('collapses a far chunk into one silhouette batch per species, with no shadow casting', () => {
		const chunk = new TreeChunk(0, 0, plantedGrid(50, ['oak', 'pine', 'cypress']));
		chunk.assignLods(new THREE.Vector3(5000, 6, 0), DISTANCES);
		expect(chunk.uniformLod).toBe(3);
		chunk.rebuildBatches(cache, material, policy);
		expect(chunk.batchCount).toBe(3);
		for (const mesh of chunk.getBatches()) {
			expect(mesh.castShadow).toBe(false);
			expect(mesh.receiveShadow).toBe(false);
		}
		chunk.dispose();
	});

	it('reuses batches when LODs do not change, and reports changes only when they do', () => {
		const chunk = new TreeChunk(0, 0, plantedGrid(30));
		const camera = new THREE.Vector3(0, 6, 0);
		chunk.assignLods(camera, DISTANCES);
		chunk.rebuildBatches(cache, material, policy);
		const before = [...chunk.getBatches()];
		expect(chunk.assignLods(camera, DISTANCES)).toBe(false);
		chunk.rebuildBatches(cache, material, policy);
		expect([...chunk.getBatches()]).toEqual(before);
		expect(chunk.assignLods(new THREE.Vector3(5000, 6, 0), DISTANCES)).toBe(true);
		chunk.dispose();
	});

	it('removes all of its meshes from the scene on dispose', () => {
		const parent = new THREE.Group();
		const chunk = new TreeChunk(0, 0, plantedGrid(20));
		parent.add(chunk.group);
		chunk.assignLods(new THREE.Vector3(0, 6, 0), DISTANCES);
		chunk.rebuildBatches(cache, material, policy);
		expect(chunk.group.children.length).toBeGreaterThan(0);
		chunk.dispose();
		expect(parent.children.length).toBe(0);
		expect(chunk.batchCount).toBe(0);
	});
});

describe('TreeSpeciesSelector', () => {
	const settings = createDefaultVegetationSettings().species;
	const site = (overrides: Partial<Parameters<TreeSpeciesSelector['pick']>[0]> = {}) => ({
		worldX: 100,
		worldZ: -40,
		height: 5,
		density: 0.9,
		slopeDegrees: 5,
		...overrides
	});

	it('is deterministic per seed and roll', () => {
		const a = new TreeSpeciesSelector(settings);
		const b = new TreeSpeciesSelector(settings);
		a.setSeed('species-world');
		b.setSeed('species-world');
		for (let i = 0; i < 50; i++) {
			const s = site({ worldX: i * 37, worldZ: i * -19 });
			expect(a.pick(s, (i * 0.13) % 1)).toBe(b.pick(s, (i * 0.13) % 1));
		}
	});

	it('turns to conifers at elevation and keeps ornamentals out of dense forest', () => {
		const selector = new TreeSpeciesSelector(settings);
		selector.setSeed('species-world');
		const high = selector.weightsAt(site({ height: 120 }));
		expect(high[TREE_SPECIES_IDS.indexOf('pine')]).toBeGreaterThan(
			high[TREE_SPECIES_IDS.indexOf('oak')]
		);
		const dense = selector.weightsAt(site({ density: 1 }));
		expect(dense[TREE_SPECIES_IDS.indexOf('ornamental')]).toBe(0);
		const open = selector.weightsAt(site({ density: 0.2, height: 0 }));
		expect(open[TREE_SPECIES_IDS.indexOf('ornamental')]).toBeGreaterThan(0);
	});

	it('honours zero weights and falls back safely', () => {
		const selector = new TreeSpeciesSelector({
			...settings,
			oakWeight: 0,
			pineWeight: 0,
			cypressWeight: 0,
			ornamentalWeight: 0
		});
		selector.setSeed('x');
		expect(selector.pick(site(), 0.5)).toBe('oak');
		const pinesOnly = new TreeSpeciesSelector({
			...settings,
			oakWeight: 0,
			cypressWeight: 0,
			ornamentalWeight: 0,
			coniferStartHeight: -100,
			coniferFullHeight: -50
		});
		pinesOnly.setSeed('x');
		for (let r = 0; r < 1; r += 0.1) expect(pinesOnly.pick(site(), r)).toBe('pine');
	});
});
