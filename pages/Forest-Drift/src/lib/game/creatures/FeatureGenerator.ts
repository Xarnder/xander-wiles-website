import { Vector3 } from 'three';
import type {
	BodyVolumeDefinition,
	FeatureAttachment,
	FeatureShape,
	ProceduralSkeletonDefinition,
	Vec3
} from './CreatureTypes';
import {
	faceSurface,
	hostJointAt,
	hostSkinAt,
	lerp,
	v3,
	vec,
	type RigBuilder
} from './CreatureAnatomy';
import {
	appendEllipsoid,
	appendSweep,
	regionIndex,
	surfaceAt,
	type CreatureLodQuality,
	type GeometryAccumulator,
	type SkinInfluence
} from './SweptBodyVolume';

/**
 * Feature placement and geometry. Every adornment has a base embedded below its host surface, a
 * growth direction, a width axis and an optional cheap bend — so ears, horns, fins and plates are
 * drawn from one shape vocabulary and never float on (or merely touch) the body.
 */

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface ShapeProfile {
	/** [t, width fraction] from embedded base to tip. */
	width: [number, number][];
	/** Round cross-section (horns, spikes) instead of a flat blade. */
	round?: boolean;
	tipDome?: boolean;
	/** Minimum thickness as a fraction of the local width (keeps tips from collapsing). */
	thicknessFloor?: number;
}
export const FEATURE_SHAPES: Record<FeatureShape | 'antenna', ShapeProfile> = {
	leaf: {
		width: [
			[0, 0.4],
			[0.18, 0.78],
			[0.42, 1],
			[0.76, 0.62],
			[1, 0.03]
		]
	},
	petal: {
		width: [
			[0, 0.42],
			[0.3, 0.86],
			[0.66, 1],
			[0.9, 0.78],
			[1, 0.52]
		],
		tipDome: true
	},
	'rounded-ear': {
		width: [
			[0, 0.82],
			[0.3, 1],
			[0.7, 0.86],
			[1, 0.52]
		],
		tipDome: true
	},
	spike: {
		width: [
			[0, 1],
			[0.5, 0.55],
			[1, 0.03]
		],
		round: true
	},
	horn: {
		width: [
			[0, 1],
			[0.3, 0.84],
			[0.7, 0.46],
			[1, 0.05]
		],
		round: true
	},
	fin: {
		width: [
			[0, 1],
			[0.45, 0.72],
			[1, 0.08]
		]
	},
	plate: {
		width: [
			[0, 0.58],
			[0.3, 0.96],
			[0.62, 0.86],
			[0.88, 0.5],
			[1, 0.3]
		],
		tipDome: true
	},
	diamond: {
		width: [
			[0, 0.32],
			[0.46, 1],
			[1, 0.03]
		]
	},
	antenna: {
		width: [
			[0, 1],
			[1, 0.62]
		],
		round: true
	}
};

const record = (
	b: RigBuilder,
	f: Omit<FeatureAttachment, 'offset'> & { base: Vector3 }
): FeatureAttachment => {
	const { base, ...rest } = f;
	const feature: FeatureAttachment = { ...rest, offset: sub(vec(base), b.at(f.hostJointId)) };
	b.rig.features.push(feature);
	return feature;
};
const perpendicular = (axis: Vector3, hint: Vector3) => {
	const out = hint.clone().addScaledVector(axis, -hint.dot(axis));
	if (out.lengthSq() < 1e-8) out.set(0, 1, 0).addScaledVector(axis, -axis.y);
	if (out.lengthSq() < 1e-8) out.set(1, 0, 0).addScaledVector(axis, -axis.x);
	return out.normalize();
};

/** Places every feature the species lists, plus feet, hands and nose derived from anatomy. */
export function placeFeatures(b: RigBuilder) {
	const { definition, form, dims, rig } = b,
		s = definition.species,
		i = definition.individual;
	const h = dims.head,
		scale = s.anatomy.featureScale * i.featureVariation.scale;
	const asym = i.featureVariation.asymmetry;
	const kinds = new Set(s.anatomy.features);
	const serpent = s.bodyPlan.id === 'serpentine';
	const face = rig.face;
	if (face && kinds.has('eyes')) {
		const er = h * Math.min(0.19, 0.12 * dims.eyeScale);
		for (const side of [-1, 1] as const) {
			const hit = faceSurface(b, side * form.eyeSpacing, form.eyeHeight);
			const centre = hit.point.clone().addScaledVector(hit.normal, -er * 0.42);
			record(b, {
				id: `feature-eyes-${side}`,
				kind: 'eyes',
				hostJointId: 'head',
				hostVolumeId: 'head',
				base: centre,
				scale: { x: er, y: er, z: er },
				mirror: side < 0,
				shape: 'eye',
				direction: vec(hit.normal),
				lateral: vec(hit.up),
				curlAxis: vec(hit.right),
				embed: er * 0.42,
				surfacePoint: vec(hit.point)
			});
		}
	}
	if (face) {
		const headFeature = (
			kind: 'ears' | 'horns' | 'antennae',
			yaw: number,
			pitch: number,
			growth: (n: Vector3, up: Vector3, fwd: Vector3, right: Vector3, side: number) => Vector3,
			length: number,
			widthRatio: number,
			shape: FeatureShape | 'antenna',
			curl: number,
			curlAxis: (fwd: Vector3, right: Vector3, side: number) => Vector3
		) => {
			for (const side of [-1, 1] as const) {
				const lean = asym * side * 2;
				const hit = faceSurface(b, side * yaw + lean * 0.5, pitch);
				const dir = growth(hit.normal, hit.up, hit.forward, hit.right, side).normalize();
				const len = length * (1 + asym * side);
				const width = len * widthRatio;
				const embed = Math.max(width * 0.32, len * 0.08);
				const lateral = perpendicular(dir, new Vector3().crossVectors(hit.forward, dir));
				record(b, {
					id: `feature-${kind}-${side}`,
					kind,
					hostJointId: 'head',
					hostVolumeId: 'head',
					base: hit.point.clone().addScaledVector(hit.normal, -embed),
					scale: { x: width, y: len + embed, z: width * 0.22 },
					mirror: side < 0,
					shape: shape === 'antenna' ? 'spike' : shape,
					direction: vec(dir),
					lateral: vec(lateral),
					curl: curl + lean,
					curlAxis: vec(perpendicular(dir, curlAxis(hit.forward, hit.right, side))),
					embed,
					surfacePoint: vec(hit.point)
				});
			}
		};
		if (kinds.has('ears')) {
			const big = form.earScale > 1.35;
			headFeature(
				'ears',
				big ? 1.2 : 1.05,
				big ? 0.62 : 0.78,
				(n, up, fwd, right, side) =>
					big
						? n
								.clone()
								.multiplyScalar(0.55)
								.addScaledVector(up, 0.4)
								.addScaledVector(right, side * 0.5)
								.addScaledVector(fwd, -0.18)
						: n
								.clone()
								.multiplyScalar(0.5)
								.addScaledVector(up, 0.7)
								.addScaledVector(fwd, -0.25)
								.addScaledVector(right, side * 0.15),
				h * 0.5 * form.earScale * scale,
				form.earShape === 'rounded-ear' ? 0.62 : form.earShape === 'petal' ? 0.56 : 0.5,
				form.earShape,
				form.featureCurl,
				(fwd, right, side) =>
					fwd
						.clone()
						.negate()
						.addScaledVector(right, side * 0.4)
			);
		}
		if (kinds.has('horns')) {
			const small = form.traits.minor === 'small-horns' && form.traits.dominant !== 'horned';
			headFeature(
				'horns',
				0.42,
				0.62,
				(n, up, fwd, right, side) =>
					n
						.clone()
						.multiplyScalar(0.4)
						.addScaledVector(up, 0.8)
						.addScaledVector(fwd, 0.22)
						.addScaledVector(right, side * 0.25),
				h * 0.5 * scale * (small ? 0.55 : 1),
				0.3,
				form.hornShape,
				form.featureCurl + 0.1,
				(fwd) => fwd.clone().negate()
			);
		}
		if (kinds.has('antennae'))
			headFeature(
				'antennae',
				0.3,
				1.02,
				(n, up, fwd, right, side) =>
					up
						.clone()
						.multiplyScalar(0.9)
						.addScaledVector(fwd, 0.35)
						.addScaledVector(right, side * 0.35),
				h * 0.85 * scale,
				0.075,
				'antenna',
				0.35,
				(fwd, right, side) => fwd.clone().addScaledVector(right, side * 0.5)
			);
		if (kinds.has('frills')) {
			const count = 5;
			for (let n = 0; n < count; n++) {
				const a = (n / (count - 1) - 0.5) * 2.2;
				const f = v3(face.forward),
					u = v3(face.up),
					r = v3(face.right);
				const d = f
					.clone()
					.multiplyScalar(-0.55)
					.addScaledVector(u, Math.cos(a) * 0.75)
					.addScaledVector(r, Math.sin(a) * 0.75)
					.normalize();
				const hit = faceSurface(
					b,
					Math.atan2(d.dot(r), d.dot(f)),
					Math.asin(clamp(d.dot(u), -1, 1))
				);
				const dir = hit.normal.clone().addScaledVector(f, -0.6).normalize();
				const len = h * 0.42 * scale * (1 - Math.abs(a) * 0.18);
				const width = len * 0.46;
				const embed = width * 0.3;
				record(b, {
					id: `feature-frills-${n}`,
					kind: 'frills',
					hostJointId: 'head',
					hostVolumeId: 'head',
					base: hit.point.clone().addScaledVector(hit.normal, -embed),
					scale: { x: width, y: len + embed, z: width * 0.2 },
					shape: 'petal',
					direction: vec(dir),
					lateral: vec(perpendicular(dir, new Vector3().crossVectors(f, dir))),
					curl: 0.15,
					curlAxis: vec(perpendicular(dir, f.clone().negate())),
					embed,
					surfacePoint: vec(hit.point)
				});
			}
		}
		if (form.muzzleLength > 0) {
			const tip = v3(b.at('muzzle')),
				f = v3(face.forward),
				u = v3(face.up);
			const mw = h * 0.5 * form.muzzleWidth,
				mh = h * 0.5 * form.muzzleHeight;
			record(b, {
				id: 'feature-nose',
				kind: 'nose',
				hostJointId: 'head',
				base: tip
					.clone()
					.addScaledVector(f, -mh * 0.2)
					.addScaledVector(u, mh * 0.5),
				scale: { x: mw * 0.26, y: mh * 0.17, z: mw * 0.2 },
				shape: 'eye',
				direction: vec(f),
				lateral: vec(u),
				embed: mh * 0.1
			});
		}
	}
	// Back adornments ride the main body volume and blend with its spine bones.
	const bodyVolume = rig.volumes.find((v) => v.id === 'torso' || v.id === 'serpentine-body');
	const back = (['spikes', 'plates', 'fins'] as const).filter((k) => kinds.has(k));
	// Serpents wear fins as paired side fins; everything else is a dorsal row.
	const dorsal = back.filter((k) => !(serpent && k === 'fins'));
	if (bodyVolume) {
		const sampled = b.sampled(bodyVolume.id);
		const upright = s.bodyPlan.id === 'biped';
		const [t0, t1] = serpent ? [0.18, 0.84] : upright ? [0.32, 0.9] : [0.22, 0.8];
		for (const [row, kind] of dorsal.entries()) {
			const single = kind === 'fins';
			const count = single
				? 1
				: clamp(
						Math.round((serpent ? 1.6 : 1) * (dims.length / Math.max(dims.depth, 1e-6)) * 2.2),
						3,
						serpent ? 8 : 6
					);
			// A second dorsal row interleaves with the first instead of doubling up on it.
			const interleave = row > 0 && !single ? 0.5 : 0;
			const shape: FeatureShape =
				kind === 'spikes'
					? (['spike', 'horn', 'diamond'] as FeatureShape[]).includes(form.backShape)
						? form.backShape
						: 'spike'
					: kind === 'plates'
						? (['plate', 'diamond', 'leaf', 'petal'] as FeatureShape[]).includes(form.backShape)
							? form.backShape
							: 'plate'
						: form.backShape === 'leaf'
							? 'leaf'
							: 'fin';
			for (let n = 0; n < count - (interleave ? 1 : 0); n++) {
				const t = single ? 0.52 : lerp(t0, t1, count === 1 ? 0.5 : (n + interleave) / (count - 1));
				const surface = surfaceAt(sampled, t, Math.PI / 2);
				const tangent = surface.ring.tangent.clone();
				const towardTail = tangent.clone().negate();
				// Sized from the local body section, so rows scale with serpents' boosted girth too.
				const local = serpent
					? Math.min(surface.ring.rx, surface.ring.ry) * 1.25
					: Math.min(dims.width, dims.depth) * 0.42;
				const size = local * form.backScale * scale * (interleave ? 0.72 : 1);
				const profile = single ? 1 : 0.62 + 0.38 * Math.sin(Math.PI * ((n + 0.5) / count));
				const len = size * profile * (single ? 1.35 : kind === 'plates' ? 1.15 : 1);
				const widthRatio = single ? 1.5 : kind === 'plates' ? 0.78 : 0.42;
				const dir = surface.normal
					.clone()
					.addScaledVector(towardTail, kind === 'plates' ? 0.12 : 0.3)
					.normalize();
				const width = len * widthRatio;
				const embed = Math.max(
					len * 0.16,
					(FEATURE_SHAPES[shape].round ? width : width * 0.2) * 0.4
				);
				record(b, {
					id: `feature-${kind}-${n}`,
					kind,
					hostJointId: hostJointAt(bodyVolume, t),
					hostVolumeId: bodyVolume.id,
					skin: hostSkinAt(bodyVolume, t),
					base: surface.point.clone().addScaledVector(surface.normal, -embed),
					scale: { x: width, y: len + embed, z: width * (kind === 'plates' ? 0.24 : 0.18) },
					shape,
					direction: vec(dir),
					lateral: vec(perpendicular(dir, tangent)),
					curl: kind === 'fins' ? 0.35 : 0.08,
					curlAxis: vec(perpendicular(dir, towardTail)),
					embed,
					surfacePoint: vec(surface.point)
				});
			}
		}
		if (serpent && kinds.has('fins'))
			for (const [n, t] of [0.72, 0.5, 0.3].entries())
				for (const side of [-1, 1] as const) {
					// Paired side fins, swept back and lying roughly flat like an eel's.
					// The S-curved body is not mirror-symmetric: solve each side on its own surface.
					const surface = surfaceAt(sampled, t, side === 1 ? -0.25 : Math.PI + 0.25);
					const point = surface.point.clone(),
						normal = surface.normal.clone(),
						towardTail = surface.ring.tangent.clone().negate();
					const local = Math.min(surface.ring.rx, surface.ring.ry);
					const len = local * 1.6 * form.backScale * scale * (1 - n * 0.15);
					const dir = normal
						.clone()
						.addScaledVector(towardTail, 0.9)
						.addScaledVector(new Vector3(0, -1, 0), 0.15)
						.normalize();
					const width = len * 0.8;
					const embed = Math.max(len * 0.16, width * 0.1);
					record(b, {
						id: `feature-fins-${n * 2 + (side === 1 ? 1 : 0)}`,
						kind: 'fins',
						hostJointId: hostJointAt(bodyVolume, t),
						hostVolumeId: bodyVolume.id,
						skin: hostSkinAt(bodyVolume, t),
						base: point.clone().addScaledVector(normal, -embed),
						scale: { x: width, y: len + embed, z: width * 0.16 },
						mirror: side < 0,
						shape: form.backShape === 'leaf' ? 'leaf' : 'fin',
						direction: vec(dir),
						lateral: vec(perpendicular(dir, new Vector3().crossVectors(new Vector3(0, 1, 0), dir))),
						curl: 0.25,
						curlAxis: vec(perpendicular(dir, towardTail)),
						embed,
						surfacePoint: vec(point)
					});
				}
	}
	if (kinds.has('tail-tip')) {
		const tail = rig.volumes.find((v) => v.id === 'tail');
		const ids = tail ? tail.jointIds : bodyVolume?.jointIds;
		if (ids && ids.length >= 2) {
			const endId = tail ? ids[ids.length - 1] : ids[0],
				prevId = tail ? ids[ids.length - 2] : ids[1];
			const end = v3(b.at(endId)),
				dir = end
					.clone()
					.sub(v3(b.at(prevId)))
					.normalize();
			const R = tail ? dims.tailRadius : Math.min(dims.width, dims.depth) * 0.05;
			const len = Math.max(R * 3.4, h * (tail ? 0.32 : 0.2)) * scale;
			const lateral = perpendicular(dir, new Vector3(1, 0, 0));
			record(b, {
				id: 'feature-tail-tip-0',
				kind: 'tail-tip',
				hostJointId: endId,
				hostVolumeId: tail ? 'tail' : bodyVolume?.id,
				base: end.clone().addScaledVector(dir, -len * 0.12),
				scale: { x: len * 0.55, y: len, z: len * 0.14 },
				shape: form.tailTip,
				direction: vec(dir),
				lateral: vec(lateral),
				curl: 0.12,
				curlAxis: vec(perpendicular(dir, new Vector3(0, 1, 0))),
				embed: len * 0.12
			});
		}
	}
	for (const limb of rig.limbs) {
		const foot = v3(b.at(limb.footId)),
			hip = v3(b.at(limb.hipId)),
			knee = v3(b.at(limb.kneeId));
		const radius = rig.volumes.find((v) => v.id === limb.id)!.sections.at(-1)!.radiusX;
		if (limb.arm) {
			const dir = foot.clone().sub(knee).normalize();
			const thicknessAxis = perpendicular(dir, new Vector3(limb.side, 0, 0));
			record(b, {
				id: `${limb.id}-hand`,
				kind: 'hands',
				hostJointId: limb.footId,
				base: foot.clone(),
				scale: { x: radius * 1.7, y: radius * 3.2, z: radius * 0.95 },
				mirror: limb.side < 0,
				shape: form.handType,
				direction: vec(dir),
				lateral: vec(new Vector3().crossVectors(dir, thicknessAxis).normalize()),
				curlAxis: vec(thicknessAxis),
				embed: radius * 0.6
			});
			continue;
		}
		const out = foot.clone().sub(hip);
		out.y = 0;
		const forward = new Vector3(0, 0, 1).addScaledVector(
			out.normalize(),
			s.bodyPlan.id === 'hexapod' ? 0.8 : 0.15
		);
		forward.y = 0;
		forward.normalize();
		const footHeight = foot.y;
		const width =
			Math.max(radius * 2.1, dims.limbRadius * 1.5) *
			form.footScale *
			(s.bodyPlan.id === 'hexapod' ? 0.8 : 1);
		record(b, {
			id: `${limb.id}-pad`,
			kind: 'feet',
			hostJointId: limb.footId,
			base: foot.clone(),
			scale: { x: width, y: width * 1.45, z: footHeight },
			mirror: limb.side < 0,
			shape: form.footType,
			direction: vec(forward),
			lateral: vec(new Vector3(0, 1, 0).cross(forward).normalize()),
			embed: footHeight
		});
	}
}

const CURVED_SEGMENTS = 3;
function bladePath(f: FeatureAttachment, base: Vector3, length: number) {
	const dir = v3(f.direction ?? { x: 0, y: 1, z: 0 }),
		axis = v3(f.curlAxis ?? { x: 0, y: 0, z: -1 }),
		curl = f.curl ?? 0;
	const n = Math.abs(curl) > 0.01 ? CURVED_SEGMENTS + 1 : 2;
	return Array.from({ length: n }, (_, k) => {
		const s = k / (n - 1);
		return vec(
			base
				.clone()
				.addScaledVector(dir, length * s)
				.addScaledVector(axis, length * curl * s * s)
		);
	});
}
function appendBlade(
	out: GeometryAccumulator,
	f: FeatureAttachment,
	base: Vector3,
	shape: FeatureShape | 'antenna',
	quality: CreatureLodQuality,
	region: number,
	skin: SkinInfluence,
	size = f.scale
) {
	const profile = FEATURE_SHAPES[shape];
	const points = bladePath(f, base, size.y);
	const volume: BodyVolumeDefinition = {
		id: f.id,
		jointIds: [],
		sections: profile.width.map(([t, w]) => {
			const rx = Math.max(1e-5, size.x * w * 0.5);
			return {
				t,
				radiusX: rx,
				radiusY: profile.round
					? rx
					: Math.max(size.z * 0.5 * Math.max(w, profile.thicknessFloor ?? 0.35), 1e-5)
			};
		}),
		caps: { start: 'flat', end: profile.tipDome ? 'dome' : 'flat' },
		detail: 'minor',
		// Rigid: rings only where the curve bends or the authored profile changes.
		segmentRings: Array(points.length - 1).fill(points.length > 2 ? 1 : 2),
		initialNormal: f.lateral
	};
	appendSweep(out, volume, points, [], quality, { region, skin: () => skin });
}

/** Geometry for one placed feature, skinned rigidly to its host bone(s). */
export function appendFeatureGeometry(
	out: GeometryAccumulator,
	f: FeatureAttachment,
	world: Map<string, Vec3>,
	boneIds: Map<string, number>,
	quality: CreatureLodQuality
) {
	const host = world.get(f.hostJointId);
	if (!host) return;
	const base = v3(host).add(v3(f.offset));
	const skin: SkinInfluence = f.skin
		? f.skin.map((w) => [boneIds.get(w.jointId) ?? 0, w.weight])
		: [[boneIds.get(f.hostJointId) ?? 0, 1]];
	const rigid = () => skin;
	const dir = v3(f.direction ?? { x: 0, y: 0, z: 1 });
	const lateral = v3(f.lateral ?? { x: 0, y: 1, z: 0 });
	const frame = (a0: Vector3, hint: Vector3): [Vector3, Vector3, Vector3] => {
		const a1 = perpendicular(a0, hint);
		return [a0.clone(), a1, new Vector3().crossVectors(a0, a1)];
	};
	const ellipsoid = (
		centre: Vector3,
		axes: [Vector3, Vector3, Vector3],
		radii: [number, number, number],
		region: number,
		lowerScale?: number,
		fine = 1
	) =>
		appendEllipsoid(out, {
			centre,
			axes,
			radii,
			region,
			skin: rigid,
			rings: Math.max(3, Math.round(quality.ellipsoidRings * fine)),
			sides: Math.max(4, Math.round(quality.ellipsoidSides * fine)),
			lowerScale
		});
	switch (f.kind) {
		case 'eyes': {
			const er = f.scale.x;
			ellipsoid(base, frame(dir, lateral), [er * 0.86, er, er], regionIndex(out, 'eye', 'eye'));
			if (quality.fineDetail) {
				const right = v3(f.curlAxis ?? { x: 1, y: 0, z: 0 });
				const towardLight = dir
					.clone()
					.addScaledVector(lateral, 0.55)
					.addScaledVector(right, 0.3)
					.normalize();
				ellipsoid(
					base.clone().addScaledVector(towardLight, er * 0.8),
					frame(towardLight, lateral),
					[er * 0.1, er * 0.21, er * 0.21],
					regionIndex(out, 'eye-highlight', 'eye'),
					1,
					0.6
				);
			}
			return;
		}
		case 'nose': {
			if (!quality.fineDetail) return;
			ellipsoid(
				base,
				frame(dir, lateral),
				[f.scale.z, f.scale.y, f.scale.x],
				regionIndex(out, 'nose', 'nose'),
				1,
				0.6
			);
			return;
		}
		case 'feet':
			return appendFoot(out, f, base, quality, skin);
		case 'hands':
			return appendHand(out, f, base, quality, skin);
		case 'tail-tip': {
			const region = regionIndex(out, 'feature', 'tail-tip');
			if (f.shape === 'club') {
				const r = f.scale.x * 0.55;
				ellipsoid(
					base.clone().addScaledVector(dir, f.scale.y * 0.45),
					frame(dir, lateral),
					[f.scale.y * 0.42, r, r],
					region
				);
			} else if (f.shape === 'tuft') {
				const side = new Vector3().crossVectors(dir, lateral).normalize();
				for (const a of quality.fineDetail ? [-0.45, 0, 0.45] : [0]) {
					const d = dir.clone().applyAxisAngle(side, a);
					appendBlade(out, { ...f, direction: vec(d) }, base, 'petal', quality, region, skin, {
						x: f.scale.x * 0.7,
						y: f.scale.y * (a === 0 ? 1 : 0.8),
						z: f.scale.z
					});
				}
			} else
				appendBlade(
					out,
					f,
					base,
					f.shape === 'diamond' ? 'diamond' : 'leaf',
					quality,
					region,
					skin
				);
			return;
		}
		default: {
			const shape = (f.kind === 'antennae' ? 'antenna' : (f.shape as FeatureShape)) ?? 'leaf';
			const region = regionIndex(out, 'feature', f.kind);
			// Far LOD keeps every other element of an unpaired row (frills, back spikes/plates/fins);
			// left/right pairs are never thinned, so the silhouette stays symmetric.
			if (
				!quality.fineDetail &&
				['frills', 'spikes', 'plates', 'fins'].includes(f.kind) &&
				f.mirror === undefined &&
				Number(f.id.split('-').pop()) % 2 === 1
			)
				return;
			appendBlade(out, f, base, shape, quality, region, skin);
			if (f.kind === 'antennae' && quality.fineDetail) {
				const path = bladePath(f, base, f.scale.y);
				const tip = v3(path[path.length - 1]);
				const r = f.scale.x * 1.4;
				ellipsoid(
					tip,
					frame(dir, lateral),
					[r, r, r],
					regionIndex(out, 'feature', 'antenna-tip'),
					1,
					0.6
				);
			}
		}
	}
}

function appendFoot(
	out: GeometryAccumulator,
	f: FeatureAttachment,
	ankle: Vector3,
	quality: CreatureLodQuality,
	skin: SkinInfluence
) {
	const fwd = v3(f.direction!),
		up = new Vector3(0, 1, 0),
		side = new Vector3().crossVectors(up, fwd).normalize();
	const width = f.scale.x,
		length = f.scale.y,
		height = f.scale.z;
	const ground = ankle.clone().addScaledVector(up, -height);
	const region = regionIndex(out, 'foot', String(f.shape));
	const rigid = () => skin;
	const blob = (centre: Vector3, along: Vector3, radii: [number, number, number], fine = 1) =>
		appendEllipsoid(out, {
			centre,
			axes: [along, up.clone(), new Vector3().crossVectors(along, up).normalize()],
			radii,
			region,
			skin: rigid,
			rings: Math.max(3, Math.round(quality.ellipsoidRings * fine)),
			sides: Math.max(4, Math.round(quality.ellipsoidSides * fine)),
			lowerScale: 0.5
		});
	const type = !quality.fineDetail && f.shape !== 'hoof' ? 'paw' : f.shape;
	switch (type) {
		case 'hoof': {
			const top = width * 0.44,
				bottom = width * 0.56;
			const points = [
				vec(ankle.clone().addScaledVector(up, height * 0.25)),
				vec(ground.clone().addScaledVector(fwd, width * 0.12))
			];
			appendSweep(
				out,
				{
					id: f.id,
					jointIds: [],
					sections: [
						{ t: 0, radiusX: top, radiusY: top * 0.95 },
						{ t: 0.55, radiusX: top * 1.06, radiusY: top },
						{ t: 1, radiusX: bottom, radiusY: bottom * 1.05 }
					],
					caps: { start: 'flat', end: 'flat' },
					detail: 'limb',
					segmentRings: [3],
					initialNormal: vec(side)
				},
				points,
				[],
				quality,
				{ region, skin: rigid, hardEnd: true }
			);
			return;
		}
		case 'leaf': {
			const thickness = Math.max(height * 0.22, width * 0.12);
			blob(
				ankle.clone().addScaledVector(up, -height * 0.45),
				fwd,
				[width * 0.42, height * 0.6, width * 0.4],
				0.75
			);
			appendBlade(
				out,
				{
					...f,
					direction: vec(fwd),
					lateral: vec(side),
					curl: 0.14,
					curlAxis: vec(up)
				},
				ground
					.clone()
					.addScaledVector(up, thickness * 0.5)
					.addScaledVector(fwd, -length * 0.12),
				'leaf',
				quality,
				region,
				skin,
				{ x: width * 0.95, y: length * 0.9, z: thickness }
			);
			return;
		}
		case 'two-toe':
		case 'three-toe': {
			const toes = type === 'two-toe' ? [-0.2, 0.2] : [-0.34, 0, 0.34];
			const th = height * 0.42;
			blob(
				ground
					.clone()
					.addScaledVector(up, height * 0.42)
					.addScaledVector(fwd, -length * 0.05),
				fwd,
				[length * 0.3, height * 0.6, width * 0.42],
				0.6
			);
			for (const a of toes) {
				const d = fwd.clone().applyAxisAngle(up, a);
				blob(
					ground
						.clone()
						.addScaledVector(up, th * 0.5)
						.addScaledVector(d, length * 0.36),
					d,
					[length * 0.3, th, width * (type === 'two-toe' ? 0.26 : 0.2)],
					0.5
				);
			}
			return;
		}
		default: {
			const ph = height * 0.72;
			blob(
				ground
					.clone()
					.addScaledVector(up, ph * 0.5)
					.addScaledVector(fwd, length * 0.16),
				fwd,
				[length * 0.5, ph, width * 0.5]
			);
		}
	}
}

function appendHand(
	out: GeometryAccumulator,
	f: FeatureAttachment,
	wrist: Vector3,
	quality: CreatureLodQuality,
	skin: SkinInfluence
) {
	const dir = v3(f.direction!),
		width = v3(f.lateral!),
		thick = v3(f.curlAxis!);
	const region = regionIndex(out, 'hand', String(f.shape));
	const rigid = () => skin;
	const blob = (centre: Vector3, along: Vector3, radii: [number, number, number], fine = 1) =>
		appendEllipsoid(out, {
			centre,
			axes: [along, thick.clone(), new Vector3().crossVectors(along, thick).normalize()],
			radii,
			region,
			skin: rigid,
			rings: Math.max(3, Math.round(quality.ellipsoidRings * fine)),
			sides: Math.max(4, Math.round(quality.ellipsoidSides * fine))
		});
	const w = f.scale.x,
		l = f.scale.y,
		t = f.scale.z;
	const type = !quality.fineDetail && f.shape === 'fingers' ? 'mitten' : f.shape;
	if (type === 'leaf') {
		blob(wrist.clone().addScaledVector(dir, l * 0.1), dir, [l * 0.2, t * 0.6, w * 0.4], 0.75);
		appendBlade(
			out,
			{ ...f, lateral: vec(width), curl: 0.12, curlAxis: vec(thick) },
			wrist.clone(),
			'leaf',
			quality,
			region,
			skin,
			{ x: w * 1.1, y: l * 1.05, z: t * 0.5 }
		);
	} else if (type === 'fingers') {
		blob(wrist.clone().addScaledVector(dir, l * 0.22), dir, [l * 0.3, t * 0.62, w * 0.5], 0.75);
		for (const a of [-0.38, 0, 0.38]) {
			const d = dir.clone().applyAxisAngle(thick, a);
			appendBlade(
				out,
				{ ...f, direction: vec(d), lateral: vec(width), curl: 0, curlAxis: vec(thick) },
				wrist.clone().addScaledVector(dir, l * 0.4),
				'antenna',
				quality,
				region,
				skin,
				{ x: w * 0.26, y: l * 0.48, z: w * 0.26 }
			);
		}
	} else {
		const round = type === 'paw';
		blob(
			wrist.clone().addScaledVector(dir, l * (round ? 0.3 : 0.38)),
			dir,
			round ? [l * 0.42, t * 0.75, w * 0.52] : [l * 0.5, t * 0.6, w * 0.5]
		);
	}
}

/** Rigid-feature count by kind (fingerprints / validation). */
export function featureCounts(rig: ProceduralSkeletonDefinition) {
	const counts: Record<string, number> = {};
	for (const f of rig.features) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
	return counts;
}
