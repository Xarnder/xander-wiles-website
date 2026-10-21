import { describe, expect, it } from 'vitest';
import { BuildingMaterialManager } from '../../building/BuildingMaterialManager';
import { compileMiniBuildData } from '../MiniBuildCompiler';
import { MiniBuildEditorState } from '../MiniBuildEditorState';
import { contentHash } from '../miniBuildGrid';
import { MiniBuildSystem } from '../MiniBuildSystem';
import {
	effectiveMiniBuildTexture,
	MINI_BUILD_TEXTURES,
	miniBuildSurfaceStyle,
	miniBuildTextureGroups
} from '../miniBuildTextures';
import { MINI_BUILD_TEXTURE_IDS } from '../MiniBuildTypes';
import { validateMiniBuildDefinition } from '../MiniBuildValidation';
import { testDefinition } from './miniBuildFixtures';

describe('Mini Build textures', () => {
	it('gives every finish a procedural default except metal and plain', () => {
		expect(miniBuildSurfaceStyle({ finish: 'wood' })).toMatchObject({
			type: 'timber',
			mapping: 'wood'
		});
		expect(miniBuildSurfaceStyle({ finish: 'stone' })?.type).toBe('masonry');
		expect(miniBuildSurfaceStyle({ finish: 'glass' })?.type).toBe('glass');
		expect(miniBuildSurfaceStyle({ finish: 'fabric' })?.type).toBe('fabric');
		expect(miniBuildSurfaceStyle({ finish: 'metal' })).toBeNull();
		expect(miniBuildSurfaceStyle({ finish: 'plain' })).toBeNull();
		expect(miniBuildSurfaceStyle({ finish: 'wood', texture: 'flat' })).toBeNull();
		expect(effectiveMiniBuildTexture({ finish: 'metal', texture: 'cobbles' })).toBe('cobbles');
	});

	it('catalogues every texture id, with textures mapped on their metre UVs and wood as solid wood', () => {
		const listed = miniBuildTextureGroups().flatMap((g) => g.ids);
		expect(new Set(listed)).toEqual(
			new Set(MINI_BUILD_TEXTURE_IDS.filter((id) => id !== 'auto' && id !== 'flat'))
		);
		for (const entry of Object.values(MINI_BUILD_TEXTURES)) {
			expect(entry.swatch).toMatch(/^#[0-9A-F]{6}$/);
			expect(['wood', 'native']).toContain(entry.style.mapping);
		}
	});

	it('saves the chosen texture, keeps old hashes for auto, and drops unknown ids', () => {
		const definition = testDefinition([[0, 0, 0, 8, 8, 8]]);
		const before = contentHash(definition);
		definition.materials[0].texture = 'auto';
		expect(contentHash(definition)).toBe(before);
		definition.materials[0].texture = 'cobbles';
		expect(contentHash(definition)).not.toBe(before);
		const valid = validateMiniBuildDefinition(definition);
		expect(valid.ok && valid.value.materials[0].texture).toBe('cobbles');
		(definition.materials[0] as { texture: string }).texture = 'chrome-from-the-future';
		const fallback = validateMiniBuildDefinition(definition);
		expect(fallback.ok).toBe(true);
		expect(fallback.ok && fallback.value.materials[0].texture).toBeUndefined();
	});

	it('picking a texture starts from its natural colour and a matching finish', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		expect(state.updateMaterialSlot(0, { texture: 'clear-glass' }).ok).toBe(true);
		expect(state.getMaterials()[0]).toMatchObject({
			finish: 'glass',
			texture: 'clear-glass',
			material: { color: MINI_BUILD_TEXTURES['clear-glass'].swatch }
		});
		state.updateMaterialSlot(0, { texture: 'pine' });
		expect(state.getMaterials()[0].finish).toBe('wood');
		// Recolouring keeps the texture; Auto keeps the colour.
		state.updateMaterialSlot(0, { color: '#AA3322' });
		expect(state.getMaterials()[0]).toMatchObject({
			texture: 'pine',
			material: { color: '#AA3322' }
		});
		state.updateMaterialSlot(0, { texture: 'auto' });
		expect(state.getMaterials()[0].texture).toBeUndefined();
		expect(state.getMaterials()[0].material.color).toBe('#AA3322');
	});

	it('compiles a solid-wood coordinate per vertex, grain along each block’s longest side', () => {
		const grainSpan = (box: [number, number, number, number, number, number]) => {
			const group = compileMiniBuildData(testDefinition([box])).groups[0];
			expect(group.woodCoords.length).toBe(group.positions.length);
			expect(group.woodCoords.every(Number.isFinite)).toBe(true);
			const z = Array.from(
				{ length: group.woodCoords.length / 3 },
				(_, v) => group.woodCoords[v * 3 + 2]
			);
			return Math.max(...z) - Math.min(...z);
		};
		expect(grainSpan([0, 0, 0, 16, 2, 4])).toBeCloseTo(1, 5); // 1m long on X
		expect(grainSpan([0, 0, 0, 2, 16, 2])).toBeCloseTo(1, 5); // 1m tall leg
		// Two blocks never share a log: same shape, different ids → different coordinates.
		const two = compileMiniBuildData(
			testDefinition([
				[0, 0, 0, 4, 4, 4],
				[8, 0, 0, 4, 4, 4]
			])
		).groups[0];
		const half = two.woodCoords.length / 2;
		expect(Array.from(two.woodCoords.slice(0, 3))).not.toEqual(
			Array.from(two.woodCoords.slice(half, half + 3))
		);
	});

	it('resolves slots to shared materials per (finish, colour, texture)', () => {
		const system = new MiniBuildSystem({ materialManager: new BuildingMaterialManager() });
		const slot = {
			finish: 'wood' as const,
			material: { type: 'color' as const, color: '#8B5A2B' }
		};
		const auto = system.resolveMaterial(slot);
		expect(system.resolveMaterial({ ...slot })).toBe(auto);
		expect(system.resolveMaterial({ ...slot, texture: 'pine' })).not.toBe(auto);
		expect(system.resolveMaterial({ ...slot, texture: 'flat' })).not.toBe(auto);
	});
});
