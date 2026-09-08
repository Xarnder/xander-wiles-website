import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { compileCreature, compileCreatureGeometry } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import type { BodyPlanId } from './CreatureTypes';

const plans: BodyPlanId[] = ['biped', 'hexapod', 'serpentine'];
const definition = (seed: number, plan: BodyPlanId) => {
	const species = generateSpecies(seed, plan);
	return { species, individual: generateIndividual(species, seed + 700) };
};
describe('additional body-plan acceptance', () => {
	it('attaches serpentine back adornments and tail tips to its own axial grammar', () => {
		const d = definition(5, 'serpentine');
		d.species.anatomy.features = ['eyes', 'spikes', 'fins', 'frills', 'plates', 'tail-tip'];
		const c = compileCreatureGeometry(d);
		for (const kind of d.species.anatomy.features) {
			const feature = c.skeleton.features.find((f) => f.kind === kind);
			expect(feature).toBeDefined();
			expect(c.skeleton.joints.some((j) => j.id === feature!.hostJointId)).toBe(true);
		}
	});
	for (const plan of plans) {
		it(`${plan}: 25 independent anatomies compile with valid geometry and lower-detail LOD`, () => {
			for (let seed = 0; seed < 25; seed++) {
				const d = definition(seed, plan),
					c = compileCreatureGeometry(d),
					low = compileCreatureGeometry(d, 1),
					g = c.geometry;
				expect(c.skeleton.limbs.filter((l) => !l.arm)).toHaveLength(
					plan === 'biped' ? 2 : plan === 'hexapod' ? 6 : 0
				);
				expect(c.skeleton.limbs.filter((l) => l.arm)).toHaveLength(plan === 'biped' ? 2 : 0);
				expect(g.indices.length / 3).toBeLessThan(8000);
				expect(low.geometry.indices.length).toBeLessThan(g.indices.length * 0.6);
				expect(g.positions.every(Number.isFinite)).toBe(true);
				expect(g.normals.every(Number.isFinite)).toBe(true);
				expect(g.indices.every((v) => v < g.positions.length / 3)).toBe(true);
				expect(g.skinIndices.every((v) => v < c.skeleton.joints.length)).toBe(true);
				for (let n = 0; n < g.skinWeights.length; n += 4)
					expect(g.skinWeights.slice(n, n + 4).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
				expect(c.bounds.min.y).toBe(0);
				expect(c.bounds.height).toBeGreaterThan(0);
				expect(compileCreatureGeometry(JSON.parse(JSON.stringify(d))).fingerprint).toBe(
					c.fingerprint
				);
			}
		}, 30000);
		it(`${plan}: moving cycles loop and preserve bone lengths on slopes`, () => {
			for (let seed = 0; seed < 25; seed++) {
				const c = compileCreature(definition(seed, plan));
				const period = 1 / c.compilation.definition.species.locomotion.gait.walkFrequency;
				const intent = { velocity: { x: 0, y: 0, z: 1 }, heading: 0, gait: 'walk' as const };
				const pose = () =>
					c.skeleton.bones.flatMap((b) => [...b.position.toArray(), ...b.quaternion.toArray()]);
				const surface = (x: number, z: number) => x * 0.015 + z * 0.01;
				animateCreature(c, intent, 0.1, 1 / 60, surface);
				const first = pose();
				animateCreature(c, intent, 0.1 + period, 1 / 60, surface);
				pose().forEach((value, n) => expect(value).toBeCloseTo(first[n], 6));
				for (let frame = 0; frame < 8; frame++) {
					animateCreature(c, { ...intent, heading: frame * 0.1 }, frame / 8, 1 / 8, surface);
					expect(pose().every(Number.isFinite)).toBe(true);
					const mesh = c.skinnedMeshes[0];
					const vertices = mesh.geometry.getAttribute('position');
					for (let vertex = 0; vertex < vertices.count; vertex += 31) {
						const deformed = mesh.applyBoneTransform(
							vertex,
							new Vector3().fromBufferAttribute(vertices, vertex)
						);
						expect(deformed.toArray().every(Number.isFinite)).toBe(true);
					}
					for (const limb of c.compilation.skeleton.limbs) {
						const hip = c.bonesById.get(limb.hipId)!.getWorldPosition(new Vector3());
						const knee = c.bonesById.get(limb.kneeId)!.getWorldPosition(new Vector3());
						const foot = c.bonesById.get(limb.footId)!.getWorldPosition(new Vector3());
						expect(hip.distanceTo(knee)).toBeCloseTo(limb.upperLength, 6);
						expect(knee.distanceTo(foot)).toBeCloseTo(limb.lowerLength, 6);
					}
				}
				c.dispose();
			}
		}, 30000);
	}
});
