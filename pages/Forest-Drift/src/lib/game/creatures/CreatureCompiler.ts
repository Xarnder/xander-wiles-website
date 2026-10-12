import {
	Bone,
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	MeshStandardMaterial,
	Skeleton,
	SkinnedMesh,
	Vector3
} from 'three';
import type {
	CreatureCompilation,
	CreatureCompiledGeometry,
	CreatureDefinition,
	CreatureLod
} from './CreatureTypes';
import { generateSkeleton, jointWorldPositions } from './SkeletonGenerator';
import { appendFeatureGeometry } from './FeatureGenerator';
import { resolveSpeciesForm } from './CreatureForm';
import {
	CREATURE_LOD_QUALITY,
	appendEllipsoid,
	appendSweep,
	computeNormals,
	geometryAccumulator,
	regionIndex,
	volumePath,
	type GeometryAccumulator
} from './SweptBodyVolume';
import { acquireCreatureMaterial, releaseCreatureMaterial } from './CreatureMaterial';

export interface CompiledCreature {
	object: Group;
	skinnedMeshes: SkinnedMesh[];
	skeleton: Skeleton;
	bonesById: Map<string, Bone>;
	compilation: CreatureCompilation;
	dispose(): void;
}

const smooth = (a: number, b: number, x: number) => {
	const f = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return f * f * (3 - 2 * f);
};

/**
 * Pure recipe → transferable numeric arrays. Pipeline:
 * genome → logical skeleton → procedural volumes → attachment masses → features → skinning →
 * one merged, indexed geometry. Renderer resources are created separately.
 */
export function compileCreatureGeometry(
	definition: CreatureDefinition,
	lod: CreatureLod = 0
): CreatureCompilation {
	const skeleton = generateSkeleton(definition);
	const quality = CREATURE_LOD_QUALITY[lod];
	const world = jointWorldPositions(skeleton),
		ids = new Map(skeleton.joints.map((j, n) => [j.id, n])),
		out = geometryAccumulator();
	for (const volume of skeleton.volumes)
		appendSweep(
			out,
			volume,
			volumePath(volume, world),
			volume.jointIds.map((id) => ids.get(id)!),
			quality,
			{ region: regionIndex(out, volume.part ?? 'torso', volume.id) }
		);
	// Joint masses are sub-silhouette at far range; LOD2 keeps only the strong outline.
	for (const mass of quality.fineDetail ? (skeleton.masses ?? []) : []) {
		const host = ids.get(mass.hostJointId)!,
			limb = ids.get(mass.limbJointId)!;
		appendEllipsoid(out, {
			centre: new Vector3(mass.centre.x, mass.centre.y, mass.centre.z),
			axes: mass.axes.map((a) => new Vector3(a.x, a.y, a.z)) as [Vector3, Vector3, Vector3],
			radii: mass.radii,
			region: regionIndex(out, 'joint-mass', mass.kind),
			// Torso-side vertices follow the body, appendage-side vertices follow the limb.
			skin: (s) => {
				const w =
					mass.hostWeight[0] + (mass.hostWeight[1] - mass.hostWeight[0]) * smooth(-0.7, 0.85, s);
				return [
					[host, w],
					[limb, 1 - w]
				];
			},
			rings: quality.ellipsoidRings,
			sides: quality.ellipsoidSides
		});
	}
	for (const feature of skeleton.features) appendFeatureGeometry(out, feature, world, ids, quality);
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
	// The grammars build feet (and serpent bellies) on the y = 0 ground plane analytically, so the
	// reference plane — and therefore the skeleton — is identical at every LOD. The legacy
	// lowest-vertex shift moved the whole rig by a tessellation-dependent amount.
	skeleton.groundOffset = 0;
	min.y = 0;
	const positions = new Float32Array(out.positions),
		indices = new Uint32Array(out.indices);
	const normals = computeNormals(positions, indices);
	const { colors, surface } = colourise(out, positions, normals, definition, max.y);
	const geometry: CreatureCompiledGeometry = {
		positions,
		indices,
		normals,
		skinIndices: new Uint16Array(out.skinIndices),
		skinWeights: new Float32Array(out.skinWeights),
		uvs: new Float32Array(out.uvs),
		colors,
		surface
	};
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

const WHITE = new Color(1, 1, 1);
/**
 * Colour blocking without extra meshes: primary body, pale underside from the surface normal,
 * accent extremities and feature tips, glossy dark eyes with an emissive highlight. Patterns are
 * low-frequency and species-coherent — never per-vertex noise.
 */
function colourise(
	out: GeometryAccumulator,
	positions: Float32Array,
	normals: Float32Array,
	definition: CreatureDefinition,
	height: number
) {
	const species = definition.species,
		form = resolveSpeciesForm(species),
		palette = species.appearance.palette,
		variation = definition.individual.paletteVariation;
	const tone = (hex: string) => new Color(hex).offsetHSL(variation.hue, 0, variation.lightness);
	const primary = tone(palette.primary),
		secondary = tone(palette.secondary),
		accent = tone(palette.accent),
		eye = new Color(palette.eye);
	const dark = primary.clone().multiplyScalar(0.62);
	const nose = eye.clone().lerp(primary, 0.15);
	const horn = secondary.clone().lerp(accent, 0.3);
	const bodyRoughness = Math.max(0.62, Math.min(0.9, palette.roughness));
	const scale = Math.max(1e-4, species.proportions.bodyDepth * definition.individual.sizeFactor);
	const seed = species.seed % 997;
	const bellyStrength =
		form.bellyStrength *
		(palette.pattern === 'belly' ? 1.15 : palette.pattern === 'solid' ? 0.75 : 1);
	const count = positions.length / 3;
	const colors = new Float32Array(count * 3),
		surface = new Float32Array(count * 2);
	const c = new Color();
	for (let v = 0; v < count; v++) {
		const region = out.regions[out.region[v]],
			param = out.params[v];
		const x = positions[v * 3],
			y = positions[v * 3 + 1],
			z = positions[v * 3 + 2];
		const ny = normals[v * 3 + 1];
		let roughness = bodyRoughness,
			emissive = 0;
		switch (region.part) {
			case 'eye':
				c.copy(eye);
				roughness = 0.14;
				break;
			case 'eye-highlight':
				c.copy(WHITE);
				roughness = 1;
				emissive = 0.9;
				break;
			case 'nose':
				c.copy(nose);
				roughness = 0.35;
				break;
			case 'foot':
				if (region.kind === 'hoof') {
					c.copy(accent).multiplyScalar(0.85);
					roughness = 0.45;
				} else c.copy(primary).lerp(accent, 0.85 * form.accentExtremities);
				break;
			case 'hand':
				c.copy(primary).lerp(accent, 0.7 * form.accentExtremities);
				break;
			case 'feature':
				if (region.kind === 'horns') {
					c.copy(horn);
					roughness = 0.5;
				} else if (region.kind === 'antenna-tip') c.copy(accent);
				else
					c.copy(primary).lerp(
						accent,
						smooth(0.1, 0.65, param) * (0.6 + 0.4 * form.accentExtremities)
					);
				break;
			default: {
				c.copy(primary);
				// Top slightly deeper, underside paler.
				c.multiplyScalar(1 - 0.08 * Math.max(0, ny));
				const top = ny > -0.1;
				const axial = region.part === 'torso' || region.part === 'neck' || region.part === 'tail';
				switch (palette.pattern) {
					case 'gradient':
						c.lerp(secondary, (1 - y / Math.max(height, 1e-6)) * 0.45);
						break;
					case 'stripe':
						if (axial && Math.abs(x) < scale * 0.12 && ny > 0.5)
							c.lerp(dark, 0.7 * smooth(0.5, 0.8, ny));
						break;
					case 'spots': {
						const f = (Math.PI * 2) / (scale * 0.55);
						const n =
							Math.sin(x * f + seed) *
							Math.sin(y * f * 0.9 + seed * 0.7) *
							Math.sin(z * f * 1.1 + seed * 1.3);
						if (top && region.part !== 'muzzle') c.lerp(dark, 0.55 * smooth(0.32, 0.42, n));
						break;
					}
					case 'bands':
						// Along each part's own axis, so upright bipeds and serpents band correctly too.
						if (axial && top) c.lerp(dark, 0.5 * smooth(0.35, 0.55, Math.sin(param * 34 + seed)));
						break;
					case 'limb-tips':
						if (region.part === 'limb') c.lerp(accent, 0.85 * smooth(0.76, 0.84, param));
						if (region.part === 'tail') c.lerp(accent, 0.6 * smooth(0.75, 0.95, param));
						break;
				}
				let belly = region.part === 'limb' ? 0 : smooth(0.12, -0.55, ny) * bellyStrength;
				// Masses blend body → limb colour along their axis, so no pale band marks the limb root.
				if (region.part === 'joint-mass') belly *= 1 - smooth(0.15, 0.55, param);
				if (region.part === 'muzzle') belly = Math.max(belly, 0.6);
				if (
					region.part === 'limb' &&
					form.accentExtremities > 0.85 &&
					palette.pattern !== 'limb-tips'
				)
					c.lerp(accent, 0.6 * smooth(0.86, 0.93, param));
				c.lerp(secondary, Math.min(1, belly));
			}
		}
		colors[v * 3] = c.r;
		colors[v * 3 + 1] = c.g;
		colors[v * 3 + 2] = c.b;
		surface[v * 2] = roughness;
		surface[v * 2 + 1] = emissive;
	}
	return { colors, surface };
}

export function instantiateCreature(
	compilation: CreatureCompilation,
	material: MeshStandardMaterial = acquireCreatureMaterial()
): CompiledCreature {
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
	geometry.setAttribute('surface', new BufferAttribute(g.surface, 2));
	geometry.setAttribute('skinIndex', new BufferAttribute(g.skinIndices, 4));
	geometry.setAttribute('skinWeight', new BufferAttribute(g.skinWeights, 4));
	geometry.setIndex(new BufferAttribute(g.indices, 1));
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	const mesh = new SkinnedMesh(geometry, material);
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
			releaseCreatureMaterial(material);
		}
	};
}
export function compileCreature(
	definition: CreatureDefinition,
	lod: CreatureLod = 0,
	material?: MeshStandardMaterial
): CompiledCreature {
	return instantiateCreature(compileCreatureGeometry(definition, lod), material);
}
