/**
 * Live ceiling / floor / roof placement height — metres above the current storey's floor
 * (`level.baseY`). Default follows the storey's wall-top so existing rooms still line up.
 * Framework-free so the modal and the tools cannot disagree.
 */

export const SLAB_PLACEMENT_HEIGHT_MIN = 0;
export const SLAB_PLACEMENT_HEIGHT_MAX = 12;
export const SLAB_PLACEMENT_HEIGHT_STEP = 0.05;

export interface SlabPlacementHeightSettings {
	slabPlacementFollowWalls: boolean;
	slabPlacementHeight: number;
}

export function clampSlabPlacementHeight(value: number): number {
	if (!Number.isFinite(value)) return SLAB_PLACEMENT_HEIGHT_MIN;
	return Math.min(SLAB_PLACEMENT_HEIGHT_MAX, Math.max(SLAB_PLACEMENT_HEIGHT_MIN, value));
}

/** Height of the slab/eave above the current storey floor. */
export function resolveSlabPlacementHeightAboveFloor(
	wallHeight: number,
	settings: SlabPlacementHeightSettings
): number {
	if (settings.slabPlacementFollowWalls) return Math.max(0, wallHeight);
	return clampSlabPlacementHeight(settings.slabPlacementHeight);
}

/** Foundation-local Y of the slab top / roof eave. */
export function resolveSlabPlacementLocalY(
	level: { baseY: number; wallHeight: number },
	settings: SlabPlacementHeightSettings
): number {
	return level.baseY + resolveSlabPlacementHeightAboveFloor(level.wallHeight, settings);
}
