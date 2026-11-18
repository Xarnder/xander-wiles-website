import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BuildingLevelManager } from '../BuildingLevelManager';
import { levelDisplayName } from '../BuildingLevelTypes';
import { BuildingManager } from '../BuildingManager';
import { BuildUndoManager } from '../BuildUndoManager';
import { FloorDetailManager } from '../FloorDetailManager';
import { FoundationManager } from '../FoundationManager';
import { FoundationMesh } from '../FoundationMesh';
import { createDefaultBuildingSettings, type FoundationDefinition } from '../FoundationTypes';
import { RoofManager } from '../RoofManager';
import { roomLidsFromSlabs } from '../skirtingMath';
import { SlabManager } from '../SlabManager';
import { StairManager } from '../StairManager';
import { WallManager } from '../WallManager';
import { WallPathManager } from '../WallPathManager';
import { DECK_THICKNESS, FOOTING_DEPTH } from '../basementTypes';

const SPACING = 2;
const GRID = 0.5;

// The level and undo managers listen for their keys on `window`; this suite runs in Node.
beforeAll(() => {
	vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
});
afterAll(() => {
	vi.unstubAllGlobals();
});

function makeFoundation(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'house',
		minGridX: 0,
		maxGridX: 6, // 12 m
		minGridZ: 0,
		maxGridZ: 5, // 10 m
		topY: 20,
		bottomY: 18.5,
		...overrides
	};
}

function setup() {
	const foundationManager = new FoundationManager(() => SPACING);
	const slabManager = new SlabManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID
	});
	const getRoomLids = (id: string) =>
		roomLidsFromSlabs(slabManager.getSlabsForFoundation(id), GRID);
	const wallManager = new WallManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID,
		getRoomLids
	});
	const wallPathManager = new WallPathManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID,
		getRoomLids
	});
	const stairManager = new StairManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING
	});
	const roofManager = new RoofManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID
	});
	const floorDetailManager = new FloorDetailManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID
	});
	const buildingManager = new BuildingManager({
		foundationManager,
		wallManager,
		wallPathManager,
		slabManager,
		stairManager,
		roofManager,
		floorDetailManager,
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID,
		getCornerOpeningMargin: () => 0.15
	});
	const levelManager = new BuildingLevelManager(
		createDefaultBuildingSettings(),
		(id) => foundationManager.getFoundation(id)?.basement
	);
	return { foundationManager, slabManager, stairManager, buildingManager, levelManager };
}

const stair = (baseY: number, levelIndex: number, minGridX = 4) => ({
	foundationId: 'house',
	minGridX,
	maxGridX: minGridX + 6, // 6 steps of 0.5 m: 3 m, one storey
	minGridZ: 4,
	maxGridZ: 8,
	baseY,
	direction: '+x' as const,
	levelIndex,
	gridSizeAtCreation: GRID,
	minimumStairWidthCells: 2,
	minimumStairRunCells: 2
});

describe('BuildingManager.addBasement', () => {
	it('adds the basement, the deck and a floor between each pair of storeys', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const holes: number[] = [];
		foundationManager.setTerrainHolesHandler((rects) => holes.push(rects.length));

		const result = buildingManager.addBasement('house', { storeys: 3, storeyHeight: 3 }, 0.2);
		expect(result.valid).toBe(true);
		expect(foundationManager.getFoundation('house')?.basement).toEqual({
			storeys: 3,
			storeyHeight: 3
		});
		const slabs = buildingManager.getSlabsForFoundation('house');
		expect(slabs.map((s) => [s.role, s.type, s.levelIndex, s.localY])).toEqual([
			['deck', 'ceiling', -1, 0],
			['basement-floor', 'floor', -2, -3],
			['basement-floor', 'floor', -3, -6]
		]);
		expect(holes.at(-1)).toBe(1);
	});

	it('refuses a second basement, an earth pad, a bad basement and a floor in the way', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		foundationManager.addFoundation(
			makeFoundation({ id: 'pad', minGridX: 10, maxGridX: 14, style: 'earth' })
		);
		foundationManager.addFoundation(makeFoundation({ id: 'busy', minGridX: 20, maxGridX: 24 }));
		const b = { storeys: 1, storeyHeight: 3 };

		expect(buildingManager.addBasement('pad', b, 0.2).reason).toBe(
			'Basements need a stone foundation'
		);
		expect(buildingManager.addBasement('house', { storeys: 4, storeyHeight: 3 }, 0.2).valid).toBe(
			false
		);
		expect(buildingManager.addBasement('house', b, 0.2).valid).toBe(true);
		expect(buildingManager.addBasement('house', b, 0.2).reason).toBe('Already has a basement');

		// A slab already at the deck's height.
		buildingManager.addSlab({
			points: [
				{ foundationId: 'busy', gridX: 0, gridZ: 0 },
				{ foundationId: 'busy', gridX: 4, gridZ: 0 },
				{ foundationId: 'busy', gridX: 4, gridZ: 4 }
			],
			type: 'floor',
			levelIndex: 0,
			localY: 0,
			thickness: 0.2
		});
		expect(buildingManager.addBasement('busy', b, 0.2).valid).toBe(false);
		expect(foundationManager.getFoundation('busy')?.basement).toBeUndefined();
	});

	it('keeps the deck unless the basement goes; basement floors are ordinary', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		buildingManager.addBasement('house', { storeys: 2, storeyHeight: 3 }, 0.2);
		const [deck, floor] = buildingManager.getSlabsForFoundation('house');
		expect(buildingManager.removeSlab(deck.id)).toBe(false);
		expect(buildingManager.removeSlab(floor.id)).toBe(true);
		expect(buildingManager.getSlabsForFoundation('house').map((s) => s.role)).toEqual(['deck']);
	});

	it('lets a stair from the basement cut its way up through the deck', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		buildingManager.addBasement('house', { storeys: 1, storeyHeight: 3 }, 0.2);
		const result = buildingManager.addStair(stair(-3, -1));
		expect(result.valid).toBe(true);
		const deck = buildingManager.getSlabsForFoundation('house').find((s) => s.role === 'deck')!;
		expect(deck.openings).toHaveLength(1);
		expect(deck.openings[0].sourceStairId).toBe(result.value!.id);
	});
});

describe('BuildingManager.removeBasement', () => {
	it('removes an empty basement and its slabs, leaving a solid foundation', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		buildingManager.addBasement('house', { storeys: 2, storeyHeight: 3 }, 0.2);
		const result = buildingManager.removeBasement('house');
		expect(result.valid).toBe(true);
		expect(foundationManager.getFoundation('house')?.basement).toBeUndefined();
		expect(buildingManager.getSlabsForFoundation('house')).toEqual([]);
		expect(foundationManager.getBasementHoleRects()).toEqual([]);
	});

	it('refuses while anything is down there, counting pieces the caller owns too', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		buildingManager.addBasement('house', { storeys: 2, storeyHeight: 3 }, 0.2);
		buildingManager.addWall({
			start: { foundationId: 'house', gridX: 2, gridZ: 2 },
			end: { foundationId: 'house', gridX: 10, gridZ: 2 },
			baseY: -6,
			height: 3,
			thickness: 0.15,
			minimumWallLength: 0.25
		});
		buildingManager.addStair(stair(-3, -1));
		expect(buildingManager.removeBasement('house').reason).toBe(
			'Empty the basement first (2 pieces)'
		);
		expect(foundationManager.getFoundation('house')?.basement).toBeDefined();
		expect(buildingManager.countBasementOccupants('house')).toBe(2);

		const { foundationManager: fm2, buildingManager: bm2 } = setup();
		fm2.addFoundation(makeFoundation());
		bm2.addBasement('house', { storeys: 1, storeyHeight: 3 }, 0.2);
		expect(bm2.removeBasement('house', 1).reason).toBe('Empty the basement first (1 piece)');
	});

	it('ignores the Ground Floor', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		buildingManager.addBasement('house', { storeys: 1, storeyHeight: 3 }, 0.2);
		buildingManager.addWall({
			start: { foundationId: 'house', gridX: 2, gridZ: 2 },
			end: { foundationId: 'house', gridX: 10, gridZ: 2 },
			baseY: 0,
			height: 3,
			thickness: 0.15,
			minimumWallLength: 0.25
		});
		expect(buildingManager.countBasementOccupants('house')).toBe(0);
		expect(buildingManager.removeBasement('house').valid).toBe(true);
	});
});

describe('basement storeys', () => {
	it('exist down to the basement, named, and go with it', () => {
		const { foundationManager, buildingManager, levelManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		levelManager.suggestActiveFoundation('house');
		levelManager.moveDown();
		expect(levelManager.getCurrentLevelIndex('house')).toBe(0);

		buildingManager.addBasement('house', { storeys: 3, storeyHeight: 3.5 }, 0.2);
		for (let i = 0; i < 5; i++) levelManager.moveDown();
		expect(levelManager.getCurrentLevelIndex('house')).toBe(-3);
		expect(levelManager.getLevelUiState('house')).toMatchObject({
			index: -3,
			baseY: -10.5,
			wallHeight: 3.5,
			displayName: 'Deep Basement',
			canMoveDown: false,
			canMoveUp: true
		});
		expect(levelManager.getOrCreateLevel('house', -1)).toMatchObject({ baseY: -3.5 });
		expect(levelManager.getLevel('house', -4)).toBeUndefined();
		expect(() => levelManager.getOrCreateLevel('house', -4)).toThrow();
		// Never stored: the saved levels are still only the Ground Floor and up.
		expect(levelManager.getLevelsForFoundation('house').every((l) => l.index >= 0)).toBe(true);

		// Removing the basement takes its storeys away, and the current storey with them.
		for (const slab of buildingManager.getSlabsForFoundation('house'))
			if (slab.role === 'basement-floor') buildingManager.removeSlab(slab.id);
		buildingManager.removeBasement('house');
		expect(levelManager.getCurrentLevelIndex('house')).toBe(0);
		expect(levelManager.getLevelUiState('house').canMoveDown).toBe(false);
	});

	it('names basement storeys', () => {
		expect([-1, -2, -3, 0, 1].map(levelDisplayName)).toEqual([
			'Basement',
			'Lower Basement',
			'Deep Basement',
			'Ground Floor',
			'First Floor'
		]);
	});

	it('leaves basement slabs and approach stairs out of level discovery', () => {
		const { levelManager } = setup();
		levelManager.discoverLevelsFromBuilding('house', {
			foundationId: 'house',
			walls: [],
			wallPaths: [],
			slabs: [
				{ localY: 0, role: 'deck' },
				{ localY: -3, role: 'basement-floor' },
				{ localY: 3 }
			] as never,
			stairs: [{ baseY: -1.2 }] as never,
			roofs: []
		});
		expect(levelManager.getLevelsForFoundation('house').map((l) => l.baseY)).toEqual([0, 3]);
	});
});

describe('FoundationMesh with a basement', () => {
	const stone = new THREE.MeshBasicMaterial();

	it('is an invisible deck-height proxy with a footing and four stone walls', () => {
		const f = makeFoundation({ basement: { storeys: 2, storeyHeight: 3 } });
		const mesh = new FoundationMesh(f, SPACING, stone);
		expect(mesh.isBasement).toBe(true);
		expect((mesh.object.material as THREE.Material).visible).toBe(false);
		expect(mesh.getSolidParts()).toHaveLength(5);
		const box = new THREE.Box3().setFromObject(mesh.object);
		expect(box.max.y).toBeCloseTo(20, 2);
		// The footing reaches FOOTING_DEPTH below the lowest floor (14).
		expect(box.min.y).toBeCloseTo(14 - FOOTING_DEPTH, 6);
		const proxy = new THREE.Box3().setFromBufferAttribute(
			mesh.object.geometry.getAttribute('position') as THREE.BufferAttribute
		);
		expect(proxy.max.y - proxy.min.y).toBeCloseTo(DECK_THICKNESS - 0.002, 6);
		mesh.dispose();
	});

	it('deepens only the footing to meet lower ground', () => {
		const f = makeFoundation({ basement: { storeys: 1, storeyHeight: 3 } });
		const mesh = new FoundationMesh(f, SPACING, stone);
		mesh.setSupportDepth(20, 10);
		const footing = new THREE.Box3().setFromObject(mesh.getSolidParts()[0]);
		expect(footing.min.y).toBeCloseTo(10, 6);
		expect(footing.max.y).toBeCloseTo(17, 6);
		mesh.dispose();
	});

	it('leaves a solid foundation a plain block', () => {
		const mesh = new FoundationMesh(makeFoundation(), SPACING, stone);
		expect(mesh.isBasement).toBe(false);
		expect(mesh.object.material).toBe(stone);
		mesh.dispose();
	});
});

describe('undoing a basement', () => {
	it('undoes and redoes adding one as a single step', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const undo = new BuildUndoManager(buildingManager);
		const b = { storeys: 1, storeyHeight: 3 };
		buildingManager.addBasement('house', b, 0.2);
		undo.record({
			kind: 'basement',
			undo: () => buildingManager.removeBasement('house').valid,
			redo: () => buildingManager.addBasement('house', b, 0.2).valid
		});
		expect(undo.undo()).toBe(true);
		expect(foundationManager.getFoundation('house')?.basement).toBeUndefined();
		expect(buildingManager.getSlabsForFoundation('house')).toEqual([]);
		expect(undo.redo()).toBe(true);
		expect(foundationManager.getFoundation('house')?.basement).toEqual(b);
		expect(buildingManager.getSlabsForFoundation('house')).toHaveLength(1);
		undo.dispose();
	});

	it('keeps the step when it can no longer be undone (someone built down there)', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const undo = new BuildUndoManager(buildingManager);
		const b = { storeys: 1, storeyHeight: 3 };
		buildingManager.addBasement('house', b, 0.2);
		undo.record({
			kind: 'basement',
			undo: () => buildingManager.removeBasement('house').valid,
			redo: () => buildingManager.addBasement('house', b, 0.2).valid
		});
		buildingManager.addStair(stair(-3, -1));
		expect(undo.undo()).toBe(false);
		expect(foundationManager.getFoundation('house')?.basement).toEqual(b);
		undo.dispose();
	});
});
