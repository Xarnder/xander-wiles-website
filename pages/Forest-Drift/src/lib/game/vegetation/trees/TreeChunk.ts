import * as THREE from 'three';
import { TRUNK_SINK } from './treePrototypeGenerator';
import {
	lodCastsShadow,
	lodReceivesShadow,
	selectTreeLod,
	uniformLodForRange,
	type TreeLodDistances
} from './treeLod';
import { TreePrototypeCache, type TreeShadowRange } from './TreePrototypeCache';
import { getTreeSpecies, nominalTreeHeight } from './treeSpecies';
import { TREE_SPECIES_IDS, type TreeInstanceDefinition, type TreeLod } from './TreeSpeciesTypes';

/** A placed tree plus the ground height and slope it was planted with (sampled once, at generation). */
export interface PlantedTree {
	tree: TreeInstanceDefinition;
	groundY: number;
	/** Terrain normal Y (1 = flat) — deeper planting on slopes so the root never floats. */
	normalY: number;
}

export interface TreeShadowPolicy {
	castShadows: boolean;
	/** LODs ≤ this cast shadows (−1 = none). */
	maxShadowLod: number;
}

/** Foliage cards for near batches: the card material and the farthest LOD that shows them. */
export interface TreeCardPolicy {
	material: THREE.Material;
	/** LODs ≤ this draw their cards (−1 = no cards). Cards only exist for LOD0/1. */
	maxLod: number;
}

/**
 * Height above the base at which LOD distance is measured: roughly the lower canopy, at least
 * 4 m (so tall spruces measure to their crown, not their roots).
 */
function lodProbeHeight(speciesHeight: number): number {
	return Math.max(4, speciesHeight * 0.35);
}

const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function batchKey(speciesIndex: number, variant: number, lod: TreeLod): string {
	const effective = TreePrototypeCache.effectiveVariant(variant, lod);
	return `${speciesIndex}:${effective}:${lod}`;
}

/**
 * One vegetation chunk's trees at runtime: compact per-tree arrays (no objects per tree) plus a
 * handful of `InstancedMesh` batches — one per (prototype, LOD) actually present in the chunk.
 * Batches are local to the chunk, so their bounding spheres are tight and both camera and shadow
 * frustum culling work; LOD changes rewrite the chunk's instance buffers (a few hundred matrices),
 * nothing is reallocated unless a batch outgrows its capacity.
 */
export class TreeChunk {
	readonly group = new THREE.Group();
	readonly chunkX: number;
	readonly chunkZ: number;
	readonly count: number;

	private readonly speciesIndex: Uint8Array;
	private readonly variant: Uint8Array;
	private readonly lod: Int8Array;
	/** Mid-canopy probe positions for LOD distance. */
	private readonly probes: Float32Array;
	private readonly matrices: Float32Array;
	private readonly tints: Float32Array;
	private readonly boundsMin = new THREE.Vector3(Infinity, Infinity, Infinity);
	private readonly boundsMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
	private readonly batches = new Map<string, THREE.InstancedMesh>();
	/**
	 * Foliage cards per near batch: same key, same instance buffers (shared attribute objects —
	 * no per-tree data is duplicated), drawn with the card material. Kept in `cardGroup` so the
	 * pipeline can leave them out of the AO pre-pass.
	 */
	private readonly cardBatches = new Map<string, THREE.InstancedMesh>();
	readonly cardGroup = new THREE.Group();
	/** Trees per (species, variant) — the capacity any LOD batch of that prototype can ever need. */
	private readonly prototypeCounts = new Map<string, number>();

	/** Camera position at the last LOD evaluation (for the movement threshold). */
	readonly lastEvaluation = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
	/** The LOD every tree shares, when the whole chunk lies in one band (null = mixed). */
	uniformLod: TreeLod | null = null;
	/** True until the first LOD assignment + batch build. */
	needsBuild = true;

	constructor(chunkX: number, chunkZ: number, planted: readonly PlantedTree[]) {
		this.chunkX = chunkX;
		this.chunkZ = chunkZ;
		this.count = planted.length;
		this.group.name = `trees:${chunkX},${chunkZ}`;
		this.cardGroup.name = `tree-cards:${chunkX},${chunkZ}`;
		this.speciesIndex = new Uint8Array(this.count);
		this.variant = new Uint8Array(this.count);
		this.lod = new Int8Array(this.count).fill(-1);
		this.probes = new Float32Array(this.count * 3);
		this.matrices = new Float32Array(this.count * 16);
		this.tints = new Float32Array(this.count * 3);

		planted.forEach(({ tree, groundY, normalY }, i) => {
			const species = getTreeSpecies(tree.speciesId);
			this.speciesIndex[i] = TREE_SPECIES_IDS.indexOf(tree.speciesId);
			this.variant[i] = tree.variant;
			const protoKey = `${this.speciesIndex[i]}:${tree.variant}`;
			this.prototypeCounts.set(protoKey, (this.prototypeCounts.get(protoKey) ?? 0) + 1);
			const speciesKey = `${this.speciesIndex[i]}:*`;
			this.prototypeCounts.set(speciesKey, (this.prototypeCounts.get(speciesKey) ?? 0) + 1);

			// Plant deeper on slopes: the trunk's downhill side would otherwise float.
			const slope = Math.sqrt(Math.max(0, 1 - normalY * normalY)) / Math.max(0.2, normalY);
			const sink = Math.min(0.6, slope * 0.35 * tree.scale);
			scratchPosition.set(tree.worldX, groundY - sink, tree.worldZ);
			scratchQuaternion.setFromAxisAngle(UP, tree.rotationY);
			scratchScale.set(tree.scale * tree.widthScale, tree.scale, tree.scale * tree.widthScale);
			scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
			scratchMatrix.toArray(this.matrices, i * 16);

			const height = nominalTreeHeight(species);
			this.probes[i * 3] = tree.worldX;
			this.probes[i * 3 + 1] = groundY + lodProbeHeight(height) * tree.scale;
			this.probes[i * 3 + 2] = tree.worldZ;
			this.boundsMin.min(new THREE.Vector3(tree.worldX, groundY - TRUNK_SINK, tree.worldZ));
			this.boundsMax.max(
				new THREE.Vector3(tree.worldX, groundY + Math.max(12, height) * tree.scale, tree.worldZ)
			);

			// Subtle per-tree tint: brightness and a slight warm/cool shift within the species' limits.
			const k = (tree.tint - 0.5) * 2 * species.style.tintVariation;
			const value = 1 + k * 0.12;
			this.tints[i * 3] = value * (1 + k * 0.05);
			this.tints[i * 3 + 1] = value;
			this.tints[i * 3 + 2] = value * (1 - k * 0.08);
		});
	}

	/** Closest and farthest distance from `camera` to any tree probe's bounding box. */
	distanceRange(camera: THREE.Vector3): [number, number] {
		if (this.count === 0) return [Infinity, Infinity];
		const min = this.boundsMin;
		const max = this.boundsMax;
		const dx = Math.max(min.x - camera.x, 0, camera.x - max.x);
		const dy = Math.max(min.y - camera.y, 0, camera.y - max.y);
		const dz = Math.max(min.z - camera.z, 0, camera.z - max.z);
		const fx = Math.max(Math.abs(camera.x - min.x), Math.abs(camera.x - max.x));
		const fy = Math.max(Math.abs(camera.y - min.y), Math.abs(camera.y - max.y));
		const fz = Math.max(Math.abs(camera.z - min.z), Math.abs(camera.z - max.z));
		return [Math.hypot(dx, dy, dz), Math.hypot(fx, fy, fz)];
	}

	/**
	 * Re-assigns LODs for the camera position. Returns true when any tree's LOD changed (the caller
	 * then rebuilds batches). Whole-chunk uniform bands short-circuit the per-tree loop.
	 */
	assignLods(camera: THREE.Vector3, distances: TreeLodDistances): boolean {
		this.lastEvaluation.copy(camera);
		const [near, far] = this.distanceRange(camera);
		const uniform = uniformLodForRange(near, far, distances);
		let changed = false;
		if (uniform !== null) {
			for (let i = 0; i < this.count; i++) {
				if (this.lod[i] !== uniform) {
					this.lod[i] = uniform;
					changed = true;
				}
			}
			this.uniformLod = uniform;
			return changed;
		}
		this.uniformLod = null;
		for (let i = 0; i < this.count; i++) {
			const dx = this.probes[i * 3] - camera.x;
			const dy = this.probes[i * 3 + 1] - camera.y;
			const dz = this.probes[i * 3 + 2] - camera.z;
			const lod = selectTreeLod(Math.sqrt(dx * dx + dy * dy + dz * dz), this.lod[i], distances);
			if (lod !== this.lod[i]) {
				this.lod[i] = lod;
				changed = true;
			}
		}
		return changed;
	}

	/** Writes every tree into its (prototype, LOD) batch, creating/growing/removing batches as needed. */
	rebuildBatches(
		cache: TreePrototypeCache,
		material: THREE.Material,
		shadows: TreeShadowPolicy,
		cards: TreeCardPolicy | null = null
	): void {
		this.needsBuild = false;
		const groups = new Map<string, number[]>();
		for (let i = 0; i < this.count; i++) {
			const lod = Math.max(0, this.lod[i]) as TreeLod;
			const key = batchKey(this.speciesIndex[i], this.variant[i], lod);
			let list = groups.get(key);
			if (!list) groups.set(key, (list = []));
			list.push(i);
		}

		for (const [key, mesh] of this.batches) {
			if (!groups.has(key)) {
				mesh.removeFromParent();
				mesh.dispose();
				this.batches.delete(key);
			}
		}
		for (const key of this.cardBatches.keys()) if (!groups.has(key)) this.removeCards(key);

		for (const [key, members] of groups) {
			const [speciesIndexText, variantText, lodText] = key.split(':');
			const speciesIndex = Number(speciesIndexText);
			const variant = Number(variantText);
			const lod = Number(lodText) as TreeLod;
			const capacity =
				lod === 3
					? (this.prototypeCounts.get(`${speciesIndex}:*`) ?? members.length)
					: (this.prototypeCounts.get(`${speciesIndex}:${variant}`) ?? members.length);
			let mesh = this.batches.get(key);
			if (mesh && mesh.instanceMatrix.count < members.length) {
				mesh.removeFromParent();
				mesh.dispose();
				mesh = undefined;
			}
			if (!mesh) {
				const geometry = cache.getGeometry(TREE_SPECIES_IDS[speciesIndex], variant, lod);
				mesh = new THREE.InstancedMesh(geometry, material, Math.max(capacity, members.length));
				mesh.instanceColor = new THREE.InstancedBufferAttribute(
					new Float32Array(mesh.instanceMatrix.count * 3),
					3
				);
				mesh.name = `trees:${this.chunkX},${this.chunkZ}:${key}`;
				mesh.userData.treeLod = lod;
				mesh.onBeforeShadow = drawShadowProxy;
				mesh.onAfterShadow = drawVisibleMesh;
				this.batches.set(key, mesh);
				this.group.add(mesh);
			}
			const matrixArray = mesh.instanceMatrix.array as Float32Array;
			const colorArray = (mesh.instanceColor as THREE.InstancedBufferAttribute)
				.array as Float32Array;
			members.forEach((treeIndex, slot) => {
				matrixArray.set(this.matrices.subarray(treeIndex * 16, treeIndex * 16 + 16), slot * 16);
				colorArray.set(this.tints.subarray(treeIndex * 3, treeIndex * 3 + 3), slot * 3);
			});
			mesh.count = members.length;
			mesh.instanceMatrix.needsUpdate = true;
			(mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
			mesh.computeBoundingSphere();
			mesh.computeBoundingBox();
			this.syncCards(key, mesh, cache, speciesIndex, variant, lod, cards);
		}
		this.applyShadowPolicy(shadows);
	}

	/** Creates, updates or drops the card mesh riding on one batch. */
	private syncCards(
		key: string,
		batch: THREE.InstancedMesh,
		cache: TreePrototypeCache,
		speciesIndex: number,
		variant: number,
		lod: TreeLod,
		cards: TreeCardPolicy | null
	): void {
		const geometry =
			cards && lod <= cards.maxLod
				? cache.getCardGeometry(TREE_SPECIES_IDS[speciesIndex], variant, lod)
				: null;
		let mesh = this.cardBatches.get(key);
		if (
			mesh &&
			(!geometry ||
				mesh.geometry !== geometry ||
				mesh.material !== cards?.material ||
				mesh.instanceMatrix !== batch.instanceMatrix)
		) {
			this.removeCards(key);
			mesh = undefined;
		}
		if (!geometry || !cards) return;
		if (!mesh) {
			mesh = new THREE.InstancedMesh(geometry, cards.material, 1);
			// Share the batch's buffers: same trees, same transforms and tints, uploaded once.
			mesh.instanceMatrix = batch.instanceMatrix;
			mesh.instanceColor = batch.instanceColor;
			mesh.name = `tree-cards:${this.chunkX},${this.chunkZ}:${key}`;
			mesh.castShadow = false;
			mesh.receiveShadow = lodReceivesShadow(lod);
			this.cardBatches.set(key, mesh);
			this.cardGroup.add(mesh);
		}
		mesh.count = batch.count;
		mesh.computeBoundingSphere();
	}

	/**
	 * Drops a card mesh without `dispose()`: its instance buffers belong to the batch (disposing
	 * would free the batch's GPU buffers), and it owns no other GPU resources.
	 */
	private removeCards(key: string): void {
		this.cardBatches.get(key)?.removeFromParent();
		this.cardBatches.delete(key);
	}

	getCardBatches(): IterableIterator<THREE.InstancedMesh> {
		return this.cardBatches.values();
	}

	get cardBatchCount(): number {
		return this.cardBatches.size;
	}

	applyShadowPolicy(shadows: TreeShadowPolicy): void {
		for (const mesh of this.batches.values()) {
			const lod = mesh.userData.treeLod as TreeLod;
			mesh.castShadow = shadows.castShadows && lodCastsShadow(lod, shadows.maxShadowLod);
			mesh.receiveShadow = lodReceivesShadow(lod);
		}
	}

	getBatches(): IterableIterator<THREE.InstancedMesh> {
		return this.batches.values();
	}

	get batchCount(): number {
		return this.batches.size;
	}

	/** Trees per LOD (index 0..3). */
	lodCounts(out: number[]): void {
		for (let i = 0; i < this.count; i++) out[Math.max(0, this.lod[i])]++;
	}

	/** Bytes held by this chunk's per-tree arrays and instance buffers. */
	memoryBytes(): number {
		let bytes =
			this.speciesIndex.byteLength +
			this.variant.byteLength +
			this.lod.byteLength +
			this.probes.byteLength +
			this.matrices.byteLength +
			this.tints.byteLength;
		for (const mesh of this.batches.values()) {
			bytes += mesh.instanceMatrix.array.byteLength + (mesh.instanceColor?.array.byteLength ?? 0);
		}
		return bytes;
	}

	dispose(): void {
		for (const key of [...this.cardBatches.keys()]) this.removeCards(key);
		for (const mesh of this.batches.values()) mesh.dispose();
		this.batches.clear();
		this.group.removeFromParent();
		this.group.clear();
		this.cardGroup.removeFromParent();
	}
}

/**
 * Shadow pass: draw the prototype's coarser shadow proxy instead of its visible triangles (see
 * `TreeShadowRange`). Plain functions, called with the batch as `this` — no closure per batch.
 */
function drawShadowProxy(this: THREE.Mesh): void {
	const range = this.geometry.userData.treeShadowRange as TreeShadowRange | undefined;
	if (range) this.geometry.setDrawRange(range[0], range[1]);
}

function drawVisibleMesh(this: THREE.Mesh): void {
	const range = this.geometry.userData.treeShadowRange as TreeShadowRange | undefined;
	if (range) this.geometry.setDrawRange(0, range[0]);
}
