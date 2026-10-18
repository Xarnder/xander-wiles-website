import * as THREE from 'three';
import { grassInstancesWithin, type GrassLodState } from './grassLod';
import {
	GRASS_CARD_INDICES_CROSSED,
	GRASS_CARD_INDICES_SINGLE,
	type createGrassCardTemplate
} from './grassMaterial';
import type { GrassChunkData } from './grassPlacement';

/** Horizontal slack for card width and wind lean beyond a chunk's root rectangle, metres. */
const BOUNDS_PAD = 0.6;

/**
 * One grass chunk on the GPU: a single Mesh over an InstancedBufferGeometry — one draw call for
 * every tuft in the chunk. Instance data is three compact attributes (20 bytes per tuft, no
 * Matrix4), rank-sorted, so density LOD is just `instanceCount`. The CPU-side arrays are released
 * once uploaded. Per frame the chunk needs one distance check: how many instances could be visible
 * from the camera, and whether near tufts get the crossed-card pair.
 */
export class GrassChunk {
	readonly mesh: THREE.Mesh;
	readonly count: number;
	readonly bufferBytes: number;
	readonly candidates: number;
	private readonly geometry: THREE.InstancedBufferGeometry;
	private readonly rankCounts: Uint32Array;
	private readonly minX: number;
	private readonly minZ: number;
	private readonly maxX: number;
	private readonly maxZ: number;
	/** Instances drawn this frame (0 = hidden). */
	drawn = 0;
	crossed = false;
	nearestDistance = Infinity;

	constructor(
		readonly chunkX: number,
		readonly chunkZ: number,
		chunkSize: number,
		data: GrassChunkData,
		template: ReturnType<typeof createGrassCardTemplate>,
		material: THREE.Material,
		maxTuftHeight: number,
		boundsPad = BOUNDS_PAD
	) {
		this.count = data.count;
		this.candidates = data.candidates;
		this.rankCounts = data.rankCounts;
		const originX = chunkX * chunkSize;
		const originZ = chunkZ * chunkSize;
		this.minX = originX;
		this.minZ = originZ;
		this.maxX = originX + chunkSize;
		this.maxZ = originZ + chunkSize;

		const geometry = new THREE.InstancedBufferGeometry();
		// Each chunk owns tiny copies of the 12-vertex card template, so disposing a chunk never
		// releases buffers another chunk is still drawing with.
		geometry.setAttribute('position', new THREE.BufferAttribute(template.position, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(template.normal, 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(template.uv, 2));
		geometry.setIndex(new THREE.BufferAttribute(template.index, 1));
		const release = function (this: THREE.BufferAttribute) {
			// The GPU has the data now; drop the CPU copy.
			(this as { array: unknown }).array = new (this.array.constructor as Float32ArrayConstructor)(
				0
			);
		};
		geometry.setAttribute(
			'aGrassPos',
			new THREE.InstancedBufferAttribute(data.positions, 3).onUpload(release)
		);
		geometry.setAttribute(
			'aGrassShape',
			new THREE.InstancedBufferAttribute(data.shape, 4, true).onUpload(release)
		);
		geometry.setAttribute(
			'aGrassTint',
			new THREE.InstancedBufferAttribute(data.tint, 4, true).onUpload(release)
		);
		geometry.instanceCount = 0;
		geometry.setDrawRange(0, GRASS_CARD_INDICES_SINGLE);
		// Whole-chunk bounds (mesh-local: x/z from the chunk origin, absolute y), so three culls
		// every invisible chunk at once — the per-tuft data never needs a bounds pass.
		const top = data.maxY + maxTuftHeight;
		geometry.boundingBox = new THREE.Box3(
			new THREE.Vector3(-boundsPad, data.minY - 0.1, -boundsPad),
			new THREE.Vector3(chunkSize + boundsPad, top, chunkSize + boundsPad)
		);
		geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
		this.geometry = geometry;
		this.bufferBytes = data.positions.byteLength + data.shape.byteLength + data.tint.byteLength;

		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.name = `grass:${chunkX}:${chunkZ}`;
		this.mesh.position.set(originX, 0, originZ);
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.visible = false;
		this.mesh.updateMatrix();
		this.mesh.matrixAutoUpdate = false;
		this.mesh.updateMatrixWorld(true);
	}

	/** Distance in the ground plane from (x, z) to the nearest point of the chunk. */
	distanceTo(x: number, z: number): number {
		const dx = Math.max(this.minX - x, 0, x - this.maxX);
		const dz = Math.max(this.minZ - z, 0, z - this.maxZ);
		return Math.hypot(dx, dz);
	}

	/** Chooses this frame's instance count and card mode. Returns the instances drawn. */
	updateView(
		cameraX: number,
		cameraZ: number,
		lod: GrassLodState,
		crossedCardsEnd: number,
		receiveShadow: boolean
	): number {
		this.nearestDistance = this.distanceTo(cameraX, cameraZ);
		const drawn =
			this.count > 0 ? grassInstancesWithin(lod, this.rankCounts, this.nearestDistance) : 0;
		this.drawn = drawn;
		this.geometry.instanceCount = drawn;
		this.mesh.visible = drawn > 0;
		const crossed = crossedCardsEnd > 0 && this.nearestDistance < crossedCardsEnd;
		if (crossed !== this.crossed) {
			this.crossed = crossed;
			this.geometry.setDrawRange(
				0,
				crossed ? GRASS_CARD_INDICES_CROSSED : GRASS_CARD_INDICES_SINGLE
			);
		}
		this.mesh.receiveShadow = receiveShadow;
		return drawn;
	}

	dispose(): void {
		this.mesh.removeFromParent();
		this.geometry.dispose();
	}
}
