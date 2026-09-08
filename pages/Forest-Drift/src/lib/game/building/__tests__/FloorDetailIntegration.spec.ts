import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FloorDetailManager } from '../FloorDetailManager';
import type { FoundationDefinition } from '../FoundationTypes';
import type { FloorDetailDefinition } from '../FloorDetailTypes';

const SPACING = 2;

function foundation(): FoundationDefinition {
	return {
		id: 'f1',
		minGridX: 0,
		maxGridX: 20,
		minGridZ: 0,
		maxGridZ: 20,
		topY: 10,
		bottomY: 0
	};
}

function planks(): FloorDetailDefinition {
	return {
		id: 'detail-1',
		foundationId: 'f1',
		levelIndex: 0,
		kind: 'planks',
		hostY: 0,
		renderMode: '3d',
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 8, gridZ: 0 },
			{ gridX: 8, gridZ: 8 },
			{ gridX: 0, gridZ: 8 }
		],
		colors: ['#8B5A2B', '#C4A574'],
		plankWidth: 0.2,
		plankDirection: 'x',
		tileSize: 0.4,
		tilePattern: 'checker',
		pathWidth: 1,
		pathFraming: true
	};
}

describe('FloorDetailManager integration', () => {
	it('builds a pickable mesh with floorDetailId and no collision API', () => {
		const foundations = new Map<string, FoundationDefinition>([['f1', foundation()]]);
		const manager = new FloorDetailManager({
			getFoundation: (id) => foundations.get(id),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => 0.25
		});
		manager.addFloorDetail(planks());

		const meshes = manager.getMeshesForRaycast();
		expect(meshes).toHaveLength(1);
		expect(meshes[0].userData.floorDetailId).toBe('detail-1');
		expect(meshes[0].userData.foundationId).toBe('f1');
		const mesh = meshes[0] as THREE.Mesh;
		expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
		expect((mesh.material as THREE.MeshStandardMaterial).polygonOffset).toBe(true);
		expect('getAllCollisionRects' in manager).toBe(false);
	});

	it('removes the mesh when the detail is deleted', () => {
		const foundations = new Map<string, FoundationDefinition>([['f1', foundation()]]);
		const manager = new FloorDetailManager({
			getFoundation: (id) => foundations.get(id),
			getVertexSpacing: () => SPACING,
			getBuildingGridSize: () => 0.25
		});
		manager.addFloorDetail(planks());
		expect(manager.removeFloorDetail('detail-1')).toBe(true);
		expect(manager.getMeshesForRaycast()).toHaveLength(0);
	});
});
