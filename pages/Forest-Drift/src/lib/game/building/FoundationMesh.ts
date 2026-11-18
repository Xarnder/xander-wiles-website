import * as THREE from 'three';
import type { FoundationDefinition } from './FoundationTypes';
import {
	basementDeckUndersideY,
	basementFootingBottomY,
	basementLowestFloorY,
	basementRetainingWallRects
} from './basementMath';

const boundsMaterial = new THREE.LineBasicMaterial({ color: 0xfff2b0 });
/**
 * A basement foundation's own mesh is an invisible deck-height block (the same idea as an earth
 * pad's proxy): tools that aim at a foundation's top (Wall, Poly Wall, Remove, Paint …) still hit
 * it from above, while what players see on top is the deck slab. Never drawn, never shadowed.
 */
const basementProxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
/** The proxy's top sits just under the deck's, so a ray from above meets the deck slab first. */
const PROXY_TOP_DROP = 0.002;

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
 *
 * A foundation with a basement (basementMath.ts) is drawn as its derived parts instead: a footing
 * from its bottom up to the lowest floor (whose top face is that floor), and the four stone walls
 * up to the deck's underside, as children of the invisible proxy above. The deck itself is a slab.
 */
export class FoundationMesh {
	readonly object: THREE.Mesh;
	private readonly geometry: THREE.BoxGeometry;
	private boundsHelper: THREE.LineSegments | null = null;
	/** Basement parts (footing first, then the walls); empty for a solid foundation. */
	private readonly parts: THREE.Mesh[] = [];
	private readonly definition: FoundationDefinition;

	/** `material` may be per-face (`BoxGeometry` group order) — see `BuildingMaterialManager.getFoundationMaterials`. */
	constructor(
		definition: FoundationDefinition,
		vertexSpacing: number,
		material: THREE.Material | THREE.Material[]
	) {
		this.definition = definition;
		const minX = definition.minGridX * vertexSpacing;
		const maxX = definition.maxGridX * vertexSpacing;
		const minZ = definition.minGridZ * vertexSpacing;
		const maxZ = definition.maxGridZ * vertexSpacing;

		const width = maxX - minX;
		const depth = maxZ - minZ;

		if (definition.basement) {
			const proxyTop = definition.topY - PROXY_TOP_DROP;
			const proxyBottom = basementDeckUndersideY(definition);
			this.geometry = new THREE.BoxGeometry(width, proxyTop - proxyBottom, depth);
			this.object = new THREE.Mesh(this.geometry, basementProxyMaterial);
			this.object.position.set((minX + maxX) / 2, (proxyTop + proxyBottom) / 2, (minZ + maxZ) / 2);
			this.object.userData.foundationId = definition.id;
			this.buildBasementParts(vertexSpacing, material);
			this.setSupportDepth(definition.topY, definition.bottomY);
			return;
		}

		const height = definition.topY - definition.bottomY;
		this.geometry = new THREE.BoxGeometry(width, height, depth);
		this.object = new THREE.Mesh(this.geometry, material);
		this.object.castShadow = true;
		this.object.receiveShadow = true;
		this.object.position.set(
			(minX + maxX) / 2,
			(definition.topY + definition.bottomY) / 2,
			(minZ + maxZ) / 2
		);
		this.object.userData.foundationId = definition.id;
	}

	/** Whether this mesh draws a basement's parts (and its own object is only the invisible proxy). */
	get isBasement(): boolean {
		return this.parts.length > 0;
	}

	private buildBasementParts(spacing: number, material: THREE.Material | THREE.Material[]): void {
		const d = this.definition;
		const centre = this.object.position;
		const add = (
			minX: number,
			maxX: number,
			minY: number,
			maxY: number,
			minZ: number,
			maxZ: number
		) => {
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ),
				material
			);
			// Children of the proxy: positions are relative to its centre.
			mesh.position.set(
				(minX + maxX) / 2 - centre.x,
				(minY + maxY) / 2 - centre.y,
				(minZ + maxZ) / 2 - centre.z
			);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			mesh.userData.foundationId = d.id;
			this.object.add(mesh);
			this.parts.push(mesh);
		};
		const minX = d.minGridX * spacing;
		const maxX = d.maxGridX * spacing;
		const minZ = d.minGridZ * spacing;
		const maxZ = d.maxGridZ * spacing;
		const lowest = basementLowestFloorY(d)!;
		// Sized for 1 m and stretched by setSupportDepth, like a solid foundation's block.
		add(minX, maxX, lowest - 1, lowest, minZ, maxZ);
		for (const w of basementRetainingWallRects(d, spacing)) {
			const halfX = w.dirX === 1 ? w.halfLength : w.halfThickness;
			const halfZ = w.dirX === 1 ? w.halfThickness : w.halfLength;
			add(
				w.centerX - halfX,
				w.centerX + halfX,
				w.minWorldY,
				w.maxWorldY,
				w.centerZ - halfZ,
				w.centerZ + halfZ
			);
		}
		this.object.updateMatrixWorld(true);
	}

	/** World meshes that block the camera and can be raycast as solid stone (a basement's parts). */
	getSolidParts(): readonly THREE.Mesh[] {
		return this.parts;
	}

	setSupportDepth(top: number, bottom: number): void {
		if (this.parts.length > 0) {
			// Only the footing reaches down to the ground; its top stays the lowest floor.
			const footing = this.parts[0];
			const lowest = basementLowestFloorY(this.definition)!;
			const footingBottom = Math.min(bottom, basementFootingBottomY(this.definition));
			footing.scale.y = Math.max(0.01, lowest - footingBottom);
			footing.position.y = (lowest + footingBottom) / 2 - this.object.position.y;
			this.object.updateMatrixWorld(true);
			return;
		}
		const originalHeight = this.geometry.parameters.height;
		this.object.scale.y = (top - bottom) / originalHeight;
		this.object.position.y = (top + bottom) / 2;
		this.object.updateMatrixWorld(true);
	}

	setMaterial(material: THREE.Material | THREE.Material[]): void {
		if (this.parts.length > 0) {
			for (const part of this.parts) part.material = material;
			return;
		}
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
		for (const part of this.parts) part.geometry.dispose();
		this.boundsHelper?.geometry.dispose();
	}
}
