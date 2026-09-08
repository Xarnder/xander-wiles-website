import * as THREE from 'three';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import type { WallBeamDefinition } from './WallTypes';

export interface WallBeamVisualSettings {
	beamDepthExtra: number;
}

/**
 * A single timber box in wall-local (U, Y, thickness) space — parented under the wall mesh (or a
 * path segment's local frame) the same way opening visuals are. Never persisted; rebuilt from the
 * beam's authored rect + live `beamDepthExtra`. Does not cut wall geometry.
 */
export function buildBeamVisual(
	beam: WallBeamDefinition,
	wallThickness: number,
	settings: WallBeamVisualSettings,
	materialManager: BuildingMaterialManager
): THREE.Mesh | null {
	const width = beam.maxU - beam.minU;
	const height = beam.maxY - beam.minY;
	if (width <= 0 || height <= 0) return null;

	const depth = wallThickness + 2 * Math.max(0, settings.beamDepthExtra);
	const geometry = new THREE.BoxGeometry(width, height, depth);
	geometry.translate((beam.minU + beam.maxU) / 2, (beam.minY + beam.maxY) / 2, 0);

	const mesh = new THREE.Mesh(
		geometry,
		materialManager.getMaterial('wall-beam', beam.material)
	);
	mesh.name = 'wall-beam';
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}
