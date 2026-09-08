import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import { stairCanonicalToLocalXZ, stairDirectionFlipsWinding } from './stairMath';
import type { StairLocalBounds, StairMetrics } from './stairMath';
import type { StairDirection } from './StairTypes';
import { computeStairFrameBoxes, type StairFrameSettings } from './stairFrameMath';

/**
 * Turns `computeStairFrameBoxes` into one merged mesh in foundation-local space — same remap
 * StairGeometryBuilder uses, so the timber stays locked to the stair solid. Not persisted; rebuilt
 * whenever the stair is. Returns `null` when framing is off or there is nothing to build.
 */
export function buildStairFrame(
	bounds: StairLocalBounds,
	direction: StairDirection,
	baseY: number,
	metrics: StairMetrics,
	settings: StairFrameSettings,
	materialManager: BuildingMaterialManager
): THREE.Group | null {
	const boxes = computeStairFrameBoxes(metrics, settings);
	if (boxes.length === 0) return null;

	const pieces: THREE.BufferGeometry[] = [];
	for (const piece of boxes) {
		const geom = new THREE.BoxGeometry(
			piece.maxRun - piece.minRun,
			piece.maxRise - piece.minRise,
			piece.maxWidth - piece.minWidth
		);
		if (piece.pitch) geom.rotateZ(piece.pitch);
		geom.translate(
			(piece.minRun + piece.maxRun) / 2,
			(piece.minRise + piece.maxRise) / 2,
			(piece.minWidth + piece.maxWidth) / 2
		);
		pieces.push(geom);
	}

	const merged = mergeGeometries(pieces, false);
	for (const piece of pieces) piece.dispose();
	if (!merged) return null;

	remapCanonicalStairGeometry(merged, bounds, direction, baseY);

	const material = materialManager.getMaterial('stair-frame', undefined);
	const mesh = new THREE.Mesh(merged, material);
	mesh.name = 'stair-frame-solid';
	mesh.castShadow = true;
	mesh.receiveShadow = true;

	const group = new THREE.Group();
	group.name = 'stair-frame';
	group.add(mesh);
	return group;
}

/** Same canonical→foundation-local remap StairGeometryBuilder applies to the stair solid. */
function remapCanonicalStairGeometry(
	geometry: THREE.BufferGeometry,
	bounds: StairLocalBounds,
	direction: StairDirection,
	baseY: number
): void {
	const positions = geometry.getAttribute('position');
	const normals = geometry.getAttribute('normal');
	const zeroBounds: StairLocalBounds = { minLocalX: 0, maxLocalX: 0, minLocalZ: 0, maxLocalZ: 0 };

	for (let v = 0; v < positions.count; v++) {
		const localPos = stairCanonicalToLocalXZ(
			bounds,
			direction,
			positions.getX(v),
			positions.getZ(v)
		);
		positions.setXYZ(v, localPos.x, baseY + positions.getY(v), localPos.z);

		if (normals) {
			const localNormal = stairCanonicalToLocalXZ(
				zeroBounds,
				direction,
				normals.getX(v),
				normals.getZ(v)
			);
			normals.setXYZ(v, localNormal.x, normals.getY(v), localNormal.z);
		}
	}
	positions.needsUpdate = true;
	if (normals) normals.needsUpdate = true;

	const index = geometry.getIndex();
	if (index && stairDirectionFlipsWinding(direction)) {
		for (let k = 0; k < index.count; k += 3) {
			const tmp = index.getX(k + 1);
			index.setX(k + 1, index.getX(k + 2));
			index.setX(k + 2, tmp);
		}
		index.needsUpdate = true;
	}
}

/** Disposes frame geometry (never the cached timber material) and detaches the group. */
export function disposeStairFrame(group: THREE.Object3D): void {
	group.traverse((child) => {
		if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
			child.geometry.dispose();
		}
	});
	group.removeFromParent();
}
