import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import {
	skirtingStripsForWall,
	subtractDoorwaysFromStrips,
	type RoomLid,
	type SkirtingOpeningGap,
	type SkirtingStrip
} from './skirtingMath';
import type { Point2D } from './wallPathMath';

export interface SkirtingSettings {
	skirtingEnabled: boolean;
	skirtingHeight: number;
	skirtingDepth: number;
}

/**
 * Interior baseboard strips in the SAME wall-local (U, Y, Z) frame standalone wall meshes use.
 * Each strip sits on one face only (`faceSign`) and protrudes into the room past the wall face.
 * Returns `null` when skirting is disabled or there are no interior strips.
 */
export function buildWallSkirting(
	strips: readonly SkirtingStrip[],
	wallThickness: number,
	settings: SkirtingSettings,
	materialManager: BuildingMaterialManager
): THREE.Group | null {
	if (!settings.skirtingEnabled || strips.length === 0) return null;
	const height = settings.skirtingHeight;
	const depth = settings.skirtingDepth;
	if (height <= 0 || depth <= 0) return null;

	const boxes: THREE.BoxGeometry[] = [];
	for (const strip of strips) {
		const length = strip.maxU - strip.minU;
		if (length <= 0) continue;
		const box = new THREE.BoxGeometry(length, height, depth);
		const z = strip.faceSign * (wallThickness / 2 + depth / 2);
		box.translate((strip.minU + strip.maxU) / 2, height / 2, z);
		boxes.push(box);
	}
	if (boxes.length === 0) return null;

	const merged = mergeGeometries(boxes, false);
	for (const box of boxes) box.dispose();
	if (!merged) return null;

	const mesh = new THREE.Mesh(merged, materialManager.getMaterial('skirting', undefined));
	mesh.name = 'wall-skirting-solid';
	mesh.castShadow = true;
	mesh.receiveShadow = true;

	const group = new THREE.Group();
	group.name = 'wall-skirting';
	group.add(mesh);
	return group;
}

/** Resolves lid-edge overlaps + door gaps, then builds the wall-local skirting group. */
export function buildSkirtingForWall(
	wallStart: Point2D,
	wallEnd: Point2D,
	wallBaseY: number,
	wallHeight: number,
	wallThickness: number,
	openings: readonly SkirtingOpeningGap[],
	lids: readonly RoomLid[],
	settings: SkirtingSettings,
	materialManager: BuildingMaterialManager
): THREE.Group | null {
	const strips = subtractDoorwaysFromStrips(
		skirtingStripsForWall(wallStart, wallEnd, wallBaseY, wallHeight, lids),
		openings
	);
	return buildWallSkirting(strips, wallThickness, settings, materialManager);
}

export function disposeSkirting(group: THREE.Object3D): void {
	group.traverse((child) => {
		if (child instanceof THREE.Mesh) child.geometry.dispose();
	});
	group.removeFromParent();
}
