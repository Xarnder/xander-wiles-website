import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { generateMaterialMaps } from '../generateMaterialMaps';
import type { MaterialMapSource } from '../MaterialMapSource';
import { ProceduralMaterialLibrary } from '../ProceduralMaterialLibrary';
import type { ResolvedMaterialRecipe } from '../ProceduralMaterialTypes';

/** Inline source that counts generations, at low quality to keep tests fast. */
function countingSource(): MaterialMapSource & { calls: ResolvedMaterialRecipe[] } {
	const calls: ResolvedMaterialRecipe[] = [];
	return {
		calls,
		async generate(recipe) {
			calls.push(recipe);
			return generateMaterialMaps(recipe);
		},
		dispose() {}
	};
}

function library(source = countingSource()) {
	return { source, lib: new ProceduralMaterialLibrary({ source, quality: 'low' }) };
}

describe('ProceduralMaterialLibrary', () => {
	it('dresses a bound material once its maps are generated', async () => {
		const { lib } = library();
		const material = new THREE.MeshStandardMaterial({ color: 0x123456, roughness: 0.4 });
		lib.bindMaterial(material, { type: 'plaster', mapping: 'planar' });
		expect(material.map).toBeNull(); // flat until ready
		await lib.whenIdle();
		expect(material.map).toBeInstanceOf(THREE.DataTexture);
		expect(material.normalMap).toBeInstanceOf(THREE.DataTexture);
		expect(material.roughnessMap).toBe(material.aoMap);
		expect(material.vertexColors).toBe(true);
	});

	it('shares one texture set between materials with the same recipe, and generates it once', async () => {
		const { lib, source } = library();
		const a = new THREE.MeshStandardMaterial();
		const b = new THREE.MeshStandardMaterial();
		lib.bindMaterial(a, { type: 'slate', mapping: 'roof' });
		lib.bindMaterial(b, { type: 'slate', mapping: 'roof' });
		await lib.whenIdle();
		expect(a.map).toBe(b.map);
		expect(source.calls).toHaveLength(1);
		expect(lib.getStats().textureSets).toBe(1);
	});

	it('returns the same cached material for the same options', () => {
		const { lib } = library();
		expect(lib.getProceduralMaterial('timber', { variant: 'fresh' })).toBe(
			lib.getProceduralMaterial('timber', { variant: 'fresh' })
		);
		expect(lib.getProceduralMaterial('timber', { variant: 'fresh' })).not.toBe(
			lib.getProceduralMaterial('timber', { variant: 'dark-oak' })
		);
	});

	it('restores the exact flat look when disabled, and re-applies when enabled', async () => {
		const { lib } = library();
		const material = new THREE.MeshStandardMaterial({
			color: 0xcfc6b3,
			roughness: 0.88,
			metalness: 0.02
		});
		lib.bindMaterial(material, { type: 'plaster', mapping: 'planar' });
		await lib.whenIdle();
		lib.setEnabled(false);
		expect(material.map).toBeNull();
		expect(material.color.getHex()).toBe(0xcfc6b3);
		expect(material.roughness).toBeCloseTo(0.88);
		expect(material.metalness).toBeCloseTo(0.02);
		expect(material.vertexColors).toBe(false);
		lib.setEnabled(true);
		await lib.whenIdle();
		expect(material.map).not.toBeNull();
	});

	it('tints a painted surface so its average matches the paint colour', async () => {
		const { lib } = library();
		const material = new THREE.MeshStandardMaterial();
		lib.bindMaterial(material, { type: 'plaster', mapping: 'planar' }, { tint: '#3E6FA6' });
		await lib.whenIdle();
		const paint = new THREE.Color('#3E6FA6');
		const recipe = lib.resolveRecipe({ type: 'plaster' });
		const mean = generateMaterialMaps(recipe).meanLinear;
		expect(material.color.r * mean[0]).toBeCloseTo(paint.r, 4);
		expect(material.color.g * mean[1]).toBeCloseTo(paint.g, 4);
		expect(material.color.b * mean[2]).toBeCloseTo(paint.b, 4);
	});

	it('regenerates at the new resolution when quality changes, and bounds idle sets', async () => {
		const { lib } = library();
		const material = new THREE.MeshStandardMaterial();
		lib.bindMaterial(material, { type: 'glass', mapping: 'planar' });
		await lib.whenIdle();
		const low = material.map as THREE.DataTexture;
		lib.setQuality('medium');
		await lib.whenIdle();
		const medium = material.map as THREE.DataTexture;
		expect(medium).not.toBe(low);
		expect(medium.image.width).toBe(low.image.width * 2);
		expect(lib.getStats().idleTextureSets).toBe(1);
	});

	it('picks a bounded per-world variation and changes it with the world seed', () => {
		const { lib } = library();
		const seeds = new Set<number>();
		for (let i = 0; i < 40; i++) {
			lib.setWorldSeed(`world-${i}`);
			seeds.add(lib.resolveRecipe({ type: 'paving' }).seed);
		}
		expect(seeds.size).toBeGreaterThan(1);
		expect(seeds.size).toBeLessThanOrEqual(4);
	});

	it('disposes every texture and restores bound materials on dispose', async () => {
		const { lib } = library();
		const material = new THREE.MeshStandardMaterial({ color: 0x8a8578 });
		lib.bindMaterial(material, { type: 'masonry', mapping: 'planar' });
		await lib.whenIdle();
		const map = material.map as THREE.Texture;
		const disposed = vi.fn();
		map.addEventListener('dispose', disposed);
		lib.dispose();
		expect(disposed).toHaveBeenCalled();
		expect(material.map).toBeNull();
		expect(material.color.getHex()).toBe(0x8a8578);
		expect(lib.getStats().textureSets).toBe(0);
	});

	it('uses the mesh UV unit for native mapping (terrain world/8 UVs)', async () => {
		const { lib } = library();
		const material = new THREE.MeshStandardMaterial({ vertexColors: true });
		lib.bindMaterial(
			material,
			{ type: 'grass', mapping: 'native' },
			{ detail: true, uvUnitMeters: 8 }
		);
		await lib.whenIdle();
		const recipe = lib.resolveRecipe({ type: 'grass' });
		expect((material.map as THREE.Texture).repeat.x).toBeCloseTo(8 / recipe.tileWidth);
	});
});
