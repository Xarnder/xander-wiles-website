import { describe, expect, it } from 'vitest';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { validateIndividual, validateSpecies } from './CreatureValidation';
import { hashStringToUint32 } from '../terrain/seededRandom';
import type { BodyPlanId } from './CreatureTypes';

describe('versioned creature recipes', () => {
	it('is deterministic through JSON round trips', () => {
		const a = generateSpecies(42);
		expect(a).toEqual(generateSpecies(42));
		expect(generateIndividual(a, 7)).toEqual(generateIndividual(JSON.parse(JSON.stringify(a)), 7));
		expect(hashStringToUint32(JSON.stringify(a)) >>> 0).toMatchInlineSnapshot(`3220558847`);
	});
	it.each<BodyPlanId>(['quadruped', 'biped', 'hexapod', 'serpentine'])(
		'validates 100 %s species and bounded related individuals',
		(plan) => {
			const identities = new Set<string>();
			for (let seed = 0; seed < 100; seed++) {
				const species = generateSpecies(seed, plan);
				expect(validateSpecies(species)).toBeNull();
				identities.add(species.id);
				for (let n = 0; n < 10; n++)
					expect(validateIndividual(generateIndividual(species, n), species)).toBeNull();
			}
			expect(identities.size).toBe(100);
		}
	);
	it('varies silhouettes, palettes and size without mutating species', () => {
		const species = Array.from({ length: 100 }, (_, i) => generateSpecies(i));
		expect(new Set(species.map((s) => s.anatomy.signatureTraits[0])).size).toBe(4);
		expect(new Set(species.map((s) => s.appearance.palette.pattern)).size).toBe(7);
		const heights = species.map(
			(s) =>
				s.proportions.legLength +
				s.proportions.bodyDepth +
				s.proportions.neckLength +
				s.proportions.headSize
		);
		expect(Math.min(...heights)).toBeLessThan(0.2);
		expect(Math.max(...heights)).toBeGreaterThan(20);
		const before = JSON.stringify(species[0]);
		const individuals = Array.from({ length: 10 }, (_, i) => generateIndividual(species[0], i));
		expect(new Set(individuals.map((i) => i.sizeFactor)).size).toBe(10);
		expect(JSON.stringify(species[0])).toBe(before);
	});
	it('rejects malformed recipes before compilation', () => {
		const species = generateSpecies(42);
		for (const value of [
			null,
			{},
			{ ...species, generatorVersion: 2 },
			{ ...species, proportions: { ...species.proportions, headSize: NaN } },
			{ ...species, bodyPlan: { id: 'avian', spineSegments: 4 } }
		])
			expect(validateSpecies(value)).not.toBeNull();
		const individual = generateIndividual(species, 5);
		expect(validateIndividual({ ...individual, speciesId: 'wrong' }, species)).not.toBeNull();
		expect(validateIndividual({ ...individual, sizeFactor: 4 }, species)).not.toBeNull();
		expect(
			validateIndividual(
				{ ...individual, proportionVariation: { ...individual.proportionVariation, head: 20 } },
				species
			)
		).not.toBeNull();
	});
});
