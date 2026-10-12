import * as THREE from 'three';
import type { CompiledMiniBuildAsset } from './MiniBuildAsset';
import { miniBuildAssetKey, type MiniBuildAssetCache } from './MiniBuildAssetCache';
import type { WorldObb } from './miniBuildGrid';
import type { MiniBuildDefinition, SnapAngle } from './MiniBuildTypes';

/**
 * Fits a unit-box overlay (edges or fill) to a placed object's turned bounds, `pad` metres larger on
 * every axis — so the highlight around an object at 30° is the object's own box, not the square
 * around it.
 */
export function fitBoundsHighlight(object: THREE.Object3D, box: WorldObb, pad = 0): void {
	object.position.set(box.centerX, (box.minY + box.maxY) / 2, box.centerZ);
	object.rotation.set(0, Math.atan2(box.sin, box.cos), 0);
	object.scale.set(
		Math.max(0.1, box.halfX * 2 + pad),
		Math.max(0.1, box.maxY - box.minY + pad),
		Math.max(0.1, box.halfZ * 2 + pad)
	);
	object.updateMatrixWorld(true);
}

export const GHOST_VALID_COLOR = 0x39d353;
export const GHOST_INVALID_COLOR = 0xf85149;

/**
 * Translucent placement preview built from the *cached compiled asset* — the same geometry the
 * world renders, acquired once per design revision. Moving or rotating the ghost only changes one
 * matrix; nothing is rebuilt per frame and no editor cubes are ever used in the world.
 */
export class MiniBuildGhost {
	readonly group = new THREE.Group();
	private readonly cache: MiniBuildAssetCache;
	private asset: CompiledMiniBuildAsset | null = null;
	private key = '';
	private readonly meshes: THREE.Mesh[] = [];
	private readonly slotMaterials: THREE.MeshStandardMaterial[] = [];
	private readonly outlineMaterial = new THREE.LineBasicMaterial({
		color: GHOST_VALID_COLOR,
		transparent: true,
		opacity: 0.95
	});
	private readonly outline: THREE.LineSegments;
	private readonly footprintMaterial = new THREE.MeshBasicMaterial({
		color: GHOST_VALID_COLOR,
		transparent: true,
		opacity: 0.18,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	private readonly footprint: THREE.Mesh;

	constructor(cache: MiniBuildAssetCache) {
		this.cache = cache;
		this.group.name = 'mini-build-ghost';
		this.group.matrixAutoUpdate = false;
		this.outline = new THREE.LineSegments(
			new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
			this.outlineMaterial
		);
		this.outline.renderOrder = 12;
		this.outline.matrixAutoUpdate = false;
		this.footprint = new THREE.Mesh(
			new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
			this.footprintMaterial
		);
		this.footprint.renderOrder = 11;
		this.footprint.matrixAutoUpdate = false;
		this.group.add(this.outline, this.footprint);
		this.group.visible = false;
	}

	getMaterials(): THREE.Material[] {
		return [...this.slotMaterials, this.footprintMaterial];
	}

	get definitionKey(): string {
		return this.key;
	}

	setDefinition(definition: MiniBuildDefinition | null): void {
		const key = definition
			? `${miniBuildAssetKey(definition)}:${definition.materials.map((m) => (m.material.type === 'color' ? m.material.color : '')).join(',')}`
			: '';
		if (key === this.key) return;
		this.clearMeshes();
		this.key = key;
		if (!definition) return;
		this.asset = this.cache.acquire(definition);
		for (const entry of this.asset.geometries) {
			const slot = definition.materials[entry.materialSlot];
			let material = this.slotMaterials[entry.materialSlot];
			if (!material) {
				material = new THREE.MeshStandardMaterial({
					transparent: true,
					opacity: 0.68,
					depthWrite: false,
					roughness: 0.8
				});
				this.slotMaterials[entry.materialSlot] = material;
			}
			if (slot?.material.type === 'color') material.color.set(slot.material.color);
			const mesh = new THREE.Mesh(entry.geometry, material);
			mesh.matrixAutoUpdate = false;
			mesh.renderOrder = 10;
			this.meshes.push(mesh);
			this.group.add(mesh);
		}
		const size = new THREE.Vector3();
		const center = new THREE.Vector3();
		this.asset.bounds.getSize(size);
		this.asset.bounds.getCenter(center);
		this.outline.matrix.compose(center, new THREE.Quaternion(), size.clone().addScalar(0.02));
		this.footprint.matrix.compose(
			new THREE.Vector3(center.x, 0.012, center.z),
			new THREE.Quaternion(),
			new THREE.Vector3(size.x, 1, size.z)
		);
	}

	setTransform(position: { x: number; y: number; z: number }, rotationY: SnapAngle): void {
		this.group.matrix.makeRotationY((rotationY * Math.PI) / 180);
		this.group.matrix.setPosition(position.x, position.y, position.z);
		this.group.matrixWorldNeedsUpdate = true;
		this.group.updateMatrixWorld(true);
	}

	setValid(valid: boolean): void {
		const color = valid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
		this.outlineMaterial.color.setHex(color);
		this.footprintMaterial.color.setHex(color);
	}

	setVisible(visible: boolean): void {
		this.group.visible = visible && this.meshes.length > 0;
	}

	dispose(): void {
		this.clearMeshes();
		for (const material of this.slotMaterials) material?.dispose();
		this.outline.geometry.dispose();
		this.outlineMaterial.dispose();
		this.footprint.geometry.dispose();
		this.footprintMaterial.dispose();
		this.group.removeFromParent();
	}

	private clearMeshes(): void {
		for (const mesh of this.meshes) mesh.removeFromParent();
		this.meshes.length = 0;
		if (this.asset) this.cache.release(this.asset);
		this.asset = null;
		this.key = '';
		this.group.visible = false;
	}
}
