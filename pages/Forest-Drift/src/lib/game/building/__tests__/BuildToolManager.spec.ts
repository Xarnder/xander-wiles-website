import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildToolManager } from '../BuildToolManager';
import { FoundationManager } from '../FoundationManager';
import { FoundationTool } from '../FoundationTool';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';

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
	vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });

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
	const buildToolManager = new BuildToolManager({
		domElement: domElement as unknown as HTMLElement,
		tools: { foundation: foundationTool },
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

	return { foundationManager, pointCrosshairAt, click };
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
