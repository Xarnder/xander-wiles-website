/**
 * The phrase the player must type before a whole foundation — and everything built on it — is
 * removed. Exact, including the capital letters and the single space. Surrounding whitespace is
 * ignored so a trailing newline from paste doesn't fail an otherwise exact entry.
 */
export const FOUNDATION_DELETE_CONFIRMATION = 'Confirm Delete';

export function isFoundationDeleteConfirmed(typed: string): boolean {
	return typed.trim() === FOUNDATION_DELETE_CONFIRMATION;
}

/**
 * Collaborators a confirmed foundation deletion has to touch. BuildingManager already cascades
 * walls, paths, slabs, stairs, roofs, and floor detailing, but it does not own the foundation
 * mesh, storeys, furniture, or placed Mini Builds — the caller passes those in so this stays the
 * one place that orders the cascade (building content first, the foundation itself last).
 */
export interface FoundationDeletionDeps {
	buildingManager: {
		removeBuildingForFoundation(foundationId: string): void;
	};
	foundationManager: {
		getFoundation(id: string): unknown;
		removeFoundation(id: string): boolean;
	};
	levelManager: {
		removeLevelsForFoundation(foundationId: string): void;
	};
	furnitureManager?: {
		removeForFoundation(foundationId: string): void;
	};
	removePlacedObjects?(foundationId: string): void;
}

/**
 * Deletes one foundation and the build on it, but only when `confirmation` is exactly
 * {@link FOUNDATION_DELETE_CONFIRMATION}. A wrong phrase, or an id that is already gone, changes
 * nothing and returns false — so the ground stays occupied until the typed confirmation succeeds,
 * and a new foundation can be placed there afterwards.
 */
export function deleteFoundationAndBuilding(
	deps: FoundationDeletionDeps,
	foundationId: string,
	confirmation: string
): boolean {
	if (!isFoundationDeleteConfirmed(confirmation)) return false;
	if (!deps.foundationManager.getFoundation(foundationId)) return false;

	deps.buildingManager.removeBuildingForFoundation(foundationId);
	deps.levelManager.removeLevelsForFoundation(foundationId);
	deps.furnitureManager?.removeForFoundation(foundationId);
	deps.removePlacedObjects?.(foundationId);
	return deps.foundationManager.removeFoundation(foundationId);
}
