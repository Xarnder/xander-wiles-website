import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { compileCreatureGeometry } from './CreatureCompiler';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { jointWorldPositions } from './SkeletonGenerator';
import { featureCounts } from './FeatureGenerator';
import type { BodyPlanId, CreatureCompiledGeometry, Vec3 } from './CreatureTypes';

/**
 * Golden fingerprints for known seeds: compact anatomy summaries (joints, attachments, bounds,
 * counts, penetrations, geometry hash), never raw vertex arrays. Round float attributes to 1e-4
 * before hashing: raw geometry bytes include runtime-dependent rounding noise and signed zeros.
 * Topology and skin indices remain exact; same-runtime byte reproducibility is checked separately.
 * An intentional generator change
 * updates these with `vitest -u`; an unintentional one shows exactly which anatomy moved.
 */
const round = (v: number) => Math.round(v * 1000) / 1000;
const point = (p: Vec3) => [round(p.x), round(p.y), round(p.z)];

function geometryFingerprint(geometry: CreatureCompiledGeometry): string {
	const hash = createHash('sha256');
	for (const [name, values] of Object.entries(geometry)) {
		hash.update(name);
		const integer = values instanceof Uint16Array || values instanceof Uint32Array;
		hash.update(
			JSON.stringify(Array.from(values, (v: number) => (integer ? v : Math.round(v * 10_000))))
		);
	}
	return hash.digest('hex');
}
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
			const definition = { species, individual: generateIndividual(species, 7) };
			const c = compileCreatureGeometry(definition);
			expect(compileCreatureGeometry(JSON.parse(JSON.stringify(definition))).fingerprint).toBe(
				c.fingerprint
			);
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
				geometry: geometryFingerprint(c.geometry)
			}).toMatchSnapshot();
		});
});
