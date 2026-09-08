import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import {
	computeSlabOpeningFrameBoxes,
	type SlabOpeningBounds,
	type SlabOpeningFrameSettings
} from './slabOpeningFrameMath';

/**
 * Timber lining inside one slab opening — four merged boxes in foundation-local X/Z/Y, parented as a
 * sibling of the slab mesh (never merged into it, so the hole's collision polygon is untouched).
 */
export function buildSlabOpeningFrame(
	hole: SlabOpeningBounds,
	slabTopY: number,
	slabBottomY: number,
	settings: SlabOpeningFrameSettings,
	materialManager: BuildingMaterialManager
): THREE.Group | null {
	const boxes = computeSlabOpeningFrameBoxes(hole, slabTopY, slabBottomY, settings);
	if (boxes.length === 0) return null;

	const pieces: THREE.BufferGeometry[] = [];
	for (const piece of boxes) {
		const geom = new THREE.BoxGeometry(
			piece.maxX - piece.minX,
			piece.maxY - piece.minY,
			piece.maxZ - piece.minZ
		);
		geom.translate(
			(piece.minX + piece.maxX) / 2,
			(piece.minY + piece.maxY) / 2,
			(piece.minZ + piece.maxZ) / 2
		);
		pieces.push(geom);
	}

	const merged = mergeGeometries(pieces, false);
	for (const piece of pieces) piece.dispose();
	if (!merged) return null;

	const material = materialManager.getMaterial('slab-opening-frame', undefined);
	const mesh = new THREE.Mesh(merged, material);
	mesh.name = 'slab-opening-frame-solid';
	mesh.castShadow = true;
	mesh.receiveShadow = true;

	const group = new THREE.Group();
	group.name = 'slab-opening-frame';
	group.add(mesh);
	return group;
}

export function disposeSlabOpeningFrame(group: THREE.Object3D): void {
	group.traverse((child) => {
		if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
			child.geometry.dispose();
		}
	});
	group.removeFromParent();
}
