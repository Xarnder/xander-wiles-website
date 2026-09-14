import * as THREE from 'three';
import type { CompiledMiniBuildData } from './MiniBuildCompiler';
import type { MiniBuildCollisionBox } from './MiniBuildCollisionCompiler';

export interface CompiledMiniBuildGeometry {
	materialSlot: number;
	geometry: THREE.BufferGeometry;
}

/**
 * The GPU-facing form of a compiled design: at most one indexed BufferGeometry per material slot,
 * shared by every placed copy (instanced batches, the ghost preview, thumbnails). Never persisted.
 */
export interface CompiledMiniBuildAsset {
	readonly key: string;
	readonly designId: string;
	readonly designRevision: number;
	readonly contentHash: string;
	readonly geometries: readonly CompiledMiniBuildGeometry[];
	readonly bounds: THREE.Box3;
	readonly collision: readonly MiniBuildCollisionBox[];
	readonly primitiveCost: number;
	readonly data: CompiledMiniBuildData;
	readonly disposed: boolean;
	dispose(): void;
}

export function createMiniBuildAsset(
	key: string,
	data: CompiledMiniBuildData
): CompiledMiniBuildAsset {
	const bounds = new THREE.Box3(
		new THREE.Vector3(data.bounds.min.x, data.bounds.min.y, data.bounds.min.z),
		new THREE.Vector3(data.bounds.max.x, data.bounds.max.y, data.bounds.max.z)
	);
	const geometries = data.groups.map((group) => {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(group.positions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(group.normals, 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(group.uvs, 2));
		geometry.setIndex(new THREE.BufferAttribute(group.indices, 1));
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		geometry.name = `mini-build:${key}:slot${group.materialSlot}`;
		return { materialSlot: group.materialSlot, geometry };
	});
	let disposed = false;
	return {
		key,
		designId: data.designId,
		designRevision: data.designRevision,
		contentHash: data.contentHash,
		geometries,
		bounds,
		collision: data.collision,
		primitiveCost: data.primitiveCost,
		data,
		get disposed() {
			return disposed;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			for (const entry of geometries) entry.geometry.dispose();
		}
	};
}

/** Rough GPU/CPU byte estimate for the debug overlay: vertex attributes + indices. */
export function estimateMiniBuildDataBytes(data: CompiledMiniBuildData): number {
	let bytes = 0;
	for (const group of data.groups) {
		bytes +=
			group.positions.byteLength +
			group.normals.byteLength +
			group.uvs.byteLength +
			group.indices.byteLength;
	}
	return bytes;
}
