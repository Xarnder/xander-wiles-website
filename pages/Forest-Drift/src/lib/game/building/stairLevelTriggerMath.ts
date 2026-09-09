import type { FoundationLocalFrame } from './FoundationLocalMath';
import type { StairLocalBounds, StairMetrics } from './stairMath';

/**
 * Invisible AABB around a staircase used to detect "walked up" / "walked down".
 * Enter Y vs exit Y decides the building level — see `resolveStairTraversalLevel`.
 */
export interface StairLevelTriggerVolume {
	stairId: string;
	foundationId: string;
	/** Storey the stair starts on — selected after walking down and leaving lower than entry. */
	startLevelIndex: number;
	/** Storey the stair reaches — selected after walking up and leaving higher than entry. */
	endLevelIndex: number;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
	totalRise: number;
}

/** How far the trigger extends past the stair footprint in X/Z so you enter before the first step. */
export const STAIR_LEVEL_TRIGGER_HORIZONTAL_PADDING = 0.25;
/**
 * How far the trigger extends below the bottom tread and above the top tread. Larger than a
 * normal jump so hopping on the steps does not count as leaving the volume.
 */
export const STAIR_LEVEL_TRIGGER_VERTICAL_PADDING = 2;
/** Fraction of the stair's rise that exit-vs-enter must clear to count as going up or down. */
export const STAIR_LEVEL_TRIGGER_RISE_FRACTION = 0.4;
/** Floor on the height delta so a short stair still registers a traversal. */
export const STAIR_LEVEL_TRIGGER_MIN_DELTA = 0.35;

export function computeStairLevelTriggerVolume(
	stair: { id: string; foundationId: string; levelIndex: number; baseY: number },
	bounds: StairLocalBounds,
	metrics: Pick<StairMetrics, 'totalRise'>,
	frame: FoundationLocalFrame
): StairLevelTriggerVolume {
	const padH = STAIR_LEVEL_TRIGGER_HORIZONTAL_PADDING;
	const padV = STAIR_LEVEL_TRIGGER_VERTICAL_PADDING;
	return {
		stairId: stair.id,
		foundationId: stair.foundationId,
		startLevelIndex: stair.levelIndex,
		endLevelIndex:
			stair.baseY < -1e-6 && stair.levelIndex === 0 ? stair.levelIndex : stair.levelIndex + 1,
		minX: frame.originWorldX + bounds.minLocalX - padH,
		maxX: frame.originWorldX + bounds.maxLocalX + padH,
		minY: frame.originWorldY + stair.baseY - padV,
		maxY: frame.originWorldY + stair.baseY + metrics.totalRise + padV,
		minZ: frame.originWorldZ + bounds.minLocalZ - padH,
		maxZ: frame.originWorldZ + bounds.maxLocalZ + padH,
		totalRise: metrics.totalRise
	};
}

/** Occupancy is the stair's footprint (plus pad). Height is only used when comparing enter vs exit. */
export function pointInStairLevelTrigger(
	worldX: number,
	feetY: number,
	worldZ: number,
	volume: StairLevelTriggerVolume
): boolean {
	return (
		worldX >= volume.minX &&
		worldX <= volume.maxX &&
		worldZ >= volume.minZ &&
		worldZ <= volume.maxZ &&
		feetY >= volume.minY &&
		feetY <= volume.maxY
	);
}

/**
 * After leaving a stair volume, pick the destination storey from how the feet Y changed.
 * Same height (walked in and back out the same end) returns `null` — do not change level.
 */
export function resolveStairTraversalLevel(
	enterFeetY: number,
	exitFeetY: number,
	volume: Pick<StairLevelTriggerVolume, 'startLevelIndex' | 'endLevelIndex' | 'totalRise'>
): number | null {
	const threshold = Math.max(
		volume.totalRise * STAIR_LEVEL_TRIGGER_RISE_FRACTION,
		STAIR_LEVEL_TRIGGER_MIN_DELTA
	);
	const delta = exitFeetY - enterFeetY;
	if (delta >= threshold) return volume.endLevelIndex;
	if (delta <= -threshold) return volume.startLevelIndex;
	return null;
}
