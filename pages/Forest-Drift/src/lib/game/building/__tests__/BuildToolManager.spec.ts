import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildTool } from '../BuildToolManager';
import { BuildToolManager } from '../BuildToolManager';
import { FoundationManager } from '../FoundationManager';
import { FoundationTool } from '../FoundationTool';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';

/** A trivial BuildTool stand-in that just counts calls — used as `removeTool` in tests that don't care about real removal targeting. */
function makeFakeTool(): BuildTool & {
	activateCount: number;
	deactivateCount: number;
	updateCount: number;
	primaryCount: number;
	secondaryCount: number;
} {
	return {
		toolId: 'remove',
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
	const buildToolManager = new BuildToolManager({
		domElement: domElement as unknown as HTMLElement,
		tools: { foundation: foundationTool },
		removeTool,
		isPointerLocked: () => pointerLocked.value
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

	function key(code: string): void {
		fakeWindow.dispatch('keydown', { code });
	}

	return { foundationManager, buildToolManager, removeTool, pointCrosshairAt, click, key };
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
