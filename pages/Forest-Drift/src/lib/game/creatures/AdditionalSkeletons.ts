import { Vector3 } from 'three';
import {
	TORSO_PROFILES,
	buildLimbPair,
	buildNeckAndHead,
	buildTail,
	hostJointAt,
	lerp,
	section,
	type RigBuilder
} from './CreatureAnatomy';
import { sectionAt } from './SweptBodyVolume';
import type { CrossSection } from './CreatureTypes';

/** Separate upright, three-pair and limbless grammars; the quadruped is not mutated into these plans. */
export function generateAdditionalSkeleton(b: RigBuilder) {
	const plan = b.definition.species.bodyPlan.id;
	b.add('root', undefined, 'root', { x: 0, y: 0, z: 0 });
	if (plan === 'biped') buildBiped(b);
	else if (plan === 'hexapod') buildHexapod(b);
	else if (plan === 'serpentine') buildSerpentine(b);
	else throw new Error('Unsupported creature body plan');
}

/** Rounded pelvis bowl, upright chest, legs rooted under the pelvis, relaxed arms from the shoulders. */
function buildBiped(b: RigBuilder) {
	const { form, dims, definition } = b,
		gait = definition.species.locomotion.gait;
	const { length, width: W, depth: D, legs, head: h } = dims;
	const profile = TORSO_PROFILES[form.torsoProfile];
	const r = dims.limbRadius,
		footY = r * 0.85 * form.footScale;
	const pelvisY = footY + legs + D * 0.12,
		// Upright torso height comes from body length but stays within a readable range of its depth.
		torso = Math.min(Math.max(length * 0.6, D * 1.1), D * 1.9);
	b.add('pelvis', 'root', 'pelvis', { x: 0, y: pelvisY, z: 0 });
	b.add('spine', 'pelvis', 'spine', { x: 0, y: pelvisY + torso * 0.48, z: -D * 0.05 });
	b.add('chest', 'spine', 'chest', { x: 0, y: pelvisY + torso * 0.9, z: D * 0.02 });
	const hw = W * 0.55,
		hd = D * 0.5;
	const hip = Math.sqrt(form.hipMass),
		shoulder = Math.sqrt(form.shoulderMass);
	const ids = ['pelvis', 'pelvis', 'spine', 'chest', 'chest'];
	const chest = b.at('chest');
	// Vertical sweep: radiusX is width, radiusY the back (upper) / belly (lower) depth.
	b.volume({
		id: 'torso',
		jointIds: ids,
		// Straight vertical sweep axis; posture lives in the joints, silhouette in the sections.
		pointOffsets: b.offsets(
			ids,
			[
				pelvisY - torso * 0.16,
				pelvisY,
				pelvisY + torso * 0.48,
				chest.y,
				chest.y + torso * 0.12
			].map((y) => ({ x: 0, y, z: 0 }))
		),
		sections: [
			section(0, hw * 0.72 * profile.hipW * hip, hd * 0.72),
			section(0.25, hw * profile.hipW * hip, hd * 0.92 * profile.hipD, {
				radiusYLower: hd * profile.hipD * (1 + profile.sag)
			}),
			section(0.5, hw * profile.waist * 0.9, hd * 0.82, {
				radiusYLower: hd * (0.9 * profile.belly + form.bellySag + profile.sag)
			}),
			section(
				0.75,
				hw * 0.88 * profile.chestW * shoulder,
				hd * profile.chestD * 0.92 * form.chestDepth,
				{
					radiusYLower: hd * profile.chestD * form.chestDepth
				}
			),
			section(1, hw * 0.6 * profile.chestW, hd * 0.6)
		],
		caps: { start: 'dome', end: 'dome' },
		part: 'torso',
		detail: 'major',
		segmentRings: [2, 3, 3, 2],
		skinBlend: 0.5
	});
	buildLimbPair(b, {
		pair: 0,
		hostVolumeId: 'torso',
		hostJointId: 'pelvis',
		// Low on the pelvis bowl: the root leaves down-and-out, so the hip mass reads as a thigh.
		t: lerp(0.13, 0.07, form.hipSpread),
		angle: 0,
		radius: r * 1.05,
		massKind: 'hip',
		// Upright hips read as a pelvis, not balls: smaller, thigh-shaped masses.
		massScale: form.hipMass * 0.7,
		phases: [gait.footPhaseOffsets[0] ?? 0, gait.footPhaseOffsets[1] ?? 0.5],
		place(pivot) {
			const foot = new Vector3(pivot.x + dims.stanceWidth * 0.06, footY, pivot.z + legs * 0.04);
			const knee = pivot.clone().lerp(foot, 0.52);
			knee.z += legs * 0.07;
			return { knee, foot };
		}
	});
	buildLimbPair(b, {
		pair: 1,
		hostVolumeId: 'torso',
		hostJointId: 'chest',
		t: 0.84,
		angle: 0.1,
		radius: r * 0.95,
		massKind: 'shoulder',
		massScale: form.shoulderMass * 0.85,
		phases: [0, 0.5],
		arm: true,
		place(pivot) {
			const arm = Math.min(Math.max(legs * 0.6, torso * 0.85), (pivot.y - footY) * 0.8);
			// Relaxed arms hang slightly away from the body so they read in silhouette.
			const knee = pivot.clone().add(new Vector3(arm * 0.2, -arm * 0.46, -arm * 0.04));
			const foot = knee.clone().add(new Vector3(arm * 0.1, -arm * 0.42, arm * 0.14));
			return { knee, foot };
		}
	});
	const nl = dims.neckLength;
	const neck = { x: 0, y: chest.y + torso * 0.12 + nl * 0.6, z: chest.z + D * 0.08 };
	buildNeckAndHead(b, {
		hostJointId: 'chest',
		hostVolumeId: 'torso',
		neckBase: { x: 0, y: chest.y + torso * 0.04, z: chest.z + D * 0.04 },
		neck,
		head: { x: 0, y: neck.y + nl * 0.4 + h * 0.32, z: neck.z + h * 0.12 },
		pitch: 0.05
	});
	const pelvis = b.at('pelvis');
	buildTail(b, {
		hostJointId: 'pelvis',
		hostVolumeId: 'torso',
		root: { x: 0, y: pelvis.y - torso * 0.04, z: pelvis.z - hd * 0.4 },
		first: { x: 0, y: pelvis.y - torso * 0.06, z: pelvis.z - hd * profile.hipD * 1.02 },
		direction: new Vector3(0, -0.35, -1).normalize()
	});
}

/** Rounded abdomen, pinched waist and thorax; six splayed limbs rooted along the thorax sides. */
function buildHexapod(b: RigBuilder) {
	const { form, dims } = b;
	const { length: L, width: W, depth: D, legs, head: h } = dims;
	const profile = TORSO_PROFILES[form.torsoProfile];
	// Six limbs crowd the silhouette: thinner than a quadruped's four.
	const r = dims.limbRadius * 0.78,
		footY = r * 0.85 * form.footScale;
	// Short legs under a big abdomen: raise the body so its underside clears the ground; the bind
	// pose then splays the legs further instead of burying the belly.
	const abdomenBelow = D * 0.5 * 1.05 * profile.hipD * (1 + form.bellySag) - D * 0.05;
	const y = Math.max(footY + legs * 0.85 + D * 0.1, abdomenBelow + legs * 0.25 + footY);
	b.add('pelvis', 'root', 'pelvis', { x: 0, y: y + D * 0.05, z: -L * 0.2 });
	b.add('spine', 'pelvis', 'spine', { x: 0, y: y + D * 0.02, z: L * 0.08 });
	b.add('chest', 'spine', 'chest', { x: 0, y, z: L * 0.3 });
	const hw = W * 0.5,
		hd = D * 0.5,
		hip = Math.sqrt(form.hipMass);
	const pinch = lerp(0.55, 0.9, Math.max(0, Math.min(1, (profile.waist - 0.8) / 0.3)));
	const ids = ['pelvis', 'pelvis', 'spine', 'chest', 'chest'];
	const pelvis = b.at('pelvis'),
		chest = b.at('chest');
	const rear = { x: 0, y: pelvis.y + D * 0.06, z: pelvis.z - L * 0.3 };
	b.volume({
		id: 'torso',
		jointIds: ids,
		pointOffsets: b.offsets(
			ids,
			[rear.z, pelvis.z, b.at('spine').z, chest.z, chest.z + L * 0.13].map((z) => ({
				x: 0,
				y: lerp(pelvis.y, chest.y, (z - pelvis.z) / (chest.z - pelvis.z)),
				z
			}))
		),
		sections: [
			section(0, hw * 0.48, hd * 0.48),
			section(0.2, hw * 1.05 * profile.hipW * hip, hd * 1.05 * profile.hipD, {
				radiusYLower: hd * 1.05 * profile.hipD * (1 + form.bellySag)
			}),
			section(0.4, hw * pinch, hd * pinch),
			section(0.6, hw * 0.86 * profile.chestW, hd * 0.8),
			section(0.78, hw * 0.82 * profile.chestW, hd * 0.78),
			section(1, hw * 0.55, hd * 0.55)
		],
		caps: { start: 'dome', end: 'dome' },
		part: 'torso',
		detail: 'major',
		segmentRings: [2, 3, 3, 2],
		skinBlend: 0.5
	});
	const volume = b.rig.volumes.find((v) => v.id === 'torso')!;
	const offsets = b.definition.species.locomotion.gait.footPhaseOffsets;
	// Six roots stay small: mass scales with limb count so the thorax does not read as a row of balls.
	for (const [pair, t] of [
		[0, 0.8],
		[1, 0.66],
		[2, 0.52]
	] as const)
		buildLimbPair(b, {
			pair,
			hostVolumeId: 'torso',
			hostJointId: hostJointAt(volume, t),
			t,
			angle: -(Math.PI / 2) * (1 - (pair === 2 ? form.hipSpread : form.shoulderSpread)),
			radius: r,
			massKind: 'limb-root',
			detail: 'minor',
			massScale: 0.4 * (pair === 2 ? form.hipMass : form.shoulderMass),
			phases: [offsets[pair * 2] ?? 0, offsets[pair * 2 + 1] ?? 0.5],
			place(pivot) {
				const spread = 1 - pair;
				const knee = pivot.clone().add(new Vector3(legs * 0.42, legs * 0.1, spread * legs * 0.12));
				const foot = new Vector3(
					pivot.x + legs * 0.72 + dims.stanceWidth * 0.08,
					footY,
					pivot.z + spread * legs * 0.3
				);
				return { knee, foot };
			}
		});
	const nl = dims.neckLength;
	const neck = { x: 0, y: y + D * 0.12, z: chest.z + L * 0.16 + nl * 0.35 };
	buildNeckAndHead(b, {
		hostJointId: 'chest',
		hostVolumeId: 'torso',
		neckBase: { x: 0, y: chest.y + D * 0.05, z: chest.z + L * 0.08 },
		neck,
		head: { x: 0, y: neck.y + D * 0.06 + nl * 0.2, z: neck.z + nl * 0.45 + h * 0.28 },
		pitch: 0.18
	});
	const rearDome = (hw * 0.48 + hd * 0.48) * 0.5;
	buildTail(b, {
		hostJointId: 'pelvis',
		hostVolumeId: 'torso',
		root: { x: 0, y: rear.y + hd * 0.1, z: rear.z + L * 0.03 },
		first: { x: 0, y: rear.y + hd * 0.12, z: rear.z - rearDome * 0.85 },
		direction: new Vector3(0, 0, -1)
	});
}

/** One continuous tapered chain in a gentle S, flattened belly, enlarged head on a short neck. */
function buildSerpentine(b: RigBuilder) {
	const { dims, definition } = b;
	const { length: L, width: W, depth: D } = dims;
	const segments = Math.max(8, Math.min(24, definition.species.bodyPlan.spineSegments));
	// A serpent's body is its whole silhouette: thicker than a legged torso, never thinner than L/28.
	const hw = Math.max(W * 0.5 * 1.6, L / 22),
		hd = Math.max(D * 0.5 * 1.4, L / 24),
		chest = definition.species.proportions.chestScale;
	const sections: CrossSection[] = [
		section(0, hw * 0.08, hd * 0.08),
		section(0.14, hw * 0.3, hd * 0.3, { radiusYLower: hd * 0.26 }),
		section(0.46, hw * 0.5, hd * 0.5, { radiusYLower: hd * 0.4 }),
		section(0.8, hw * 0.52 * chest, hd * 0.5, { radiusYLower: hd * 0.42 }),
		section(0.94, hw * 0.42, hd * 0.42, { radiusYLower: hd * 0.38 }),
		section(1, hw * 0.4, hd * 0.4, { radiusYLower: hd * 0.36 })
	];
	const ids: string[] = [];
	for (let n = 0; n < segments; n++) {
		const t = n / (segments - 1);
		const profile = sectionAt(sections, t);
		ids.push(
			b.add(`spine-${n}`, n === 0 ? 'root' : `spine-${n - 1}`, 'spine', {
				x: Math.sin(t * Math.PI * 1.6 + 0.4) * L * 0.06 * (1 - t * 0.5),
				y: profile.ryl * 1.02 + Math.sin(t * Math.PI) * D * 0.04,
				z: (t - 0.5) * L
			})
		);
	}
	b.volume({
		id: 'serpentine-body',
		jointIds: ids,
		sections,
		caps: { start: 'dome', end: 'dome' },
		part: 'torso',
		detail: 'major',
		segmentRings: Array(segments - 1).fill(2),
		skinBlend: 0.5
	});
	const frontId = ids[ids.length - 1],
		front = b.at(frontId);
	const frontRadius = Math.min(hw, hd) * 0.4;
	// Enlarged head; the short neck continues the body instead of pinching between body and head.
	dims.head = Math.max(dims.head, Math.min(hw, hd) * 1.7);
	const h = dims.head,
		nl = Math.min(dims.neckLength, h * 0.6);
	// The enlarged head is carried raised, clear of the ground.
	const neck = {
		x: front.x,
		y: Math.max(front.y + h * 0.16, h * 0.42),
		z: front.z + nl * 0.35 + hd * 0.3
	};
	buildNeckAndHead(b, {
		hostJointId: frontId,
		hostVolumeId: 'serpentine-body',
		neckBase: { x: front.x, y: front.y, z: front.z - hw * 0.1 },
		neck,
		head: { x: neck.x, y: Math.max(neck.y + h * 0.12, h * 0.6), z: neck.z + nl * 0.55 + h * 0.3 },
		pitch: 0.12,
		neckRadius: frontRadius * 0.95
	});
}
