import { createNamedRandom, hashStringToUint32 } from '../terrain/seededRandom';
import type { IndividualGenome, SpeciesGenome } from './CreatureTypes';

/** Mutations never replace body plan, signature features or the species palette family. */
export function generateIndividual(species: SpeciesGenome, seed: number): IndividualGenome {
	if (!Number.isSafeInteger(seed)) throw new Error('Creature seed must be a safe integer');
	const rng = createNamedRandom(species.id, `individual-v1:${seed}`);
	const offset = (range: number) => (rng() * 2 - 1) * range;
	const rules = species.individualVariation;
	return {
		id: `cr_1_${(hashStringToUint32(`${species.id}:${seed}`) >>> 0).toString(16)}`,
		speciesId: species.id,
		seed,
		sizeFactor: Math.max(
			species.scaleRange.min,
			Math.min(species.scaleRange.max, 1 + offset(rules.size))
		),
		proportionVariation: {
			length: 1 + offset(rules.proportions),
			width: 1 + offset(rules.proportions),
			legs: 1 + offset(rules.proportions),
			head: 1 + offset(rules.proportions)
		},
		paletteVariation: { hue: offset(rules.hue), lightness: offset(0.035) },
		featureVariation: {
			scale: 1 + offset(rules.features),
			asymmetry: offset(1 - species.anatomy.symmetryStrength)
		},
		behaviouralVariation: {
			curiosity: offset(rules.behaviour),
			fear: offset(rules.behaviour),
			speed: 1 + offset(rules.behaviour)
		}
	};
}
