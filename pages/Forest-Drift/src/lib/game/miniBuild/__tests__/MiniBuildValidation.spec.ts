import { describe, expect, it } from 'vitest';
import { DEFAULT_MINI_BUILDS } from '../defaultMiniBuilds';
import {
	blockBox,
	chunkIdForPosition,
	contentHash,
	effectiveSize,
	localSizeForEffective,
	metersToGrid,
	rotateQuarterY,
	snapMeters,
	transformLocalBox,
	uniqueName
} from '../miniBuildGrid';
import {
	blocksOnGrid,
	validateMiniBuildDefinition,
	validateMiniBuildInstance,
	validateMiniBuildWorldState
} from '../MiniBuildValidation';
import { MINI_BUILD_LIMITS, MINI_BUILD_WORLD_LIMITS } from '../MiniBuildTypes';
import { compileMiniBuildData } from '../MiniBuildCompiler';
import { sixteenBlockDefinition, testDefinition } from './miniBuildFixtures';

describe('miniBuildGrid', () => {
	it('snaps metres to 0.0625m without floating-point drift', () => {
		expect(MINI_BUILD_LIMITS.gridSize).toBe(0.0625);
		expect(metersToGrid(0.3)).toBe(5);
		expect(metersToGrid(0.44)).toBe(7);
		expect(snapMeters(1.03)).toBe(1);
		expect(snapMeters(1.07)).toBe(1.0625);
		expect(snapMeters(1.1)).toBe(1.125);
		let grid = 0;
		for (let i = 0; i < 1000; i++) grid += metersToGrid(0.0625);
		expect(grid).toBe(1000);
		expect(grid * MINI_BUILD_LIMITS.gridSize).toBe(62.5);
	});

	it('permutes sizes for quarter-turn rotations and inverts cleanly', () => {
		const block = { sizeGrid: { x: 8, y: 2, z: 3 }, rotation: { x: 0, y: 90, z: 0 } as const };
		expect(effectiveSize(block)).toEqual({ x: 3, y: 2, z: 8 });
		expect(localSizeForEffective({ x: 3, y: 2, z: 8 }, block.rotation)).toEqual({
			x: 8,
			y: 2,
			z: 3
		});
		expect(
			effectiveSize({ sizeGrid: { x: 8, y: 2, z: 3 }, rotation: { x: 90, y: 0, z: 0 } })
		).toEqual({ x: 8, y: 3, z: 2 });
		expect(
			effectiveSize({ sizeGrid: { x: 8, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 270 } })
		).toEqual({ x: 2, y: 8, z: 3 });
	});

	it('matches THREE.makeRotationY for instance yaw', () => {
		expect(rotateQuarterY(1, 0, 90)).toEqual({ x: 0, z: -1 });
		expect(rotateQuarterY(1, 0, 180)).toEqual({ x: -1, z: -0 });
		const box = transformLocalBox(
			{ x: -0.5, y: 0, z: -0.25 },
			{ x: 0.5, y: 1, z: 0.25 },
			{ x: 10, y: 2, z: 20 },
			90
		);
		expect(box).toEqual({ minX: 9.75, maxX: 10.25, minY: 2, maxY: 3, minZ: 19.5, maxZ: 20.5 });
	});

	it('assigns chunks by anchor with floor semantics for negative coordinates', () => {
		expect(chunkIdForPosition(0, 0)).toBe('0:0');
		expect(chunkIdForPosition(15.99, 15.99)).toBe('0:0');
		expect(chunkIdForPosition(16, -0.01)).toBe('1:-1');
		expect(MINI_BUILD_WORLD_LIMITS.chunkSize).toBe(16);
	});

	it('hashes content deterministically and ignores names', () => {
		const a = sixteenBlockDefinition();
		const b = { ...sixteenBlockDefinition(), name: 'Renamed' };
		expect(contentHash(a)).toBe(contentHash(b));
		b.blocks[3] = { ...b.blocks[3], materialSlot: 0 };
		expect(contentHash(a)).not.toBe(contentHash(b));
	});

	it('generates Chair, Chair 2, Chair 3', () => {
		expect(uniqueName('Chair', [])).toBe('Chair');
		expect(uniqueName('Chair', ['Chair'])).toBe('Chair 2');
		expect(uniqueName('Chair', ['Chair', 'chair 2'])).toBe('Chair 3');
	});
});

describe('validateMiniBuildDefinition', () => {
	it('accepts 1 and 16 blocks and rejects 17', () => {
		expect(validateMiniBuildDefinition(testDefinition([[0, 0, 0, 1, 1, 1]])).ok).toBe(true);
		expect(validateMiniBuildDefinition(sixteenBlockDefinition()).ok).toBe(true);
		const boxes = Array.from(
			{ length: 17 },
			(_, i) => [i, 0, 0, 1, 1, 1] as [number, number, number, number, number, number]
		);
		const result = validateMiniBuildDefinition(testDefinition(boxes));
		expect(result.ok).toBe(false);
	});

	it('rejects a 10,000-block hand-edited save without compiling it', () => {
		const huge = testDefinition([[0, 0, 0, 1, 1, 1]]);
		huge.blocks = Array.from({ length: 10_000 }, (_, i) => ({ ...huge.blocks[0], id: `x${i}` }));
		expect(validateMiniBuildDefinition(huge).ok).toBe(false);
	});

	it('requires whole grid units and non-negative sizes', () => {
		const fractional = testDefinition([[0, 0, 0, 1, 1, 1]]);
		fractional.blocks[0].positionGrid.x = 0.5;
		expect(validateMiniBuildDefinition(fractional).ok).toBe(false);
		const negative = testDefinition([[0, 0, 0, 1, 1, 1]]);
		negative.blocks[0].sizeGrid.y = -1;
		expect(validateMiniBuildDefinition(negative).ok).toBe(false);
		const nan = testDefinition([[0, 0, 0, 1, 1, 1]]);
		nan.blocks[0].positionGrid.z = Number.NaN;
		expect(validateMiniBuildDefinition(nan).ok).toBe(false);
		const inf = testDefinition([[0, 0, 0, 1, 1, 1]]);
		inf.blocks[0].sizeGrid.x = Number.POSITIVE_INFINITY;
		expect(validateMiniBuildDefinition(inf).ok).toBe(false);
	});

	it('accepts a plane (size 0 on exactly one axis) but not a line or a point', () => {
		for (const box of [
			[0, 0, 0, 0, 8, 8],
			[0, 0, 0, 8, 0, 8],
			[0, 0, 0, 8, 8, 0]
		] as const) {
			const result = validateMiniBuildDefinition(testDefinition([[...box]]));
			expect(result.ok, !result.ok ? result.error : '').toBe(true);
		}
		const line = validateMiniBuildDefinition(testDefinition([[0, 0, 0, 0, 8, 0]]));
		expect(line.ok).toBe(false);
		expect(!line.ok && line.error).toMatch(/only one axis/);
		expect(validateMiniBuildDefinition(testDefinition([[0, 0, 0, 0, 0, 0]])).ok).toBe(false);
	});

	it('keeps valid plane layers and rejects invalid ones', () => {
		const layered = testDefinition([
			[0, 0, 0, 8, 0, 8],
			[0, 0, 0, 8, 0, 8]
		]);
		layered.blocks[1].layer = 1;
		const result = validateMiniBuildDefinition(layered);
		expect(result.ok && result.value.blocks[1].layer).toBe(1);
		for (const bad of [-1, 1.5, 100_000, Number.NaN]) {
			const invalid = testDefinition([[0, 0, 0, 8, 0, 8]]);
			invalid.blocks[0].layer = bad;
			expect(validateMiniBuildDefinition(invalid).ok).toBe(false);
		}
		// A layer on a cuboid means nothing and is dropped.
		const cuboid = testDefinition([[0, 0, 0, 8, 8, 8]]);
		cuboid.blocks[0].layer = 3;
		const cleaned = validateMiniBuildDefinition(cuboid);
		expect(cleaned.ok && cleaned.value.blocks[0].layer).toBe(undefined);
	});

	it('enforces the 4m bounds', () => {
		expect(validateMiniBuildDefinition(testDefinition([[0, 0, 0, 64, 64, 64]])).ok).toBe(true);
		expect(
			validateMiniBuildDefinition(
				testDefinition([
					[0, 0, 0, 1, 1, 1],
					[64, 0, 0, 1, 1, 1]
				])
			).ok
		).toBe(false);
	});

	it('upgrades v1 (0.125m grid) designs by doubling their grid coordinates', () => {
		const v1 = testDefinition([
			[0, 0, 0, 4, 2, 6],
			[-2, 2, 1, 8, 1, 2]
		]);
		v1.schemaVersion = 1;
		const result = validateMiniBuildDefinition(v1);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.schemaVersion).toBe(2);
		expect(result.value.blocks[0].sizeGrid).toEqual({ x: 8, y: 4, z: 12 });
		expect(result.value.blocks[1].positionGrid).toEqual({ x: -4, y: 4, z: 2 });
		expect(result.value.blocks[1].sizeGrid).toEqual({ x: 16, y: 2, z: 4 });
		// Same size in metres: the first block is still 0.5m × 0.25m × 0.75m.
		expect(compileMiniBuildData(result.value).bounds.max.y).toBeCloseTo(0.375, 6);
		// A v1 design at the old 4m limit (32 units) still fits after upgrading.
		const big = testDefinition([[0, 0, 0, 32, 32, 32]]);
		big.schemaVersion = 1;
		expect(validateMiniBuildDefinition(big).ok).toBe(true);
		// Zero stays zero under the doubling, so a zero-size v1 block simply loads as a plane.
		const flat = testDefinition([[0, 0, 0, 4, 0, 4]]);
		flat.schemaVersion = 1;
		expect(validateMiniBuildDefinition(flat).ok).toBe(true);
	});

	it('validates material slots and rotations', () => {
		const badSlot = testDefinition([[0, 0, 0, 1, 1, 1]]);
		badSlot.blocks[0].materialSlot = 3;
		expect(validateMiniBuildDefinition(badSlot).ok).toBe(false);
		const fiveSlots = testDefinition([[0, 0, 0, 1, 1, 1]], { slots: 4 });
		fiveSlots.materials.push({ ...fiveSlots.materials[0] });
		expect(validateMiniBuildDefinition(fiveSlots).ok).toBe(false);
		const rotated = testDefinition([[0, 0, 0, 1, 1, 1]]);
		(rotated.blocks[0].rotation as { y: number }).y = 45;
		expect(validateMiniBuildDefinition(rotated).ok).toBe(false);
	});

	it('re-grounds floating designs and recomputes untrusted bounds', () => {
		const floating = testDefinition([[0, 5, 0, 2, 2, 2]]);
		floating.bounds = { min: { x: -99, y: -99, z: -99 }, max: { x: 99, y: 99, z: 99 } };
		const result = validateMiniBuildDefinition(floating);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.blocks[0].positionGrid.y).toBe(0);
		expect(result.value.bounds).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } });
	});
});

describe('validateMiniBuildInstance / world state', () => {
	it('rejects instances referencing unknown designs and non-quarter rotations', () => {
		const ids = new Set(['d1']);
		const base = { id: 'i1', designId: 'd1', position: { x: 1, y: 2, z: 3 }, rotationY: 90 };
		expect(validateMiniBuildInstance(base, ids).ok).toBe(true);
		expect(validateMiniBuildInstance({ ...base, designId: 'missing' }, ids).ok).toBe(false);
		expect(validateMiniBuildInstance({ ...base, rotationY: 45 }, ids).ok).toBe(false);
		expect(
			validateMiniBuildInstance({ ...base, position: { x: Infinity, y: 0, z: 0 } }, ids).ok
		).toBe(false);
	});

	it('drops dangling foundation links instead of failing', () => {
		const result = validateMiniBuildInstance(
			{
				id: 'i1',
				designId: 'd1',
				position: { x: 0, y: 0, z: 0 },
				rotationY: 0,
				foundationId: 'gone'
			},
			new Set(['d1']),
			new Set(['other'])
		);
		expect(result.ok && result.value.foundationId).toBe(undefined);
	});

	it('rejects duplicate ids and accepts an empty or missing block', () => {
		expect(validateMiniBuildWorldState(undefined).ok).toBe(true);
		const definition = testDefinition([[0, 0, 0, 1, 1, 1]], { id: 'd1' });
		expect(
			validateMiniBuildWorldState({ definitions: [definition, definition], instances: [] }).ok
		).toBe(false);
		const instance = { id: 'i', designId: 'd1', position: { x: 0, y: 0, z: 0 }, rotationY: 0 };
		expect(
			validateMiniBuildWorldState({ definitions: [definition], instances: [instance, instance] }).ok
		).toBe(false);
	});
});

describe('default designs', () => {
	it('are ordinary player-legal Mini Builds', () => {
		expect(DEFAULT_MINI_BUILDS.length).toBeGreaterThanOrEqual(15);
		const ids = new Set<string>();
		for (const definition of DEFAULT_MINI_BUILDS) {
			expect(ids.has(definition.id)).toBe(false);
			ids.add(definition.id);
			const result = validateMiniBuildDefinition(definition);
			expect(result.ok, `${definition.name}: ${!result.ok ? result.error : ''}`).toBe(true);
			expect(definition.blocks.length).toBeLessThanOrEqual(MINI_BUILD_LIMITS.maxBlocks);
			expect(definition.materials.length).toBeLessThanOrEqual(MINI_BUILD_LIMITS.maxMaterialSlots);
			expect(blocksOnGrid(definition.blocks)).toBe(true);
			// Grounded: something touches Y = 0.
			expect(Math.min(...definition.blocks.map((block) => blockBox(block).min.y))).toBe(0);
			const compiled = compileMiniBuildData(definition);
			expect(compiled.groups.length).toBeLessThanOrEqual(definition.materials.length);
			expect(compiled.collision.length).toBeGreaterThan(0);
		}
	});

	it('include the required starter furniture', () => {
		const names = DEFAULT_MINI_BUILDS.map((definition) => definition.name);
		for (const required of [
			'Chair',
			'Arm Chair',
			'Stool',
			'Bench',
			'Table',
			'Bed',
			'Wardrobe',
			'Workbench',
			'Kitchen Counter',
			'Sink Counter',
			'Stove',
			'Chest',
			'Barrel',
			'Shelf',
			'Bookcase'
		]) {
			expect(names).toContain(required);
		}
	});
});
