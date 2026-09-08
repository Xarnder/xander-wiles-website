import { generateAdditionalSkeleton } from './AdditionalSkeletons';
import type {
	CreatureDefinition,
	ProceduralSkeletonDefinition,
	Vec3,
	JointSemantic,
	CrossSection
} from './CreatureTypes';

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

export function generateSkeleton(definition: CreatureDefinition): ProceduralSkeletonDefinition {
	if (definition.species.generatorVersion !== 1)
		throw new Error('Unsupported creature generator version');
	if (definition.species.bodyPlan.id !== 'quadruped') return generateAdditionalSkeleton(definition);
	const { species: s, individual: i } = definition,
		p = s.proportions,
		v = i.proportionVariation,
		k = i.sizeFactor;
	const length = p.bodyLength * v.length * k,
		width = p.bodyWidth * v.width * k,
		depth = p.bodyDepth * k;
	const legs = p.legLength * v.legs * k,
		thickness = p.legThickness * k,
		head = p.headSize * v.head * k;
	const out: ProceduralSkeletonDefinition = {
		joints: [],
		volumes: [],
		features: [],
		limbs: [],
		groundOffset: 0
	};
	const positions = new Map<string, Vec3>();
	const add = (
		id: string,
		parentId: string | undefined,
		semantic: JointSemantic,
		x: number,
		y: number,
		z: number,
		mirrorGroup?: string
	) => {
		const parent = parentId ? positions.get(parentId)! : { x: 0, y: 0, z: 0 };
		positions.set(id, { x, y, z });
		out.joints.push({
			id,
			parentId,
			semantic,
			localPosition: { x: x - parent.x, y: y - parent.y, z: z - parent.z },
			mirrorGroup
		});
		return id;
	};
	const section = (t: number, rx: number, ry: number): CrossSection => ({
		t,
		radiusX: rx,
		radiusY: ry
	});
	add('root', undefined, 'root', 0, 0, 0);
	const footY = thickness * 0.32,
		bodyY = legs + footY;
	add('pelvis', 'root', 'pelvis', 0, bodyY, -length * 0.37);
	add('spine', 'pelvis', 'spine', 0, bodyY + depth * 0.035, 0);
	add('chest', 'spine', 'chest', 0, bodyY + legs * (p.frontLegRatio - 1) * 0.35, length * 0.35);
	add(
		'neck',
		'chest',
		'neck',
		0,
		bodyY + depth * 0.3 + p.neckLength * k * 0.55,
		length * 0.48 + p.neckLength * k * 0.4
	);
	const neck = positions.get('neck')!;
	add('head', 'neck', 'head', 0, neck.y + p.neckLength * k * 0.25, neck.z + head * 0.55);
	add(
		'muzzle',
		'head',
		'feature',
		0,
		positions.get('head')!.y - head * 0.08,
		positions.get('head')!.z + head * 0.65
	);
	out.volumes.push({
		id: 'torso',
		jointIds: ['pelvis', 'spine', 'chest'],
		sections: [
			section(0, width * 0.24, depth * 0.28),
			section(0.15, width * 0.5, depth * 0.5),
			section(0.5, width * 0.5 * p.waistScale, depth * 0.43),
			section(0.83, width * 0.5 * p.chestScale, depth * 0.5 * p.chestScale),
			section(1, width * 0.3, depth * 0.32)
		]
	});
	out.volumes.push({
		id: 'neck',
		jointIds: ['chest', 'neck', 'head'],
		sections: [
			section(0, width * 0.3, depth * 0.32),
			section(0.55, head * 0.29, head * 0.32),
			section(1, head * 0.34, head * 0.35)
		]
	});
	out.volumes.push({
		id: 'head',
		jointIds: ['neck', 'head', 'muzzle'],
		sections: [
			section(0, head * 0.2, head * 0.23),
			section(0.5, head * 0.49, head * 0.47),
			section(0.8, head * 0.38, head * 0.35),
			section(1, head * 0.14, head * 0.16)
		]
	});
	for (let pair = 0; pair < 2; pair++)
		for (const side of [-1, 1] as const) {
			const host = pair === 0 ? 'chest' : 'pelvis',
				h = positions.get(host)!,
				name = `limb-${pair}-${side}`;
			const x = side * (width * 0.42 + p.stanceWidth * k * 0.25),
				footX = side * (width * 0.43 + p.stanceWidth * k * 0.5),
				z = h.z;
			const hip = add(`${name}-hip`, host, 'limb-root', x, h.y, z, `hip-${pair}`);
			const knee = add(
				`${name}-knee`,
				hip,
				'lower-limb',
				(x + footX) / 2,
				h.y * 0.52,
				z + (pair === 0 ? -0.14 : 0.14) * legs,
				`knee-${pair}`
			);
			const foot = add(`${name}-foot`, knee, 'foot', footX, footY, z, `foot-${pair}`);
			const a = positions.get(hip)!,
				b = positions.get(knee)!,
				c = positions.get(foot)!;
			const distance = (u: Vec3, w: Vec3) => Math.hypot(u.x - w.x, u.y - w.y, u.z - w.z);
			out.limbs.push({
				id: name,
				side,
				pair,
				hipId: hip,
				kneeId: knee,
				footId: foot,
				upperLength: distance(a, b),
				lowerLength: distance(b, c),
				restFoot: { ...c },
				phase: s.locomotion.gait.footPhaseOffsets[pair * 2 + (side === 1 ? 1 : 0)] ?? 0
			});
			out.volumes.push({
				id: name,
				jointIds: [hip, knee, foot],
				sections: [
					section(0, thickness * 0.9, thickness * 0.9),
					section(0.2, thickness * 0.7, thickness * 0.7),
					section(0.48, thickness * 0.48, thickness * 0.48),
					section(0.58, thickness * 0.48, thickness * 0.48),
					section(1, thickness * 0.3, thickness * 0.3)
				]
			});
			out.features.push({
				id: `${name}-pad`,
				kind: 'feet',
				hostJointId: foot,
				offset: { x: 0, y: 0, z: thickness * 0.22 },
				scale: { x: thickness * 0.48, y: footY, z: thickness * 0.7 }
			});
		}
	const tailLength = p.tailLength * k;
	if (tailLength > 0) {
		const ids = ['pelvis'];
		for (let n = 1; n <= 5; n++)
			ids.push(
				add(
					`tail-${n}`,
					n === 1 ? 'pelvis' : `tail-${n - 1}`,
					'tail',
					0,
					bodyY + Math.sin((n / 5) * Math.PI) * tailLength * 0.14,
					-length * 0.37 - (tailLength * n) / 5
				)
			);
		out.volumes.push({
			id: 'tail',
			jointIds: ids,
			sections: [
				section(0, p.tailThickness * k, p.tailThickness * k),
				section(0.45, p.tailThickness * k * 0.6, p.tailThickness * k * 0.6),
				section(1, p.tailThickness * k * 0.025, p.tailThickness * k * 0.025)
			]
		});
	}
	return out;
}
