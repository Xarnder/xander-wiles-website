import { describe, expect, it } from 'vitest';
import { BuildingManager } from '../../building/BuildingManager';
import { FoundationManager } from '../../building/FoundationManager';
import type { FoundationDefinition } from '../../building/FoundationTypes';
import { FloorDetailManager } from '../../building/FloorDetailManager';
import { RoofManager } from '../../building/RoofManager';
import { SlabManager } from '../../building/SlabManager';
import { StairManager } from '../../building/StairManager';
import { WallManager } from '../../building/WallManager';
import { WallPathManager } from '../../building/WallPathManager';
import { proceduralTreeId } from '../../vegetation/TreeManager';

const VERTEX_SPACING = 2;
const BUILDING_GRID_SIZE = 0.5;
const WALL_PARAMS = { baseY: 0, height: 3, thickness: 0.15, minimumWallLength: 0.25 };

function setup() {
	const foundationManager = new FoundationManager(() => VERTEX_SPACING);
	const shared = {
		getFoundation: (id: string) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE
	};
	const wallManager = new WallManager(shared);
	const wallPathManager = new WallPathManager(shared);
	const slabManager = new SlabManager(shared);
	const stairManager = new StairManager({
		getFoundation: shared.getFoundation,
		getVertexSpacing: shared.getVertexSpacing
	});
	const roofManager = new RoofManager(shared);
	const floorDetailManager = new FloorDetailManager(shared);
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

	const foundation: FoundationDefinition = {
		id: 'foundation-a',
		minGridX: 0,
		maxGridX: 10,
		minGridZ: 0,
		maxGridZ: 6,
		topY: 17.4,
		bottomY: 12
	};
	foundationManager.addFoundation(foundation);

	return { foundationManager, buildingManager, foundation };
}

/**
 * These counters are what let autosave answer "has anything changed?" in a few integer comparisons
 * instead of re-serializing the world twice a second. A mutation that forgets to bump one is
 * invisible in every other test — the world simply, silently, stops autosaving that kind of edit —
 * so each mutation path is asserted directly.
 */
describe('structural revision counters', () => {
	it('bumps when a foundation is added, painted or removed', () => {
		const { foundationManager } = setup();
		const afterAdd = foundationManager.getRevision();
		expect(afterAdd).toBeGreaterThan(0);

		foundationManager.setMaterial('foundation-a', { type: 'color', color: '#123456' });
		const afterPaint = foundationManager.getRevision();
		expect(afterPaint).toBeGreaterThan(afterAdd);

		foundationManager.removeFoundation('foundation-a');
		expect(foundationManager.getRevision()).toBeGreaterThan(afterPaint);
	});

	it('bumps when a wall is added', () => {
		const { buildingManager } = setup();
		const before = buildingManager.getRevision();
		buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 8, gridZ: 0 },
			...WALL_PARAMS
		});
		expect(buildingManager.getRevision()).toBeGreaterThan(before);
	});

	it('bumps for painting, which changes no geometry and would otherwise look like "no change"', () => {
		const { buildingManager } = setup();
		const wall = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 8, gridZ: 0 },
			...WALL_PARAMS
		});
		expect(wall.valid).toBe(true);
		const wallId = wall.value?.id;
		expect(wallId).toBeDefined();

		const before = buildingManager.getRevision();
		buildingManager.paintWall(wallId!, { type: 'color', color: '#abcdef' });
		expect(buildingManager.getRevision()).toBeGreaterThan(before);
	});

	it('bumps when a wall is removed', () => {
		const { buildingManager } = setup();
		const wall = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 8, gridZ: 0 },
			...WALL_PARAMS
		});
		const wallId = wall.value?.id;
		expect(wallId).toBeDefined();

		const before = buildingManager.getRevision();
		buildingManager.removeWall(wallId!);
		expect(buildingManager.getRevision()).toBeGreaterThan(before);
	});

	it('bumps when loading a world, so a freshly loaded world is not mistaken for an unchanged one', () => {
		const { buildingManager } = setup();
		const before = buildingManager.getRevision();
		buildingManager.load([]);
		expect(buildingManager.getRevision()).toBeGreaterThan(before);
	});

	it('only ever increases', () => {
		const { buildingManager } = setup();
		let previous = buildingManager.getRevision();
		for (let i = 0; i < 5; i++) {
			buildingManager.load([]);
			const next = buildingManager.getRevision();
			expect(next).toBeGreaterThan(previous);
			previous = next;
		}
	});
});

describe('proceduralTreeId', () => {
	it('identifies a tree by its deterministic cell, and nothing else', () => {
		expect(proceduralTreeId(12, -7)).toBe('12:-7');
		expect(proceduralTreeId(0, 0)).toBe('0:0');
	});

	it('is stable across calls, so a saved id still names the same tree later', () => {
		expect(proceduralTreeId(3, 9)).toBe(proceduralTreeId(3, 9));
	});

	it('distinguishes cells that differ only by sign', () => {
		expect(proceduralTreeId(3, -9)).not.toBe(proceduralTreeId(-3, 9));
	});
});
