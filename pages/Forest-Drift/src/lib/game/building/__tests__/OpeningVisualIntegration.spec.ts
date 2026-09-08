import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { hingeSideForOpening } from '../openingVisualMath';
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
	it('window glass stays a single pane while the frame includes a four-pane centre cross', () => {
		const { manager } = makeManager();
		manager.addWall(wallWithWindow());
		const mesh = manager.getMeshForWall('wall-1')!;
		const group = openingVisualsOf(mesh);
		const frameMesh = findByName(group, 'window-frame') as THREE.Mesh;
		const glassMesh = findByName(group, 'window-glass') as THREE.Mesh;
		expect(frameMesh).toBeDefined();
		expect(glassMesh).toBeDefined();
		// One BoxGeometry is 24 unique-per-face vertices; four glass panes would be 96.
		expect(glassMesh.geometry.getAttribute('position').count).toBe(24);
		// Outer frame (4) + mullion + transom = 6 boxes.
		expect(frameMesh.geometry.getAttribute('position').count).toBe(6 * 24);
		const framePts = frameMesh.geometry.getAttribute('position');
		const opening = wallWithWindow().openings[0];
		const midU = (opening.minU + opening.maxU) / 2;
		const midY = (opening.minY + opening.maxY) / 2;
		let nearMullion = 0;
		let nearTransom = 0;
		for (let i = 0; i < framePts.count; i++) {
			if (Math.abs(framePts.getX(i) - midU) < 0.05) nearMullion++;
			if (Math.abs(framePts.getY(i) - midY) < 0.05) nearTransom++;
		}
		expect(nearMullion).toBeGreaterThan(0);
		expect(nearTransom).toBeGreaterThan(0);
	});

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
		expect(hingePivot!.children.some((c) => c.name === 'door-handles')).toBe(true);
		const frameMesh = group.children
			.flatMap((c) => c.children.concat(c))
			.find((c) => c.name === 'door-frame') as THREE.Mesh | undefined;
		expect(frameMesh).toBeDefined();
		// 3 jambs merged = at most 3 boxes' worth of triangles (36), never a 4th bottom piece's worth.
		const triangleCount =
			(frameMesh!.geometry.index?.count ?? frameMesh!.geometry.attributes.position.count) / 3;
		expect(triangleCount).toBeLessThanOrEqual(36);
	});

	it('puts a handle on both door faces, on the latch side for left- and right-hinged leaves', () => {
		const { manager } = makeManager();
		const leftId = 'door-left-handle';
		const rightId = 'door-right-handle';
		// Stable hash: pick ids that actually resolve to each hinge side.
		const ids = Array.from({ length: 40 }, (_, i) => `door-h-${i}`);
		const left = ids.find((id) => hingeSideForOpening(id) === 'left') ?? leftId;
		const right = ids.find((id) => hingeSideForOpening(id) === 'right') ?? rightId;
		manager.addWall(
			wallWithWindow({
				openings: [
					{ id: left, type: 'door', minU: 0.5, maxU: 1.5, minY: 0, maxY: 2.1 },
					{ id: right, type: 'door', minU: 2.5, maxU: 3.5, minY: 0, maxY: 2.1 }
				]
			})
		);
		for (const [id, side] of [
			[left, 'left'],
			[right, 'right']
		] as const) {
			const pivot = manager.getDoorHingePivot(id)!;
			const handles = pivot.children.find((c) => c.name === 'door-handles') as THREE.Mesh;
			expect(handles).toBeDefined();
			const pos = handles.geometry.getAttribute('position');
			let minX = Infinity;
			let maxX = -Infinity;
			let maxZ = -Infinity;
			let minZ = Infinity;
			for (let i = 0; i < pos.count; i++) {
				minX = Math.min(minX, pos.getX(i));
				maxX = Math.max(maxX, pos.getX(i));
				minZ = Math.min(minZ, pos.getZ(i));
				maxZ = Math.max(maxZ, pos.getZ(i));
			}
			const leafWidth = pivot.userData.leafWidth as number;
			const doorThickness = pivot.userData.doorThickness as number;
			if (side === 'left') {
				expect(minX).toBeGreaterThan(leafWidth * 0.5);
			} else {
				expect(maxX).toBeLessThan(-leafWidth * 0.5);
			}
			expect(maxZ).toBeGreaterThan(doorThickness / 2);
			expect(minZ).toBeLessThan(-doorThickness / 2);
		}
	});

	it('window and door frames are thicker than the wall and extrude past both faces', () => {
		const { manager } = makeManager();
		const wallThickness = 0.05;
		manager.addWall(
			wallWithWindow({
				thickness: wallThickness,
				openings: [
					{ id: 'window-1', type: 'window', minU: 1, maxU: 2.2, minY: 0.9, maxY: 2.1 },
					{ id: 'door-1', type: 'door', minU: 3, maxU: 4, minY: 0, maxY: 2.1 }
				]
			})
		);
		const mesh = manager.getMeshForWall('wall-1')!;
		const group = openingVisualsOf(mesh);
		for (const name of ['window-frame', 'door-frame'] as const) {
			const frameMesh = findByName(group, name) as THREE.Mesh;
			expect(frameMesh).toBeDefined();
			frameMesh.geometry.computeBoundingBox();
			const depth =
				frameMesh.geometry.boundingBox!.max.z - frameMesh.geometry.boundingBox!.min.z;
			expect(depth).toBeGreaterThan(wallThickness);
		}
		const glassMesh = findByName(group, 'window-glass') as THREE.Mesh;
		glassMesh.geometry.computeBoundingBox();
		const glassDepth =
			glassMesh.geometry.boundingBox!.max.z - glassMesh.geometry.boundingBox!.min.z;
		expect(glassDepth).toBeLessThanOrEqual(wallThickness + 1e-6);
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

	it('colours the window frame from the opening material', () => {
		const { manager } = makeManager();
		manager.addWall(
			wallWithWindow({
				openings: [
					{
						id: 'window-1',
						type: 'window',
						minU: 1,
						maxU: 2.2,
						minY: 0.9,
						maxY: 2.1,
						material: { type: 'color', color: '#FF3366' }
					}
				]
			})
		);
		const frame = findByName(openingVisualsOf(manager.getMeshForWall('wall-1')!), 'window-frame') as
			| THREE.Mesh
			| undefined;
		expect(frame).toBeDefined();
		const material = frame!.material as THREE.MeshStandardMaterial;
		expect(material.color.getHexString().toUpperCase()).toBe('FF3366');
	});

	it('colours the door leaf from the opening material', () => {
		const { manager } = makeManager();
		manager.addWall(
			wallWithWindow({
				openings: [
					{
						id: 'door-1',
						type: 'door',
						minU: 1,
						maxU: 2,
						minY: 0,
						maxY: 2.1,
						material: { type: 'color', color: '#00AACC' }
					}
				]
			})
		);
		const leaf = findByName(openingVisualsOf(manager.getMeshForWall('wall-1')!), 'door-leaf') as
			| THREE.Mesh
			| undefined;
		expect(leaf).toBeDefined();
		const material = leaf!.material as THREE.MeshStandardMaterial;
		expect(material.color.getHexString().toUpperCase()).toBe('00AACC');
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
