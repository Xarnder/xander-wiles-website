import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WallCollisionRect } from './wallCollision';
import type { SolidWallSegment, WallTransform } from './wallGeometryMath';

/**
 * Builds one merged wall mesh from its solid segments (see wallGeometryMath.computeSolidWallSegments)
 * — one render mesh per logical wall, never one mesh per segment, per the "avoid destructive CSG /
 * avoid excessive mesh count" requirements. Geometry is built entirely in wall-local space (X = U
 * along the wall, Y = vertical, Z = thickness) and the whole mesh is transformed as a unit — see
 * applyWallTransform — so segment math never has to think about world/foundation orientation.
 */
export function buildWallGeometry(
	segments: readonly SolidWallSegment[],
	thickness: number
): THREE.BufferGeometry {
	if (segments.length === 0) return new THREE.BufferGeometry();

	const boxGeometries = segments.map((segment) => {
		const width = segment.maxU - segment.minU;
		const height = segment.maxY - segment.minY;
		const geometry = new THREE.BoxGeometry(width, height, thickness);
		geometry.translate((segment.minU + segment.maxU) / 2, (segment.minY + segment.maxY) / 2, 0);
		return geometry;
	});

	const merged = mergeGeometries(boxGeometries, false);
	for (const geometry of boxGeometries) geometry.dispose();

	return merged ?? new THREE.BufferGeometry();
}

/**
 * Positions/rotates a wall-local mesh (built by buildWallGeometry) into place — either directly in
 * world space (tool previews, parented straight to the scene) or in foundation-local space (real
 * walls, parented under that foundation's BuildingRoot group, whose own position already carries
 * the foundation origin) — the caller decides by what coordinate frame it passes in.
 *
 * `rotation.y = -headingRadians` — NOT `headingRadians` — because Three.js's Y-rotation matrix maps
 * local +X to world (cosθ, -sinθ), while wallGeometryMath's `headingRadians` is defined as
 * `atan2(dz, dx)` (i.e. local +X should map to (cosφ, sinφ)); solving cosθ=cosφ, -sinθ=sinφ gives
 * θ=-φ. wallGeometryMath's wallLocalToWorld uses the same (dirX, dirZ)/perpendicular pair without
 * going through this matrix at all — this is the one place that sign flip is needed.
 */
export function applyWallTransform(
	object: THREE.Object3D,
	x: number,
	y: number,
	z: number,
	headingRadians: number
): void {
	object.position.set(x, y, z);
	object.rotation.set(0, -headingRadians, 0);
}

/** Derives this wall's world-space collision rects from its solid segments — always recomputed alongside the mesh so visuals and collision can never disagree. */
export function buildWallCollisionRects(
	segments: readonly SolidWallSegment[],
	thickness: number,
	transform: WallTransform
): WallCollisionRect[] {
	const halfThickness = thickness / 2;
	return segments.map((segment) => {
		const centerU = (segment.minU + segment.maxU) / 2;
		return {
			centerX: transform.originWorldX + transform.dirX * centerU,
			centerZ: transform.originWorldZ + transform.dirZ * centerU,
			halfLength: (segment.maxU - segment.minU) / 2,
			halfThickness,
			dirX: transform.dirX,
			dirZ: transform.dirZ,
			minWorldY: transform.originWorldY + segment.minY,
			maxWorldY: transform.originWorldY + segment.maxY
		};
	});
}
