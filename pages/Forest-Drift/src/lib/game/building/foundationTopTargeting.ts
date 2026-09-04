import * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import {
	foundationLocalFrame,
	foundationLocalSize,
	isBuildingGridPointInsideFoundation,
	snapLocalToBuildingGrid,
	worldToFoundationLocal
} from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';

export interface FoundationTopHit {
	foundationId: string;
	gridPoint: BuildingGridPoint;
}

/**
 * Shared crosshair-targeting logic for every tool that places points on a foundation's top surface
 * (Wall Tool, Polygon/Continuous Wall Tool): raycast against foundation meshes only, keep hits
 * whose face normal is ~straight up (rejects a foundation's side faces), convert to foundation-local
 * X/Z, snap to the fine building grid, and reject anything the snap pushed outside the footprint.
 */
export function raycastFoundationTop(
	raycaster: THREE.Raycaster,
	foundationManager: FoundationManager,
	vertexSpacing: number,
	buildingGridSize: number
): FoundationTopHit | null {
	const meshes = foundationManager.getMeshes();
	if (meshes.length === 0) return null;

	const hits = raycaster.intersectObjects(meshes, false);
	const hit = hits.find((h) => (h.face?.normal.y ?? 0) > 0.9);
	if (!hit) return null;

	const foundationId = hit.object.userData.foundationId as string | undefined;
	if (!foundationId) return null;
	const foundation = foundationManager.getFoundation(foundationId);
	if (!foundation) return null;

	const frame = foundationLocalFrame(foundation, vertexSpacing);
	const local = worldToFoundationLocal(frame, hit.point.x, hit.point.y, hit.point.z);
	const gridPoint = snapLocalToBuildingGrid(local.localX, local.localZ, buildingGridSize);

	const { width, depth } = foundationLocalSize(foundation, vertexSpacing);
	if (!isBuildingGridPointInsideFoundation(gridPoint, buildingGridSize, width, depth)) return null;

	return { foundationId, gridPoint };
}

/**
 * Targeting for level-aware tools (Wall, Polygon Wall, Ceiling/Floor/Roof) building on any storey,
 * not just the ground floor. There is usually no physical mesh to raycast at an upper level's
 * construction plane, so this resolves the target foundation first, then intersects the SAME ray
 * analytically against a logical horizontal plane at that foundation's `topY + level.baseY` — see
 * the README's "Targeting elevated building levels" section.
 *
 * Foundation resolution, in order:
 * 1. `raycastFoundationTop` — a real mesh hit (covers ground level, and any level where a slab
 *    happens to already exist there to look at) — if it hits, that foundation is authoritative and,
 *    at level 0, its hit point is used directly (no extra plane math needed).
 * 2. Otherwise, whichever foundation's footprint contains the ray's origin (i.e. the player is
 *    currently standing on/in it) — covers the common case of looking up/sideways to build a
 *    ceiling while standing inside the room below it.
 */
export function raycastLevelConstructionPlane(
	raycaster: THREE.Raycaster,
	foundationManager: FoundationManager,
	levelManager: BuildingLevelManager,
	currentLevelIndex: number,
	vertexSpacing: number,
	buildingGridSize: number
): FoundationTopHit | null {
	const meshHit = raycastFoundationTop(
		raycaster,
		foundationManager,
		vertexSpacing,
		buildingGridSize
	);

	let foundationId = meshHit?.foundationId;
	if (!foundationId) {
		const origin = raycaster.ray.origin;
		foundationId = foundationManager.getFoundationContaining(origin.x, origin.z)?.id;
	}
	if (!foundationId) return null;

	if (currentLevelIndex === 0 && meshHit && meshHit.foundationId === foundationId) {
		return meshHit;
	}

	const foundation = foundationManager.getFoundation(foundationId);
	if (!foundation) return null;

	const level = levelManager.getOrCreateLevel(foundationId, currentLevelIndex);
	const planeWorldY = foundation.topY + level.baseY;

	const dirY = raycaster.ray.direction.y;
	if (Math.abs(dirY) < 1e-6) return null; // ray parallel to the construction plane
	const t = (planeWorldY - raycaster.ray.origin.y) / dirY;
	if (t <= 0) return null; // plane is behind the camera

	const hitX = raycaster.ray.origin.x + raycaster.ray.direction.x * t;
	const hitZ = raycaster.ray.origin.z + raycaster.ray.direction.z * t;

	const frame = foundationLocalFrame(foundation, vertexSpacing);
	const local = worldToFoundationLocal(frame, hitX, planeWorldY, hitZ);
	const gridPoint = snapLocalToBuildingGrid(local.localX, local.localZ, buildingGridSize);

	const { width, depth } = foundationLocalSize(foundation, vertexSpacing);
	if (!isBuildingGridPointInsideFoundation(gridPoint, buildingGridSize, width, depth)) return null;

	return { foundationId, gridPoint };
}
