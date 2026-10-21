import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateMaterialMaps, mapResolutionFor } from '../generateMaterialMaps';
import { resolveMaterialRecipe } from '../materialPresets';
import { ProceduralMaterialLibrary } from '../ProceduralMaterialLibrary';
import { surfaceShaderKindFor } from '../shader/surfaceShaderPresets';
import { miniBuildSurfaceStyle } from '../../miniBuild/miniBuildTextures';
import { DEFAULT_MINI_BUILDS } from '../../miniBuild/defaultMiniBuilds';
import { furnitureSecondaryKind } from '../../building/furnitureSurfaceKinds';
import { BUILDING_SURFACE_STYLES } from '../buildingSurfaceStyles';

it('fabric uses bounded maps and the standard shader at every quality', () => {
	for (const [quality, size] of [
		['low', 64],
		['medium', 128],
		['high', 256]
	] as const) {
		const recipe = resolveMaterialRecipe('fabric', { quality });
		expect(mapResolutionFor(recipe)).toBe(size);
		expect(surfaceShaderKindFor(recipe)).toBeNull();
	}
	const recipe = resolveMaterialRecipe('fabric', { quality: 'low' });
	const a = generateMaterialMaps(recipe),
		b = generateMaterialMaps(recipe);
	expect(a.albedo).toEqual(b.albedo);
	expect(new Set(a.albedo.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(3);
});

describe('fabric furniture integration', () => {
	it('shares one generated texture set across different upholstery colours', async () => {
		let calls = 0;
		const library = new ProceduralMaterialLibrary({
			quality: 'low',
			source: {
				async generate(recipe) {
					calls++;
					return generateMaterialMaps(recipe);
				},
				dispose() {}
			}
		});
		const a = new THREE.MeshStandardMaterial(),
			b = new THREE.MeshStandardMaterial();
		library.bindMaterial(a, { type: 'fabric', mapping: 'native' }, { tint: '#7A9A6A' });
		library.bindMaterial(b, { type: 'fabric', mapping: 'native' }, { tint: '#F1E7D0' });
		await library.whenIdle();
		expect(calls).toBe(1);
		expect(a.map).toBe(b.map);
		expect(a.roughnessMap).toBe(b.roughnessMap);
		expect(a.map?.generateMipmaps).toBe(true);
		expect(library.getStats().gpuBytes).toBeLessThan(100_000);
		library.dispose();
		a.dispose();
		b.dispose();
	});
	it('uses cloth for existing Mini Build upholstery and catalogue cushions', () => {
		for (const id of ['default-bed', 'default-arm-chair']) {
			const item = DEFAULT_MINI_BUILDS.find((d) => d.id === id)!;
			const fabrics = item.materials.filter((m) => m.finish === 'fabric');
			expect(fabrics.length).toBeGreaterThan(0);
			for (const slot of fabrics) expect(miniBuildSurfaceStyle(slot)?.type).toBe('fabric');
		}
		for (const kind of ['bed', 'chair', 'stool'] as const)
			expect(BUILDING_SURFACE_STYLES[furnitureSecondaryKind(kind)]?.type).toBe('fabric');
		expect(BUILDING_SURFACE_STYLES[furnitureSecondaryKind('wardrobe')]?.type).toBe('timber');
	});
});
