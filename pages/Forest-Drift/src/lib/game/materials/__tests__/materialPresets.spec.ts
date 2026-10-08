import { describe, expect, it } from 'vitest';
import { MATERIAL_PALETTES } from '../materialPalettes';
import { MATERIAL_PRESETS, recipeCacheKey, resolveMaterialRecipe } from '../materialPresets';
import { PROCEDURAL_MATERIAL_TYPES, PROCEDURAL_VARIANTS } from '../ProceduralMaterialTypes';

describe('material presets and recipes', () => {
	it('resolves every type with valid, in-range defaults', () => {
		for (const type of PROCEDURAL_MATERIAL_TYPES) {
			const recipe = resolveMaterialRecipe(type);
			const preset = MATERIAL_PRESETS[type];
			expect(recipe.variant).toBe(preset.variant);
			expect((PROCEDURAL_VARIANTS[type] as readonly string[]).includes(recipe.variant)).toBe(true);
			for (const value of [
				recipe.roughness,
				recipe.weathering,
				recipe.dirt,
				recipe.moss,
				recipe.variation
			]) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
			}
			expect(recipe.tileWidth).toBeGreaterThan(0);
			expect(recipe.tileHeight).toBeGreaterThan(0);
			expect(Object.keys(recipe.colors).length).toBeGreaterThan(0);
		}
	});

	it('falls back to presets for invalid input rather than throwing', () => {
		const recipe = resolveMaterialRecipe('plaster', {
			weathering: Number.NaN,
			roughness: 7,
			scale: -2,
			variant: 'nonsense' as never
		});
		expect(recipe.weathering).toBe(MATERIAL_PRESETS.plaster.weathering);
		expect(recipe.roughness).toBe(1);
		expect(recipe.tileWidth).toBe(MATERIAL_PRESETS.plaster.tileWidth);
		expect(recipe.variant).toBe('lime');
	});

	it('expresses scale as a real-world tile size', () => {
		const base = resolveMaterialRecipe('slate');
		const doubled = resolveMaterialRecipe('slate', { scale: 2 });
		expect(doubled.tileWidth).toBeCloseTo(base.tileWidth * 2);
		expect(doubled.tileHeight).toBeCloseTo(base.tileHeight * 2);
	});

	it('produces stable cache keys that change only with generated output', () => {
		const a = resolveMaterialRecipe('timber', { seed: 'x', weathering: 0.5 });
		const b = resolveMaterialRecipe('timber', { weathering: 0.5, seed: 'x' });
		expect(recipeCacheKey(a)).toBe(recipeCacheKey(b));
		expect(
			recipeCacheKey(resolveMaterialRecipe('timber', { seed: 'y', weathering: 0.5 }))
		).not.toBe(recipeCacheKey(a));
		expect(
			recipeCacheKey(
				resolveMaterialRecipe('timber', { seed: 'x', weathering: 0.5, quality: 'high' })
			)
		).not.toBe(recipeCacheKey(a));
		expect(
			recipeCacheKey(
				resolveMaterialRecipe('timber', { seed: 'x', weathering: 0.5, palette: 'medieval-village' })
			)
		).not.toBe(recipeCacheKey(a));
	});

	it('derives every palette with the full set of colour names', () => {
		const alpine = MATERIAL_PALETTES.alpine;
		for (const palette of Object.values(MATERIAL_PALETTES)) {
			for (const type of PROCEDURAL_MATERIAL_TYPES) {
				expect(Object.keys(palette.colors[type]).sort()).toEqual(
					Object.keys(alpine.colors[type]).sort()
				);
			}
		}
	});
});
