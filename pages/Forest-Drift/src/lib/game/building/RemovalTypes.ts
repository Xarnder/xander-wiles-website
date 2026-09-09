import type { WallOpeningType } from './WallTypes';

/**
 * What RemoveTool's raycast resolved to — a logical removal target, never a raw Three.js mesh.
 * Everything downstream (highlighting, HUD text, the actual removal call) operates on this, never
 * on `object.userData` directly, so a click always removes exactly the logical thing the player was
 * shown, regardless of which picking mesh happened to be hit. Deliberately structured to make
 * later target types (a whole wall path, a foundation) straightforward additions — same
 * `{type, ...ids}` shape, one new case in every `switch`.
 */
export type RemovalTarget =
	| { type: 'wall'; wallId: string; foundationId: string }
	| { type: 'wall-segment'; wallPathId: string; segmentId: string; foundationId: string }
	| {
			type: 'opening';
			wallId: string;
			openingId: string;
			openingType: WallOpeningType;
			foundationId: string;
	  }
	| { type: 'beam'; wallId: string; beamId: string; foundationId: string }
	| { type: 'stair'; stairId: string; foundationId: string }
	| { type: 'slab'; slabId: string; foundationId: string }
	| { type: 'roof'; roofId: string; foundationId: string }
	| { type: 'floor-detail'; detailId: string; foundationId: string };

/** A stable string key for a target — used to detect "the hovered thing changed" without deep-equality checks. */
export function removalTargetKey(target: RemovalTarget): string {
	switch (target.type) {
		case 'wall':
			return `wall:${target.wallId}`;
		case 'wall-segment':
			return `wall-segment:${target.segmentId}`;
		case 'opening':
			return `opening:${target.wallId}:${target.openingId}`;
		case 'beam':
			return `beam:${target.wallId}:${target.beamId}`;
		case 'stair':
			return `stair:${target.stairId}`;
		case 'slab':
			return `slab:${target.slabId}`;
		case 'roof':
			return `roof:${target.roofId}`;
		case 'floor-detail':
			return `floor-detail:${target.detailId}`;
	}
}

/**
 * Picking metadata every raycastable removal candidate carries on `object.userData` — read-only
 * shape, not a class, since it's just plain fields set once when each picking mesh/proxy is built
 * (WallManager, WallPathManager, SlabManager, RoofManager, StairManager, and RemoveTool's own
 * OpeningPickingProxy meshes). `resolveRemovalTarget` below is the ONLY place that interprets these
 * fields into a RemovalTarget, so identity resolution stays centralized in one pure, unit-testable
 * function rather than scattered string/shape checks at every call site.
 */
export interface BuildingPickUserData {
	foundationId?: string;
	wallId?: string;
	wallPathId?: string;
	stairId?: string;
	slabId?: string;
	roofId?: string;
	floorDetailId?: string;
	openingId?: string;
	openingType?: WallOpeningType;
	beamId?: string;
}

/**
 * Resolves one raycast hit's `userData` into a logical RemovalTarget. Priority is implicit in the
 * checks below, not a distance comparison: an opening proxy's userData carries `openingId`, which
 * nothing else does, so it's checked first regardless of what else the same object might carry.
 * A wall-path segment's picking mesh carries BOTH `wallPathId` and `wallId` (the segment's own id,
 * reusing the "wallId" field name — see WallPathManager.getSegmentAsWallView) — `wallPathId`'s
 * presence is what distinguishes it from a standalone wall, which only ever carries `wallId`.
 * Returns null for anything without recognizable building-pick metadata (terrain, trees, sky, ...).
 */
export function resolveRemovalTarget(userData: BuildingPickUserData): RemovalTarget | null {
	const { foundationId } = userData;
	if (!foundationId) return null;

	if (userData.openingId && userData.wallId && userData.openingType) {
		return {
			type: 'opening',
			wallId: userData.wallId,
			openingId: userData.openingId,
			openingType: userData.openingType,
			foundationId
		};
	}
	if (userData.beamId && userData.wallId) {
		return {
			type: 'beam',
			wallId: userData.wallId,
			beamId: userData.beamId,
			foundationId
		};
	}
	if (userData.floorDetailId) {
		return { type: 'floor-detail', detailId: userData.floorDetailId, foundationId };
	}
	if (userData.stairId) {
		return { type: 'stair', stairId: userData.stairId, foundationId };
	}
	if (userData.slabId) {
		return { type: 'slab', slabId: userData.slabId, foundationId };
	}
	if (userData.roofId) {
		return { type: 'roof', roofId: userData.roofId, foundationId };
	}
	if (userData.wallPathId && userData.wallId) {
		return {
			type: 'wall-segment',
			wallPathId: userData.wallPathId,
			segmentId: userData.wallId,
			foundationId
		};
	}
	if (userData.wallId) {
		return { type: 'wall', wallId: userData.wallId, foundationId };
	}
	return null;
}
