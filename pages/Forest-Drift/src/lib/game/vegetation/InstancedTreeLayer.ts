import * as THREE from 'three';

/**
 * One THREE.InstancedMesh (e.g. "variant A trunks") plus the packed-array bookkeeping instanced
 * rendering needs: active instances must occupy a contiguous [0, mesh.count) range, so removing
 * one from the middle swaps the last active instance into its place (O(1), no shifting/compaction
 * pass, no per-frame cost) rather than leaving a hole. `TOwner` is whatever the caller wants
 * attached to a slot; `onMoved` lets the caller update its own record of which slot an instance
 * lives in when a swap happens.
 */
export class InstancedTreeLayer<TOwner> {
	readonly mesh: THREE.InstancedMesh;

	private readonly owners: (TOwner | null)[];
	private readonly capacity: number;
	private count = 0;
	private readonly scratchMatrix = new THREE.Matrix4();

	constructor(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
		this.capacity = capacity;
		this.owners = new Array(capacity).fill(null);
		this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
		this.mesh.count = 0;
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.frustumCulled = false;
	}

	get activeCount(): number {
		return this.count;
	}

	get isFull(): boolean {
		return this.count >= this.capacity;
	}

	/** Adds an instance; returns its slot index, or -1 if the layer is at capacity. */
	add(matrix: THREE.Matrix4, owner: TOwner): number {
		if (this.count >= this.capacity) return -1;
		const index = this.count;
		this.mesh.setMatrixAt(index, matrix);
		this.owners[index] = owner;
		this.count++;
		this.mesh.count = this.count;
		this.mesh.instanceMatrix.needsUpdate = true;
		return index;
	}

	/** Swap-removes the instance at `index`. If another instance moved into its place, `onMoved` reports the new index for its owner. */
	remove(index: number, onMoved: (owner: TOwner, newIndex: number) => void): void {
		const lastIndex = this.count - 1;
		if (index < 0 || index > lastIndex) return;

		if (index !== lastIndex) {
			this.mesh.getMatrixAt(lastIndex, this.scratchMatrix);
			this.mesh.setMatrixAt(index, this.scratchMatrix);
			const movedOwner = this.owners[lastIndex];
			this.owners[index] = movedOwner;
			if (movedOwner !== null) onMoved(movedOwner, index);
		}

		this.owners[lastIndex] = null;
		this.count--;
		this.mesh.count = this.count;
		this.mesh.instanceMatrix.needsUpdate = true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		// Material is shared across every chunk's use of this layer — owned by TreeManager, not here.
	}
}
