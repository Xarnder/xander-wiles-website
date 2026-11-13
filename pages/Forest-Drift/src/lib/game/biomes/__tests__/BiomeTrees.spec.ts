import { describe, expect, it } from 'vitest';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { TreePlacementGenerator } from '../../vegetation/TreePlacementGenerator';
import { TreeSpeciesSelector } from '../../vegetation/trees/TreeSpeciesSelector';
import { TREE_SPECIES_IDS, type TreeSpeciesId } from '../../vegetation/trees/TreeSpeciesTypes';
import { TREE_SPECIES } from '../../vegetation/trees/treeSpecies';
import { createDefaultVegetationSettings } from '../../vegetation/VegetationTypes';
import { VegetationRegionSampler } from '../../vegetation/VegetationRegionSampler';
import type { BiomeField } from '../BiomeField';
import { BIOME_TREE_PROFILES } from '../biomeTreeProfiles';
import { BiomeTrees } from '../BiomeTrees';
import { BIOME_IDS, createDefaultBiomeSettings, type BiomeId } from '../BiomeTypes';

function pureField(id: BiomeId, enabled = true): BiomeField {
	const index = BIOME_IDS.indexOf(id);
	const settings = { ...createDefaultBiomeSettings(), enabled };
	return {
		isEnabled: () => settings.enabled,
		weightsAt: (_x: number, _z: number, out: Float32Array) => {
			out.fill(0);
			out[index] = 1;
			return index;
		}
	} as unknown as BiomeField;
}

function placement(seed: string, biomes?: BiomeTrees) {
	const terrainSettings = createDefaultTerrainSettings();
	terrainSettings.seed = seed;
	const terrain = new TerrainHeightSampler(terrainSettings);
	const vegetation = createDefaultVegetationSettings();
	const regions = new VegetationRegionSampler(vegetation);
	regions.setSeed(seed);
	const selector = new TreeSpeciesSelector(vegetation.species);
	selector.setBiomeSource(biomes ?? null);
	const generator = new TreePlacementGenerator(terrain, regions, vegetation.trees, {
		speciesSelector: selector,
		getPrototypesPerSpecies: () => 4,
		biomes
	});
	generator.setSeed(seed);
	return generator;
}

function trees(generator: TreePlacementGenerator, cells = 30) {
	const out = [];
	for (let x = -cells; x < cells; x++)
		for (let z = -cells; z < cells; z++) {
			const tree = generator.generateCell(x, z);
			if (tree) out.push(tree);
		}
	return out;
}

describe('biome tree profiles', () => {
	it('gives every biome a valid band and at least one real species', () => {
		expect(BIOME_TREE_PROFILES).toHaveLength(26);
		for (const [i, p] of BIOME_TREE_PROFILES.entries()) {
			expect(p.forest[0], BIOME_IDS[i]).toBeGreaterThanOrEqual(0);
			expect(p.forest[1], BIOME_IDS[i]).toBeLessThanOrEqual(1);
			expect(p.forest[0], BIOME_IDS[i]).toBeLessThanOrEqual(p.forest[1]);
			const species = Object.entries(p.species).filter(([, w]) => (w ?? 0) > 0);
			expect(species.length, BIOME_IDS[i]).toBeGreaterThan(0);
			for (const [id] of species) expect(TREE_SPECIES[id as TreeSpeciesId], id).toBeDefined();
		}
	});

	it('keeps the original species index order (chunks store species by index)', () => {
		expect(TREE_SPECIES_IDS.slice(0, 8)).toEqual([
			'oak',
			'pine',
			'cypress',
			'ornamental',
			'spruce',
			'birch',
			'scotsPine',
			'willow'
		]);
	});
});

describe('BiomeTrees', () => {
	it('keeps each biome inside its forest band, with clearings on top', () => {
		const plains = new BiomeTrees(pureField('plains'));
		const dark = new BiomeTrees(pureField('darkForest'));
		expect(plains.forestDensity(0, 0, 1, 0)).toBeCloseTo(0.12, 6);
		expect(plains.forestDensity(0, 0, 0, 0)).toBe(0);
		expect(dark.forestDensity(0, 0, 0, 0)).toBeCloseTo(0.85, 6);
		expect(dark.forestDensity(0, 0, 1, 0.5)).toBeCloseTo(0.5, 6);
	});

	it('grows snow-dusted conifers in the Snowy Taiga', () => {
		const out = new Float64Array(TREE_SPECIES_IDS.length);
		new BiomeTrees(pureField('snowyTaiga')).speciesWeights(0, 0, out);
		const best = TREE_SPECIES_IDS[out.indexOf(Math.max(...out))];
		expect(best).toBe('frostedSpruce');
		expect(out[TREE_SPECIES_IDS.indexOf('oak')]).toBe(0);
	});
});

describe('tree placement with biomes', () => {
	it('is identical to the pre-biome forest when the world has biomes off', () => {
		const without = trees(placement('trees-parity'));
		const off = trees(placement('trees-parity', new BiomeTrees(pureField('desert', false))));
		expect(off).toEqual(without);
	});

	it('never plants biome-only species without biomes', () => {
		const legacyOnly = new Set<TreeSpeciesId>(TREE_SPECIES_IDS.slice(0, 8));
		for (const tree of trees(placement('legacy-species', undefined), 40))
			expect(legacyOnly.has(tree.speciesId)).toBe(true);
	});

	it('plants only the biome’s species, at the biome’s density', () => {
		const taiga = trees(placement('snowy', new BiomeTrees(pureField('snowyTaiga'))));
		const plains = trees(placement('snowy', new BiomeTrees(pureField('plains'))));
		expect(taiga.length).toBeGreaterThan(plains.length * 3);
		for (const tree of taiga) expect(['frostedSpruce', 'frostedPine']).toContain(tree.speciesId);
		// Tree identity is still the cell, so removed trees stay removed when biomes change.
		for (const tree of taiga) expect(tree.id).toBe(`${tree.cellX}:${tree.cellZ}`);
	});
});
