import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { FoundationDefinition } from '../FoundationTypes';
import { WallPathManager } from '../WallPathManager';
import type { WallPathDefinition } from '../WallPathTypes';

const SPACING = 2;
const BUILDING_GRID_SIZE = 0.25;
const WALL_HEIGHT = 3;

const foundation: FoundationDefinition = {
	id: 'f1',
	minGridX: 0,
	maxGridX: 5,
	minGridZ: 0,
	maxGridZ: 5,
	topY: 10,
	bottomY: 2
};

function makeManager(): WallPathManager {
	return new WallPathManager({
		getFoundation: (id) => (id === foundation.id ? foundation : undefined),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => BUILDING_GRID_SIZE
	});
}

/** A straight two-point path along +X, at `baseY` above the foundation top. */
function makePath(baseY: number): WallPathDefinition {
	return {
		id: `path-${baseY}`,
		foundationId: foundation.id,
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 20, gridZ: 0 }
		],
		closed: false,
		baseY,
		wallHeight: WALL_HEIGHT,
		wallThickness: 0.15,
		joinStyle: 'miter',
		miterLimit: 4,
		segments: [{ id: `segment-${baseY}`, openings: [] }]
	};
}

/** A straight three-point (two-segment) path along +X then +Z, for per-segment material tests. */
function makeTwoSegmentPath(): WallPathDefinition {
	return {
		id: 'two-segment-path',
		foundationId: foundation.id,
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 20, gridZ: 0 },
			{ gridX: 20, gridZ: 20 }
		],
		closed: false,
		baseY: 0,
		wallHeight: WALL_HEIGHT,
		wallThickness: 0.15,
		joinStyle: 'miter',
		miterLimit: 4,
		segments: [
			{ id: 'seg-a', openings: [] },
			{ id: 'seg-b', openings: [] }
		]
	};
}

/** World-space Y extent of a picking mesh, matrices forced up to date (nothing renders in vitest). */
function pickingMeshWorldYRange(manager: WallPathManager): { min: number; max: number } {
	manager.group.updateMatrixWorld(true);
	const meshes = manager.getPickingMeshesForRaycast();
	expect(meshes).toHaveLength(1);
	const mesh = meshes[0] as THREE.Mesh;
	const box = new THREE.Box3().setFromObject(mesh);
	return { min: box.min.y, max: box.max.y };
}

describe('WallPathManager picking meshes', () => {
	it('puts a ground-floor path’s raycast target at the foundation top', () => {
		const manager = makeManager();
		manager.addPath(makePath(0));

		const { min, max } = pickingMeshWorldYRange(manager);
		expect(min).toBeCloseTo(foundation.topY, 5);
		expect(max).toBeCloseTo(foundation.topY + WALL_HEIGHT, 5);
	});

	it('regression: lifts an upper-storey path’s raycast target to its own baseY — it used to stay at local Y 0, a whole storey below the wall you could see, so Window/Door found nothing where the wall was and found it by aiming at the ground floor instead', () => {
		const manager = makeManager();
		manager.addPath(makePath(WALL_HEIGHT)); // first floor

		const { min, max } = pickingMeshWorldYRange(manager);
		expect(min).toBeCloseTo(foundation.topY + WALL_HEIGHT, 5);
		expect(max).toBeCloseTo(foundation.topY + WALL_HEIGHT * 2, 5);
	});

	it('keeps the raycast target aligned with the segment view’s own baseY at any storey', () => {
		for (const level of [0, 1, 2, 3]) {
			const manager = makeManager();
			const baseY = WALL_HEIGHT * level;
			manager.addPath(makePath(baseY));

			const view = manager.getSegmentAsWallView(`segment-${baseY}`);
			expect(view?.baseY).toBe(baseY);

			const { min } = pickingMeshWorldYRange(manager);
			expect(min).toBeCloseTo(foundation.topY + baseY, 5);
		}
	});
});

describe('WallPathManager per-segment material', () => {
	it('regression: getSegmentAsWallView surfaces the segment’s own material — it used to silently drop it, so a painted segment read back as unpainted through the unified getWall()-style accessor', () => {
		const manager = makeManager();
		const path = makeTwoSegmentPath();
		path.segments[0].material = { type: 'color', color: '#C1443C' };
		manager.addPath(path);

		expect(manager.getSegmentAsWallView('seg-a')?.material).toEqual({
			type: 'color',
			color: '#C1443C'
		});
		expect(manager.getSegmentAsWallView('seg-b')?.material).toBeUndefined();
	});

	it('gives each segment its own material GROUP on the merged visible mesh, so painting one never touches another', () => {
		const manager = makeManager();
		const path = makeTwoSegmentPath();
		path.segments[0].material = { type: 'color', color: '#C1443C' };
		manager.addPath(path);

		const resolvedA = manager.getVisibleMeshAndGroupIndices('seg-a');
		const resolvedB = manager.getVisibleMeshAndGroupIndices('seg-b');
		expect(resolvedA).toBeDefined();
		expect(resolvedB).toBeDefined();
		// Same merged mesh...
		expect(resolvedA!.mesh).toBe(resolvedB!.mesh);
		// ...but disjoint group indices, and each group's actual material differs, matching each
		// segment's own (possibly absent) paint.
		expect(resolvedA!.groupIndices.length).toBeGreaterThan(0);
		expect(resolvedB!.groupIndices.length).toBeGreaterThan(0);
		for (const indexA of resolvedA!.groupIndices) {
			expect(resolvedB!.groupIndices).not.toContain(indexA);
		}
		const materials = resolvedA!.mesh.material as THREE.Material[];
		const materialA = materials[resolvedA!.groupIndices[0]];
		const materialB = materials[resolvedB!.groupIndices[0]];
		expect(materialA).not.toBe(materialB);
	});

	it('returns undefined from getVisibleMeshAndGroupIndices for an unknown segment id', () => {
		const manager = makeManager();
		expect(manager.getVisibleMeshAndGroupIndices('missing')).toBeUndefined();
	});
});
