import { describe, expect, it } from 'vitest';
import { PlantEcology, type RegionPlantPlan } from '../../vegetation/plants/plantEcology';
import { buildPlantPrototype } from '../../vegetation/plants/plantPrototype';
import {
	getSignaturePlant,
	SIGNATURE_PLANT_IDS
} from '../../vegetation/plants/plantSignatureSpecies';
import { speciesIssues } from '../../vegetation/plants/plantSpecies';
import type { BiomeField } from '../BiomeField';
import { BIOME_PLANT_PROFILES } from '../biomePlantProfiles';
import { BiomePlants } from '../BiomePlants';
import { BiomeTrees } from '../BiomeTrees';
import { BIOME_IDS, createDefaultBiomeSettings, type BiomeId } from '../BiomeTypes';
import {
	FLOWER_FAMILIES,
	GROUND_FAMILIES,
	type PlantFamily
} from '../../vegetation/plants/PlantTypes';

function pureField(id: BiomeId, enabled = true): BiomeField {
	const index = BIOME_IDS.indexOf(id);
	const settings = { ...createDefaultBiomeSettings(), enabled };
	return {
		isEnabled: () => settings.enabled,
		getGeneration: () => 1,
		dominantAt: () => index,
		weightsAt: (_x: number, _z: number, out: Float32Array) => {
			out.fill(0);
			out[index] = 1;
			return index;
		}
	} as unknown as BiomeField;
}

function plantsFor(id: BiomeId, enabled = true) {
	const field = pureField(id, enabled);
	return new BiomePlants(field, new BiomeTrees(field));
}

function ecology(biomes?: BiomePlants) {
	return new PlantEcology({ seedHash: 0xabc123, speciesScale: () => 1, biomes });
}

/** Every species the regions in a 10 × 10 block use. */
function speciesIn(e: PlantEcology) {
	const all = [];
	for (let rx = -5; rx < 5; rx++)
		for (let rz = -5; rz < 5; rz++) all.push(...e.regionSpecies(rx, rz));
	return all;
}

describe('signature plants', () => {
	it.each(SIGNATURE_PLANT_IDS)('%s is a valid species that builds valid prototypes', (id) => {
		const species = getSignaturePlant(id);
		expect(speciesIssues(species), species.signature).toEqual([]);
		expect(getSignaturePlant(id)).toBe(species);
		for (let v = 0; v < species.prototypeCount; v++) {
			const mesh = buildPlantPrototype(species, v);
			expect(mesh.positions.every(Number.isFinite)).toBe(true);
			expect(mesh.triangles).toBeGreaterThan(0);
			expect(mesh.triangles).toBeLessThanOrEqual(200);
		}
	});

	it('gives each its own fixed seed', () => {
		const seeds = SIGNATURE_PLANT_IDS.map((id) => getSignaturePlant(id).seed);
		expect(new Set(seeds).size).toBe(seeds.length);
	});
});

describe('biome plant profiles', () => {
	it('defines every biome, with families of the right kind', () => {
		expect(BIOME_PLANT_PROFILES).toHaveLength(26);
		for (const [i, p] of BIOME_PLANT_PROFILES.entries()) {
			expect(p.density, BIOME_IDS[i]).toBeGreaterThan(0);
			for (const f of p.flowerFamilies ?? [])
				expect(FLOWER_FAMILIES as readonly string[], BIOME_IDS[i]).toContain(f);
			for (const f of p.groundFamilies ?? [])
				expect(GROUND_FAMILIES as readonly string[], BIOME_IDS[i]).toContain(f);
		}
	});
});

describe('plant ecology with biomes', () => {
	it('draws exactly the pre-biome species when the world has biomes off', () => {
		const without = speciesIn(ecology()).map((s) => s.seed);
		const off = speciesIn(ecology(plantsFor('desert', false))).map((s) => s.seed);
		expect(off).toEqual(without);
	});

	it('restricts a desert to succulents, dry tufts and its signature dead shrubs', () => {
		const species = speciesIn(ecology(plantsFor('desert')));
		const ground = species.filter((s) => s.kind === 'ground');
		const allowed = new Set<PlantFamily>(['succulent', 'ground-tuft']);
		for (const s of ground) expect(allowed.has(s.family), s.family).toBe(true);
		expect(species).toContain(getSignaturePlant('deadShrub'));
	});

	it('puts sunflowers in every Sunflower Plains region, reeds in every swamp', () => {
		const sunflower = getSignaturePlant('sunflower');
		const reed = getSignaturePlant('reed');
		const e = ecology(plantsFor('sunflowerPlains'));
		const s = ecology(plantsFor('swamp'));
		for (let rx = -3; rx < 3; rx++) {
			expect(e.regionSpecies(rx, 2)).toContain(sunflower);
			expect(s.regionSpecies(rx, 2)).toContain(reed);
		}
	});

	it('gives flower meadows more species than snowfields, which may have no flowers at all', () => {
		const meadow = speciesIn(ecology(plantsFor('meadow')));
		const snow = speciesIn(ecology(plantsFor('snowySlopes')));
		const flowers = (list: typeof meadow) => list.filter((s) => s.kind === 'flower').length;
		expect(flowers(meadow)).toBeGreaterThan(flowers(snow) * 4);
	});

	it('rebuilds cached regions when the biome layout changes', () => {
		let generation = 1;
		let biome = 'plains' as BiomeId;
		const plan = (): RegionPlantPlan => ({
			biome: BIOME_IDS.indexOf(biome),
			flowers: 1,
			ground: 1,
			signature: biome === 'swamp' ? [getSignaturePlant('reed')] : []
		});
		const e = new PlantEcology({
			seedHash: 7,
			speciesScale: () => 1,
			biomes: { enabled: () => true, generation: () => generation, regionPlan: plan }
		});
		expect(e.regionSpecies(0, 0)).not.toContain(getSignaturePlant('reed'));
		biome = 'swamp';
		generation++;
		expect(e.regionSpecies(0, 0)).toContain(getSignaturePlant('reed'));
	});
});

describe('BiomePlants', () => {
	it('reports the blended plant density for a point', () => {
		expect(plantsFor('jungle').densityAt(0, 0)).toBeCloseTo(1.2, 6);
		expect(plantsFor('snowyPlains').densityAt(0, 0)).toBeCloseTo(0.08, 6);
	});
});
