import { acquireCharacterTextures } from './CharacterTextures';
import { MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Group, SkinnedMesh, Material } from 'three';
import characterUrl from './assets/character.glb?url';

/** One cache per renderer lifetime: late completions are disposed after detach. */
export class CharacterAssetCache {
	private pending: Promise<Group> | null = null;
	private asset: Group | null = null;
	private disposed = false;
	private textures: ReturnType<typeof acquireCharacterTextures> | null = null;
	load(): Promise<Group> {
		return (this.pending ??= new GLTFLoader().loadAsync(characterUrl).then(({ scene }) => {
			if (this.disposed) {
				disposeAsset(scene);
				throw new Error('Character cache disposed');
			}
			this.textures = acquireCharacterTextures();
			scene.traverse((object) => {
				const mesh = object as SkinnedMesh;
				if (!mesh.isMesh) return;
				for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
					if (material instanceof MeshStandardMaterial) this.textures!.bind(material);
			});
			this.asset = scene;
			return scene;
		}));
	}
	dispose(): void {
		this.disposed = true;
		if (this.asset) disposeAsset(this.asset);
		this.asset = null;
		this.textures?.release();
		this.textures = null;
	}
}
function disposeAsset(root: Group): void {
	const materials = new Set<Material>();
	root.traverse((object) => {
		const mesh = object as SkinnedMesh;
		if (!mesh.isMesh) return;
		mesh.geometry.dispose();
		if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
		for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
			materials.add(material);
	});
	for (const material of materials) material.dispose();
}
