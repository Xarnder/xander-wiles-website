import { describe, expect, it } from 'vitest';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { RoofManager } from '../RoofManager';
import { SlabManager } from '../SlabManager';
import { StairManager } from '../StairManager';
import { WorldSurfaceSampler } from '../WorldSurfaceSampler';
import { basementSlabPlans } from '../basementMath';

const SPACING = 2;
const BUILDING_GRID_SIZE = 0.5;
const MAX_STEP_HEIGHT = 0.3;

function makeFoundation(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'foundation-a',
		minGridX: 0,
		maxGridX: 10,
		minGridZ: 0,
		maxGridZ: 10,
		topY: 0,
		bottomY: -2,
		...overrides
	};
}

function setup() {
	const foundationManager = new FoundationManager(() => SPACING);
	const slabManager = new SlabManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE
	});
	const stairManager = new StairManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING
	});
	const roofManager = new RoofManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE
	});
	const sampler = new WorldSurfaceSampler(
		{ sample: () => 0 } as never,
		foundationManager,
		slabManager,
		stairManager,
		roofManager,
		() => MAX_STEP_HEIGHT
	);
	return { foundationManager, slabManager, stairManager, roofManager, sampler };
}

function gp(gridX: number, gridZ: number) {
	return { gridX, gridZ };
}

describe('WorldSurfaceSampler.getSupportingSurfaceY — multi-level "no teleport" behavior', () => {
	it('does not snap the player up onto a first-floor slab while standing on the ground below it', () => {
		const { foundationManager, slabManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));

		// A floor slab at localY=3 (world Y=3), well above a player standing at ground level.
		slabManager.addSlab({
			id: 'floor-1',
			foundationId: 'foundation-a',
			type: 'floor',
			levelIndex: 1,
			localY: 3,
			thickness: 0.2,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});

		// Player's current feet Y is 0 (standing on the ground floor) — the slab at world Y=3 must
		// be excluded since it's above referenceY.
		const surfaceY = sampler.getSupportingSurfaceY(1, 1, 0);
		expect(surfaceY).toBe(0);
	});

	it('DOES return the slab top once the player is actually at/above it (e.g. having climbed a ladder)', () => {
		const { foundationManager, slabManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		slabManager.addSlab({
			id: 'floor-1',
			foundationId: 'foundation-a',
			type: 'floor',
			levelIndex: 1,
			localY: 3,
			thickness: 0.2,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});

		const surfaceY = sampler.getSupportingSurfaceY(1, 1, 3);
		expect(surfaceY).toBeCloseTo(3);
	});

	it('spawn-style referenceY = Infinity lands on the highest available surface', () => {
		const { foundationManager, slabManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		slabManager.addSlab({
			id: 'floor-1',
			foundationId: 'foundation-a',
			type: 'floor',
			levelIndex: 1,
			localY: 3,
			thickness: 0.2,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});
		slabManager.addSlab({
			id: 'roof-1',
			foundationId: 'foundation-a',
			type: 'flat-roof',
			levelIndex: 2,
			localY: 6,
			thickness: 0.25,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});

		expect(sampler.getSupportingSurfaceY(1, 1, Infinity)).toBeCloseTo(6);
	});

	it('terrain is always considered regardless of referenceY, as the unconditional fallback', () => {
		const { sampler } = setup();
		// No foundation, no slabs anywhere — must still return the terrain height even for a very
		// low referenceY.
		expect(sampler.getSupportingSurfaceY(500, 500, -100)).toBe(0);
	});
});

describe('WorldSurfaceSampler.getCeilingBlockY — blocking upward movement into a slab underside', () => {
	it('reports the slab underside crossed while rising from below it', () => {
		const { foundationManager, slabManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		slabManager.addSlab({
			id: 'floor-1',
			foundationId: 'foundation-a',
			type: 'floor',
			levelIndex: 1,
			localY: 3,
			thickness: 0.2,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});

		// Underside is at localY - thickness = 3 - 0.2 = 2.8 (world, since topY = 0).
		const blockY = sampler.getCeilingBlockY(1, 1, 1, 4);
		expect(blockY).toBeCloseTo(2.8);
	});

	it('returns null when the move stays below the underside', () => {
		const { foundationManager, slabManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		slabManager.addSlab({
			id: 'floor-1',
			foundationId: 'foundation-a',
			type: 'floor',
			levelIndex: 1,
			localY: 3,
			thickness: 0.2,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});

		expect(sampler.getCeilingBlockY(1, 1, 0, 2)).toBeNull();
	});

	it('returns null when starting above the underside already (moving within the room above)', () => {
		const { foundationManager, slabManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		slabManager.addSlab({
			id: 'floor-1',
			foundationId: 'foundation-a',
			type: 'floor',
			levelIndex: 1,
			localY: 3,
			thickness: 0.2,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});

		expect(sampler.getCeilingBlockY(1, 1, 3.5, 4)).toBeNull();
	});

	it('returns the lowest underside when several stacked slabs are crossed', () => {
		const { foundationManager, slabManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		slabManager.addSlab({
			id: 'floor-1',
			foundationId: 'foundation-a',
			type: 'floor',
			levelIndex: 1,
			localY: 3,
			thickness: 0.2,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});
		slabManager.addSlab({
			id: 'roof-1',
			foundationId: 'foundation-a',
			type: 'flat-roof',
			levelIndex: 2,
			localY: 6,
			thickness: 0.25,
			points: [gp(0, 0), gp(16, 0), gp(16, 16), gp(0, 16)],
			openings: []
		});

		const blockY = sampler.getCeilingBlockY(1, 1, 0, 10);
		expect(blockY).toBeCloseTo(2.8); // the lower floor's underside, not the roof's
	});
});

describe('WorldSurfaceSampler.getSupportingSurfaceY — stair step-up tolerance', () => {
	it('auto-climbs a step within maxStepHeight without needing referenceY above it (walking, not jumping)', () => {
		const { foundationManager, stairManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		stairManager.addStair({
			id: 'stair-1',
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			gridSizeAtCreation: 0.25
		});

		// Standing at Y=0 (referenceY), walking onto the first tread (top Y = 0.25) — well within
		// MAX_STEP_HEIGHT (0.3) even though it's well above SUPPORT_EPSILON (0.05), which alone would
		// exclude it exactly like a slab/foundation top would be excluded.
		const surfaceY = sampler.getSupportingSurfaceY(0.1, 0.5, 0);
		expect(surfaceY).toBeCloseTo(0.25);
	});

	it('does NOT climb a step further than maxStepHeight above the current position in one query', () => {
		const { foundationManager, stairManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		stairManager.addStair({
			id: 'stair-1',
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			gridSizeAtCreation: 0.25
		});

		// The topmost tread (top Y = 3.0) is far above a player standing at Y=0 — must not be
		// returned; the terrain (0) should come back instead.
		const surfaceY = sampler.getSupportingSurfaceY(2.9, 0.5, 0);
		expect(surfaceY).toBe(0);
	});

	it('descending returns the very next step down, not skipping several at once', () => {
		const { foundationManager, stairManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 0 }));
		stairManager.addStair({
			id: 'stair-1',
			foundationId: 'foundation-a',
			minGridX: 0,
			maxGridX: 12,
			minGridZ: 0,
			maxGridZ: 4,
			baseY: 0,
			direction: '+x',
			levelIndex: 0,
			gridSizeAtCreation: 0.25
		});

		// Standing at the top of the stair (Y=3.0) and querying a point back down near the bottom —
		// any surface below the player is fair game regardless of step-height tolerance, since the
		// exclusion only ever applies to candidates ABOVE referenceY.
		const surfaceY = sampler.getSupportingSurfaceY(0.1, 0.5, 3.0);
		expect(surfaceY).toBeCloseTo(0.25);
	});

	it('supports an approach stair whose footprint sits outside the foundation', () => {
		const { foundationManager, stairManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 2, bottomY: -1 }));
		stairManager.addStair({
			id: 'approach-1',
			foundationId: 'foundation-a',
			minGridX: -8,
			maxGridX: 0,
			minGridZ: 4,
			maxGridZ: 8,
			baseY: -2,
			direction: '+x',
			levelIndex: 0,
			gridSizeAtCreation: 0.25
		});

		// World Y = foundation.topY + (baseY + first step) = 2 + (-1.75) = 0.25, on the ground
		// beside the pad (local X -2m → world X -2).
		const surfaceY = sampler.getSupportingSurfaceY(-1.9, 1.5, 0);
		expect(surfaceY).toBeCloseTo(0.25);
	});
});

describe('WorldSurfaceSampler — basements', () => {
	// A 20 × 20 m foundation, top at Y = 0, two 3 m storeys below: lowest floor at −6, a floor at −3.
	// The natural ground under it is 0.5 m below the top (it's never above the top).
	const GROUND = -0.5;

	function basementSetup(withFloors = true) {
		const foundationManager = new FoundationManager(() => SPACING);
		const slabManager = new SlabManager({
			getFoundation: (id) => foundationManager.getFoundation(id),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => BUILDING_GRID_SIZE
		});
		const stairManager = new StairManager({
			getFoundation: (id) => foundationManager.getFoundation(id),
			getVertexSpacing: () => SPACING
		});
		const roofManager = new RoofManager({
			getFoundation: (id) => foundationManager.getFoundation(id),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => BUILDING_GRID_SIZE
		});
		const sampler = new WorldSurfaceSampler(
			{ sample: () => GROUND } as never,
			foundationManager,
			slabManager,
			stairManager,
			roofManager,
			() => MAX_STEP_HEIGHT
		);
		const foundation = makeFoundation({ basement: { storeys: 2, storeyHeight: 3 } });
		foundationManager.addFoundation(foundation);
		if (withFloors)
			basementSlabPlans(foundation, SPACING, BUILDING_GRID_SIZE, 0.2).forEach((plan, i) =>
				slabManager.addSlab({
					id: `basement-slab-${i}`,
					foundationId: foundation.id,
					...plan,
					openings:
						plan.role === 'deck'
							? // A stair hole in the deck at x 8 … 10, z 8 … 12.
								[
									{
										id: 'hole',
										type: 'stairs',
										minGridX: 16,
										maxGridX: 20,
										minGridZ: 16,
										maxGridZ: 24
									}
								]
							: []
				})
			);
		return { foundationManager, sampler };
	}

	it('stands a player on the deck from above, exactly like a solid foundation top', () => {
		const { sampler } = basementSetup();
		expect(sampler.getSupportingSurfaceY(5, 5, 0)).toBe(0);
		expect(sampler.getSupportingSurfaceY(5, 5, Infinity)).toBe(0);
	});

	it('stands a player in the basement on its floors, never on the ground or the deck', () => {
		const { sampler } = basementSetup();
		// On the floor between storeys (level −1).
		expect(sampler.getSupportingSurfaceY(5, 5, -3)).toBe(-3);
		// On the lowest floor (level −2).
		expect(sampler.getSupportingSurfaceY(5, 5, -6)).toBe(-6);
	});

	it('drops a player through the stair hole in the deck', () => {
		const { sampler } = basementSetup();
		expect(sampler.getSupportingSurfaceY(9, 10, 0)).toBe(-3);
	});

	it('falls to the lowest floor when a basement floor is removed', () => {
		const { sampler } = basementSetup(false);
		expect(sampler.getSupportingSurfaceY(5, 5, -3)).toBe(-6);
	});

	it('keeps the stone rim as solid foundation top, so walking up from lower ground steps onto it', () => {
		const { sampler } = basementSetup();
		// On the ring of walls (0.3 m thick) from below: snapped up, as onto any foundation.
		expect(sampler.getSupportingSurfaceY(0.1, 5, GROUND)).toBe(0);
		// Then on into the interior at deck height.
		expect(sampler.getSupportingSurfaceY(1, 5, 0)).toBe(0);
	});

	it('gives the camera the basement floor as its ground inside, terrain elsewhere', () => {
		const { sampler } = basementSetup();
		expect(sampler.getGroundY(5, 5)).toBe(-6);
		expect(sampler.getGroundY(0.1, 5)).toBe(GROUND);
		expect(sampler.getGroundY(-3, 5)).toBe(GROUND);
	});

	it('walls a player into the basement, but never one on the deck or outside', () => {
		const { foundationManager } = basementSetup();
		expect(foundationManager.getBasementContainmentRects(5, 5, -6)).toHaveLength(4);
		expect(foundationManager.getBasementContainmentRects(5, 5, -3)).toHaveLength(4);
		expect(foundationManager.getBasementContainmentRects(5, 5, 0)).toEqual([]);
		expect(foundationManager.getBasementContainmentRects(5, 5, -0.27)).toEqual([]);
		expect(foundationManager.getBasementContainmentRects(-1, 5, -6)).toEqual([]);
		expect(foundationManager.getBasementContainmentRects(0.1, 5, -6)).toEqual([]);
	});

	it('leaves a solid foundation exactly as before', () => {
		const { foundationManager, sampler } = setup();
		foundationManager.addFoundation(makeFoundation({ topY: 2 }));
		expect(sampler.getSupportingSurfaceY(5, 5, -10)).toBe(2);
		expect(sampler.getGroundY(5, 5)).toBe(0);
		expect(foundationManager.getBasementContainmentRects(5, 5, -10)).toEqual([]);
		expect(foundationManager.getBasementFloorAt(5, 5)).toBeNull();
	});

	it('reports basement footprints as terrain holes, before the terrain edit, only when they change', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		const events: string[] = [];
		foundationManager.setTerrainHolesHandler((rects) => events.push(`holes:${rects.length}`));
		foundationManager.setTerrainEditHandler(() => events.push('edit'));
		foundationManager.addFoundation(makeFoundation({ id: 'solid' }));
		foundationManager.addFoundation(
			makeFoundation({
				id: 'cellar',
				minGridX: 20,
				maxGridX: 25,
				basement: { storeys: 1, storeyHeight: 3 }
			})
		);
		foundationManager.removeFoundation('cellar');
		expect(events).toEqual(['holes:0', 'edit', 'holes:1', 'edit', 'holes:0', 'edit']);
		expect(foundationManager.getBasementHoleRects()).toEqual([]);
	});
});
