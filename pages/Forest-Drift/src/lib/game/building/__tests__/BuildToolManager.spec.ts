import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildTool } from '../BuildToolManager';
import { BuildToolManager } from '../BuildToolManager';
import { FoundationManager } from '../FoundationManager';
import { FoundationTool } from '../FoundationTool';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { ToolId } from '../FoundationTypes';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';

/** A trivial BuildTool stand-in that just counts calls — used as `removeTool` in tests that don't care about real removal targeting. */
function makeFakeTool(toolId: ToolId = 'remove'): BuildTool & {
	activateCount: number;
	deactivateCount: number;
	updateCount: number;
	primaryCount: number;
	secondaryCount: number;
} {
	return {
		toolId,
		activateCount: 0,
		deactivateCount: 0,
		updateCount: 0,
		primaryCount: 0,
		secondaryCount: 0,
		activate() {
			this.activateCount++;
		},
		deactivate() {
			this.deactivateCount++;
		},
		update() {
			this.updateCount++;
		},
		onPrimaryAction() {
			this.primaryCount++;
		},
		onSecondaryAction() {
			this.secondaryCount++;
		}
	};
}

/**
 * These tests exercise the real click-routing/state-machine logic end to end (BuildToolManager ->
 * FoundationTool -> FoundationManager) without a browser. Pointer lock itself can't be driven
 * reliably from automation (Chromium refuses it outside a focused, headed window — confirmed by
 * hand while building this), so instead of a flaky Playwright pointer-lock test, `isPointerLocked`
 * is injected directly here, which is both more reliable and a more precise test of the actual
 * gating logic described in the spec ("the click that acquires pointer lock must not also place
 * a foundation").
 */

/** Minimal EventTarget-like stand-in for the canvas element — just enough for BuildToolManager. */
class FakeElement {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}

	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
	}

	dispatch(type: string, event: unknown): void {
		for (const handler of this.listeners.get(type) ?? []) handler(event);
	}
}

function buildHarness(pointerLocked: { value: boolean }) {
	// A real dispatching fake, not a bare vi.fn() spy — the new Remove Mode tests below need `X`/
	// `Escape` keydowns (registered on `window`, per BuildToolManager's constructor) to actually reach
	// handleKeyDown, not just be recorded as having been "listened for".
	const fakeWindow = new FakeElement();
	vi.stubGlobal('window', fakeWindow);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);

	// A large flat mesh at y = 0 standing in for "loaded terrain meshes" — the crosshair raycast
	// only needs something to hit; actual heights come from the real TerrainHeightSampler below.
	const groundMesh = new THREE.Mesh(
		new THREE.PlaneGeometry(400, 400),
		new THREE.MeshBasicMaterial()
	);
	groundMesh.rotation.x = -Math.PI / 2;
	groundMesh.updateMatrixWorld(true);

	const terrainSettings = createDefaultTerrainSettings();
	const terrainHeightSampler = new TerrainHeightSampler(terrainSettings);
	const buildingSettings = createDefaultBuildingSettings();
	const foundationManager = new FoundationManager(
		() => terrainSettings.chunkSize / terrainSettings.chunkResolution
	);

	const foundationTool = new FoundationTool({
		scene,
		camera,
		terrainHeightSampler,
		getTerrainMeshes: () => [groundMesh],
		foundationManager,
		terrainSettings,
		buildingSettings
	});

	const domElement = new FakeElement();
	const removeTool = makeFakeTool();
	const paintTool = makeFakeTool('paint');
	const musicTool = makeFakeTool('music');
	const polyWallTool = makeFakeTool('polygon-wall');
	const wallTool = makeFakeTool('wall');
	const doorTool = makeFakeTool('door');
	const windowTool = makeFakeTool('window');
	const beamTool = makeFakeTool('beam');
	const ceilingTool = makeFakeTool('ceiling');
	const floorTool = makeFakeTool('floor');
	const roofTool = makeFakeTool('flat-roof');
	const torchTool = makeFakeTool('torch');
	const hotbarStates: { buildModeActive: boolean; globalMode: string; toolId?: string }[] = [];
	const buildToolManager = new BuildToolManager({
		domElement: domElement as unknown as HTMLElement,
		tools: {
			foundation: foundationTool,
			'polygon-wall': polyWallTool,
			wall: wallTool,
			door: doorTool,
			window: windowTool,
			beam: beamTool,
			ceiling: ceilingTool,
			floor: floorTool,
			'flat-roof': roofTool,
			torch: torchTool
		},
		removeTool,
		musicTool,
		paintTool,
		isPointerLocked: () => pointerLocked.value,
		onHotbarChange: (state) => {
			const active = state.slots.find((slot) => slot.slot === state.activeSlot);
			hotbarStates.push({
				buildModeActive: state.buildModeActive,
				globalMode: state.globalMode,
				toolId: active?.toolId
			});
		}
	});

	function pointCrosshairAt(worldX: number, worldZ: number): void {
		camera.position.set(worldX, 10, worldZ);
		camera.lookAt(worldX, 0, worldZ);
		camera.updateMatrixWorld(true);
		buildToolManager.update();
	}

	function click(button: 0 | 2): void {
		domElement.dispatch('mousedown', { button });
	}

	function key(code: string, extras: { shiftKey?: boolean } = {}): void {
		fakeWindow.dispatch('keydown', { code, shiftKey: extras.shiftKey ?? false, preventDefault() {} });
	}

	return {
		foundationManager,
		buildToolManager,
		removeTool,
		musicTool,
		paintTool,
		polyWallTool,
		wallTool,
		doorTool,
		windowTool,
		beamTool,
		ceilingTool,
		floorTool,
		roofTool,
		torchTool,
		hotbarStates,
		pointCrosshairAt,
		click,
		key
	};
}

describe('BuildToolManager + FoundationTool click routing', () => {
	const pointerLocked = { value: false };

	beforeEach(() => {
		pointerLocked.value = false;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('does not place a foundation from the click that only acquires pointer lock', () => {
		const { foundationManager, pointCrosshairAt, click } = buildHarness(pointerLocked);

		pointCrosshairAt(0, 0);
		click(0); // pointer lock not active yet — this is the "acquire lock" click, must be ignored

		expect(foundationManager.getFoundations()).toHaveLength(0);
	});

	it('places a foundation spanning both targeted grid points once pointer lock is active', () => {
		pointerLocked.value = true;
		const { foundationManager, pointCrosshairAt, click } = buildHarness(pointerLocked);

		pointCrosshairAt(0, 0);
		click(0); // select corner 1

		pointCrosshairAt(20, 14);
		click(0); // select corner 2 -> places

		const foundations = foundationManager.getFoundations();
		expect(foundations).toHaveLength(1);
		expect(foundations[0].minGridX).toBeLessThan(foundations[0].maxGridX);
		expect(foundations[0].minGridZ).toBeLessThan(foundations[0].maxGridZ);
	});

	it('right click cancels a pending first corner without placing anything', () => {
		pointerLocked.value = true;
		const { foundationManager, pointCrosshairAt, click } = buildHarness(pointerLocked);

		pointCrosshairAt(0, 0);
		click(0); // select corner 1
		click(2); // cancel

		pointCrosshairAt(20, 14);
		click(0); // this is now a fresh "select corner 1", not a placement

		expect(foundationManager.getFoundations()).toHaveLength(0);
	});

	it('rejects a zero-area selection (clicking the same vertex twice) without placing anything', () => {
		pointerLocked.value = true;
		const { foundationManager, pointCrosshairAt, click } = buildHarness(pointerLocked);

		pointCrosshairAt(0, 0);
		click(0); // select corner 1
		click(0); // same vertex again -> invalid, must not place

		expect(foundationManager.getFoundations()).toHaveLength(0);
	});
});

describe('BuildToolManager furniture slot 8', () => {
	const pointerLocked = { value: true };

	beforeEach(() => {
		pointerLocked.value = true;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('selects the torch tool by slot number 8, not by array index', () => {
		const { torchTool, key, hotbarStates } = buildHarness(pointerLocked);
		key('Digit8');
		expect(torchTool.activateCount).toBe(1);
		expect(hotbarStates.at(-1)?.toolId).toBe('torch');
	});

	it('does not treat empty slot 7 as the torch', () => {
		const { torchTool, key } = buildHarness(pointerLocked);
		key('Digit7');
		expect(torchTool.activateCount).toBe(0);
	});

	it('does not exit Remove Mode when an unused digit is pressed', () => {
		const { removeTool, key, hotbarStates } = buildHarness(pointerLocked);
		key('KeyX');
		expect(removeTool.activateCount).toBe(1);
		key('Digit7');
		key('Digit9');
		expect(removeTool.deactivateCount).toBe(0);
		expect(hotbarStates.at(-1)?.globalMode).toBe('remove');
	});
});

describe('BuildToolManager Remove Mode routing', () => {
	const pointerLocked = { value: true };

	beforeEach(() => {
		pointerLocked.value = true;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('X activates the remove tool and suspends the currently selected hotbar tool', () => {
		const { removeTool, key, pointCrosshairAt } = buildHarness(pointerLocked);

		key('KeyX');
		expect(removeTool.activateCount).toBe(1);

		pointCrosshairAt(0, 0);
		expect(removeTool.updateCount).toBeGreaterThan(0);
	});

	it('X again exits Remove Mode and restores the previously selected hotbar tool', () => {
		const { foundationManager, removeTool, key, pointCrosshairAt, click } =
			buildHarness(pointerLocked);

		key('KeyX');
		key('KeyX'); // toggle back off
		expect(removeTool.deactivateCount).toBe(1);

		// Foundation tool (slot 1, the default) must be usable again exactly as before.
		pointCrosshairAt(0, 0);
		click(0);
		pointCrosshairAt(20, 14);
		click(0);
		expect(foundationManager.getFoundations()).toHaveLength(1);
	});

	it('left click while Remove Mode is active routes to the remove tool, not the hotbar tool', () => {
		const { foundationManager, removeTool, key, pointCrosshairAt, click } =
			buildHarness(pointerLocked);

		key('KeyX');
		pointCrosshairAt(0, 0);
		click(0);

		expect(removeTool.primaryCount).toBe(1);
		expect(foundationManager.getFoundations()).toHaveLength(0);
	});

	it('the click that only acquires pointer lock does not remove anything', () => {
		pointerLocked.value = false;
		const { removeTool, key, click } = buildHarness(pointerLocked);

		key('KeyX');
		click(0); // pointer lock not active yet — must be ignored, same rule as every other tool

		expect(removeTool.primaryCount).toBe(0);
	});

	it('right click exits Remove Mode', () => {
		const { removeTool, key, click } = buildHarness(pointerLocked);

		key('KeyX');
		click(2);

		expect(removeTool.deactivateCount).toBe(1);
	});

	it('Escape exits Remove Mode', () => {
		const { removeTool, key } = buildHarness(pointerLocked);

		key('KeyX');
		key('Escape');

		expect(removeTool.deactivateCount).toBe(1);
	});

	it('selecting a hotbar slot while Remove Mode is active exits Remove Mode and switches tools', () => {
		const { removeTool, key, buildToolManager } = buildHarness(pointerLocked);

		key('KeyX');
		buildToolManager.selectSlot(2); // Wall — irrelevant which, just not the current slot

		expect(removeTool.deactivateCount).toBe(1);
	});

	it('regression: pressing a DIGIT KEY (not calling selectSlot directly) while Remove Mode is active also exits it — the keydown handler must route digits through selectSlot, not swallow them', () => {
		const { removeTool, key } = buildHarness(pointerLocked);

		key('KeyX');
		expect(removeTool.activateCount).toBe(1);

		key('Digit2'); // Wall
		expect(removeTool.deactivateCount).toBe(1);
	});

	it('never occupies a numbered hotbar slot — pressing a digit never activates the remove tool', () => {
		const { removeTool, key } = buildHarness(pointerLocked);

		for (const digit of ['Digit1', 'Digit2', 'Digit9']) key(digit);

		expect(removeTool.activateCount).toBe(0);
	});
});

describe('BuildToolManager Paint Mode routing and Remove/Paint mutual exclusion', () => {
	const pointerLocked = { value: true };

	beforeEach(() => {
		pointerLocked.value = true;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('P activates the paint tool and suspends the currently selected hotbar tool', () => {
		const { paintTool, key, pointCrosshairAt } = buildHarness(pointerLocked);

		key('KeyP');
		expect(paintTool.activateCount).toBe(1);

		pointCrosshairAt(0, 0);
		expect(paintTool.updateCount).toBeGreaterThan(0);
	});

	it('P again exits Paint Mode and restores the previously selected hotbar tool', () => {
		const { foundationManager, paintTool, key, pointCrosshairAt, click } =
			buildHarness(pointerLocked);

		key('KeyP');
		key('KeyP');
		expect(paintTool.deactivateCount).toBe(1);

		pointCrosshairAt(0, 0);
		click(0);
		pointCrosshairAt(20, 14);
		click(0);
		expect(foundationManager.getFoundations()).toHaveLength(1);
	});

	it('left click while Paint Mode is active routes to the paint tool, not the hotbar tool', () => {
		const { foundationManager, paintTool, key, pointCrosshairAt, click } =
			buildHarness(pointerLocked);

		key('KeyP');
		pointCrosshairAt(0, 0);
		click(0);

		expect(paintTool.primaryCount).toBe(1);
		expect(foundationManager.getFoundations()).toHaveLength(0);
	});

	it('pressing X while Paint Mode is active exits Paint Mode and enters Remove Mode', () => {
		const { removeTool, paintTool, key } = buildHarness(pointerLocked);

		key('KeyP');
		key('KeyX');

		expect(paintTool.deactivateCount).toBe(1);
		expect(removeTool.activateCount).toBe(1);
	});

	it('pressing P while Remove Mode is active exits Remove Mode and enters Paint Mode', () => {
		const { removeTool, paintTool, key } = buildHarness(pointerLocked);

		key('KeyX');
		key('KeyP');

		expect(removeTool.deactivateCount).toBe(1);
		expect(paintTool.activateCount).toBe(1);
	});

	it('never activates both Remove Mode and Paint Mode at once', () => {
		const { removeTool, paintTool, key } = buildHarness(pointerLocked);

		key('KeyX');
		key('KeyP');
		key('KeyX');

		// Each activation of one mode must be balanced by exactly one deactivation before the next
		// mode's own activation — never two active tools receiving update() in the same frame.
		expect(removeTool.activateCount).toBe(2);
		expect(removeTool.deactivateCount).toBe(1);
		expect(paintTool.activateCount).toBe(1);
		expect(paintTool.deactivateCount).toBe(1);
	});

	it('never occupies a numbered hotbar slot — pressing a digit never activates the paint tool', () => {
		const { paintTool, key } = buildHarness(pointerLocked);

		for (const digit of ['Digit1', 'Digit2', 'Digit9']) key(digit);

		expect(paintTool.activateCount).toBe(0);
	});
});

describe('Music global mode', () => {
	it('suspends construction, routes locked clicks, switches to removal and restores the slot', () => {
		const locked = { value: false };
		const h = buildHarness(locked);
		h.key('KeyM');
		h.buildToolManager.update();
		expect(h.musicTool.activateCount).toBe(1);
		expect(h.musicTool.updateCount).toBe(1);
		h.click(0);
		expect(h.musicTool.primaryCount).toBe(0);
		locked.value = true;
		h.click(0);
		expect(h.musicTool.primaryCount).toBe(1);
		h.key('KeyX');
		expect(h.musicTool.deactivateCount).toBe(1);
		expect(h.removeTool.activateCount).toBe(1);
		h.key('KeyM');
		expect(h.removeTool.deactivateCount).toBe(1);
		h.key('Digit1');
		expect(h.musicTool.deactivateCount).toBe(2);
		h.buildToolManager.dispose();
	});
});

describe('Build Mode toggle (G)', () => {
	const pointerLocked = { value: true };

	beforeEach(() => {
		pointerLocked.value = true;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('starts with Build Mode on so the hotbar is live', () => {
		const { hotbarStates } = buildHarness(pointerLocked);
		expect(hotbarStates.at(-1)?.buildModeActive).toBe(true);
	});

	it('G hides Build Mode and G again restores the previously selected tool', () => {
		const { foundationManager, hotbarStates, key, pointCrosshairAt, click } =
			buildHarness(pointerLocked);

		key('KeyG');
		expect(hotbarStates.at(-1)?.buildModeActive).toBe(false);

		pointCrosshairAt(0, 0);
		click(0);
		pointCrosshairAt(20, 14);
		click(0);
		expect(foundationManager.getFoundations()).toHaveLength(0);

		key('KeyG');
		expect(hotbarStates.at(-1)?.buildModeActive).toBe(true);

		pointCrosshairAt(0, 0);
		click(0);
		pointCrosshairAt(20, 14);
		click(0);
		expect(foundationManager.getFoundations()).toHaveLength(1);
	});

	it('ignores X, P and digit keys while Build Mode is off', () => {
		const { removeTool, paintTool, hotbarStates, key } = buildHarness(pointerLocked);

		key('KeyG');
		key('KeyX');
		key('KeyP');
		key('Digit2');

		expect(removeTool.activateCount).toBe(0);
		expect(paintTool.activateCount).toBe(0);
		expect(hotbarStates.at(-1)?.buildModeActive).toBe(false);
		expect(hotbarStates.at(-1)?.globalMode).toBe('none');
	});

	it('G while Remove Mode is active exits it without leaving a construction tool running', () => {
		const { removeTool, foundationManager, key, pointCrosshairAt, click } =
			buildHarness(pointerLocked);

		key('KeyX');
		expect(removeTool.activateCount).toBe(1);
		key('KeyG');
		expect(removeTool.deactivateCount).toBe(1);

		pointCrosshairAt(0, 0);
		click(0);
		expect(removeTool.primaryCount).toBe(0);
		expect(foundationManager.getFoundations()).toHaveLength(0);
	});

	it('M still works while Build Mode is off, and exiting Compose Mode does not revive the hotbar tool', () => {
		const { musicTool, foundationManager, hotbarStates, key, pointCrosshairAt, click } =
			buildHarness(pointerLocked);

		key('KeyG');
		key('KeyM');
		expect(musicTool.activateCount).toBe(1);
		expect(hotbarStates.at(-1)?.buildModeActive).toBe(false);

		key('KeyM');
		expect(musicTool.deactivateCount).toBe(1);
		expect(hotbarStates.at(-1)?.globalMode).toBe('none');

		pointCrosshairAt(0, 0);
		click(0);
		pointCrosshairAt(20, 14);
		click(0);
		expect(foundationManager.getFoundations()).toHaveLength(0);
	});
});

describe('Hotbar slot variants (↑/↓)', () => {
	const pointerLocked = { value: true };

	beforeEach(() => {
		pointerLocked.value = true;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('selects each group default from the number keys', () => {
		const { polyWallTool, doorTool, ceilingTool, key, hotbarStates } =
			buildHarness(pointerLocked);

		key('Digit2');
		expect(polyWallTool.activateCount).toBe(1);
		expect(hotbarStates.at(-1)?.toolId).toBe('polygon-wall');

		key('Digit3');
		expect(doorTool.activateCount).toBe(1);
		expect(hotbarStates.at(-1)?.toolId).toBe('door');

		key('Digit4');
		expect(ceilingTool.activateCount).toBe(1);
		expect(hotbarStates.at(-1)?.toolId).toBe('ceiling');
	});

	it('ArrowDown / ArrowUp cycle Door → Window → Beam and wrap', () => {
		const { doorTool, windowTool, beamTool, key, hotbarStates } = buildHarness(pointerLocked);

		key('Digit3');
		key('ArrowDown');
		expect(doorTool.deactivateCount).toBe(1);
		expect(windowTool.activateCount).toBe(1);
		expect(hotbarStates.at(-1)?.toolId).toBe('window');

		key('ArrowDown');
		expect(windowTool.deactivateCount).toBe(1);
		expect(beamTool.activateCount).toBe(1);
		expect(hotbarStates.at(-1)?.toolId).toBe('beam');

		key('ArrowDown');
		expect(beamTool.deactivateCount).toBe(1);
		expect(doorTool.activateCount).toBe(2);
		expect(hotbarStates.at(-1)?.toolId).toBe('door');

		key('ArrowUp');
		expect(hotbarStates.at(-1)?.toolId).toBe('beam');
	});

	it('cycles Poly Wall ↔ Wall and Ceiling → Floor → Roof', () => {
		const { polyWallTool, wallTool, ceilingTool, floorTool, roofTool, key, hotbarStates } =
			buildHarness(pointerLocked);

		key('Digit2');
		key('ArrowDown');
		expect(polyWallTool.deactivateCount).toBe(1);
		expect(wallTool.activateCount).toBe(1);

		key('Digit4');
		expect(ceilingTool.activateCount).toBe(1);
		key('ArrowDown');
		expect(floorTool.activateCount).toBe(1);
		key('ArrowDown');
		expect(roofTool.activateCount).toBe(1);
		expect(hotbarStates.at(-1)?.toolId).toBe('flat-roof');
	});

	it('remembers the last variant when leaving and returning to a slot', () => {
		const { windowTool, key, hotbarStates } = buildHarness(pointerLocked);

		key('Digit3');
		key('ArrowDown');
		expect(hotbarStates.at(-1)?.toolId).toBe('window');
		key('Digit1');
		key('Digit3');
		expect(windowTool.activateCount).toBe(2);
		expect(hotbarStates.at(-1)?.toolId).toBe('window');
	});

	it('ignores arrows on a single-tool slot', () => {
		const { key, hotbarStates } = buildHarness(pointerLocked);

		key('ArrowDown');
		expect(hotbarStates.at(-1)?.toolId).toBe('foundation');
	});
});

describe('BuildToolManager placement customize (E)', () => {
	const pointerLocked = { value: true };

	beforeEach(() => {
		pointerLocked.value = true;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('opens on Wall and Poly Wall', () => {
		const { buildToolManager, key } = buildHarness(pointerLocked);

		key('Digit2');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
		key('Escape');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);

		key('ArrowDown');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
	});

	it('opens on Floor Detailing slot 6 variants', () => {
		const { buildToolManager, key } = buildHarness(pointerLocked);

		key('Digit6');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
		key('Escape');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);

		key('ArrowDown');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
	});

	it('opens on Door, Window, and Beam, and closes with E or Escape', () => {
		const { buildToolManager, key } = buildHarness(pointerLocked);

		key('Digit3');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);

		key('ArrowDown');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
		key('Escape');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);

		key('ArrowDown');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
	});

	it('does nothing on Foundation, with Build Mode off, or in Compose Mode', () => {
		const { buildToolManager, key } = buildHarness(pointerLocked);

		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);

		key('Digit3');
		key('KeyG');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);

		key('KeyG');
		key('KeyM');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);
	});

	it('swallows placement clicks and digit keys while open', () => {
		const { buildToolManager, doorTool, key, click } = buildHarness(pointerLocked);

		key('Digit3');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
		click(0);
		expect(doorTool.primaryCount).toBe(0);

		key('Digit1');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
		expect(doorTool.deactivateCount).toBe(0);
	});

	it('closes when leaving Build Mode', () => {
		const { buildToolManager, key } = buildHarness(pointerLocked);

		key('Digit3');
		key('KeyE');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(true);
		key('KeyG');
		expect(buildToolManager.isPlacementCustomizeOpen()).toBe(false);
	});
});

describe('BuildToolManager placement height (C)', () => {
	const pointerLocked = { value: true };

	beforeEach(() => {
		pointerLocked.value = true;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('opens on Ceiling, Floor, and Roof, and closes with C or Escape', () => {
		const { buildToolManager, key } = buildHarness(pointerLocked);

		key('Digit4');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(false);
		key('KeyC');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(true);
		key('KeyC');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(false);

		key('ArrowDown');
		key('KeyC');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(true);
		key('Escape');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(false);

		key('ArrowDown');
		key('KeyC');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(true);
	});

	it('does nothing on Wall, and Shift+C does not open it on Ceiling', () => {
		const { buildToolManager, key } = buildHarness(pointerLocked);

		key('Digit2');
		key('KeyC');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(false);

		key('Digit4');
		key('KeyC', { shiftKey: true });
		expect(buildToolManager.isPlacementHeightOpen()).toBe(false);
	});

	it('swallows placement clicks and digit keys while open', () => {
		const { buildToolManager, ceilingTool, key, click } = buildHarness(pointerLocked);

		key('Digit4');
		key('KeyC');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(true);
		click(0);
		expect(ceilingTool.primaryCount).toBe(0);

		key('Digit1');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(true);
		expect(ceilingTool.deactivateCount).toBe(0);
	});

	it('closes when leaving Build Mode', () => {
		const { buildToolManager, key } = buildHarness(pointerLocked);

		key('Digit4');
		key('KeyC');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(true);
		key('KeyG');
		expect(buildToolManager.isPlacementHeightOpen()).toBe(false);
	});
});
