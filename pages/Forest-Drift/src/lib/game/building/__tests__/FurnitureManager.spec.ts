import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FurnitureManager, MAX_ACTIVE_TORCH_LIGHTS } from '../FurnitureManager';
import type { FurnitureDefinition } from '../FurnitureTypes';

function torch(id: string, x = 0, z = 0): FurnitureDefinition {
	return {
		id,
		kind: 'torch',
		foundationId: null,
		x,
		y: 1,
		z,
		nx: 0,
		ny: 1,
		nz: 0
	};
}

describe('FurnitureManager', () => {
	it('instances every torch on two shared meshes', () => {
		const manager = new FurnitureManager();
		manager.add(torch('a'));
		manager.add(torch('b', 2, 0));

		expect(manager.getPickMesh()).toBeInstanceOf(THREE.InstancedMesh);
		expect(manager.getPickMesh().count).toBe(2);
		expect(manager.idAtInstance(0)).toBe('a');
		expect(manager.idAtInstance(1)).toBe('b');
		expect(manager.getAll()).toHaveLength(2);
		manager.dispose();
	});

	it('keeps a fixed PointLight pool instead of one light per torch', () => {
		const manager = new FurnitureManager();
		const lights = manager.group.children.filter((child) => child instanceof THREE.PointLight);
		expect(lights).toHaveLength(MAX_ACTIVE_TORCH_LIGHTS);

		for (let i = 0; i < 12; i++) manager.add(torch(`t-${i}`, i * 2, 0));
		expect(manager.group.children.filter((child) => child instanceof THREE.PointLight)).toHaveLength(
			MAX_ACTIVE_TORCH_LIGHTS
		);

		const camera = new THREE.Vector3(0, 1, 0);
		manager.updateLights(camera, 0.5);
		const lit = lights.filter((light) => light.visible);
		expect(lit).toHaveLength(MAX_ACTIVE_TORCH_LIGHTS);
		expect(lit.every((light) => !light.castShadow)).toBe(true);
		manager.dispose();
	});

	it('grows instance capacity without adding draw calls', () => {
		const manager = new FurnitureManager();
		for (let i = 0; i < 40; i++) manager.add(torch(`t-${i}`, i, 0));
		expect(manager.getPickMesh().count).toBe(40);
		expect(manager.getAll()).toHaveLength(40);
		manager.dispose();
	});

	it('removes items attached to a demolished foundation and leaves terrain items', () => {
		const manager = new FurnitureManager();
		manager.add({ ...torch('on-pad'), foundationId: 'foundation-1' });
		manager.add(torch('on-ground', 3, 0));
		manager.removeForFoundation('foundation-1');
		expect(manager.getAll().map((item) => item.id)).toEqual(['on-ground']);
		manager.dispose();
	});
});
