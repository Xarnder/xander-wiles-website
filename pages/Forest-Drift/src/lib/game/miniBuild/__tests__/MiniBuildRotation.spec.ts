import { describe, expect, it } from 'vitest';
import { BuildingMaterialManager } from '../../building/BuildingMaterialManager';
import { compileMiniBuildData } from '../MiniBuildCompiler';
import { compileCollisionGridBoxes } from '../MiniBuildCollisionCompiler';
import { MiniBuildEditorState, rotateBlockTo } from '../MiniBuildEditorState';
import {
	blockBox,
	blockExtentBox,
	computeBounds,
	isAngledBlock,
	isSnapAngle,
	obbsOverlap,
	snapAngle,
	stepAngle,
	transformLocalObb,
	type Axis
} from '../miniBuildGrid';
import { evaluateMiniBuildPlacement, type MiniBuildPlacementContext } from '../MiniBuildPlacement';
import { MiniBuildSystem } from '../MiniBuildSystem';
import {
	MINI_BUILD_COLLISION,
	MINI_BUILD_ROTATION,
	type MiniBuildBlock,
	type MiniBuildDefinition
} from '../MiniBuildTypes';
import { validateMiniBuildDefinition, validateMiniBuildInstance } from '../MiniBuildValidation';
import { testBlocks, testDefinition } from './miniBuildFixtures';

const AXIS_LIST: Axis[] = ['x', 'y', 'z'];

function rotated(definition: MiniBuildDefinition, rotation: MiniBuildBlock['rotation']) {
	definition.blocks[0].rotation = rotation;
	definition.bounds = computeBounds(definition.blocks);
	return definition;
}

describe('snap angles', () => {
	it('accepts whole 7.5° units in [0, 360) only', () => {
		for (const ok of [0, 7.5, 15, 22.5, 45, 90, 337.5, 352.5])
			expect(isSnapAngle(ok), `${ok}`).toBe(true);
		for (const bad of [-7.5, 10, 360, 400, 22.4, Number.NaN, '45'])
			expect(isSnapAngle(bad), `${bad}`).toBe(false);
	});

	it('returns to exactly 0 after a full turn in every step, landing on snap angles throughout', () => {
		for (const step of MINI_BUILD_ROTATION.snapSteps) {
			let angle = 0;
			for (let i = 0; i < 360 / step; i++) {
				angle = stepAngle(angle, step, 1);
				expect(isSnapAngle(angle)).toBe(true);
				expect(angle).toBe(((i + 1) * step) % 360);
			}
			expect(angle).toBe(0);
			for (let i = 0; i < 360 / step; i++) angle = stepAngle(angle, step, -1);
			expect(angle).toBe(0);
		}
	});

	it('snaps an off-step angle onto the step grid in the direction of travel', () => {
		expect(stepAngle(7.5, 15, 1)).toBe(15);
		expect(stepAngle(7.5, 15, -1)).toBe(0);
		expect(stepAngle(30, 45, 1)).toBe(45);
		expect(stepAngle(30, 45, -1)).toBe(0);
		expect(stepAngle(0, 22.5, -1)).toBe(337.5);
		expect(snapAngle(-15)).toBe(345);
		expect(snapAngle(17, 15)).toBe(15);
		expect(snapAngle(375)).toBe(15);
	});
});

describe('block rotation in the editor', () => {
	/** A block whose sizes differ by odd amounts, so quarter turns cannot keep its centre on the grid. */
	function oddState(): MiniBuildEditorState {
		const state = MiniBuildEditorState.fromDefinition(
			testDefinition([[2, 1, 2, 7, 4, 3]], { unit: 1 })
		);
		state.selectBlock(state.getBlocks()[0].id);
		state.moveSelected({ x: 20, y: 20, z: 20 });
		return state;
	}

	it('brings a block back exactly after a full turn on any axis, in any step', () => {
		for (const axis of AXIS_LIST) {
			for (const step of MINI_BUILD_ROTATION.snapSteps) {
				const state = oddState();
				const start = structuredClone(state.selectedBlock!);
				for (let i = 0; i < 360 / step; i++) {
					expect(state.rotateSelected(axis, 1, step).ok, `${axis} ${step} #${i}`).toBe(true);
					const block = state.selectedBlock!;
					expect(isSnapAngle(block.rotation[axis])).toBe(true);
					for (const v of Object.values(block.positionGrid)) expect(Number.isInteger(v)).toBe(true);
				}
				expect(state.selectedBlock, `${axis} ${step}`).toEqual(start);
			}
		}
	});

	it('undoes a turn exactly by turning back, and keeps the grid-box centre within half a unit', () => {
		const state = oddState();
		const start = structuredClone(state.selectedBlock!);
		const centre = (b: MiniBuildBlock) => {
			const box = blockBox(b);
			return AXIS_LIST.map((a) => (box.min[a] + box.max[a]) / 2);
		};
		for (let i = 0; i < 7; i++) state.rotateSelected('y', 1, 15);
		for (const [a, b] of centre(state.selectedBlock!).map((c, i) => [c, centre(start)[i]]))
			expect(Math.abs(a - b)).toBeLessThanOrEqual(0.5);
		for (let i = 0; i < 7; i++) state.rotateSelected('y', -1, 15);
		expect(state.selectedBlock).toEqual(start);
	});

	it('records a ring drag of several steps as one undo step', () => {
		const state = oddState();
		const start = structuredClone(state.selectedBlock!);
		expect(state.setBlockAngle(start.id, 'y', 135).ok).toBe(true);
		expect(state.selectedBlock!.rotation.y).toBe(135);
		expect(state.selectedBlock).toEqual(rotateBlockTo(start, 'y', 135));
		state.undo();
		expect(state.selectedBlock).toEqual(start);
	});

	it('lifts a block onto the floor rather than refusing a turn that would sink it', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.setSizeMeters('x', 1);
		state.setSizeMeters('y', 0.125);
		expect(blockBox(state.selectedBlock!).min.y).toBe(0);
		expect(state.rotateSelected('z', 1, 22.5).ok).toBe(true);
		expect(blockExtentBox(state.selectedBlock!).min.y).toBe(0);
		expect(state.rotateSelected('z', 1, 90).ok).toBe(true); // 90° → stood on end
		expect(blockExtentBox(state.selectedBlock!).min.y).toBe(0);
	});

	it('snaps typed angles to the current step', () => {
		const state = oddState();
		expect(state.setRotationDegrees('z', 40, 15).ok).toBe(true);
		expect(state.selectedBlock!.rotation.z).toBe(45);
		expect(state.setRotationDegrees('z', -30, 22.5).ok).toBe(true);
		expect(state.selectedBlock!.rotation.z).toBe(337.5);
	});

	it('measures an angled block by what it draws: bounds grow to the turned corners', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.setSizeMeters('x', 1);
		state.setSizeMeters('z', 0.25);
		expect(state.rotateSelected('y', 1, 45).ok).toBe(true);
		const block = state.selectedBlock!;
		expect(isAngledBlock(block)).toBe(true);
		const extent = blockExtentBox(block);
		// (1m + 0.25m) / √2 ≈ 0.884m on X and Z; Y untouched.
		expect(extent.max.x - extent.min.x).toBe(Math.ceil((32 + 8) / Math.SQRT2 - 1e-6) + 1);
		expect(extent.max.y - extent.min.y).toBe(16);
		expect(state.getSizeMeters().x).toBeGreaterThan(0.88);
		expect(state.getSizeMeters().x).toBeLessThan(0.95);
	});

	it('resizes an angled block along its own axes, about its centre from the panel', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.rotateSelected('y', 1, 30);
		expect(state.setSizeMeters('x', 1).ok).toBe(true);
		expect(state.selectedBlock!.sizeGrid).toEqual({ x: 32, y: 16, z: 16 });
		expect(state.selectedBlock!.rotation.y).toBe(30);
	});

	it('mirrors an angled block to the opposite angle', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.moveSelected({ x: 24 });
		state.rotateSelected('y', 1, 30);
		expect(state.mirrorDuplicateX().ok).toBe(true);
		expect(state.selectedBlock!.rotation.y).toBe(330);
	});
});

describe('compiling angled blocks', () => {
	function areaByNormal(definition: MiniBuildDefinition) {
		const data = compileMiniBuildData(definition);
		let area = 0;
		for (const group of data.groups) {
			const p = group.positions;
			for (let t = 0; t < group.indices.length; t += 3) {
				const [a, b, c] = [group.indices[t], group.indices[t + 1], group.indices[t + 2]];
				const u = [0, 1, 2].map((k) => p[b * 3 + k] - p[a * 3 + k]);
				const v = [0, 1, 2].map((k) => p[c * 3 + k] - p[a * 3 + k]);
				const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
				const len = Math.hypot(...n);
				area += len / 2;
				// Winding faces the stored normal.
				const stored = [0, 1, 2].map((k) => group.normals[a * 3 + k]);
				expect(Math.hypot(...stored)).toBeCloseTo(1, 6); // Float32 normals
				expect((n[0] * stored[0] + n[1] * stored[1] + n[2] * stored[2]) / len).toBeCloseTo(1, 6);
			}
		}
		return { data, area };
	}

	it('emits a turned cuboid with the full surface area and outward faces', () => {
		const definition = rotated(testDefinition([[0, 0, 0, 16, 4, 8]]), { x: 15, y: 30, z: 7.5 });
		const { data, area } = areaByNormal(definition);
		expect(data.stats.quads).toBe(6);
		// 1 × 0.25 × 0.5 m → 2(0.25 + 0.5 + 0.125) m²
		expect(area).toBeCloseTo(2 * (0.25 + 0.5 + 0.125), 6);
		// Every vertex lies inside the compiled bounds.
		for (const group of data.groups)
			for (let i = 0; i < group.positions.length; i += 3) {
				expect(group.positions[i]).toBeGreaterThanOrEqual(data.bounds.min.x - 1e-9);
				expect(group.positions[i + 1]).toBeGreaterThanOrEqual(data.bounds.min.y - 1e-9);
				expect(group.positions[i + 2]).toBeLessThanOrEqual(data.bounds.max.z + 1e-9);
			}
	});

	it('emits an angled plane as two back-to-back quads', () => {
		const definition = rotated(testDefinition([[0, 4, 0, 8, 0, 6]]), { x: 22.5, y: 0, z: 0 });
		const { data, area } = areaByNormal(definition);
		expect(data.stats.quads).toBe(2);
		expect(area).toBeCloseTo(2 * 0.5 * 0.375, 6);
	});

	it('never hides a neighbour’s faces behind an angled block', () => {
		const definition = testDefinition([
			[0, 0, 0, 8, 8, 8],
			[8, 0, 0, 8, 8, 8]
		]);
		const flush = compileMiniBuildData(definition);
		definition.blocks[1].rotation = { x: 0, y: 45, z: 0 };
		definition.bounds = computeBounds(definition.blocks);
		const angled = compileMiniBuildData(definition);
		// The first block keeps its +X face once the second turns away from it.
		expect(angled.stats.quads).toBe(6 + 6);
		expect(flush.stats.quads).toBeLessThan(12);
	});

	it('keeps a block that is only turned about Y as an exact yawed collision box', () => {
		const blocks = testBlocks([[0, 0, 0, 16, 8, 4]]);
		blocks[0].rotation = { x: 0, y: 30, z: 0 };
		blocks[0].collision = 'solid';
		const [box] = compileCollisionGridBoxes(blocks, MINI_BUILD_COLLISION);
		expect(box.yaw).toBe(30);
		expect(box.max.x - box.min.x).toBe(32);
		expect(box.max.z - box.min.z).toBe(8);
		expect(box.max.y - box.min.y).toBe(16);
		// A tilted block falls back to the grid box around it.
		blocks[0].rotation = { x: 30, y: 0, z: 0 };
		const [tilted] = compileCollisionGridBoxes(blocks, MINI_BUILD_COLLISION);
		expect(tilted.yaw).toBeUndefined();
		expect(tilted).toEqual(blockExtentBox(blocks[0]));
	});

	it('validates and round-trips angled designs', () => {
		const definition = rotated(testDefinition([[0, 0, 0, 16, 4, 8]]), { x: 0, y: 22.5, z: 0 });
		const result = validateMiniBuildDefinition(definition);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.blocks[0].rotation.y).toBe(22.5);
		expect(result.value.bounds.min.y).toBe(0);
		definition.blocks[0].rotation.y = 10;
		expect(validateMiniBuildDefinition(definition).ok).toBe(false);
	});
});

describe('whole-object snap rotation in the world', () => {
	function createSystem(): MiniBuildSystem {
		const system = new MiniBuildSystem({ materialManager: new BuildingMaterialManager() });
		system.update(0, 0);
		return system;
	}

	function context(system: MiniBuildSystem): Omit<MiniBuildPlacementContext, 'camera'> {
		return {
			buildingManager: {} as MiniBuildPlacementContext['buildingManager'],
			foundationManager: {
				getFoundationContaining: () => undefined
			} as unknown as MiniBuildPlacementContext['foundationManager'],
			worldSurfaceSampler: {
				getSupportingSurfaceY: () => 0
			} as unknown as MiniBuildPlacementContext['worldSurfaceSampler'],
			system,
			getTerrainMeshes: () => [],
			getWallRects: () => [],
			getGridSize: () => 0
		};
	}

	it('accepts snap-angle instance yaw and rejects anything else', () => {
		const ids = new Set(['d1']);
		const base = { id: 'i1', designId: 'd1', position: { x: 1, y: 2, z: 3 } };
		for (const rotationY of [0, 22.5, 45, 337.5])
			expect(validateMiniBuildInstance({ ...base, rotationY }, ids).ok).toBe(true);
		for (const rotationY of [10, 360, -45])
			expect(validateMiniBuildInstance({ ...base, rotationY }, ids).ok).toBe(false);
	});

	it('tests overlap with the turned footprint, not the square around it', () => {
		const system = createSystem();
		// 2m × 0.5m × 0.25m bench.
		const design = system.importDefinition(testDefinition([[0, 0, 0, 32, 8, 4]], { id: 'bench' }));
		if (!design.ok) throw new Error(design.error);
		expect(system.placeInstance(design.value.id, { x: 4, y: 0, z: 4 }, 45).ok).toBe(true);
		// Beside it along its own Z axis (sin 45, cos 45): the AABBs overlap, the benches do not.
		const side = (d: number) => ({ x: 4 + d * Math.SQRT1_2, y: 0, z: 4 + d * Math.SQRT1_2 });
		const beside = evaluateMiniBuildPlacement(
			context(system),
			design.value,
			45,
			side(0.4),
			1,
			null
		);
		expect(beside.valid).toBe(true);
		const into = evaluateMiniBuildPlacement(context(system), design.value, 45, side(0.15), 1, null);
		expect(into).toMatchObject({ valid: false, reason: 'Overlaps another object' });
	});

	it('gives the player oriented collision for a turned object', () => {
		const system = createSystem();
		const design = system.importDefinition(testDefinition([[0, 0, 0, 32, 8, 4]], { id: 'bench' }));
		if (!design.ok) throw new Error(design.error);
		system.placeInstance(design.value.id, { x: 4, y: 0, z: 4 }, 30);
		const [rect] = system.instances.getNearbyCollisionRects();
		expect(rect.dirX).toBeCloseTo(Math.cos(Math.PI / 6), 12);
		expect(rect.dirZ).toBeCloseTo(-Math.sin(Math.PI / 6), 12);
		expect(rect.halfLength).toBeCloseTo(1, 12);
		expect(rect.halfThickness).toBeCloseTo(0.125, 12);
	});

	it('separating-axis overlap matches the AABB test at quarter turns', () => {
		const a = transformLocalObb(
			{ x: -1, y: 0, z: -0.25 },
			{ x: 1, y: 1, z: 0.25 },
			{ x: 0, y: 0, z: 0 },
			90
		);
		const b = transformLocalObb(
			{ x: -1, y: 0, z: -0.25 },
			{ x: 1, y: 1, z: 0.25 },
			{ x: 0.5, y: 0, z: 0 },
			90
		);
		const c = transformLocalObb(
			{ x: -1, y: 0, z: -0.25 },
			{ x: 1, y: 1, z: 0.25 },
			{ x: 0.5, y: 0, z: 0 },
			0
		);
		expect(obbsOverlap(a, b)).toBe(false); // flush side by side
		expect(obbsOverlap(a, c)).toBe(true);
	});
});
