import { describe, expect, it } from 'vitest';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { StairManager } from '../StairManager';
import type { StairDefinition } from '../StairTypes';
import { resolvePlayerPositionAgainstWalls } from '../wallCollision';

/** Same value ThreeScene.ts uses for the player's horizontal collision radius. */
const PLAYER_COLLISION_RADIUS = 0.35;

const SPACING = 2;
const BUILDING_GRID_SIZE = 0.25;

function makeFoundation(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'foundation-a',
		minGridX: 0,
		maxGridX: 20,
		minGridZ: 0,
		maxGridZ: 20,
		topY: 0,
		bottomY: -2,
		...overrides
	};
}

function makeStair(overrides: Partial<StairDefinition> = {}): StairDefinition {
	return {
		id: 'stair-1',
		foundationId: 'foundation-a',
		minGridX: 0,
		maxGridX: 12,
		minGridZ: 0,
		maxGridZ: 4,
		baseY: 0,
		direction: '+x',
		levelIndex: 0,
		gridSizeAtCreation: BUILDING_GRID_SIZE,
		...overrides
	};
}

function setup() {
	const foundationManager = new FoundationManager(() => SPACING);
	foundationManager.addFoundation(makeFoundation());
	const stairManager = new StairManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING
	});
	return { foundationManager, stairManager };
}

describe('StairManager.getStepSurfacesAt', () => {
	it('reports the correct tread top Y for a point within a lower step', () => {
		const { stairManager } = setup();
		stairManager.addStair(makeStair());

		// Foundation origin is (0,0), topY=0 — stair local space matches world directly. First tread
		// (i=0) spans local X [0, 0.25], local Z [0, 1] (4 cells * 0.25 = 1m width), top Y = 0.25.
		const tops = stairManager.getStepSurfacesAt(0.1, 0.5);
		expect(tops).toEqual([0.25]);
	});

	it('reports the correct tread top Y for a point within the topmost step', () => {
		const { stairManager } = setup();
		stairManager.addStair(makeStair());

		// 12 steps at 0.25m grid — topmost step spans local X [2.75, 3.0], top Y = 3.0.
		const tops = stairManager.getStepSurfacesAt(2.9, 0.5);
		expect(tops).toEqual([3.0]);
	});

	it('reports nothing outside the stair footprint', () => {
		const { stairManager } = setup();
		stairManager.addStair(makeStair());
		expect(stairManager.getStepSurfacesAt(100, 100)).toEqual([]);
	});

	it('reflects a non-zero baseY (an upper-level stair)', () => {
		const { stairManager } = setup();
		stairManager.addStair(makeStair({ baseY: 3, levelIndex: 1 }));
		const tops = stairManager.getStepSurfacesAt(0.1, 0.5);
		expect(tops).toEqual([3.25]);
	});

	it('a reversed direction (-x) on the same footprint puts the first tread at the opposite end', () => {
		const { stairManager } = setup();
		stairManager.addStair(makeStair({ direction: '-x' }));
		// Bottom is now at maxGridX (local X = 3.0m) — the first tread (lowest rise) is near X=3.0,
		// not X=0 as it was for '+x'.
		const topsNearMax = stairManager.getStepSurfacesAt(2.9, 0.5);
		const topsNearMin = stairManager.getStepSurfacesAt(0.1, 0.5);
		expect(topsNearMax).toEqual([0.25]);
		expect(topsNearMin).toEqual([3.0]);
	});
});

describe('StairManager.getAllCollisionRects — side collision', () => {
	it('produces two side rects spanning the full run length', () => {
		const { stairManager } = setup();
		stairManager.addStair(makeStair());
		const rects = stairManager.getAllCollisionRects();
		expect(rects).toHaveLength(2);
		for (const rect of rects) {
			expect(rect.halfLength).toBeCloseTo(1.5); // 12 cells * 0.25m / 2
			expect(rect.dirX).toBe(1);
			expect(rect.dirZ).toBe(0);
		}
	});

	it('removing the stair removes its collision rects', () => {
		const { stairManager } = setup();
		stairManager.addStair(makeStair());
		stairManager.removeStair('stair-1');
		expect(stairManager.getAllCollisionRects()).toEqual([]);
	});

	it('regression: the tread has a genuine, non-empty walkable band a player-radius circle can stand in without being pushed', () => {
		// Bug: the side strips used to be centered ON the footprint boundary (half in, half out),
		// which combined with the player's own collision radius effectively narrowed every stair by
		// 2 * (halfThickness + radius) — for this 1m-wide stair (4 cells * 0.25m), that shrank the
		// walkable band to NEGATIVE width (fully closed off), so the player could only progress by
		// hugging one edge, where only one side's push applied (reported as "can't go up the
		// stairs... only go up the side"). The fix moves both strips fully outside the footprint, so
		// points at least one player-radius in from either edge (here, the centre) must now be
		// completely unaffected by either strip.
		const { stairManager } = setup();
		stairManager.addStair(makeStair()); // width = 4 cells * 0.25m = 1.0m, local Z in [0, 1]
		const rects = stairManager.getAllCollisionRects();

		for (const z of [0.4, 0.5, 0.6]) {
			const resolved = resolvePlayerPositionAgainstWalls(
				1,
				z,
				0.1, // feetY — well within the side rects' generous vertical margin
				1.8, // headY
				PLAYER_COLLISION_RADIUS,
				rects
			);
			expect(resolved.x).toBeCloseTo(1);
			expect(resolved.z).toBeCloseTo(z);
		}
	});
});

describe('StairManager serialize/load', () => {
	it('round-trips a stair definition exactly', () => {
		const { stairManager } = setup();
		const stair = makeStair();
		stairManager.addStair(stair);

		const serialized = stairManager.serialize();
		expect(serialized).toEqual([stair]);

		const { stairManager: other } = setup();
		other.load(serialized);
		expect(other.getAllStairs()).toEqual([stair]);
	});
});
