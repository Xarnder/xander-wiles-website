import type { CreatureDefinition, ProceduralSkeletonDefinition, Vec3 } from './CreatureTypes';
import { appendSweep, type GeometryAccumulator } from './SweptBodyVolume';
export function generateFeatures(def: CreatureDefinition, rig: ProceduralSkeletonDefinition) {
	const { species: s, individual: i } = def,
		h = s.proportions.headSize * i.proportionVariation.head * i.sizeFactor,
		f = s.anatomy.featureScale * i.featureVariation.scale;
	for (const kind of s.anatomy.features) {
		if (kind === 'feet') continue;
		const paired = ['eyes', 'ears', 'horns', 'antennae', 'fins'].includes(kind);
		for (const side of paired ? [-1, 1] : [0]) {
			const asymmetry = 1 + side * i.featureVariation.asymmetry * (1 - s.anatomy.symmetryStrength);
			const small = kind === 'eyes' ? 0.115 : 0.3 * f;
			const spine = rig.joints.filter((joint) => joint.semantic === 'spine');
			const serpent = s.bodyPlan.id === 'serpentine';
			const hostJointId =
				kind === 'tail-tip'
					? serpent
						? spine[0]?.id
						: 'tail-5'
					: ['spikes', 'plates', 'fins', 'frills'].includes(kind)
						? serpent
							? spine[Math.floor(spine.length * 0.7)]?.id
							: 'chest'
						: 'head';
			if (!hostJointId || !rig.joints.some((j) => j.id === hostJointId)) continue;
			rig.features.push({
				id: `feature-${kind}-${side}`,
				kind,
				hostJointId,
				offset: {
					x: side * h * (kind === 'eyes' ? 0.41 : 0.3),
					y: h * (kind === 'eyes' ? 0.13 : 0.35),
					z: kind === 'eyes' ? h * 0.25 : 0
				},
				scale: {
					x: h * small,
					y:
						h *
						small *
						(kind === 'ears' ? 2.2 : kind === 'horns' || kind === 'antennae' ? 3.2 : 1) *
						asymmetry,
					z: h * small * 0.75
				},
				mirror: side < 0
			});
		}
	}
}
export function appendFeatures(
	out: GeometryAccumulator,
	rig: ProceduralSkeletonDefinition,
	world: Map<string, Vec3>,
	lod: 0 | 1
) {
	const boneIds = new Map(rig.joints.map((j, n) => [j.id, n]));
	for (const feature of rig.features) {
		const host = world.get(feature.hostJointId)!,
			o = feature.offset,
			s = feature.scale;
		const sharp = ['horns', 'antennae', 'spikes', 'fins', 'frills'].includes(feature.kind),
			vertical = sharp || feature.kind === 'ears';
		const centre = { x: host.x + o.x, y: host.y + o.y, z: host.z + o.z };
		const points = vertical
			? [
					{ ...centre, y: centre.y - s.y * 0.15 },
					{ ...centre, y: centre.y + s.y * 0.55 },
					{ ...centre, x: centre.x + (feature.mirror ? -1 : 1) * s.x * 0.3, y: centre.y + s.y }
				]
			: [{ ...centre, z: centre.z - s.z }, { ...centre }, { ...centre, z: centre.z + s.z }];
		const radiusY = vertical ? s.z : s.y;
		appendSweep(
			out,
			{
				id: feature.kind === 'eyes' ? 'eye' : `feature-${feature.kind}`,
				jointIds: [],
				sections: [
					{ t: 0, radiusX: s.x * 0.15, radiusY: radiusY * 0.15 },
					{ t: 0.4, radiusX: s.x, radiusY },
					{ t: 1, radiusX: s.x * (sharp ? 0.01 : 0.1), radiusY: radiusY * (sharp ? 0.01 : 0.1) }
				]
			},
			points,
			points.map(() => boneIds.get(feature.hostJointId)!),
			lod,
			// Rigid adornments need fewer axial rings than articulated body volumes.
			lod === 0 ? 4 : 2
		);
	}
}
