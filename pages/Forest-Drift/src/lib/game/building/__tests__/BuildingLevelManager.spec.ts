import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import type { BuildingSettings } from '../FoundationTypes';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationBuildingDefinition } from '../WallTypes';

/**
 * Minimal EventTarget-like stand-in for `window` — this test suite runs in vitest's `node`
 * environment (no real DOM; see vite.config.ts), same reasoning as BuildToolManager.spec.ts's
 * FakeElement. Unlike that file's plain `vi.fn()` stub, Page Up/Down needs an actual dispatch to
 * exercise the real keydown handler, so this fake tracks listeners for real.
 */
class FakeWindow {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}

	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
	}

	dispatchEvent(event: { type: string }): void {
		for (const handler of this.listeners.get(event.type) ?? []) handler(event);
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

function pressKey(code: string): void {
	fakeWindow.dispatchEvent({ type: 'keydown', code } as unknown as { type: string });
}

function makeSettings(overrides: Partial<BuildingSettings> = {}): BuildingSettings {
	return { ...createDefaultBuildingSettings(), ...overrides };
}

function emptyBuilding(foundationId: string): FoundationBuildingDefinition {
	return { foundationId, walls: [], wallPaths: [], slabs: [], stairs: [] };
}

describe('BuildingLevelManager.getOrCreateLevel', () => {
	let manager: BuildingLevelManager;

	afterEach(() => {
		manager?.dispose();
	});

	it('level 0 always starts at baseY = 0, using the current defaultStoreyHeight as wallHeight', () => {
		const settings = makeSettings({ defaultStoreyHeight: 3 });
		manager = new BuildingLevelManager(settings);
		const level0 = manager.getOrCreateLevel('f1', 0);
		expect(level0.baseY).toBe(0);
		expect(level0.wallHeight).toBe(3);
	});

	it('a new level starts at the previous level baseY + wallHeight', () => {
		const settings = makeSettings({ defaultStoreyHeight: 3 });
		manager = new BuildingLevelManager(settings);
		const level1 = manager.getOrCreateLevel('f1', 1);
		expect(level1.baseY).toBe(3);
		const level2 = manager.getOrCreateLevel('f1', 2);
		expect(level2.baseY).toBe(6);
	});

	it('recursively creates every level below the requested one, contiguously', () => {
		const settings = makeSettings({ defaultStoreyHeight: 4 });
		manager = new BuildingLevelManager(settings);
		manager.getOrCreateLevel('f1', 2);
		const levels = manager.getLevelsForFoundation('f1').map((l) => l.index);
		expect(levels).toEqual([0, 1, 2]);
	});

	it('freezes wallHeight/baseY at creation time — a later change to defaultStoreyHeight does not move an existing level', () => {
		const settings = makeSettings({ defaultStoreyHeight: 3 });
		manager = new BuildingLevelManager(settings);
		const level0 = manager.getOrCreateLevel('f1', 0);
		expect(level0.wallHeight).toBe(3);

		settings.defaultStoreyHeight = 5;
		const level0Again = manager.getOrCreateLevel('f1', 0);
		expect(level0Again).toBe(level0);
		expect(level0Again.wallHeight).toBe(3);

		// Only a *new* level created after the setting changed picks up the new value.
		const level1 = manager.getOrCreateLevel('f1', 1);
		expect(level1.wallHeight).toBe(5);
		expect(level1.baseY).toBe(3); // level0.baseY(0) + level0.wallHeight(3), not the new 5
	});

	it('is independent per foundation', () => {
		const settings = makeSettings({ defaultStoreyHeight: 3 });
		manager = new BuildingLevelManager(settings);
		manager.getOrCreateLevel('a', 1);
		expect(manager.getLevelsForFoundation('b')).toEqual([]);
		expect(manager.getLevelsForFoundation('a')).toHaveLength(2);
	});

	it('throws for a negative level index', () => {
		manager = new BuildingLevelManager(makeSettings());
		expect(() => manager.getOrCreateLevel('f1', -1)).toThrow();
	});
});

describe('BuildingLevelManager per-foundation current level index', () => {
	let manager: BuildingLevelManager;
	let settings: BuildingSettings;

	beforeEach(() => {
		settings = makeSettings();
		manager = new BuildingLevelManager(settings);
	});

	afterEach(() => {
		manager.dispose();
	});

	it('defaults to 0 for a foundation that has never had its level set', () => {
		expect(manager.getCurrentLevelIndex('f1')).toBe(0);
	});

	it('setCurrentLevelIndex is independent per foundation', () => {
		manager.setCurrentLevelIndex('a', 2);
		expect(manager.getCurrentLevelIndex('a')).toBe(2);
		expect(manager.getCurrentLevelIndex('b')).toBe(0);
	});

	it('setCurrentLevelIndex clamps negative input to 0 and rounds', () => {
		manager.setCurrentLevelIndex('f1', -5);
		expect(manager.getCurrentLevelIndex('f1')).toBe(0);
		manager.setCurrentLevelIndex('f1', 1.6);
		expect(manager.getCurrentLevelIndex('f1')).toBe(2);
	});

	it('mirrors the active foundation onto buildingSettings.currentBuildingLevelIndex for the debug GUI', () => {
		manager.lockActiveFoundation('a');
		manager.setCurrentLevelIndex('a', 3);
		expect(settings.currentBuildingLevelIndex).toBe(3);

		manager.unlockActiveFoundation();
		manager.reportHoveredFoundation('b');
		expect(settings.currentBuildingLevelIndex).toBe(0); // 'b' has never had its level changed
	});
});

describe('BuildingLevelManager foundation context (activeFoundationId, hover, and locking)', () => {
	let manager: BuildingLevelManager;

	beforeEach(() => {
		manager = new BuildingLevelManager(makeSettings());
	});

	afterEach(() => {
		manager.dispose();
	});

	it('has no active foundation until one is reported or locked', () => {
		expect(manager.getActiveFoundationId()).toBeNull();
	});

	it('reportHoveredFoundation makes a foundation active', () => {
		manager.reportHoveredFoundation('a');
		expect(manager.getActiveFoundationId()).toBe('a');
	});

	it('reportHoveredFoundation(null) — a raycast miss — retains the most recently active foundation rather than clearing it', () => {
		manager.reportHoveredFoundation('a');
		manager.reportHoveredFoundation(null);
		expect(manager.getActiveFoundationId()).toBe('a');
	});

	it('reportHoveredFoundation switches to whichever foundation is currently hovered, while unlocked', () => {
		manager.reportHoveredFoundation('a');
		manager.reportHoveredFoundation('b');
		expect(manager.getActiveFoundationId()).toBe('b');
	});

	it('lockActiveFoundation makes reportHoveredFoundation a no-op until unlocked — the crosshair drifting onto a different foundation mid-draw never steals context', () => {
		manager.lockActiveFoundation('a');
		expect(manager.isFoundationLocked()).toBe(true);
		manager.reportHoveredFoundation('b');
		expect(manager.getActiveFoundationId()).toBe('a');

		manager.unlockActiveFoundation();
		expect(manager.isFoundationLocked()).toBe(false);
		manager.reportHoveredFoundation('b');
		expect(manager.getActiveFoundationId()).toBe('b');
	});

	it('each foundation keeps its own current level index, independent of which one is currently active', () => {
		manager.lockActiveFoundation('a');
		manager.moveUp();
		manager.moveUp();
		expect(manager.getCurrentLevelIndex('a')).toBe(2);

		manager.unlockActiveFoundation();
		manager.reportHoveredFoundation('b');
		expect(manager.getCurrentLevelIndex('b')).toBe(0); // untouched by foundation 'a's moves
		expect(manager.getCurrentLevelIndex('a')).toBe(2); // still remembered
	});
});

describe('BuildingLevelManager.moveUp / moveDown', () => {
	let manager: BuildingLevelManager;
	let settings: BuildingSettings;

	beforeEach(() => {
		settings = makeSettings({ defaultStoreyHeight: 3 });
		manager = new BuildingLevelManager(settings);
	});

	afterEach(() => {
		manager.dispose();
	});

	it('does nothing when no foundation is active', () => {
		manager.moveUp();
		manager.moveDown();
		expect(manager.getActiveFoundationId()).toBeNull();
	});

	it('Page Up increments, Page Down decrements but never below 0, for the active foundation', () => {
		manager.reportHoveredFoundation('f1');
		pressKey('PageUp');
		expect(manager.getCurrentLevelIndex('f1')).toBe(1);
		pressKey('PageUp');
		expect(manager.getCurrentLevelIndex('f1')).toBe(2);
		pressKey('PageDown');
		expect(manager.getCurrentLevelIndex('f1')).toBe(1);
		pressKey('PageDown');
		pressKey('PageDown');
		expect(manager.getCurrentLevelIndex('f1')).toBe(0);
	});

	it('moveUp creates the next level from the CURRENT level baseY + wallHeight when none exists yet', () => {
		manager.reportHoveredFoundation('f1');
		manager.moveUp();
		expect(manager.getLevel('f1', 1)?.baseY).toBe(3);
	});

	it('moveUp selects an already-authored higher level instead of recomputing it from defaultStoreyHeight', () => {
		manager.getOrCreateLevel('f1', 0);
		// Author level 1 directly at a non-default elevation, simulating a level created earlier with
		// a different storey height (or discovered from geometry).
		manager.load([
			{ id: 'l0', foundationId: 'f1', index: 0, baseY: 0, wallHeight: 3 },
			{ id: 'l1', foundationId: 'f1', index: 1, baseY: 6.5, wallHeight: 3.5 }
		]);
		manager.reportHoveredFoundation('f1');

		settings.defaultStoreyHeight = 999; // must NOT influence the result below
		manager.moveUp();

		expect(manager.getCurrentLevelIndex('f1')).toBe(1);
		expect(manager.getLevel('f1', 1)?.baseY).toBe(6.5); // the authored value, not 0 + 999
	});

	it('never skips a known level — moving up twice in a row lands on the next AUTHORED elevation each time', () => {
		manager.load([
			{ id: 'l0', foundationId: 'f1', index: 0, baseY: 0, wallHeight: 3 },
			{ id: 'l1', foundationId: 'f1', index: 1, baseY: 3, wallHeight: 3.5 },
			{ id: 'l2', foundationId: 'f1', index: 2, baseY: 6.5, wallHeight: 3.5 }
		]);
		manager.reportHoveredFoundation('f1');
		manager.moveUp();
		expect(manager.getCurrentLevelIndex('f1')).toBe(1);
		manager.moveUp();
		expect(manager.getCurrentLevelIndex('f1')).toBe(2);
		expect(manager.getLevel('f1', 2)?.baseY).toBe(6.5);
	});

	it('refuses to create a new level beyond maxBuildingLevels, but still allows selecting an existing one at or above the cap', () => {
		settings.maxBuildingLevels = 2;
		manager.reportHoveredFoundation('f1');
		manager.moveUp(); // f1 now has levels 0, 1 — at the cap
		expect(manager.getLevelsForFoundation('f1')).toHaveLength(2);
		manager.moveUp(); // would need to create level 2 — refused
		expect(manager.getCurrentLevelIndex('f1')).toBe(1);
		expect(manager.getLevelsForFoundation('f1')).toHaveLength(2);
	});

	it('moveDown does nothing at level 0', () => {
		manager.reportHoveredFoundation('f1');
		manager.moveDown();
		expect(manager.getCurrentLevelIndex('f1')).toBe(0);
	});

	it('dispose() removes the keydown listener', () => {
		manager.reportHoveredFoundation('f1');
		manager.dispose();
		pressKey('PageUp');
		expect(manager.getCurrentLevelIndex('f1')).toBe(0);
	});
});

describe('BuildingLevelManager.getLevelUiState', () => {
	let manager: BuildingLevelManager;
	let settings: BuildingSettings;

	beforeEach(() => {
		settings = makeSettings({ defaultStoreyHeight: 3, maxBuildingLevels: 3 });
		manager = new BuildingLevelManager(settings);
	});

	afterEach(() => {
		manager.dispose();
	});

	it('reports Ground Floor at index 0 — cannot move down, can move up', () => {
		const state = manager.getLevelUiState('f1');
		expect(state).toEqual({
			index: 0,
			baseY: 0,
			displayName: 'Ground Floor',
			canMoveDown: false,
			canMoveUp: true
		});
	});

	it('reports First Floor at index 1 with both directions available', () => {
		manager.getOrCreateLevel('f1', 1);
		manager.setCurrentLevelIndex('f1', 1);
		const state = manager.getLevelUiState('f1');
		expect(state.index).toBe(1);
		expect(state.baseY).toBe(3);
		expect(state.displayName).toBe('First Floor');
		expect(state.canMoveDown).toBe(true);
		expect(state.canMoveUp).toBe(true);
	});

	it('canMoveUp is false once at maxBuildingLevels with no higher level already authored', () => {
		manager.getOrCreateLevel('f1', 1);
		manager.getOrCreateLevel('f1', 2);
		manager.setCurrentLevelIndex('f1', 2);
		expect(manager.getLevelUiState('f1').canMoveUp).toBe(false);
	});

	it('canMoveUp stays true past the cap if a higher level already exists (selecting it is always allowed)', () => {
		manager.load([
			{ id: 'l0', foundationId: 'f1', index: 0, baseY: 0, wallHeight: 3 },
			{ id: 'l1', foundationId: 'f1', index: 1, baseY: 3, wallHeight: 3 },
			{ id: 'l2', foundationId: 'f1', index: 2, baseY: 6, wallHeight: 3 },
			{ id: 'l3', foundationId: 'f1', index: 3, baseY: 9, wallHeight: 3 }
		]);
		manager.setCurrentLevelIndex('f1', 2);
		expect(manager.getLevelUiState('f1').canMoveUp).toBe(true);
	});
});

describe('BuildingLevelManager.discoverLevelsFromBuilding', () => {
	let manager: BuildingLevelManager;

	beforeEach(() => {
		manager = new BuildingLevelManager(makeSettings({ defaultStoreyHeight: 3 }));
	});

	afterEach(() => {
		manager.dispose();
	});

	it('infers levels from wall/slab baseY values, in order, with wallHeight from the gap to the next one', () => {
		const building = emptyBuilding('f1');
		building.walls.push(
			{
				id: 'w1',
				foundationId: 'f1',
				startGridX: 0,
				startGridZ: 0,
				endGridX: 10,
				endGridZ: 0,
				baseY: 0,
				height: 3,
				thickness: 0.15,
				openings: []
			},
			{
				id: 'w2',
				foundationId: 'f1',
				startGridX: 0,
				startGridZ: 0,
				endGridX: 10,
				endGridZ: 0,
				baseY: 3,
				height: 3,
				thickness: 0.15,
				openings: []
			}
		);
		building.slabs.push({
			id: 's1',
			foundationId: 'f1',
			points: [],
			type: 'floor',
			levelIndex: 0,
			localY: 3,
			thickness: 0.2,
			openings: []
		});

		manager.discoverLevelsFromBuilding('f1', building);

		const levels = manager.getLevelsForFoundation('f1');
		expect(levels.map((l) => l.baseY)).toEqual([0, 3]);
		expect(levels[0].wallHeight).toBe(3); // gap to the next inferred elevation (3 - 0)
		expect(levels[1].wallHeight).toBe(3); // nothing above it — falls back to defaultStoreyHeight
	});

	it('always includes level 0 at baseY 0, even if nothing was placed exactly there', () => {
		const building = emptyBuilding('f1');
		building.stairs.push({
			id: 'st1',
			foundationId: 'f1',
			minGridX: 0,
			maxGridX: 4,
			minGridZ: 0,
			maxGridZ: 8,
			baseY: 5,
			direction: '+x',
			levelIndex: 1,
			gridSizeAtCreation: 0.25
		});

		manager.discoverLevelsFromBuilding('f1', building);
		expect(manager.getLevelsForFoundation('f1').map((l) => l.baseY)).toEqual([0, 5]);
	});

	it('treats near-identical elevations as one level, within a small epsilon', () => {
		const building = emptyBuilding('f1');
		building.walls.push(
			{
				id: 'w1',
				foundationId: 'f1',
				startGridX: 0,
				startGridZ: 0,
				endGridX: 10,
				endGridZ: 0,
				baseY: 3,
				height: 3,
				thickness: 0.15,
				openings: []
			},
			{
				id: 'w2',
				foundationId: 'f1',
				startGridX: 0,
				startGridZ: 5,
				endGridX: 10,
				endGridZ: 5,
				baseY: 3.001,
				height: 3,
				thickness: 0.15,
				openings: []
			}
		);

		manager.discoverLevelsFromBuilding('f1', building);
		expect(manager.getLevelsForFoundation('f1').map((l) => l.baseY)).toEqual([0, 3]);
	});

	it('is a no-op if the foundation already has authored levels — never overwrites them', () => {
		manager.getOrCreateLevel('f1', 0);
		manager.setCurrentLevelIndex('f1', 0);
		const before = manager.getLevelsForFoundation('f1');

		const building = emptyBuilding('f1');
		building.walls.push({
			id: 'w1',
			foundationId: 'f1',
			startGridX: 0,
			startGridZ: 0,
			endGridX: 10,
			endGridZ: 0,
			baseY: 99,
			height: 3,
			thickness: 0.15,
			openings: []
		});
		manager.discoverLevelsFromBuilding('f1', building);

		expect(manager.getLevelsForFoundation('f1')).toEqual(before);
	});
});

describe('BuildingLevelManager serialize/load', () => {
	it('round-trips level definitions', () => {
		const manager = new BuildingLevelManager(makeSettings({ defaultStoreyHeight: 3 }));
		manager.getOrCreateLevel('f1', 2);
		const serialized = manager.serialize();
		expect(serialized).toHaveLength(3);

		const other = new BuildingLevelManager(makeSettings());
		other.load(serialized);
		expect(other.getLevelsForFoundation('f1')).toEqual(manager.getLevelsForFoundation('f1'));

		manager.dispose();
		other.dispose();
	});

	it('removeLevelsForFoundation clears only that foundation, plus its current-level and active-foundation state', () => {
		const manager = new BuildingLevelManager(makeSettings());
		manager.getOrCreateLevel('a', 0);
		manager.getOrCreateLevel('b', 0);
		manager.lockActiveFoundation('a');
		manager.setCurrentLevelIndex('a', 2);

		manager.removeLevelsForFoundation('a');

		expect(manager.getLevelsForFoundation('a')).toEqual([]);
		expect(manager.getLevelsForFoundation('b')).toHaveLength(1);
		expect(manager.getCurrentLevelIndex('a')).toBe(0); // forgotten along with the levels
		expect(manager.getActiveFoundationId()).toBeNull(); // 'a' was active and locked — cleared
		expect(manager.isFoundationLocked()).toBe(false);
		manager.dispose();
	});
});
