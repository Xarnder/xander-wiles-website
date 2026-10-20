import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoofTool } from '../RoofTool';
import { FoundationManager } from '../FoundationManager';
import { BuildingLevelManager } from '../BuildingLevelManager';
import type { BuildingManager } from '../BuildingManager';
import type { BuildUndoManager } from '../BuildUndoManager';
import { createDefaultBuildingSettings, type BuildUiState } from '../FoundationTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { raycastSlabConstructionPlane } from '../foundationTopTargeting';
import { ROOF_TYPE_ORDER } from '../RoofTypes';

vi.mock('../foundationTopTargeting', () => ({ raycastSlabConstructionPlane: vi.fn() }));

let tools: RoofTool[] = [];
beforeEach(() => {
	vi.stubGlobal('window', new EventTarget());
});
afterEach(() => {
	for (const tool of tools) tool.dispose();
	tools = [];
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function harness(type = createDefaultBuildingSettings().defaultRoofType) {
	const settings = createDefaultBuildingSettings();
	settings.defaultRoofType = type;
	const foundationManager = new FoundationManager(() => 1);
	foundationManager.addFoundation({
		id: 'f1',
		minGridX: 0,
		maxGridX: 40,
		minGridZ: 0,
		maxGridZ: 40,
		topY: 0,
		bottomY: -1
	});
	const levelManager = new BuildingLevelManager(settings);
	const addRoof = vi.fn().mockReturnValue({ valid: true, value: { id: 'roof1' } });
	const record = vi.fn();
	let hud: BuildUiState | null = null;
	const tool = new RoofTool({
		scene: new THREE.Scene(),
		camera: new THREE.PerspectiveCamera(),
		foundationManager,
		levelManager,
		buildingSettings: settings,
		terrainSettings: createDefaultTerrainSettings(),
		buildingManager: {
			addRoof,
			getBuildingForFoundation: () => ({ walls: [], wallPaths: [] })
		} as unknown as BuildingManager,
		undoManager: { record } as unknown as BuildUndoManager,
		onHudChange: (next) => {
			hud = next;
		}
	});
	tools.push(tool);
	tool.activate();
	const hover = (gridX: number, gridZ: number, foundationId = 'f1') => {
		vi.mocked(raycastSlabConstructionPlane).mockReturnValue({
			foundationId,
			gridPoint: { gridX, gridZ }
		} as ReturnType<typeof raycastSlabConstructionPlane>);
		tool.update();
	};
	const click = (x: number, z: number) => {
		hover(x, z);
		tool.onPrimaryAction();
	};
	const key = (code: string, shiftKey = false) => {
		window.dispatchEvent(Object.assign(new Event('keydown'), { code, shiftKey }));
	};
	return { tool, settings, addRoof, record, hover, click, key, hud: () => hud! };
}

describe('RoofTool footprint placement', () => {
	it.each(ROOF_TYPE_ORDER)(
		'places a %s roof from two opposite corners, then adjusts and confirms',
		(type) => {
			const h = harness(type);
			h.click(2, 3);
			h.hover(18, 23);
			expect(h.hud().hintLines).toContain('Click: Opposite corner');
			h.tool.onPrimaryAction();
			expect(h.hud().hintLines).toContain('Click: Place roof');
			expect(h.addRoof).not.toHaveBeenCalled();
			h.key('ArrowUp');
			h.tool.onPrimaryAction();
			expect(h.addRoof).toHaveBeenCalledWith(
				expect.objectContaining({
					type,
					points: [
						{ gridX: 2, gridZ: 3, foundationId: 'f1' },
						{ gridX: 18, gridZ: 3, foundationId: 'f1' },
						{ gridX: 18, gridZ: 23, foundationId: 'f1' },
						{ gridX: 2, gridZ: 23, foundationId: 'f1' }
					],
					rise:
						type === 'flat'
							? h.settings.defaultRoofRise
							: h.settings.defaultRoofRise + h.settings.roofRiseStep
				})
			);
			expect(h.record).toHaveBeenCalledWith({ kind: 'roof', roofId: 'roof1' });
		}
	);

	it.each([
		[18, 23, 2, 3],
		[2, 23, 18, 3],
		[18, 3, 2, 23],
		[2, 3, 18, 23]
	])('accepts opposite corners in any direction: (%s, %s) to (%s, %s)', (x1, z1, x2, z2) => {
		const h = harness();
		h.click(x1, z1);
		h.click(x2, z2);
		expect(h.hud().crosshair).toBe('valid');
		expect(h.hud().hintLines).toContain('Click: Place roof');
	});

	it('rejects zero-area rectangles and corners on another foundation', () => {
		const h = harness();
		h.click(2, 3);
		for (const point of [
			[2, 23],
			[18, 3],
			[2, 3]
		]) {
			h.click(point[0], point[1]);
			expect(h.hud().crosshair).toBe('invalid');
		}
		h.hover(18, 23, 'other');
		h.tool.onPrimaryAction();
		expect(h.hud().hintLines).not.toContain('Click: Place roof');
		h.click(18, 23);
		h.tool.onPrimaryAction();
		expect(h.addRoof).toHaveBeenCalledTimes(1);
	});

	it.each(['KeyE', 'KeyB'])(
		'preserves the first corner when %s switches to polygon mode',
		(switchKey) => {
			const h = harness('flat');
			h.click(2, 3);
			h.key(switchKey);
			h.click(18, 3);
			h.click(10, 23);
			expect(h.hud().hintLines).not.toContain('Click: Place roof');
			h.click(2, 3);
			expect(h.hud().hintLines).toContain('Click: Place roof');
			h.tool.onPrimaryAction();
			expect(h.addRoof.mock.calls[0][0].points).toEqual([
				{ gridX: 2, gridZ: 3, foundationId: 'f1' },
				{ gridX: 18, gridZ: 3, foundationId: 'f1' },
				{ gridX: 10, gridZ: 23, foundationId: 'f1' }
			]);
		}
	);

	it('switches before starting and keeps the polygon snap cycle', () => {
		const h = harness();
		h.key('KeyB');
		expect(h.hud().hintLines).toContain('Click: Start polygon');
		h.key('KeyB');
		expect(h.hud().snapMode).toBe('off');
		h.key('KeyB');
		expect(h.hud().snapMode).toBe('axis');
		h.key('KeyE');
		h.click(2, 3);
		h.click(18, 23);
		expect(h.hud().hintLines).toContain('Click: Place roof');
	});

	it('cancels and undoes the first corner, and starts tool selection in rectangle mode', () => {
		const h = harness();
		h.click(2, 3);
		h.key('Backspace');
		expect(h.hud().hintLines).toContain('Click: First corner');
		h.click(2, 3);
		h.click(18, 23);
		h.tool.onSecondaryAction();
		expect(h.hud().hintLines).toContain('Click: First corner');
		h.key('KeyE');
		h.tool.deactivate();
		h.tool.activate();
		expect(h.hud().hintLines).toContain('Click: First corner');
		expect(h.addRoof).not.toHaveBeenCalled();
	});

	it('reserves E for drawing mode until height adjustment and preserves rise and rotation controls', () => {
		const h = harness();
		expect(h.tool.isCapturingKey('KeyE')).toBe(true);
		h.click(2, 3);
		h.click(18, 23);
		expect(h.tool.isCapturingKey('KeyE')).toBe(false);
		expect(h.tool.isCapturingKey('ArrowUp')).toBe(true);
		h.key('ArrowUp', true);
		h.key('KeyR');
		h.tool.onPrimaryAction();
		expect(h.addRoof).toHaveBeenCalledWith(
			expect.objectContaining({
				rise: h.settings.defaultRoofRise + h.settings.roofRiseFineStep,
				direction: 'x'
			})
		);
	});
});
