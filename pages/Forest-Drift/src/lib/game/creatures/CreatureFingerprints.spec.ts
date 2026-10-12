import { describe, expect, it } from 'vitest';
import { compileCreatureGeometry } from './CreatureCompiler';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { jointWorldPositions } from './SkeletonGenerator';
import { featureCounts } from './FeatureGenerator';
import type { BodyPlanId, Vec3 } from './CreatureTypes';

/**
 * Golden fingerprints for known seeds: compact anatomy summaries (joints, attachments, bounds,
 * counts, penetrations, geometry hash), never raw vertex arrays. An intentional generator change
 * updates these with `vitest -u`; an unintentional one shows exactly which anatomy moved.
 */
const round = (v: number) => Math.round(v * 1000) / 1000;
const point = (p: Vec3) => [round(p.x), round(p.y), round(p.z)];
const SEEDS: [BodyPlanId, number][] = [
	['quadruped', 42],
	['quadruped', 7],
	['biped', 42],
	['biped', 3],
	['hexapod', 42],
	['hexapod', 11],
	['serpentine', 42],
	['serpentine', 5]
];

describe('creature golden fingerprints', () => {
	for (const [plan, seed] of SEEDS)
		it(`${plan} ${seed}`, () => {
			const species = generateSpecies(seed, plan);
			const c = compileCreatureGeometry({ species, individual: generateIndividual(species, 7) });
			const world = jointWorldPositions(c.skeleton);
			const key = ['root', 'pelvis', 'chest', 'neck', 'head', 'tail-5', 'spine-0'];
			expect({
				name: species.name,
				traits: species.anatomy.signatureTraits,
				style: species.form?.style,
				joints: c.skeleton.joints.length,
				keyJoints: Object.fromEntries(
					key.filter((k) => world.has(k)).map((k) => [k, point(world.get(k)!)])
				),
				attachments: (c.skeleton.attachments ?? [])
					.filter((a) => a.limbId.endsWith('-1') && !a.limbId.endsWith('--1'))
					.map((a) => ({
						limb: a.limbId,
						surface: point(a.surfacePoint),
						root: point(a.rootPoint),
						penetration: round(a.penetration)
					})),
				bounds: [...point(c.bounds.min), ...point(c.bounds.max)],
				triangles: c.geometry.indices.length / 3,
				vertices: c.geometry.positions.length / 3,
				features: featureCounts(c.skeleton),
				fingerprint: c.fingerprint
			}).toMatchSnapshot();
		});
});
