import { describe, expect, it } from 'vitest';
import {
	cycleHotbarVariantIndex,
	DEFAULT_HOTBAR_SLOTS,
	isCustomizablePlacementTool,
	resolveHotbarSlot
} from '../FoundationTypes';

describe('DEFAULT_HOTBAR_SLOTS groupings', () => {
	it('uses numbered slots 1–6 and 8 with the requested defaults', () => {
		expect(DEFAULT_HOTBAR_SLOTS.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5, 6, 8]);
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[1], 0).toolId).toBe('polygon-wall');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[2], 0).toolId).toBe('door');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[2], 1).toolId).toBe('window');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[2], 2).toolId).toBe('beam');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[3], 0).toolId).toBe('ceiling');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[4], 0).toolId).toBe('stairs');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[5], 0).toolId).toBe('floor-carpet');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[5], 1).toolId).toBe('floor-path');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[5], 2).toolId).toBe('floor-planks');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[5], 3).toolId).toBe('floor-tiles');
		expect(resolveHotbarSlot(DEFAULT_HOTBAR_SLOTS[6], 0).toolId).toBe('torch');
	});

	it('keeps stairs on their own slot', () => {
		expect(DEFAULT_HOTBAR_SLOTS[4].variants).toHaveLength(1);
	});

	it('includes all furniture kinds as variants for slot 8', () => {
		const slot8 = DEFAULT_HOTBAR_SLOTS[6];
		expect(slot8.slot).toBe(8);
		expect(slot8.variants).toHaveLength(19);
		for (const variant of slot8.variants) {
			expect(variant.toolId).toBe('torch');
			expect(variant.furnitureKind).toBeDefined();
			expect(variant.label).toBeTruthy();
		}
		const chairSlot = resolveHotbarSlot(slot8, 3);
		expect(chairSlot.label).toBe('Chair');
		expect(chairSlot.furnitureKind).toBe('chair');
		expect(chairSlot.variantCount).toBe(19);
		expect(chairSlot.variantIndex).toBe(3);
	});
});

describe('cycleHotbarVariantIndex', () => {
	it('wraps at both ends', () => {
		expect(cycleHotbarVariantIndex(3, 0, 1)).toBe(1);
		expect(cycleHotbarVariantIndex(3, 2, 1)).toBe(0);
		expect(cycleHotbarVariantIndex(3, 0, -1)).toBe(2);
	});

	it('does nothing useful on a single-variant slot', () => {
		expect(cycleHotbarVariantIndex(1, 0, 1)).toBe(0);
		expect(cycleHotbarVariantIndex(1, 0, -1)).toBe(0);
	});
});

describe('isCustomizablePlacementTool', () => {
	it('is true for windows, doors, beams, walls, stairs, floor detailing, and place-object', () => {
		expect(isCustomizablePlacementTool('window')).toBe(true);
		expect(isCustomizablePlacementTool('door')).toBe(true);
		expect(isCustomizablePlacementTool('beam')).toBe(true);
		expect(isCustomizablePlacementTool('wall')).toBe(true);
		expect(isCustomizablePlacementTool('polygon-wall')).toBe(true);
		expect(isCustomizablePlacementTool('floor-carpet')).toBe(true);
		expect(isCustomizablePlacementTool('floor-path')).toBe(true);
		expect(isCustomizablePlacementTool('floor-planks')).toBe(true);
		expect(isCustomizablePlacementTool('floor-tiles')).toBe(true);
		expect(isCustomizablePlacementTool('foundation')).toBe(false);
		expect(isCustomizablePlacementTool('stairs')).toBe(true);
		expect(isCustomizablePlacementTool('torch')).toBe(true);
	});
});
