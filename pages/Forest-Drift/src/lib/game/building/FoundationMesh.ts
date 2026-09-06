import * as THREE from 'three';
import type { FoundationDefinition } from './FoundationTypes';

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0xfff2b0 });

/**
 * Three.js representation of one placed FoundationDefinition — a plain cuboid intersecting the
 * terrain. `material` is resolved by the caller (FoundationManager, via BuildingMaterialManager)
 * rather than hardcoded here, so a painted foundation's colour override — and an unpainted one's
 * shared default look, `polygonOffset` included — both come from the same one place every other
 * building surface's material does. `polygonOffset` nudges the *rendered* fragment depth only — it
 * never changes the logical `topY`, which stays exactly `maxTerrainHeight` — so a foundation top
 * that happens to be perfectly coplanar with the terrain at its highest sampled vertex doesn't
 * z-fight with it; this is baked into the material itself (BuildingMaterialManager's `foundation`
 * template), not something this class has to know about.
 */
export class FoundationMesh {
	readonly object: THREE.Mesh;
	private readonly geometry: THREE.BoxGeometry;
	private boundsHelper: THREE.LineSegments | null = null;

	constructor(definition: FoundationDefinition, vertexSpacing: number, material: THREE.Material) {
		const minX = definition.minGridX * vertexSpacing;
		const maxX = definition.maxGridX * vertexSpacing;
		const minZ = definition.minGridZ * vertexSpacing;
		const maxZ = definition.maxGridZ * vertexSpacing;

		const width = maxX - minX;
		const depth = maxZ - minZ;
		const height = definition.topY - definition.bottomY;

		this.geometry = new THREE.BoxGeometry(width, height, depth);
		this.object = new THREE.Mesh(this.geometry, material);
		this.object.position.set(
			(minX + maxX) / 2,
			(definition.topY + definition.bottomY) / 2,
			(minZ + maxZ) / 2
		);
		this.object.userData.foundationId = definition.id;
	}

	setMaterial(material: THREE.Material): void {
		this.object.material = material;
	}

	setBoundsVisible(visible: boolean): void {
		if (!visible) {
			if (this.boundsHelper) this.boundsHelper.visible = false;
			return;
		}
		if (!this.boundsHelper) {
			const edges = new THREE.EdgesGeometry(this.geometry);
			this.boundsHelper = new THREE.LineSegments(edges, boundsMaterial);
			this.object.add(this.boundsHelper);
		}
		this.boundsHelper.visible = true;
	}

	dispose(): void {
		this.geometry.dispose();
		this.boundsHelper?.geometry.dispose();
	}
}
