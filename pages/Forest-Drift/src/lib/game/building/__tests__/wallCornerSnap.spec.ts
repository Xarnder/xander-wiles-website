import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import type { BuildingManager } from '../BuildingManager';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import { wallCornersForPlacement } from '../wallCornerSnap';

afterEach(() => vi.unstubAllGlobals());

describe('wall corner placement levels', () => {
	function setup() {
		vi.stubGlobal('window', new EventTarget());
		const levels = new BuildingLevelManager(createDefaultBuildingSettings());
		levels.setCurrentLevelIndex('f1', 1);
		const upper = levels.getOrCreateLevel('f1', 1);
		const getBuildingForFoundation = vi.fn().mockReturnValue({
			walls: [{ baseY: 0, startGridX: 1, startGridZ: 2, endGridX: 8, endGridZ: 9 }],
			wallPaths: [
				{
					baseY: upper.baseY,
					points: [
						{ gridX: 20, gridZ: 21 },
						{ gridX: 25, gridZ: 26 }
					]
				}
			]
		});
		const manager = { getBuildingForFoundation } as unknown as BuildingManager;
		return { levels, upper, manager, getBuildingForFoundation };
	}
	it('uses continuous wall corners on the current storey for walls and its ceiling', () => {
		const h = setup();
		const expected = [
			{ gridX: 20, gridZ: 21 },
			{ gridX: 25, gridZ: 26 }
		];
		expect(wallCornersForPlacement(h.manager, h.levels, 'f1')).toEqual(expected);
		expect(
			wallCornersForPlacement(h.manager, h.levels, 'f1', h.upper.baseY + h.upper.wallHeight)
		).toEqual(expected);
		expect(h.getBuildingForFoundation).toHaveBeenCalledWith('f1');
	});
	it('uses the lower storey at a shared floor/ceiling boundary', () => {
		const h = setup();
		expect(wallCornersForPlacement(h.manager, h.levels, 'f1', h.upper.baseY)).toEqual([
			{ gridX: 1, gridZ: 2 },
			{ gridX: 8, gridZ: 9 }
		]);
	});
	it('has no corners below the foundation and does not fall through an empty storey', () => {
		const h = setup();
		expect(wallCornersForPlacement(h.manager, h.levels, 'f1', 0)).toEqual([]);
		const empty = h.levels.getOrCreateLevel('f1', 2);
		expect(
			wallCornersForPlacement(h.manager, h.levels, 'f1', empty.baseY + empty.wallHeight)
		).toEqual([]);
	});
});
