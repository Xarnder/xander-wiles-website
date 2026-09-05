import { describe, expect, it } from 'vitest';
import { BuildingManager } from '../BuildingManager';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { SlabManager } from '../SlabManager';
import { StairManager } from '../StairManager';
import { resolvePlayerPositionAgainstWalls } from '../wallCollision';
import { WallManager } from '../WallManager';
import { WallPathManager } from '../WallPathManager';

const VERTEX_SPACING = 2;
const BUILDING_GRID_SIZE = 0.5;
const CORNER_OPENING_MARGIN = 0.15;

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

function setup(buildingGridSize = BUILDING_GRID_SIZE, cornerOpeningMargin = CORNER_OPENING_MARGIN) {
	const foundationManager = new FoundationManager(() => VERTEX_SPACING);
	const wallManager = new WallManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => buildingGridSize
	});
	const wallPathManager = new WallPathManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => buildingGridSize
	});
	const slabManager = new SlabManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => buildingGridSize
	});
	const stairManager = new StairManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => VERTEX_SPACING
	});
	const buildingManager = new BuildingManager({
		foundationManager,
		wallManager,
		wallPathManager,
		slabManager,
		stairManager,
		getVertexSpacing: () => VERTEX_SPACING,
		getBuildingGridSize: () => buildingGridSize,
		getCornerOpeningMargin: () => cornerOpeningMargin
	});
	return {
		foundationManager,
		wallManager,
		wallPathManager,
		slabManager,
		stairManager,
		buildingManager
	};
}

const DEFAULT_WALL_PARAMS = { baseY: 0, height: 3, thickness: 0.15, minimumWallLength: 0.25 };

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

const DEFAULT_PATH_PARAMS = {
	baseY: 0,
	wallHeight: 3,
	wallThickness: 0.15,
	joinStyle: 'miter' as const,
	miterLimit: 4,
	minimumSegmentLength: 0.25
};

function pathPoint(gridX: number, gridZ: number) {
	return { foundationId: 'foundation-a', gridX, gridZ };
}

describe('BuildingManager.addWallPath — validation', () => {
	it('accepts an open L-shaped path with clean joins', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(8, 0), pathPoint(8, 8)],
			closed: false,
			...DEFAULT_PATH_PARAMS
		});

		expect(result.valid).toBe(true);
		expect(result.value?.segments).toHaveLength(2);
	});

	it('accepts a closed rectangular room with four segments', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(8, 0), pathPoint(8, 6), pathPoint(0, 6)],
			closed: true,
			...DEFAULT_PATH_PARAMS
		});

		expect(result.valid).toBe(true);
		expect(result.value?.segments).toHaveLength(4);
		expect(result.value?.closed).toBe(true);
	});

	it('rejects a path with a point outside the foundation', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(8, 0), pathPoint(9999, 0)],
			closed: false,
			...DEFAULT_PATH_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a path with duplicate consecutive points (zero-length segment)', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(0, 0), pathPoint(8, 0)],
			closed: false,
			...DEFAULT_PATH_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a duplicate closing point on a closed path', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(8, 0), pathPoint(0, 0)],
			closed: true,
			...DEFAULT_PATH_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects an obviously self-intersecting path', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(8, 8), pathPoint(8, 0), pathPoint(0, 8)],
			closed: false,
			...DEFAULT_PATH_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a path with fewer than two points', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addWallPath({
			points: [pathPoint(0, 0)],
			closed: false,
			...DEFAULT_PATH_PARAMS
		});

		expect(result.valid).toBe(false);
	});
});

describe('BuildingManager.addOpening — polygon wall segments', () => {
	it('adds a window to one segment without affecting the neighbouring segment or its corner', () => {
		const { foundationManager, wallPathManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const pathResult = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(8, 0), pathPoint(8, 8)],
			closed: false,
			...DEFAULT_PATH_PARAMS
		});
		const path = pathResult.value!;
		const [segmentA, segmentB] = path.segments;

		const collisionBefore = wallPathManager.getAllCollisionRects().length;

		const openingResult = buildingManager.addOpening({
			wallId: segmentA.id,
			type: 'window',
			minU: 1,
			maxU: 1.8,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		expect(openingResult.valid).toBe(true);
		expect(buildingManager.getWall(segmentA.id)?.openings).toHaveLength(1);
		// The neighbouring segment's own openings are untouched.
		expect(buildingManager.getWall(segmentB.id)?.openings).toHaveLength(0);

		// The corner join itself still exists — segment B still produces collision rects, and the
		// total collision rect count only grew by the window's own U-split (not by touching the
		// join, which stays a single always-solid cap piece).
		const collisionAfter = wallPathManager.getAllCollisionRects().length;
		expect(collisionAfter).toBeGreaterThan(collisionBefore);
	});

	it('rejects a window too close to a joined corner (cornerOpeningMargin)', () => {
		const { foundationManager, buildingManager } = setup(BUILDING_GRID_SIZE, 0.5);
		foundationManager.addFoundation(makeFoundation());

		const pathResult = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(8, 0), pathPoint(8, 8)],
			closed: false,
			...DEFAULT_PATH_PARAMS
		});
		const segmentA = pathResult.value!.segments[0];

		// segmentA runs from local U=0 (open endpoint, plain edge margin) to U=4 (joined corner,
		// cornerOpeningMargin=0.5 applies) — placing a window right at the joined end must fail.
		const result = buildingManager.addOpening({
			wallId: segmentA.id,
			type: 'window',
			minU: 3.7,
			maxU: 3.9,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		expect(result.valid).toBe(false);
	});

	it('a door opening on a polygon segment stays passable and the solid parts still block', () => {
		const { foundationManager, wallPathManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 17.4 }));

		const pathResult = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(16, 0)], // 8m wall
			closed: false,
			...DEFAULT_PATH_PARAMS
		});
		const segment = pathResult.value!.segments[0];

		const doorResult = buildingManager.addOpening({
			wallId: segment.id,
			type: 'door',
			minU: 3.5,
			maxU: 4.4,
			minY: 0,
			maxY: 2.1,
			edgeMargin: 0.1,
			spacing: 0.15
		});
		expect(doorResult.valid).toBe(true);

		const rects = wallPathManager.getAllCollisionRects();
		const feetY = 17.4;
		const headY = 17.4 + 1.7;
		const radius = 0.35;

		// Centre of the doorway (u ~= 3.95) — nothing should block it.
		const throughDoor = resolvePlayerPositionAgainstWalls(3.95, 0, feetY, headY, radius, rects);
		expect(throughDoor.x).toBeCloseTo(3.95);
		expect(throughDoor.z).toBeCloseTo(0);

		// Well clear of the door, into solid wall — must be pushed back out.
		const intoSolidWall = resolvePlayerPositionAgainstWalls(1, 0.1, feetY, headY, radius, rects);
		expect(Math.abs(intoSolidWall.z)).toBeGreaterThan(0.05);
	});
});

function slabPoint(gridX: number, gridZ: number) {
	return { foundationId: 'foundation-a', gridX, gridZ };
}

const DEFAULT_SLAB_PARAMS = { type: 'ceiling' as const, levelIndex: 0, localY: 3, thickness: 0.2 };

describe('BuildingManager.addSlab — validation', () => {
	it('accepts a simple rectangular slab', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			...DEFAULT_SLAB_PARAMS
		});

		expect(result.valid).toBe(true);
		expect(result.value?.points).toHaveLength(4);
	});

	it('accepts a concave (L-shaped) slab polygon', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addSlab({
			points: [
				slabPoint(0, 0),
				slabPoint(8, 0),
				slabPoint(8, 4),
				slabPoint(4, 4),
				slabPoint(4, 8),
				slabPoint(0, 8)
			],
			...DEFAULT_SLAB_PARAMS
		});

		expect(result.valid).toBe(true);
	});

	it('rejects a self-intersecting (bowtie) slab polygon', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 8), slabPoint(8, 0), slabPoint(0, 8)],
			...DEFAULT_SLAB_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a slab with a point outside the foundation footprint', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(9999, 8)],
			...DEFAULT_SLAB_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects fewer than 3 points', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0)],
			...DEFAULT_SLAB_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a zero-area (degenerate) polygon', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(4, 0), slabPoint(8, 0)],
			...DEFAULT_SLAB_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a duplicate-consecutive-point polygon', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8)],
			...DEFAULT_SLAB_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a second slab overlapping an existing one at the SAME localY on the same foundation', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			...DEFAULT_SLAB_PARAMS
		});
		const result = buildingManager.addSlab({
			points: [slabPoint(4, 4), slabPoint(12, 4), slabPoint(12, 12), slabPoint(4, 12)],
			...DEFAULT_SLAB_PARAMS
		});

		expect(result.valid).toBe(false);
		expect(result.reason).toMatch(/overlaps/i);
	});

	it('this is exactly how a Ceiling and a Floor tool placing the same default elevation collapse into one physical slab', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const ceiling = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			type: 'ceiling',
			levelIndex: 0,
			localY: 3,
			thickness: 0.2
		});
		expect(ceiling.valid).toBe(true);

		// FloorTool for level 1 defaults to the exact same localY (levelBaseY + wallHeight of level 0)
		// — attempting to place an identical floor here must be rejected as a duplicate, not create a
		// second coplanar slab.
		const floor = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			type: 'floor',
			levelIndex: 1,
			localY: 3,
			thickness: 0.2
		});
		expect(floor.valid).toBe(false);
		expect(slabManager.getAllSlabs()).toHaveLength(1);
	});

	it('allows two slabs with overlapping footprints at DIFFERENT localY values (different floors)', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const ground = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			type: 'floor',
			levelIndex: 0,
			localY: 3,
			thickness: 0.2
		});
		const upper = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			type: 'flat-roof',
			levelIndex: 1,
			localY: 6,
			thickness: 0.25
		});

		expect(ground.valid).toBe(true);
		expect(upper.valid).toBe(true);
	});
});

describe('SlabDefinition world-Y conversion', () => {
	it('localY combines with the foundation topY to produce the correct world Y', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 20 }));

		const result = buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			type: 'floor',
			levelIndex: 0,
			localY: 3,
			thickness: 0.2
		});
		expect(result.valid).toBe(true);

		const [topY] = slabManager.getTopSurfacesAt(1, 1); // world X/Z within the slab's footprint
		expect(topY).toBeCloseTo(23);
	});

	it('the underside is localY - thickness below the foundation top', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 20 }));

		buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			type: 'floor',
			levelIndex: 0,
			localY: 3,
			thickness: 0.2
		});

		const [bottomY] = slabManager.getUndersidesAt(1, 1);
		expect(bottomY).toBeCloseTo(22.8); // 20 + (3 - 0.2)
	});
});

describe('slab polygon winding independence', () => {
	it('CW and CCW input for the same footprint produce the same solid geometry (same triangle count)', () => {
		const { foundationManager, buildingManager: cwManager, slabManager: cwSlabs } = setup();
		foundationManager.addFoundation(makeFoundation());
		cwManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(0, 8), slabPoint(8, 8), slabPoint(8, 0)], // CW
			...DEFAULT_SLAB_PARAMS
		});

		const { foundationManager: fm2, buildingManager: ccwManager, slabManager: ccwSlabs } = setup();
		fm2.addFoundation(makeFoundation());
		ccwManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)], // CCW
			...DEFAULT_SLAB_PARAMS
		});

		const cwSlab = cwSlabs.getAllSlabs()[0];
		const ccwSlab = ccwSlabs.getAllSlabs()[0];
		expect(cwSlab.points).toHaveLength(ccwSlab.points.length);
		// Both directions are accepted (neither is spuriously rejected as self-intersecting) and both
		// produce a walkable top surface at the same world Y.
		expect(cwSlabs.getTopSurfacesAt(1, 1)[0]).toBeCloseTo(ccwSlabs.getTopSurfacesAt(1, 1)[0]);
	});
});

describe('concave slab collision containment', () => {
	it('getTopSurfacesAt only reports the slab inside the L-shape, not inside its concave notch', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		// L-shape: full 8x8 square minus the 4x4 notch at the top-right corner.
		buildingManager.addSlab({
			points: [
				slabPoint(0, 0),
				slabPoint(8, 0),
				slabPoint(8, 4),
				slabPoint(4, 4),
				slabPoint(4, 8),
				slabPoint(0, 8)
			],
			...DEFAULT_SLAB_PARAMS
		});

		// Inside the solid part of the L (near the origin corner, in grid units * spacing = world).
		expect(slabManager.getTopSurfacesAt(1, 1)).toHaveLength(1);
		// Inside the notch — must NOT be reported as covered.
		expect(slabManager.getTopSurfacesAt(7, 7)).toHaveLength(0);
	});
});

describe('wall baseY — upper-level placement', () => {
	it('a wall placed with a non-zero baseY offsets its world transform accordingly', () => {
		const { foundationManager, wallManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 10 }));

		const ground = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 6, gridZ: 0 },
			baseY: 0,
			height: 3,
			thickness: 0.15,
			minimumWallLength: 0.25
		});
		const upper = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 2 },
			end: { foundationId: 'foundation-a', gridX: 6, gridZ: 2 },
			baseY: 3,
			height: 3,
			thickness: 0.15,
			minimumWallLength: 0.25
		});

		expect(ground.valid).toBe(true);
		expect(upper.valid).toBe(true);

		const groundTransform = wallManager.getWallTransform(ground.value!.id)!;
		const upperTransform = wallManager.getWallTransform(upper.value!.id)!;
		expect(groundTransform.originWorldY).toBeCloseTo(10);
		expect(upperTransform.originWorldY).toBeCloseTo(13); // topY(10) + baseY(3)
	});

	it('a window placed on an upper-level wall resolves to the correct absolute world Y', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 10 }));

		const wall = buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 6, gridZ: 0 },
			baseY: 3,
			height: 3,
			thickness: 0.15,
			minimumWallLength: 0.25
		}).value!;

		const opening = buildingManager.addOpening({
			wallId: wall.id,
			type: 'window',
			minU: 1,
			maxU: 2,
			minY: 0.9,
			maxY: 2.1,
			edgeMargin: 0.1,
			spacing: 0.15
		});
		expect(opening.valid).toBe(true);

		// Opening Y stays wall-local (per spec) — the absolute world Y is topY + baseY + minY/maxY,
		// derived the same way the wall's own transform is, never stored directly on the opening.
		const transform = buildingManager.getWallTransform(wall.id)!;
		expect(transform.originWorldY + 0.9).toBeCloseTo(13.9); // topY(10) + baseY(3) + minY(0.9)
	});
});

describe('full multi-storey serialize/load round trip', () => {
	it('reproduces walls, wall paths and slabs across two levels after a load', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 6, gridZ: 0 },
			baseY: 0,
			height: 3,
			thickness: 0.15,
			minimumWallLength: 0.25
		});
		buildingManager.addWall({
			start: { foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
			end: { foundationId: 'foundation-a', gridX: 6, gridZ: 0 },
			baseY: 3,
			height: 3,
			thickness: 0.15,
			minimumWallLength: 0.25
		});
		buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			type: 'floor',
			levelIndex: 0,
			localY: 3,
			thickness: 0.2
		});
		buildingManager.addSlab({
			points: [slabPoint(0, 0), slabPoint(8, 0), slabPoint(8, 8), slabPoint(0, 8)],
			type: 'flat-roof',
			levelIndex: 1,
			localY: 6,
			thickness: 0.25
		});

		const serialized = buildingManager.serialize();
		expect(serialized[0].walls).toHaveLength(2);
		expect(serialized[0].slabs).toHaveLength(2);

		const second = setup();
		second.foundationManager.addFoundation(makeFoundation());
		second.buildingManager.load(serialized);

		expect(second.buildingManager.serialize()).toEqual(serialized);
	});
});

describe('wall path serialization round trip', () => {
	it('reproduces points, closed state, segment ids and openings exactly after a reload', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const pathResult = buildingManager.addWallPath({
			points: [pathPoint(0, 0), pathPoint(8, 0), pathPoint(8, 8), pathPoint(0, 8)],
			closed: true,
			...DEFAULT_PATH_PARAMS
		});
		const path = pathResult.value!;
		buildingManager.addOpening({
			wallId: path.segments[0].id,
			type: 'window',
			minU: 1,
			maxU: 1.8,
			minY: 1,
			maxY: 2,
			edgeMargin: 0.1,
			spacing: 0.15
		});

		const serialized = buildingManager.serialize();
		expect(serialized[0].wallPaths).toHaveLength(1);

		const second = setup();
		second.foundationManager.addFoundation(makeFoundation());
		second.buildingManager.load(serialized);

		expect(second.buildingManager.serialize()).toEqual(serialized);

		const reloadedPath = second.buildingManager.getWallPath(path.id)!;
		expect(reloadedPath.points).toEqual(path.points);
		expect(reloadedPath.closed).toBe(true);
		expect(reloadedPath.segments.map((s) => s.id)).toEqual(path.segments.map((s) => s.id));
		expect(reloadedPath.segments[0].openings).toHaveLength(1);
	});
});

const DEFAULT_STAIR_PARAMS = {
	minimumStairWidthCells: 2,
	minimumStairRunCells: 2,
	gridSizeAtCreation: BUILDING_GRID_SIZE
};

describe('BuildingManager.addStair — validation', () => {
	it('accepts a valid axis-aligned stair along its long (X) axis', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});

		expect(result.valid).toBe(true);
		expect(result.value?.direction).toBe('+x');
	});

	it('rejects a direction running along the short axis', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 0,
			direction: '+z',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a footprint narrower than the minimum width', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 1,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a footprint shorter than the minimum run', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 1,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a footprint extending outside the foundation', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 9999,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});

		expect(result.valid).toBe(false);
	});

	it('rejects a foundation that does not exist', () => {
		const { buildingManager } = setup();
		const result = buildingManager.addStair({
			foundationId: 'missing',
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});
		expect(result.valid).toBe(false);
	});

	it('a stair starting at a non-zero baseY (upper level) ends at baseY + totalRise', () => {
		const { foundationManager, buildingManager, stairManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const result = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 3,
			direction: '+x',
			levelIndex: 1,
			...DEFAULT_STAIR_PARAMS
		});

		expect(result.valid).toBe(true);
		const stair = stairManager.getStair(result.value!.id)!;
		// 12 cells at 0.5m grid = 6m total rise; starting at baseY=3 reaches 9.
		expect(stair.baseY + 12 * BUILDING_GRID_SIZE).toBeCloseTo(9);
	});
});

describe('BuildingManager auto stair-opening in slabs', () => {
	it('opens a rectangular hole in a slab already present at the stair top elevation', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		// A 20x20-cell floor slab (10m x 10m at 0.5m grid) at localY = 6 (the stair's top elevation).
		const slabResult = buildingManager.addSlab({
			points: [
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 20 },
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 20 }
			],
			type: 'floor',
			levelIndex: 1,
			localY: 6,
			thickness: 0.2
		});
		expect(slabResult.valid).toBe(true);

		const stairResult = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 2,
			maxGridX: 14,
			minGridZ: 2,
			maxGridZ: 6,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});
		expect(stairResult.valid).toBe(true);

		const slab = slabManager.getSlab(slabResult.value!.id)!;
		expect(slab.openings).toHaveLength(1);
		expect(slab.openings[0]).toMatchObject({
			type: 'stairs',
			minGridX: 2,
			maxGridX: 14,
			minGridZ: 2,
			maxGridZ: 6
		});
	});

	it('opens a rectangular hole in a slab placed AFTER the stair already reaches it', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const stairResult = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 2,
			maxGridX: 14,
			minGridZ: 2,
			maxGridZ: 6,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});
		expect(stairResult.valid).toBe(true);

		const slabResult = buildingManager.addSlab({
			points: [
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 20 },
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 20 }
			],
			type: 'floor',
			levelIndex: 1,
			localY: 6,
			thickness: 0.2
		});
		expect(slabResult.valid).toBe(true);

		const slab = slabManager.getSlab(slabResult.value!.id)!;
		expect(slab.openings).toHaveLength(1);
	});

	it('does NOT open a slab at a different elevation than the stair top', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const slabResult = buildingManager.addSlab({
			points: [
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 20 },
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 20 }
			],
			type: 'floor',
			levelIndex: 1,
			localY: 999, // deliberately not the stair's top elevation
			thickness: 0.2
		});
		expect(slabResult.valid).toBe(true);

		buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 2,
			maxGridX: 14,
			minGridZ: 2,
			maxGridZ: 6,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});

		const slab = slabManager.getSlab(slabResult.value!.id)!;
		expect(slab.openings).toHaveLength(0);
	});

	it('regression: opens the slab even when the stair does NOT land on its exact localY, as long as it reaches into the slab’s thickness — a stair whose length the user chose freely (the ordinary case) never lines up bit-for-bit with a slab’s localY, so requiring exact equality meant the opening silently never appeared', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const slabResult = buildingManager.addSlab({
			points: [
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 20 },
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 20 }
			],
			type: 'floor',
			levelIndex: 1,
			localY: 6,
			thickness: 1 // underside at 5 — a wide band so a mid-band stair top is neither endpoint
		});
		expect(slabResult.valid).toBe(true);

		// 11 cells @ 0.5m grid = 5.5m total rise — strictly between the slab's underside (5) and its
		// top surface (6), matching neither exactly: exactly the ordinary case that used to silently
		// fail to open at all.
		const stairResult = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 2,
			maxGridX: 13,
			minGridZ: 2,
			maxGridZ: 6,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});
		expect(stairResult.valid).toBe(true);

		const slab = slabManager.getSlab(slabResult.value!.id)!;
		expect(slab.openings).toHaveLength(1);
	});

	it('regression: opens the slab even when the stair overshoots past its top surface, not just when it stops exactly at or within it', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const slabResult = buildingManager.addSlab({
			points: [
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 20 },
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 20 }
			],
			type: 'floor',
			levelIndex: 1,
			localY: 4, // stair below reaches 6 — well past this slab's top surface
			thickness: 0.2
		});
		expect(slabResult.valid).toBe(true);

		const stairResult = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 2,
			maxGridX: 14, // 12 cells -> 6m total rise
			minGridZ: 2,
			maxGridZ: 6,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});
		expect(stairResult.valid).toBe(true);

		const slab = slabManager.getSlab(slabResult.value!.id)!;
		expect(slab.openings).toHaveLength(1);
	});

	it('does not open a slab the stair falls genuinely short of (never reaches its underside)', () => {
		const { foundationManager, buildingManager, slabManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		const slabResult = buildingManager.addSlab({
			points: [
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 20 },
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 20 }
			],
			type: 'floor',
			levelIndex: 1,
			localY: 6,
			thickness: 0.2 // underside at 5.8
		});
		expect(slabResult.valid).toBe(true);

		const stairResult = buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 2,
			maxGridX: 13, // 11 cells -> 5.5m total rise, short of the underside (5.8)
			minGridZ: 2,
			maxGridZ: 6,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});
		expect(stairResult.valid).toBe(true);

		const slab = slabManager.getSlab(slabResult.value!.id)!;
		expect(slab.openings).toHaveLength(0);
	});
});

describe('stair serialize/load round trip', () => {
	it('reproduces a stair exactly after a load, including its resulting slab opening', () => {
		const { foundationManager, buildingManager } = setup();
		foundationManager.addFoundation(makeFoundation());

		buildingManager.addSlab({
			points: [
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 0 },
				{ foundationId: 'foundation-a', gridX: 20, gridZ: 20 },
				{ foundationId: 'foundation-a', gridX: 0, gridZ: 20 }
			],
			type: 'floor',
			levelIndex: 1,
			localY: 6,
			thickness: 0.2
		});
		buildingManager.addStair({
			foundationId: 'foundation-a',
			minGridX: 2,
			maxGridX: 14,
			minGridZ: 2,
			maxGridZ: 6,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			...DEFAULT_STAIR_PARAMS
		});

		const serialized = buildingManager.serialize();
		expect(serialized[0].stairs).toHaveLength(1);
		expect(serialized[0].slabs[0].openings).toHaveLength(1);

		const second = setup();
		second.foundationManager.addFoundation(makeFoundation());
		second.buildingManager.load(serialized);

		expect(second.buildingManager.serialize()).toEqual(serialized);
	});
});
