import * as THREE from 'three';
import {
	buildTreeMesh,
	buildTreeShadowProxy,
	designTree,
	type TreeDesign
} from './treePrototypeGenerator';
import { getTreeSpecies } from './treeSpecies';
import {
	triangleCount,
	type TreeLod,
	type TreeMeshData,
	type TreeSpeciesId
} from './TreeSpeciesTypes';

/**
 * `geometry.userData.treeShadowRange`: [first index, index count] of the shadow proxy appended
 * after the visible triangles. The draw range covers only the visible part; tree batches switch it
 * to the proxy for the shadow pass (`onBeforeShadow`) and back (`onAfterShadow`), so shadows cost
 * a fraction of the triangles with no extra objects or draw calls.
 */
export type TreeShadowRange = [start: number, count: number];

/** Visible mesh followed by its shadow proxy, in one set of buffers (indices offset). */
function appendMesh(main: TreeMeshData, proxy: TreeMeshData): TreeMeshData {
	const join = (a: Float32Array, b: Float32Array) => {
		const out = new Float32Array(a.length + b.length);
		out.set(a);
		out.set(b, a.length);
		return out;
	};
	const offset = main.positions.length / 3;
	const indices = new Uint32Array(main.indices.length + proxy.indices.length);
	indices.set(main.indices);
	for (let i = 0; i < proxy.indices.length; i++)
		indices[main.indices.length + i] = proxy.indices[i] + offset;
	return {
		positions: join(main.positions, proxy.positions),
		normals: join(main.normals, proxy.normals),
		colors: join(main.colors, proxy.colors),
		wind: join(main.wind, proxy.wind),
		surface: join(main.surface, proxy.surface),
		indices,
		min: main.min,
		max: main.max
	};
}

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
		const visible = buildTreeMesh(species, design, lod);
		const proxy = buildTreeShadowProxy(species, design, lod);
		const mesh = proxy ? appendMesh(visible, proxy) : visible;
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
		if (proxy) {
			const range: TreeShadowRange = [visible.indices.length, proxy.indices.length];
			geometry.userData.treeShadowRange = range;
			geometry.setDrawRange(0, visible.indices.length);
		}
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		geometry.name = `tree:${key}`;
		this.geometries.set(key, geometry);
		this.triangles += triangleCount(visible);
		this.bytes +=
			mesh.positions.byteLength +
			mesh.normals.byteLength +
			mesh.colors.byteLength +
			mesh.wind.byteLength +
			mesh.surface.byteLength +
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
