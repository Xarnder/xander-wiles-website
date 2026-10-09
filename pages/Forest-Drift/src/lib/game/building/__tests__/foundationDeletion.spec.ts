import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import { BuildingManager } from '../BuildingManager';
import { FloorDetailManager } from '../FloorDetailManager';
import { FoundationManager } from '../FoundationManager';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { FurnitureManager } from '../FurnitureManager';
import type { FurnitureDefinition } from '../FurnitureTypes';
import { RoofManager } from '../RoofManager';
import { roomLidsFromSlabs } from '../skirtingMath';
import { SlabManager } from '../SlabManager';
import { StairManager } from '../StairManager';
import { WallManager } from '../WallManager';
import { WallPathManager } from '../WallPathManager';
import {
	deleteFoundationAndBuilding,
	FOUNDATION_DELETE_CONFIRMATION,
	isFoundationDeleteConfirmed
} from '../foundationDeletion';

const VERTEX_SPACING = 2;
const BUILDING_GRID_SIZE = 0.5;

function makeFoundation(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'foundation-a',
		minGridX: 0,
		maxGridX: 10,
		minGridZ: 0,
		maxGridZ: 6,
		topY: 4,
		bottomY: 0,
		...overrides
	};
}

function torch(id: string, foundationId: string | null): FurnitureDefinition {
	return {
		id,
		kind: 'torch',
		foundationId,
		x: 1,
		y: 1,
		z: 1,
		nx: 0,
		ny: 1,
		nz: 0
	};
}

function setup() {
	const foundationManager = new FoundationManager(() => VERTEX_SPACING);
	const slabManager = new SlabManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE
	});
	const getRoomLids = (foundationId: string) =>
		roomLidsFromSlabs(slabManager.getSlabsForFoundation(foundationId), BUILDING_GRID_SIZE);
	const wallManager = new WallManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE,
		getRoomLids
	});
	const wallPathManager = new WallPathManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE,
		getRoomLids
	});
	const stairManager = new StairManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING
	});
	const roofManager = new RoofManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE
	});
	const floorDetailManager = new FloorDetailManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE
	});
	const buildingManager = new BuildingManager({
		foundationManager,
		wallManager,
		wallPathManager,
		slabManager,
		stairManager,
		roofManager,
		floorDetailManager,
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE,
		getCornerOpeningMargin: () => 0.15
	});
	const levelManager = new BuildingLevelManager(createDefaultBuildingSettings());
	const furnitureManager = new FurnitureManager();
	const placed = [
		{ id: 'object-a', foundationId: 'foundation-a' },
		{ id: 'object-b', foundationId: 'foundation-b' },
		{ id: 'object-loose' }
	];

	foundationManager.addFoundation(makeFoundation());
	foundationManager.addFoundation(makeFoundation({ id: 'foundation-b', minGridX: 20, maxGridX: 30 }));
	buildingManager.addWall({
		start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
		end: { foundationId: 'foundation-a', gridX: 6, gridZ: 0 },
		baseY: 0,
		height: 3,
		thickness: 0.15,
		minimumWallLength: 0.25
	});
	buildingManager.addWall({
		start: { foundationId: 'foundation-b', gridX: 0, gridZ: 0 },
		end: { foundationId: 'foundation-b', gridX: 6, gridZ: 0 },
		baseY: 0,
		height: 3,
		thickness: 0.15,
		minimumWallLength: 0.25
	});
	levelManager.getOrCreateLevel('foundation-a', 1);
	levelManager.getOrCreateLevel('foundation-b', 0);
	levelManager.lockActiveFoundation('foundation-a');
	furnitureManager.add(torch('on-a', 'foundation-a'));
	furnitureManager.add(torch('on-b', 'foundation-b'));
	furnitureManager.add(torch('on-ground', null));

	const deps = {
		buildingManager,
		foundationManager,
		levelManager,
		furnitureManager,
		removePlacedObjects(foundationId: string) {
			for (let i = placed.length - 1; i >= 0; i--) {
				if (placed[i].foundationId === foundationId) placed.splice(i, 1);
			}
		}
	};

	return { foundationManager, buildingManager, levelManager, furnitureManager, placed, deps };
}

beforeEach(() => {
	vi.stubGlobal('window', {
		addEventListener() {},
		removeEventListener() {}
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('isFoundationDeleteConfirmed', () => {
	it('accepts the exact phrase and ignores surrounding whitespace', () => {
		expect(isFoundationDeleteConfirmed(FOUNDATION_DELETE_CONFIRMATION)).toBe(true);
		expect(isFoundationDeleteConfirmed('  Confirm Delete\n')).toBe(true);
	});

	it('rejects a different phrase, different case, or a partial entry', () => {
		expect(isFoundationDeleteConfirmed('confirm delete')).toBe(false);
		expect(isFoundationDeleteConfirmed('Confirm')).toBe(false);
		expect(isFoundationDeleteConfirmed('Confirm  Delete')).toBe(false);
		expect(isFoundationDeleteConfirmed('')).toBe(false);
	});
});

describe('deleteFoundationAndBuilding', () => {
	it('does nothing until the player types Confirm Delete', () => {
		const { foundationManager, buildingManager, levelManager, furnitureManager, placed, deps } =
			setup();

		expect(deleteFoundationAndBuilding(deps, 'foundation-a', 'delete')).toBe(false);

		expect(foundationManager.getFoundation('foundation-a')).toBeDefined();
		expect(buildingManager.getBuildingForFoundation('foundation-a').walls).toHaveLength(1);
		expect(levelManager.getLevelsForFoundation('foundation-a').length).toBeGreaterThan(0);
		expect(furnitureManager.getAll().map((item) => item.id)).toContain('on-a');
		expect(placed.map((item) => item.id)).toContain('object-a');
		furnitureManager.dispose();
		levelManager.dispose();
	});

	it('removes that foundation and the build on it, and leaves the neighbouring foundation', () => {
		const { foundationManager, buildingManager, levelManager, furnitureManager, placed, deps } =
			setup();

		expect(
			deleteFoundationAndBuilding(deps, 'foundation-a', FOUNDATION_DELETE_CONFIRMATION)
		).toBe(true);

		expect(foundationManager.getFoundation('foundation-a')).toBeUndefined();
		expect(buildingManager.getBuildingForFoundation('foundation-a').walls).toHaveLength(0);
		expect(levelManager.getLevelsForFoundation('foundation-a')).toHaveLength(0);
		expect(levelManager.getActiveFoundationId()).toBeNull();
		expect(furnitureManager.getAll().map((item) => item.id)).toEqual(['on-b', 'on-ground']);
		expect(placed.map((item) => item.id)).toEqual(['object-b', 'object-loose']);

		expect(foundationManager.getFoundation('foundation-b')).toBeDefined();
		expect(buildingManager.getBuildingForFoundation('foundation-b').walls).toHaveLength(1);
		expect(levelManager.getLevelsForFoundation('foundation-b')).toHaveLength(1);
		furnitureManager.dispose();
		levelManager.dispose();
	});

	it('lets a new foundation and wall be built on the cleared footprint', () => {
		const { foundationManager, buildingManager, furnitureManager, levelManager, deps } = setup();
		deleteFoundationAndBuilding(deps, 'foundation-a', FOUNDATION_DELETE_CONFIRMATION);

		foundationManager.addFoundation(makeFoundation({ id: 'foundation-new' }));
		const wall = buildingManager.addWall({
			start: { foundationId: 'foundation-new', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-new', gridX: 6, gridZ: 0 },
			baseY: 0,
			height: 3,
			thickness: 0.15,
			minimumWallLength: 0.25
		});

		expect(wall.valid).toBe(true);
		expect(foundationManager.getFoundation('foundation-new')).toBeDefined();
		expect(buildingManager.getBuildingForFoundation('foundation-new').walls).toHaveLength(1);
		furnitureManager.dispose();
		levelManager.dispose();
	});

	it('returns false for an unknown foundation even with the right phrase', () => {
		const { foundationManager, furnitureManager, levelManager, deps } = setup();
		expect(deleteFoundationAndBuilding(deps, 'missing', FOUNDATION_DELETE_CONFIRMATION)).toBe(
			false
		);
		expect(foundationManager.getFoundations()).toHaveLength(2);
		furnitureManager.dispose();
		levelManager.dispose();
	});
});
