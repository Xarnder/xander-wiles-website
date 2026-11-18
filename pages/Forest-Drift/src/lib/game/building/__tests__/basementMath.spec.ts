import { describe, expect, it } from 'vitest';
import {
	basementDeckUndersideY,
	basementDepth,
	basementFootingBottomY,
	basementInteriorRect,
	basementLevel,
	basementLevelName,
	basementLowestFloorY,
	basementOccupantCount,
	basementRegionAt,
	basementRetainingWallRects,
	basementSlabPlans
} from '../basementMath';
import {
	DECK_THICKNESS,
	FOOTING_DEPTH,
	MAX_BASEMENT_STOREY_HEIGHT,
	MIN_BASEMENT_STOREY_HEIGHT,
	RETAINING_WALL_THICKNESS,
	isValidBasement
} from '../basementTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { signedArea2D, validateSlabPolygon } from '../slabMath';
import { resolvePlayerPositionAgainstWalls } from '../wallCollision';

const SPACING = 2;
const GRID = 0.25;

function foundation(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'f',
		minGridX: 10,
		maxGridX: 15,
		minGridZ: -4,
		maxGridZ: 0,
		topY: 12,
		bottomY: 10.5,
		basement: { storeys: 2, storeyHeight: 3 },
		...overrides
	};
}

describe('basementTypes', () => {
	it('accepts one to three whole storeys within the height limits', () => {
		for (const storeys of [1, 2, 3])
			for (const storeyHeight of [MIN_BASEMENT_STOREY_HEIGHT, 3, MAX_BASEMENT_STOREY_HEIGHT])
				expect(isValidBasement({ storeys, storeyHeight })).toBe(true);
	});
	it('rejects anything else', () => {
		for (const bad of [
			null,
			3,
			{},
			{ storeys: 0, storeyHeight: 3 },
			{ storeys: 4, storeyHeight: 3 },
			{ storeys: 1.5, storeyHeight: 3 },
			{ storeys: 1, storeyHeight: 2 },
			{ storeys: 1, storeyHeight: 5 },
			{ storeys: 1, storeyHeight: Number.NaN },
			{ storeys: '1', storeyHeight: 3 }
		])
			expect(isValidBasement(bad)).toBe(false);
	});
});

describe('basement storeys', () => {
	it('is storeys × storey height deep', () => {
		expect(basementDepth({ storeys: 1, storeyHeight: 2.5 })).toBe(2.5);
		expect(basementDepth({ storeys: 3, storeyHeight: 4.5 })).toBe(13.5);
	});

	it('gives levels −1 … −storeys and nothing else', () => {
		const b = { storeys: 3, storeyHeight: 3.5 };
		expect(basementLevel(b, -1)).toEqual({ baseY: -3.5, wallHeight: 3.5 });
		expect(basementLevel(b, -2)).toEqual({ baseY: -7, wallHeight: 3.5 });
		expect(basementLevel(b, -3)).toEqual({ baseY: -10.5, wallHeight: 3.5 });
		for (const index of [0, 1, -4, -1.5]) expect(basementLevel(b, index)).toBeNull();
		expect(basementLevel({ storeys: 1, storeyHeight: 3 }, -2)).toBeNull();
	});

	it('each storey wall top meets the base of the storey above', () => {
		const b = { storeys: 3, storeyHeight: 3 };
		for (let k = 1; k <= 3; k++) {
			const level = basementLevel(b, -k)!;
			const above = k === 1 ? 0 : basementLevel(b, -(k - 1))!.baseY;
			expect(level.baseY + level.wallHeight).toBeCloseTo(above, 9);
		}
	});

	it('names the three basement storeys', () => {
		expect(basementLevelName(-1)).toBe('Basement');
		expect(basementLevelName(-2)).toBe('Lower Basement');
		expect(basementLevelName(-3)).toBe('Deep Basement');
		expect(basementLevelName(0)).toBeNull();
		expect(basementLevelName(-4)).toBeNull();
	});
});

describe('basement heights in the world', () => {
	it('puts the lowest floor and the deck underside relative to the top', () => {
		const f = foundation();
		expect(basementLowestFloorY(f)).toBe(6);
		expect(basementDeckUndersideY(f)).toBe(12 - DECK_THICKNESS);
		expect(basementLowestFloorY(foundation({ basement: undefined }))).toBeNull();
	});

	it('lowers the footing below the lowest floor without ever raising it', () => {
		expect(basementFootingBottomY(foundation())).toBe(6 - FOOTING_DEPTH);
		// Already deep enough (a foundation on a steep slope): unchanged.
		expect(basementFootingBottomY(foundation({ bottomY: 2 }))).toBe(2);
		// No basement: the authored bottom.
		expect(basementFootingBottomY(foundation({ basement: undefined }))).toBe(10.5);
	});
});

describe('basementSlabPlans', () => {
	it('makes a deck and one floor between each pair of storeys', () => {
		for (const storeys of [1, 2, 3]) {
			const plans = basementSlabPlans(
				foundation({ basement: { storeys, storeyHeight: 3 } }),
				SPACING,
				GRID,
				0.2
			);
			expect(plans).toHaveLength(storeys);
			expect(plans[0]).toMatchObject({
				type: 'ceiling',
				role: 'deck',
				levelIndex: -1,
				localY: 0,
				thickness: DECK_THICKNESS
			});
			for (let k = 1; k < storeys; k++)
				expect(plans[k]).toMatchObject({
					type: 'floor',
					role: 'basement-floor',
					levelIndex: -(k + 1),
					localY: -3 * k,
					thickness: 0.2
				});
		}
	});

	it('covers the whole footprint as a valid math-CCW slab polygon', () => {
		const [deck] = basementSlabPlans(foundation(), SPACING, GRID, 0.2);
		// 5 × 4 terrain cells of 2 m = 10 × 8 m = 40 × 32 building-grid steps.
		const xs = deck.points.map((p) => p.gridX);
		const zs = deck.points.map((p) => p.gridZ);
		expect([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]).toEqual([
			0, 40, 0, 32
		]);
		const polygon = deck.points.map((p) => ({ x: p.gridX, z: p.gridZ }));
		expect(signedArea2D(polygon)).toBeGreaterThan(0);
		expect(validateSlabPolygon(polygon).valid).toBe(true);
	});

	it('offers nothing when the terrain grid does not divide into the building grid', () => {
		expect(basementSlabPlans(foundation(), 1.3, GRID, 0.2)).toEqual([]);
		expect(basementSlabPlans(foundation({ basement: undefined }), SPACING, GRID, 0.2)).toEqual([]);
	});
});

describe('basementRegionAt', () => {
	const f = foundation(); // x 20 … 30, z −8 … 0
	it('tells the interior from the ring round it', () => {
		expect(basementRegionAt(f, SPACING, 25, -4)).toBe('interior');
		expect(basementRegionAt(f, SPACING, 20 + RETAINING_WALL_THICKNESS / 2, -4)).toBe('ring');
		expect(basementRegionAt(f, SPACING, 25, 0)).toBe('ring');
		expect(basementRegionAt(f, SPACING, 30, -8)).toBe('ring');
	});
	it('is null off the footprint or without a basement', () => {
		expect(basementRegionAt(f, SPACING, 19.9, -4)).toBeNull();
		expect(basementRegionAt(f, SPACING, 25, 0.1)).toBeNull();
		expect(basementRegionAt(foundation({ basement: undefined }), SPACING, 25, -4)).toBeNull();
	});
	it('matches the interior rect', () => {
		expect(basementInteriorRect(f, SPACING)).toEqual({
			minX: 20.3,
			maxX: 29.7,
			minZ: -7.7,
			maxZ: -0.3
		});
	});
});

describe('basementRetainingWallRects', () => {
	const f = foundation();
	const rects = basementRetainingWallRects(f, SPACING);

	it('runs four walls flush with the footprint, from the lowest floor to the deck underside', () => {
		expect(rects).toHaveLength(4);
		for (const r of rects) {
			expect(r.minWorldY).toBe(6);
			expect(r.maxWorldY).toBe(12 - DECK_THICKNESS);
			expect(r.halfThickness).toBe(RETAINING_WALL_THICKNESS / 2);
		}
	});

	it('keeps a player inside the basement on every side', () => {
		const radius = 0.3;
		const feet = 6;
		for (const [x, z] of [
			[19, -4],
			[31, -4],
			[25, 1],
			[25, -9]
		] as const) {
			const resolved = resolvePlayerPositionAgainstWalls(
				// Step from the middle straight towards and past each wall.
				x,
				z,
				feet,
				feet + 1.7,
				radius,
				rects
			);
			// Pushed out on one side or the other of a 0.3 m wall: never left standing in it.
			const insideWall = basementRegionAt(f, SPACING, resolved.x, resolved.z) === 'ring';
			expect(insideWall).toBe(false);
		}
		// From just inside, a step into the wall is pushed back to the interior.
		const nearWall = resolvePlayerPositionAgainstWalls(20.5, -4, feet, feet + 1.7, radius, rects);
		expect(nearWall.x).toBeGreaterThanOrEqual(20.3 + radius - 1e-9);
	});

	it('never meets a player whose feet are on the deck', () => {
		const resolved = resolvePlayerPositionAgainstWalls(20.1, -4, 12, 13.7, 0.3, rects);
		expect(resolved).toEqual({ x: 20.1, z: -4 });
	});

	it('is empty without a basement', () => {
		expect(basementRetainingWallRects(foundation({ basement: undefined }), SPACING)).toEqual([]);
	});
});

describe('basementOccupantCount', () => {
	const empty = { walls: [], wallPaths: [], slabs: [], stairs: [], roofs: [] };
	it('counts pieces below the top, but not the basement’s own slabs or approach stairs', () => {
		expect(
			basementOccupantCount({
				...empty,
				slabs: [{ localY: 0, role: 'deck' }, { localY: -3, role: 'basement-floor' }, { localY: 3 }],
				// An approach stair beside the house: below the top, on the Ground Floor.
				stairs: [{ levelIndex: 0 }],
				walls: [{ baseY: 0 }]
			})
		).toBe(0);
		expect(
			basementOccupantCount({
				walls: [{ baseY: -3 }],
				wallPaths: [{ baseY: -6 }],
				slabs: [{ localY: -1 }],
				stairs: [{ levelIndex: -1 }],
				roofs: [{ baseY: -2 }],
				floorDetails: [{ hostY: -3 }],
				skirtingRuns: [{ baseY: -3 }]
			})
		).toBe(7);
	});
});
