import { describe, expect, it } from 'vitest';
import { compileCreature, compileCreatureGeometry } from './CreatureCompiler';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { jointWorldPositions } from './SkeletonGenerator';
const definition = (seed: number) => {
	const species = generateSpecies(seed, 'quadruped');
	return { species, individual: generateIndividual(species, seed + 900) };
};
describe('original quadruped compiler', () => {
	it('compiles 100 deterministic seeds with finite indexed geometry and valid semantic skinning', () => {
		const fingerprints = new Set<string>();
		for (let seed = 0; seed < 100; seed++) {
			const c = compileCreatureGeometry(definition(seed)),
				g = c.geometry,
				n = g.positions.length / 3;
			fingerprints.add(c.fingerprint);
			expect(c.skeleton.limbs).toHaveLength(4);
			expect(c.bounds.height).toBeGreaterThan(0);
			expect(c.bounds.min.y).toBe(0);
			expect(g.indices.length / 3).toBeLessThan(8000);
			expect(g.indices.length / 3).toBeGreaterThan(1000);
			for (const values of [g.positions, g.normals, g.skinWeights, g.colors])
				expect(values.every(Number.isFinite)).toBe(true);
			expect(g.indices.every((index) => index < n)).toBe(true);
			for (let v = 0; v < n; v++) {
				const weights = g.skinWeights.subarray(v * 4, v * 4 + 4);
				expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
				expect(weights.every((w) => w >= 0 && w <= 1)).toBe(true);
			}
			expect(g.skinIndices.every((index) => index < c.skeleton.joints.length)).toBe(true);
			const world = jointWorldPositions(c.skeleton);
			for (const limb of c.skeleton.limbs) {
				for (const axis of ['x', 'y', 'z'] as const)
					expect(world.get(limb.footId)![axis]).toBeCloseTo(limb.restFoot[axis], 10);
				expect(c.skeleton.joints.find((j) => j.id === limb.kneeId)?.parentId).toBe(limb.hipId);
			}
		}
		expect(fingerprints.size).toBe(100);
	}, 30000);
	it('reproduces geometry exactly from a serialized recipe, with distinct lower detail', () => {
		const d = definition(72),
			a = compileCreatureGeometry(d),
			b = compileCreatureGeometry(JSON.parse(JSON.stringify(d))),
			low = compileCreatureGeometry(d, 1);
		expect(a.fingerprint).toBe(b.fingerprint);
		expect(low.geometry.indices.length).toBeLessThan(a.geometry.indices.length * 0.55);
		expect(a.fingerprint).toMatchInlineSnapshot(`"v1-24-2588-5112-fb816f2e"`);
	});
	it('builds real skinning, shares compatible materials, and disposes idempotently', () => {
		const a = compileCreature(definition(7)),
			b = compileCreature(definition(7));
		expect(a.skinnedMeshes[0].isSkinnedMesh).toBe(true);
		expect(a.skeleton.bones.length).toBe(a.compilation.skeleton.joints.length);
		expect(a.skinnedMeshes[0].material).toBe(b.skinnedMeshes[0].material);
		let disposed = 0;
		a.skinnedMeshes[0].geometry.addEventListener('dispose', () => disposed++);
		a.dispose();
		a.dispose();
		expect(disposed).toBe(1);
		b.dispose();
	});
	it('mirrors quadruped limb chains around the sagittal plane', () => {
		const c = compileCreatureGeometry(definition(4)),
			world = jointWorldPositions(c.skeleton);
		for (const pair of [0, 1])
			for (const joint of ['hip', 'knee', 'foot']) {
				const a = world.get(`limb-${pair}--1-${joint}`)!,
					b = world.get(`limb-${pair}-1-${joint}`)!;
				expect(a.x).toBeCloseTo(-b.x);
				expect(a.y).toBe(b.y);
				expect(a.z).toBe(b.z);
			}
	});
});
