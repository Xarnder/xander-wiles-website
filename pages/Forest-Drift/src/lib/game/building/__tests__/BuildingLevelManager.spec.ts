import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import type { BuildingSettings } from '../FoundationTypes';
import { createDefaultBuildingSettings } from '../FoundationTypes';

function makeSettings(overrides: Partial<BuildingSettings> = {}): BuildingSettings {
	return { ...createDefaultBuildingSettings(), ...overrides };
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

describe('BuildingLevelManager current level index', () => {
	let manager: BuildingLevelManager;
	let settings: BuildingSettings;

	beforeEach(() => {
		settings = makeSettings({ currentBuildingLevelIndex: 0 });
		manager = new BuildingLevelManager(settings);
	});

	afterEach(() => {
		manager.dispose();
	});

	it('reads/writes the same field the GUI and Page Up/Down share', () => {
		expect(manager.getCurrentLevelIndex()).toBe(0);
		manager.setCurrentLevelIndex(2);
		expect(settings.currentBuildingLevelIndex).toBe(2);
		expect(manager.getCurrentLevelIndex()).toBe(2);
	});

	it('Page Up increments, Page Down decrements but never below 0', () => {
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'PageUp' }));
		expect(manager.getCurrentLevelIndex()).toBe(1);
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'PageUp' }));
		expect(manager.getCurrentLevelIndex()).toBe(2);
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'PageDown' }));
		expect(manager.getCurrentLevelIndex()).toBe(1);
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'PageDown' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'PageDown' }));
		expect(manager.getCurrentLevelIndex()).toBe(0);
	});

	it('setCurrentLevelIndex clamps negative input to 0 and rounds', () => {
		manager.setCurrentLevelIndex(-5);
		expect(manager.getCurrentLevelIndex()).toBe(0);
		manager.setCurrentLevelIndex(1.6);
		expect(manager.getCurrentLevelIndex()).toBe(2);
	});

	it('dispose() removes the keydown listener', () => {
		manager.dispose();
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'PageUp' }));
		expect(settings.currentBuildingLevelIndex).toBe(0);
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

	it('removeLevelsForFoundation clears only that foundation', () => {
		const manager = new BuildingLevelManager(makeSettings());
		manager.getOrCreateLevel('a', 0);
		manager.getOrCreateLevel('b', 0);
		manager.removeLevelsForFoundation('a');
		expect(manager.getLevelsForFoundation('a')).toEqual([]);
		expect(manager.getLevelsForFoundation('b')).toHaveLength(1);
		manager.dispose();
	});
});
