/**
 * What PaintTool's raycast resolved to — a logical paint target, never a raw Three.js mesh. Mirrors
 * RemovalTypes.ts's `RemovalTarget` exactly (same reasoning: highlighting, HUD text, and the actual
 * paint call all operate on this, never on `object.userData` directly). Windows/doors/stairs are
 * deliberately not representable here — Paint Mode never targets them at all (see PaintTool.ts) —
 * and a whole wall PATH is deliberately not a target either: painting always applies to one logical
 * SEGMENT, exactly like Remove Mode, never the whole polygon at once (see the README's "Paint Tool"
 * section).
 */
export type PaintTarget =
	| { type: 'foundation'; foundationId: string }
	| { type: 'wall'; foundationId: string; wallId: string }
	| { type: 'wall-segment'; foundationId: string; wallPathId: string; segmentId: string }
	| { type: 'slab'; foundationId: string; slabId: string }
	| { type: 'roof'; foundationId: string; roofId: string };

/** A stable string key for a target — used to detect "the hovered thing changed" without deep-equality checks. */
export function paintTargetKey(target: PaintTarget): string {
	switch (target.type) {
		case 'foundation':
			return `foundation:${target.foundationId}`;
		case 'wall':
			return `wall:${target.wallId}`;
		case 'wall-segment':
			return `wall-segment:${target.segmentId}`;
		case 'slab':
			return `slab:${target.slabId}`;
		case 'roof':
			return `roof:${target.roofId}`;
	}
}

/**
 * Picking metadata every paintable mesh carries on `object.userData` — the same fields
 * RemovalTypes.ts's `BuildingPickUserData` already defines (WallManager/WallPathManager/
 * SlabManager/FoundationMesh all set these once, for every consumer, not just Paint/Remove), plus
 * `slabId` isn't in that shape since Remove Mode never targets a slab. Kept as its own local
 * interface rather than importing RemovalTypes' one — the two pickers examine an overlapping but not
 * identical set of fields, and importing across the two would suggest a coupling that doesn't
 * actually exist (each is a self-contained, independently unit-tested resolution function).
 */
export interface PaintPickUserData {
	foundationId?: string;
	wallId?: string;
	wallPathId?: string;
	slabId?: string;
	roofId?: string;
}

/**
 * Resolves one raycast hit's `userData` into a logical PaintTarget. `slabId`'s presence wins first
 * (a slab mesh carries only `foundationId` + `slabId`); a wall-path segment's picking mesh carries
 * BOTH `wallPathId` and `wallId` (the segment's own id, reusing the "wallId" field name — see
 * WallPathManager.getSegmentAsWallView); a standalone wall mesh carries only `wallId`; a foundation
 * mesh carries only `foundationId` — checked last, as the fallback once nothing more specific
 * matched, since every other paintable mesh also carries `foundationId`. Returns null for anything
 * without recognizable building-pick metadata (terrain, trees, sky, a window/door proxy, a stair —
 * none of which PaintTool ever adds to its own raycast candidate list in the first place).
 */
export function resolvePaintTarget(userData: PaintPickUserData): PaintTarget | null {
	const { foundationId } = userData;
	if (!foundationId) return null;

	if (userData.slabId) {
		return { type: 'slab', foundationId, slabId: userData.slabId };
	}
	if (userData.roofId) {
		return { type: 'roof', foundationId, roofId: userData.roofId };
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
	return { type: 'foundation', foundationId };
}
