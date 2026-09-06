import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BuildingMaterialManager } from '../BuildingMaterialManager';

/** getMaterial() returns the base THREE.Material type (all callers just assign it to `mesh.material`) — narrow it here since only this test cares about reading `.color` back. */
function asStandard(material: THREE.Material): THREE.MeshStandardMaterial {
	return material as THREE.MeshStandardMaterial;
}

describe('BuildingMaterialManager.getMaterial', () => {
	it('returns the SAME material instance for the same (kind, colour) pair — never allocates twice', () => {
		const manager = new BuildingMaterialManager();
		const a = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		const b = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		expect(a).toBe(b);
	});

	it('treats differently-cased/shorthand colours that normalize to the same hex as the same cache entry', () => {
		const manager = new BuildingMaterialManager();
		const a = manager.getMaterial('wall', { type: 'color', color: '#d9d1c3' });
		const b = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		expect(a).toBe(b);
	});

	it('returns different instances for different colours', () => {
		const manager = new BuildingMaterialManager();
		const a = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		const b = manager.getMaterial('wall', { type: 'color', color: '#123456' });
		expect(a).not.toBe(b);
	});

	it('returns different instances for the same colour on different surface kinds — each kind keeps its own default look (roughness/metalness/flatShading)', () => {
		const manager = new BuildingMaterialManager();
		const wall = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		const foundation = manager.getMaterial('foundation', { type: 'color', color: '#D9D1C3' });
		expect(wall).not.toBe(foundation);
	});

	it('returns the SAME default (unpainted) material for repeated undefined lookups on the same kind', () => {
		const manager = new BuildingMaterialManager();
		const a = manager.getMaterial('wall', undefined);
		const b = manager.getMaterial('wall', undefined);
		expect(a).toBe(b);
	});

	it('the default (unpainted) material differs from any explicitly painted colour', () => {
		const manager = new BuildingMaterialManager();
		const unpainted = manager.getMaterial('wall', undefined);
		const painted = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		expect(unpainted).not.toBe(painted);
	});

	it('ceilings and floors ("slab-floor") share the same default look, distinct from a flat roof ("slab-roof")', () => {
		const manager = new BuildingMaterialManager();
		const floor = manager.getMaterial('slab-floor', undefined);
		const roof = manager.getMaterial('slab-roof', undefined);
		expect(floor).not.toBe(roof);
	});

	it('applies the requested colour to the returned material', () => {
		const manager = new BuildingMaterialManager();
		const material = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		expect(asStandard(material).color.getHexString().toUpperCase()).toBe('D9D1C3');
	});
});

describe('BuildingMaterialManager.dispose', () => {
	it('disposes every cached material and clears the cache (a subsequent lookup allocates fresh)', () => {
		const manager = new BuildingMaterialManager();
		const before = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		const disposeSpy = vi.spyOn(before, 'dispose');

		manager.dispose();

		expect(disposeSpy).toHaveBeenCalled();
		const after = manager.getMaterial('wall', { type: 'color', color: '#D9D1C3' });
		expect(after).not.toBe(before);
	});
});
