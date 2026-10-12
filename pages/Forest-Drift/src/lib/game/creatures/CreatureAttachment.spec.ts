import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { compileCreature, compileCreatureGeometry } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { jointWorldPositions } from './SkeletonGenerator';
import { deriveSpeciesForm, resolveSpeciesForm, validateSpeciesForm } from './CreatureForm';
import {
	ROOT_DEPTH_FLOOR,
	ROOT_EMBED_LIMIT,
	validateCreatureAnatomy
} from './CreatureAnatomyValidation';
import {
	CREATURE_LOD_QUALITY,
	appendEllipsoid,
	appendSweep,
	computeNormals,
	geometryAccumulator,
	jointBlendInfluence,
	sampleVolume,
	volumeDepth,
	volumePath
} from './SweptBodyVolume';
import type { BodyPlanId, CreatureDefinition, CreatureLod, SpeciesGenome } from './CreatureTypes';

const PLANS: BodyPlanId[] = ['quadruped', 'biped', 'hexapod', 'serpentine'];
const LEGGED: BodyPlanId[] = ['quadruped', 'biped', 'hexapod'];
const definition = (seed: number, plan: BodyPlanId): CreatureDefinition => {
	const species = generateSpecies(seed, plan);
	return { species, individual: generateIndividual(species, seed + 700) };
};
const sub = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
	new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
/** Proportion edits the way the Lab scale slider does them, plus independent axis stretches. */
function reshape(
	species: SpeciesGenome,
	changes: Partial<Record<keyof SpeciesGenome['proportions'], number>>
) {
	const s = structuredClone(species);
	for (const [k, v] of Object.entries(changes))
		s.proportions[k as keyof typeof s.proportions] *= v as number;
	return s;
}

describe('limb roots grow out of the body', () => {
	it('embeds every limb root inside its host, but never past half way to the axis (25 per plan)', () => {
		for (const plan of LEGGED)
			for (let seed = 0; seed < 25; seed++) {
				const c = compileCreatureGeometry(definition(seed, plan));
				const form = resolveSpeciesForm(c.definition.species);
				const attachments = c.skeleton.attachments!;
				expect(attachments).toHaveLength(c.skeleton.limbs.length);
				for (const a of attachments) {
					expect(a.penetration).toBeGreaterThan(0);
					expect(a.penetration).toBeLessThanOrEqual(a.rootRadius * form.limbRootPenetration + 1e-9);
					expect(a.rootDepth).toBeLessThan(ROOT_EMBED_LIMIT);
					expect(a.rootDepth).toBeGreaterThanOrEqual(ROOT_DEPTH_FLOOR);
					// Root lies along the inward normal from the surface point.
					const inward = sub(a.rootPoint, a.surfacePoint);
					expect(inward.length()).toBeCloseTo(a.penetration, 6);
					expect(inward.normalize().dot(new Vector3().copy(a.surfaceNormal))).toBeCloseTo(-1, 6);
				}
			}
	});
	it('builds unit outward attachment frames on the host surface', () => {
		for (const plan of LEGGED)
			for (let seed = 0; seed < 10; seed++) {
				const c = compileCreatureGeometry(definition(seed, plan));
				const world = jointWorldPositions(c.skeleton);
				for (const a of c.skeleton.attachments!) {
					const host = sampleVolume(
						c.skeleton.volumes.find((v) => v.id === a.hostVolumeId)!,
						world
					);
					const n = new Vector3().copy(a.surfaceNormal);
					expect(n.length()).toBeCloseTo(1, 6);
					expect(volumeDepth(host, a.surfacePoint)).toBeCloseTo(1, 1);
					// Stepping out along the normal leaves the body; stepping in enters it.
					const p = new Vector3().copy(a.surfacePoint);
					expect(
						volumeDepth(host, p.clone().addScaledVector(n, a.rootRadius * 0.5))
					).toBeGreaterThan(1);
					expect(volumeDepth(host, p.clone().addScaledVector(n, -a.rootRadius * 0.5))).toBeLessThan(
						1
					);
					// The limb sweep's first point is that embedded root.
					const limb = c.skeleton.volumes.find((v) => v.id === a.limbId)!;
					const first = volumePath(limb, world)[0];
					expect(sub(first, a.rootPoint).length()).toBeLessThan(1e-9);
				}
			}
	});
	it('sizes shoulder/hip masses from the limb, overlapping torso and limb, smaller on hexapods', () => {
		const ratio: Record<string, number[]> = {};
		for (const plan of LEGGED)
			for (let seed = 0; seed < 15; seed++) {
				const c = compileCreatureGeometry(definition(seed, plan));
				const world = jointWorldPositions(c.skeleton);
				for (const m of c.skeleton.masses!) {
					const limb = c.skeleton.volumes.find((v) => m.id.startsWith(v.id))!;
					const r = limb.sections[2].radiusX;
					expect(m.radii.every((radius) => Number.isFinite(radius) && radius > 0)).toBe(true);
					// Cross-section always covers the limb tube where it leaves the body.
					expect(m.radii[1]).toBeGreaterThan(r);
					expect(m.radii[2]).toBeGreaterThan(r);
					expect(Math.max(...m.radii)).toBeLessThan(c.bounds.height);
					const [a0, a1, a2] = m.axes.map((v) => new Vector3().copy(v));
					expect(a0.dot(a1)).toBeCloseTo(0, 6);
					expect(a0.dot(a2)).toBeCloseTo(0, 6);
					expect(a1.dot(a2)).toBeCloseTo(0, 6);
					const host = sampleVolume(
						c.skeleton.volumes.find((v) => v.part === 'torso')!,
						world
					);
					const inner = new Vector3().copy(m.centre).addScaledVector(a0, -m.radii[0] * 0.85);
					expect(volumeDepth(host, inner)).toBeLessThan(1);
					(ratio[plan] ??= []).push(Math.max(m.radii[1], m.radii[2]) / r);
				}
			}
		const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
		expect(mean(ratio.hexapod)).toBeLessThan(mean(ratio.quadruped));
		// Front shoulders and rear haunches are different shapes, not one copied volume.
		const c = compileCreatureGeometry(definition(3, 'quadruped'));
		const kinds = new Set(c.skeleton.masses!.map((m) => m.kind));
		expect(kinds).toEqual(new Set(['shoulder', 'hip']));
	});
	it('mirrors attachments, masses and roots exactly across the sagittal plane', () => {
		for (const plan of LEGGED) {
			const c = compileCreatureGeometry(definition(11, plan));
			const byId = new Map(c.skeleton.attachments!.map((a) => [a.limbId, a]));
			for (const limb of c.skeleton.limbs.filter((l) => l.side === 1)) {
				const right = byId.get(limb.id)!,
					left = byId.get(limb.id.replace(/-1$/, '--1'))!;
				for (const key of ['surfacePoint', 'rootPoint', 'surfaceNormal'] as const) {
					expect(left[key].x).toBe(-right[key].x);
					expect(left[key].y).toBe(right[key].y);
					expect(left[key].z).toBe(right[key].z);
				}
				expect(left.penetration).toBe(right.penetration);
				const mr = c.skeleton.masses!.find((m) => m.id === right.massId)!,
					ml = c.skeleton.masses!.find((m) => m.id === left.massId)!;
				expect(ml.radii).toEqual(mr.radii);
				expect(ml.centre.x).toBe(-mr.centre.x);
			}
		}
	});
	it('derives attachment positions from the torso across wide, narrow, deep, long, tiny and giant bodies', () => {
		const base = definition(21, 'quadruped');
		const variants: Partial<Record<keyof SpeciesGenome['proportions'], number>>[] = [
			{ bodyWidth: 1.6 },
			{ bodyWidth: 0.55 },
			{ bodyDepth: 1.7 },
			{ bodyLength: 1.8 },
			{ legLength: 0.45 },
			{ legLength: 1.8 },
			{ legThickness: 2.2 },
			{ legThickness: 0.5 }
		];
		const reference = compileCreatureGeometry(base).skeleton.attachments!;
		for (const change of variants) {
			const species = reshape(base.species, change);
			const c = compileCreatureGeometry({ species, individual: base.individual });
			expect(validateCreatureAnatomy(c)).toEqual([]);
			if (change.bodyWidth)
				expect(Math.abs(c.skeleton.attachments![0].surfacePoint.x)).toBeGreaterThan(
					change.bodyWidth > 1 ? Math.abs(reference[0].surfacePoint.x) : 0
				);
			if (change.bodyWidth && change.bodyWidth < 1)
				expect(Math.abs(c.skeleton.attachments![0].surfacePoint.x)).toBeLessThan(
					Math.abs(reference[0].surfacePoint.x)
				);
		}
		for (const factor of [0.05, 0.3, 4, 20]) {
			const species = reshape(
				base.species,
				Object.fromEntries(
					Object.keys(base.species.proportions)
						.filter((k) => !['chestScale', 'waistScale', 'frontLegRatio'].includes(k))
						.map((k) => [k, factor])
				)
			);
			const c = compileCreatureGeometry({ species, individual: base.individual });
			expect(validateCreatureAnatomy(c)).toEqual([]);
			// Attachment geometry scales with the animal rather than using fixed offsets.
			const ratio = c.skeleton.attachments![0].penetration / reference[0].penetration / factor;
			expect(ratio).toBeGreaterThan(0.8);
			expect(ratio).toBeLessThan(1.4);
		}
	});
	it('flags FLOATING_LIMB when roots are not embedded', () => {
		const d = definition(5, 'quadruped');
		const form = { ...deriveSpeciesForm(d.species), limbRootPenetration: 0 };
		const c = compileCreatureGeometry({ ...d, species: { ...d.species, form } });
		expect(validateCreatureAnatomy(c).some((i) => i.code === 'FLOATING_LIMB')).toBe(true);
	});
});

describe('skinning at limb roots', () => {
	it('normalises weights and blends torso → limb across the shoulder/hip transition', () => {
		for (const plan of LEGGED) {
			const c = compileCreatureGeometry(definition(8, plan));
			const g = c.geometry,
				ids = c.skeleton.joints.map((j) => j.id);
			for (let v = 0; v < g.skinWeights.length / 4; v++) {
				const w = g.skinWeights.subarray(v * 4, v * 4 + 4);
				expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
			}
			// Some vertices mix the host torso bone with a limb-root bone (no rigid cylinder).
			const hosts = new Set(c.skeleton.attachments!.map((a) => ids.indexOf(a.hostJointId)));
			const roots = new Set(c.skeleton.limbs.map((l) => ids.indexOf(l.hipId)));
			let blended = 0;
			for (let v = 0; v < g.skinWeights.length / 4; v++) {
				const bones = [0, 1, 2, 3].filter((k) => g.skinWeights[v * 4 + k] > 0.15);
				const set = bones.map((k) => g.skinIndices[v * 4 + k]);
				if (set.some((b) => hosts.has(b)) && set.some((b) => roots.has(b))) blended++;
			}
			expect(blended).toBeGreaterThan(c.skeleton.limbs.length * 8);
		}
	});
	it('keeps mid-segment vertices on their own bone and splits 50/50 at joints', () => {
		expect(jointBlendInfluence([3, 4, 5], 0.25, 0.3)).toEqual([[3, 1]]);
		const atJoint = new Map(jointBlendInfluence([3, 4, 5], 0.5, 0.3).map(([b, w]) => [b, w]));
		expect(atJoint.get(4)).toBeCloseTo(0.5);
		expect((atJoint.get(3) ?? 0) + (atJoint.get(5) ?? 0)).toBeCloseTo(0.5);
	});
	it('keeps the embedded root ring riding the host bone through walk, run, turn and look', () => {
		for (const plan of LEGGED) {
			const creature = compileCreature(definition(9, plan));
			const g = creature.compilation.geometry,
				mesh = creature.skinnedMeshes[0];
			const ids = creature.compilation.skeleton.joints.map((j) => j.id);
			const position = mesh.geometry.getAttribute('position');
			const hostIndices = new Set(
				creature.compilation.skeleton.attachments!.map((a) => ids.indexOf(a.hostJointId))
			);
			const rooted: number[] = [];
			for (let v = 0; v < position.count && rooted.length < 40; v++)
				if (
					hostIndices.has(g.skinIndices[v * 4]) &&
					g.skinWeights[v * 4] === 1 &&
					g.skinWeights[v * 4 + 1] === 0
				)
					rooted.push(v);
			const intents = [
				{ gait: 'walk' as const, heading: 0, angularVelocity: 0 },
				{ gait: 'run' as const, heading: 0.4, angularVelocity: 1.5 },
				{
					gait: 'idle' as const,
					heading: -0.3,
					angularVelocity: -1,
					lookTarget: { x: 3, y: 2, z: 4 }
				}
			];
			for (const [n, intent] of intents.entries())
				for (let frame = 0; frame < 6; frame++) {
					animateCreature(
						creature,
						{ velocity: { x: 0, y: 0, z: 1 }, ...intent },
						n + frame * 0.17,
						1 / 30,
						() => 0
					);
					for (const v of rooted) {
						const bone = creature.skeleton.bones[g.skinIndices[v * 4]];
						const expected = new Vector3()
							.fromBufferAttribute(position, v)
							.applyMatrix4(creature.skeleton.boneInverses[g.skinIndices[v * 4]])
							.applyMatrix4(bone.matrixWorld)
							// Attached bind mode: skinned results are in the mesh's local frame.
							.applyMatrix4(mesh.bindMatrixInverse);
						const deformed = mesh.applyBoneTransform(
							v,
							new Vector3().fromBufferAttribute(position, v)
						);
						expect(deformed.distanceTo(expected)).toBeLessThan(
							1e-6 * Math.max(1, creature.compilation.bounds.height)
						);
					}
				}
			creature.dispose();
		}
	});
});

describe('neck, head, tail and feature roots', () => {
	it('embeds necks in torso and head, tails in the rump, features in their hosts (100 per plan)', () => {
		for (const plan of PLANS)
			for (let seed = 0; seed < 100; seed++) {
				const c = compileCreatureGeometry(definition(seed, plan));
				expect(validateCreatureAnatomy(c)).toEqual([]);
				const world = jointWorldPositions(c.skeleton);
				const neck = c.skeleton.volumes.find((v) => v.id === 'neck')!;
				const torso = c.skeleton.volumes.find((v) => v.part === 'torso')!;
				const path = volumePath(neck, world);
				expect(volumeDepth(sampleVolume(torso, world), path[0])).toBeLessThan(1);
				expect(
					volumeDepth(
						sampleVolume(
							c.skeleton.volumes.find((v) => v.id === 'head')!,
							world
						),
						path.at(-1)!
					)
				).toBeLessThan(1);
				const tail = c.skeleton.volumes.find((v) => v.id === 'tail');
				if (tail)
					expect(volumeDepth(sampleVolume(torso, world), volumePath(tail, world)[0])).toBeLessThan(
						1
					);
				// Every hosted feature records an embed depth below its surface point.
				for (const f of c.skeleton.features.filter((f) => f.hostVolumeId && f.surfacePoint))
					expect(f.embed!).toBeGreaterThan(0);
			}
	}, 60000);
	it('places eyes symmetrically from the face frame, embedded but bulging', () => {
		for (const plan of PLANS) {
			const c = compileCreatureGeometry(definition(17, plan));
			const face = c.skeleton.face!;
			const f = new Vector3().copy(face.forward),
				u = new Vector3().copy(face.up),
				r = new Vector3().copy(face.right);
			expect(f.dot(u)).toBeCloseTo(0, 6);
			expect(r.dot(f)).toBeCloseTo(0, 6);
			const eyes = c.skeleton.features.filter((x) => x.kind === 'eyes');
			expect(eyes).toHaveLength(2);
			const [a, b] = eyes.map((e) => new Vector3().copy(e.offset));
			expect(a.x).toBeCloseTo(-b.x, 6);
			expect(a.y).toBeCloseTo(b.y, 6);
			for (const e of eyes) expect(e.embed!).toBeLessThan(e.scale.x);
		}
	});
});

describe('geometry quality, determinism and LOD', () => {
	it('produces finite, normalised geometry, normals and bounds at every LOD', () => {
		for (const plan of PLANS)
			for (let seed = 0; seed < 12; seed++)
				for (const lod of [0, 1, 2] as CreatureLod[]) {
					const c = compileCreatureGeometry(definition(seed, plan), lod),
						g = c.geometry;
					for (const array of [g.positions, g.normals, g.colors, g.surface, g.uvs])
						expect(array.every(Number.isFinite)).toBe(true);
					for (let n = 0; n < g.normals.length; n += 3)
						expect(Math.hypot(g.normals[n], g.normals[n + 1], g.normals[n + 2])).toBeCloseTo(1, 4);
					expect(c.bounds.min.y).toBe(0);
					expect(Object.values(c.bounds.max).every(Number.isFinite)).toBe(true);
				}
	});
	it('points sweep and ellipsoid normals outward', () => {
		const out = geometryAccumulator();
		appendSweep(
			out,
			{
				id: 't',
				jointIds: [],
				sections: [
					{ t: 0, radiusX: 1, radiusY: 0.6 },
					{ t: 1, radiusX: 0.5, radiusY: 0.4 }
				],
				caps: { start: 'dome', end: 'dome' }
			},
			[
				{ x: 0, y: 0, z: -2 },
				{ x: 0, y: 0, z: 0 },
				{ x: 0, y: 0, z: 2 }
			],
			[0, 0, 0],
			CREATURE_LOD_QUALITY[0],
			{ region: 0 }
		);
		appendEllipsoid(out, {
			centre: new Vector3(5, 0, 0),
			axes: [new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)],
			radii: [1, 0.5, 0.7],
			region: 0,
			skin: () => [[0, 1]],
			rings: 6,
			sides: 8
		});
		const normals = computeNormals(out.positions, out.indices);
		let outward = 0;
		const count = out.positions.length / 3;
		for (let v = 0; v < count; v++) {
			const p = new Vector3(
				out.positions[v * 3],
				out.positions[v * 3 + 1],
				out.positions[v * 3 + 2]
			);
			const centre =
				p.x > 2.5 ? new Vector3(5, 0, 0) : new Vector3(0, 0, Math.max(-2, Math.min(2, p.z)));
			if (
				new Vector3(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]).dot(p.sub(centre)) > 0
			)
				outward++;
		}
		expect(outward / count).toBeGreaterThan(0.97);
	});
	it('is deterministic: the same (serialised) genome gives the same creature', () => {
		for (const plan of PLANS) {
			const d = definition(33, plan);
			const a = compileCreatureGeometry(d),
				b = compileCreatureGeometry(JSON.parse(JSON.stringify(d)));
			expect(b.fingerprint).toBe(a.fingerprint);
			expect(JSON.stringify(b.skeleton)).toBe(JSON.stringify(a.skeleton));
		}
	});
	it('derives forms identically for saved recipes that predate them', () => {
		for (const plan of PLANS)
			for (let seed = 0; seed < 20; seed++) {
				const species = generateSpecies(seed, plan);
				expect(validateSpeciesForm(species.form)).toBeNull();
				const legacy = { ...species };
				delete legacy.form;
				expect(deriveSpeciesForm(legacy)).toEqual(species.form);
				const individual = generateIndividual(species, 1);
				expect(compileCreatureGeometry({ species: legacy, individual }).fingerprint).toBe(
					compileCreatureGeometry({ species, individual }).fingerprint
				);
			}
	});
	it('keeps identity across LODs: same skeleton, proportions within a few percent, fewer triangles', () => {
		for (const plan of PLANS)
			for (let seed = 0; seed < 10; seed++) {
				const d = definition(seed, plan);
				const [l0, l1, l2] = ([0, 1, 2] as CreatureLod[]).map((lod) =>
					compileCreatureGeometry(d, lod)
				);
				for (const low of [l1, l2]) {
					expect(low.skeleton.joints.map((j) => j.id)).toEqual(l0.skeleton.joints.map((j) => j.id));
					expect(low.skeleton.attachments).toEqual(l0.skeleton.attachments);
					const size = (c: typeof l0) => [
						c.bounds.max.x - c.bounds.min.x,
						c.bounds.max.z - c.bounds.min.z
					];
					size(low).forEach((v, n) => expect(Math.abs(v / size(l0)[n] - 1)).toBeLessThan(0.12));
					expect(Math.abs(low.bounds.height / l0.bounds.height - 1)).toBeLessThan(0.12);
				}
				expect(l1.geometry.indices.length).toBeLessThan(l0.geometry.indices.length * 0.62);
				expect(l2.geometry.indices.length).toBeLessThan(l1.geometry.indices.length * 0.7);
			}
	});
	it('stays within triangle budgets (LOD0 ≤ 5k, LOD1 ≤ 2k, LOD2 ≤ 1k)', () => {
		for (const plan of PLANS)
			for (let seed = 0; seed < 25; seed++) {
				const d = definition(seed, plan);
				const tris = ([0, 1, 2] as CreatureLod[]).map(
					(lod) => compileCreatureGeometry(d, lod).geometry.indices.length / 3
				);
				expect(tris[0]).toBeLessThanOrEqual(5000);
				expect(tris[1]).toBeLessThanOrEqual(2000);
				expect(tris[2]).toBeLessThanOrEqual(1000);
			}
	});
});
