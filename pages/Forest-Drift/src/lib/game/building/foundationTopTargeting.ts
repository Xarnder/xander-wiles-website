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

	const currentLevelIndex = levelManager.getCurrentLevelIndex(foundationId);
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

/**
 * Targeting for the Ceiling/Floor/Flat Roof tools: unlike walls and stairs (built starting from
 * the current level's *floor*), a slab always sits at the top of the current level's walls — well
 * above head height. `raycastLevelConstructionPlane`'s ground-mesh shortcut exists for walls, where
 * "look down at the floor" is the natural aiming pose; reusing it for slabs forced players to aim
 * at the ground to place points for a shape that actually gets drawn a storey above their head,
 * with no visual relationship between where they were looking and where the point landed.
 *
 * This instead always intersects the ray with the analytic plane at the slab's actual height
 * (`foundation.topY + level.baseY + level.wallHeight`), so a player looks *up* at the (invisible)
 * ceiling plane and clicks corners directly on it — the crosshair target and the slab preview are
 * now the same plane. Foundation resolution prefers "which foundation am I standing in" (XZ-only,
 * ignores aim direction) over a physical mesh hit, since looking up means the ray moves away from
 * any ground-level mesh and would essentially never hit one; the mesh-hit path remains as a
 * fallback for the reverse case (aiming down at a foundation from just outside its footprint). A
 * final fallback to `levelManager`'s already-active foundation covers stepping back outside the
 * footprint entirely to get a workable angle on a high ceiling — see
 * `raycastLevelConstructionPlane`'s doc comment for why this is safe (the footprint bounds check
 * below still applies).
 *
 * As with `raycastLevelConstructionPlane`, the level used is resolved AFTER the foundation is
 * known, via that specific foundation's own `levelManager.getCurrentLevelIndex(foundationId)`.
 */
export function raycastSlabConstructionPlane(
	raycaster: THREE.Raycaster,
	foundationManager: FoundationManager,
	levelManager: BuildingLevelManager,
	vertexSpacing: number,
	buildingGridSize: number
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
	const planeWorldY = foundation.topY + level.baseY + level.wallHeight;

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
