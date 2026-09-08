import type { BuildingLevelManager } from './BuildingLevelManager';
import type { StairManager } from './StairManager';
import {
	pointInStairLevelTrigger,
	resolveStairTraversalLevel,
	type StairLevelTriggerVolume
} from './stairLevelTriggerMath';

/**
 * Watches the player's feet against each stair's trigger AABB. Entering records height; leaving
 * higher than entry selects the stair's upper storey, leaving lower selects the lower one.
 * No-ops while a placement has locked the active foundation (same rule as `]`/`[`).
 */
export class StairLevelTrigger {
	private readonly occupancy = new Map<string, number>();

	constructor(
		private readonly stairManager: StairManager,
		private readonly levelManager: BuildingLevelManager
	) {}

	update(worldX: number, feetY: number, worldZ: number): void {
		const volumes = this.stairManager.getLevelTriggerVolumes();
		const liveIds = new Set<string>();

		for (const volume of volumes) {
			liveIds.add(volume.stairId);
			const inside = pointInStairLevelTrigger(worldX, feetY, worldZ, volume);
			const enterY = this.occupancy.get(volume.stairId);
			if (inside && enterY === undefined) {
				this.occupancy.set(volume.stairId, feetY);
			} else if (!inside && enterY !== undefined) {
				this.occupancy.delete(volume.stairId);
				this.applyTraversal(enterY, feetY, volume);
			}
		}

		for (const stairId of this.occupancy.keys()) {
			if (!liveIds.has(stairId)) this.occupancy.delete(stairId);
		}
	}

	private applyTraversal(
		enterFeetY: number,
		exitFeetY: number,
		volume: StairLevelTriggerVolume
	): void {
		if (this.levelManager.isFoundationLocked()) return;
		const target = resolveStairTraversalLevel(enterFeetY, exitFeetY, volume);
		if (target === null) return;

		this.levelManager.reportHoveredFoundation(volume.foundationId);
		this.levelManager.getOrCreateLevel(volume.foundationId, target);
		this.levelManager.setCurrentLevelIndex(volume.foundationId, target);
	}
}
