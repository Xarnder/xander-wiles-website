import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EarthFoundationField } from '../EarthFoundationField';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';

const pad: FoundationDefinition = {
	id: 'earth',
	style: 'earth',
	blendWidth: 8,
	minGridX: 0,
	maxGridX: 4,
	minGridZ: 0,
	maxGridZ: 4,
	topY: 6,
	bottomY: -1
};
describe('grass-covered earth foundations', () => {
	it('flattens the footprint and smoothly raises the surrounding ground, with unchanged distant terrain', () => {
		const field = new EarthFoundationField();
		field.rebuild([pad], 1);
		for (const [x, z] of [
			[0, 0],
			[4, 4],
			[1.3, 2.4]
		])
			expect(field.sample(x, z, 0)).toBe(6);
		expect(field.sample(8, 2, 0)).toBe(3);
		expect(field.sample(12, 2, 0)).toBe(0);
		expect(field.sample(100, 100, 2)).toBe(2);
		expect(field.sample(8, 2, 9)).toBe(9); // banks only raise land
		expect(field.sample(4.001, 2, 0)).toBeCloseTo(6, 5);
		expect(field.sample(11.999, 2, 0)).toBeCloseTo(0, 5);
	});
	it('is order independent and leaves neighbouring pad tops flat', () => {
		const other = { ...pad, id: 'other', minGridX: 6, maxGridX: 10, topY: 9 };
		const a = new EarthFoundationField(),
			b = new EarthFoundationField();
		a.rebuild([pad, other], 1);
		b.rebuild([other, pad], 1);
		for (let x = -10; x < 20; x += 0.25) expect(a.sample(x, 2, 0)).toBe(b.sample(x, 2, 0));
		expect(a.sample(3, 2, 0)).toBe(6);
		expect(a.sample(4.00001, 2, 0)).toBeCloseTo(6, 7);
		expect(a.sample(7, 2, 0)).toBe(9);
	});
	it('keeps building collision and raycast targets without rendering a stone box; removal restores terrain', () => {
		const manager = new FoundationManager(() => 1);
		const sampler = new TerrainHeightSampler(createDefaultTerrainSettings());
		const before = sampler.sample(2, 2);
		sampler.setHeightModifier(manager.sampleEarthHeight);
		let changes = 0;
		manager.setTerrainEditHandler(() => changes++);
		manager.addFoundation(pad);
		expect(sampler.sample(2, 2)).toBe(6);
		expect(manager.getTopYAt(2, 2)).toBe(6);
		const mesh = manager.getMeshForFoundation('earth')!;
		expect((mesh.material as THREE.Material).visible).toBe(false);
		mesh.updateMatrixWorld(true);
		const ray = new THREE.Raycaster(new THREE.Vector3(2, 20, 2), new THREE.Vector3(0, -1, 0));
		expect(ray.intersectObjects(manager.getMeshes()).length).toBeGreaterThan(0);
		expect(manager.getFootprints()).toHaveLength(1);
		const saved = JSON.parse(JSON.stringify(manager.serialize()));
		manager.removeFoundation('earth');
		expect(sampler.sample(2, 2)).toBe(before);
		manager.load(saved);
		expect(sampler.sample(2, 2)).toBe(6);
		expect(changes).toBe(3);
		manager.dispose();
	});
	it('preserves old stone foundations without changing terrain', () => {
		const manager = new FoundationManager(() => 1);
		manager.addFoundation({ ...pad, style: undefined });
		expect(manager.sampleEarthHeight(2, 2, 1)).toBe(1);
		expect(manager.getTopYAt(2, 2)).toBe(6);
		manager.dispose();
	});
});
