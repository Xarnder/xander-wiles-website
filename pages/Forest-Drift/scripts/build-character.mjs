/** Reproducible runtime asset from the supplied FBX. Originals are never modified. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
	AnimationMixer,
	Box3,
	Float32BufferAttribute,
	Group,
	MeshStandardMaterial,
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
const source = new URL('../assets/Character Model/Breathing Idle.fbx', import.meta.url);
const bytes = await readFile(source);
const model = new FBXLoader().parse(
	bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	''
);
const mixer = new AnimationMixer(model);
mixer.clipAction(model.animations[0]).play();
mixer.update(0); // Capture relaxed arms; retain inverse bind matrices, not a new skin bind.
model.updateMatrixWorld(true);
const bounds = new Box3();
const point = new Vector3();
let triangles = 0;
model.traverse((mesh) => {
	if (!mesh.isSkinnedMesh) return;
	mesh.normalizeSkinWeights(); // FBXLoader keeps the four largest influences; normalize after truncation.
	mesh.skeleton.update();
	const geometry = mesh.geometry;
	const colors = new Float32Array(geometry.attributes.position.count * 3);
	const indices = [[], []];
	for (const group of geometry.groups) {
		const material = mesh.material[group.materialIndex];
		const tint = material.name === 'Grean Fabric';
		for (let i = group.start; i < group.start + group.count; i++) {
			const vertex = geometry.index ? geometry.index.getX(i) : i;
			indices[tint ? 1 : 0].push(vertex);
			colors.set(tint ? [1, 1, 1] : material.color.toArray(), vertex * 3);
		}
	}
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
const output = await new GLTFExporter().parseAsync(root, { binary: true });
await writeFile(
	new URL('../src/lib/game/characters/assets/character.glb', import.meta.url),
	Buffer.from(output)
);
await writeFile(
	new URL('../src/lib/game/characters/assets/character.manifest.json', import.meta.url),
	JSON.stringify(
		{
			source: 'assets/Character Model/Breathing Idle.fbx',
			sha256: createHash('sha256').update(bytes).digest('hex'),
			height: 1.8,
			triangles,
			materials: 2,
			bytes: output.byteLength,
			basePose: 'First frame of supplied breathing idle; procedural animation at runtime',
			scale
		},
		null,
		2
	) + '\n'
);
console.log({ triangles, scale, bytes: output.byteLength, bounds });
