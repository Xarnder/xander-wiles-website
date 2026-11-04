import { describe, expect, it } from 'vitest';
import { CARRY_MAX_HEIGHT, abilityFor, creatureHeight } from './creatureAbilities';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { regionSpecies } from './CreaturePopulationSystem';
import type { BodyPlanId, CreatureDefinition, SpeciesGenome } from './CreatureTypes';

/** Rescales a species so its reference standing height is exactly `height` metres. */
function sized(species: SpeciesGenome, height: number): SpeciesGenome {
	const copy = structuredClone(species);
	const p = copy.proportions;
	const k = height / (p.legLength + p.bodyDepth + p.neckLength + p.headSize);
	p.legLength *= k;
	p.bodyDepth *= k;
	p.neckLength *= k;
	p.headSize *= k;
	return copy;
}

function definition(plan: BodyPlanId, height: number, sizeFactor = 1): CreatureDefinition {
	const species = sized(generateSpecies(1234, plan), height);
	return { species, individual: { ...generateIndividual(species, 7), sizeFactor } };
}

describe('creature abilities', () => {
	it('lets small quadrupeds be carried as mouth-projectile creatures', () => {
		const ability = abilityFor(definition('quadruped', 0.6));
		expect(ability?.id).toBe('mouth-projectile');
		expect(ability?.carry.side).toBe('left');
	});

	it('uses standing height at the individual size, with the 0.9 m limit inclusive', () => {
		expect(abilityFor(definition('quadruped', CARRY_MAX_HEIGHT - 1e-6))).not.toBeNull();
		expect(abilityFor(definition('quadruped', CARRY_MAX_HEIGHT + 0.001))).toBeNull();
		expect(abilityFor(definition('quadruped', 0.8, 1.2))).toBeNull();
		expect(creatureHeight(definition('quadruped', 0.8, 0.5))).toBeCloseTo(0.4);
	});

	it('refuses every other body plan, however small', () => {
		for (const plan of ['biped', 'hexapod', 'serpentine'] as const)
			expect(abilityFor(definition(plan, 0.4))).toBeNull();
	});

	it('makes every region offer at least one carryable species', () => {
		for (let x = -6; x < 6; x++)
			for (let z = -6; z < 6; z++) {
				const smallest = regionSpecies('forest', x, z)[0];
				expect(
					abilityFor({ species: smallest, individual: generateIndividual(smallest, 1) })
				).not.toBeNull();
			}
	});
});
