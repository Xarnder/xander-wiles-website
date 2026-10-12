import { Vector3 } from 'three';
import { generateAdditionalSkeleton } from './AdditionalSkeletons';
import type { CreatureDefinition, ProceduralSkeletonDefinition, Vec3 } from './CreatureTypes';
import {
	RigBuilder,
	TORSO_PROFILES,
	buildLimbPair,
	buildNeckAndHead,
	buildTail,
	lerp,
	section
} from './CreatureAnatomy';
import { placeFeatures } from './FeatureGenerator';

export function jointWorldPositions(skeleton: ProceduralSkeletonDefinition): Map<string, Vec3> {
	const out = new Map<string, Vec3>();
	for (const joint of skeleton.joints) {
		const p = joint.parentId ? out.get(joint.parentId) : { x: 0, y: 0, z: 0 };
		if (!p) throw new Error(`Missing or unordered parent for ${joint.id}`);
		out.set(joint.id, {
			x: p.x + joint.localPosition.x,
			y: p.y + joint.localPosition.y,
			z: p.z + joint.localPosition.z
		});
	}
	return out;
}

/**
 * Logical skeleton + procedural volumes + attachment masses + placed features for one recipe.
 * Anatomy is LOD-independent; LOD only changes how densely the compiler tessellates it.
 */
export function generateSkeleton(definition: CreatureDefinition): ProceduralSkeletonDefinition {
	if (definition.species.generatorVersion !== 1)
		throw new Error('Unsupported creature generator version');
	const b = new RigBuilder(definition);
	if (definition.species.bodyPlan.id === 'quadruped') buildQuadruped(b);
	else generateAdditionalSkeleton(b);
	placeFeatures(b);
	return b.rig;
}

/**
 * Torso as rump → pelvis/haunch → waist → chest → neck base, swept through pelvis, spine and chest.
 * Fore limbs grow from the chest region, hind limbs from the haunch — never from the torso's ends.
 */
function buildQuadruped(b: RigBuilder) {
	const { form, dims, definition } = b,
		p = definition.species.proportions,
		gait = definition.species.locomotion.gait;
	const { length: L, width: W, depth: D, legs, head: h } = dims;
	const profile = TORSO_PROFILES[form.torsoProfile];
	const r = dims.limbRadius;
	const footY = r * 0.85 * form.footScale;
	const bodyY = footY + legs + D * 0.12;
	b.add('root', undefined, 'root', { x: 0, y: 0, z: 0 });
	b.add('pelvis', 'root', 'pelvis', { x: 0, y: bodyY + D * 0.02, z: -L * 0.3 });
	b.add('spine', 'pelvis', 'spine', { x: 0, y: bodyY + D * 0.05, z: 0 });
	b.add('chest', 'spine', 'chest', {
		x: 0,
		y: bodyY + legs * (p.frontLegRatio - 1) * 0.35,
		z: L * 0.28
	});
	const hw = W * 0.5,
		hd = D * 0.5;
	const hip = Math.sqrt(form.hipMass),
		shoulder = Math.sqrt(form.shoulderMass);
	const waist = profile.waist * lerp(1, p.waistScale, 0.5);
	const chestW = profile.chestW * p.chestScale * Math.sqrt(shoulder);
	const ids = ['pelvis', 'pelvis', 'spine', 'chest', 'chest'];
	const pelvis = b.at('pelvis'),
		chest = b.at('chest');
	const rump = { x: 0, y: pelvis.y, z: pelvis.z - L * 0.14 };
	const line = (z: number) => ({
		x: 0,
		y: lerp(pelvis.y, chest.y, (z - pelvis.z) / (chest.z - pelvis.z)),
		z
	});
	b.volume({
		id: 'torso',
		jointIds: ids,
		// A straight sweep axis: on thick bodies a curved path folds the rings over each other, so the
		// back line and chest drop are shaped with section offsets instead.
		pointOffsets: b.offsets(
			ids,
			[rump.z, pelvis.z, b.at('spine').z, chest.z, chest.z + L * 0.13].map(line)
		),
		sections: [
			section(0, hw * 0.5 * profile.hipW * hip, hd * 0.52 * profile.hipD),
			section(0.12, hw * 0.88 * profile.hipW * hip, hd * 0.9 * profile.hipD, { offsetY: D * 0.02 }),
			section(0.27, hw * profile.hipW * hip, hd * profile.hipD, { offsetY: D * 0.03 }),
			section(0.5, hw * waist, hd * 0.9, {
				offsetY: D * 0.03,
				radiusYLower: hd * 0.92 * profile.belly * (1 + form.bellySag + profile.sag)
			}),
			section(0.73, hw * chestW, hd * profile.chestD * form.chestDepth, {
				radiusYLower: hd * profile.chestD * form.chestDepth * 1.1,
				offsetY: -D * 0.02
			}),
			section(0.88, hw * 0.86 * chestW, hd * 0.86 * profile.chestD, { offsetY: D * 0.01 }),
			section(1, hw * 0.5 * chestW, hd * 0.55, { offsetY: D * 0.08 })
		],
		caps: { start: 'dome', end: 'dome' },
		part: 'torso',
		detail: 'major',
		segmentRings: [2, 3, 3, 2],
		skinBlend: 0.5
	});
	const angle = (spread: number) => -(Math.PI / 2) * (1 - spread);
	const phases = (pair: number): [number, number] => [
		gait.footPhaseOffsets[pair * 2] ?? 0,
		gait.footPhaseOffsets[pair * 2 + 1] ?? 0.5
	];
	// Fore limb: upper limb slightly back/down, forearm returning under the shoulder.
	buildLimbPair(b, {
		pair: 0,
		hostVolumeId: 'torso',
		hostJointId: 'chest',
		t: 0.75,
		angle: angle(form.shoulderSpread),
		radius: r,
		massKind: 'shoulder',
		massScale: form.shoulderMass,
		phases: phases(0),
		place(pivot) {
			const foot = new Vector3(
				pivot.x * 0.9 + dims.stanceWidth * 0.05,
				footY,
				pivot.z + legs * 0.04
			);
			const knee = pivot.clone().lerp(foot, 0.5);
			knee.z -= legs * 0.09;
			return { knee, foot };
		}
	});
	// Hind limb: thigh forward/down from the haunch, hock back to the support point.
	buildLimbPair(b, {
		pair: 1,
		hostVolumeId: 'torso',
		hostJointId: 'pelvis',
		t: 0.25,
		angle: angle(form.hipSpread),
		radius: r * 1.06,
		massKind: 'hip',
		massScale: form.hipMass,
		phases: phases(1),
		place(pivot) {
			const foot = new Vector3(
				pivot.x * 0.92 + dims.stanceWidth * 0.05,
				footY,
				pivot.z - legs * 0.02
			);
			const knee = pivot.clone().lerp(foot, 0.48);
			knee.z += legs * 0.13;
			return { knee, foot };
		}
	});
	const nl = dims.neckLength;
	const neck = {
		x: 0,
		y: chest.y + D * 0.3 + nl * 0.55,
		z: chest.z + L * 0.12 + nl * (0.38 + 0.25 * form.neckCurve)
	};
	buildNeckAndHead(b, {
		hostJointId: 'chest',
		hostVolumeId: 'torso',
		neckBase: { x: 0, y: chest.y + D * 0.16, z: chest.z + L * 0.08 },
		neck,
		head: { x: 0, y: neck.y + nl * 0.32 + h * 0.1, z: neck.z + h * 0.32 + nl * 0.12 },
		pitch: 0.15
	});
	const rumpRy = hd * 0.52 * profile.hipD,
		rumpDome = (hw * 0.5 * profile.hipW * hip + rumpRy) * 0.5;
	buildTail(b, {
		hostJointId: 'pelvis',
		hostVolumeId: 'torso',
		root: { x: 0, y: rump.y + rumpRy * 0.3, z: rump.z + L * 0.02 },
		first: { x: 0, y: rump.y + rumpRy * 0.38, z: rump.z - rumpDome * 0.8 },
		direction: new Vector3(0, 0, -1)
	});
}
