import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import { FoundationManager } from '../FoundationManager';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { StairLevelTrigger } from '../StairLevelTrigger';
import { StairManager } from '../StairManager';
import type { StairDefinition } from '../StairTypes';

class FakeWindow {
	private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

	addEventListener(type: string, handler: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(handler);
	}

	removeEventListener(type: string, handler: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(handler);
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

const SPACING = 2;

function foundation(): FoundationDefinition {
	return {
		id: 'f1',
		minGridX: 0,
		maxGridX: 20,
		minGridZ: 0,
		maxGridZ: 20,
		topY: 0,
		bottomY: -2
	};
}

function stair(overrides: Partial<StairDefinition> = {}): StairDefinition {
	return {
		id: 'stair-1',
		foundationId: 'f1',
		minGridX: 0,
		maxGridX: 12,
		minGridZ: 0,
		maxGridZ: 4,
		baseY: 0,
		direction: '+x',
		levelIndex: 0,
		gridSizeAtCreation: 0.25,
		...overrides
	};
}

function setup() {
	const foundations = new FoundationManager(() => SPACING);
	foundations.addFoundation(foundation());
	const stairManager = new StairManager({
		getFoundation: (id) => foundations.getFoundation(id),
		getVertexSpacing: () => SPACING
	});
	stairManager.addStair(stair());
	const levelManager = new BuildingLevelManager(createDefaultBuildingSettings());
	const trigger = new StairLevelTrigger(stairManager, levelManager);
	return { stairManager, levelManager, trigger };
}

describe('StairLevelTrigger', () => {
	let levelManager: BuildingLevelManager;

	afterEach(() => {
		levelManager?.dispose();
	});

	it('switches to the upper storey after walking up and leaving the volume', () => {
		const setupResult = setup();
		levelManager = setupResult.levelManager;
		const { trigger } = setupResult;

		trigger.update(1.5, 0.1, 0.5);
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(0);

		trigger.update(1.5, 2.9, 0.5);
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(0);

		trigger.update(4, 3, 0.5);
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(1);
		expect(levelManager.getActiveFoundationId()).toBe('f1');
		expect(levelManager.getLevel('f1', 1)).toBeDefined();
	});

	it('switches to the lower storey after walking down and leaving the volume', () => {
		const setupResult = setup();
		levelManager = setupResult.levelManager;
		const { trigger } = setupResult;
		levelManager.reportHoveredFoundation('f1');
		levelManager.getOrCreateLevel('f1', 1);
		levelManager.setCurrentLevelIndex('f1', 1);

		trigger.update(2.8, 2.9, 0.5);
		trigger.update(-1, 0.1, 0.5);
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(0);
	});

	it('does not treat a jump on the steps as leaving the stair', () => {
		const setupResult = setup();
		levelManager = setupResult.levelManager;
		const { trigger } = setupResult;

		trigger.update(1.5, 0.1, 0.5);
		trigger.update(1.5, 1.6, 0.5);
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(0);
		trigger.update(-1, 0.15, 0.5);
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(0);
	});

	it('does not change level when the player leaves at the same end they entered', () => {
		const setupResult = setup();
		levelManager = setupResult.levelManager;
		const { trigger } = setupResult;
		levelManager.reportHoveredFoundation('f1');
		levelManager.getOrCreateLevel('f1', 1);
		levelManager.setCurrentLevelIndex('f1', 1);

		trigger.update(0.2, 0.1, 0.5);
		trigger.update(-1, 0.15, 0.5);
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(1);
	});

	it('does not steal the storey while a placement has locked the foundation', () => {
		const setupResult = setup();
		levelManager = setupResult.levelManager;
		const { trigger } = setupResult;
		levelManager.lockActiveFoundation('f1');
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(0);

		trigger.update(1.5, 0.1, 0.5);
		trigger.update(4, 3, 0.5);
		expect(levelManager.getCurrentLevelIndex('f1')).toBe(0);
	});
});
