import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateMaterialMaps, mapResolutionFor } from '../generateMaterialMaps';
import { resolveMaterialRecipe } from '../materialPresets';
import { ProceduralMaterialLibrary } from '../ProceduralMaterialLibrary';
import { surfaceShaderKindFor } from '../shader/surfaceShaderPresets';
import type { MaterialMapData } from '../ProceduralMaterialTypes';

function meanBlue(data: MaterialMapData): number {
	let sum = 0;
	for (let i = 2; i < data.orm.length; i += 4) sum += data.orm[i];
	return sum / (data.orm.length / 4) / 255;
}

describe('procedural metal', () => {
	it('is the only material that writes metalness, with patina less metallic than bare metal', () => {
		const iron = generateMaterialMaps(resolveMaterialRecipe('metal', { quality: 'low' }));
		expect(meanBlue(iron)).toBeGreaterThan(0.4);
		let min = 255;
		let max = 0;
		for (let i = 2; i < iron.orm.length; i += 4) {
			min = Math.min(min, iron.orm[i]);
			max = Math.max(max, iron.orm[i]);
		}
		expect(max - min).toBeGreaterThan(80);
		for (const type of ['timber', 'fabric', 'masonry', 'glass'] as const) {
			expect(meanBlue(generateMaterialMaps(resolveMaterialRecipe(type, { quality: 'low' })))).toBe(
				0
			);
		}
	});

	it('has iron and brass variants with bounded maps and plain texture sampling', () => {
		const iron = resolveMaterialRecipe('metal', { quality: 'high' });
		const brass = resolveMaterialRecipe('metal', { quality: 'high', variant: 'brass' });
		expect(mapResolutionFor(iron)).toBe(256);
		expect(surfaceShaderKindFor(brass)).toBeNull();
		const ironMaps = generateMaterialMaps({ ...iron, quality: 'low' });
		const brassMaps = generateMaterialMaps({ ...brass, quality: 'low' });
		// Brass is warm and bright; iron is dark.
		expect(brassMaps.meanLinear[0]).toBeGreaterThan(brassMaps.meanLinear[2] * 2);
		expect(brassMaps.meanLinear[1]).toBeGreaterThan(ironMaps.meanLinear[1] * 2);
	});

	it('binds a metalness map on metal and clears it when the material becomes another surface', async () => {
		const library = new ProceduralMaterialLibrary({
			quality: 'low',
			source: {
				async generate(recipe) {
					return generateMaterialMaps(recipe);
				},
				dispose() {}
			}
		});
		const material = new THREE.MeshStandardMaterial({ metalness: 0.65 });
		library.bindMaterial(material, { type: 'metal', mapping: 'native' }, { tint: '#45423F' });
		await library.whenIdle();
		expect(material.metalnessMap).toBe(material.roughnessMap);
		expect(material.metalness).toBe(1);

		library.bindMaterial(material, { type: 'fabric', mapping: 'native' }, { tint: '#45423F' });
		await library.whenIdle();
		expect(material.metalnessMap).toBeNull();
		expect(material.metalness).toBe(0);

		library.setEnabled(false);
		expect(material.metalnessMap).toBeNull();
		expect(material.metalness).toBe(0.65);
		library.dispose();
		material.dispose();
	});
});
