import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import { BuildingManager } from '../BuildingManager';
import { BuildUndoManager } from '../BuildUndoManager';
import { DoorTool } from '../DoorTool';
import { FloorDetailManager } from '../FloorDetailManager';
import { FoundationManager } from '../FoundationManager';
import {
	createDefaultBuildingSettings,
	type BuildUiState,
	type FoundationDefinition
} from '../FoundationTypes';
import { RoofManager } from '../RoofManager';
import { createDefaultRoofProfileSettings } from '../RoofTypes';
import { SlabManager } from '../SlabManager';
import { StairManager } from '../StairManager';
import { WallManager } from '../WallManager';
import { WallPathManager } from '../WallPathManager';
import { WindowTool } from '../WindowTool';

/** The real Window/Door tools aimed at a real gable: targeting, floor-driven height, `[`/`]`, undo. */

class FakeWindow {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();
	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}
	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
	}
	press(code: string): void {
		for (const handler of this.listeners.get('keydown') ?? []) handler({ type: 'keydown', code });
	}
}

let fakeWindow: FakeWindow;
beforeEach(() => {
	fakeWindow = new FakeWindow();
	vi.stubGlobal('window', fakeWindow);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

const TOP_Y = 10;
const PLANE_X = 6 + 0.15 / 2;

function setup() {
	const settings = createDefaultBuildingSettings();
	const foundation: FoundationDefinition = {
		id: 'f1',
		minGridX: 0,
		maxGridX: 40,
		minGridZ: 0,
		maxGridZ: 40,
		topY: TOP_Y,
		bottomY: 0
	};
	const foundationManager = new FoundationManager(() => 1);
	foundationManager.load([foundation]);
	const shared = {
		getFoundation: (id: string) => foundationManager.getFoundation(id),
		getVertexSpacing: () => 1,
		getBuildingGridSize: () => settings.buildingGridSize
	};
	const roofManager = new RoofManager({
		...shared,
		buildingSettings: settings,
		getEndWallStyle: () => ({ wallThickness: 0.15 })
	});
	const wallManager = new WallManager(shared);
	const buildingManager = new BuildingManager({
		foundationManager,
		wallManager,
		wallPathManager: new WallPathManager(shared),
		slabManager: new SlabManager(shared),
		stairManager: new StairManager(shared),
		roofManager,
		floorDetailManager: new FloorDetailManager(shared),
		getVertexSpacing: () => 1,
		getBuildingGridSize: () => settings.buildingGridSize,
		getCornerOpeningMargin: () => settings.cornerOpeningMargin
	});
	const grid = settings.buildingGridSize;
	const roof = buildingManager.addRoof({
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 6 / grid, gridZ: 0 },
			{ gridX: 6 / grid, gridZ: 6 / grid },
			{ gridX: 0, gridZ: 6 / grid }
		].map((p) => ({ ...p, foundationId: 'f1' })),
		levelIndex: 1,
		baseY: 3,
		type: 'gable',
		direction: 'x',
		shedDirection: '+x',
		rise: 4,
		thickness: 0.25,
		overhang: 0.3,
		profileSettings: createDefaultRoofProfileSettings()
	}).value!;

	const scene = new THREE.Scene();
	scene.add(foundationManager.group, wallManager.group, roofManager.group);
	const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
	const levelManager = new BuildingLevelManager(settings);
	const undoManager = new BuildUndoManager(buildingManager);
	let hud: BuildUiState | null = null;
	const options = {
		scene,
		camera,
		buildingManager,
		levelManager,
		undoManager,
		buildingSettings: settings,
		onHudChange: (next: BuildUiState | null) => (hud = next)
	};
	const aim = (from: THREE.Vector3, at: THREE.Vector3) => {
		camera.position.copy(from);
		camera.lookAt(at);
		camera.updateMatrixWorld();
		scene.updateMatrixWorld(true);
	};
	return {
		settings,
		buildingManager,
		levelManager,
		roof,
		aim,
		options,
		hud: () => hud
	};
}

/** Outside the +x gable, level with the first floor, looking straight at it (U = 3, under the ridge). */
function aimAtGable(ctx: ReturnType<typeof setup>) {
	ctx.aim(
		new THREE.Vector3(PLANE_X + 5, TOP_Y + 4.5, 3),
		new THREE.Vector3(PLANE_X, TOP_Y + 4.5, 3)
	);
}

describe('Window/Door tools on roof faces', () => {
	it('sizes the opening from the selected floor, and ] fixes it straight away', () => {
		const ctx = setup();
		ctx.settings.windowWidth = 0.6;
		const tool = new WindowTool(ctx.options);
		tool.activate();
		aimAtGable(ctx);

		tool.update();
		expect(ctx.hud()?.crosshair).toBe('invalid');
		expect(ctx.hud()?.notice).toBe('Opening is below this gable · ] to go up a floor');
		tool.onPrimaryAction();
		expect(ctx.buildingManager.getRoof(ctx.roof.id)!.openings).toBeUndefined();

		fakeWindow.press('BracketRight');
		expect(ctx.levelManager.getCurrentLevelIndex('f1')).toBe(1);
		tool.update();
		expect(ctx.hud()?.crosshair).toBe('valid');
		expect(ctx.hud()?.hintLines).toContain('Click gable to place');

		tool.onPrimaryAction();
		const [opening] = ctx.buildingManager.getRoof(ctx.roof.id)!.openings!;
		expect(opening).toMatchObject({ type: 'window', face: '+x' });
		expect(opening.minY).toBeCloseTo(3 + ctx.settings.windowSillHeight);
		expect(opening.maxY).toBeCloseTo(3 + ctx.settings.windowSillHeight + ctx.settings.windowHeight);
		expect((opening.minU + opening.maxU) / 2).toBeCloseTo(3);

		// The window is a real hole: aimed straight through it, the crosshair finds the far gable.
		tool.update();
		expect(ctx.hud()?.crosshair).toBe('valid');
		// Just beside it the gable is solid, and the spot is taken.
		ctx.aim(
			new THREE.Vector3(PLANE_X + 5, TOP_Y + 4.5, 2.55),
			new THREE.Vector3(PLANE_X, TOP_Y + 4.5, 2.55)
		);
		tool.update();
		expect(ctx.hud()?.notice).toBe('Opening overlaps existing window');

		// `-` undoes it.
		fakeWindow.press('Minus');
		expect(ctx.buildingManager.getRoof(ctx.roof.id)!.openings).toEqual([]);
		tool.dispose();
	});

	it('starts a door at the selected floor’s level', () => {
		const ctx = setup();
		const tool = new DoorTool(ctx.options);
		tool.activate();
		aimAtGable(ctx);
		tool.update();
		fakeWindow.press('BracketRight');
		tool.update();
		tool.onPrimaryAction();
		const [door] = ctx.buildingManager.getRoof(ctx.roof.id)!.openings!;
		expect(door.type).toBe('door');
		expect(door.minY).toBeCloseTo(3);
		tool.dispose();
	});

	it('targets the gable from inside the roof space too', () => {
		const ctx = setup();
		const tool = new WindowTool(ctx.options);
		tool.activate();
		ctx.levelManager.lockActiveFoundation('f1');
		ctx.levelManager.setCurrentLevelIndex('f1', 1);
		ctx.levelManager.unlockActiveFoundation();
		ctx.aim(new THREE.Vector3(3, TOP_Y + 4.5, 3), new THREE.Vector3(PLANE_X, TOP_Y + 4.5, 3));
		tool.update();
		expect(ctx.hud()?.crosshair).toBe('valid');
		tool.onPrimaryAction();
		expect(ctx.buildingManager.getRoof(ctx.roof.id)!.openings).toHaveLength(1);
		tool.dispose();
	});

	it('treats a roof slope as the nearest surface: it blocks, with a reason', () => {
		const ctx = setup();
		const tool = new DoorTool(ctx.options);
		tool.activate();
		ctx.aim(new THREE.Vector3(3, TOP_Y + 12, 1), new THREE.Vector3(3, TOP_Y + 5, 1.5));
		tool.update();
		expect(ctx.hud()?.notice).toBe('Roof slopes cannot take openings · aim at a wall or gable end');
		tool.onPrimaryAction();
		expect(ctx.buildingManager.getRoof(ctx.roof.id)!.openings).toBeUndefined();
		tool.dispose();
	});

	it('a wall in front of the gable wins, exactly as before', () => {
		const ctx = setup();
		const grid = ctx.settings.buildingGridSize;
		const wall = ctx.buildingManager.addWall({
			start: { foundationId: 'f1', gridX: 8 / grid, gridZ: 0 },
			end: { foundationId: 'f1', gridX: 8 / grid, gridZ: 6 / grid },
			baseY: 0,
			height: 8,
			thickness: 0.15,
			minimumWallLength: 0.5
		}).value!;
		const tool = new WindowTool(ctx.options);
		tool.activate();
		ctx.aim(new THREE.Vector3(12, TOP_Y + 1.5, 3), new THREE.Vector3(PLANE_X, TOP_Y + 1.5, 3));
		tool.update();
		expect(ctx.hud()?.crosshair).toBe('valid');
		expect(ctx.hud()?.hintLines).toContain('Click wall to place');
		tool.onPrimaryAction();
		expect(ctx.buildingManager.getWall(wall.id)!.openings).toHaveLength(1);
		expect(ctx.buildingManager.getRoof(ctx.roof.id)!.openings).toBeUndefined();
		tool.dispose();
	});
});
