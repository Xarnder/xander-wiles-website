import { creatureDimensions } from './creatureDimensions';
import type { SpeciesGenome } from './CreatureTypes';

/**
 * One height band per regional species, smallest to giant. Adjacent bands stay far enough apart
 * that two groups read as different sizes even at a glance.
 */
export const REGION_HEIGHT_BANDS: readonly (readonly [number, number])[] = [
	[0.55, 0.8],
	[1.2, 1.65],
	[2.3, 3.1],
	[4.4, 6],
	[8.5, 12],
	[16, 26]
];

/** Resize a complete genome coherently, retaining scale-dependent gait and behaviour. */
export function stature(species: SpeciesGenome, height: number): SpeciesGenome {
	const previous = creatureDimensions(species).height;
	const factor = height / previous;
	const p = species.proportions;
	for (const key of [
		'bodyLength',
		'bodyWidth',
		'bodyDepth',
		'neckLength',
		'headSize',
		'legLength',
		'legThickness',
		'stanceWidth',
		'tailLength',
		'tailThickness'
	] as const)
		p[key] *= factor;
	const gait = species.locomotion.gait;
	for (const key of ['strideLength', 'strideLift', 'bodyBob', 'bodySway', 'headBob'] as const)
		gait[key] *= factor;
	gait.walkFrequency = Math.max(0.2, Math.min(2.5, 0.9 / Math.sqrt(height)));
	gait.runFrequency = gait.walkFrequency * 1.9;
	const b = species.behaviour;
	b.wanderSpeed = Math.min(2.5, Math.sqrt(height) * 0.45);
	b.fleeSpeed = b.wanderSpeed * 2.8;
	b.wanderRadius = Math.max(6, height * 4);
	b.awarenessRadius = Math.max(7, height * 3);
	b.comfortDistance = Math.max(0.8, height * 0.9);
	return species;
}
