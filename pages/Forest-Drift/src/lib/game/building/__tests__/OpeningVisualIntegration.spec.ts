import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { WallManager } from '../WallManager';
import type { WallDefinition } from '../WallTypes';

const SPACING = 1;

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

function makeManager() {
	const foundations = new Map<string, FoundationDefinition>([['f1', foundation()]]);
	const settings = createDefaultBuildingSettings();
	const manager = new WallManager({
		getFoundation: (id) => foundations.get(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => 0.5,
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

/** Finds the single opening-visuals group added as a child of a wall's own mesh — see WallManager.rebuildOpeningVisuals. */
function openingVisualsOf(mesh: THREE.Object3D): THREE.Group {
	const group = mesh.children.find((child) => child.name === 'opening-visuals');
	expect(group).toBeDefined();
	return group as THREE.Group;
}

/** Finds a named object anywhere in a subtree (frame/glass/leaf meshes sit a level or two below the per-opening group). */
function findByName(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
	let found: THREE.Object3D | undefined;
	root.traverse((child) => {
		if (!found && child.name === name) found = child;
	});
	return found;
}

/** The world-space CENTRE of a mesh's own geometry (never its `.position`, which every piece here leaves at the origin — offsets are baked into the geometry itself via `geometry.translate`, exactly like `WallGeometryBuilder.buildWallGeometry`'s own solid segments). Requires `updateWorldMatrix` to have already been called on the mesh (or an ancestor). */
function worldCenterOf(mesh: THREE.Mesh): THREE.Vector3 {
	mesh.geometry.computeBoundingBox();
	const center = new THREE.Vector3();
	mesh.geometry.boundingBox!.getCenter(center);
	return mesh.localToWorld(center);
}

describe('opening visuals: wall integration', () => {
	it('a straight wall with a window gets a matching frame + glass, parented under the wall mesh', () => {
		const { manager } = makeManager();
		manager.addWall(wallWithWindow());
		const mesh = manager.getMeshForWall('wall-1')!;
		const group = openingVisualsOf(mesh);
		expect(group.children.length).toBeGreaterThan(0);
		const names = group.children.flatMap((c) => [c.name, ...c.children.map((cc) => cc.name)]);
		expect(names).toContain('window-frame');
		expect(names).toContain('window-glass');
	});

	it('a door opening gets a frame + leaf under a hinge pivot, and no bottom crosspiece', () => {
		const { manager } = makeManager();
		manager.addWall(
			wallWithWindow({
				openings: [{ id: 'door-1', type: 'door', minU: 1, maxU: 2, minY: 0, maxY: 2.1 }]
			})
		);
		const mesh = manager.getMeshForWall('wall-1')!;
		const group = openingVisualsOf(mesh);
		const hingePivot = manager.getDoorHingePivot('door-1');
		expect(hingePivot).toBeDefined();
		expect(hingePivot!.children.some((c) => c.name === 'door-leaf')).toBe(true);
		const frameMesh = group.children
			.flatMap((c) => c.children.concat(c))
			.find((c) => c.name === 'door-frame') as THREE.Mesh | undefined;
		expect(frameMesh).toBeDefined();
		// 3 jambs merged = at most 3 boxes' worth of triangles (36), never a 4th bottom piece's worth.
		const triangleCount =
			(frameMesh!.geometry.index?.count ?? frameMesh!.geometry.attributes.position.count) / 3;
		expect(triangleCount).toBeLessThanOrEqual(36);
	});

	it('wall thickness changes the frame/glass depth, never exceeding it', () => {
		const { manager } = makeManager();
		manager.addWall(wallWithWindow({ thickness: 0.05 }));
		const mesh = manager.getMeshForWall('wall-1')!;
		const group = openingVisualsOf(mesh);
		const frameMesh = findByName(group, 'window-frame') as THREE.Mesh;
		frameMesh.geometry.computeBoundingBox();
		const depth = frameMesh.geometry.boundingBox!.max.z - frameMesh.geometry.boundingBox!.min.z;
		expect(depth).toBeLessThanOrEqual(0.05 + 1e-6);
	});

	it('an upper-floor wall (baseY > 0) places its opening visuals at the correct foundation-local elevation via the wall mesh transform', () => {
		const { manager } = makeManager();
		manager.addWall(wallWithWindow({ baseY: 6 }));
		const mesh = manager.getMeshForWall('wall-1')!;
		// The wall mesh itself carries baseY in its own world-space Y (applyWallTransform); the
		// opening-visual group is a child positioned in the SAME local frame, so its world Y should
		// land at foundation.topY (10) + baseY (6) + opening.minY (0.9) once matrices are updated.
		mesh.updateWorldMatrix(true, true);
		const group = openingVisualsOf(mesh);
		const glassMesh = findByName(group, 'window-glass') as THREE.Mesh;
		const worldCenter = worldCenterOf(glassMesh);
		expect(worldCenter.y).toBeGreaterThan(10 + 6);
		expect(worldCenter.y).toBeLessThan(10 + 6 + 3);
	});

	it('a diagonal wall still places its opening visual correctly (no special-casing on wall orientation)', () => {
		const { manager } = makeManager();
		manager.addWall(wallWithWindow({ endGridX: 8, endGridZ: 8 })); // 45-degree diagonal
		const mesh = manager.getMeshForWall('wall-1')!;
		mesh.updateWorldMatrix(true, true);
		const group = openingVisualsOf(mesh);
		const glassMesh = findByName(group, 'window-glass') as THREE.Mesh;
		const worldCenter = worldCenterOf(glassMesh);
		// Somewhere strictly between the wall's two diagonal endpoints in both X and Z — proof the
		// world position was actually derived from the wall's real heading, not assumed axis-aligned.
		expect(worldCenter.x).toBeGreaterThan(0);
		expect(worldCenter.z).toBeGreaterThan(0);
	});

	it('removing a wall disposes its opening visuals and their hinge-pivot lookup entry', () => {
		const { manager } = makeManager();
		manager.addWall(
			wallWithWindow({
				openings: [{ id: 'door-1', type: 'door', minU: 1, maxU: 2, minY: 0, maxY: 2.1 }]
			})
		);
		expect(manager.getDoorHingePivot('door-1')).toBeDefined();
		manager.removeWall('wall-1');
		expect(manager.getMeshForWall('wall-1')).toBeUndefined();
		expect(manager.getDoorHingePivot('door-1')).toBeUndefined();
	});

	it('rebuilding a wall after removing its opening removes the derived visual, restoring an empty group', () => {
		const { manager } = makeManager();
		const wall = wallWithWindow();
		manager.addWall(wall);
		const mesh = manager.getMeshForWall('wall-1')!;
		expect(openingVisualsOf(mesh).children.length).toBeGreaterThan(0);

		manager.addWall({ ...wall, openings: [] });
		const rebuiltMesh = manager.getMeshForWall('wall-1')!;
		expect(openingVisualsOf(rebuiltMesh).children.length).toBe(0);
	});

	it('disabling frames/glass in settings suppresses the visual entirely', () => {
		const { manager, settings } = makeManager();
		settings.windowFramesEnabled = false;
		settings.windowGlassEnabled = false;
		manager.addWall(wallWithWindow());
		const mesh = manager.getMeshForWall('wall-1')!;
		const group = openingVisualsOf(mesh);
		expect(group.children.length).toBe(0);
	});
});
