import surfaces from '../src/lib/game/characters/characterSurfaces.json' with { type: 'json' };
/** Reproducible runtime asset from the supplied FBX. Originals are never modified. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
	AnimationMixer,
	Box3,
	Color,
	Float32BufferAttribute,
	Group,
	MeshStandardMaterial,
	Quaternion,
	Vector3
} from 'three';

// GLTFExporter uses the browser FileReader API for binary buffers, not images here.
globalThis.FileReader = class {
	async readAsArrayBuffer(blob) {
		this.result = await blob.arrayBuffer();
		this.onloadend?.();
	}
	async readAsDataURL(blob) {
		this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
		this.onloadend?.();
	}
};
const source = new URL(
	'../assets/Character Model/New Forest Drift Charachter V2.fbx',
	import.meta.url
);
const bytes = await readFile(source);
const model = new FBXLoader().parse(
	bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	''
);
// Normalize semantic bone names once offline; all runtime consumers share this rig contract.
const boneNames = new Set();
model.traverse((node) => {
	if (node.isBone) {
		boneNames.add(node.name);
		node.name = `mixamorig${node.name}`;
	}
});
// Animation track bindings must follow the renamed bones.
for (const clip of model.animations)
	for (const track of clip.tracks)
		if (boneNames.has(track.name.split('.')[0])) track.name = `mixamorig${track.name}`;
for (const name of [
	'Hips',
	'Spine2',
	'Neck',
	'Head',
	...['Left', 'Right'].flatMap((side) =>
		['UpLeg', 'Leg', 'Foot', 'Arm', 'ForeArm', 'Hand'].map((part) => side + part)
	)
]) {
	if (!model.getObjectByName(`mixamorig${name}`)) throw new Error(`V2 rig missing ${name}`);
}
const mixer = new AnimationMixer(model);
mixer.clipAction(model.animations[0]).play();
mixer.update(0); // Capture relaxed arms; retain inverse bind matrices, not a new skin bind.
model.updateMatrixWorld(true);
const bounds = new Box3();
const point = new Vector3();
// Readable warm colours under gameplay lighting; source near-black swatches hide detail.
const characterPalette = {
	'Hair on Head': '#70503C',
	Trousers: '#806548',
	Shoes: '#624B3D',
	Belt: '#725039'
};
let triangles = 0;
model.traverse((mesh) => {
	if (!mesh.isSkinnedMesh) return;
	mesh.normalizeSkinWeights(); // FBXLoader keeps the four largest influences; normalize after truncation.
	mesh.skeleton.update();
	// Separate corners before projecting so material boundaries cannot share atlas UVs.
	const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
	mesh.geometry = geometry;
	const uv = new Float32Array(geometry.attributes.position.count * 2);
	const posed = [];
	const surfaceBounds = new Map();
	for (const group of geometry.groups) {
		const name = mesh.material[group.materialIndex].name;
		const box = surfaceBounds.get(name) ?? new Box3();
		for (let i = group.start; i < group.start + group.count; i++) {
			posed[i] = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
			box.expandByPoint(posed[i]);
		}
		surfaceBounds.set(name, box);
	}
	const colors = new Float32Array(geometry.attributes.position.count * 3);
	const indices = [[], []];
	for (const group of geometry.groups) {
		const material = mesh.material[group.materialIndex];
		const tint = material.name === 'Main Jacket Colour';
		const baseColor = characterPalette[material.name]
			? new Color(characterPalette[material.name])
			: material.color.clone().lerp(new Color('#ffffff'), material.name === 'Eyes' ? 0 : 0.06);
		const surface = surfaces.materials[material.name];
		if (!surface) throw new Error(`Unmapped character material: ${material.name}`);
		const tile = surfaces.surfaces.indexOf(surface);
		const box = surfaceBounds.get(material.name);
		const size = box.getSize(new Vector3());
		// Rest-space projection follows the skinned geometry. Hair V always follows upright
		// world Y, so strands descend the head rather than following arbitrary source UVs.
		for (let i = group.start; i < group.start + group.count; i += 3) {
			const normal = posed[i + 1]
				.clone()
				.sub(posed[i])
				.cross(posed[i + 2].clone().sub(posed[i]));
			const horizontal = Math.abs(normal.x) > Math.abs(normal.z) ? 'z' : 'x';
			const vertical =
				surface !== 'hair' && Math.abs(normal.y) > Math.max(Math.abs(normal.x), Math.abs(normal.z))
					? 'z'
					: 'y';
			const uAxis = vertical === 'z' ? 'x' : horizontal;
			for (let j = i; j < i + 3; j++) {
				const u = (posed[j][uAxis] - box.min[uAxis]) / Math.max(size[uAxis], 1e-6);
				const v = (posed[j][vertical] - box.min[vertical]) / Math.max(size[vertical], 1e-6);
				const inner = surfaces.tileSize - 2 * surfaces.gutter - 1;
				uv[j * 2] =
					((tile % surfaces.columns) * surfaces.tileSize + surfaces.gutter + 0.5 + u * inner) /
					(surfaces.columns * surfaces.tileSize);
				uv[j * 2 + 1] =
					(Math.floor(tile / surfaces.columns) * surfaces.tileSize +
						surfaces.gutter +
						0.5 +
						v * inner) /
					(surfaces.rows * surfaces.tileSize);
			}
		}
		for (let i = group.start; i < group.start + group.count; i++) {
			const vertex = geometry.index ? geometry.index.getX(i) : i;
			indices[tint ? 1 : 0].push(vertex);
			colors.set(tint ? [1, 1, 1] : baseColor.toArray(), vertex * 3);
		}
	}
	geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
	geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
	geometry.setIndex([...indices[0], ...indices[1]]);
	geometry.clearGroups();
	geometry.addGroup(0, indices[0].length, 0);
	geometry.addGroup(indices[0].length, indices[1].length, 1);
	mesh.material = [
		new MeshStandardMaterial({ name: 'Body', vertexColors: true, roughness: 0.85 }),
		new MeshStandardMaterial({ name: 'Clothing', vertexColors: true, roughness: 0.9 })
	];
	triangles += geometry.index.count / 3;
	mesh.geometry = mergeVertices(geometry);
	for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
		bounds.expandByPoint(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld));
});
const root = new Group();
root.name = 'ForestDriftCharacter';
const scale = 1.8 / (bounds.max.y - bounds.min.y);
// Source faces +Z. A parent transform preserves skin bind matrices and bone axes.
model.scale.multiplyScalar(scale);
model.rotation.y = Math.PI;
model.position.set(
	((bounds.min.x + bounds.max.x) * scale) / 2,
	-bounds.min.y * scale,
	((bounds.min.z + bounds.max.z) * scale) / 2
);
root.add(model);
root.updateMatrixWorld(true);
const bone = (name) => model.getObjectByName(`mixamorig${name}`);
const position = (name) => bone(name).getWorldPosition(new Vector3());
const dimensions = {
	bodyWidth: (bounds.max.x - bounds.min.x) * scale,
	bodyDepth: (bounds.max.z - bounds.min.z) * scale,
	pelvisHeight: position('Hips').y,
	pelvisDepthOffset: position('Hips').z,
	upperLegLength: position('LeftUpLeg').distanceTo(position('LeftLeg')),
	lowerLegLength: position('LeftLeg').distanceTo(position('LeftFoot'))
};
// Measure the same seated pose used by runtime, then restore the calibrated rest pose.
const rest = [];
for (const side of ['Left', 'Right']) {
	for (const [part, angle] of [
		['UpLeg', Math.PI / 2],
		['Leg', -Math.PI / 2],
		['ForeArm', -0.35]
	]) {
		const joint = bone(side + part);
		rest.push([joint, joint.quaternion.clone()]);
		const world = new Quaternion()
			.setFromAxisAngle(new Vector3(1, 0, 0), angle)
			.multiply(joint.getWorldQuaternion(new Quaternion()));
		joint.quaternion.copy(
			joint.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world)
		);
		joint.updateWorldMatrix(false, true);
	}
}
let sole = Infinity;
model.traverse((mesh) => {
	if (!mesh.isSkinnedMesh) return;
	for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
		sole = Math.min(sole, mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).y);
});
dimensions.seatedFootDrop = position('Hips').y - sole;
for (const [joint, rotation] of rest) joint.quaternion.copy(rotation);
root.updateMatrixWorld(true);
const output = await new GLTFExporter().parseAsync(root, { binary: true });
await writeFile(
	new URL('../src/lib/game/characters/assets/character.glb', import.meta.url),
	Buffer.from(output)
);
await writeFile(
	new URL('../src/lib/game/characters/assets/character.manifest.json', import.meta.url),
	JSON.stringify(
		{
			source: 'assets/Character Model/New Forest Drift Charachter V2.fbx',
			sha256: createHash('sha256').update(bytes).digest('hex'),
			height: 1.8,
			dimensions,
			triangles,
			materials: 2,
			bytes: output.byteLength,
			basePose: 'First frame of V2 supplied animation; procedural animation at runtime',
			scale
		},
		null,
		2
	) + '\n'
);
console.log({ triangles, scale, bytes: output.byteLength, bounds });
