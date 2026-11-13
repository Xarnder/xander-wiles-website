import { afterEach, describe, expect, it } from 'vitest';
import { regionSpecies } from '../../CreaturePopulationSystem';
import type { SpeciesGenome } from '../../CreatureTypes';
import { generateIndividual } from '../../IndividualGenerator';
import { generateSpecies } from '../../SpeciesGenerator';
import { coatRegionSpecies } from '../../biome/CreatureBiomeCoat';
import { readCreatureCoatSwitches } from '../../biome/creatureCoatSwitches';
import {
	COAT_CODES,
	COAT_FEATURE_MAX,
	COAT_FEATURE_MIN,
	coatDetailFor,
	coatFrequency,
	coatLodFactor,
	coatRegionMask
} from '../CreatureCoatDetail';
import { resolveCreatureSurface } from '../CreaturePatternGenerator';
import { SURFACE_REGION } from '../CreatureSurfaceClassifier';
import { creatureSurfaceTable, SURFACE_TABLE_WIDTH } from '../CreatureSurfaceTable';

const region = (profile: Parameters<typeof coatRegionSpecies>[1], seed = 'coat-detail') =>
	coatRegionSpecies(regionSpecies(seed, 2, -1), profile, seed, '2:-1');

describe('coat micro-texture (Phase 2)', () => {
	afterEach(() => readCreatureCoatSwitches(''));

	it('follows the body plan: serpents scales, hexapods chitin, furred plans fur', () => {
		for (let seed = 1; seed < 30; seed++) {
			expect(coatDetailFor(generateSpecies(seed, 'serpentine')).type).toBe('scales');
			expect(coatDetailFor(generateSpecies(seed, 'hexapod')).type).toBe('chitin');
			expect(coatDetailFor(generateSpecies(seed, 'quadruped')).type).toBe('fur');
			expect(coatDetailFor(generateSpecies(seed, 'biped')).type).toBe('fur');
		}
	});

	it('lets bare biome coats wear hide, scales or skin, and thickens fur in the cold', () => {
		const types = (species: SpeciesGenome[]) => species.map((s) => coatDetailFor(s).type);
		const furred = (list: SpeciesGenome[]) =>
			list.filter((s) => s.bodyPlan.id === 'quadruped' || s.bodyPlan.id === 'biped');
		const desert = furred(region('desert'));
		for (const s of desert)
			expect(s.appearance.coat!.bare ? ['hide', 'scales'] : ['fur']).toContain(
				coatDetailFor(s).type
			);
		const swamp = furred(region('swamp'));
		for (const s of swamp)
			expect(s.appearance.coat!.bare ? 'skin' : 'fur').toBe(coatDetailFor(s).type);
		expect(types(furred(region('snowyTaiga'))).every((t) => t === 'fur')).toBe(true);
		const thick = coatDetailFor(furred(region('snowyTaiga'))[0]).strength;
		const thin = coatDetailFor(
			furred(region('jungle')).find((s) => !s.appearance.coat!.bare) ?? furred(region('jungle'))[0]
		).strength;
		expect(thick).toBeGreaterThan(thin);
	});

	it('keeps features between 4 mm and 6 cm, whatever the size of the creature', () => {
		const detail = { type: 'fur' as const, strength: 0.5, featuresPerBody: 40 };
		for (const scale of [0.05, 0.3, 1, 4, 25]) {
			const size = 1 / coatFrequency(detail, scale);
			expect(size).toBeGreaterThanOrEqual(COAT_FEATURE_MIN - 1e-9);
			expect(size).toBeLessThanOrEqual(COAT_FEATURE_MAX + 1e-9);
		}
		expect(coatFrequency({ type: 'none', strength: 0, featuresPerBody: 0 }, 1)).toBe(0);
	});

	it('fades out by LOD2 and stays off eyes, noses and horns', () => {
		expect(coatLodFactor(0)).toBe(1);
		expect(coatLodFactor(1)).toBeGreaterThan(0);
		expect(coatLodFactor(1)).toBeLessThan(1);
		expect(coatLodFactor(2)).toBe(0);
		for (const r of [SURFACE_REGION.EYE, SURFACE_REGION.NOSE, SURFACE_REGION.HORN])
			expect(coatRegionMask(r)).toBe(0);
		expect(coatRegionMask(SURFACE_REGION.TORSO)).toBe(1);
		expect(coatRegionMask(SURFACE_REGION.FOOT)).toBeLessThan(1);
	});

	it('is resolved with the surface and written to the creature table row', () => {
		const species = generateSpecies(40, 'quadruped');
		const surface = resolveCreatureSurface(species, generateIndividual(species, 7));
		expect(surface.coat.type).toBe('fur');
		const table = creatureSurfaceTable();
		const slot = table.allocate();
		table.write(slot, surface, 0, 2);
		const at = (slot * SURFACE_TABLE_WIDTH + 7) * 4;
		expect(table.data[at + 1]).toBe(COAT_CODES.fur);
		expect(table.data[at + 2]).toBeCloseTo(surface.coat.strength, 5);
		expect(table.data[at + 3]).toBeCloseTo(coatFrequency(surface.coat, 2), 3);
		table.release(slot);
	});

	it('?creatureDetail=off removes the coat detail', () => {
		readCreatureCoatSwitches('?creatureDetail=off');
		expect(coatDetailFor(generateSpecies(40, 'quadruped')).type).toBe('none');
	});
});
