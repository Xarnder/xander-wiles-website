import {
	Bone,
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	MeshStandardMaterial,
	Skeleton,
	SkinnedMesh
} from 'three';
import type { CreatureCompilation, CreatureDefinition } from './CreatureTypes';
import { generateSkeleton, jointWorldPositions } from './SkeletonGenerator';
import { appendFeatures, generateFeatures } from './FeatureGenerator';
import { appendSweep, finishGeometry, geometryAccumulator } from './SweptBodyVolume';

export interface CompiledCreature {
	object: Group;
	skinnedMeshes: SkinnedMesh[];
	skeleton: Skeleton;
	bonesById: Map<string, Bone>;
	compilation: CreatureCompilation;
	dispose(): void;
}
const materials = new Map<string, { material: MeshStandardMaterial; users: number }>();

/** Pure recipe → transferable numeric arrays. Renderer resources are created separately. */
export function compileCreatureGeometry(
	definition: CreatureDefinition,
	lod: 0 | 1 = 0
): CreatureCompilation {
	const skeleton = generateSkeleton(definition);
	generateFeatures(definition, skeleton);
	const world = jointWorldPositions(skeleton),
		ids = new Map(skeleton.joints.map((j, n) => [j.id, n])),
		out = geometryAccumulator();
	for (const volume of skeleton.volumes)
		appendSweep(
			out,
			volume,
			volume.jointIds.map((id) => world.get(id)!),
			volume.jointIds.map((id) => ids.get(id)!),
			lod
		);
	appendFeatures(out, skeleton, world, lod);
	const min = { x: Infinity, y: Infinity, z: Infinity },
		max = { x: -Infinity, y: -Infinity, z: -Infinity };
	for (let n = 0; n < out.positions.length; n += 3) {
		min.x = Math.min(min.x, out.positions[n]);
		min.y = Math.min(min.y, out.positions[n + 1]);
		min.z = Math.min(min.z, out.positions[n + 2]);
		max.x = Math.max(max.x, out.positions[n]);
		max.y = Math.max(max.y, out.positions[n + 1]);
		max.z = Math.max(max.z, out.positions[n + 2]);
	}
	// Reference plane is computed from all generated anatomy, not an assumed human-sized offset.
	const shift = -min.y;
	skeleton.groundOffset = shift;
	skeleton.joints[0].localPosition.y += shift;
	for (const limb of skeleton.limbs) limb.restFoot.y += shift;
	for (let n = 1; n < out.positions.length; n += 3) out.positions[n] += shift;
	max.y += shift;
	min.y = 0;
	const palette = definition.species.appearance.palette,
		variation = definition.individual.paletteVariation;
	const color = (hex: string) => new Color(hex).offsetHSL(variation.hue, 0, variation.lightness);
	const primary = color(palette.primary),
		secondary = color(palette.secondary),
		accent = color(palette.accent),
		eye = new Color(palette.eye),
		colors: number[] = [];
	const height = max.y,
		span = Math.max(0.001, max.z - min.z);
	for (let n = 0; n < out.parts.length; n++) {
		const x = out.positions[n * 3],
			y = out.positions[n * 3 + 1] / height,
			z = (out.positions[n * 3 + 2] - min.z) / span,
			part = out.parts[n];
		let mix = 0;
		switch (palette.pattern) {
			case 'gradient':
				mix = 1 - y;
				break;
			case 'belly':
				mix = y < 0.52 ? 0.85 : 0;
				break;
			case 'stripe':
				mix = Math.abs(x) < (max.x - min.x) * 0.12 && y > 0.5 ? 1 : 0;
				break;
			case 'spots':
				mix =
					Math.sin((x / height) * 34 + definition.species.seed) *
						Math.sin(z * 35) *
						Math.cos(y * 29) >
					0.48
						? 1
						: 0;
				break;
			case 'bands':
				mix = Math.sin(z * 38) > 0.35 ? 1 : 0;
				break;
			case 'limb-tips':
				mix = part.startsWith('limb') && y < 0.25 ? 1 : 0;
				break;
		}
		const c =
			part === 'eye'
				? eye
				: part.startsWith('feature-')
					? accent
					: primary.clone().lerp(secondary, mix);
		colors.push(c.r, c.g, c.b);
	}
	const geometry = finishGeometry(out, colors);
	let hash = 2166136261;
	for (const array of [
		geometry.positions,
		geometry.indices,
		geometry.skinIndices,
		geometry.skinWeights,
		geometry.colors
	]) {
		const bytes = new Uint8Array(array.buffer);
		for (const byte of bytes) {
			hash ^= byte;
			hash = Math.imul(hash, 16777619);
		}
	}
	const bounds = {
		min,
		max,
		height: max.y,
		radius: Math.hypot(
			Math.max(Math.abs(min.x), Math.abs(max.x)),
			max.y / 2,
			Math.max(Math.abs(min.z), Math.abs(max.z))
		)
	};
	return {
		definition,
		skeleton,
		geometry,
		bounds,
		collision: {
			radius: Math.max(
				definition.species.proportions.bodyWidth * definition.individual.sizeFactor * 0.55,
				0.03
			),
			height: bounds.height
		},
		lod,
		fingerprint: `v1-${skeleton.joints.length}-${geometry.positions.length / 3}-${geometry.indices.length / 3}-${(hash >>> 0).toString(16)}`
	};
}
export function instantiateCreature(compilation: CreatureCompilation): CompiledCreature {
	const object = new Group();
	object.name = 'ProceduralCreature';
	const bonesById = new Map<string, Bone>();
	for (const joint of compilation.skeleton.joints) {
		const bone = new Bone();
		bone.name = joint.id;
		bone.position.set(joint.localPosition.x, joint.localPosition.y, joint.localPosition.z);
		bonesById.set(joint.id, bone);
		if (joint.parentId) bonesById.get(joint.parentId)!.add(bone);
		else object.add(bone);
	}
	const skeleton = new Skeleton([...bonesById.values()]),
		geometry = new BufferGeometry(),
		g = compilation.geometry;
	geometry.setAttribute('position', new BufferAttribute(g.positions, 3));
	geometry.setAttribute('normal', new BufferAttribute(g.normals, 3));
	geometry.setAttribute('color', new BufferAttribute(g.colors, 3));
	geometry.setAttribute('uv', new BufferAttribute(g.uvs, 2));
	geometry.setAttribute('skinIndex', new BufferAttribute(g.skinIndices, 4));
	geometry.setAttribute('skinWeight', new BufferAttribute(g.skinWeights, 4));
	geometry.setIndex(new BufferAttribute(g.indices, 1));
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	const palette = compilation.definition.species.appearance.palette,
		key = `${palette.roughness}:${palette.metalness}`;
	let entry = materials.get(key);
	if (!entry) {
		entry = {
			users: 0,
			material: new MeshStandardMaterial({
				vertexColors: true,
				roughness: palette.roughness,
				metalness: palette.metalness
			})
		};
		materials.set(key, entry);
	}
	entry.users++;
	const mesh = new SkinnedMesh(geometry, entry.material);
	mesh.name = 'OrganicBody';
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	object.add(mesh);
	object.updateMatrixWorld(true);
	mesh.bind(skeleton);
	mesh.boundingBox = geometry.boundingBox!.clone();
	mesh.boundingSphere = geometry.boundingSphere!.clone();
	mesh.boundingSphere.radius *= 1.3;
	let disposed = false;
	return {
		object,
		skinnedMeshes: [mesh],
		skeleton,
		bonesById,
		compilation,
		dispose() {
			if (disposed) return;
			disposed = true;
			geometry.dispose();
			skeleton.dispose();
			object.removeFromParent();
			object.clear();
			if (--entry!.users === 0) {
				entry!.material.dispose();
				materials.delete(key);
			}
		}
	};
}
export function compileCreature(definition: CreatureDefinition, lod: 0 | 1 = 0): CompiledCreature {
	return instantiateCreature(compileCreatureGeometry(definition, lod));
}
