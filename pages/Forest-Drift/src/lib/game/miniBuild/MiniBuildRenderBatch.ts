import * as THREE from 'three';
import type { CompiledMiniBuildAsset } from './MiniBuildAsset';
import type { WorldChunkId } from './MiniBuildTypes';

const INITIAL_CAPACITY = 8;

export interface MiniBuildRenderBatchOptions {
	key: string;
	chunkId: WorldChunkId;
	asset: CompiledMiniBuildAsset;
	/** One material per `asset.geometries` entry, already resolved (shared, cached materials). */
	materials: readonly THREE.Material[];
	parent: THREE.Object3D;
	castShadow: boolean;
}

/**
 * Every copy of one design revision (with one material signature) inside one Mini Build chunk:
 * a single InstancedMesh per material group. 50 identical single-material chairs in a chunk are one
 * draw call, not 50 meshes — and certainly not 800 cuboids.
 *
 * Spatially scoped on purpose: a batch's bounding sphere covers one 16m chunk, so frustum culling
 * stays useful, and unloading a chunk disposes its batches cleanly.
 *
 * Identity is never lost to instancing: `instanceIds[i]` is the logical MiniBuildInstance id drawn
 * at instance index `i`, maintained through swap-removal.
 */
export class MiniBuildRenderBatch {
	readonly key: string;
	readonly chunkId: WorldChunkId;
	readonly asset: CompiledMiniBuildAsset;
	private readonly materials: readonly THREE.Material[];
	private readonly parent: THREE.Object3D;
	private meshes: THREE.InstancedMesh[] = [];
	private matrices: Float32Array;
	private capacity: number;
	private readonly ids: string[] = [];
	private readonly indexById = new Map<string, number>();
	private castShadow: boolean;
	private dirty = false;

	constructor(options: MiniBuildRenderBatchOptions) {
		this.key = options.key;
		this.chunkId = options.chunkId;
		this.asset = options.asset;
		this.materials = options.materials;
		this.parent = options.parent;
		this.castShadow = options.castShadow;
		this.capacity = INITIAL_CAPACITY;
		this.matrices = new Float32Array(this.capacity * 16);
		this.createMeshes();
	}

	get count(): number {
		return this.ids.length;
	}

	get instanceIds(): readonly string[] {
		return this.ids;
	}

	getMeshes(): readonly THREE.InstancedMesh[] {
		return this.meshes;
	}

	has(id: string): boolean {
		return this.indexById.has(id);
	}

	/** Logical instance id for a raycast hit's `instanceId` on one of this batch's meshes. */
	idAt(instanceIndex: number): string | undefined {
		return this.ids[instanceIndex];
	}

	add(id: string, matrix: THREE.Matrix4): void {
		if (this.indexById.has(id)) {
			this.setMatrix(id, matrix);
			return;
		}
		if (this.ids.length >= this.capacity) this.grow(this.capacity * 2);
		const index = this.ids.length;
		this.ids.push(id);
		this.indexById.set(id, index);
		matrix.toArray(this.matrices, index * 16);
		this.dirty = true;
	}

	setMatrix(id: string, matrix: THREE.Matrix4): void {
		const index = this.indexById.get(id);
		if (index === undefined) return;
		matrix.toArray(this.matrices, index * 16);
		this.dirty = true;
	}

	remove(id: string): boolean {
		const index = this.indexById.get(id);
		if (index === undefined) return false;
		const last = this.ids.length - 1;
		if (index !== last) {
			const movedId = this.ids[last];
			this.matrices.copyWithin(index * 16, last * 16, last * 16 + 16);
			this.ids[index] = movedId;
			this.indexById.set(movedId, index);
		}
		this.ids.pop();
		this.indexById.delete(id);
		this.dirty = true;
		return true;
	}

	setCastShadow(castShadow: boolean): void {
		if (castShadow === this.castShadow) return;
		this.castShadow = castShadow;
		for (const mesh of this.meshes) mesh.castShadow = castShadow;
	}

	/** Uploads matrix changes once, however many add/remove calls preceded it. */
	commit(): void {
		if (!this.dirty) return;
		this.dirty = false;
		const count = this.ids.length;
		for (const mesh of this.meshes) {
			(mesh.instanceMatrix.array as Float32Array).set(this.matrices.subarray(0, count * 16));
			mesh.count = count;
			mesh.instanceMatrix.needsUpdate = true;
			mesh.computeBoundingSphere();
			mesh.visible = count > 0;
		}
	}

	dispose(): void {
		for (const mesh of this.meshes) {
			mesh.removeFromParent();
			// Geometry and materials are shared (asset cache / material manager) — only the per-batch
			// instance buffers belong to this batch.
			mesh.dispose();
		}
		this.meshes = [];
		this.ids.length = 0;
		this.indexById.clear();
	}

	private createMeshes(): void {
		this.meshes = this.asset.geometries.map((entry, i) => {
			const mesh = new THREE.InstancedMesh(entry.geometry, this.materials[i], this.capacity);
			mesh.name = `mini-build-batch:${this.key}:slot${entry.materialSlot}`;
			mesh.castShadow = this.castShadow;
			mesh.receiveShadow = true;
			mesh.frustumCulled = true;
			mesh.matrixAutoUpdate = false;
			mesh.count = 0;
			mesh.visible = false;
			mesh.userData.miniBuildBatchKey = this.key;
			this.parent.add(mesh);
			mesh.updateMatrix();
			mesh.updateMatrixWorld(true);
			return mesh;
		});
	}

	private grow(capacity: number): void {
		const next = new Float32Array(capacity * 16);
		next.set(this.matrices);
		this.matrices = next;
		this.capacity = capacity;
		for (const mesh of this.meshes) {
			mesh.removeFromParent();
			mesh.dispose();
		}
		this.createMeshes();
		this.dirty = true;
	}
}
