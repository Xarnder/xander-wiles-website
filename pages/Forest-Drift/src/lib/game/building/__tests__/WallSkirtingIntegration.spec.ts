import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingManager } from '../BuildingManager';
import { FoundationManager } from '../FoundationManager';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import type { FoundationDefinition } from '../FoundationTypes';
import { FloorDetailManager } from '../FloorDetailManager';
import { RoofManager } from '../RoofManager';
import { roomLidsFromSlabs } from '../skirtingMath';
import { SlabManager } from '../SlabManager';
import type { SlabDefinition } from '../SlabTypes';
import { StairManager } from '../StairManager';
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

function ceilingLid(): Pick<SlabDefinition, 'localY' | 'thickness' | 'points'> {
	return {
		localY: 3,
		thickness: 0.2,
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 8, gridZ: 0 },
			{ gridX: 8, gridZ: 8 },
			{ gridX: 0, gridZ: 8 }
		]
	};
}

function roomWall(id: string, startGridX: number, startGridZ: number, endGridX: number, endGridZ: number): WallDefinition {
	return {
		id,
		foundationId: 'f1',
		startGridX,
		startGridZ,
		endGridX,
		endGridZ,
		baseY: 0,
		height: 3,
		thickness: 0.2,
		openings: []
	};
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
	let found: THREE.Object3D | undefined;
	root.traverse((child) => {
		if (!found && child.name === name) found = child;
	});
	return found;
}

function countNamed(root: THREE.Object3D, name: string): number {
	let count = 0;
	root.traverse((child) => {
		if (child.name === name) count++;
	});
	return count;
}

function skirtingSolid(root: THREE.Object3D): THREE.Mesh | undefined {
	return findByName(root, 'wall-skirting-solid') as THREE.Mesh | undefined;
}

describe('interior skirting: WallManager', () => {
	it('skirts only the inside face of walls under a ceiling, never the exterior or an unroofed wall', () => {
		const lids = [ceilingLid()];
		const settings = createDefaultBuildingSettings();
		const manager = new WallManager({
			getFoundation: () => foundation(),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			buildingSettings: settings,
			getRoomLids: () => roomLidsFromSlabs(lids, GRID_SIZE)
		});

		manager.addWall(roomWall('south', 0, 0, 8, 0));
		manager.addWall(roomWall('east', 8, 0, 8, 8));
		manager.addWall(roomWall('north', 8, 8, 0, 8));
		manager.addWall(roomWall('west', 0, 8, 0, 0));
		manager.addWall(roomWall('outdoor', 0, 16, 8, 16));

		for (const id of ['south', 'east', 'north', 'west']) {
			const mesh = manager.getMeshForWall(id)!;
			expect(findByName(mesh, 'wall-skirting')).toBeDefined();
			const solid = skirtingSolid(mesh)!;
			solid.geometry.computeBoundingBox();
			// Room is drawn CCW, so interior is wall-local +Z on every side.
			expect(solid.geometry.boundingBox!.min.z).toBeGreaterThan(0);
		}
		expect(findByName(manager.getMeshForWall('outdoor')!, 'wall-skirting')).toBeUndefined();
	});

	it('cuts a floor-reaching door out of the board and leaves a window alone', () => {
		const lids = [ceilingLid()];
		const manager = new WallManager({
			getFoundation: () => foundation(),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			getRoomLids: () => roomLidsFromSlabs(lids, GRID_SIZE)
		});

		manager.addWall({
			...roomWall('south', 0, 0, 8, 0),
			openings: [
				{ id: 'door-1', type: 'door', minU: 1.2, maxU: 2.1, minY: 0, maxY: 2.1 },
				{ id: 'window-1', type: 'window', minU: 2.8, maxU: 3.6, minY: 0.9, maxY: 2.1 }
			]
		});

		const solid = skirtingSolid(manager.getMeshForWall('south')!)!;
		expect(solid).toBeDefined();
		// One door gap splits the strip into two boxes (24 verts each); a window must not add a third.
		const position = solid.geometry.getAttribute('position');
		expect(position.count).toBe(48);
	});

	it('uses its own light medium-brown timber, not the wall colour, including after the wall is painted', () => {
		const lids = [ceilingLid()];
		const manager = new WallManager({
			getFoundation: () => foundation(),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			getRoomLids: () => roomLidsFromSlabs(lids, GRID_SIZE)
		});
		manager.addWall(roomWall('south', 0, 0, 8, 0));
		const mesh = manager.getMeshForWall('south')!;
		const skirtingMaterial = skirtingSolid(mesh)!.material as THREE.MeshStandardMaterial;
		expect(skirtingMaterial).not.toBe(mesh.material);
		expect(skirtingMaterial.color.getHexString().toUpperCase()).toBe('C19A6B');

		manager.getWall('south')!.material = { type: 'color', color: '#3E6FA6' };
		manager.rebuildWall('south');
		const painted = manager.getMeshForWall('south')!;
		const paintedSkirting = skirtingSolid(painted)!.material as THREE.MeshStandardMaterial;
		expect(paintedSkirting).not.toBe(painted.material);
		expect(paintedSkirting.color.getHexString().toUpperCase()).toBe('C19A6B');
	});

	it('removes every board when the ceiling is gone', () => {
		const lids: Pick<SlabDefinition, 'localY' | 'thickness' | 'points'>[] = [ceilingLid()];
		const manager = new WallManager({
			getFoundation: () => foundation(),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			getRoomLids: () => roomLidsFromSlabs(lids, GRID_SIZE)
		});
		manager.addWall(roomWall('south', 0, 0, 8, 0));
		expect(findByName(manager.getMeshForWall('south')!, 'wall-skirting')).toBeDefined();

		lids.pop();
		manager.rebuildWallsForFoundation('f1');
		expect(findByName(manager.getMeshForWall('south')!, 'wall-skirting')).toBeUndefined();
	});
});

function closedRoomPath(): WallPathDefinition {
	return {
		id: 'path-1',
		foundationId: 'f1',
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 8, gridZ: 0 },
			{ gridX: 8, gridZ: 8 },
			{ gridX: 0, gridZ: 8 }
		],
		closed: true,
		baseY: 0,
		wallHeight: 3,
		wallThickness: 0.2,
		joinStyle: 'miter',
		miterLimit: 4,
		segments: [
			{ id: 'seg-s', openings: [] },
			{ id: 'seg-e', openings: [] },
			{ id: 'seg-n', openings: [] },
			{ id: 'seg-w', openings: [] }
		]
	};
}

describe('interior skirting: WallPathManager', () => {
	it('puts one interior board on each side of a closed room under a ceiling', () => {
		const lids = [ceilingLid()];
		const manager = new WallPathManager({
			getFoundation: () => foundation(),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			getRoomLids: () => roomLidsFromSlabs(lids, GRID_SIZE)
		});
		manager.addPath(closedRoomPath());

		const root = manager.group.children[0];
		expect(countNamed(root, 'wall-skirting')).toBe(4);
		root.traverse((child) => {
			if (child.name !== 'wall-skirting-solid' || !(child instanceof THREE.Mesh)) return;
			child.geometry.computeBoundingBox();
			expect(child.geometry.boundingBox!.min.z).toBeGreaterThan(0);
		});
	});

	it('drops path skirting when the lid is removed', () => {
		const lids: Pick<SlabDefinition, 'localY' | 'thickness' | 'points'>[] = [ceilingLid()];
		const manager = new WallPathManager({
			getFoundation: () => foundation(),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			getRoomLids: () => roomLidsFromSlabs(lids, GRID_SIZE)
		});
		manager.addPath(closedRoomPath());
		expect(countNamed(manager.group, 'wall-skirting')).toBe(4);

		lids.pop();
		manager.rebuildPathsForFoundation('f1');
		expect(countNamed(manager.group, 'wall-skirting')).toBe(0);
	});
});

describe('interior skirting: BuildingManager add/remove ceiling', () => {
	it('rebuilds boards when a ceiling is placed or removed over existing walls', () => {
		const foundationManager = new FoundationManager(() => SPACING);
		foundationManager.addFoundation({
			id: 'foundation-a',
			minGridX: 0,
			maxGridX: 40,
			minGridZ: 0,
			maxGridZ: 40,
			topY: 10,
			bottomY: 0
		});
		let slabManager!: SlabManager;
		const getRoomLids = (foundationId: string) =>
			roomLidsFromSlabs(slabManager.getSlabsForFoundation(foundationId), GRID_SIZE);
		const wallManager = new WallManager({
			getFoundation: (id) => foundationManager.getFoundation(id),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			getRoomLids
		});
		const wallPathManager = new WallPathManager({
			getFoundation: (id) => foundationManager.getFoundation(id),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			getRoomLids
		});
		slabManager = new SlabManager({
			getFoundation: (id) => foundationManager.getFoundation(id),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE
		});
		const buildingManager = new BuildingManager({
			foundationManager,
			wallManager,
			wallPathManager,
			slabManager,
			stairManager: new StairManager({
				getFoundation: (id) => foundationManager.getFoundation(id),
				getVertexSpacing: () => SPACING
			}),
			roofManager: new RoofManager({
				getFoundation: (id) => foundationManager.getFoundation(id),
				getVertexSpacing: () => SPACING,
				getBuildingGridSize: () => GRID_SIZE
			}),
			floorDetailManager: new FloorDetailManager({
				getFoundation: (id) => foundationManager.getFoundation(id),
				getVertexSpacing: () => SPACING,
				getBuildingGridSize: () => GRID_SIZE
			}),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => GRID_SIZE,
			getCornerOpeningMargin: () => 0.15
		});

		const point = (gridX: number, gridZ: number) => ({
			foundationId: 'foundation-a',
			gridX,
			gridZ
		});
		const south = buildingManager.addWall({
			start: point(0, 0),
			end: point(8, 0),
			baseY: 0,
			height: 3,
			thickness: 0.2,
			minimumWallLength: 0.25
		}).value!;
		buildingManager.addWall({
			start: point(16, 0),
			end: point(24, 0),
			baseY: 0,
			height: 3,
			thickness: 0.2,
			minimumWallLength: 0.25
		});

		expect(findByName(wallManager.getMeshForWall(south.id)!, 'wall-skirting')).toBeUndefined();

		const ceiling = buildingManager.addSlab({
			points: [point(0, 0), point(8, 0), point(8, 8), point(0, 8)],
			type: 'ceiling',
			levelIndex: 0,
			localY: 3,
			thickness: 0.2
		}).value!;

		expect(findByName(wallManager.getMeshForWall(south.id)!, 'wall-skirting')).toBeDefined();
		const outdoorId = wallManager.getAllWalls().find((wall) => wall.id !== south.id)!.id;
		expect(findByName(wallManager.getMeshForWall(outdoorId)!, 'wall-skirting')).toBeUndefined();

		buildingManager.removeSlab(ceiling.id);
		expect(findByName(wallManager.getMeshForWall(south.id)!, 'wall-skirting')).toBeUndefined();
	});
});
