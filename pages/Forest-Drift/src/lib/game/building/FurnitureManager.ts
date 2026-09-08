import * as THREE from 'three';
import {
	composeFurnitureMatrix,
	createTorchBodyGeometry,
	createTorchFlameGeometry
} from './FurnitureGeometry';
import { torchLightWorldPosition } from './furnitureMath';
import type { FurnitureDefinition } from './FurnitureTypes';

/** Real PointLights assigned to the nearest torches — the rest are emissive-only. */
export const MAX_ACTIVE_TORCH_LIGHTS = 6;
const INITIAL_CAPACITY = 32;
const TORCH_LIGHT_COLOR = 0xff8a3c;
const TORCH_LIGHT_INTENSITY = 4.6;
const TORCH_LIGHT_DISTANCE = 9;

/**
 * All placed furniture. Meshes are instanced (two draw calls for every torch). Lighting uses a
 * small pool of shadowless PointLights on the nearest items so hundreds of torches do not add
 * hundreds of lights.
 */
export class FurnitureManager {
	readonly group = new THREE.Group();

	private readonly items = new Map<string, FurnitureDefinition>();
	private readonly orderedIds: string[] = [];
	private revision = 0;

	private readonly bodyGeometry = createTorchBodyGeometry();
	private readonly flameGeometry = createTorchFlameGeometry();
	private readonly bodyMaterial = new THREE.MeshStandardMaterial({
		color: 0x5c3a22,
		roughness: 0.86,
		metalness: 0.04,
		flatShading: true
	});
	private readonly flameMaterial = new THREE.MeshStandardMaterial({
		color: 0xffb347,
		emissive: 0xff6a1a,
		emissiveIntensity: 2.4,
		roughness: 0.45,
		metalness: 0,
		flatShading: true
	});
	private bodyMesh: THREE.InstancedMesh;
	private flameMesh: THREE.InstancedMesh;
	private capacity = INITIAL_CAPACITY;
	private readonly matrix = new THREE.Matrix4();

	private readonly lights: THREE.PointLight[] = [];
	private readonly lightScratch = new THREE.Vector3();

	constructor() {
		this.group.name = 'furniture';
		this.bodyMesh = this.createBodyMesh(INITIAL_CAPACITY);
		this.flameMesh = this.createFlameMesh(INITIAL_CAPACITY);
		this.group.add(this.bodyMesh, this.flameMesh);

		for (let i = 0; i < MAX_ACTIVE_TORCH_LIGHTS; i++) {
			const light = new THREE.PointLight(TORCH_LIGHT_COLOR, 0, TORCH_LIGHT_DISTANCE, 2);
			light.castShadow = false;
			light.visible = false;
			this.group.add(light);
			this.lights.push(light);
		}
	}

	getRevision(): number {
		return this.revision;
	}

	getMaterials(): THREE.Material[] {
		return [this.bodyMaterial, this.flameMaterial];
	}

	getPickMesh(): THREE.InstancedMesh {
		return this.bodyMesh;
	}

	idAtInstance(instanceId: number): string | undefined {
		return this.orderedIds[instanceId];
	}

	get(id: string): FurnitureDefinition | undefined {
		return this.items.get(id);
	}

	getAll(): FurnitureDefinition[] {
		return this.orderedIds.map((id) => this.items.get(id)!).filter(Boolean);
	}

	add(definition: FurnitureDefinition): void {
		if (this.items.has(definition.id)) this.remove(definition.id);
		this.items.set(definition.id, definition);
		this.orderedIds.push(definition.id);
		this.revision++;
		this.rebuildInstances();
	}

	remove(id: string): boolean {
		if (!this.items.delete(id)) return false;
		const index = this.orderedIds.indexOf(id);
		if (index >= 0) this.orderedIds.splice(index, 1);
		this.revision++;
		this.rebuildInstances();
		return true;
	}

	removeForFoundation(foundationId: string): void {
		const removeIds = this.orderedIds.filter(
			(id) => this.items.get(id)?.foundationId === foundationId
		);
		if (removeIds.length === 0) return;
		for (const id of removeIds) {
			this.items.delete(id);
			const index = this.orderedIds.indexOf(id);
			if (index >= 0) this.orderedIds.splice(index, 1);
		}
		this.revision++;
		this.rebuildInstances();
	}

	serialize(): FurnitureDefinition[] {
		return this.getAll();
	}

	load(definitions: readonly FurnitureDefinition[]): void {
		this.items.clear();
		this.orderedIds.length = 0;
		for (const definition of definitions) {
			this.items.set(definition.id, definition);
			this.orderedIds.push(definition.id);
		}
		this.revision++;
		this.rebuildInstances();
	}

	/** Assign the light pool to the nearest torches and give them a cheap flicker. */
	updateLights(camera: THREE.Vector3, timeSeconds: number): void {
		const ranked = this.orderedIds
			.map((id) => this.items.get(id)!)
			.filter((item) => item.kind === 'torch')
			.map((item) => ({
				item,
				distance:
					(item.x - camera.x) ** 2 + (item.y - camera.y) ** 2 + (item.z - camera.z) ** 2
			}))
			.sort((a, b) => a.distance - b.distance);

		for (let i = 0; i < this.lights.length; i++) {
			const light = this.lights[i];
			const entry = ranked[i];
			if (!entry) {
				light.visible = false;
				light.intensity = 0;
				continue;
			}
			const pos = torchLightWorldPosition(
				{ x: entry.item.x, y: entry.item.y, z: entry.item.z },
				{ x: entry.item.nx, y: entry.item.ny, z: entry.item.nz }
			);
			this.lightScratch.set(pos.x, pos.y, pos.z);
			light.position.copy(this.lightScratch);
			const hash = hashId(entry.item.id);
			const flicker = 0.86 + 0.14 * Math.sin(timeSeconds * 9.2 + hash);
			light.intensity = TORCH_LIGHT_INTENSITY * flicker;
			light.visible = true;
		}
		this.flameMaterial.emissiveIntensity = 2.2 + 0.35 * Math.sin(timeSeconds * 8.4);
	}

	getInstanceWorldMatrix(instanceId: number, target: THREE.Matrix4): boolean {
		const id = this.orderedIds[instanceId];
		const item = id ? this.items.get(id) : undefined;
		if (!item) return false;
		composeFurnitureMatrix(item, target);
		return true;
	}

	dispose(): void {
		this.bodyMesh.removeFromParent();
		this.flameMesh.removeFromParent();
		this.bodyMesh.dispose();
		this.flameMesh.dispose();
		this.bodyGeometry.dispose();
		this.flameGeometry.dispose();
		this.bodyMaterial.dispose();
		this.flameMaterial.dispose();
		for (const light of this.lights) {
			light.removeFromParent();
			light.dispose();
		}
		this.group.removeFromParent();
	}

	private createBodyMesh(capacity: number): THREE.InstancedMesh {
		const mesh = new THREE.InstancedMesh(this.bodyGeometry, this.bodyMaterial, capacity);
		mesh.name = 'furniture-torch-body';
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.frustumCulled = true;
		mesh.count = 0;
		mesh.userData.furniturePick = true;
		return mesh;
	}

	private createFlameMesh(capacity: number): THREE.InstancedMesh {
		const mesh = new THREE.InstancedMesh(this.flameGeometry, this.flameMaterial, capacity);
		mesh.name = 'furniture-torch-flame';
		mesh.castShadow = false;
		mesh.receiveShadow = false;
		mesh.frustumCulled = true;
		mesh.count = 0;
		return mesh;
	}

	private rebuildInstances(): void {
		const count = this.orderedIds.length;
		if (count > this.capacity) this.growCapacity(Math.max(this.capacity * 2, count));

		for (let i = 0; i < count; i++) {
			const item = this.items.get(this.orderedIds[i])!;
			composeFurnitureMatrix(item, this.matrix);
			this.bodyMesh.setMatrixAt(i, this.matrix);
			this.flameMesh.setMatrixAt(i, this.matrix);
		}
		this.bodyMesh.count = count;
		this.flameMesh.count = count;
		this.bodyMesh.instanceMatrix.needsUpdate = true;
		this.flameMesh.instanceMatrix.needsUpdate = true;
		this.bodyMesh.computeBoundingSphere();
		this.flameMesh.computeBoundingSphere();
	}

	private growCapacity(capacity: number): void {
		const next = Math.ceil(capacity);
		this.capacity = next;
		this.bodyMesh.removeFromParent();
		this.flameMesh.removeFromParent();
		this.bodyMesh.dispose();
		this.flameMesh.dispose();
		this.bodyMesh = this.createBodyMesh(next);
		this.flameMesh = this.createFlameMesh(next);
		this.group.add(this.bodyMesh, this.flameMesh);
	}
}

function hashId(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
	return hash * 0.001;
}
