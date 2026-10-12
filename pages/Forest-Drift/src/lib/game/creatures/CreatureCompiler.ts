import {
	Bone,
	BufferAttribute,
	BufferGeometry,
	CatmullRomCurve3,
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
import { resolveCreatureSurface } from './surface/CreaturePatternGenerator';
import { classifyCreatureSurface } from './surface/CreatureSurfaceClassifier';
import { creatureSurfaceTable } from './surface/CreatureSurfaceTable';
import {
	CREATURE_LOD_QUALITY,
	appendEllipsoid,
	appendSweep,
	computeNormals,
	geometryAccumulator,
	regionIndex,
	volumePath
} from './SweptBodyVolume';
import { acquireCreatureMaterial, releaseCreatureMaterial } from './CreatureMaterial';

export interface CompiledCreature {
	object: Group;
	skinnedMeshes: SkinnedMesh[];
	skeleton: Skeleton;
	bonesById: Map<string, Bone>;
	compilation: CreatureCompilation;
	/** Row in the shared surface table (0 = plain, no procedural pattern). */
	surfaceSlot: number;
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
	lod: CreatureLod = 0,
	options: { surfaceDebug?: boolean } = {}
): CreatureCompilation {
	const skeleton = generateSkeleton(definition);
	const quality = CREATURE_LOD_QUALITY[lod];
	const world = jointWorldPositions(skeleton),
		ids = new Map(skeleton.joints.map((j, n) => [j.id, n])),
		out = geometryAccumulator();
	// Arc-length tables from the bind-pose paths (LOD-independent): bands space evenly along a part
	// whatever its segment lengths, and pattern scale follows the torso's real length.
	const arcTables = new Map<number, Float32Array>();
	let bodyScale = 0;
	for (const volume of skeleton.volumes) {
		const region = regionIndex(out, volume.part ?? 'torso', volume.id);
		const curve = new CatmullRomCurve3(
			volumePath(volume, world).map((p) => new Vector3(p.x, p.y, p.z)),
			false,
			'centripetal'
		);
		const lengths = curve.getLengths(32);
		const total = lengths[lengths.length - 1] || 1;
		arcTables.set(
			region,
			Float32Array.from(lengths, (l) => l / total)
		);
		out.regions[region].length = total;
		if (volume.part === 'torso') {
			// Pattern scale follows the body's length and girth: a short, round body should not pack
			// in more spots than a long, slim one of similar size.
			const girth = Math.max(...volume.sections.map((c) => c.radiusX + c.radiusY)) * Math.PI;
			bodyScale = Math.max(bodyScale, total, girth / 1.6);
		}
		appendSweep(
			out,
			volume,
			volumePath(volume, world),
			volume.jointIds.map((id) => ids.get(id)!),
			quality,
			{ region }
		);
	}
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
	const surfaceDefinition = resolveCreatureSurface(definition.species, definition.individual);
	if (!bodyScale) bodyScale = Math.max(1e-3, max.z - min.z);
	const classified = classifyCreatureSurface(out, positions, normals, surfaceDefinition, {
		plan: definition.species.bodyPlan.id,
		lod,
		bodyScale,
		accentExtremities: resolveSpeciesForm(definition.species).accentExtremities,
		debug: options.surfaceDebug,
		arc: (region, t) => {
			const table = arcTables.get(region);
			if (!table) return t;
			const f = Math.max(0, Math.min(1, t)) * (table.length - 1),
				i = Math.min(table.length - 2, Math.floor(f));
			return table[i] + (table[i + 1] - table[i]) * (f - i);
		}
	});
	const { colors, surface, surfacePattern } = classified;
	const geometry: CreatureCompiledGeometry = {
		positions,
		indices,
		normals,
		skinIndices: new Uint16Array(out.skinIndices),
		skinWeights: new Float32Array(out.skinWeights),
		uvs: new Float32Array(out.uvs),
		colors,
		surface,
		surfacePattern
	};
	let hash = 2166136261;
	for (const array of [
		geometry.positions,
		geometry.indices,
		geometry.skinIndices,
		geometry.skinWeights,
		geometry.colors,
		geometry.surfacePattern
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
		surface: surfaceDefinition,
		surfaceScale: bodyScale,
		surfaceDebug: classified.debug,
		fingerprint: `v1-${skeleton.joints.length}-${geometry.positions.length / 3}-${geometry.indices.length / 3}-${(hash >>> 0).toString(16)}`
	};
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
	// Each live creature owns a surface-table row; its index rides in the `surface` attribute.
	const table = creatureSurfaceTable();
	const slot = compilation.surface ? table.allocate() : 0;
	if (compilation.surface)
		table.write(slot, compilation.surface, compilation.lod, compilation.surfaceScale ?? 1);
	const surface = Uint16Array.from(g.surface);
	for (let i = 2; i < surface.length; i += 4) surface[i] = slot;
	geometry.setAttribute('surface', new BufferAttribute(surface, 4));
	geometry.setAttribute('surfacePattern', new BufferAttribute(g.surfacePattern, 4, true));
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
		surfaceSlot: slot,
		dispose() {
			if (disposed) return;
			disposed = true;
			geometry.dispose();
			skeleton.dispose();
			object.removeFromParent();
			object.clear();
			releaseCreatureMaterial(material);
			table.release(slot);
		}
	};
}
export function compileCreature(
	definition: CreatureDefinition,
	lod: CreatureLod = 0,
	material?: MeshStandardMaterial,
	options: { surfaceDebug?: boolean } = {}
): CompiledCreature {
	return instantiateCreature(compileCreatureGeometry(definition, lod, options), material);
}
