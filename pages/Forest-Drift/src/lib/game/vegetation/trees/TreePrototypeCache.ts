import * as THREE from 'three';
import { buildTreeMesh, designTree, type TreeDesign } from './treePrototypeGenerator';
import { getTreeSpecies } from './treeSpecies';
import { triangleCount, type TreeLod, type TreeSpeciesId } from './TreeSpeciesTypes';

export interface TreePrototypeCacheStats {
	designs: number;
	geometries: number;
	triangles: number;
	/** GPU bytes of all compiled prototype geometry (positions, normals, colours, wind, surface, indices). */
	bytes: number;
}

/**
 * Compiled tree prototypes, keyed by (species, variant, LOD). Geometry is built lazily the first
 * time a chunk needs it and then shared by every chunk batch in the world — chunk streaming never
 * rebuilds it. LOD3 silhouettes are shared per SPECIES (variant 0): prototype differences are
 * invisible at that distance, and sharing them means far chunks need one batch per species.
 *
 * Prototypes depend on the world seed (so different worlds grow different designs); `setWorldSeed`
 * drops the cache.
 */
export class TreePrototypeCache {
	private worldSeed: string;
	private readonly designs = new Map<string, TreeDesign>();
	private readonly geometries = new Map<string, THREE.BufferGeometry>();
	private triangles = 0;
	private bytes = 0;

	constructor(worldSeed: string) {
		this.worldSeed = worldSeed;
	}

	/** Variant actually used for a LOD (LOD3 collapses to one silhouette per species). */
	static effectiveVariant(variant: number, lod: TreeLod): number {
		return lod === 3 ? 0 : variant;
	}

	static key(speciesId: TreeSpeciesId, variant: number, lod: TreeLod): string {
		return `${speciesId}:${TreePrototypeCache.effectiveVariant(variant, lod)}:${lod}`;
	}

	setWorldSeed(seed: string): void {
		if (seed === this.worldSeed) return;
		this.dispose();
		this.worldSeed = seed;
	}

	getGeometry(speciesId: TreeSpeciesId, variant: number, lod: TreeLod): THREE.BufferGeometry {
		const key = TreePrototypeCache.key(speciesId, variant, lod);
		const cached = this.geometries.get(key);
		if (cached) return cached;

		const species = getTreeSpecies(speciesId);
		const designVariant = TreePrototypeCache.effectiveVariant(variant, lod);
		const designKey = `${speciesId}:${designVariant}`;
		let design = this.designs.get(designKey);
		if (!design) {
			design = designTree(species, designVariant, this.worldSeed);
			this.designs.set(designKey, design);
		}
		const mesh = buildTreeMesh(species, design, lod);
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
		geometry.setAttribute('treeWind', new THREE.BufferAttribute(mesh.wind, 1));
		geometry.setAttribute('treeSurface', new THREE.BufferAttribute(mesh.surface, 4));
		const vertexCount = mesh.positions.length / 3;
		geometry.setIndex(
			new THREE.BufferAttribute(
				vertexCount < 65536 ? new Uint16Array(mesh.indices) : mesh.indices,
				1
			)
		);
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		geometry.name = `tree:${key}`;
		this.geometries.set(key, geometry);
		this.triangles += triangleCount(mesh);
		this.bytes +=
			mesh.positions.byteLength +
			mesh.normals.byteLength +
			mesh.colors.byteLength +
			mesh.wind.byteLength +
			mesh.indices.length * (vertexCount < 65536 ? 2 : 4);
		return geometry;
	}

	getStats(): TreePrototypeCacheStats {
		return {
			designs: this.designs.size,
			geometries: this.geometries.size,
			triangles: this.triangles,
			bytes: this.bytes
		};
	}

	dispose(): void {
		for (const geometry of this.geometries.values()) geometry.dispose();
		this.geometries.clear();
		this.designs.clear();
		this.triangles = 0;
		this.bytes = 0;
	}
}
