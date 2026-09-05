import { describe, expect, it } from 'vitest';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { SlabManager } from '../SlabManager';
import { StairManager } from '../StairManager';
import { WorldSurfaceSampler } from '../WorldSurfaceSampler';

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
	const sampler = new WorldSurfaceSampler(
		{ sample: () => 0 } as never,
		foundationManager,
		slabManager,
		stairManager,
		() => MAX_STEP_HEIGHT
	);
	return { foundationManager, slabManager, stairManager, sampler };
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
});
