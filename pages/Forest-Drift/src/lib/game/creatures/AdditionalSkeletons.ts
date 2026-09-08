import type {
	CreatureDefinition,
	ProceduralSkeletonDefinition,
	Vec3,
	JointSemantic,
	CrossSection
} from './CreatureTypes';
/** Separate upright, three-pair and limbless grammars; the quadruped is not mutated into these plans. */
export function generateAdditionalSkeleton(def: CreatureDefinition): ProceduralSkeletonDefinition {
	const { species: s, individual: i } = def,
		p = s.proportions,
		k = i.sizeFactor,
		v = i.proportionVariation;
	const length = p.bodyLength * v.length * k,
		width = p.bodyWidth * v.width * k,
		depth = p.bodyDepth * k,
		legs = p.legLength * v.legs * k,
		thick = p.legThickness * k,
		head = p.headSize * v.head * k;
	const rig: ProceduralSkeletonDefinition = {
			joints: [],
			volumes: [],
			features: [],
			limbs: [],
			groundOffset: 0
		},
		world = new Map<string, Vec3>();
	const add = (
		id: string,
		parentId: string | undefined,
		semantic: JointSemantic,
		pos: Vec3,
		mirrorGroup?: string
	) => {
		const parent = parentId ? world.get(parentId)! : { x: 0, y: 0, z: 0 };
		rig.joints.push({
			id,
			parentId,
			semantic,
			localPosition: { x: pos.x - parent.x, y: pos.y - parent.y, z: pos.z - parent.z },
			mirrorGroup
		});
		world.set(id, pos);
		return id;
	};
	const section = (t: number, radiusX: number, radiusY: number): CrossSection => ({
		t,
		radiusX,
		radiusY
	});
	const volume = (id: string, jointIds: string[], sections: CrossSection[]) =>
		rig.volumes.push({ id, jointIds, sections });
	add('root', undefined, 'root', { x: 0, y: 0, z: 0 });
	const limb = (
		host: string,
		pair: number,
		side: -1 | 1,
		hip: Vec3,
		knee: Vec3,
		foot: Vec3,
		arm = false
	) => {
		const id = `limb-${pair}-${side}`,
			hipId = add(`${id}-hip`, host, 'limb-root', hip, `hip-${pair}`),
			kneeId = add(`${id}-knee`, hipId, 'lower-limb', knee, `knee-${pair}`),
			footId = add(`${id}-foot`, kneeId, 'foot', foot, `foot-${pair}`);
		const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
		rig.limbs.push({
			id,
			side,
			pair,
			hipId,
			kneeId,
			footId,
			restFoot: { ...foot },
			upperLength: dist(hip, knee),
			lowerLength: dist(knee, foot),
			phase:
				s.locomotion.gait.footPhaseOffsets[pair * 2 + (side === 1 ? 1 : 0)] ??
				(side === 1 ? 0.5 : 0),
			arm
		});
		volume(
			id,
			[hipId, kneeId, footId],
			[
				section(0, thick * 0.85, thick * 0.85),
				section(0.25, thick * 0.62, thick * 0.62),
				section(0.5, thick * 0.43, thick * 0.43),
				section(0.64, thick * 0.4, thick * 0.4),
				section(1, thick * 0.28, thick * 0.28)
			]
		);
		rig.features.push({
			id: `${id}-pad`,
			kind: 'feet',
			hostJointId: footId,
			offset: { x: 0, y: 0, z: thick * 0.25 },
			scale: { x: thick * 0.48, y: thick * 0.32, z: thick * 0.75 }
		});
	};
	const face = (host: string, neck: Vec3, headPos: Vec3) => {
		add('neck', host, 'neck', neck);
		add('head', 'neck', 'head', headPos);
		add('muzzle', 'head', 'feature', {
			x: headPos.x,
			y: headPos.y - head * 0.08,
			z: headPos.z + head * 0.68
		});
		volume(
			'neck',
			[host, 'neck', 'head'],
			[
				section(0, head * 0.3, head * 0.32),
				section(0.5, head * 0.25, head * 0.27),
				section(1, head * 0.3, head * 0.32)
			]
		);
		volume(
			'head',
			['neck', 'head', 'muzzle'],
			[
				section(0, head * 0.2, head * 0.22),
				section(0.5, head * 0.49, head * 0.47),
				section(0.8, head * 0.38, head * 0.32),
				section(1, head * 0.12, head * 0.14)
			]
		);
	};
	const tail = (host: string) => {
		const origin = world.get(host)!,
			ids = [host],
			n = 5;
		for (let a = 1; a <= n; a++)
			ids.push(
				add(`tail-${a}`, a === 1 ? host : `tail-${a - 1}`, 'tail', {
					x: 0,
					y: origin.y + Math.sin((a / n) * Math.PI) * p.tailLength * k * 0.12,
					z: origin.z - (p.tailLength * k * a) / n
				})
			);
		volume('tail', ids, [
			section(0, p.tailThickness * k, p.tailThickness * k),
			section(0.5, p.tailThickness * k * 0.5, p.tailThickness * k * 0.5),
			section(1, p.tailThickness * k * 0.02, p.tailThickness * k * 0.02)
		]);
	};
	if (s.bodyPlan.id === 'biped') {
		const pelvisY = legs + thick * 0.32,
			torso = length * 0.85;
		add('pelvis', 'root', 'pelvis', { x: 0, y: pelvisY, z: 0 });
		add('spine', 'pelvis', 'spine', { x: 0, y: pelvisY + torso * 0.48, z: -depth * 0.07 });
		add('chest', 'spine', 'chest', { x: 0, y: pelvisY + torso, z: 0 });
		volume(
			'torso',
			['pelvis', 'spine', 'chest'],
			[
				section(0, width * 0.44, depth * 0.4),
				section(0.2, width * 0.5, depth * 0.48),
				section(0.5, width * 0.43 * p.waistScale, depth * 0.38),
				section(0.84, width * 0.5 * p.chestScale, depth * 0.46),
				section(1, width * 0.33, depth * 0.29)
			]
		);
		face(
			'chest',
			{ x: 0, y: pelvisY + torso + p.neckLength * k * 0.65, z: depth * 0.12 },
			{ x: 0, y: pelvisY + torso + p.neckLength * k + head * 0.18, z: depth * 0.25 }
		);
		for (const side of [-1, 1] as const) {
			limb(
				'pelvis',
				0,
				side,
				{ x: side * width * 0.28, y: pelvisY, z: 0 },
				{ x: side * width * 0.31, y: pelvisY * 0.52, z: legs * 0.13 },
				{ x: side * (width * 0.3 + p.stanceWidth * k * 0.25), y: thick * 0.32, z: 0 }
			);
			const shoulder = pelvisY + torso * 0.94,
				armLength = legs * 0.65;
			limb(
				'chest',
				1,
				side,
				{ x: side * width * 0.48, y: shoulder, z: 0 },
				{
					x: side * (width * 0.52 + armLength * 0.15),
					y: shoulder - armLength * 0.5,
					z: armLength * 0.08
				},
				{
					x: side * (width * 0.55 + armLength * 0.12),
					y: shoulder - armLength,
					z: armLength * 0.2
				},
				true
			);
		}
		tail('pelvis');
	} else if (s.bodyPlan.id === 'hexapod') {
		const y = legs + thick * 0.32;
		add('pelvis', 'root', 'pelvis', { x: 0, y, z: -length * 0.4 });
		add('spine', 'pelvis', 'spine', { x: 0, y: y + depth * 0.05, z: 0 });
		add('chest', 'spine', 'chest', { x: 0, y, z: length * 0.37 });
		volume(
			'abdomen',
			['pelvis', 'spine', 'chest'],
			[
				section(0, width * 0.3, depth * 0.3),
				section(0.2, width * 0.6, depth * 0.6),
				section(0.48, width * 0.45 * p.waistScale, depth * 0.43),
				section(0.8, width * 0.48 * p.chestScale, depth * 0.48),
				section(1, width * 0.3, depth * 0.3)
			]
		);
		face(
			'chest',
			{ x: 0, y: y + depth * 0.18, z: length * 0.5 + p.neckLength * k * 0.35 },
			{ x: 0, y: y + depth * 0.28, z: length * 0.5 + p.neckLength * k + head * 0.25 }
		);
		for (let pair = 0; pair < 3; pair++)
			for (const side of [-1, 1] as const) {
				const host = ['chest', 'spine', 'pelvis'][pair],
					z = world.get(host)!.z;
				limb(
					host,
					pair,
					side,
					{ x: side * width * 0.4, y, z },
					{ x: side * (width * 0.55 + legs * 0.4), y: y * 0.63, z: z + (pair - 1) * legs * 0.13 },
					{
						x: side * (width * 0.6 + legs * 0.6 + p.stanceWidth * k * 0.2),
						y: thick * 0.32,
						z: z + (pair - 1) * legs * 0.27
					}
				);
			}
		tail('pelvis');
	} else if (s.bodyPlan.id === 'serpentine') {
		const segments = Math.max(8, Math.min(24, s.bodyPlan.spineSegments)),
			ids: string[] = [],
			height = depth * 0.6;
		// A distinct long axial chain. Every segment is an independently deformable semantic spine.
		for (let n = 0; n < segments; n++) {
			const t = n / (segments - 1);
			ids.push(
				add(`spine-${n}`, n === 0 ? 'root' : `spine-${n - 1}`, 'spine', {
					x: 0,
					y: height + Math.sin(t * Math.PI) * depth * 0.12,
					z: (t - 0.5) * length
				})
			);
		}
		volume('serpentine-body', ids, [
			section(0, width * 0.035, depth * 0.035),
			section(0.15, width * 0.3, depth * 0.35),
			section(0.5, width * 0.5, depth * 0.5),
			section(0.78, width * 0.47 * p.chestScale, depth * 0.45),
			section(1, width * 0.24, depth * 0.25)
		]);
		const front = world.get(ids.at(-1)!)!;
		face(
			ids.at(-1)!,
			{ x: 0, y: front.y + head * 0.15, z: front.z + p.neckLength * k * 0.3 },
			{ x: 0, y: front.y + head * 0.3, z: front.z + p.neckLength * k + head * 0.35 }
		);
	} else throw new Error('Unsupported creature body plan');
	return rig;
}
