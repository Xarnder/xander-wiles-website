import { describe, expect, it } from 'vitest';
import {
	computeStairLevelTriggerVolume,
	pointInStairLevelTrigger,
	resolveStairTraversalLevel,
	STAIR_LEVEL_TRIGGER_HORIZONTAL_PADDING,
	STAIR_LEVEL_TRIGGER_MIN_DELTA,
	STAIR_LEVEL_TRIGGER_VERTICAL_PADDING
} from '../stairLevelTriggerMath';

const FRAME = { originWorldX: 10, originWorldY: 2, originWorldZ: 4 };
const BOUNDS = { minLocalX: 0, maxLocalX: 3, minLocalZ: 0, maxLocalZ: 1 };
const STAIR = { id: 'stair-1', foundationId: 'f1', levelIndex: 0, baseY: 0 };

function volume() {
	return computeStairLevelTriggerVolume(STAIR, BOUNDS, { totalRise: 3 }, FRAME);
}

describe('computeStairLevelTriggerVolume', () => {
	it('pads the stair footprint and rise into a world-space AABB', () => {
		const box = volume();
		expect(box.foundationId).toBe('f1');
		expect(box.startLevelIndex).toBe(0);
		expect(box.endLevelIndex).toBe(1);
		expect(box.minX).toBeCloseTo(10 - STAIR_LEVEL_TRIGGER_HORIZONTAL_PADDING);
		expect(box.maxX).toBeCloseTo(13 + STAIR_LEVEL_TRIGGER_HORIZONTAL_PADDING);
		expect(box.minZ).toBeCloseTo(4 - STAIR_LEVEL_TRIGGER_HORIZONTAL_PADDING);
		expect(box.maxZ).toBeCloseTo(5 + STAIR_LEVEL_TRIGGER_HORIZONTAL_PADDING);
		expect(box.minY).toBeCloseTo(2 - STAIR_LEVEL_TRIGGER_VERTICAL_PADDING);
		expect(box.maxY).toBeCloseTo(5 + STAIR_LEVEL_TRIGGER_VERTICAL_PADDING);
	});

	it('uses the stair level as the lower storey and the next index as the upper', () => {
		const box = computeStairLevelTriggerVolume(
			{ ...STAIR, levelIndex: 2, baseY: 6 },
			BOUNDS,
			{ totalRise: 3 },
			FRAME
		);
		expect(box.startLevelIndex).toBe(2);
		expect(box.endLevelIndex).toBe(3);
		expect(box.minY).toBeCloseTo(8 - STAIR_LEVEL_TRIGGER_VERTICAL_PADDING);
		expect(box.maxY).toBeCloseTo(11 + STAIR_LEVEL_TRIGGER_VERTICAL_PADDING);
	});
});

describe('pointInStairLevelTrigger', () => {
	it('contains a point on the stair and rejects one beside it', () => {
		const box = volume();
		expect(pointInStairLevelTrigger(11.5, 3.2, 4.5, box)).toBe(true);
		expect(pointInStairLevelTrigger(20, 3.2, 4.5, box)).toBe(false);
		expect(pointInStairLevelTrigger(11.5, 20, 4.5, box)).toBe(false);
	});
});

describe('resolveStairTraversalLevel', () => {
	const box = { startLevelIndex: 0, endLevelIndex: 1, totalRise: 3 };

	it('selects the upper storey after leaving higher than entry', () => {
		expect(resolveStairTraversalLevel(2, 5, box)).toBe(1);
	});

	it('selects the lower storey after leaving lower than entry', () => {
		expect(resolveStairTraversalLevel(5, 2, box)).toBe(0);
	});

	it('does nothing when the player leaves at about the same height they entered', () => {
		expect(resolveStairTraversalLevel(2.1, 2.2, box)).toBeNull();
		expect(resolveStairTraversalLevel(5, 4.9, box)).toBeNull();
	});

	it('still registers a short stair that clears the minimum delta', () => {
		const short = { startLevelIndex: 1, endLevelIndex: 2, totalRise: 0.5 };
		expect(resolveStairTraversalLevel(0, STAIR_LEVEL_TRIGGER_MIN_DELTA, short)).toBe(2);
		expect(resolveStairTraversalLevel(1, 1 - STAIR_LEVEL_TRIGGER_MIN_DELTA, short)).toBe(1);
	});
});
