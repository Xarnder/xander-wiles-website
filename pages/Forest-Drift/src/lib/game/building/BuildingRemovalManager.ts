import type { BuildingManager } from './BuildingManager';
import type { RemovalTarget } from './RemovalTypes';

/**
 * A thin RemoveTool-facing facade over BuildingManager's removal primitives. RemoveTool only ever
 * knows "here is a RemovalTarget the player clicked on" — it never calls BuildingManager directly,
 * so it doesn't need to know each target type's exact method name/argument shape (see the README's
 * "Remove Manager" section).
 *
 * Deliberately thin rather than a second authoritative mutator: BuildingManager already privately
 * owns WallManager/WallPathManager/SlabManager/StairManager and is the one place every OTHER tool's
 * `confirm*()` call goes to mutate building state (see its own class doc comment) — the topology
 * splitting (`removeWallSegment`) and dependency cascade (`removeStair` restoring its owned slab
 * opening) both live there for the same reason `addWallPath`/`addStair`'s forward cascades do: they
 * need the same private manager references BuildingManager already holds, and duplicating that
 * access here would mean two competing places that can mutate the same state.
 */
export class BuildingRemovalManager {
	private readonly buildingManager: BuildingManager;

	constructor(buildingManager: BuildingManager) {
		this.buildingManager = buildingManager;
	}

	removeWall(wallId: string): boolean {
		return this.buildingManager.removeWall(wallId);
	}

	removeWallSegment(wallPathId: string, segmentId: string): boolean {
		return this.buildingManager.removeWallSegment(wallPathId, segmentId);
	}

	removeOpening(wallId: string, openingId: string): boolean {
		return this.buildingManager.removeOpening(wallId, openingId);
	}

	removeStair(stairId: string): boolean {
		return this.buildingManager.removeStair(stairId);
	}

	/** Dispatches a RemovalTarget to the matching removal call above — the single entry point RemoveTool actually uses. */
	remove(target: RemovalTarget): boolean {
		switch (target.type) {
			case 'wall':
				return this.removeWall(target.wallId);
			case 'wall-segment':
				return this.removeWallSegment(target.wallPathId, target.segmentId);
			case 'opening':
				return this.removeOpening(target.wallId, target.openingId);
			case 'stair':
				return this.removeStair(target.stairId);
		}
	}
}
