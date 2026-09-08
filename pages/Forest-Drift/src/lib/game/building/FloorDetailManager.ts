import * as THREE from 'three';
import { FoundationRootRegistry } from './FoundationRootRegistry';
import type { FoundationDefinition } from './FoundationTypes';
import { buildFloorDetailGeometry } from './FloorDetailGeometryBuilder';
import { buildFloorDetailBoxes } from './floorDetailMath';
import type { FloorDetailDefinition } from './FloorDetailTypes';

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0x7ad0a0 });

interface FloorDetailEntry {
	definition: FloorDetailDefinition;
	mesh: THREE.Mesh;
	boundsHelper: THREE.LineSegments | null;
}

export interface FloorDetailManagerOptions {
	getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
}

/**
 * Owns every placed floor-detail mesh. Visual only — no collision, not registered with
 * WorldSurfaceSampler. One BuildingRoot per foundation, same pattern as SlabManager.
 */
export class FloorDetailManager {
	readonly group: THREE.Group;

	private readonly getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	private readonly getVertexSpacing: () => number;
	private readonly getBuildingGridSize: () => number;
	private readonly roots: FoundationRootRegistry;
	private readonly details = new Map<string, FloorDetailEntry>();
	private readonly material: THREE.MeshStandardMaterial;
	private showBounds = false;

	constructor(options: FloorDetailManagerOptions) {
		this.getFoundation = options.getFoundation;
		this.getVertexSpacing = options.getVertexSpacing;
		this.getBuildingGridSize = options.getBuildingGridSize;
		this.roots = new FoundationRootRegistry(this.getFoundation, this.getVertexSpacing);
		this.group = this.roots.group;
		this.material = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: 0.72,
			metalness: 0.02,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		});
	}

	private buildEntry(
		definition: FloorDetailDefinition,
		existing?: FloorDetailEntry
	): FloorDetailEntry | null {
		const root = this.roots.getOrCreate(definition.foundationId);
		if (!root) return null;

		const boxes = buildFloorDetailBoxes(definition, this.getBuildingGridSize());
		const geometry = buildFloorDetailGeometry(boxes);

		let mesh = existing?.mesh;
		if (mesh) {
			mesh.geometry.dispose();
			mesh.geometry = geometry;
		} else {
			mesh = new THREE.Mesh(geometry, this.material);
			mesh.userData.foundationId = definition.foundationId;
			mesh.userData.floorDetailId = definition.id;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			root.add(mesh);
		}

		const entry: FloorDetailEntry = {
			definition,
			mesh,
			boundsHelper: existing?.boundsHelper ?? null
		};
		this.refreshBoundsHelper(entry);
		return entry;
	}

	addFloorDetail(definition: FloorDetailDefinition): void {
		const entry = this.buildEntry(definition);
		if (entry) this.details.set(definition.id, entry);
	}

	removeFloorDetail(id: string): boolean {
		const entry = this.details.get(id);
		if (!entry) return false;
		entry.mesh.geometry.dispose();
		entry.mesh.removeFromParent();
		entry.boundsHelper?.geometry.dispose();
		entry.boundsHelper?.removeFromParent();
		this.details.delete(id);
		return true;
	}

	removeDetailsForFoundation(foundationId: string): void {
		for (const [id, entry] of this.details) {
			if (entry.definition.foundationId === foundationId) this.removeFloorDetail(id);
		}
		this.roots.remove(foundationId);
	}

	getFloorDetail(id: string): FloorDetailDefinition | undefined {
		return this.details.get(id)?.definition;
	}

	getDetailsForFoundation(foundationId: string): FloorDetailDefinition[] {
		return Array.from(this.details.values(), (entry) => entry.definition).filter(
			(detail) => detail.foundationId === foundationId
		);
	}

	getAllDetails(): FloorDetailDefinition[] {
		return Array.from(this.details.values(), (entry) => entry.definition);
	}

	getMeshesForRaycast(): THREE.Object3D[] {
		return Array.from(this.details.values(), (entry) => entry.mesh);
	}

	rebuildAll(): void {
		for (const entry of this.details.values()) {
			const rebuilt = this.buildEntry(entry.definition, entry);
			if (rebuilt) this.details.set(entry.definition.id, rebuilt);
		}
	}

	setShowBounds(visible: boolean): void {
		this.showBounds = visible;
		for (const entry of this.details.values()) this.refreshBoundsHelper(entry);
	}

	private refreshBoundsHelper(entry: FloorDetailEntry): void {
		entry.boundsHelper?.geometry.dispose();
		if (entry.boundsHelper) entry.mesh.remove(entry.boundsHelper);
		entry.boundsHelper = null;
		if (!this.showBounds) return;
		const edges = new THREE.EdgesGeometry(entry.mesh.geometry);
		entry.boundsHelper = new THREE.LineSegments(edges, boundsMaterial);
		entry.mesh.add(entry.boundsHelper);
	}

	serialize(): FloorDetailDefinition[] {
		return this.getAllDetails();
	}

	load(definitions: readonly FloorDetailDefinition[]): void {
		for (const id of Array.from(this.details.keys())) this.removeFloorDetail(id);
		for (const definition of definitions) this.addFloorDetail(definition);
	}

	dispose(): void {
		for (const id of Array.from(this.details.keys())) this.removeFloorDetail(id);
		this.material.dispose();
		this.roots.dispose();
	}
}
