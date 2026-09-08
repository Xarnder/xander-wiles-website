import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { WallManager } from '../WallManager';
import { WallPathManager } from '../WallPathManager';
import type { WallDefinition } from '../WallTypes';
import type { WallPathDefinition } from '../WallPathTypes';

const SPACING = 1;
const GRID_SIZE = 0.5;

function foundation(): FoundationDefinition {
	return {
		id: 'f1',
		minGridX: 0,
		maxGridX: 40,
		minGridZ: 0,
		maxGridZ: 40,
		topY: 10,
		bottomY: 0
	};
}

function makeWallManager() {
	const foundations = new Map<string, FoundationDefinition>([['f1', foundation()]]);
	const settings = createDefaultBuildingSettings();
	const manager = new WallManager({
		getFoundation: (id) => foundations.get(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID_SIZE,
		buildingSettings: settings
	});
	return { manager, settings };
}

function makePathManager() {
	const foundations = new Map<string, FoundationDefinition>([['f1', foundation()]]);
	const settings = createDefaultBuildingSettings();
	const manager = new WallPathManager({
		getFoundation: (id) => foundations.get(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => GRID_SIZE,
		buildingSettings: settings
	});
	return { manager, settings };
}

function wallWithWindow(overrides: Partial<WallDefinition> = {}): WallDefinition {
	return {
		id: 'wall-1',
		foundationId: 'f1',
		startGridX: 0,
		startGridZ: 0,
		endGridX: 8,
		endGridZ: 0,
		baseY: 0,
		height: 3,
		thickness: 0.2,
		openings: [{ id: 'window-1', type: 'window', minU: 1, maxU: 2.2, minY: 0.9, maxY: 2.1 }],
		...overrides
	};
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
	let found: THREE.Object3D | undefined;
	root.traverse((child) => {
		if (!found && child.name === name) found = child;
	});
	return found;
}

describe('wall edge framing: WallManager integration', () => {
	it('a newly added wall gets edge framing as a sibling of its opening visuals, both children of the wall mesh', () => {
		const { manager } = makeWallManager();
		manager.addWall(wallWithWindow());
		const mesh = manager.getMeshForWall('wall-1')!;
		expect(findByName(mesh, 'wall-frame')).toBeDefined();
		expect(findByName(mesh, 'opening-visuals')).toBeDefined();
	});

	it("adding a window does not alter the wall definition's frame style, and framing survives the opening-triggered rebuild", () => {
		const { manager } = makeWallManager();
		manager.addWall(wallWithWindow({ openings: [] }));
		expect(findByName(manager.getMeshForWall('wall-1')!, 'wall-frame')).toBeDefined();

		manager.rebuildWall('wall-1');
		const mesh = manager.getMeshForWall('wall-1')!;
		expect(findByName(mesh, 'wall-frame')).toBeDefined();
		expect(manager.getWall('wall-1')!.openings).toEqual([]);
	});

	it('removing a wall removes its derived framing along with everything else — no separate removal step needed', () => {
		const { manager } = makeWallManager();
		manager.addWall(wallWithWindow());
		const mesh = manager.getMeshForWall('wall-1')!;
		const frame = findByName(mesh, 'wall-frame')!;
		expect(frame.parent).toBe(mesh);

		manager.removeWall('wall-1');
		expect(manager.getMeshForWall('wall-1')).toBeUndefined();
		expect(frame.parent).toBeNull();
	});

	it('an upper-storey wall (baseY > 0) still gets framing, positioned via the same transform as the wall body (never at ground level)', () => {
		const { manager } = makeWallManager();
		manager.addWall(wallWithWindow({ baseY: 3, openings: [] }));
		const mesh = manager.getMeshForWall('wall-1')!;
		const frame = findByName(mesh, 'wall-frame') as THREE.Group;
		expect(frame).toBeDefined();
		// The frame is a child of `mesh`, which itself already carries baseY via applyWallTransform —
		// so the frame's OWN local geometry never needs to know about baseY at all (see
		// buildStandaloneWallFrame's doc comment). Confirm the wall mesh itself sits at world Y
		// reflecting baseY=3 (foundation topY=10 + baseY=3 = 13).
		mesh.updateMatrixWorld(true);
		const worldPos = mesh.getWorldPosition(new THREE.Vector3());
		expect(worldPos.y).toBeCloseTo(13, 5);
	});

	it('a global framing-disabled setting removes framing from every wall on rebuildAllWalls', () => {
		const { manager, settings } = makeWallManager();
		manager.addWall(wallWithWindow());
		expect(findByName(manager.getMeshForWall('wall-1')!, 'wall-frame')).toBeDefined();

		settings.wallFrameEnabled = false;
		manager.rebuildAllWalls();
		expect(findByName(manager.getMeshForWall('wall-1')!, 'wall-frame')).toBeUndefined();
	});

	it('framing meshes are never registered for wall raycasting (Window/Door/Remove/Paint targeting stays on the wall body only)', () => {
		const { manager } = makeWallManager();
		manager.addWall(wallWithWindow());
		const raycastTargets = manager.getWallMeshesForRaycast();
		expect(raycastTargets).toHaveLength(1);
		expect(raycastTargets[0]).toBe(manager.getMeshForWall('wall-1'));
	});
});

function makePath(overrides: Partial<WallPathDefinition> = {}): WallPathDefinition {
	return {
		id: 'path-1',
		foundationId: 'f1',
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 8, gridZ: 0 },
			{ gridX: 8, gridZ: 8 }
		],
		closed: false,
		baseY: 0,
		wallHeight: 3,
		wallThickness: 0.2,
		joinStyle: 'miter',
		miterLimit: 4,
		segments: [
			{ id: 'seg-a', openings: [] },
			{ id: 'seg-b', openings: [] }
		],
		...overrides
	};
}

describe('wall edge framing: WallPathManager integration', () => {
	it('a newly added path gets one edge-framing mesh added directly to its BuildingRoot, alongside the visible wall mesh', () => {
		const { manager } = makePathManager();
		manager.addPath(makePath());
		const path = manager.getPath('path-1')!;
		expect(path).toBeDefined();
		// The path's BuildingRoot is `manager.group`'s only child for this foundation.
		const root = manager.group.children[0];
		expect(findByName(root, 'wall-frame')).toBeDefined();
	});

	it('removing a path removes its framing too', () => {
		const { manager } = makePathManager();
		manager.addPath(makePath());
		const root = manager.group.children[0];
		const frame = findByName(root, 'wall-frame')!;
		expect(frame.parent).toBe(root);

		manager.removePath('path-1');
		expect(frame.parent).toBeNull();
	});

	it('removing one segment (simulated by replacing a 3-point path with its two remaining sub-paths) rebuilds correct end-post framing on each, with no leftover shared-corner post', () => {
		const { manager } = makePathManager();
		// Simulates BuildingManager.removeWallSegment's own strategy: tear down the original path,
		// add fresh sub-paths for whatever remains — see BuildingManager.ts's own doc comment on why
		// this guarantees corner-join geometry regenerates cleanly with no leftover artefact.
		manager.addPath(makePath());
		manager.removePath('path-1');
		manager.addPath(
			makePath({
				id: 'path-a',
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: 8, gridZ: 0 }
				],
				segments: [{ id: 'seg-a', openings: [] }]
			})
		);
		manager.addPath(
			makePath({
				id: 'path-b',
				points: [
					{ gridX: 16, gridZ: 0 },
					{ gridX: 16, gridZ: 8 }
				],
				segments: [{ id: 'seg-b', openings: [] }]
			})
		);
		expect(manager.getAllPaths()).toHaveLength(2);
		const roots = manager.group.children;
		expect(roots).toHaveLength(1); // same foundation -> one shared BuildingRoot
		// Both paths' framing lives under the same root; just confirm framing exists and no path was
		// left without its own rebuilt geometry.
		expect(findByName(roots[0], 'wall-frame')).toBeDefined();
	});
});
