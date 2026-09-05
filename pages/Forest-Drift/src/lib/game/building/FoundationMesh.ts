import * as THREE from 'three';
import type { FoundationDefinition } from './FoundationTypes';

/**
 * Shared by every placed foundation. polygonOffset nudges the *rendered* fragment depth only —
 * it never changes the logical topY, which stays exactly `maxTerrainHeight` — so a foundation top
 * that happens to be perfectly coplanar with the terrain at its highest sampled vertex doesn't
 * z-fight with it.
 */
const foundationMaterial = new THREE.MeshStandardMaterial({
	color: 0x8a8578,
	roughness: 0.92,
	metalness: 0.04,
	polygonOffset: true,
	polygonOffsetFactor: -1,
	polygonOffsetUnits: -1,
	flatShading: true
});

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0xfff2b0 });

/** Three.js representation of one placed FoundationDefinition — a plain cuboid intersecting the terrain. */
export class FoundationMesh {
	readonly object: THREE.Mesh;
	private readonly geometry: THREE.BoxGeometry;
	private boundsHelper: THREE.LineSegments | null = null;

	constructor(definition: FoundationDefinition, vertexSpacing: number) {
		const minX = definition.minGridX * vertexSpacing;
		const maxX = definition.maxGridX * vertexSpacing;
		const minZ = definition.minGridZ * vertexSpacing;
		const maxZ = definition.maxGridZ * vertexSpacing;

		const width = maxX - minX;
		const depth = maxZ - minZ;
		const height = definition.topY - definition.bottomY;

		this.geometry = new THREE.BoxGeometry(width, height, depth);
		this.object = new THREE.Mesh(this.geometry, foundationMaterial);
		this.object.position.set(
			(minX + maxX) / 2,
			(definition.topY + definition.bottomY) / 2,
			(minZ + maxZ) / 2
		);
		this.object.userData.foundationId = definition.id;
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
