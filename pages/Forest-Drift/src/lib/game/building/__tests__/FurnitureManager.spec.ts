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
		expect(
			manager.group.children.filter((child) => child instanceof THREE.PointLight)
		).toHaveLength(MAX_ACTIVE_TORCH_LIGHTS);

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

	function chair(id: string, x = 0, z = 0): FurnitureDefinition {
		return {
			id,
			kind: 'chair',
			foundationId: null,
			x,
			y: 0,
			z,
			nx: 0,
			ny: 1,
			nz: 0,
			rotationY: 0,
			dimensions: { width: 0.5, depth: 0.5, height: 0.9 }
		};
	}

	it('does not instance non-torch furniture on the torch meshes', () => {
		const manager = new FurnitureManager();
		manager.add(torch('t'));
		manager.add(chair('c', 2, 0));
		expect(manager.getPickMesh().count).toBe(1);
		expect(manager.idAtInstance(0)).toBe('t');
		expect(manager.getAll()).toHaveLength(2);
		expect(manager.idFromObject(manager.getPickMeshes().find((obj) => obj !== manager.getPickMesh())!)).toBe(
			'c'
		);
		expect(manager.getCollisionRects()).toHaveLength(1);
		manager.dispose();
	});

	it('round-trips mixed furniture definitions without geometry', () => {
		const manager = new FurnitureManager();
		const items: FurnitureDefinition[] = [
			{
				id: 'bed-1',
				kind: 'bed',
				foundationId: null,
				x: 1,
				y: 2,
				z: 3,
				nx: 0,
				ny: 1,
				nz: 0,
				rotationY: Math.PI / 2,
				dimensions: { width: 1.4, depth: 2, height: 0.55 },
				material: { type: 'color', color: '#8B5A2B' },
				secondaryMaterial: { type: 'color', color: '#E8DCC8' },
				parameters: { headboard: false }
			},
			{
				id: 'chair-1',
				kind: 'chair',
				foundationId: null,
				x: 4,
				y: 2,
				z: 3,
				nx: 0,
				ny: 1,
				nz: 0,
				dimensions: { width: 0.5, depth: 0.5, height: 0.9 }
			},
			{
				id: 'counter-1',
				kind: 'kitchen-counter',
				foundationId: null,
				x: 6,
				y: 2,
				z: 3,
				nx: 0,
				ny: 1,
				nz: 0,
				dimensions: { width: 2, depth: 0.6, height: 0.9 }
			},
			{
				id: 'barrel-1',
				kind: 'barrel',
				foundationId: null,
				x: 8,
				y: 2,
				z: 3,
				nx: 0,
				ny: 1,
				nz: 0,
				dimensions: { width: 0.55, depth: 0.55, height: 0.75 }
			},
			{
				id: 'chest-1',
				kind: 'chest',
				foundationId: null,
				x: 10,
				y: 2,
				z: 3,
				nx: 0,
				ny: 1,
				nz: 0,
				dimensions: { width: 0.8, depth: 0.45, height: 0.5 }
			},
			{
				id: 'lantern-1',
				kind: 'lantern',
				foundationId: null,
				x: 12,
				y: 2,
				z: 3,
				nx: 0,
				ny: 1,
				nz: 0,
				dimensions: { width: 0.18, depth: 0.18, height: 0.38 }
			}
		];
		manager.load(items);
		expect(manager.serialize()).toEqual(items);
		const clone = new FurnitureManager();
		clone.load(manager.serialize());
		expect(clone.serialize()).toEqual(items);
		manager.dispose();
		clone.dispose();
	});

	it('removes the whole logical object when any generated part is targeted', () => {
		const manager = new FurnitureManager();
		manager.add(chair('table-stand-in', 0, 0));
		const group = manager.getPickMeshes().find((obj) => obj !== manager.getPickMesh());
		expect(group).toBeDefined();
		const child = group!.children[0];
		expect(manager.idFromObject(child)).toBe('table-stand-in');
		manager.remove('table-stand-in');
		expect(manager.getAll()).toHaveLength(0);
		expect(manager.getCollisionRects()).toHaveLength(0);
		manager.dispose();
	});
});
