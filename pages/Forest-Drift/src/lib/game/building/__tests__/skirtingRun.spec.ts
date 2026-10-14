import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingMaterialManager } from '../BuildingMaterialManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { resolvePaintTarget } from '../PaintTypes';
import { resolveRemovalTarget } from '../RemovalTypes';
import { SkirtingRunManager } from '../SkirtingRunManager';
import {
	findWallHalfThickness,
	sideOfLine,
	skirtingRunFootprints,
	validateSkirtingRun,
	type SkirtingRunDefinition,
	type WallLine
} from '../skirtingRunMath';

const wall = (
	ax: number,
	az: number,
	bx: number,
	bz: number,
	thickness = 0.2,
	baseY = 0
): WallLine => ({
	start: { x: ax, z: az },
	end: { x: bx, z: bz },
	baseY,
	thickness
});

describe('auto offset: the wall drawn on that line', () => {
	const walls = [wall(0, 0, 4, 0, 0.2), wall(4, 0, 4, 3, 0.3), wall(0, 0, 4, 0, 0.12, 3)];

	it('finds half the thickness of the wall under the drawn segment, on this storey', () => {
		expect(findWallHalfThickness({ x: 1, z: 0 }, { x: 3, z: 0 }, 0, walls)).toBeCloseTo(0.1, 9);
		expect(findWallHalfThickness({ x: 4, z: 0 }, { x: 4, z: 3 }, 0, walls)).toBeCloseTo(0.15, 9);
		// The upper storey's thinner wall on the same line.
		expect(findWallHalfThickness({ x: 0, z: 0 }, { x: 4, z: 0 }, 3, walls)).toBeCloseTo(0.06, 9);
		// Drawn backwards still matches.
		expect(findWallHalfThickness({ x: 3, z: 0 }, { x: 1, z: 0 }, 0, walls)).toBeCloseTo(0.1, 9);
	});

	it('returns null where no wall runs along the line', () => {
		expect(findWallHalfThickness({ x: 0, z: 1 }, { x: 4, z: 1 }, 0, walls)).toBeNull();
		expect(findWallHalfThickness({ x: 0, z: 0 }, { x: 3, z: 3 }, 0, walls)).toBeNull();
		expect(findWallHalfThickness({ x: 5, z: 0 }, { x: 8, z: 0 }, 0, walls)).toBeNull();
		expect(findWallHalfThickness({ x: 1, z: 0 }, { x: 3, z: 0 }, 6, walls)).toBeNull();
	});
});

describe('board side', () => {
	it('is the side of the line the player stands on', () => {
		expect(sideOfLine({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 1 })).toBe(1);
		expect(sideOfLine({ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: -1 })).toBe(-1);
		expect(sideOfLine({ x: 4, z: 0 }, { x: 0, z: 0 }, { x: 2, z: 1 })).toBe(-1);
	});
});

describe('board footprints', () => {
	it('sits on the wall face, depth out from it, on the chosen side', () => {
		const [quad] = skirtingRunFootprints(
			[
				{ x: 0, z: 0 },
				{ x: 4, z: 0 }
			],
			false,
			[{ side: 1, offset: 0.1 }],
			0.02
		);
		expect(quad[0]).toEqual({ x: 0, z: 0.1 });
		expect(quad[1]).toEqual({ x: 4, z: 0.1 });
		expect(quad[2].z).toBeCloseTo(0.12, 9);
		const [flipped] = skirtingRunFootprints(
			[
				{ x: 0, z: 0 },
				{ x: 4, z: 0 }
			],
			false,
			[{ side: -1, offset: 0.1 }],
			0.02
		);
		expect(flipped[0].z).toBeCloseTo(-0.1, 9);
		expect(flipped[2].z).toBeCloseTo(-0.12, 9);
	});

	it('mitres an inside corner so the boards meet without a gap or overlap', () => {
		const points = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 3 }
		];
		const [a, b] = skirtingRunFootprints(
			points,
			false,
			[
				{ side: 1, offset: 0.1 },
				{ side: 1, offset: 0.15 }
			],
			0.02
		);
		// Inside corner of a room: the face lines meet at (4 - 0.15, 0.1).
		expect(a[1].x).toBeCloseTo(3.85, 9);
		expect(a[1].z).toBeCloseTo(0.1, 9);
		expect(b[0]).toEqual(a[1]);
		expect(b[3]).toEqual(a[2]);
	});

	it('ends boards square where the side flips, and closes a room with one board per wall', () => {
		const [a, b] = skirtingRunFootprints(
			[
				{ x: 0, z: 0 },
				{ x: 4, z: 0 },
				{ x: 4, z: 3 }
			],
			false,
			[
				{ side: 1, offset: 0.1 },
				{ side: -1, offset: 0.1 }
			],
			0.02
		);
		expect(a[1].x).toBeCloseTo(4, 9);
		expect(b[0].z).toBeCloseTo(0, 9);
		const room = skirtingRunFootprints(
			[
				{ x: 0, z: 0 },
				{ x: 4, z: 0 },
				{ x: 4, z: 3 },
				{ x: 0, z: 3 }
			],
			true,
			Array(4).fill({ side: 1, offset: 0.1 }),
			0.02
		);
		expect(room).toHaveLength(4);
		for (let i = 0; i < 4; i++) expect(room[i][1]).toEqual(room[(i + 1) % 4][0]);
	});
});

const FOUNDATION: FoundationDefinition = {
	id: 'f1',
	minGridX: 0,
	maxGridX: 10,
	minGridZ: 0,
	maxGridZ: 10,
	topY: 1,
	bottomY: -1
};

function run(overrides: Partial<SkirtingRunDefinition> = {}): SkirtingRunDefinition {
	return {
		id: 'run-1',
		foundationId: 'f1',
		levelIndex: 1,
		baseY: 3,
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 16, gridZ: 0 },
			{ gridX: 16, gridZ: 12 }
		],
		closed: false,
		segments: [
			{ side: 1, offset: 0.075 },
			{ side: 1, offset: 0.075 }
		],
		height: 0.1,
		depth: 0.02,
		...overrides
	};
}

describe('SkirtingRunManager', () => {
	function manager() {
		return new SkirtingRunManager({
			getFoundation: (id) => (id === 'f1' ? FOUNDATION : undefined),
			getVertexSpacing: () => 2,
			getBuildingGridSize: () => 0.25,
			materialManager: new BuildingMaterialManager()
		});
	}

	it('builds one mesh per run on its storey, pickable as the run', () => {
		const m = manager();
		expect(m.add(run())).toBe(true);
		const mesh = m.getMesh('run-1')!;
		m.group.updateMatrixWorld(true);
		const box = new THREE.Box3().setFromObject(mesh);
		expect(box.min.y).toBeCloseTo(1 + 3, 6);
		expect(box.max.y).toBeCloseTo(1 + 3.1, 6);
		expect(mesh.userData).toMatchObject({ foundationId: 'f1', skirtingRunId: 'run-1' });
		const positions = mesh.geometry.getAttribute('position').array;
		expect(Array.from(positions).every(Number.isFinite)).toBe(true);
		expect(resolveRemovalTarget(mesh.userData)).toEqual({
			type: 'skirting-run',
			skirtingRunId: 'run-1',
			foundationId: 'f1'
		});
		expect(resolvePaintTarget(mesh.userData)).toEqual({
			type: 'skirting-run',
			skirtingRunId: 'run-1',
			foundationId: 'f1'
		});
	});

	it('paints with shared cached materials and removes cleanly', () => {
		const m = manager();
		m.add(run());
		m.add(run({ id: 'run-2' }));
		const paint = { type: 'color' as const, color: '#FFFFFF' };
		m.setMaterial('run-1', paint);
		m.setMaterial('run-2', paint);
		expect(m.getMesh('run-1')!.material).toBe(m.getMesh('run-2')!.material);
		m.remove('run-1');
		m.removeForFoundation('f1');
		expect(m.getAll()).toEqual([]);
		expect(m.getMeshesForRaycast()).toEqual([]);
	});

	it('validates saved runs', () => {
		expect(validateSkirtingRun(run())).toBeNull();
		expect(validateSkirtingRun({ ...run(), segments: [] })).toMatch(/segment/);
		expect(
			validateSkirtingRun({
				...run(),
				points: [
					{ gridX: 0.5, gridZ: 0 },
					{ gridX: 1, gridZ: 0 }
				]
			})
		).toMatch(/grid/);
		expect(
			validateSkirtingRun({
				...run(),
				segments: [
					{ side: 2, offset: 0.1 },
					{ side: 1, offset: 0.1 }
				]
			})
		).toMatch(/segment/);
	});
});
