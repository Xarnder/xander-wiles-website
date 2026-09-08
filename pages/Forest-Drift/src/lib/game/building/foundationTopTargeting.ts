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
import type { FoundationDefinition } from './FoundationTypes';
import {
	resolveSlabPlacementLocalY,
	type SlabPlacementHeightSettings
} from './slabPlacementMath';

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
 *    happens to already exist there to look at) — if it hits, that foundation is authoritative.
 *    The hover point itself is the look-ray ∩ the current storey's plane when that intersection
 *    is in front of the camera (so the grid sits under the crosshair). The mesh X/Z is only a
 *    fallback when the storey is above the camera (looking down, plane behind the eye).
 * 2. Otherwise, whichever foundation's footprint contains the ray's origin (i.e. the player is
 *    currently standing on/in it) — covers the common case of looking up/sideways to build a
 *    ceiling while standing inside the room below it.
 * 3. Otherwise, whichever foundation `BuildingLevelManager` already considers "active" (the one the
 *    player was last building on, or has locked mid-placement) — covers stepping back OUTSIDE a
 *    foundation's own footprint to get a workable upward angle on an elevated level, which the first
 *    two heuristics alone can't handle: an upper-storey plane usually has no mesh to hit, and a
 *    small foundation's footprint is easy to overshoot backing away from it. The final
 *    inside-the-footprint bounds check below still protects against this producing a nonsense
 *    result if the player has genuinely wandered away from that foundation entirely — it only helps
 *    when the analytic plane, projected from wherever they're actually standing, still lands
 *    somewhere inside the real footprint.
 *
 * The level used is `levelManager.getCurrentLevelIndex(foundationId)` — i.e. resolved AFTER the
 * foundation is known, from that specific foundation's own per-foundation current level, never a
 * single global index — see BuildingLevelManager's class doc comment on why levels are
 * foundation-scoped.
 */
export function raycastLevelConstructionPlane(
	raycaster: THREE.Raycaster,
	foundationManager: FoundationManager,
	levelManager: BuildingLevelManager,
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
	if (!foundationId) {
		foundationId = levelManager.getActiveFoundationId() ?? undefined;
	}
	if (!foundationId) return null;

	const foundation = foundationManager.getFoundation(foundationId);
	if (!foundation) return null;

	const currentLevelIndex = levelManager.getCurrentLevelIndex(foundationId);
	const level = levelManager.getOrCreateLevel(foundationId, currentLevelIndex);
	const planeHit = intersectFoundationPlane(
		raycaster,
		foundation,
		foundation.topY + level.baseY,
		vertexSpacing,
		buildingGridSize
	);
	if (planeHit) return { foundationId, gridPoint: planeHit };

	// Storey is above the camera (looking down) — the plane is behind the eye, so keep targeting
	// via the visible foundation-top X/Z rather than dropping the hover entirely.
	if (meshHit && meshHit.foundationId === foundationId) {
		return meshHit;
	}

	return null;
}

function intersectFoundationPlane(
	raycaster: THREE.Raycaster,
	foundation: FoundationDefinition,
	planeWorldY: number,
	vertexSpacing: number,
	buildingGridSize: number
): BuildingGridPoint | null {
	const dirY = raycaster.ray.direction.y;
	if (Math.abs(dirY) < 1e-6) return null;
	const t = (planeWorldY - raycaster.ray.origin.y) / dirY;
	if (t <= 0) return null;

	const hitX = raycaster.ray.origin.x + raycaster.ray.direction.x * t;
	const hitZ = raycaster.ray.origin.z + raycaster.ray.direction.z * t;
	const frame = foundationLocalFrame(foundation, vertexSpacing);
	const local = worldToFoundationLocal(frame, hitX, planeWorldY, hitZ);
	const gridPoint = snapLocalToBuildingGrid(local.localX, local.localZ, buildingGridSize);
	const { width, depth } = foundationLocalSize(foundation, vertexSpacing);
	if (!isBuildingGridPointInsideFoundation(gridPoint, buildingGridSize, width, depth)) return null;
	return gridPoint;
}

/**
 * Targeting for the Ceiling/Floor/Roof tools. Intersects the look ray with the analytic plane at
 * the slab/eave height that will actually be placed (`foundation.topY + resolveSlabPlacementLocalY`),
 * so the crosshair, building grid, and preview sit on the same plane — including when C has lowered
 * that plane below eye height and the player is looking down at it.
 *
 * Foundation resolution prefers "which foundation am I standing in" (XZ-only) over a mesh hit,
 * because aiming up at a high slab moves the ray away from any ground mesh. The mesh-hit path
 * remains for aiming at a foundation from just outside its footprint. A final fallback to the
 * already-active foundation covers stepping back for a workable angle — the footprint bounds check
 * still applies.
 *
 * The level is resolved AFTER the foundation is known, via that foundation's own current index.
 */
export function raycastSlabConstructionPlane(
	raycaster: THREE.Raycaster,
	foundationManager: FoundationManager,
	levelManager: BuildingLevelManager,
	vertexSpacing: number,
	buildingGridSize: number,
	placementHeight: SlabPlacementHeightSettings
): FoundationTopHit | null {
	const origin = raycaster.ray.origin;
	let foundationId = foundationManager.getFoundationContaining(origin.x, origin.z)?.id;
	if (!foundationId) {
		const meshHit = raycastFoundationTop(
			raycaster,
			foundationManager,
			vertexSpacing,
			buildingGridSize
		);
		foundationId = meshHit?.foundationId;
	}
	if (!foundationId) {
		foundationId = levelManager.getActiveFoundationId() ?? undefined;
	}
	if (!foundationId) return null;

	const foundation = foundationManager.getFoundation(foundationId);
	if (!foundation) return null;

	const level = levelManager.getOrCreateLevel(
		foundationId,
		levelManager.getCurrentLevelIndex(foundationId)
	);
	const planeHit = intersectFoundationPlane(
		raycaster,
		foundation,
		foundation.topY + resolveSlabPlacementLocalY(level, placementHeight),
		vertexSpacing,
		buildingGridSize
	);
	return planeHit ? { foundationId, gridPoint: planeHit } : null;
}
