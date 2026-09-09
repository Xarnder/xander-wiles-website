import * as THREE from 'three';
import { BuildingMaterialManager } from './BuildingMaterialManager';
import {
	composeFurnitureMatrix,
	createFurnitureGroup,
	createTorchBodyGeometry,
	createTorchFlameGeometry,
	disposeFurnitureGroup,
	type FurnitureVisualMaterials
} from './FurnitureGeometry';
import { getFurnitureCatalogueEntry, resolveFurnitureBuildInput } from './furnitureCatalogue';
import { furnitureCollisionRect, furnitureWorldAabb } from './furniturePlacementMath';
import { surfaceLightWorldPosition, torchLightWorldPosition } from './furnitureMath';
import type { FurnitureDefinition } from './FurnitureTypes';
import { furnitureColorMaterial } from './FurnitureTypes';
import type { BuildingMaterialDefinition } from './MaterialTypes';
import type { WallCollisionRect } from './wallCollision';

/** Real PointLights assigned to the nearest emissive furniture — the rest are emissive-only. */
export const MAX_ACTIVE_TORCH_LIGHTS = 6;
const INITIAL_CAPACITY = 32;
const TORCH_LIGHT_COLOR = 0xff8a3c;
const TORCH_LIGHT_INTENSITY = 4.6;
const TORCH_LIGHT_DISTANCE = 9;
const LANTERN_LIGHT_INTENSITY = 3.4;
const FIREPLACE_LIGHT_INTENSITY = 4.1;

interface ObjectEntry {
	definition: FurnitureDefinition;
	group: THREE.Group;
}

/**
 * All placed furniture. Torches stay instanced (two draw calls). Every other kind is one Group of
 * merged-per-material meshes. Lighting uses a small pool of shadowless PointLights on the nearest
 * torches, lanterns, and fireplaces.
 */
export class FurnitureManager {
	readonly group = new THREE.Group();

	private readonly items = new Map<string, FurnitureDefinition>();
	private readonly orderedIds: string[] = [];
	private readonly objectEntries = new Map<string, ObjectEntry>();
	private revision = 0;

	private readonly materialManager: BuildingMaterialManager;
	private readonly ownsMaterialManager: boolean;
	private readonly flameMaterial = new THREE.MeshStandardMaterial({
		color: 0xffb347,
		emissive: 0xff6a1a,
		emissiveIntensity: 2.4,
		roughness: 0.45,
		metalness: 0,
		flatShading: true
	});

	private readonly bodyGeometry = createTorchBodyGeometry();
	private readonly flameGeometry = createTorchFlameGeometry();
	private bodyMesh: THREE.InstancedMesh;
	private flameMesh: THREE.InstancedMesh;
	private capacity = INITIAL_CAPACITY;
	private torchIds: string[] = [];
	private readonly matrix = new THREE.Matrix4();
	private readonly aabbScratch = new THREE.Box3();
	private readonly sizeScratch = new THREE.Vector3();

	private readonly lights: THREE.PointLight[] = [];
	private readonly lightScratch = new THREE.Vector3();

	constructor(materialManager?: BuildingMaterialManager) {
		this.ownsMaterialManager = !materialManager;
		this.materialManager = materialManager ?? new BuildingMaterialManager();
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
		return [this.flameMaterial];
	}

	getPickMesh(): THREE.InstancedMesh {
		return this.bodyMesh;
	}

	getPickMeshes(): THREE.Object3D[] {
		const meshes: THREE.Object3D[] = [this.bodyMesh];
		for (const entry of this.objectEntries.values()) meshes.push(entry.group);
		return meshes;
	}

	idAtInstance(instanceId: number): string | undefined {
		return this.torchIds[instanceId];
	}

	idFromObject(object: THREE.Object3D | null): string | undefined {
		let current: THREE.Object3D | null = object;
		while (current) {
			const id = current.userData.furnitureId;
			if (typeof id === 'string') return id;
			current = current.parent;
		}
		return undefined;
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
		this.rebuild();
	}

	remove(id: string): boolean {
		if (!this.items.delete(id)) return false;
		const index = this.orderedIds.indexOf(id);
		if (index >= 0) this.orderedIds.splice(index, 1);
		this.disposeObject(id);
		this.revision++;
		this.rebuild();
		return true;
	}

	removeForFoundation(foundationId: string): void {
		const removeIds = this.orderedIds.filter(
			(id) => this.items.get(id)?.foundationId === foundationId
		);
		if (removeIds.length === 0) return;
		for (const id of removeIds) {
			this.items.delete(id);
			this.disposeObject(id);
			const index = this.orderedIds.indexOf(id);
			if (index >= 0) this.orderedIds.splice(index, 1);
		}
		this.revision++;
		this.rebuild();
	}

	serialize(): FurnitureDefinition[] {
		return this.getAll();
	}

	load(definitions: readonly FurnitureDefinition[]): void {
		for (const id of [...this.objectEntries.keys()]) this.disposeObject(id);
		this.items.clear();
		this.orderedIds.length = 0;
		for (const definition of definitions) {
			this.items.set(definition.id, definition);
			this.orderedIds.push(definition.id);
		}
		this.revision++;
		this.rebuild();
	}

	setMaterial(id: string, material: BuildingMaterialDefinition | undefined): boolean {
		const item = this.items.get(id);
		if (!item) return false;
		item.material = material;
		this.revision++;
		this.rebuild();
		return true;
	}

	getCollisionRects(): WallCollisionRect[] {
		const rects: WallCollisionRect[] = [];
		for (const item of this.items.values()) {
			const entry = getFurnitureCatalogueEntry(item.kind);
			const input = resolveFurnitureBuildInput({
				kind: item.kind,
				dimensions: item.dimensions,
				parameters: item.parameters
			});
			const rect = furnitureCollisionRect(
				item.x,
				item.y,
				item.z,
				input.width,
				input.depth,
				input.height,
				item.rotationY ?? 0,
				entry.collision
			);
			if (rect) rects.push(rect);
		}
		return rects;
	}

	getWorldAabb(id: string, target: THREE.Box3): boolean {
		const item = this.items.get(id);
		if (!item) return false;
		if (item.kind === 'torch') {
			composeFurnitureMatrix(item, this.matrix);
			this.aabbScratch.setFromCenterAndSize(
				new THREE.Vector3(item.x, item.y + 0.26, item.z),
				this.sizeScratch.set(0.16, 0.55, 0.16)
			);
			target.copy(this.aabbScratch);
			return true;
		}
		const object = this.objectEntries.get(id);
		if (object) {
			target.setFromObject(object.group);
			return true;
		}
		const input = resolveFurnitureBuildInput({
			kind: item.kind,
			dimensions: item.dimensions,
			parameters: item.parameters
		});
		const aabb = furnitureWorldAabb(
			item.x,
			item.y,
			item.z,
			input.width,
			input.depth,
			input.height,
			item.rotationY ?? 0
		);
		target.min.set(aabb.minX, aabb.minY, aabb.minZ);
		target.max.set(aabb.maxX, aabb.maxY, aabb.maxZ);
		return true;
	}

	getInstanceWorldMatrix(instanceId: number, target: THREE.Matrix4): boolean {
		const id = this.torchIds[instanceId];
		const item = id ? this.items.get(id) : undefined;
		if (!item) return false;
		composeFurnitureMatrix(item, target);
		return true;
	}

	/** Assign the light pool to the nearest emissive furniture and give them a cheap flicker. */
	updateLights(camera: THREE.Vector3, timeSeconds: number): void {
		const ranked = this.orderedIds
			.map((id) => this.items.get(id)!)
			.filter((item) => item.kind === 'torch' || item.kind === 'lantern' || item.kind === 'fireplace')
			.map((item) => ({
				item,
				distance: (item.x - camera.x) ** 2 + (item.y - camera.y) ** 2 + (item.z - camera.z) ** 2
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
			const pos = lightPositionFor(entry.item);
			this.lightScratch.set(pos.x, pos.y, pos.z);
			light.position.copy(this.lightScratch);
			const hash = hashId(entry.item.id);
			const flicker = 0.86 + 0.14 * Math.sin(timeSeconds * 9.2 + hash);
			const base =
				entry.item.kind === 'lantern'
					? LANTERN_LIGHT_INTENSITY
					: entry.item.kind === 'fireplace'
						? FIREPLACE_LIGHT_INTENSITY
						: TORCH_LIGHT_INTENSITY;
			light.intensity = base * flicker;
			light.visible = true;
		}
		this.flameMaterial.emissiveIntensity = 2.2 + 0.35 * Math.sin(timeSeconds * 8.4);
	}

	dispose(): void {
		for (const id of [...this.objectEntries.keys()]) this.disposeObject(id);
		this.bodyMesh.removeFromParent();
		this.flameMesh.removeFromParent();
		this.bodyMesh.dispose();
		this.flameMesh.dispose();
		this.bodyGeometry.dispose();
		this.flameGeometry.dispose();
		this.flameMaterial.dispose();
		if (this.ownsMaterialManager) this.materialManager.dispose();
		for (const light of this.lights) {
			light.removeFromParent();
			light.dispose();
		}
		this.group.removeFromParent();
	}

	private visualMaterialsFor(item: FurnitureDefinition): FurnitureVisualMaterials {
		const entry = getFurnitureCatalogueEntry(item.kind);
		const primary = item.material ?? furnitureColorMaterial(undefined, entry.defaultPrimary);
		const secondary =
			item.secondaryMaterial ?? furnitureColorMaterial(undefined, entry.defaultSecondary);
		return {
			primary: this.materialManager.getMaterial('furniture', primary),
			secondary: this.materialManager.getMaterial('furniture-accent', secondary),
			accent: this.materialManager.getMaterial('furniture-accent', secondary),
			emissive: this.flameMaterial
		};
	}

	private disposeObject(id: string): void {
		const entry = this.objectEntries.get(id);
		if (!entry) return;
		disposeFurnitureGroup(entry.group, false);
		this.objectEntries.delete(id);
	}

	private createBodyMesh(capacity: number): THREE.InstancedMesh {
		const mesh = new THREE.InstancedMesh(
			this.bodyGeometry,
			this.materialManager.getMaterial(
				'furniture',
				furnitureColorMaterial(undefined, getFurnitureCatalogueEntry('torch').defaultPrimary)
			),
			capacity
		);
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

	private rebuild(): void {
		this.torchIds = this.orderedIds.filter((id) => this.items.get(id)?.kind === 'torch');
		const count = this.torchIds.length;
		if (count > this.capacity) this.growCapacity(Math.max(this.capacity * 2, count));

		for (let i = 0; i < count; i++) {
			const item = this.items.get(this.torchIds[i])!;
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

		const keep = new Set<string>();
		for (const id of this.orderedIds) {
			const item = this.items.get(id)!;
			if (item.kind === 'torch') continue;
			keep.add(id);
			const existing = this.objectEntries.get(id);
			if (existing && definitionsMatch(existing.definition, item)) continue;
			this.disposeObject(id);
			const group = createFurnitureGroup(item, this.visualMaterialsFor(item));
			this.group.add(group);
			this.objectEntries.set(id, { definition: item, group });
		}
		for (const id of [...this.objectEntries.keys()]) {
			if (!keep.has(id)) this.disposeObject(id);
		}
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

function definitionsMatch(a: FurnitureDefinition, b: FurnitureDefinition): boolean {
	return (
		a.kind === b.kind &&
		a.x === b.x &&
		a.y === b.y &&
		a.z === b.z &&
		a.rotationY === b.rotationY &&
		a.dimensions?.width === b.dimensions?.width &&
		a.dimensions?.depth === b.dimensions?.depth &&
		a.dimensions?.height === b.dimensions?.height &&
		a.material?.color === b.material?.color &&
		a.secondaryMaterial?.color === b.secondaryMaterial?.color &&
		JSON.stringify(a.parameters) === JSON.stringify(b.parameters)
	);
}

function lightPositionFor(item: FurnitureDefinition): { x: number; y: number; z: number } {
	if (item.kind === 'torch') {
		return torchLightWorldPosition(
			{ x: item.x, y: item.y, z: item.z },
			{ x: item.nx, y: item.ny, z: item.nz }
		);
	}
	const input = resolveFurnitureBuildInput({
		kind: item.kind,
		dimensions: item.dimensions,
		parameters: item.parameters
	});
	if (item.kind === 'lantern' || item.kind === 'fireplace') {
		return surfaceLightWorldPosition({ x: item.x, y: item.y, z: item.z }, item.kind, input.height);
	}
	return { x: item.x, y: item.y + 0.4, z: item.z };
}

function hashId(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
	return hash * 0.001;
}
