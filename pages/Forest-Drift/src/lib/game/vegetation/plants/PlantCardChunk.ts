import * as THREE from 'three';
import { grassDensityAt, type GrassLodState } from '../grass/grassLod';
import type { createPlantCardTemplate } from './plantMaterial';
import type { PlantChunkData } from './plantPlacement';

/**
 * The far representation of one 32 m plant chunk: every plant (all species) as one axial card in
 * ONE InstancedBufferGeometry — one draw call. 24 bytes per plant (root xyz + four byte quads).
 * Rank-sorted, so density LOD is an instance-count cut from the chunk's nearest distance.
 */
export class PlantCardChunk {
	readonly mesh: THREE.Mesh;
	readonly count: number;
	readonly bufferBytes: number;
	drawn = 0;
	nearestDistance = Infinity;
	private readonly geometry: THREE.InstancedBufferGeometry;
	private readonly rankCounts: Uint32Array;
	private readonly maxDistanceScale: number;

	constructor(
		readonly chunkX: number,
		readonly chunkZ: number,
		private readonly chunkSize: number,
		data: PlantChunkData,
		template: ReturnType<typeof createPlantCardTemplate>,
		material: THREE.Material
	) {
		this.count = data.count;
		this.rankCounts = data.rankCounts;
		this.maxDistanceScale = data.maxDistanceScale;
		const geometry = new THREE.InstancedBufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(template.position, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(template.normal, 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(template.uv, 2));
		geometry.setIndex(new THREE.BufferAttribute(template.index, 1));
		const release = function (this: THREE.BufferAttribute) {
			(this as { array: unknown }).array = new Uint8Array(0);
		};
		// Roots stay CPU-side (the near ring reads them); the card bytes are dropped after upload.
		geometry.setAttribute('aPlantRoot', new THREE.InstancedBufferAttribute(data.positions, 3));
		geometry.setAttribute(
			'aCardShape',
			new THREE.InstancedBufferAttribute(data.cardShape, 4, true).onUpload(release)
		);
		geometry.setAttribute(
			'aCardPetal',
			new THREE.InstancedBufferAttribute(data.cardPetal, 4, true).onUpload(release)
		);
		geometry.setAttribute(
			'aCardCentre',
			new THREE.InstancedBufferAttribute(data.cardCentre, 4, true).onUpload(release)
		);
		geometry.setAttribute(
			'aCardLeaf',
			new THREE.InstancedBufferAttribute(data.cardLeaf, 4, true).onUpload(release)
		);
		geometry.instanceCount = 0;
		const x0 = chunkX * chunkSize;
		const z0 = chunkZ * chunkSize;
		geometry.boundingBox = new THREE.Box3(
			new THREE.Vector3(x0 - 1, data.minY - 0.1, z0 - 1),
			new THREE.Vector3(
				x0 + chunkSize + 1,
				data.maxY + data.maxHeight * 1.2 + 0.2,
				z0 + chunkSize + 1
			)
		);
		geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
		this.geometry = geometry;
		this.bufferBytes = data.positions.byteLength + data.cardShape.byteLength * 4;
		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.name = `plants:${chunkX}:${chunkZ}`;
		this.mesh.castShadow = false;
		this.mesh.visible = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.updateMatrixWorld(true);
	}

	distanceTo(x: number, z: number): number {
		const x0 = this.chunkX * this.chunkSize;
		const z0 = this.chunkZ * this.chunkSize;
		const dx = Math.max(x0 - x, 0, x - (x0 + this.chunkSize));
		const dz = Math.max(z0 - z, 0, z - (z0 + this.chunkSize));
		return Math.hypot(dx, dz);
	}

	/**
	 * Instances that could be visible from the camera: density only falls with distance, and the
	 * shader divides distance by each species' LOD scale, so the chunk's largest scale bounds it.
	 */
	updateView(cameraX: number, cameraZ: number, lod: GrassLodState, receiveShadow: boolean): number {
		this.nearestDistance = this.distanceTo(cameraX, cameraZ);
		let drawn = 0;
		if (this.count > 0) {
			const density = grassDensityAt(lod, this.nearestDistance / this.maxDistanceScale);
			drawn = density > 0 ? this.rankCounts[Math.min(256, Math.floor(density * 256) + 1)] : 0;
		}
		this.drawn = drawn;
		this.geometry.instanceCount = drawn;
		this.mesh.visible = drawn > 0;
		this.mesh.receiveShadow = receiveShadow;
		return drawn;
	}

	dispose(): void {
		this.mesh.removeFromParent();
		this.geometry.dispose();
	}
}
