import { describe, expect, it } from 'vitest';
import { BuildingManager } from '../BuildingManager';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { WallManager } from '../WallManager';

const VERTEX_SPACING = 2;
const BUILDING_GRID_SIZE = 0.5;

function makeFoundation(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'foundation-a',
		minGridX: 0,
		maxGridX: 10, // 20m wide
		minGridZ: 0,
		maxGridZ: 6, // 12m deep
		topY: 17.4,
		bottomY: 12,
		...overrides
	};
}

function setup(buildingGridSize = BUILDING_GRID_SIZE) {
	const foundationManager = new FoundationManager(() => VERTEX_SPACING);
	const wallManager = new WallManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => buildingGridSize
	});
	const buildingManager = new BuildingManager({
		foundationManager,
		wallManager,
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => buildingGridSize
	});
	return { foundationManager, wallManager, buildingManager };
}

const DEFAULT_WALL_PARAMS = { height: 3, thickness: 0.15, minimumWallLength: 0.25 };

describe('BuildingManager.addWall — footprint validation', () => {
	it('accepts a wall with both endpoints inside the foundation', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
			...DEFAULT_WALL_PARAMS
		});

		expect(result.valid).toBe(true);
		expect(result.value?.foundationId).toBe('foundation-a');
	});

	it('rejects an endpoint outside the foundation footprint', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 999, gridZ: 0 },
			...DEFAULT_WALL_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a wall referencing a foundation that does not exist', () => {
		const { buildingManager } = setup();
		const result = buildingManager.addWall({
			start: { foundationId: 'missing', gridX: 0, gridZ: 0 },
			end: { foundationId: 'missing', gridX: 4, gridZ: 0 },
			...DEFAULT_WALL_PARAMS
		});
		expect(result.valid).toBe(false);
	});

	it('rejects a wall whose endpoints belong to different foundations', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation({ id: 'foundation-a' }));
		foundationManager.addFoundation(
			makeFoundation({ id: 'foundation-b', minGridX: 100, maxGridX: 110 })
		);

		const result = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-b', gridX: 2, gridZ: 0 },
			...DEFAULT_WALL_PARAMS
		});

		expect(result.valid).toBe(false);
		expect(result.reason).toMatch(/same foundation/i);
	});

	it('rejects a zero-length wall', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const result = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 4, gridZ: 4 },
			end: { foundationId: 'foundation-a', gridX: 4, gridZ: 4 },
			...DEFAULT_WALL_PARAMS
		});
		expect(result.valid).toBe(false);
	});
});

describe('BuildingManager.addOpening', () => {
	function addTestWall(buildingManager: BuildingManager) {
		const result = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 20, gridZ: 0 }, // 10m wall
			...DEFAULT_WALL_PARAMS
		});
		if (!result.value) throw new Error('setup wall failed to place');
		return result.value;
	}

	it('adds a valid window opening', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const wall = addTestWall(buildingManager);

		const result = buildingManager.addOpening({
			wallId: wall.id,
			type: 'window',
			minU: 2,
			maxU: 3,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		expect(result.valid).toBe(true);
		expect(buildingManager.getWall(wall.id)?.openings).toHaveLength(1);
	});

	it('rejects an opening extending beyond the wall edge', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const wall = addTestWall(buildingManager);

		const result = buildingManager.addOpening({
			wallId: wall.id,
			type: 'window',
			minU: 9.5,
			maxU: 10.5,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		expect(result.valid).toBe(false);
	});

	it('rejects an opening too close to the wall edge given the configured margin', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const wall = addTestWall(buildingManager);

		const result = buildingManager.addOpening({
			wallId: wall.id,
			type: 'window',
			minU: 0.05,
			maxU: 1,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		expect(result.valid).toBe(false);
	});

	it('rejects an opening overlapping an existing one', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const wall = addTestWall(buildingManager);

		buildingManager.addOpening({
			wallId: wall.id,
			type: 'window',
			minU: 2,
			maxU: 3,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});
		const result = buildingManager.addOpening({
			wallId: wall.id,
			type: 'window',
			minU: 2.5,
			maxU: 3.5,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		expect(result.valid).toBe(false);
		expect(buildingManager.getWall(wall.id)?.openings).toHaveLength(1);
	});

	it('adds a door with minY = 0', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());
		const wall = addTestWall(buildingManager);

		const result = buildingManager.addOpening({
			wallId: wall.id,
			type: 'door',
			minU: 4,
			maxU: 4.9,
			minY: 0,
			maxY: 2.1,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		expect(result.valid).toBe(true);
		expect(result.value?.minY).toBe(0);
	});
});

describe('serialize / load round trip', () => {
	it('reproduces walls and openings exactly after a load', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const wallResult = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
			...DEFAULT_WALL_PARAMS
		});
		const wall = wallResult.value!;
		buildingManager.addOpening({
			wallId: wall.id,
			type: 'window',
			minU: 2,
			maxU: 3,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		const serialized = buildingManager.serialize();

		const second = setup();
		second.foundationManager.addFoundation(makeFoundation());
		second.buildingManager.load(serialized);

		expect(second.buildingManager.serialize()).toEqual(serialized);
	});
});

describe('foundation height changes propagate to derived world Y without touching local definitions', () => {
	it('moves the wall/opening world position when foundation.topY changes, leaving grid coordinates untouched', () => {
		const { foundationManager, wallManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 17.4 }));

		const wallResult = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 6, gridZ: 0 },
			...DEFAULT_WALL_PARAMS
		});
		const wall = wallResult.value!;
		const originalDefinition = { ...wallManager.getWall(wall.id)! };

		const transformBefore = wallManager.getWallTransform(wall.id)!;
		expect(transformBefore.originWorldY).toBeCloseTo(17.4);

		// Simulate the foundation's world position changing (not implemented as a UI action yet,
		// but the architecture must support it — see the README).
		foundationManager.removeFoundation('foundation-a');
		foundationManager.addFoundation(makeFoundation({ topY: 42 }));
		wallManager.rebuildWall(wall.id);

		const transformAfter = wallManager.getWallTransform(wall.id)!;
		expect(transformAfter.originWorldY).toBeCloseTo(42);

		// The stored WallDefinition itself never changed.
		expect(wallManager.getWall(wall.id)).toEqual(originalDefinition);
	});
});

describe('cascade delete', () => {
	it('removes every wall belonging to a foundation when removeBuildingForFoundation is called', () => {
		const { foundationManager, wallManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const wallResult = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 6, gridZ: 0 },
			...DEFAULT_WALL_PARAMS
		});
		const wall = wallResult.value!;

		buildingManager.removeBuildingForFoundation('foundation-a');

		expect(wallManager.getWall(wall.id)).toBeUndefined();
		expect(buildingManager.getBuildingForFoundation('foundation-a').walls).toHaveLength(0);
	});
});
